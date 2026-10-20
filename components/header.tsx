"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { authClient } from "@/lib/auth-client"
import { LangToggle, useI18n } from "./i18n"

export type HeaderUser = { name: string | null; email: string; image: string | null }

export function Logo({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <rect width="100" height="100" rx="24" fill="rgb(var(--accent))" />
      <path d="M30 22 L62 40 L30 58 Z" fill="#fff" />
      <rect x="22" y="68" width="56" height="6" rx="3" fill="#fff" />
      <rect x="22" y="80" width="38" height="6" rx="3" fill="#fff" opacity="0.75" />
    </svg>
  )
}

export function Header({ user }: { user?: HeaderUser }) {
  const { t } = useI18n()
  return (
    <header className="flex items-center justify-between py-4">
      <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
        <Logo />
        {t("appName")}
      </Link>
      <div className="flex items-center gap-1">
        <LangToggle />
        {user && <UserMenu user={user} />}
      </div>
    </header>
  )
}

function UserMenu({ user }: { user: HeaderUser }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => ref.current?.contains(e.target as Node) || setOpen(false)
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [open])

  const signOut = async () => {
    await authClient.signOut()
    window.location.href = "/"
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="ml-1 block rounded-full" aria-label="Account">
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.image} alt="" className="h-7 w-7 rounded-full" referrerPolicy="no-referrer" />
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-subtle text-xs font-medium">
            {(user.name ?? user.email)[0]?.toUpperCase()}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-2 w-56 rounded-xl border border-line bg-bg p-1 text-sm shadow-lg">
          <div className="truncate px-3 py-2 text-muted">{user.email}</div>
          <button onClick={signOut} className="w-full rounded-lg px-3 py-2 text-left hover:bg-subtle">
            {t("signOut")}
          </button>
        </div>
      )}
    </div>
  )
}
