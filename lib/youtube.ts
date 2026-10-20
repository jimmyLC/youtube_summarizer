const HOSTS = ["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"]

/** Returns the 11-character video id, or null when the text is not a YouTube link. */
export function extractVideoId(input: string): string | null {
  const text = input.trim()
  if (/^[\w-]{11}$/.test(text)) return text

  // Shared text often wraps the link ("Check this out https://youtu.be/...")
  const urlText = text.match(/https?:\/\/\S+/)?.[0] ?? text
  let url: URL
  try {
    url = new URL(urlText)
  } catch {
    return null
  }
  if (!HOSTS.includes(url.hostname.toLowerCase())) return null

  if (url.hostname === "youtu.be") return matchId(url.pathname.slice(1))
  const v = url.searchParams.get("v")
  if (v) return matchId(v)
  const path = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/)
  return path ? path[1] : null
}

function matchId(s: string): string | null {
  const m = s.match(/^[\w-]{11}/)
  return m ? m[0] : null
}

export const watchUrl = (id: string, seconds?: number) =>
  `https://www.youtube.com/watch?v=${id}${seconds ? `&t=${Math.floor(seconds)}s` : ""}`

export const thumbnailUrl = (id: string) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`

/** Title and channel via YouTube oEmbed (no API key). */
export async function fetchVideoMeta(id: string): Promise<{ title: string; channel: string } | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl(id))}`,
      { signal: AbortSignal.timeout(10_000) }
    )
    if (!res.ok) return null
    const data = (await res.json()) as { title?: string; author_name?: string }
    return { title: data.title ?? "", channel: data.author_name ?? "" }
  } catch {
    return null
  }
}

/** 125 -> "2:05", 3725 -> "1:02:05" */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, "0")
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`
}
