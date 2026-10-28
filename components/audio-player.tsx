"use client"

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react"
import { Pause, Play, RotateCcw, RotateCw, type LucideIcon } from "lucide-react"
import { formatTime } from "@/lib/youtube"
import { useI18n } from "./i18n"

export type PlayerHandle = {
  /** Jumps to a time in the recording; `play` also starts playback */
  seek: (seconds: number, play?: boolean) => void
}

const SPEEDS = [1, 1.25, 1.5]

/** A circular arrow with the 5 (seconds) in its middle */
function SkipIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="relative flex h-5 w-5 items-center justify-center">
      <Icon className="h-5 w-5" strokeWidth={1.75} />
      <span className="absolute text-[9px] font-semibold leading-none">5</span>
    </span>
  )
}

/** Bar fixed to the bottom of the screen that plays the recording of a video. */
export const AudioPlayer = forwardRef<PlayerHandle, { src: string; onTime: (seconds: number) => void }>(
  function AudioPlayer({ src, onTime }, ref) {
    const { t } = useI18n()
    const audio = useRef<HTMLAudioElement>(null)
    const [playing, setPlaying] = useState(false)
    const [current, setCurrent] = useState(0)
    const [duration, setDuration] = useState(0)
    const [speed, setSpeed] = useState(1)

    useImperativeHandle(ref, () => ({
      seek(seconds, play) {
        const el = audio.current
        if (!el) return
        el.currentTime = Math.max(0, seconds)
        setCurrent(el.currentTime)
        onTime(el.currentTime)
        if (play) el.play().catch(() => {})
      },
    }))

    // Reapply the speed whenever the element loads a new source
    useEffect(() => {
      if (audio.current) audio.current.playbackRate = speed
    }, [speed, src])

    // Length of the recording. Listens on the element itself and also checks right away, because
    // the page is server-rendered and the metadata can arrive before React is attached.
    useEffect(() => {
      const el = audio.current
      if (!el) return
      const read = () => setDuration(Number.isFinite(el.duration) ? el.duration : 0)
      read()
      el.addEventListener("loadedmetadata", read)
      el.addEventListener("durationchange", read)
      return () => {
        el.removeEventListener("loadedmetadata", read)
        el.removeEventListener("durationchange", read)
      }
    }, [src])

    const toggle = () => {
      const el = audio.current
      if (!el) return
      if (el.paused) el.play().catch(() => {})
      else el.pause()
    }
    const skip = (delta: number) => {
      const el = audio.current
      if (el) el.currentTime = Math.max(0, Math.min(el.currentTime + delta, Number.isFinite(el.duration) ? el.duration : Infinity))
    }
    const nextSpeed = () => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])

    const seekable = duration > 0
    return (
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg pb-[env(safe-area-inset-bottom)]">
        <audio
          ref={audio}
          src={src}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onTimeUpdate={(e) => {
            setCurrent(e.currentTarget.currentTime)
            onTime(e.currentTarget.currentTime)
          }}
        />
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-2">
          <button onClick={() => skip(-5)} className="rounded-full p-2 text-muted hover:text-fg" aria-label={t("player.back")} title={t("player.back")}>
            <SkipIcon icon={RotateCcw} />
          </button>
          <button
            onClick={toggle}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-white hover:bg-brand/90"
            aria-label={playing ? t("player.pause") : t("player.play")}
            title={playing ? t("player.pause") : t("player.play")}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-px" />}
          </button>
          <button onClick={() => skip(5)} className="rounded-full p-2 text-muted hover:text-fg" aria-label={t("player.forward")} title={t("player.forward")}>
            <SkipIcon icon={RotateCw} />
          </button>
          <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-muted">{formatTime(current)}</span>
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.5}
            value={seekable ? Math.min(current, duration) : 0}
            disabled={!seekable}
            onChange={(e) => {
              if (audio.current) audio.current.currentTime = Number(e.target.value)
            }}
            aria-label={t("player.seek")}
            className="h-1 min-w-0 flex-1 accent-fg"
          />
          <span className="hidden w-12 shrink-0 font-mono text-xs tabular-nums text-muted sm:inline">{seekable ? formatTime(duration) : ""}</span>
          <button
            onClick={nextSpeed}
            className="w-12 shrink-0 rounded-lg px-1 py-1.5 text-center text-sm font-medium tabular-nums text-muted hover:bg-subtle hover:text-fg"
            aria-label={t("player.speed")}
            title={t("player.speed")}
          >
            {speed}x
          </button>
        </div>
      </div>
    )
  }
)
