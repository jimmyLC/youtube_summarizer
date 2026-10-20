import { notFound, redirect } from "next/navigation"
import { currentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { listNotebooks } from "@/lib/notebooks"
import { UNCATEGORIZED } from "@/lib/video-types"
import { listVideos } from "@/lib/videos"
import { NotebookView } from "@/components/notebook-view"

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser()
  if (!user) redirect("/")

  const id = decodeURIComponent((await params).id)
  const notebook = id === UNCATEGORIZED ? null : await prisma.notebook.findFirst({ where: { id, userId: user.id } })
  if (id !== UNCATEGORIZED && !notebook) notFound()

  const [videos, notebooks] = await Promise.all([listVideos(user.id, { notebook: id }), listNotebooks(user.id)])
  return <NotebookView user={user} notebookId={id} name={notebook?.name ?? ""} notebooks={notebooks} initial={videos} />
}
