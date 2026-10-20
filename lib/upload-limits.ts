// Limits for local uploads. Shared by the browser (checks before extracting) and the server.

/** Largest video or audio file the browser will take. */
export const MAX_FILE_BYTES = 1024 * 1024 * 1024
/** Longest recording we transcribe. */
export const MAX_SECONDS = 3 * 60 * 60
/** The browser sends 32 kbps mono mp3 (4 kB/s), so 3 h is ~43 MB; Cloudflare stops requests at 100 MB. */
export const MAX_AUDIO_BYTES = 80 * 1024 * 1024
/** Bytes per second of the extracted audio (32 kbps). */
export const AUDIO_BYTES_PER_SECOND = 4000

export const UPLOAD_EXTENSIONS = ["mp4", "mov", "m4v", "mkv", "webm", "avi", "m4a", "mp3", "wav", "aac", "ogg", "flac"]

export const fileBaseName = (name: string) => name.replace(/\.[^./\\]+$/, "")
