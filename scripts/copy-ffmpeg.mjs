// Copies the in-browser ffmpeg (used to pull the audio out of uploaded videos)
// from node_modules into public/ffmpeg, so it is served from our own domain.
import fs from "node:fs"
import path from "node:path"

const out = path.join("public", "ffmpeg")
fs.mkdirSync(out, { recursive: true })
const files = [
  ["node_modules/@ffmpeg/ffmpeg/dist/umd/ffmpeg.js", "ffmpeg.js"],
  ["node_modules/@ffmpeg/ffmpeg/dist/umd/814.ffmpeg.js", "814.ffmpeg.js"],
  ["node_modules/@ffmpeg/core/dist/umd/ffmpeg-core.js", "ffmpeg-core.js"],
  ["node_modules/@ffmpeg/core/dist/umd/ffmpeg-core.wasm", "ffmpeg-core.wasm"],
]
for (const [from, name] of files) fs.copyFileSync(from, path.join(out, name))
