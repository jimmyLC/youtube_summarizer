"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { ArrowLeft } from "lucide-react"
import type { VideoItem } from "@/lib/video-types"
import { Header, type HeaderUser } from "./header"
import { useI18n } from "./i18n"
import { isPending } from "./status"
import { VideoRow } from "./video-row"

/** Every video that carries one tag, newest first. */
export function TagView({ user, tag, initial }: { user: HeaderUser; tag: string; initial: VideoItem[] }) {
  const { t } = useI18n()
  const [videos, setVideos] = useState(initial)

  const pending = videos.some((v) => isPending(v.status))
  useEffect(() => {
    if (!pending) return
    const timer = setInterval(async () => {
      const res = await fetch(`/api/videos?tag=${encodeURIComponent(tag)}`)
      if (res.ok) setVideos(await res.json())
    }, 3000)
    return () => clearInterval(timer)
  }, [pending, tag])

  return (
    <main className="mx-auto max-w-2xl px-4 pb-20 pt-[env(safe-area-inset-top)]">
      <Header user={user} />

      <Link href="/?view=tags" className="-ml-1 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" />
        {t("backToTags")}
      </Link>

      <h1 className="mt-4 text-xl font-semibold tracking-tight sm:text-2xl">#{tag}</h1>
      <p className="mt-1 text-sm text-muted">
        {videos.length} {t(videos.length === 1 ? "videoOne" : "videosCount")}
      </p>

      <ul className="mt-6 space-y-1">
        {videos.map((v) => (
          <li key={v.id}>
            <VideoRow video={v} showTldr />
          </li>
        ))}
      </ul>
      {videos.length === 0 && <p className="mt-16 text-center text-sm text-muted">{t("noTagVideos")}</p>}
    </main>
  )
}
