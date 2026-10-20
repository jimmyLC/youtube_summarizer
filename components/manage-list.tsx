"use client"

import { useState } from "react"
import { Check, Pencil, Plus, Trash2, X } from "lucide-react"
import { useI18n } from "./i18n"

/** Small text field used for naming and renaming: Enter saves, Escape cancels. */
export function NameInput({ initial = "", placeholder, onSave, onCancel }: {
  initial?: string
  placeholder: string
  onSave: (name: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(initial)
  const save = () => (value.trim() ? onSave(value.trim()) : onCancel())
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <input
        autoFocus
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) save()
          if (e.key === "Escape") onCancel()
        }}
        onFocus={(e) => e.target.select()}
        className="min-w-0 flex-1 rounded-lg border border-line bg-transparent px-3 py-1.5 text-base outline-none placeholder:text-muted focus:border-fg/40"
      />
      <button onClick={save} className="rounded-lg p-2 text-muted hover:bg-subtle hover:text-fg" aria-label="OK">
        <Check className="h-4 w-4" />
      </button>
      <button onClick={onCancel} className="rounded-lg p-2 text-muted hover:bg-subtle hover:text-fg" aria-label="Cancel">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

/** Pencil and trash buttons shown on a row while editing a list. */
export function RowActions({ onRename, onDelete }: { onRename: () => void; onDelete: () => void }) {
  const { t } = useI18n()
  return (
    <div className="flex shrink-0 items-center">
      <button onClick={onRename} className="rounded-lg p-2 text-muted hover:bg-subtle hover:text-fg" aria-label={t("rename")}>
        <Pencil className="h-4 w-4" />
      </button>
      <button onClick={onDelete} className="rounded-lg p-2 text-muted hover:bg-subtle hover:text-accent" aria-label={t("delete")}>
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}

/** "編輯 / 完成" toggle, plus an optional add button, above a managed list. */
export function ListToolbar({ editing, onToggle, addLabel, onAdd }: {
  editing: boolean
  onToggle: () => void
  addLabel?: string
  onAdd?: () => void
}) {
  const { t } = useI18n()
  return (
    <div className="mt-4 flex items-center justify-between">
      {onAdd ? (
        <button onClick={onAdd} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-muted hover:bg-subtle hover:text-fg">
          <Plus className="h-4 w-4" />
          {addLabel}
        </button>
      ) : (
        <span />
      )}
      <button onClick={onToggle} className="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-subtle hover:text-fg">
        {editing ? t("done") : t("edit")}
      </button>
    </div>
  )
}
