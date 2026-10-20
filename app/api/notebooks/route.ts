import { NextResponse } from "next/server"
import { currentUserId } from "@/lib/auth"
import { cleanName, listNotebooks, notebookByName } from "@/lib/notebooks"

export async function GET() {
  const userId = await currentUserId()
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
  return NextResponse.json(await listNotebooks(userId))
}

/** { name } -> the notebook with that name, created if it is new. */
export async function POST(req: Request) {
  const userId = await currentUserId()
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
  const name = cleanName(((await req.json().catch(() => ({}))) as { name?: unknown }).name)
  if (!name) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 })
  const n = await notebookByName(userId, name)
  return NextResponse.json({ id: n.id, name: n.name, createdAt: n.createdAt.toISOString() })
}
