// Plan limits and the usage shape, shared by server and client code. Must not import the database.

/** Free: this many videos converted in total, ever. */
export const FREE_VIDEOS = 5
/** Pro: audio hours converted per calendar month (Taipei time). */
export const PRO_MONTHLY_HOURS = 20

export type Plan = "free" | "pro" | "unlimited"
export type QuotaError = "QUOTA_FREE" | "QUOTA_MONTH"

export type Usage = {
  plan: Plan
  /** Videos converted so far, plus the ones running now */
  videosUsed: number
  videosLimit: number | null
  /** Audio seconds converted this month */
  secondsUsed: number
  secondsLimit: number | null
}

/** Why this usage may not start another conversion, or null when it may. */
export function exhausted(u: Usage): QuotaError | null {
  if (u.videosLimit !== null && u.videosUsed >= u.videosLimit) return "QUOTA_FREE"
  if (u.secondsLimit !== null && u.secondsUsed >= u.secondsLimit) return "QUOTA_MONTH"
  return null
}
