import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { nextCookies } from "better-auth/next-js"
import { headers } from "next/headers"
import { prisma } from "./prisma"

/**
 * ALLOWED_EMAILS: comma-separated Google accounts that may sign in.
 * Empty = anyone with a Google account (for a future public launch).
 */
const allowed = (process.env.ALLOWED_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

export function isAllowedEmail(email: string): boolean {
  return allowed.length === 0 || allowed.includes(email.toLowerCase())
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "sqlite" }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      prompt: "select_account",
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 90, // stay signed in for 90 days
    updateAge: 60 * 60 * 24,
  },
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
  },
  trustedOrigins: [process.env.BETTER_AUTH_URL ?? "http://localhost:3000"],
  databaseHooks: {
    user: {
      create: {
        before: async (user) => (isAllowedEmail(user.email) ? undefined : false),
      },
    },
    session: {
      create: {
        // Also blocks existing accounts removed from ALLOWED_EMAILS later
        before: async (session) => {
          const user = await prisma.user.findUnique({ where: { id: session.userId } })
          return user && isAllowedEmail(user.email) ? undefined : false
        },
      },
    },
  },
  plugins: [nextCookies()],
})

/** The signed-in user's id, or null. For server components and route handlers. */
export async function currentUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user.id ?? null
}

/** Just the fields the UI shows, safe to pass to client components. */
export async function currentUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return null
  const { id, name, email, image } = session.user
  return { id, name: name || null, email, image: image ?? null }
}
