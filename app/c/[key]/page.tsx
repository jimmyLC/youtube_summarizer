import { notFound, redirect } from "next/navigation"
import { currentUser } from "@/lib/auth"
import { listVideos } from "@/lib/videos"
import { ChannelView } from "@/components/channel-view"

export default async function Page({ params }: { params: Promise<{ key: string }> }) {
  const user = await currentUser()
  if (!user) redirect("/")

  const key = decodeURIComponent((await params).key)
  const videos = await listVideos(user.id, key)
  if (videos.length === 0) notFound()
  return <ChannelView user={user} channelKey={key} name={videos[0].channel} initial={videos} />
}
