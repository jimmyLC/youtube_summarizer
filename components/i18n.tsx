"use client"

import { createContext, useContext, useState } from "react"
import { LANG_COOKIE, translator, type Lang, type T } from "@/lib/i18n"

const Ctx = createContext<{ lang: Lang; t: T; setLang: (l: Lang) => void } | null>(null)

/** The initial language comes from a cookie so the server render already matches. */
export function I18nProvider({ initial, children }: { initial: Lang; children: React.ReactNode }) {
  const [lang, setLangState] = useState(initial)
  const setLang = (l: Lang) => {
    document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`
    document.documentElement.lang = l
    setLangState(l)
  }
  return <Ctx.Provider value={{ lang, t: translator(lang), setLang }}>{children}</Ctx.Provider>
}

export function useI18n() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useI18n outside I18nProvider")
  return ctx
}

export function LangToggle() {
  const { lang, setLang } = useI18n()
  return (
    <button
      onClick={() => setLang(lang === "en" ? "zh-TW" : "en")}
      className="rounded-full px-2.5 py-1 text-xs font-medium text-muted hover:bg-subtle hover:text-fg"
      aria-label="Switch language"
    >
      {lang === "en" ? "中文" : "EN"}
    </button>
  )
}
