"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { ArrowLeft } from "lucide-react"
import type { NotebookItem, VideoItem } from "@/lib/video-types"
import { Header, type HeaderUser } from "./header"
import { useI18n } from "./i18n"
import { NotebookPicker } from "./notebook-picker"
import { isPending } from "./status"
import { VideoRow } from "./video-row"

/** One notebook: its videos, newest first. Select mode moves several videos to another notebook at once. */
export function NotebookView({ user, notebookId, name, notebooks, initial }: {
  user: HeaderUser
  notebookId: string
  /** "" for the built-in 未分類 */
  name: string
  notebooks: NotebookItem[]
  initial: VideoItem[]
}) {
  const { t } = useI18n()
  const [videos, setVideos] = useState(initial)
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [known, setKnown] = useState(notebooks)

  const pending = videos.some((v) => isPending(v.status))
  useEffect(() => {
    if (!pending) return
    const timer = setInterval(async () => {
      const res = await fetch(`/api/videos?notebook=${encodeURIComponent(notebookId)}`)
      if (res.ok) setVideos(await res.json())
    }, 3000)
    return () => clearInterval(timer)
  }, [pending, notebookId])

  const stopSelecting = () => {
    setSelecting(false)
    setPicked(new Set())
  }

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })

  const move = async (target: string) => {
    const ids = [...picked]
    const res = await fetch("/api/videos/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, notebook: target }),
    })
    if (!res.ok) return
    const { notebookId: targetId } = (await res.json()) as { notebookId: string | null }
    if (target && !known.some((n) => n.name === target)) {
      setKnown([...known, { id: targetId ?? target, name: target, createdAt: new Date().toISOString() }])
    }
    // Videos that left this notebook disappear from the list
    setVideos((list) => list.filter((v) => !picked.has(v.id) || (targetId ?? "_") === notebookId))
    stopSelecting()
  }

  const title = name || t("uncategorized")

  return (
    <main className="mx-auto max-w-2xl px-4 pb-28 pt-[env(safe-area-inset-top)]">
      <Header user={user} />

      <Link href="/?view=notebooks" className="-ml-1 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" />
        {t("backToNotebooks")}
      </Link>

      <div className="mt-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
          <p className="mt-1 text-sm text-muted">
            {videos.length} {t(videos.length === 1 ? "videoOne" : "videosCount")}
          </p>
        </div>
        {videos.length > 0 && (
          <button
            onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
            className="shrink-0 rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-subtle hover:text-fg"
          >
            {selecting ? t("done") : t("select")}
          </button>
        )}
      </div>

      <ul className="mt-6 space-y-1">
        {videos.map((v) => (
          <li key={v.id}>
            <VideoRow
              video={v}
              showNotebook={false}
              showTldr
              select={selecting ? { selected: picked.has(v.id), onToggle: () => toggle(v.id) } : undefined}
            />
          </li>
        ))}
      </ul>
      {videos.length === 0 && <p className="mt-16 text-center text-sm text-muted">{t("emptyNotebook")}</p>}

      {selecting && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
            <span className="text-sm text-muted">{t("selectedCount").replace("{n}", String(picked.size))}</span>
            {picked.size > 0 && (
              <NotebookPicker notebooks={known} current={notebookId === "_" ? null : notebookId} onPick={move} up>
                <span className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white">{t("moveTo")}</span>
              </NotebookPicker>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
