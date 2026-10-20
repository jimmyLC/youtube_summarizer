import { prisma } from "./prisma"
import { getTranscript, type Line } from "./transcript"
import { summarize } from "./summarize"
import type { Lang } from "./i18n"

/** Error codes stored on Video.error and translated in the UI. */
export type ErrorCode = "NO_TRANSCRIPT" | "SUMMARY_FAILED" | "INTERRUPTED"

export const PENDING = ["queued", "transcribing", "summarizing"]

// Survives dev hot reloads; lost on a real restart (see recoverInterrupted)
const g = globalThis as unknown as { running?: Set<string> }
const running = (g.running ??= new Set<string>())

/** Runs the conversion in the background; the caller does not wait. */
export function startJob(videoId: string) {
  if (running.has(videoId)) return
  running.add(videoId)
  runJob(videoId)
    .catch((e) => console.error(`[job ${videoId}]`, e))
    .finally(() => running.delete(videoId))
}

async function runJob(id: string) {
  const video = await prisma.video.findUnique({ where: { id } })
  if (!video) return

  // A retry keeps the transcript it already has (Whisper costs money and time)
  let lines: Line[]
  if (video.transcript) {
    lines = JSON.parse(video.transcript)
    await setStatus(id, "summarizing")
  } else {
    await setStatus(id, "transcribing")
    try {
      const transcript = await getTranscript(video.youtubeId)
      lines = transcript.lines
      await prisma.video.update({
        where: { id },
        data: { status: "summarizing", transcript: JSON.stringify(lines), source: transcript.source },
      })
    } catch (e) {
      return fail(id, "NO_TRANSCRIPT", e)
    }
  }

  try {
    const existing = await prisma.tag.findMany({ where: { userId: video.userId }, select: { name: true } })
    const { summary, tags } = await summarize({
      title: video.title,
      channel: video.channel,
      lines,
      lang: video.lang as Lang,
      existingTags: existing.map((t) => t.name),
    })
    await prisma.video.update({
      where: { id },
      data: { status: "done", error: null, summary: JSON.stringify(summary) },
    })
    // Never overwrite tags the user already has on this video
    if ((await prisma.videoTag.count({ where: { videoId: id } })) === 0) {
      await setTags(video.userId, id, tags)
    }
  } catch (e) {
    return fail(id, "SUMMARY_FAILED", e)
  }
}

const setStatus = (id: string, status: string) =>
  prisma.video.update({ where: { id }, data: { status, error: null } })

async function fail(id: string, code: ErrorCode, e: unknown) {
  console.error(`[job ${id}] ${code}:`, e instanceof Error ? e.message : e)
  await prisma.video.update({ where: { id }, data: { status: "error", error: code } })
}

/** Jobs cut off by a server restart would otherwise spin forever. */
export async function recoverInterrupted(userId: string) {
  const stuck = await prisma.video.findMany({
    where: { userId, status: { in: PENDING } },
    select: { id: true },
  })
  const dead = stuck.map((v) => v.id).filter((id) => !running.has(id))
  if (dead.length) {
    await prisma.video.updateMany({ where: { id: { in: dead } }, data: { status: "error", error: "INTERRUPTED" } })
  }
}

/** Replaces a video's tags and drops tags no video uses any more. */
export async function setTags(userId: string, videoId: string, names: string[]) {
  const clean = [...new Set(names.map((n) => n.trim().replace(/^#/, "")).filter(Boolean))].slice(0, 10)
  const tags = await Promise.all(
    clean.map((name) =>
      prisma.tag.upsert({ where: { userId_name: { userId, name } }, create: { userId, name }, update: {} })
    )
  )
  await prisma.$transaction([
    prisma.videoTag.deleteMany({ where: { videoId } }),
    prisma.videoTag.createMany({ data: tags.map((t) => ({ videoId, tagId: t.id })) }),
    prisma.tag.deleteMany({ where: { userId, videos: { none: {} } } }),
  ])
}
