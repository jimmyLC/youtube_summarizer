import fs from "fs"
import path from "path"
import { prisma } from "./prisma"

/**
 * Jimmy's YouTube login (cookies), used only to download members-only videos.
 * One Netscape-format file per user, mode 600, never sent to the browser. Only the emails in
 * MEMBER_COOKIES_EMAILS may store cookies, so this stays off if the app is ever opened to others.
 */
const DIR = process.env.COOKIES_DIR || path.join(process.cwd(), "data", "cookies")
const MAX_BYTES = 300 * 1024
const LOGIN_COOKIES = ["SAPISID", "__Secure-3PSID", "__Secure-1PSID", "SID", "LOGIN_INFO"]

export class InvalidCookiesError extends Error {}

export function canUseMemberCookies(email: string): boolean {
  const allowed = (process.env.MEMBER_COOKIES_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)
  return allowed.includes(email.toLowerCase())
}

const fileOf = (userId: string) => path.join(DIR, `${userId.replace(/[^\w-]/g, "")}.txt`)

/**
 * Keeps only the YouTube and Google lines of a cookies.txt, so nothing else from the browser is
 * stored. Throws InvalidCookiesError unless the text holds a logged-in YouTube session.
 */
export function cleanCookies(text: string): { text: string; count: number } {
  if (text.length > MAX_BYTES) throw new InvalidCookiesError("too large")
  const kept: string[] = []
  let loggedIn = false
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || (line.startsWith("#") && !line.startsWith("#HttpOnly_"))) continue
    const fields = line.includes("\t") ? line.split("\t") : line.split(/\s+/)
    if (fields.length !== 7) continue
    const domain = fields[0].replace(/^#HttpOnly_/, "").replace(/^\./, "").toLowerCase()
    if (!(domain === "youtube.com" || domain.endsWith(".youtube.com") || domain === "google.com" || domain.endsWith(".google.com"))) continue
    if (LOGIN_COOKIES.includes(fields[5])) loggedIn = true
    kept.push(fields.join("\t"))
  }
  if (!loggedIn) throw new InvalidCookiesError("no login cookies")
  return { text: `# Netscape HTTP Cookie File\n${kept.join("\n")}\n`, count: kept.length }
}

export async function saveCookies(userId: string, text: string): Promise<{ count: number }> {
  const clean = cleanCookies(text)
  await fs.promises.mkdir(DIR, { recursive: true, mode: 0o700 })
  await fs.promises.writeFile(fileOf(userId), clean.text, { mode: 0o600 })
  await fs.promises.chmod(fileOf(userId), 0o600)
  return { count: clean.count }
}

export const removeCookies = (userId: string) => fs.promises.rm(fileOf(userId), { force: true })

export async function cookiesStatus(userId: string): Promise<{ configured: boolean; updatedAt: string | null }> {
  try {
    const stat = await fs.promises.stat(fileOf(userId))
    return { configured: true, updatedAt: stat.mtime.toISOString() }
  } catch {
    return { configured: false, updatedAt: null }
  }
}

/** Path of the cookies file when this user may use it and has stored one; otherwise null. */
export async function memberCookiesFor(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
  if (!user || !canUseMemberCookies(user.email)) return null
  return (await cookiesStatus(userId)).configured ? fileOf(userId) : null
}
