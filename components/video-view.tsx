"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, BookOpen, Check, ChevronDown, Copy, ExternalLink, FileAudio, Pencil, Play, Plus, X } from "lucide-react"
import type { NotebookItem, VideoDetail } from "@/lib/video-types"
import { formatTime, watchUrl } from "@/lib/youtube"
import { AudioPlayer, type PlayerHandle } from "./audio-player"
import { Header, type HeaderUser } from "./header"
import { useI18n } from "./i18n"
import { NotebookPicker } from "./notebook-picker"
import { StatusLine, isPending } from "./status"

type Tab = "points" | "transcript"

export function VideoView({ user, initial, allTags, notebooks: initialNotebooks }: {
  user: HeaderUser
  initial: VideoDetail
  allTags: string[]
  notebooks: NotebookItem[]
}) {
  const { t, lang } = useI18n()
  const router = useRouter()
  const [video, setVideo] = useState(initial)
  const [tab, setTab] = useState<Tab>("points")
  const [copied, setCopied] = useState(false)
  const [notebooks, setNotebooks] = useState(initialNotebooks)
  const player = useRef<PlayerHandle>(null)
  const [now, setNow] = useState(0)
  // Transcript editing: one text per paragraph, kept in the browser until "save"
  const [draft, setDraft] = useState<string[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState("")
  const [staleSummary, setStaleSummary] = useState(false)

  const pending = isPending(video.status)
  const upload = video.origin === "upload"
  const onTranscript = tab === "transcript" || !video.summary
  useEffect(() => {
    if (!pending) return
    const timer = setInterval(async () => {
      const res = await fetch(`/api/videos/${video.id}`)
      if (res.ok) setVideo(await res.json())
    }, 3000)
    return () => clearInterval(timer)
  }, [pending, video.id])

  const paragraphs = useMemo(() => toParagraphs(video.transcript ?? []), [video.transcript])
  const editing = draft !== null
  const dirty = draft !== null && draft.some((text, i) => text !== paragraphs[i]?.text)
  const draftKey = `yt-transcript-draft:${video.id}`
  const hasAudio = video.hasAudio
  const seek = hasAudio ? (time: number) => player.current?.seek(time, true) : undefined
  // The paragraph being played (the last one that has started)
  const active = hasAudio && now > 0 ? paragraphs.findLastIndex((p) => p.time <= now + 0.3) : -1

  // Bring back edits that were not saved (closed tab, crash), if they still fit this transcript
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey) ?? "null") as string[] | null
      if (Array.isArray(saved) && saved.length === paragraphs.length && saved.every((x) => typeof x === "string")) {
        setDraft(saved)
        setTab("transcript")
        setNotice(t("tr.restored"))
      }
    } catch {
      // storage unavailable: nothing to restore
    }
  }, [])

  useEffect(() => {
    try {
      if (draft && dirty) localStorage.setItem(draftKey, JSON.stringify(draft))
      else localStorage.removeItem(draftKey)
    } catch {
      // storage unavailable: the draft just lives in memory
    }
  }, [draft, dirty, draftKey])

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  const startEdit = () => {
    setNotice("")
    setStaleSummary(false)
    setDraft(paragraphs.map((p) => p.text))
  }

  const cancelEdit = () => {
    if (dirty && !confirm(t("tr.cancelConfirm"))) return
    setNotice("")
    setDraft(null)
  }

  const saveEdit = async () => {
    if (!draft || saving) return
    setSaving(true)
    setNotice("")
    try {
      const lines = paragraphs.map((p, i) => [p.time, draft[i]] as [number, string])
      const res = await fetch(`/api/videos/${video.id}/transcript`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines }),
      })
      if (!res.ok) throw new Error()
      const saved = (await res.json()) as { lines: [number, string][] }
      if (dirty && video.summary) setStaleSummary(true)
      setVideo({ ...video, transcript: saved.lines })
      setDraft(null)
    } catch {
      setNotice(t("tr.saveFail"))
    } finally {
      setSaving(false)
    }
  }

  const resummarize = async () => {
    if (editing || !confirm(t("tr.resummarizeConfirm"))) return
    const res = await fetch(`/api/videos/${video.id}/resummarize`, { method: "POST" })
    if (!res.ok) return
    setStaleSummary(false)
    setVideo({ ...video, status: "summarizing", error: null })
    setTab("points")
  }

  const retry = async (newLang?: string) => {
    await fetch(`/api/videos/${video.id}/retry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lang: newLang }),
    })
    setVideo({ ...video, status: "queued", error: null, summary: null })
    setTab("points")
  }

  const moveTo = async (name: string) => {
    const res = await fetch(`/api/videos/${video.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notebook: name }),
    })
    if (!res.ok) return
    const updated = (await res.json()) as VideoDetail
    setVideo(updated)
    if (updated.notebookId && !notebooks.some((n) => n.id === updated.notebookId)) {
      setNotebooks([...notebooks, { id: updated.notebookId, name: updated.notebook, createdAt: new Date().toISOString() }])
    }
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
            ...(upload ? [] : ["", watchUrl(video.youtubeId)]),
          ].join("\n")
        : paragraphs.map((p) => `[${formatTime(p.time)}] ${p.text}`).join("\n\n")
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <main className={`mx-auto max-w-2xl px-4 pt-[env(safe-area-inset-top)] ${hasAudio ? "pb-32" : "pb-20"}`}>
      <Header user={user} />

      <Link href="/" className="-ml-1 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" />
        {t("back")}
      </Link>

      {upload ? (
        <TitleEditor video={video} onChange={setVideo} />
      ) : (
        <h1 className="mt-4 text-xl font-semibold leading-snug tracking-tight sm:text-2xl">{video.title}</h1>
      )}
      <div className="mt-2 flex items-center gap-3 text-sm text-muted">
        <NotebookPicker notebooks={notebooks} current={video.notebookId} onPick={moveTo} className="min-w-0">
          <span className="inline-flex max-w-full items-center gap-1 hover:text-fg">
            <BookOpen className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{video.notebook || t("uncategorized")}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          </span>
        </NotebookPicker>
        {upload ? (
          <span className="inline-flex shrink-0 items-center gap-1">
            <FileAudio className="h-3.5 w-3.5" />
            {t("uploadedFile")}
          </span>
        ) : (
          <a
            href={watchUrl(video.youtubeId)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 hover:text-fg"
          >
            {t("openYouTube")}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
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
                <TabButton active={onTranscript} onClick={() => setTab("transcript")}>
                  {t("transcript")}
                </TabButton>
              )}
            </div>
            <div className="flex items-center gap-4 pb-2 text-sm">
              {editing ? (
                <>
                  <button onClick={cancelEdit} disabled={saving} className="text-muted hover:text-fg disabled:opacity-40">
                    {t("tr.cancel")}
                  </button>
                  <button
                    onClick={saveEdit}
                    disabled={saving}
                    className="rounded-lg bg-fg px-3 py-1 font-medium text-bg disabled:opacity-40"
                  >
                    {saving ? t("tr.saving") : t("tr.save")}
                  </button>
                </>
              ) : (
                <>
                  {onTranscript && !pending && video.transcript && (
                    <button onClick={startEdit} className="flex items-center gap-1 text-muted hover:text-fg">
                      <Pencil className="h-4 w-4" />
                      {t("tr.edit")}
                    </button>
                  )}
                  <button onClick={copy} className="flex items-center gap-1 text-muted hover:text-fg">
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied ? t("copied") : t("copy")}
                  </button>
                </>
              )}
            </div>
          </div>
          {notice && <p className="mt-3 text-sm text-muted">{notice}</p>}
          {staleSummary && !editing && !pending && (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-subtle px-4 py-3 text-sm">
              <span>{t("tr.saved")}</span>
              <span className="flex shrink-0 items-center gap-3">
                <button onClick={() => setStaleSummary(false)} className="text-muted hover:text-fg">
                  {t("tr.dismiss")}
                </button>
                <button onClick={resummarize} className="rounded-lg bg-fg px-3 py-1 font-medium text-bg">
                  {t("tr.resummarize")}
                </button>
              </span>
            </div>
          )}

          {tab === "points" && video.summary ? (
            <section className="mt-6">
              {video.summary.tldr && <p className="text-[17px] leading-relaxed">{video.summary.tldr}</p>}
              <ol className="mt-6 space-y-5">
                {video.summary.points.map((p, i) => (
                  <li key={i} className="flex gap-3">
                    <TimeLink id={upload ? null : video.youtubeId} time={p.time} onSeek={seek} />
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
                <div
                  key={i}
                  onClick={() => {
                    if (!seek || editing || window.getSelection()?.toString()) return
                    seek(p.time)
                  }}
                  className={`-mx-2 flex gap-3 rounded-lg px-2 py-1 ${active === i ? "bg-subtle" : ""} ${seek && !editing ? "cursor-pointer" : ""}`}
                >
                  <TimeLink id={upload ? null : video.youtubeId} time={p.time} onSeek={seek} />
                  {draft ? (
                    <div className="flex min-w-0 flex-1 items-start gap-2">
                      <AutoTextarea
                        value={draft[i] ?? ""}
                        onChange={(text) => setDraft(draft.map((x, j) => (j === i ? text : x)))}
                      />
                      {seek && (
                        <button
                          onClick={() => seek(p.time)}
                          className="mt-1 shrink-0 rounded-full p-1.5 text-muted hover:bg-subtle hover:text-fg"
                          aria-label={t("tr.playPart")}
                          title={t("tr.playPart")}
                        >
                          <Play className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="min-w-0 leading-relaxed text-fg/85">{p.text}</p>
                  )}
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
          <div className="flex items-center gap-4">
            {video.transcript && (video.status === "done" || video.status === "error") && (
              <button
                onClick={resummarize}
                disabled={editing}
                title={editing ? t("tr.resummarizeLocked") : undefined}
                className="text-muted hover:text-fg disabled:opacity-40 disabled:hover:text-muted"
              >
                {t("tr.resummarize")}
              </button>
            )}
            {video.status === "done" && video.lang !== lang && (
              <button onClick={() => retry(lang)} className="text-muted hover:text-fg">
                {t("regenerate")}
              </button>
            )}
          </div>
        </div>
      )}

      {hasAudio && <AudioPlayer ref={player} src={`/api/videos/${video.id}/audio`} onTime={setNow} />}
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

function TimeLink({ id, time, onSeek }: { id: string | null; time: number; onSeek?: (time: number) => void }) {
  // With a recording on the server the time jumps in the player instead of leaving for YouTube
  if (onSeek) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation()
          onSeek(time)
        }}
        className="w-14 shrink-0 pt-0.5 text-right font-mono text-xs tabular-nums text-accent hover:underline"
      >
        {formatTime(time)}
      </button>
    )
  }
  // A local recording without audio has no page to jump to: show the time only
  if (!id) {
    return <span className="w-14 shrink-0 pt-0.5 text-right font-mono text-xs tabular-nums text-muted">{formatTime(time)}</span>
  }
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

/** The title of an upload; click to rename. A name typed here is never replaced by the AI title. */
function TitleEditor({ video, onChange }: { video: VideoDetail; onChange: (v: VideoDetail) => void }) {
  const { t } = useI18n()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(video.title)

  const save = async () => {
    setEditing(false)
    const title = value.trim()
    if (!title || title === video.title) return setValue(video.title)
    onChange({ ...video, title })
    const res = await fetch(`/api/videos/${video.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    })
    if (res.ok) onChange(await res.json())
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) save()
          if (e.key === "Escape") {
            setValue(video.title)
            setEditing(false)
          }
        }}
        className="mt-4 w-full rounded-lg border border-line bg-transparent px-2 py-1 text-xl font-semibold tracking-tight outline-none focus:border-fg/40 sm:text-2xl"
      />
    )
  }
  return (
    <h1 className="group mt-4 flex items-start gap-2 text-xl font-semibold leading-snug tracking-tight sm:text-2xl">
      <span className="min-w-0">{video.title}</span>
      <button
        onClick={() => {
          setValue(video.title)
          setEditing(true)
        }}
        className="mt-1.5 shrink-0 rounded p-1 text-muted hover:text-fg"
        aria-label={t("editTitle")}
        title={t("editTitle")}
      >
        <Pencil className="h-4 w-4" />
      </button>
    </h1>
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

/** A textarea that grows with its text. */
function AutoTextarea({ value, onChange }: { value: string; onChange: (text: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      value={value}
      rows={1}
      onChange={(e) => onChange(e.target.value)}
      className="min-w-0 flex-1 resize-none rounded-lg border border-line bg-transparent px-2 py-1 leading-relaxed text-fg/85 outline-none focus:border-fg/40"
    />
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
