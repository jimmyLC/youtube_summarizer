import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import OpenAI from "openai";
import { getUserApiKey } from "./userConfig";
import type { TranscriptSegment } from "./transcript";

const execFileAsync = promisify(execFile);

const GROQ_URL = "https://api.groq.com/openai/v1";
const WHISPER_MODEL = "whisper-large-v3-turbo";
const CHUNK_SECONDS = 600; // 10 min chunks at 32kbps mono keep each file ~2.4MB (Groq limit: 25MB)
const TRADITIONAL_CHINESE_PROMPT = "以下是繁體中文的逐字稿。";

/**
 * Global limit on simultaneous audio downloads/transcriptions, so a public
 * deployment does not hammer YouTube from one IP or exhaust the machine.
 */
const MAX_CONCURRENT_JOBS = Number(process.env.MAX_CONCURRENT_TRANSCRIPTIONS || 2);
let activeJobs = 0;
const waiters: Array<() => void> = [];

async function acquireSlot(): Promise<void> {
  if (activeJobs < MAX_CONCURRENT_JOBS) {
    activeJobs++;
    return;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
}

function releaseSlot(): void {
  const next = waiters.shift();
  if (next) {
    next(); // hand the slot straight to the next waiter
  } else {
    activeJobs--;
  }
}

/**
 * Per-user client cache
 */
const groqClients: Map<string, OpenAI> = new Map();

export async function getGroqClient(userId: string): Promise<OpenAI | null> {
  const cached = groqClients.get(userId);
  if (cached) return cached;

  const apiKey = await getUserApiKey(userId, "groq");
  if (!apiKey) return null;

  const client = new OpenAI({ apiKey, baseURL: GROQ_URL });
  groqClients.set(userId, client);
  return client;
}

export function clearGroqClient(userId: string): void {
  groqClients.delete(userId);
}

export async function isGroqConfigured(userId: string): Promise<boolean> {
  const apiKey = await getUserApiKey(userId, "groq");
  return apiKey !== null && apiKey.length > 0;
}

/**
 * Child processes need Homebrew's bin dir on PATH when the dev server was
 * started from a GUI app that does not load the login shell profile.
 */
function childEnv(): NodeJS.ProcessEnv {
  const extra = ["/opt/homebrew/bin", "/usr/local/bin"];
  const current = process.env.PATH || "";
  return { ...process.env, PATH: [...extra, current].join(path.delimiter) };
}

async function run(cmd: string, args: string[]): Promise<void> {
  await execFileAsync(cmd, args, { env: childEnv(), maxBuffer: 20 * 1024 * 1024 });
}

interface WhisperSegment {
  start: number;
  end: number;
  text: string;
}

async function transcribeChunk(
  client: OpenAI,
  file: string,
  options: { language?: string; prompt?: string }
): Promise<{ language: string; segments: WhisperSegment[] }> {
  for (let attempt = 0; ; attempt++) {
    try {
      const params = {
        file: fs.createReadStream(file),
        model: WHISPER_MODEL,
        response_format: "verbose_json",
        timestamp_granularities: ["segment"],
        ...(options.language ? { language: options.language } : {}),
        ...(options.prompt ? { prompt: options.prompt } : {}),
      };
      const result = (await client.audio.transcriptions.create(
        params as unknown as OpenAI.Audio.TranscriptionCreateParamsNonStreaming
      )) as unknown as {
        language?: string;
        segments?: WhisperSegment[];
      };
      return { language: result.language || "unknown", segments: result.segments || [] };
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 429 && attempt < 3) {
        await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }
}

/**
 * Downloads the audio of a YouTube video (yt-dlp), splits it into small mono
 * chunks (ffmpeg) and transcribes them with Groq's hosted Whisper.
 * Returns timestamped segments compatible with the Supadata result format.
 */
export async function transcribeWithGroq(
  videoUrl: string,
  userId: string
): Promise<{ segments: TranscriptSegment[]; lang: string } | null> {
  const client = await getGroqClient(userId);
  if (!client) return null;

  await acquireSlot();
  try {
    return await transcribeWithClient(client, videoUrl);
  } finally {
    releaseSlot();
  }
}

async function transcribeWithClient(
  client: OpenAI,
  videoUrl: string
): Promise<{ segments: TranscriptSegment[]; lang: string }> {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "ytsum-"));
  try {
    const source = path.join(dir, "source.%(ext)s");
    await run("yt-dlp", ["-f", "bestaudio", "--no-playlist", "-o", source, videoUrl]);
    const downloaded = (await fs.promises.readdir(dir)).find((f) => f.startsWith("source."));
    if (!downloaded) throw new Error("Audio download failed");

    await run("ffmpeg", [
      "-y", "-i", path.join(dir, downloaded),
      "-ac", "1", "-ar", "16000", "-b:a", "32k",
      "-f", "segment", "-segment_time", String(CHUNK_SECONDS), "-reset_timestamps", "1",
      path.join(dir, "chunk%03d.mp3"),
    ]);
    const chunks = (await fs.promises.readdir(dir)).filter((f) => f.startsWith("chunk")).sort();
    if (chunks.length === 0) throw new Error("Audio split failed");

    // Detect language on the first chunk; bias Chinese output to Traditional characters.
    let first = await transcribeChunk(client, path.join(dir, chunks[0]), {});
    const isChinese = first.language.toLowerCase().startsWith("chinese") || first.language === "zh";
    const options = isChinese ? { language: "zh", prompt: TRADITIONAL_CHINESE_PROMPT } : { language: undefined, prompt: undefined };
    if (isChinese) first = await transcribeChunk(client, path.join(dir, chunks[0]), options);
    const lang = isChinese ? "zh" : first.language;

    const segments: TranscriptSegment[] = [];
    const push = (res: { segments: WhisperSegment[] }, index: number) => {
      for (const s of res.segments) {
        const text = s.text.trim();
        if (!text) continue;
        segments.push({
          text,
          offset: Math.round((index * CHUNK_SECONDS + s.start) * 1000),
          duration: Math.round((s.end - s.start) * 1000),
          lang,
        });
      }
    };
    push(first, 0);
    for (let i = 1; i < chunks.length; i++) {
      push(await transcribeChunk(client, path.join(dir, chunks[i]), options), i);
    }
    return { segments, lang };
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
}
