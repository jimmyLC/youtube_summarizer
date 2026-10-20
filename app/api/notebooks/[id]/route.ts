import { NextResponse } from "next/server"
import { currentUserId } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { cleanName } from "@/lib/notebooks"

type Ctx = { params: Promise<{ id: string }> }

/** { name } renames the notebook. It keeps following its YouTube channel. 409 when the name is taken. */
export async function PATCH(req: Request, { params }: Ctx) {
  const userId = await currentUserId()
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
  const { id } = await params
  const name = cleanName(((await req.json().catch(() => ({}))) as { name?: unknown }).name)
  if (!name) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 })
  if (!(await prisma.notebook.findFirst({ where: { id, userId } }))) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })
  }
  const taken = await prisma.notebook.findFirst({ where: { userId, name, NOT: { id } } })
  if (taken) return NextResponse.json({ error: "EXISTS" }, { status: 409 })
  const n = await prisma.notebook.update({ where: { id }, data: { name } })
  return NextResponse.json({ id: n.id, name: n.name, createdAt: n.createdAt.toISOString() })
}

/** Deletes the notebook only; its videos become 未分類. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const userId = await currentUserId()
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
  const { id } = await params
  await prisma.notebook.deleteMany({ where: { id, userId } })
  return NextResponse.json({ ok: true })
}
