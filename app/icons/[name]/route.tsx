import { appIcon } from "@/lib/app-icon"

/** /icons/192, /icons/512 and /icons/maskable for the web app manifest. */
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params
  if (name === "maskable") return appIcon(512, { padded: true })
  const size = Number(name)
  return size === 192 || size === 512 ? appIcon(size) : new Response("Not found", { status: 404 })
}
