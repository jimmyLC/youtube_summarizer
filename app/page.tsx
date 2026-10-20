import { currentUser } from "@/lib/auth"
import { recoverInterrupted } from "@/lib/jobs"
import { listVideos } from "@/lib/videos"
import { Home } from "@/components/home"
import { Login } from "@/components/login"

type Search = { login?: string; url?: string; text?: string; title?: string; view?: string }

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams
  const user = await currentUser()
  if (!user) return <Login error={params.login === "failed"} />

  await recoverInterrupted(user.id)
  const videos = await listVideos(user.id)
  // Android share target sends the link in `text` or `url`
  const shared = params.url || params.text || undefined
  return <Home user={user} initial={videos} shared={shared} initialView={params.view === "channels" ? "channels" : "all"} />
}
