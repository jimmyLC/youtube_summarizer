"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowRight, Loader2, Upload } from "lucide-react"
import { PRO_MONTHLY_HOURS, type Usage } from "@/lib/plan-types"
import { notebookRows, tagRows, type NotebookItem, type NotebookRow, type VideoItem } from "@/lib/video-types"
import { extractVideoId } from "@/lib/youtube"
import { Header, type HeaderUser } from "./header"
import { useI18n } from "./i18n"
import { NotebooksTab } from "./notebooks-tab"
import { isPending } from "./status"
import { TagsTab } from "./tags-tab"
import { UploadDialog } from "./upload-dialog"
import { VideoRow } from "./video-row"

type View = "all" | "notebooks" | "tags"

export function Home({ user, initial, initialNotebooks, shared, initialView }: {
  user: HeaderUser
  initial: VideoItem[]
  initialNotebooks: NotebookItem[]
  shared?: string
  initialView: View
}) {
  const { t, lang } = useI18n()
  const router = useRouter()
  const [videos, setVideos] = useState(initial)
  const [url, setUrl] = useState("")
  const [error, setError] = useState("")
  const [quotaHit, setQuotaHit] = useState(false)
  const [usage, setUsage] = useState<Usage | null>(null)
  const [busy, setBusy] = useState(false)
  const [notebooks, setNotebooks] = useState(initialNotebooks)
  const [view, setViewState] = useState<View>(initialView)
  const sharedHandled = useRef(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)

  const rows = useMemo(() => notebookRows(notebooks, videos), [notebooks, videos])
  const tags = useMemo(() => tagRows(videos), [videos])

  const setView = (next: View) => {
    setViewState(next)
    window.history.replaceState(null, "", next === "all" ? "/" : `/?view=${next}`)
  }

  // New YouTube videos create their notebook on the server; pick those up with the list
  const reload = async () => {
    const [v, n, u] = await Promise.all([fetch("/api/videos"), fetch("/api/notebooks"), fetch("/api/account")])
    if (v.ok) setVideos(await v.json())
    if (n.ok) setNotebooks(await n.json())
    if (u.ok) setUsage(await u.json())
  }

  const json = (method: string, body: unknown) => ({
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  /** Each returns an error message to show, or null when it worked. */
  const createNotebook = async (name: string) => {
    const res = await fetch("/api/notebooks", json("POST", { name }))
    if (!res.ok) return t("networkError")
    await reload()
    return null
  }
  const renameNotebook = async (id: string, name: string) => {
    const res = await fetch(`/api/notebooks/${id}`, json("PATCH", { name }))
    if (res.status === 409) return t("nameExists")
    if (!res.ok) return t("networkError")
    await reload()
    return null
  }
  const deleteNotebook = async (row: NotebookRow) => {
    if (!confirm(t("confirmDeleteNotebook").replace("{name}", row.name).replace("{n}", String(row.count)))) return
    await fetch(`/api/notebooks/${row.id}`, { method: "DELETE" })
    await reload()
  }
  const renameTag = async (name: string, to: string) => {
    const clean = to.replace(/^#/, "")
    if (tags.some((x) => x.name === clean && x.name !== name) && !confirm(t("confirmMergeTag").replace("{name}", clean))) return
    await fetch("/api/tags", json("PATCH", { name, to: clean }))
    await reload()
  }
  const deleteTag = async (name: string) => {
    if (!confirm(t("confirmDeleteTag").replace("{name}", name))) return
    await fetch("/api/tags", json("DELETE", { name }))
    await reload()
  }

  useEffect(() => {
    fetch("/api/account")
      .then((res) => (res.ok ? res.json() : null))
      .then((u) => u && setUsage(u))
      .catch(() => {})
  }, [])

  // Refresh while something is still being converted
  const pending = videos.some((v) => isPending(v.status))
  useEffect(() => {
    if (!pending) return
    const timer = setInterval(async () => {
      await reload()
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
    setQuotaHit(false)
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
      const code = (e as Error).message
      if (code === "QUOTA_FREE" || code === "QUOTA_MONTH") {
        setQuotaHit(true)
        setError(t(code === "QUOTA_MONTH" ? "quota.month" : "quota.free"))
      } else {
        setError(code === "INVALID_URL" ? t("invalidUrl") : t("networkError"))
      }
      setBusy(false)
    }
  }

  // Drop a file anywhere on the page
  useEffect(() => {
    const hasFile = (e: DragEvent) => e.dataTransfer?.types.includes("Files")
    const over = (e: DragEvent) => {
      if (!hasFile(e)) return
      e.preventDefault()
      setDragging(true)
    }
    const leave = (e: DragEvent) => {
      if (e.relatedTarget === null) setDragging(false)
    }
    const drop = (e: DragEvent) => {
      if (!hasFile(e)) return
      e.preventDefault()
      setDragging(false)
      const dropped = e.dataTransfer?.files[0]
      if (dropped) setFile(dropped)
    }
    window.addEventListener("dragover", over)
    window.addEventListener("dragleave", leave)
    window.addEventListener("drop", drop)
    return () => {
      window.removeEventListener("dragover", over)
      window.removeEventListener("dragleave", leave)
      window.removeEventListener("drop", drop)
    }
  }, [])

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
          type="button"
          onClick={() => fileInput.current?.click()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-subtle hover:text-fg"
          aria-label={t("upload")}
          title={t("upload")}
        >
          <Upload className="h-4 w-4" />
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="video/*,audio/*,.mkv,.m4a,.mp3,.wav,.aac,.flac"
          className="hidden"
          onChange={(e) => {
            const picked = e.target.files?.[0]
            e.target.value = ""
            if (picked) setFile(picked)
          }}
        />
        <button
          type="submit"
          disabled={busy || !url.trim()}
          className="flex h-10 items-center gap-1 rounded-xl bg-brand text-white hover:bg-brand/90 px-4 text-sm font-medium disabled:opacity-30"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          <span className="hidden sm:inline">{t("convert")}</span>
        </button>
      </form>
      {error && (
        <p className="mt-2 px-1 text-sm text-accent">
          {error}
          {quotaHit && (
            <>
              {" "}
              <Link href="/account" className="underline">
                {t("quota.link")}
              </Link>
            </>
          )}
        </p>
      )}
      {usage && usage.plan !== "unlimited" && !error && (
        <p className="mt-2 px-1 text-xs text-muted">
          <Link href="/account" className="hover:text-fg">
            {usage.plan === "free"
              ? t("usage.free").replace("{used}", String(usage.videosUsed)).replace("{limit}", String(usage.videosLimit))
              : t("usage.pro")
                  .replace("{used}", (usage.secondsUsed / 3600).toFixed(1))
                  .replace("{limit}", String(PRO_MONTHLY_HOURS))}
          </Link>
        </p>
      )}

      <div className="mt-8 flex gap-6 border-b border-line">
        <ViewTab active={view === "all"} onClick={() => setView("all")}>
          {t("tabAll")}
        </ViewTab>
        <ViewTab active={view === "notebooks"} onClick={() => setView("notebooks")}>
          {t("tabNotebooks")}
        </ViewTab>
        <ViewTab active={view === "tags"} onClick={() => setView("tags")}>
          {t("tabTags")}
        </ViewTab>
      </div>

      {view === "all" && (
        <>
          <ul className="mt-4">
            {videos.map((v) => (
              <li key={v.id}>
                <VideoRow video={v} />
              </li>
            ))}
          </ul>
          {videos.length === 0 && <p className="mt-16 text-center text-sm text-muted">{t("empty")}</p>}
        </>
      )}
      {view === "notebooks" && (
        <NotebooksTab rows={rows} onCreate={createNotebook} onRename={renameNotebook} onDelete={deleteNotebook} />
      )}
      {view === "tags" && <TagsTab rows={tags} onRename={renameTag} onDelete={deleteTag} />}

      {file && (
        <UploadDialog key={file.name + file.size} file={file} notebooks={notebooks.map((n) => n.name)} onClose={() => setFile(null)} />
      )}
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-bg/80 text-lg font-medium">
          <div className="rounded-3xl border-2 border-dashed border-fg/30 px-10 py-16">{t("uploadDrop")}</div>
        </div>
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
