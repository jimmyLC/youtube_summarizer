import { ImageResponse } from "next/og"

/** App icon: a red play button above summary lines. Rendered to PNG at any size. */
export function appIcon(size: number, { padded = false } = {}) {
  // Maskable icons need the artwork inside the central safe zone
  const scale = padded ? 0.72 : 1
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#dc2626" }}>
        <svg width={size * scale} height={size * scale} viewBox="0 0 100 100">
          <path d="M30 22 L62 40 L30 58 Z" fill="#ffffff" />
          <rect x="22" y="68" width="56" height="6" rx="3" fill="#ffffff" />
          <rect x="22" y="80" width="38" height="6" rx="3" fill="#ffffff" opacity="0.75" />
        </svg>
      </div>
    ),
    { width: size, height: size }
  )
}
