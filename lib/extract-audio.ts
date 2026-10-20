// Runs in the browser only. Pulls the sound out of a video or audio file with ffmpeg.wasm,
// as 32 kbps mono mp3 (the same format the server cuts into chunks anyway). A 3-hour
// recording becomes ~43 MB, so it fits through Cloudflare's 100 MB request limit.
//
// ffmpeg.wasm is loaded from /ffmpeg (copied by scripts/copy-ffmpeg.mjs) with a plain
// <script> tag: its worker does not survive the bundler. Single-threaded build, so no
// cross-origin isolation headers are needed.

interface FFmpegProgress { progress: number }
interface FFmpegInstance {
  load(config: { coreURL: string; wasmURL: string }): Promise<boolean>
  on(event: "progress", cb: (e: FFmpegProgress) => void): void
  off(event: "progress", cb: (e: FFmpegProgress) => void): void
  exec(args: string[]): Promise<number>
  readFile(path: string): Promise<Uint8Array | string>
  deleteFile(path: string): Promise<boolean>
  createDir(path: string): Promise<boolean>
  deleteDir(path: string): Promise<boolean>
  mount(fsType: "WORKERFS", options: { files: File[] }, mountPoint: string): Promise<boolean>
  unmount(mountPoint: string): Promise<boolean>
  terminate(): void
}
declare global {
  interface Window {
    FFmpegWASM?: { FFmpeg: new () => FFmpegInstance }
  }
}

export class ExtractError extends Error {}

let instance: Promise<FFmpegInstance> | null = null

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.FFmpegWASM) return resolve()
    const el = document.createElement("script")
    el.src = src
    el.onload = () => resolve()
    el.onerror = () => reject(new ExtractError("Could not load the converter"))
    document.head.appendChild(el)
  })
}

function getFFmpeg(): Promise<FFmpegInstance> {
  instance ??= (async () => {
    await loadScript("/ffmpeg/ffmpeg.js")
    const ffmpeg = new window.FFmpegWASM!.FFmpeg()
    // No classWorkerURL: the library then finds 814.ffmpeg.js next to ffmpeg.js and starts a
    // classic worker, which loads the UMD core with importScripts (a module worker cannot).
    await ffmpeg.load({
      coreURL: `${location.origin}/ffmpeg/ffmpeg-core.js`,
      wasmURL: `${location.origin}/ffmpeg/ffmpeg-core.wasm`,
    })
    return ffmpeg
  })().catch((e) => {
    instance = null
    throw e
  })
  return instance
}

/** Starts downloading the converter ahead of time. */
export const preloadConverter = () => getFFmpeg().then(() => undefined, () => undefined)

/** Stops a running extraction; the next one starts a fresh converter. */
export async function cancelExtraction() {
  const current = instance
  instance = null
  if (current) (await current.catch(() => null))?.terminate()
}

/** Length in seconds as the browser reads it, or null when it cannot tell (never blocks for long). */
export function probeDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const media = document.createElement(file.type.startsWith("audio/") ? "audio" : "video")
    const url = URL.createObjectURL(file)
    const done = (value: number | null) => {
      clearTimeout(timer)
      media.removeAttribute("src")
      media.load()
      URL.revokeObjectURL(url)
      resolve(value)
    }
    const timer = setTimeout(() => done(null), 8000)
    media.preload = "metadata"
    media.onloadedmetadata = () => done(Number.isFinite(media.duration) ? media.duration : null)
    media.onerror = () => done(null)
    media.src = url
  })
}

/** progress runs from 0 to 1. The file is read in slices (WORKERFS), never copied into memory whole. */
export async function extractAudio(file: File, onProgress: (progress: number) => void): Promise<Blob> {
  const ffmpeg = await getFFmpeg()
  const input = new File([file], "input") // a neutral name: no odd characters in the virtual path
  const listener = ({ progress }: FFmpegProgress) => onProgress(Math.min(1, Math.max(0, progress)))
  ffmpeg.on("progress", listener)
  try {
    await ffmpeg.createDir("/in")
    await ffmpeg.mount("WORKERFS", { files: [input] }, "/in")
    const code = await ffmpeg.exec(["-i", "/in/input", "-vn", "-map", "0:a:0", "-ac", "1", "-ar", "16000", "-b:a", "32k", "-f", "mp3", "out.mp3"])
    if (code !== 0) throw new ExtractError("ffmpeg exited with code " + code)
    const data = (await ffmpeg.readFile("out.mp3")) as Uint8Array
    if (data.length === 0) throw new ExtractError("No audio")
    return new Blob([data as BlobPart], { type: "audio/mpeg" })
  } finally {
    ffmpeg.off("progress", listener)
    await ffmpeg.deleteFile("out.mp3").catch(() => undefined)
    await ffmpeg.unmount("/in").catch(() => undefined)
    await ffmpeg.deleteDir("/in").catch(() => undefined)
  }
}
