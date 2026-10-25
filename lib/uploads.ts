import fs from "fs"
import path from "path"

/** Where every video's audio lives (uploads and YouTube alike): one 32 kbps mono mp3 per video, kept for playback. */
const DIR = process.env.AUDIO_DIR || process.env.UPLOAD_DIR || path.join(process.cwd(), "data", "audio")

export const audioPath = (videoId: string) => path.join(DIR, `${videoId}.mp3`)

export const ensureUploadDir = () => fs.promises.mkdir(DIR, { recursive: true })

export const removeAudio = (videoId: string) => fs.promises.rm(audioPath(videoId), { force: true })

export const audioExists = (videoId: string) =>
  fs.promises.access(audioPath(videoId)).then(() => true, () => false)
