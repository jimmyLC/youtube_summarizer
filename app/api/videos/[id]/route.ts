import { NextResponse } from "next/server"
import { currentUserId } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { setTags } from "@/lib/jobs"
import { removeAudio } from "@/lib/uploads"
import { getVideo } from "@/lib/videos"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const userId = await currentUserId()
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
  const video = await getVideo(userId, (await params).id)
  return video ? NextResponse.json(video) : NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })
}

/** { tags?: string[], title?: string } replaces the video's tags and/or (uploads only) its title. */
export async function PATCH(req: Request, { params }: Ctx) {
  const userId = await currentUserId()
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as { tags?: unknown; title?: unknown }
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : undefined
  if (!Array.isArray(body.tags) && !title) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 })
  const video = await prisma.video.findFirst({ where: { id, userId } })
  if (!video) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })
  if (title && video.origin === "upload") {
    await prisma.video.update({ where: { id }, data: { title, titleEdited: true } })
  }
  if (Array.isArray(body.tags)) await setTags(userId, id, body.tags.map(String))
  return NextResponse.json(await getVideo(userId, id))
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const userId = await currentUserId()
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
  const { id } = await params
  const { count } = await prisma.video.deleteMany({ where: { id, userId } })
  if (count) await removeAudio(id)
  await prisma.tag.deleteMany({ where: { userId, videos: { none: {} } } })
  return NextResponse.json({ ok: true })
}
