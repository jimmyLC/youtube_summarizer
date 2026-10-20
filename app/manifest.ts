import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "YT 摘要",
    short_name: "YT 摘要",
    description: "YouTube 重點摘要與逐字稿",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Android: share a YouTube link from the YouTube app straight into this app
    share_target: { action: "/", method: "GET", params: { title: "title", text: "text", url: "url" } },
  } as MetadataRoute.Manifest
}
