"use client"

import Link from "next/link"
import { useState } from "react"
import { ArrowLeft } from "lucide-react"
import { timeAgo } from "@/lib/i18n"
import { Header, type HeaderUser } from "./header"
import { useI18n } from "./i18n"

type Status = { configured: boolean; updatedAt: string | null }

/** Settings: the YouTube login used to open members-only videos. */
export function SettingsView({ user, initial }: { user: HeaderUser; initial: Status }) {
  const { t, lang } = useI18n()
  const [status, setStatus] = useState(initial)
  const [text, setText] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    setError("")
    try {
      const res = await fetch("/api/settings/cookies", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      })
      if (res.ok) {
        setStatus(await res.json())
        setText("")
      } else {
        setError(res.status === 400 ? t("cookiesInvalid") : t("networkError"))
      }
    } catch {
      setError(t("networkError"))
    }
    setBusy(false)
  }

  const remove = async () => {
    if (!confirm(t("confirmRemoveCookies"))) return
    const res = await fetch("/api/settings/cookies", { method: "DELETE" })
    if (res.ok) setStatus(await res.json())
  }

  const steps = [t("cookiesStep1"), t("cookiesStep2"), t("cookiesStep3"), t("cookiesStep4"), t("cookiesStep5")]

  return (
    <main className="mx-auto max-w-2xl px-4 pb-20 pt-[env(safe-area-inset-top)]">
      <Header user={user} />

      <Link href="/" className="-ml-1 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" />
        {t("back")}
      </Link>

      <h1 className="mt-4 text-xl font-semibold tracking-tight sm:text-2xl">{t("memberTitle")}</h1>
      <p className="mt-2 leading-relaxed text-fg/75">{t("memberIntro")}</p>

      <div className="mt-6 rounded-2xl bg-subtle p-4 text-sm">
        {status.configured ? (
          <div className="flex items-center justify-between gap-3">
            <span>
              {t("cookiesSaved")}
              {status.updatedAt && <span className="text-muted"> · {timeAgo(status.updatedAt, lang)}</span>}
            </span>
            <button onClick={remove} className="shrink-0 text-muted hover:text-accent">
              {t("cookiesRemove")}
            </button>
          </div>
        ) : (
          <span className="text-muted">{t("cookiesNone")}</span>
        )}
      </div>

      <h2 className="mt-8 text-sm font-medium">{t("cookiesHow")}</h2>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-fg/75">
        {steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>

      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setError("")
        }}
        placeholder={t("cookiesPlaceholder")}
        spellCheck={false}
        rows={6}
        className="mt-5 w-full rounded-xl border border-line bg-transparent p-3 font-mono text-xs outline-none placeholder:text-muted focus:border-fg/40"
      />
      {error && <p className="mt-2 text-sm text-accent">{error}</p>}
      <button
        onClick={save}
        disabled={busy || !text.trim()}
        className="mt-3 rounded-xl bg-fg px-5 py-2 text-sm font-medium text-bg disabled:opacity-30"
      >
        {t("cookiesSave")}
      </button>
    </main>
  )
}
