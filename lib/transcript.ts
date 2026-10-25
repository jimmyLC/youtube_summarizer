import fs from "fs"
import os from "os"
import path from "path"
import { execFile } from "child_process"
import { promisify } from "util"
import OpenAI from "openai"
import * as OpenCC from "opencc-js"
import { ProxyAgent, fetch as undiciFetch } from "undici"
import { fetchTranscript as fetchCaptions } from "youtube-transcript-plus"
import { watchUrl } from "./youtube"
import { MAX_SECONDS } from "./upload-limits"

/** [start in seconds, text] */
export type Line = [number, string]

export interface Transcript {
  lines: Line[]
  lang: string
  source: "captions" | "groq" | "openai"
}

export class TranscriptError extends Error {}
export class TooLongError extends TranscriptError {}
/** A members-only video and no stored YouTube login to open it with. */
export class MembersOnlyError extends TranscriptError {}
/** The stored login did not open the video: expired, or the account is not a member of that channel. */
export class CookiesExpiredError extends TranscriptError {}

const execFileAsync = promisify(execFile)
const toTraditional = OpenCC.Converter({ from: "cn", to: "twp" })

// Lets tests swap in a stand-in for yt-dlp
const YT_DLP = process.env.YT_DLP_BIN || "yt-dlp"

const CHUNK_SECONDS = 600 // 10 min at 32 kbps mono is ~2.4 MB (Groq and OpenAI limit 25 MB)
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT_TRANSCRIPTIONS || 2)

/**
 * YOUTUBE_PROXY (e.g. http://<relay-ip>:8888) sends every request to YouTube through a
 * home-network relay. Needed on a VPS, because YouTube blocks datacenter IPs. Unset = direct.
 */
const YOUTUBE_PROXY = process.env.YOUTUBE_PROXY || undefined

/**
 * YouTube captions first (free, fast); videos without captions are
 * downloaded with yt-dlp and transcribed by Groq Whisper (OpenAI as backup).
 * Chinese output is always converted to Taiwan Traditional characters.
 */
export async function getTranscript(
  youtubeId: string,
  opts: { memberCookies?: string | null; keepAudioAs?: string; hint?: Hint } = {}
): Promise<Transcript> {
  return finish((await fromCaptions(youtubeId)) ?? (await fromAudio(youtubeId, opts.memberCookies ?? null, opts.keepAudioAs, opts.hint)))
}

/** Title and channel: names in them are spelled right, which steers Whisper's guesses at names. */
export type Hint = { title?: string; channel?: string }

function whisperPrompt(hint?: Hint): string {
  const parts = ["以下是繁體中文的逐字稿。"]
  if (hint?.title) parts.push(`影片標題：${hint.title.slice(0, 120)}。`)
  if (hint?.channel) parts.push(`頻道：${hint.channel.slice(0, 40)}。`)
  return parts.join("")
}

/**
 * The listening copy of a YouTube video that had captions (nothing was downloaded for the
 * transcript): 32 kbps mono mp3 at `dest`, written to a .part file first so a half-written
 * file never looks like a finished one.
 */
export async function saveYoutubeAudio(youtubeId: string, memberCookies: string | null, dest: string): Promise<void> {
  await acquire()
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "ytsum-"))
  try {
    const source = await downloadAudio(youtubeId, memberCookies, dir)
    await fs.promises.mkdir(path.dirname(dest), { recursive: true })
    const part = `${dest}.part`
    await run("ffmpeg", ["-y", "-i", source, "-ac", "1", "-ar", "16000", "-b:a", "32k", "-f", "mp3", part])
    await fs.promises.rename(part, dest)
  } finally {
    release()
    await fs.promises.rm(dir, { recursive: true, force: true })
  }
}

/** An uploaded recording (the browser already reduced it to mono mp3): speech-to-text only. */
export async function getTranscriptFromFile(file: string, hint?: Hint): Promise<Transcript> {
  const list = providers()
  const seconds = await probeSeconds(file)
  if (seconds > MAX_SECONDS + 60) throw new TooLongError(`Audio is ${Math.round(seconds)} s long`)
  await acquire()
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "ytsum-"))
  try {
    return finish(await splitAndTranscribe(list, file, dir, path.basename(file), undefined, hint))
  } finally {
    release()
    await fs.promises.rm(dir, { recursive: true, force: true })
  }
}

function finish(result: Transcript): Transcript {
  if (!result.lang.toLowerCase().startsWith("zh")) return result
  return { ...result, lines: result.lines.map(([t, text]) => [t, fullWidthPunctuation(toTraditional(text))]) }
}

/** Length from ffmpeg's banner (the VPS only has ffmpeg, no ffprobe). Reading without an output exits non-zero. */
async function probeSeconds(file: string): Promise<number> {
  const banner = await run("ffmpeg", ["-hide_banner", "-i", file]).catch((e: { stderr?: string }) => e.stderr ?? "")
  const m = banner.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/)
  if (!m) throw new TranscriptError("Could not read the audio length")
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
}

