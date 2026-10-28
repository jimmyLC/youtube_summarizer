import { NextResponse } from "next/server"
import { currentUserId } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { removeCookies } from "@/lib/member-cookies"
import { usageOf } from "@/lib/plans"
import { removeAudio } from "@/lib/uploads"

export async function GET() {
  const userId = await currentUserId()
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
  return NextResponse.json(await usageOf(userId))
}

/** Deletes the account and everything in it: videos, transcripts, audio files, notebooks, tags, sign-ins. */
export async function DELETE() {
  const userId = await currentUserId()
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })

  const videos = await prisma.video.findMany({ where: { userId }, select: { id: true } })
  for (const { id } of videos) await removeAudio(id)
  await removeCookies(userId)

  // Spelled out instead of trusting cascades, because this must really remove everything
  await prisma.$transaction([
    prisma.videoTag.deleteMany({ where: { video: { userId } } }),
    prisma.video.deleteMany({ where: { userId } }),
    prisma.tag.deleteMany({ where: { userId } }),
    prisma.notebook.deleteMany({ where: { userId } }),
    prisma.session.deleteMany({ where: { userId } }),
    prisma.account.deleteMany({ where: { userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ])
  return NextResponse.json({ ok: true })
}
