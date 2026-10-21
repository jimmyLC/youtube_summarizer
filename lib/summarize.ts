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
 * One call returns the summary and the tags. The model never sees the existing tags: when it
 * was told to "reuse a fitting tag" it stretched old tags over videos about something else
 * (reproduced several times). Tags are chosen from the content alone, then spelled like an
 * existing tag only when they are the same word.
 */
export async function summarize(input: {
  title: string
  channel: string
  lines: Line[]
  lang: Lang
  existingTags: string[]
}): Promise<{ summary: Summary; tags: string[]; title: string }> {
  const language = LANGUAGE[input.lang]
  const system = `You summarize a video or audio recording for a busy reader. Reply with JSON only, in this shape:
{"title": string, "tldr": string, "points": [{"time": number, "title": string, "detail": string}], "tags": string[]}

- Write every text field in ${language}, whatever the video's language.
- title: a short descriptive title for the whole recording (at most 30 characters, no quotes).
- tldr: 1-2 sentences with the core message.
- points: 4-10 key points in video order. time = start second of that part, taken from the [m:ss] marks. title: a short phrase. detail: 1-3 sentences with the concrete facts, numbers, examples or advice. No filler.
- tags: 1-3 tags for the main subject of the whole recording, 2-8 characters each. Never tag something that is only mentioned in passing.`

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

  const data = JSON.parse(res.choices[0]?.message?.content ?? "{}") as Partial<Summary & { tags: string[]; title: string }>
  const points = (data.points ?? [])
    .filter((p) => p && typeof p.title === "string")
    .map((p) => ({ time: Math.max(0, Number(p.time) || 0), title: p.title, detail: p.detail ?? "" }))
  if (!data.tldr && points.length === 0) throw new Error("Empty summary from model")

  const tags = reuseExisting(
    (data.tags ?? []).map((t) => String(t).trim().replace(/^#/, "")).filter(Boolean),
    input.existingTags
  )
  return { summary: { tldr: data.tldr ?? "", points }, tags, title: String(data.title ?? "").trim().slice(0, 80) }
}

const sameTag = (s: string) => s.toLowerCase().replace(/[\s#]/g, "").replace(/臺/g, "台")

/** A new tag takes the spelling of an existing tag that is the same word; nothing fuzzier than that. */
function reuseExisting(tags: string[], existing: string[]): string[] {
  const byKey = new Map(existing.map((e) => [sameTag(e), e]))
  return [...new Set(tags.map((t) => byKey.get(sameTag(t)) ?? t))].slice(0, 3)
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