/** Whisper writes "嗨,大家好" with ASCII punctuation; keep "1,000" and "3.5" intact. */
const fullWidthPunctuation = (s: string) =>
  s.replace(/(?<!\d),|,(?!\d)/g, "，").replace(/\?/g, "？").replace(/!/g, "！").replace(/:(?!\d)/g, "：")

async function fromCaptions(id: string): Promise<Transcript | null> {
  try {
    const items = await fetchCaptions(watchUrl(id), proxiedFetchers())
    if (items.length === 0) return null
    return {
      lines: items.map((c) => [round1(c.offset), decode(c.text)]),
      lang: items[0].lang || "unknown",
      source: "captions",
    }
  } catch (e) {
    console.warn(`[transcript] no captions for ${id}:`, (e as Error).message)
    return null
  }
}

type Hook = { url: string; lang?: string; userAgent?: string; method?: string; body?: string; headers?: Record<string, string> }

/** The library's three request hooks, re-sent through the proxy with the same headers it would use. */
function proxiedFetchers() {
  if (!YOUTUBE_PROXY) return {}
  const dispatcher = new ProxyAgent(YOUTUBE_PROXY)
  const send = ({ url, lang, userAgent, method, body, headers }: Hook) =>
    undiciFetch(url, {
      method,
      body,
      headers: { ...(lang && { "Accept-Language": lang }), ...(userAgent && { "User-Agent": userAgent }), ...headers },
      dispatcher,
    }) as unknown as Promise<Response>
  return { videoFetch: send, playerFetch: send, transcriptFetch: send }
}

const round1 = (n: number) => Math.round(n * 10) / 10
const decode = (s: string) =>
  s.replace(/&amp;#39;|&#39;/g, "'").replace(/&amp;quot;|&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim()

// ---------- Speech-to-text: Groq Whisper, OpenAI as backup ----------

type Provider = { name: "groq" | "openai"; client: OpenAI; model: string }

/** Groq first (fast, cheap); OpenAI takes over when Groq fails or has no key. */
function providers(): Provider[] {
  const list: Provider[] = []
  if (process.env.GROQ_API_KEY) {
    list.push({
      name: "groq",
      client: new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1" }),
      model: "whisper-large-v3-turbo",
    })
  }
  if (process.env.OPENAI_API_KEY) {
    // whisper-1 is OpenAI's model that returns segment timestamps
    list.push({ name: "openai", client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }), model: "whisper-1" })
  }
  if (list.length === 0) throw new TranscriptError("Neither GROQ_API_KEY nor OPENAI_API_KEY is set")
  return list
}

// Global limit on simultaneous audio downloads, so one IP does not hammer YouTube
let active = 0
const waiting: Array<() => void> = []
async function acquire() {
  if (active < MAX_CONCURRENT) active++
  else await new Promise<void>((resolve) => waiting.push(resolve))
}
function release() {
  const next = waiting.shift()
  if (next) next()
  else active--
}

const failureText = (e: unknown) => `${(e as { stderr?: string }).stderr ?? ""}\n${(e as Error).message ?? ""}`
const isMembersOnly = (e: unknown) =>
  /members-only|members only|available to this channel's members|Join this channel/i.test(failureText(e))
const isSignInWall = (e: unknown) => /Sign in to confirm|cookies are no longer valid|Please sign in/i.test(failureText(e))

/**
 * Downloads the best audio of a video into `dir` and returns the file.
 * `memberCookies` is only used when the plain download fails because the video is members-only
 * (so ordinary videos never touch the login); yt-dlp gets a throwaway copy, because it rewrites
 * the cookie file it is given.
 */
async function downloadAudio(id: string, memberCookies: string | null, dir: string): Promise<string> {
  const download = (extra: string[]) =>
    run(YT_DLP, [
      "-f", "bestaudio", "--no-playlist",
      "--js-runtimes", `node:${process.execPath}`, // YouTube needs a JS runtime to unlock the audio formats
      ...(YOUTUBE_PROXY ? ["--proxy", YOUTUBE_PROXY] : []),
      ...extra,
      "-o", path.join(dir, "source.%(ext)s"), watchUrl(id),
    ])
  try {
    await download([])
  } catch (e) {
    if (!isMembersOnly(e)) throw e
    if (!memberCookies) throw new MembersOnlyError(`${id} is members-only`)
    const copy = path.join(dir, "cookies.txt")
    await fs.promises.copyFile(memberCookies, copy)
    try {
      await download(["--cookies", copy])
    } catch (e2) {
      if (isMembersOnly(e2) || isSignInWall(e2)) throw new CookiesExpiredError(`${id}: the stored login was refused`)
      throw e2
    } finally {
      await fs.promises.rm(copy, { force: true })
    }
  }
  const source = (await fs.promises.readdir(dir)).find((f) => f.startsWith("source."))
  if (!source) throw new TranscriptError("Audio download failed")
  return path.join(dir, source)
}

