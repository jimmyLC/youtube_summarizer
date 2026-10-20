// Types and helpers shared by server and client code. Must not import the database.

/** Shape of a video in the history list (no transcript/summary bodies). */
export type VideoItem = {
  id: string
  youtubeId: string
  /** upload: a local recording (no YouTube page, thumbnail or time links) */
  origin: "youtube" | "upload"
  title: string
  channel: string
  status: string
  error: string | null
  tags: string[]
  /** One-line summary shown in channel notebooks */
  tldr: string
  createdAt: string
}

export type ChannelItem = {
  /** URL key: the channel name, or UNKNOWN_CHANNEL when YouTube did not tell us */
  key: string
  name: string
  count: number
  updatedAt: string
}

export const UNKNOWN_CHANNEL = "_"

export type VideoDetail = VideoItem & {
  lang: string
  summary: { tldr: string; points: { time: number; title: string; detail: string }[] } | null
  transcript: [number, string][] | null
}

/** Channels with their video counts, most recently updated first. */
export function groupChannels(videos: VideoItem[]): ChannelItem[] {
  const map = new Map<string, ChannelItem>()
  for (const v of videos) {
    const key = v.channel || UNKNOWN_CHANNEL
    const found = map.get(key)
    if (found) found.count++
    else map.set(key, { key, name: v.channel, count: 1, updatedAt: v.createdAt })
  }
  return [...map.values()]
}
