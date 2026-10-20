"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, Check, Copy, ExternalLink, Plus, X } from "lucide-react"
import type { VideoDetail } from "@/lib/video-types"
import { formatTime, watchUrl } from "@/lib/youtube"
import { Header, type HeaderUser } from "./header"
import { useI18n } from "./i18n"
import { StatusLine, isPending } from "./status"

type Tab = "points" | "transcript"

export function VideoView({ user, initial, allTags }: { user: HeaderUser; initial: VideoDetail; allTags: string[] }) {
  const { t, lang } = useI18n()
  const router = useRouter()
  const [video, setVideo] = useState(initial)
  const [tab, setTab] = useState<Tab>("points")
  const [copied, setCopied] = useState(false)

  const pending = isPending(video.status)
  useEffect(() => {
    if (!pending) return
    const timer = setInterval(async () => {
      const res = await fetch(`/api/videos/${video.id}`)
      if (res.ok) setVideo(await res.json())
    }, 3000)
    return () => clearInterval(timer)
  }, [pending, video.id])

  const paragraphs = useMemo(() => toParagraphs(video.transcript ?? []), [video.transcript])

  const retry = async (newLang?: string) => {
    await fetch(`/api/videos/${video.id}/retry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lang: newLang }),
    })
    setVideo({ ...video, status: "queued", error: null, summary: null })
    setTab("points")
  }

  const remove = async () => {
    if (!confirm(t("confirmDelete"))) return
    await fetch(`/api/videos/${video.id}`, { method: "DELETE" })
    router.push("/")
    router.refresh()
  }

  const copy = async () => {
    const text =
      tab === "points" && video.summary
        ? [
            video.title,
            "",
            video.summary.tldr,
            "",
            ...video.summary.points.map((p) => `[${formatTime(p.time)}] ${p.title}\n${p.detail}`),
            "",
            watchUrl(video.youtubeId),
          ].join("\n")
        : paragraphs.map((p) => `[${formatTime(p.time)}] ${p.text}`).join("\n\n")
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pb-20 pt-[env(safe-area-inset-top)]">
      <Header user={user} />

      <Link href="/" className="-ml-1 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" />
        {t("back")}
      </Link>

      <h1 className="mt-4 text-xl font-semibold leading-snug tracking-tight sm:text-2xl">{video.title}</h1>
      <div className="mt-2 flex items-center gap-3 text-sm text-muted">
        {video.channel && (
          <Link href={`/c/${encodeURIComponent(video.channel)}`} className="truncate hover:text-fg hover:underline">
            {video.channel}
          </Link>
        )}
        <a
          href={watchUrl(video.youtubeId)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1 hover:text-fg"
        >
          {t("openYouTube")}
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      <TagEditor video={video} allTags={allTags} onChange={setVideo} />

      {pending && (
        <div className="mt-10 rounded-2xl bg-subtle p-6">
          <StatusLine status={video.status} error={null} className="text-sm font-medium !text-fg" />
          <p className="mt-2 text-sm text-muted">{t("status.hint")}</p>
        </div>
      )}

      {video.status === "error" && (
        <div className="mt-10 flex items-center justify-between rounded-2xl bg-subtle p-5">
          <StatusLine status="error" error={video.error} className="text-sm font-medium" />
          <button onClick={() => retry()} className="rounded-lg bg-fg px-4 py-2 text-sm font-medium text-bg">
            {t("retry")}
          </button>
        </div>
      )}

      {(video.summary || video.transcript) && (
        <>
          <div className="mt-8 flex items-center justify-between border-b border-line">
            <div className="flex gap-6">
              {video.summary && <TabButton active={tab === "points"} onClick={() => setTab("points")}>{t("keyPoints")}</TabButton>}
              {video.transcript && (
                <TabButton active={tab === "transcript" || !video.summary} onClick={() => setTab("transcript")}>
                  {t("transcript")}
                </TabButton>
              )}
            </div>
            <button onClick={copy} className="flex items-center gap-1 pb-2 text-sm text-muted hover:text-fg">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? t("copied") : t("copy")}
            </button>
          </div>

          {tab === "points" && video.summary ? (
            <section className="mt-6">
              {video.summary.tldr && <p className="text-[17px] leading-relaxed">{video.summary.tldr}</p>}
              <ol className="mt-6 space-y-5">
                {video.summary.points.map((p, i) => (
                  <li key={i} className="flex gap-3">
                    <TimeLink id={video.youtubeId} time={p.time} />
                    <div className="min-w-0">
                      <h3 className="font-medium leading-snug">{p.title}</h3>
                      <p className="mt-1 leading-relaxed text-fg/75">{p.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ) : (
            <section className="mt-6 space-y-4">
              {paragraphs.map((p, i) => (
                <div key={i} className="flex gap-3">
                  <TimeLink id={video.youtubeId} time={p.time} />
                  <p className="min-w-0 leading-relaxed text-fg/85">{p.text}</p>
                </div>
              ))}
            </section>
          )}
        </>
      )}

      {!pending && (
        <div className="mt-16 flex items-center justify-between border-t border-line pt-4 text-sm">
          <button onClick={remove} className="text-muted hover:text-accent">
            {t("delete")}
          </button>
          {video.status === "done" && video.lang !== lang && (
            <button onClick={() => retry(lang)} className="text-muted hover:text-fg">
              {t("regenerate")}
            </button>
          )}
        </div>
      )}
    </main>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px border-b-2 pb-2 text-sm font-medium ${active ? "border-fg text-fg" : "border-transparent text-muted hover:text-fg"}`}
    >
      {children}
    </button>
  )
}

