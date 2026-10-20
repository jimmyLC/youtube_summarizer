import { NextResponse } from "next/server"
import { currentUserId } from "@/lib/auth"
import { moveVideos } from "@/lib/notebooks"

/** { ids: string[], notebook: string } moves videos into that notebook (created if new); "" = 未分類. */
export async function POST(req: Request) {
  const userId = await currentUserId()
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as { ids?: unknown; notebook?: unknown }
  if (!Array.isArray(body.ids) || body.ids.length === 0) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 })
  const { count, notebookId } = await moveVideos(userId, body.ids.map(String), body.notebook)
  return NextResponse.json({ moved: count, notebookId })
}
