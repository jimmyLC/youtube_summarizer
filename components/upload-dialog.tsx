"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { cancelExtraction, ExtractError, extractAudio, probeDuration } from "@/lib/extract-audio"
import {
  AUDIO_BYTES_PER_SECOND,
  MAX_AUDIO_BYTES,
  MAX_FILE_BYTES,
  MAX_SECONDS,
  UPLOAD_EXTENSIONS,
  fileBaseName,
} from "@/lib/upload-limits"
import { useI18n } from "./i18n"

type Phase = "form" | "loading" | "extracting" | "sending"

/** Why a file cannot be used, as a translation key; null when it is fine. */
export function fileProblem(file: File): "upload.badType" | "upload.tooBig" | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
  const media = file.type.startsWith("video/") || file.type.startsWith("audio/") || UPLOAD_EXTENSIONS.includes(ext)
  if (!media) return "upload.badType"
  if (file.size > MAX_FILE_BYTES) return "upload.tooBig"
  return null
}

/** Asks for a title and notebook, extracts the audio in the browser, uploads it, then opens the new video. */
export function UploadDialog({ file, notebooks, onClose }: { file: File; notebooks: string[]; onClose: () => void }) {
  const { t, lang } = useI18n()
  const router = useRouter()
  const defaultTitle = fileBaseName(file.name)
  const [title, setTitle] = useState(defaultTitle)
  const [notebook, setNotebook] = useState("")
  const [phase, setPhase] = useState<Phase>("form")
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(fileProblem(file) ? t(fileProblem(file)!) : "")
  const xhr = useRef<XMLHttpRequest | null>(null)
  const cancelled = useRef(false)
  const working = phase !== "form"

  // Leaving the page would throw the work away
  useEffect(() => {
    if (!working) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [working])

  const cancel = () => {
    cancelled.current = true
    xhr.current?.abort()
    if (phase === "extracting" || phase === "loading") cancelExtraction()
    onClose()
  }

  const fail = (message: string) => {
    if (cancelled.current) return
    setError(message)
    setPhase("form")
  }

  const start = async () => {
    setError("")
    const channel = notebook.trim() || t("uploadDefaultNotebook")
    const finalTitle = title.trim() || defaultTitle
    const query = new URLSearchParams({
      fileName: file.name,
      fileSize: String(file.size),
      title: finalTitle,
      titleEdited: finalTitle !== defaultTitle ? "1" : "0",
      channel,
      lang,
    })

    // Same file as an earlier upload?
    try {
      const res = await fetch(`/api/uploads?${new URLSearchParams({ fileName: file.name, fileSize: String(file.size) })}`)
      const existing = res.ok ? ((await res.json()) as { id: string; title: string } | null) : null
      if (existing && !confirm(t("upload.duplicate").replace("{title}", existing.title))) {
        router.push(`/v/${existing.id}`)
        return
      }
    } catch {
      // the check is only a convenience
    }

    try {
      setPhase("loading")
      setProgress(0)
      const seconds = await probeDuration(file)
      if (seconds && seconds > MAX_SECONDS) return fail(t("upload.tooLong"))

      const audio = await extractAudio(file, (p) => {
        setPhase("extracting")
        setProgress(p)
      })
      if (cancelled.current) return
      if (audio.size > MAX_AUDIO_BYTES || audio.size / AUDIO_BYTES_PER_SECOND > MAX_SECONDS * 1.02) {
        return fail(t("upload.tooLong"))
      }

      setPhase("sending")
      setProgress(0)
      const id = await send(`/api/uploads?${query}`, audio)
      router.push(`/v/${id}`)
      router.refresh()
    } catch (e) {
      if (e instanceof ExtractError) return fail(t("upload.extractFail"))
      fail(t("upload.sendFail"))
    }
  }

  const send = (url: string, body: Blob) =>
    new Promise<string>((resolve, reject) => {
      const req = new XMLHttpRequest()
      xhr.current = req
      req.open("POST", url)
      req.setRequestHeader("Content-Type", "audio/mpeg")
      req.upload.onprogress = (e) => e.lengthComputable && setProgress(e.loaded / e.total)
      req.onload = () => {
        try {
          const data = JSON.parse(req.responseText) as { id?: string }
          if (req.status === 200 && data.id) resolve(data.id)
          else reject(new Error(String(req.status)))
        } catch {
          reject(new Error("bad response"))
        }
      }
      req.onerror = () => reject(new Error("network"))
      req.send(body)
    })

  const percent = Math.round(progress * 100)
  const blocked = Boolean(fileProblem(file))

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-fg/30 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-2xl border border-line bg-bg p-5 shadow-xl">
        <p className="truncate text-sm text-muted">{file.name}</p>

        {working ? (
          <div className="mt-5">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Loader2 className="h-4 w-4 animate-spin" />
              {phase === "loading" && t("upload.loading")}
              {phase === "extracting" && `${t("upload.extracting")} ${percent}%`}
              {phase === "sending" && `${t("upload.sending")} ${percent}%`}
            </p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-subtle">
              <div
                className="h-full rounded-full bg-fg transition-[width]"
                style={{ width: `${phase === "loading" ? 0 : percent}%` }}
              />
            </div>
            <p className="mt-3 text-xs text-muted">{t("upload.stay")}</p>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="text-xs text-muted">{t("uploadTitleLabel")}</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded-xl border border-line bg-transparent px-3 py-2 text-base outline-none focus:border-fg/40"
              />
            </label>
            <label className="block">
              <span className="text-xs text-muted">{t("uploadNotebook")}</span>
              <input
                value={notebook}
                list="upload-notebooks"
                onChange={(e) => setNotebook(e.target.value)}
                placeholder={t("uploadDefaultNotebook")}
                className="mt-1 w-full rounded-xl border border-line bg-transparent px-3 py-2 text-base outline-none placeholder:text-muted focus:border-fg/40"
              />
              <datalist id="upload-notebooks">
                {notebooks.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </label>
          </div>
        )}

        {error && <p className="mt-4 text-sm text-accent">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={cancel} className="rounded-xl px-4 py-2 text-sm text-muted hover:text-fg">
            {t("uploadCancel")}
          </button>
          {!working && (
            <button
              onClick={start}
              disabled={blocked}
              className="rounded-xl bg-fg px-4 py-2 text-sm font-medium text-bg disabled:opacity-30"
            >
              {t("uploadStart")}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
