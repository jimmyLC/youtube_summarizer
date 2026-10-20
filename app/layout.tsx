import type { Metadata, Viewport } from "next"
import { cookies } from "next/headers"
import { I18nProvider } from "@/components/i18n"
import { ServiceWorker } from "@/components/service-worker"
import { LANG_COOKIE, parseLang } from "@/lib/i18n"
import "./globals.css"

export const metadata: Metadata = {
  title: "YT 摘要",
  description: "YouTube 重點摘要與逐字稿",
  appleWebApp: { capable: true, title: "YT 摘要", statusBarStyle: "default" },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0f10" },
  ],
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = parseLang((await cookies()).get(LANG_COOKIE)?.value)
  return (
    <html lang={lang}>
      <body className="min-h-dvh font-sans antialiased">
        <I18nProvider initial={lang}>{children}</I18nProvider>
        <ServiceWorker />
      </body>
    </html>
  )
}
