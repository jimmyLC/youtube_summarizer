// Builds the Markdown file of a video (for Notion, Obsidian, etc.). Pure functions, safe for the browser.
import type { VideoDetail } from "./video-types"
import { formatTime, watchUrl } from "./youtube"

/** Merges transcript lines into ~45 s paragraphs; CJK text is joined without spaces. */
export function toParagraphs(lines: [number, string][]): { time: number; text: string }[] {
  const out: { time: number; text: string; parts: string[] }[] = []
  for (const [time, text] of lines) {
    const last = out[out.length - 1]
    if (!last || time - last.time >= 45) out.push({ time, text: "", parts: [text] })
    else last.parts.push(text)
  }
  return out.map(({ time, parts }) => {
    const cjk = /[㐀-鿿]/.test(parts.join(""))
    return { time, text: parts.join(cjk ? "，" : " ").replace(/([。！？，、])，/g, "$1") }
  })
}

type Labels = { keyPoints: string; transcript: string; source: string; tags: string }

/** One document: title, source, tags, summary, then the transcript. Time stamps link to YouTube when there is a page. */
export function videoMarkdown(video: VideoDetail, labels: Labels): string {
  const youtube = video.origin === "youtube"
  const stamp = (time: number) =>
    youtube ? `[${formatTime(time)}](${watchUrl(video.youtubeId, time)})` : `\`${formatTime(time)}\``
  const out: string[] = [`# ${video.title}`]

  const meta = [
    youtube ? `${labels.source}：${watchUrl(video.youtubeId)}` : "",
    video.tags.length ? `${labels.tags}：${video.tags.map((tag) => `#${tag.replace(/\s+/g, "-")}`).join(" ")}` : "",
  ].filter(Boolean)
  if (meta.length) out.push(meta.join("  \n"))

  if (video.summary) {
    if (video.summary.tldr) out.push(`> ${video.summary.tldr.replace(/\n+/g, " ")}`)
    out.push(`## ${labels.keyPoints}`)
    for (const p of video.summary.points) out.push(`### ${stamp(p.time)} ${p.title}\n\n${p.detail}`)
  }
  if (video.transcript?.length) {
    out.push(`## ${labels.transcript}`)
    for (const p of toParagraphs(video.transcript)) out.push(`${stamp(p.time)} ${p.text}`)
  }
  return out.join("\n\n") + "\n"
}

/** A safe file name from the title: no path or reserved characters, not too long. */
export function markdownFileName(title: string): string {
  const clean = [...title].map((c) => (c < " " || '\\/:*?"<>|'.includes(c) ? " " : c)).join("")
  const base = clean.replace(/\s+/g, " ").trim().slice(0, 80).trim()
  return `${base || "note"}.md`
}
