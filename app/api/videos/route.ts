import { NextResponse } from "next/server"
import { currentUserId } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { extractVideoId, fetchVideoMeta } from "@/lib/youtube"
import { recoverInterrupted, startJob } from "@/lib/jobs"
import { listVideos } from "@/lib/videos"
import { notebookForChannel } from "@/lib/notebooks"
import { quotaError } from "@/lib/plans"

const unauthorized = () => NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })

export async function GET(req: Request) {
  const userId = await currentUserId()
  if (!userId) return unauthorized()
  await recoverInterrupted(userId)
  const params = new URL(req.url).searchParams
  return NextResponse.json(
    await listVideos(userId, { notebook: params.get("notebook") ?? undefined, tag: params.get("tag") ?? undefined })
  )
}

/** { url, lang } -> starts a conversion, or returns the existing one for the same video. */
export async function POST(req: Request) {
  const userId = await currentUserId()
  if (!userId) return unauthorized()

  const body = (await req.json().catch(() => ({}))) as { url?: string; lang?: string }
  const youtubeId = extractVideoId(body.url ?? "")
  if (!youtubeId) return NextResponse.json({ error: "INVALID_URL" }, { status: 400 })
  const lang = body.lang === "en" ? "en" : "zh-TW"

  const existing = await prisma.video.findUnique({ where: { userId_youtubeId: { userId, youtubeId } } })
  if (existing) {
    // Converting again: move it to the top; re-run only if it failed
    const retry = existing.status === "error"
    if (retry && !existing.counted) {
      const blocked = await quotaError(userId)
      if (blocked) return NextResponse.json({ error: blocked }, { status: 402 })
    }
    await prisma.video.update({
      where: { id: existing.id },
      data: { createdAt: new Date(), ...(retry ? { status: "queued", error: null, lang } : {}) },
    })
    if (retry) startJob(existing.id)
    return NextResponse.json({ id: existing.id, existed: !retry })
  }

  const blocked = await quotaError(userId)
  if (blocked) return NextResponse.json({ error: blocked }, { status: 402 })

  const meta = await fetchVideoMeta(youtubeId)
  const video = await prisma.video.create({
    data: {
      userId,
      youtubeId,
      lang,
      title: meta?.title || youtubeId,
      channel: meta?.channel ?? "",
      notebookId: await notebookForChannel(userId, meta?.channel ?? ""),
    },
  })
  startJob(video.id)
  return NextResponse.json({ id: video.id, existed: false })
}
