import { NextResponse } from "next/server"
import { currentUser } from "@/lib/auth"
import { InvalidCookiesError, cookiesStatus, removeCookies, saveCookies } from "@/lib/member-cookies"

/** Session check plus the email allowlist: only the owner may touch the stored YouTube login. */
async function allowedUserId() {
  const user = await currentUser()
  return user?.memberCookies ? user.id : null
}

const forbidden = () => NextResponse.json({ error: "FORBIDDEN" }, { status: 403 })

/** Whether a login is stored, never its contents. */
export async function GET() {
  const userId = await allowedUserId()
  if (!userId) return forbidden()
  return NextResponse.json(await cookiesStatus(userId))
}

/** { text } with the contents of a cookies.txt. */
export async function PUT(req: Request) {
  const userId = await allowedUserId()
  if (!userId) return forbidden()
  const text = ((await req.json().catch(() => ({}))) as { text?: unknown }).text
  if (typeof text !== "string") return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 })
  try {
    const { count } = await saveCookies(userId, text)
    return NextResponse.json({ ...(await cookiesStatus(userId)), count })
  } catch (e) {
    if (e instanceof InvalidCookiesError) return NextResponse.json({ error: "INVALID_COOKIES" }, { status: 400 })
    throw e
  }
}

export async function DELETE() {
  const userId = await allowedUserId()
  if (!userId) return forbidden()
  await removeCookies(userId)
  return NextResponse.json({ configured: false, updatedAt: null })
}
