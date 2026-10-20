import type { Config } from "tailwindcss"

const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`

const config: Config = {
  darkMode: "media",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: token("bg"),
        fg: token("fg"),
        muted: token("muted"),
        subtle: token("subtle"),
        line: token("line"),
        accent: token("accent"),
      },
      fontFamily: {
        sans: [
          "-apple-system", "BlinkMacSystemFont", "\"Segoe UI\"", "\"PingFang TC\"",
          "\"Noto Sans TC\"", "\"Microsoft JhengHei\"", "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
}

export default config
