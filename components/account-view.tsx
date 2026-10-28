"use client"

import Link from "next/link"
import { useState } from "react"
import { ArrowLeft } from "lucide-react"
import { PRO_MONTHLY_HOURS, type Usage } from "@/lib/plan-types"
import { authClient } from "@/lib/auth-client"
import { Header, type HeaderUser } from "./header"
import { useI18n } from "./i18n"

export const PRIVACY_URL = "https://jimmy-tools.com/yt-summarizer/privacy/"
export const TERMS_URL = "https://jimmy-tools.com/yt-summarizer/terms/"

/** Account and plan: usage, how to upgrade (payment is not connected yet), legal pages, delete account. */
export function AccountView({ user, usage }: { user: HeaderUser; usage: Usage }) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const remove = async () => {
    if (!confirm(t("account.deleteConfirm"))) return
    setBusy(true)
    setError("")
    try {
      const res = await fetch("/api/account", { method: "DELETE" })
      if (!res.ok) throw new Error()
      await authClient.signOut().catch(() => {})
      window.location.href = "/"
    } catch {
      setError(t("account.deleteFail"))
      setBusy(false)
    }
  }

  const used =
    usage.plan === "free"
      ? t("usage.free").replace("{used}", String(usage.videosUsed)).replace("{limit}", String(usage.videosLimit))
      : usage.plan === "pro"
        ? t("usage.pro")
            .replace("{used}", (usage.secondsUsed / 3600).toFixed(1))
            .replace("{limit}", String(PRO_MONTHLY_HOURS))
        : ""
  const fraction =
    usage.plan === "free" && usage.videosLimit
      ? usage.videosUsed / usage.videosLimit
      : usage.plan === "pro" && usage.secondsLimit
        ? usage.secondsUsed / usage.secondsLimit
        : 0

  return (
    <main className="mx-auto max-w-2xl px-4 pb-20 pt-[env(safe-area-inset-top)]">
      <Header user={user} />
      <Link href="/" className="-ml-1 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" />
        {t("back")}
      </Link>

      <h1 className="mt-4 text-xl font-semibold tracking-tight sm:text-2xl">{t("account")}</h1>
      <p className="mt-1 text-sm text-muted">{user.email}</p>

      <section className="mt-8 rounded-2xl bg-subtle p-5">
        <div className="text-sm text-muted">{t("account.plan")}</div>
        <div className="mt-1 text-lg font-semibold">{t(`plan.${usage.plan}`)}</div>
        {used && (
          <>
            <p className="mt-3 text-sm">{used}</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-fg" style={{ width: `${Math.min(100, Math.round(fraction * 100))}%` }} />
            </div>
          </>
        )}
      </section>

      {usage.plan === "free" && (
        <section className="mt-4 rounded-2xl border border-line p-5">
          <h2 className="font-semibold">{t("account.upgradeTitle")}</h2>
          <p className="mt-1 text-sm text-fg/80">{t("account.upgradeBody")}</p>
          <p className="mt-3 text-sm text-muted">{t("account.paySoon")}</p>
        </section>
      )}

      <section className="mt-8 flex gap-5 text-sm">
        <a href={PRIVACY_URL} target="_blank" rel="noreferrer" className="text-muted hover:text-fg">
          {t("account.privacy")}
        </a>
        <a href={TERMS_URL} target="_blank" rel="noreferrer" className="text-muted hover:text-fg">
          {t("account.terms")}
        </a>
      </section>

      <section className="mt-12 border-t border-line pt-6">
        <h2 className="text-sm font-medium">{t("account.delete")}</h2>
        <p className="mt-1 text-sm text-muted">{t("account.deleteHint")}</p>
        <button
          onClick={remove}
          disabled={busy}
          className="mt-3 rounded-lg border border-line px-4 py-2 text-sm text-accent hover:bg-subtle disabled:opacity-50"
        >
          {t("account.delete")}
        </button>
        {error && <p className="mt-2 text-sm text-accent">{error}</p>}
      </section>
    </main>
  )
}
