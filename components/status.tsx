"use client"

import { Loader2 } from "lucide-react"
import { useI18n } from "./i18n"

export const isPending = (status: string) => ["queued", "transcribing", "summarizing"].includes(status)

/** "產生摘要中…" with a spinner, or the error in red. */
export function StatusLine({ status, error, className = "" }: { status: string; error: string | null; className?: string }) {
  const { t } = useI18n()
  if (status === "error") {
    const key = `error.${error}` as Parameters<typeof t>[0]
    const text = t(key) === key ? t("error.default") : t(key)
    return <p className={`text-accent ${className}`}>{text}</p>
  }
  return (
    <p className={`flex items-center gap-1.5 text-muted ${className}`}>
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      {t(`status.${status}` as Parameters<typeof t>[0])}
    </p>
  )
}
