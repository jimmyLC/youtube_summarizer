"use client"

import { useEffect, useRef, useState } from "react"
import { Check } from "lucide-react"
import type { NotebookItem } from "@/lib/video-types"
import { useI18n } from "./i18n"

/**
 * A button that opens a list of notebooks. Picking one calls onPick with its name; the
 * built-in 未分類 calls onPick(""); typing a new name and pressing Enter creates a notebook.
 */
export function NotebookPicker({ notebooks, current, onPick, up = false, children, className = "" }: {
  notebooks: NotebookItem[]
  /** id of the notebook the video is in now; null = 未分類 */
  current?: string | null
  onPick: (name: string) => void
  /** open above the button (for a bar at the bottom of the screen) */
  up?: boolean
  children: React.ReactNode
  className?: string
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState("")
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [open])

  const pick = (name: string) => {
    setOpen(false)
    setValue("")
    onPick(name)
  }

  const item = "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-subtle"

  return (
    <div ref={root} className={`relative ${className}`}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}>
        {children}
      </button>
      {open && (
        <div
          className={`absolute z-30 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-bg p-1 shadow-lg ${up ? "bottom-full right-0 mb-2" : "left-0 top-full mt-2"}`}
        >
          <div className="max-h-64 overflow-y-auto">
            {notebooks.map((n) => (
              <button key={n.id} type="button" onClick={() => pick(n.name)} className={item}>
                <span className="truncate">{n.name}</span>
                {current === n.id && <Check className="h-4 w-4 shrink-0" />}
              </button>
            ))}
            <button type="button" onClick={() => pick("")} className={`${item} text-muted`}>
              <span>{t("uncategorized")}</span>
              {current === null && <Check className="h-4 w-4 shrink-0" />}
            </button>
          </div>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing && value.trim()) pick(value.trim())
              if (e.key === "Escape") setOpen(false)
            }}
            placeholder={t("newNotebookHint")}
            className="mt-1 w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-fg/40"
          />
        </div>
      )}
    </div>
  )
}
