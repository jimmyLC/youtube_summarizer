// Types and helpers shared by server and client code. Must not import the database.

/** Shape of a video in the history list (no transcript/summary bodies). */
export type VideoItem = {
  id: string
  youtubeId: string
  /** upload: a local recording (no YouTube page, thumbnail or time links) */
  origin: "youtube" | "upload"
  title: string
  /** null = 未分類 */
  notebookId: string | null
  notebook: string
  status: string
  error: string | null
  tags: string[]
  /** One-line summary shown in channel notebooks */
  tldr: string
  createdAt: string
}

export type NotebookItem = {
  id: string
  name: string
  createdAt: string
}

export type TagItem = { id: string; name: string; count: number }

/** URL key of the built-in notebook that holds videos without one. */
export const UNCATEGORIZED = "_"

export type VideoDetail = VideoItem & {
  lang: string
  summary: { tldr: string; points: { time: number; title: string; detail: string }[] } | null
  transcript: [number, string][] | null
}

/** A notebook with its video count and the time of its newest video (or of its creation). */
export type NotebookRow = NotebookItem & { count: number; updatedAt: string }

/** Notebooks plus the built-in 未分類 (only when something is in it), newest activity first. */
export function notebookRows(notebooks: NotebookItem[], videos: VideoItem[]): NotebookRow[] {
  const rows = new Map<string, NotebookRow>(
    notebooks.map((n) => [n.id, { ...n, count: 0, updatedAt: n.createdAt }])
  )
  let uncategorized = 0
  let uncategorizedAt = ""
  for (const v of videos) {
    const row = v.notebookId ? rows.get(v.notebookId) : undefined
    if (!row) {
      uncategorized++
      if (v.createdAt > uncategorizedAt) uncategorizedAt = v.createdAt
      continue
    }
    row.count++
    if (v.createdAt > row.updatedAt) row.updatedAt = v.createdAt
  }
  const list = [...rows.values()]
  if (uncategorized) list.push({ id: UNCATEGORIZED, name: "", createdAt: uncategorizedAt, count: uncategorized, updatedAt: uncategorizedAt })
  return list.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
}

/** Tags with how many of the given videos carry them, most used first. */
export function tagRows(videos: VideoItem[]): { name: string; count: number }[] {
  const count = new Map<string, number>()
  for (const v of videos) for (const tag of v.tags) count.set(tag, (count.get(tag) ?? 0) + 1)
  return [...count].map(([name, n]) => ({ name, count: n })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}
