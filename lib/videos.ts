import { prisma } from "./prisma"
import { UNKNOWN_CHANNEL, type VideoDetail, type VideoItem } from "./video-types"

const withTags = { tags: { include: { tag: true } } } as const

type Row = Awaited<ReturnType<typeof prisma.video.findFirstOrThrow<{ include: typeof withTags }>>>

function tldrOf(summary: string | null): string {
  if (!summary) return ""
  try {
    return (JSON.parse(summary) as { tldr?: string }).tldr ?? ""
  } catch {
    return ""
  }
}

function toItem(v: Row): VideoItem {
  return {
    id: v.id,
    youtubeId: v.youtubeId,
    origin: v.origin === "upload" ? "upload" : "youtube",
    title: v.title,
    channel: v.channel,
    status: v.status,
    error: v.error,
    tags: v.tags.map((t) => t.tag.name).sort(),
    tldr: tldrOf(v.summary),
    createdAt: v.createdAt.toISOString(),
  }
}

/** Newest first. `channel` limits the list to one channel notebook. */
export async function listVideos(userId: string, channel?: string): Promise<VideoItem[]> {
  const rows = await prisma.video.findMany({
    where: { userId, ...(channel !== undefined && { channel: channel === UNKNOWN_CHANNEL ? "" : channel }) },
    orderBy: { createdAt: "desc" },
    // The transcript can be huge and the list never shows it
    omit: { transcript: true },
    include: withTags,
  })
  return rows.map((v) => toItem(v as Row))
}

export async function getVideo(userId: string, id: string): Promise<VideoDetail | null> {
  const v = await prisma.video.findFirst({ where: { id, userId }, include: withTags })
  if (!v) return null
  return {
    ...toItem(v),
    lang: v.lang,
    summary: v.summary ? JSON.parse(v.summary) : null,
    transcript: v.transcript ? JSON.parse(v.transcript) : null,
  }
}
