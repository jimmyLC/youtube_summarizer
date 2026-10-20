import { NextResponse } from "next/server"
import { currentUserId } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { extractVideoId, fetchVideoMeta } from "@/lib/youtube"
import { recoverInterrupted, startJob } from "@/lib/jobs"
import { listVideos } from "@/lib/videos"

const unauthorized = () => NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })

export async function GET(req: Request) {
  const userId = await currentUserId()
  if (!userId) return unauthorized()
  await recoverInterrupted(userId)
  const channel = new URL(req.url).searchParams.get("channel") ?? undefined
  return NextResponse.json(await listVideos(userId, channel))
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
    await prisma.video.update({
      where: { id: existing.id },
      data: { createdAt: new Date(), ...(retry ? { status: "queued", error: null, lang } : {}) },
    })
    if (retry) startJob(existing.id)
    return NextResponse.json({ id: existing.id, existed: !retry })
  }

  const meta = await fetchVideoMeta(youtubeId)
  const video = await prisma.video.create({
    data: { userId, youtubeId, lang, title: meta?.title || youtubeId, channel: meta?.channel ?? "" },
  })
  startJob(video.id)
  return NextResponse.json({ id: video.id, existed: false })
}
