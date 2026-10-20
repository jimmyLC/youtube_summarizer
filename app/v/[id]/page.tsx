import { notFound, redirect } from "next/navigation"
import { currentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { listNotebooks } from "@/lib/notebooks"
import { getVideo } from "@/lib/videos"
import { VideoView } from "@/components/video-view"

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser()
  if (!user) redirect("/")

  const video = await getVideo(user.id, (await params).id)
  if (!video) notFound()

  const tags = await prisma.tag.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } })
  return <VideoView user={user} initial={video} allTags={tags.map((t) => t.name)} notebooks={await listNotebooks(user.id)} />
}
