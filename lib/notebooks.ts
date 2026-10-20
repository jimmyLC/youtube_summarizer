import { prisma } from "./prisma"
import type { NotebookItem } from "./video-types"

const toItem = (n: { id: string; name: string; createdAt: Date }): NotebookItem => ({
  id: n.id,
  name: n.name,
  createdAt: n.createdAt.toISOString(),
})

export async function listNotebooks(userId: string): Promise<NotebookItem[]> {
  const rows = await prisma.notebook.findMany({ where: { userId }, orderBy: { createdAt: "asc" } })
  return rows.map(toItem)
}

export const cleanName = (name: unknown) => (typeof name === "string" ? name.trim().slice(0, 60) : "")

/** The notebook with this name, created when it does not exist yet. */
export async function notebookByName(userId: string, name: string, matchChannel = "") {
  return prisma.notebook.upsert({
    where: { userId_name: { userId, name } },
    create: { userId, name, matchChannel },
    update: {},
  })
}

/**
 * Where a newly converted YouTube video goes: the notebook that already follows its channel
 * (the name may have been changed by the user), else a new one named after the channel.
 */
export async function notebookForChannel(userId: string, channel: string): Promise<string | null> {
  const name = cleanName(channel)
  if (!name) return null
  const following = await prisma.notebook.findFirst({ where: { userId, matchChannel: name } })
  if (following) return following.id
  const byName = await prisma.notebook.findUnique({ where: { userId_name: { userId, name } } })
  if (byName) {
    if (!byName.matchChannel) await prisma.notebook.update({ where: { id: byName.id }, data: { matchChannel: name } })
    return byName.id
  }
  return (await prisma.notebook.create({ data: { userId, name, matchChannel: name } })).id
}

/** Moves videos to the notebook with this name (created if new); an empty name means 未分類. */
export async function moveVideos(userId: string, ids: string[], name: unknown) {
  const clean = cleanName(name)
  const notebookId = clean ? (await notebookByName(userId, clean)).id : null
  const { count } = await prisma.video.updateMany({ where: { userId, id: { in: ids } }, data: { notebookId } })
  return { count, notebookId }
}
