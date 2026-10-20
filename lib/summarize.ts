import OpenAI from "openai"
import type { Line } from "./transcript"
import { formatTime } from "./youtube"
import type { Lang } from "./i18n"

export interface Summary {
  tldr: string
  points: { time: number; title: string; detail: string }[]
}

const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat"
const MAX_INPUT_CHARS = 120_000 // well inside DeepSeek's context window

let client: OpenAI | null = null
function deepseek(): OpenAI {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not set")
  client ??= new OpenAI({ apiKey, baseURL: "https://api.deepseek.com" })
  return client
}

const LANGUAGE: Record<Lang, string> = {
  "zh-TW": "Traditional Chinese as used in Taiwan (台灣繁體中文, never Simplified characters)",
  en: "English",
}

/**
 * One call returns the summary and the tags. Existing tags are offered first
 * so the library does not fill up with near-duplicates.
 */
export async function summarize(input: {
  title: string
  channel: string
  lines: Line[]
  lang: Lang
  existingTags: string[]
}): Promise<{ summary: Summary; tags: string[] }> {
  const language = LANGUAGE[input.lang]
  const system = `You summarize YouTube videos for a busy reader. Reply with JSON only, in this shape:
{"tldr": string, "points": [{"time": number, "title": string, "detail": string}], "tags": string[]}

- Write every text field in ${language}, whatever the video's language.
- tldr: 1-2 sentences with the core message.
- points: 4-10 key points in video order. time = start second of that part, taken from the [m:ss] marks. title: a short phrase. detail: 1-3 sentences with the concrete facts, numbers, examples or advice. No filler.
- tags: 1-3 topic tags (2-8 characters each). Reuse an existing tag whenever one fits; only invent a new one when none fits. Existing tags: ${input.existingTags.length ? input.existingTags.join(", ") : "(none yet)"}`

  const user = `Title: ${input.title}\nChannel: ${input.channel}\n\nTranscript:\n${transcriptForPrompt(input.lines)}`

  const res = await deepseek().chat.completions.create({
    model: MODEL,
    response_format: { type: "json_object" },
    temperature: 0.3,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  })

  const data = JSON.parse(res.choices[0]?.message?.content ?? "{}") as Partial<Summary & { tags: string[] }>
  const points = (data.points ?? [])
    .filter((p) => p && typeof p.title === "string")
    .map((p) => ({ time: Math.max(0, Number(p.time) || 0), title: p.title, detail: p.detail ?? "" }))
  if (!data.tldr && points.length === 0) throw new Error("Empty summary from model")

  const tags = [...new Set((data.tags ?? []).map((t) => String(t).trim().replace(/^#/, "")).filter(Boolean))].slice(0, 3)
  return { summary: { tldr: data.tldr ?? "", points }, tags }
}

/** Groups lines into ~30 s blocks with a [m:ss] mark, trimmed to the input budget. */
function transcriptForPrompt(lines: Line[]): string {
  const blocks: string[] = []
  let start = -1
  let buf: string[] = []
  const flush = () => {
    if (buf.length) blocks.push(`[${formatTime(start)}] ${buf.join(" ")}`)
    buf = []
  }
  for (const [t, text] of lines) {
    if (start < 0 || t - start >= 30) {
      flush()
      start = t
    }
    buf.push(text)
  }
  flush()

  let out = blocks.join("\n")
  if (out.length > MAX_INPUT_CHARS) {
    // Keep the whole timeline by thinning evenly rather than cutting the end
    const keep = MAX_INPUT_CHARS / out.length
    out = blocks.map((b) => b.slice(0, Math.max(40, Math.floor(b.length * keep)))).join("\n")
  }
  return out
}
