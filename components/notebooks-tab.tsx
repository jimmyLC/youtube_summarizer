"use client"

import Link from "next/link"
import { useState } from "react"
import { ChevronRight } from "lucide-react"
import { UNCATEGORIZED, type NotebookRow } from "@/lib/video-types"
import { useI18n } from "./i18n"
import { ListToolbar, NameInput, RowActions } from "./manage-list"

/** The 筆記本 tab: every notebook with its video count; edit mode adds create, rename and delete. */
export function NotebooksTab({ rows, onCreate, onRename, onDelete }: {
  rows: NotebookRow[]
  onCreate: (name: string) => Promise<string | null>
  onRename: (id: string, name: string) => Promise<string | null>
  onDelete: (row: NotebookRow) => void
}) {
  const { t } = useI18n()
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [error, setError] = useState("")

  const finish = async (run: Promise<string | null>, close: () => void) => {
    const problem = await run
    if (problem) setError(problem)
    else {
      setError("")
      close()
    }
  }

  return (
    <>
      <ListToolbar
        editing={editing}
        onToggle={() => {
          setEditing(!editing)
          setRenaming(null)
          setError("")
        }}
        addLabel={t("newNotebook")}
        onAdd={() => {
          setAdding(true)
          setRenaming(null)
        }}
      />
      {error && <p className="px-1 pb-2 text-sm text-accent">{error}</p>}

      <ul>
        {adding && (
          <li className="py-2">
            <NameInput
              placeholder={t("notebookName")}
              onSave={(name) => finish(onCreate(name), () => setAdding(false))}
              onCancel={() => {
                setAdding(false)
                setError("")
              }}
            />
          </li>
        )}
        {rows.map((r) => {
          const label = r.name || t("uncategorized")
          const manageable = editing && r.id !== UNCATEGORIZED
          if (renaming === r.id) {
            return (
              <li key={r.id} className="py-2">
                <NameInput
                  initial={r.name}
                  placeholder={t("notebookName")}
                  onSave={(name) => finish(onRename(r.id, name), () => setRenaming(null))}
                  onCancel={() => {
                    setRenaming(null)
                    setError("")
                  }}
                />
              </li>
            )
          }
          const inner = (
            <>
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-subtle text-lg font-medium text-muted">
                {label.trim().charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-medium">{label}</h2>
                <p className="text-xs text-muted">
                  {r.count} {t(r.count === 1 ? "videoOne" : "videosCount")}
                </p>
              </div>
            </>
          )
          return (
            <li key={r.id}>
              {editing ? (
                <div className="-mx-2 flex items-center gap-3 rounded-xl p-2">
                  {inner}
                  {manageable && (
                    <RowActions
                      onRename={() => {
                        setRenaming(r.id)
                        setAdding(false)
                      }}
                      onDelete={() => onDelete(r)}
                    />
                  )}
                </div>
              ) : (
                <Link href={`/n/${encodeURIComponent(r.id)}`} className="-mx-2 flex items-center gap-3 rounded-xl p-2 hover:bg-subtle">
                  {inner}
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
                </Link>
              )}
            </li>
          )
        })}
      </ul>
      {rows.length === 0 && !adding && <p className="mt-16 text-center text-sm text-muted">{t("noNotebooks")}</p>}
    </>
  )
}
