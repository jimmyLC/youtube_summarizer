import { NextResponse } from "next/server"
import { currentUserId } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { setTags } from "@/lib/jobs"
import { getVideo } from "@/lib/videos"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const userId = await currentUserId()
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
  const video = await getVideo(userId, (await params).id)
  return video ? NextResponse.json(video) : NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })
}

/** { tags: string[] } replaces the video's tags. */
export async function PATCH(req: Request, { params }: Ctx) {
  const userId = await currentUserId()
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as { tags?: unknown }
  if (!Array.isArray(body.tags)) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 })
  if (!(await prisma.video.findFirst({ where: { id, userId } }))) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })
  }
  await setTags(userId, id, body.tags.map(String))
  return NextResponse.json(await getVideo(userId, id))
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const userId = await currentUserId()
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
  const { id } = await params
  await prisma.video.deleteMany({ where: { id, userId } })
  await prisma.tag.deleteMany({ where: { userId, videos: { none: {} } } })
  return NextResponse.json({ ok: true })
}
