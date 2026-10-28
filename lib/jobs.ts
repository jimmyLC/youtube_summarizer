import { prisma } from "./prisma"
import { CookiesExpiredError, getTranscript, getTranscriptFromFile, MembersOnlyError, saveYoutubeAudio, TooLongError, type Line } from "./transcript"
import { memberCookiesFor } from "./member-cookies"
import { audioExists, audioPath, removeAudio } from "./uploads"
import { polishTranscript } from "./polish"
import { recordUsage } from "./plans"
import { MAX_SECONDS } from "./upload-limits"
import { summarize } from "./summarize"
import type { Lang } from "./i18n"

/** Error codes stored on Video.error and translated in the UI. */
export type ErrorCode = "NO_TRANSCRIPT" | "SUMMARY_FAILED" | "INTERRUPTED" | "AUDIO_MISSING" | "TOO_LONG" | "MEMBERS_ONLY" | "COOKIES_EXPIRED"

export const PENDING = ["queued", "transcribing", "summarizing"]

// Survives dev hot reloads; lost on a real restart (see recoverInterrupted)
const g = globalThis as unknown as { running?: Set<string> }
const running = (g.running ??= new Set<string>())

/**
 * Runs the conversion in the background; the caller does not wait.
 * `summaryOnly`: only redo the summary from the transcript as it is now (tags and title stay).
 */
export function startJob(videoId: string, opts: { summaryOnly?: boolean } = {}) {
  if (running.has(videoId)) return
  running.add(videoId)
  runJob(videoId, opts.summaryOnly ?? false)
    .catch((e) => console.error(`[job ${videoId}]`, e))
    .finally(() => running.delete(videoId))
}

async function runJob(id: string, summaryOnly: boolean) {
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
      const upload = video.origin === "upload"
      const hint = { title: video.title, channel: video.channel }
      if (upload && !(await audioExists(id))) return fail(id, "AUDIO_MISSING", new Error("audio file is gone"))
      const transcript = upload
        ? await getTranscriptFromFile(audioPath(id), hint)
        : await getTranscript(video.youtubeId, { memberCookies: await memberCookiesFor(video.userId), keepAudioAs: audioPath(id), hint })
      lines = transcript.lines
      // The audio route refuses long downloads; captions tell the length only now
      if (!upload && (lines.at(-1)?.[0] ?? 0) > MAX_SECONDS + 60) throw new TooLongError(`${id} is longer than ${MAX_SECONDS} s`)
      // Fix same-sounding wrong characters (names, terms); Chinese only, and it never fails the job
      if (/^zh/i.test(transcript.lang)) lines = await polishTranscript(lines, { title: video.title, channel: video.channel })
      await prisma.video.update({
        where: { id },
        data: { status: "summarizing", transcript: JSON.stringify(lines), source: transcript.source },
      })
    } catch (e) {
      if (e instanceof TooLongError) {
        await removeAudio(id)
        return fail(id, "TOO_LONG", e)
      }
      if (e instanceof MembersOnlyError) return fail(id, "MEMBERS_ONLY", e)
      if (e instanceof CookiesExpiredError) return fail(id, "COOKIES_EXPIRED", e)
      // A failed upload keeps its audio, so "retry" does not need a second upload
      return fail(id, "NO_TRANSCRIPT", e)
    }
  }

  // Videos with captions never downloaded audio for the transcript; fetch it for playback
  // while the summary is being written. Only a nice-to-have: failing here never fails the job.
  const audio = !summaryOnly && video.origin === "youtube" ? keepAudio(video) : Promise.resolve()

  try {
    const existing = await prisma.tag.findMany({ where: { userId: video.userId }, select: { name: true } })
    const { summary, tags, title } = await summarize({
      title: video.title,
      channel: video.channel,
      lines,
      lang: video.lang as Lang,
      existingTags: existing.map((t) => t.name),
    })
    await audio // so the player is there when the page sees "done"
    const seconds = (lines.at(-1)?.[0] ?? 0) + 10
    await prisma.video.update({
      where: { id },
      data: {
        status: "done",
        error: null,
        summary: JSON.stringify(summary),
        // An upload only has its file name until now; keep a title the user wrote
        ...(!summaryOnly && video.origin === "upload" && !video.titleEdited && title ? { title } : {}),
      },
    })
    // Never overwrite tags the user already has on this video
    if (!summaryOnly && (await prisma.videoTag.count({ where: { videoId: id } })) === 0) {
      await setTags(video.userId, id, tags)
    }
    await recordUsage(id, seconds).catch((e) => console.error(`[job ${id}] could not record usage:`, e))
  } catch (e) {
    return fail(id, "SUMMARY_FAILED", e)
  } finally {
    await audio // never leave it running in the background
  }
}

async function keepAudio(video: { id: string; youtubeId: string; userId: string }) {
  try {
    if (await audioExists(video.id)) return
    await saveYoutubeAudio(video.youtubeId, await memberCookiesFor(video.userId), audioPath(video.id))
  } catch (e) {
    console.warn(`[job ${video.id}] could not keep the audio:`, e instanceof Error ? e.message : e)
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
