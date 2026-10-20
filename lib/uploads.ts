import fs from "fs"
import path from "path"

/** Where an uploaded recording's audio waits until it is transcribed. Deleted once the transcript is saved. */
const DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "data", "uploads")

export const audioPath = (videoId: string) => path.join(DIR, `${videoId}.mp3`)

export const ensureUploadDir = () => fs.promises.mkdir(DIR, { recursive: true })

export const removeAudio = (videoId: string) => fs.promises.rm(audioPath(videoId), { force: true })

export const audioExists = (videoId: string) =>
  fs.promises.access(audioPath(videoId)).then(() => true, () => false)
