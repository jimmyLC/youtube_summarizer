import { NextResponse } from "next/server"
import { currentUserId } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { startJob } from "@/lib/jobs"
import { quotaError } from "@/lib/plans"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId()
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as { lang?: string }
  const lang = body.lang === "en" ? "en" : body.lang === "zh-TW" ? "zh-TW" : undefined

  // A video that never counted is still a new conversion; a counted one is only being redone
  const video = await prisma.video.findFirst({ where: { id, userId }, select: { counted: true } })
  if (video && !video.counted) {
    const blocked = await quotaError(userId)
    if (blocked) return NextResponse.json({ error: blocked }, { status: 402 })
  }

  const { count } = await prisma.video.updateMany({
    where: { id, userId },
    data: { status: "queued", error: null, summary: null, ...(lang ? { lang } : {}) },
  })
  if (!count) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })
  startJob(id)
  return NextResponse.json({ ok: true })
}