async function fromAudio(id: string, memberCookies: string | null, keepAs?: string, hint?: Hint): Promise<Transcript> {
  const list = providers()
  await acquire()
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "ytsum-"))
  try {
    const source = await downloadAudio(id, memberCookies, dir)
    return await splitAndTranscribe(list, source, dir, id, keepAs, hint)
  } finally {
    release()
    await fs.promises.rm(dir, { recursive: true, force: true })
  }
}

/** Cuts the audio into chunks (the speech APIs take 25 MB at most) and transcribes them. */
async function splitAndTranscribe(list: Provider[], input: string, dir: string, label: string, keepAs?: string, hint?: Hint): Promise<Transcript> {
  await run("ffmpeg", [
    "-y", "-i", input,
    "-ac", "1", "-ar", "16000", "-b:a", "32k",
    "-f", "segment", "-segment_time", String(CHUNK_SECONDS), "-reset_timestamps", "1",
    path.join(dir, "chunk%03d.mp3"),
  ])
  const chunks = (await fs.promises.readdir(dir)).filter((f) => f.startsWith("chunk")).sort()
  if (chunks.length === 0) throw new TranscriptError("Audio split failed")

  // The audio is prepared once; each provider gets the same chunks
  let lastError: unknown
  for (const provider of list) {
    try {
      const transcript = await transcribeAll(provider, chunks.map((c) => path.join(dir, c)), hint)
      // The listening copy is a bonus: failing to keep it must not throw the transcript away
      if (keepAs) await joinChunks(chunks.map((c) => path.join(dir, c)), dir, keepAs).catch((e) => console.warn(`[transcript] keeping audio of ${label} failed:`, e.message))
      return transcript
    } catch (e) {
      console.warn(`[transcript] ${provider.name} failed for ${label}:`, (e as Error).message)
      lastError = e
    }
  }
  throw lastError
}

/** Glues the chunks back into one mp3 (no re-encoding) so the recording can be played later. */
async function joinChunks(chunks: string[], dir: string, dest: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(dest), { recursive: true })
  const part = `${dest}.part`
  const list = path.join(dir, "chunks.txt")
  await fs.promises.writeFile(list, chunks.map((c) => `file '${c.replace(/'/g, "'\\''")}'`).join("\n"))
  await run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-f", "mp3", part])
  await fs.promises.rename(part, dest)
}

async function transcribeAll(provider: Provider, files: string[], hint?: Hint): Promise<Transcript> {
  // Detect the language on chunk 1; for Chinese, re-run with a Traditional-Chinese hint
  let first = await transcribe(provider, files[0], {})
  const chinese = /^(zh|chinese)/i.test(first.language)
  const options = chinese ? { language: "zh", prompt: whisperPrompt(hint) } : {}
  if (chinese) first = await transcribe(provider, files[0], options)

  const lines: Line[] = []
  const add = (segments: WhisperSegment[], chunk: number) => {
    for (const s of segments) {
      const text = s.text.trim()
      if (text) lines.push([round1(chunk * CHUNK_SECONDS + s.start), text])
    }
  }
  add(first.segments, 0)
  for (let i = 1; i < files.length; i++) {
    add((await transcribe(provider, files[i], options)).segments, i)
  }
  return { lines, lang: chinese ? "zh" : first.language, source: provider.name }
}

interface WhisperSegment {
  start: number
  text: string
}

async function transcribe(
  { client, model }: Provider,
  file: string,
  options: { language?: string; prompt?: string }
): Promise<{ language: string; segments: WhisperSegment[] }> {
  for (let attempt = 0; ; attempt++) {
    try {
      const result = (await client.audio.transcriptions.create({
        file: fs.createReadStream(file),
        model,
        response_format: "verbose_json",
        timestamp_granularities: ["segment"],
        ...options,
      })) as unknown as { language?: string; segments?: WhisperSegment[] }
      return { language: result.language ?? "unknown", segments: result.segments ?? [] }
    } catch (e) {
      if ((e as { status?: number }).status === 429 && attempt < 3) {
        await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)))
        continue
      }
      throw e
    }
  }
}

/** Child processes need Homebrew's bin dir when the server was started from a GUI app. */
async function run(cmd: string, args: string[]): Promise<string> {
  const PATH = ["/opt/homebrew/bin", "/usr/local/bin", process.env.PATH ?? ""].join(path.delimiter)
  const { stdout } = await execFileAsync(cmd, args, { env: { ...process.env, PATH }, maxBuffer: 20 * 1024 * 1024 })
  return stdout
}
