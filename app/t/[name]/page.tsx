import { notFound, redirect } from "next/navigation"
import { currentUser } from "@/lib/auth"
import { listVideos } from "@/lib/videos"
import { TagView } from "@/components/tag-view"

export default async function Page({ params }: { params: Promise<{ name: string }> }) {
  const user = await currentUser()
  if (!user) redirect("/")

  const tag = decodeURIComponent((await params).name)
  const videos = await listVideos(user.id, { tag })
  if (videos.length === 0) notFound()
  return <TagView user={user} tag={tag} initial={videos} />
}
