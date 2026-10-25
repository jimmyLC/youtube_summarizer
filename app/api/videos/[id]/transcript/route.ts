import { NextResponse } from "next/server"
import { currentUserId } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type Ctx = { params: Promise<{ id: string }> }

/** { lines: [seconds, text][] }: replaces the whole transcript with the user's corrected version. */
export async function PUT(req: Request, { params }: Ctx) {
  const userId = await currentUserId()
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as { lines?: unknown }
  if (!Array.isArray(body.lines)) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 })

  const lines: [number, string][] = []
  for (const line of body.lines) {
    if (!Array.isArray(line) || typeof line[0] !== "number" || !Number.isFinite(line[0]) || typeof line[1] !== "string") {
      return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 })
    }
    const text = line[1].trim()
    if (text) lines.push([Math.max(0, line[0]), text])
  }
  if (lines.length === 0) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 })

  const { count } = await prisma.video.updateMany({
    where: { id, userId, transcript: { not: null }, status: { notIn: ["queued", "transcribing", "summarizing"] } },
    data: { transcript: JSON.stringify(lines) },
  })
  return count ? NextResponse.json({ lines }) : NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })
}
