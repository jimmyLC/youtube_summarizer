"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowRight, ChevronRight, Loader2 } from "lucide-react"
import { groupChannels, type VideoItem } from "@/lib/video-types"
import { extractVideoId } from "@/lib/youtube"
import { Header, type HeaderUser } from "./header"
import { useI18n } from "./i18n"
import { isPending } from "./status"
import { VideoRow } from "./video-row"

type View = "all" | "channels"

export function Home({ user, initial, shared, initialView }: {
  user: HeaderUser
  initial: VideoItem[]
  shared?: string
  initialView: View
}) {
  const { t, lang } = useI18n()
  const router = useRouter()
  const [videos, setVideos] = useState(initial)
  const [url, setUrl] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState<string | null>(null)
  const [view, setViewState] = useState<View>(initialView)
  const sharedHandled = useRef(false)

  const tags = useMemo(() => {
    const count = new Map<string, number>()
    for (const v of videos) for (const tag of v.tags) count.set(tag, (count.get(tag) ?? 0) + 1)
    return [...count].sort((a, b) => b[1] - a[1]).map(([name]) => name)
  }, [videos])

  const channels = useMemo(() => groupChannels(videos), [videos])

  const setView = (next: View) => {
    setViewState(next)
    window.history.replaceState(null, "", next === "channels" ? "/?view=channels" : "/")
  }

  const shown = filter ? videos.filter((v) => v.tags.includes(filter)) : videos

  // Refresh while something is still being converted
  const pending = videos.some((v) => isPending(v.status))
  useEffect(() => {
    if (!pending) return
    const timer = setInterval(async () => {
      const res = await fetch("/api/videos")
      if (res.ok) setVideos(await res.json())
    }, 3000)
    return () => clearInterval(timer)
  }, [pending])

  const submit = async (text: string) => {
    if (busy) return
    if (!extractVideoId(text)) {
      setError(t("invalidUrl"))
      return
    }
    setBusy(true)
    setError("")
    try {
      const res = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: text, lang }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      router.push(`/v/${data.id}`)
    } catch (e) {
      setError((e as Error).message === "INVALID_URL" ? t("invalidUrl") : t("networkError"))
      setBusy(false)
    }
  }

  // Android share sheet -> /?text=... (see app/manifest.ts)
  useEffect(() => {
    if (shared && !sharedHandled.current) {
      sharedHandled.current = true
      window.history.replaceState(null, "", "/")
      submit(shared)
    }
  }, [shared])

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-[env(safe-area-inset-top)]">
      <Header user={user} />

      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit(url)
        }}
        className="mt-2 flex items-center gap-2 rounded-2xl border border-line bg-bg p-1.5 pl-4 shadow-sm focus-within:border-fg/30"
      >
        <input
          value={url}
          onChange={(e) => {
            setUrl(e.target.value)
            setError("")
          }}
          // Pasting a link converts it right away
          onPaste={(e) => {
            const text = e.clipboardData.getData("text")
            if (extractVideoId(text)) {
              e.preventDefault()
              setUrl(text)
              submit(text)
            }
          }}
          placeholder={t("placeholder")}
          inputMode="url"
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={busy || !url.trim()}
          className="flex h-10 items-center gap-1 rounded-xl bg-fg px-4 text-sm font-medium text-bg disabled:opacity-30"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          <span className="hidden sm:inline">{t("convert")}</span>
        </button>
      </form>
      {error && <p className="mt-2 px-1 text-sm text-accent">{error}</p>}

      <div className="mt-8 flex gap-6 border-b border-line">
        <ViewTab active={view === "all"} onClick={() => setView("all")}>
          {t("tabAll")}
        </ViewTab>
        <ViewTab active={view === "channels"} onClick={() => setView("channels")}>
          {t("tabChannels")}
        </ViewTab>
      </div>

      {view === "all" ? (
        <>
          {tags.length > 0 && (
            <nav className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4">
              <Chip active={!filter} onClick={() => setFilter(null)}>
                {t("all")}
              </Chip>
              {tags.map((tag) => (
                <Chip key={tag} active={filter === tag} onClick={() => setFilter(filter === tag ? null : tag)}>
                  {tag}
                </Chip>
              ))}
            </nav>
          )}
          <ul className="mt-4">
            {shown.map((v) => (
              <li key={v.id}>
                <VideoRow video={v} />
              </li>
            ))}
          </ul>
          {shown.length === 0 && (
            <p className="mt-16 text-center text-sm text-muted">{filter ? t("noMatch") : t("empty")}</p>
          )}
        </>
      ) : (
        <>
          <ul className="mt-4">
            {channels.map((c) => (
              <li key={c.key}>
                <Link href={`/c/${encodeURIComponent(c.key)}`} className="-mx-2 flex items-center gap-3 rounded-xl p-2 hover:bg-subtle">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-subtle text-lg font-medium text-muted">
                    {(c.name || "?").trim().charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-medium">{c.name || t("unknownChannel")}</h2>
                    <p className="text-xs text-muted">
                      {c.count} {t(c.count === 1 ? "videoOne" : "videosCount")}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
          {channels.length === 0 && <p className="mt-16 text-center text-sm text-muted">{t("noChannels")}</p>}
        </>
      )}
    </main>
  )
}

function ViewTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px border-b-2 pb-2 text-sm font-medium ${active ? "border-fg text-fg" : "border-transparent text-muted hover:text-fg"}`}
    >
      {children}
    </button>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1 text-sm ${active ? "bg-fg text-bg" : "bg-subtle text-fg/80 hover:text-fg"}`}
    >
      {children}
    </button>
  )
}
