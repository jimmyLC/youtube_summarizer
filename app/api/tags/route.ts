import { NextResponse } from "next/server"
import { currentUserId } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const unauthorized = () => NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
const cleanTag = (v: unknown) => (typeof v === "string" ? v.trim().replace(/^#/, "").slice(0, 30) : "")

export async function GET() {
  const userId = await currentUserId()
  if (!userId) return unauthorized()
  const tags = await prisma.tag.findMany({ where: { userId }, include: { _count: { select: { videos: true } } } })
  return NextResponse.json(tags.map((t) => ({ name: t.name, count: t._count.videos })).sort((a, b) => b.count - a.count))
}

/** { name, to } renames a tag; when `to` already exists the two tags are merged. */
export async function PATCH(req: Request) {
  const userId = await currentUserId()
  if (!userId) return unauthorized()
  const body = (await req.json().catch(() => ({}))) as { name?: unknown; to?: unknown }
  const name = cleanTag(body.name)
  const to = cleanTag(body.to)
  if (!name || !to) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 })
  const tag = await prisma.tag.findUnique({ where: { userId_name: { userId, name } } })
  if (!tag) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })
  if (name === to) return NextResponse.json({ name: to, merged: false })

  const target = await prisma.tag.findUnique({ where: { userId_name: { userId, name: to } } })
  if (!target) {
    await prisma.tag.update({ where: { id: tag.id }, data: { name: to } })
    return NextResponse.json({ name: to, merged: false })
  }
  const moving = await prisma.videoTag.findMany({ where: { tagId: tag.id }, select: { videoId: true } })
  await prisma.$transaction([
    prisma.videoTag.createMany({ data: moving.map((m) => ({ videoId: m.videoId, tagId: target.id })) }),
    prisma.tag.delete({ where: { id: tag.id } }), // its old links go with it
  ])
  return NextResponse.json({ name: to, merged: true })
}

/** { name } deletes the tag from every video. */
export async function DELETE(req: Request) {
  const userId = await currentUserId()
  if (!userId) return unauthorized()
  const name = cleanTag(((await req.json().catch(() => ({}))) as { name?: unknown }).name)
  if (!name) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 })
  await prisma.tag.deleteMany({ where: { userId, name } })
  return NextResponse.json({ ok: true })
}
