import { NextResponse } from "next/server"
import { currentUserId } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { startJob } from "@/lib/jobs"

/** Redoes only the summary from the (possibly corrected) transcript. Tags and title stay as they are. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId()
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
  const { id } = await params
  const { count } = await prisma.video.updateMany({
    where: { id, userId, transcript: { not: null }, status: { in: ["done", "error"] } },
    data: { status: "summarizing", error: null },
  })
  if (!count) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })
  startJob(id, { summaryOnly: true })
  return NextResponse.json({ ok: true })
}