function TimeLink({ id, time }: { id: string; time: number }) {
  return (
    <a
      href={watchUrl(id, time)}
      target="_blank"
      rel="noreferrer"
      className="w-14 shrink-0 pt-0.5 text-right font-mono text-xs tabular-nums text-accent hover:underline"
    >
      {formatTime(time)}
    </a>
  )
}

function TagEditor({
  video,
  allTags,
  onChange,
}: {
  video: VideoDetail
  allTags: string[]
  onChange: (v: VideoDetail) => void
}) {
  const { t } = useI18n()
  const [adding, setAdding] = useState(false)
  const [value, setValue] = useState("")

  const save = async (tags: string[]) => {
    onChange({ ...video, tags })
    const res = await fetch(`/api/videos/${video.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags }),
    })
    if (res.ok) onChange(await res.json())
  }

  const add = () => {
    const name = value.trim().replace(/^#/, "")
    setValue("")
    setAdding(false)
    if (name && !video.tags.includes(name)) save([...video.tags, name])
  }

  const suggestions = allTags.filter((tag) => !video.tags.includes(tag))

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {video.tags.map((tag) => (
        <span key={tag} className="group inline-flex items-center gap-1 rounded-full bg-subtle py-1 pl-3 pr-1.5 text-sm">
          {tag}
          <button
            onClick={() => save(video.tags.filter((x) => x !== tag))}
            className="rounded-full p-0.5 text-muted hover:bg-line hover:text-fg"
            aria-label={`Remove ${tag}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {adding ? (
        <>
          <input
            autoFocus
            value={value}
            list="tag-suggestions"
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) add()
              if (e.key === "Escape") setAdding(false)
            }}
            onBlur={add}
            className="w-28 rounded-full border border-line bg-transparent px-3 py-1 text-sm outline-none focus:border-fg/40"
          />
          <datalist id="tag-suggestions">
            {suggestions.map((tag) => (
              <option key={tag} value={tag} />
            ))}
          </datalist>
        </>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-line px-3 py-1 text-sm text-muted hover:text-fg"
        >
          <Plus className="h-3 w-3" />
          {t("addTag")}
        </button>
      )}
    </div>
  )
}

/** Merges transcript lines into ~45 s paragraphs; CJK text is joined without spaces. */
function toParagraphs(lines: [number, string][]): { time: number; text: string }[] {
  const out: { time: number; text: string; parts: string[] }[] = []
  for (const [time, text] of lines) {
    const last = out[out.length - 1]
    if (!last || time - last.time >= 45) out.push({ time, text: "", parts: [text] })
    else last.parts.push(text)
  }
  return out.map(({ time, parts }) => {
    const cjk = /[㐀-鿿]/.test(parts.join(""))
    return { time, text: parts.join(cjk ? "，" : " ").replace(/([。！？，、])，/g, "$1") }
  })
}
