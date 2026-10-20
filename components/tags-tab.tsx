"use client"

import Link from "next/link"
import { useState } from "react"
import { ChevronRight } from "lucide-react"
import { useI18n } from "./i18n"
import { ListToolbar, NameInput, RowActions } from "./manage-list"

/** The 標籤 tab: every tag with its video count; edit mode adds rename (merging into an existing tag) and delete. */
export function TagsTab({ rows, onRename, onDelete }: {
  rows: { name: string; count: number }[]
  onRename: (name: string, to: string) => void
  onDelete: (name: string) => void
}) {
  const { t } = useI18n()
  const [editing, setEditing] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)

  return (
    <>
      <ListToolbar
        editing={editing}
        onToggle={() => {
          setEditing(!editing)
          setRenaming(null)
        }}
      />
      <ul>
        {rows.map((r) =>
          renaming === r.name ? (
            <li key={r.name} className="py-2">
              <NameInput
                initial={r.name}
                placeholder={t("tagName")}
                onSave={(to) => {
                  setRenaming(null)
                  onRename(r.name, to)
                }}
                onCancel={() => setRenaming(null)}
              />
            </li>
          ) : (
            <li key={r.name}>
              {editing ? (
                <div className="-mx-2 flex items-center gap-3 rounded-xl p-2">
                  <TagLabel name={r.name} count={r.count} />
                  <RowActions onRename={() => setRenaming(r.name)} onDelete={() => onDelete(r.name)} />
                </div>
              ) : (
                <Link href={`/t/${encodeURIComponent(r.name)}`} className="-mx-2 flex items-center gap-3 rounded-xl p-2 hover:bg-subtle">
                  <TagLabel name={r.name} count={r.count} />
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
                </Link>
              )}
            </li>
          )
        )}
      </ul>
      {rows.length === 0 && <p className="mt-16 text-center text-sm text-muted">{t("noTags")}</p>}
    </>
  )
}

function TagLabel({ name, count }: { name: string; count: number }) {
  const { t } = useI18n()
  return (
    <div className="min-w-0 flex-1 py-1">
      <h2 className="truncate font-medium">#{name}</h2>
      <p className="text-xs text-muted">
        {count} {t(count === 1 ? "videoOne" : "videosCount")}
      </p>
    </div>
  )
}
