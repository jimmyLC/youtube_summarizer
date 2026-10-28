import { prisma } from "./prisma"
import { exhausted, FREE_VIDEOS, PRO_MONTHLY_HOURS, type Plan, type QuotaError, type Usage } from "./plan-types"

const PRO_MONTHLY_SECONDS = PRO_MONTHLY_HOURS * 3600

/** UNLIMITED_EMAILS: comma-separated owners who are never limited. */
function unlimitedEmails(): string[] {
  return (process.env.UNLIMITED_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)
}

/** "YYYY-MM" in Taipei time (UTC+8), the month pro's allowance resets on. */
export const monthKey = (at = new Date()) => new Date(at.getTime() + 8 * 3600_000).toISOString().slice(0, 7)

export function planOf(user: { email: string; plan: string }): Plan {
  if (unlimitedEmails().includes(user.email.toLowerCase())) return "unlimited"
  return user.plan === "pro" ? "pro" : "free"
}

// Same list as lib/jobs.ts (not imported: jobs.ts imports this file)
const PENDING = ["queued", "transcribing", "summarizing"]

export async function usageOf(userId: string): Promise<Usage> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  const running = await prisma.video.count({ where: { userId, counted: false, status: { in: PENDING } } })
  const plan = planOf(user)
  return {
    plan,
    videosUsed: user.conversions + running,
    videosLimit: plan === "free" ? FREE_VIDEOS : null,
    secondsUsed: user.usageMonth === monthKey() ? user.usageSeconds : 0,
    secondsLimit: plan === "pro" ? PRO_MONTHLY_SECONDS : null,
  }
}

/** Why this user may not start another conversion, or null when they may. */
export async function quotaError(userId: string): Promise<QuotaError | null> {
  return exhausted(await usageOf(userId))
}

/** Counts a finished video against its owner's quota, once. */
export async function recordUsage(videoId: string, seconds: number): Promise<void> {
  const video = await prisma.video.findUnique({ where: { id: videoId }, select: { userId: true } })
  if (!video) return
  const secs = Math.max(0, Math.round(seconds))
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.video.updateMany({ where: { id: videoId, counted: false }, data: { counted: true, seconds: secs } })
    if (!count) return
    const user = await tx.user.findUniqueOrThrow({ where: { id: video.userId } })
    const key = monthKey()
    await tx.user.update({
      where: { id: user.id },
      data: {
        conversions: { increment: 1 },
        usageMonth: key,
        usageSeconds: user.usageMonth === key ? { increment: secs } : secs,
      },
    })
  })
}
