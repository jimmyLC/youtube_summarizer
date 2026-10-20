"use client"

import Link from "next/link"
import { Check, FileAudio } from "lucide-react"
import { timeAgo } from "@/lib/i18n"
import type { VideoItem } from "@/lib/video-types"
import { thumbnailUrl } from "@/lib/youtube"
import { useI18n } from "./i18n"
import { StatusLine } from "./status"

/** One video in a list: thumbnail, title, and either meta line or progress. */
export function VideoRow({ video: v, showNotebook = true, showTldr = false, select }: {
  video: VideoItem
  showNotebook?: boolean
  showTldr?: boolean
  /** Select mode: a tap toggles the video instead of opening it */
  select?: { selected: boolean; onToggle: () => void }
}) {
  const { lang } = useI18n()
  const className = `-mx-2 flex w-full gap-3 rounded-xl p-2 text-left sm:gap-4 ${select?.selected ? "bg-subtle" : "hover:bg-subtle"}`
  const body = (
    <>
      {select && (
        <span
          className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center self-start rounded-full border ${select.selected ? "border-fg bg-fg text-bg" : "border-line"}`}
        >
          {select.selected && <Check className="h-3 w-3" />}
        </span>
      )}
      {v.origin === "upload" ? (
        <div className="flex aspect-video w-28 shrink-0 items-center justify-center self-start rounded-lg bg-subtle text-muted sm:w-36">
          <FileAudio className="h-6 w-6" />
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbnailUrl(v.youtubeId)}
          alt=""
          loading="lazy"
          className="aspect-video w-28 shrink-0 self-start rounded-lg bg-subtle object-cover sm:w-36"
        />
      )}
      <div className="min-w-0 flex-1 py-0.5">
        <h2 className="line-clamp-2 text-[15px] font-medium leading-snug">{v.title}</h2>
        {v.status === "done" ? (
          <>
            <p className="mt-1 truncate text-xs text-muted">
              {[showNotebook && v.notebook, timeAgo(v.createdAt, lang)].filter(Boolean).join(" · ")}
              {v.tags.length > 0 && <span className="ml-2">{v.tags.map((tag) => `#${tag}`).join(" ")}</span>}
            </p>
            {showTldr && v.tldr && <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-fg/70">{v.tldr}</p>}
          </>
        ) : (
          <StatusLine status={v.status} error={v.error} className="mt-1 text-xs" />
        )}
      </div>
    </>
  )
  return select ? (
    <button type="button" onClick={select.onToggle} className={className}>
      {body}
    </button>
  ) : (
    <Link href={`/v/${v.id}`} className={className}>
      {body}
    </Link>
  )
}
