export type Lang = "zh-TW" | "en"

export const LANG_COOKIE = "lang"

export const parseLang = (value: string | undefined): Lang => (value === "en" ? "en" : "zh-TW")

const zh = {
  appName: "YT 摘要",
  tagline: "貼上 YouTube 連結，立刻得到重點摘要與逐字稿。",
  signIn: "使用 Google 登入",
  signInError: "無法登入：這個 Google 帳號沒有使用權限。",
  signOut: "登出",
  placeholder: "貼上 YouTube 網址",
  convert: "轉換",
  invalidUrl: "這不是 YouTube 網址",
  networkError: "連線失敗，請再試一次",
  all: "全部",
  tabAll: "全部紀錄",
  tabChannels: "頻道",
  videosCount: "部影片",
  videoOne: "部影片",
  unknownChannel: "未知頻道",
  noChannels: "還沒有頻道。轉換第一支影片後，會依頻道整理在這裡。",
  backToChannels: "頻道",
  empty: "還沒有紀錄，貼上第一個網址吧。",
  noMatch: "這個標籤沒有影片。",
  back: "全部紀錄",
  keyPoints: "重點",
  transcript: "逐字稿",
  copy: "複製",
  copied: "已複製",
  delete: "刪除",
  confirmDelete: "確定刪除這筆紀錄？",
  retry: "重試",
  addTag: "標籤",
  openYouTube: "YouTube",
  regenerate: "改用中文重新產生摘要",
  "status.queued": "排隊中…",
  "status.transcribing": "擷取逐字稿中…",
  "status.summarizing": "產生摘要中…",
  "status.hint": "沒有字幕的影片需要先轉錄語音，長影片可能要幾分鐘。可以先離開，完成後會出現在紀錄裡。",
  "error.NO_TRANSCRIPT": "抓不到逐字稿",
  "error.SUMMARY_FAILED": "摘要產生失敗",
  "error.INTERRUPTED": "處理中斷",
  "error.default": "處理失敗",
  upload: "上傳影片或錄音",
  uploadDrop: "放開以上傳",
  uploadTitleLabel: "標題",
  uploadNotebook: "筆記本",
  uploadStart: "開始轉換",
  uploadCancel: "取消",
  uploadDefaultNotebook: "本地上傳",
  "upload.loading": "載入轉檔工具…（第一次約 30MB）",
  "upload.extracting": "正在擷取音訊",
  "upload.sending": "上傳中",
  "upload.stay": "請先不要關掉這個頁面。",
  "upload.tooBig": "檔案超過 1GB。",
  "upload.tooLong": "錄音超過 3 小時。",
  "upload.badType": "不支援這種檔案，請選影片或錄音檔。",
  "upload.extractFail": "無法從這個檔案擷取聲音（格式不支援，或檔案沒有聲音）。可以先用其他工具轉成 mp4 或 m4a 再試。",
  "upload.sendFail": "上傳失敗，請再試一次。",
  "upload.duplicate": "這個檔案已經轉過了：「{title}」。\n\n按「確定」重新轉一次，按「取消」打開原本的紀錄。",
  editTitle: "修改標題",
  uploadedFile: "本地檔案",
  "error.AUDIO_MISSING": "音檔已不在伺服器上，請重新上傳",
  "error.TOO_LONG": "錄音超過 3 小時",
}

type Key = keyof typeof zh

const en: Record<Key, string> = {
  appName: "YT Summary",
  tagline: "Paste a YouTube link, get the key points and the transcript.",
  signIn: "Sign in with Google",
  signInError: "Sign-in failed: this Google account is not allowed.",
  signOut: "Sign out",
  placeholder: "Paste a YouTube link",
  convert: "Convert",
  invalidUrl: "That is not a YouTube link",
  networkError: "Connection failed, please try again",
  all: "All",
  tabAll: "All videos",
  tabChannels: "Channels",
  videosCount: "videos",
  videoOne: "video",
  unknownChannel: "Unknown channel",
  noChannels: "No channels yet. Converted videos are grouped here by channel.",
  backToChannels: "Channels",
  empty: "Nothing yet. Paste your first link.",
  noMatch: "No videos with this tag.",
  back: "All videos",
  keyPoints: "Key points",
  transcript: "Transcript",
  copy: "Copy",
  copied: "Copied",
  delete: "Delete",
  confirmDelete: "Delete this video?",
  retry: "Retry",
  addTag: "Tag",
  openYouTube: "YouTube",
  regenerate: "Regenerate the summary in English",
  "status.queued": "Queued…",
  "status.transcribing": "Getting the transcript…",
  "status.summarizing": "Writing the summary…",
  "status.hint": "Videos without captions are transcribed from audio first; long ones can take a few minutes. You can leave this page.",
  "error.NO_TRANSCRIPT": "Could not get a transcript",
  "error.SUMMARY_FAILED": "Summary failed",
  "error.INTERRUPTED": "Interrupted",
  "error.default": "Failed",
  upload: "Upload a video or recording",
  uploadDrop: "Drop to upload",
  uploadTitleLabel: "Title",
  uploadNotebook: "Notebook",
  uploadStart: "Convert",
  uploadCancel: "Cancel",
  uploadDefaultNotebook: "Local uploads",
  "upload.loading": "Loading the converter… (about 30 MB the first time)",
  "upload.extracting": "Extracting the audio",
  "upload.sending": "Uploading",
  "upload.stay": "Please keep this page open.",
  "upload.tooBig": "The file is over 1 GB.",
  "upload.tooLong": "The recording is over 3 hours.",
  "upload.badType": "That file type is not supported. Choose a video or an audio file.",
  "upload.extractFail": "Could not get the sound out of this file (unsupported format, or no audio). Try converting it to mp4 or m4a first.",
  "upload.sendFail": "Upload failed, please try again.",
  "upload.duplicate": "This file was already converted: \"{title}\".\n\nOK converts it again; Cancel opens the existing one.",
  editTitle: "Edit title",
  uploadedFile: "Local file",
  "error.AUDIO_MISSING": "The audio is no longer on the server. Please upload it again.",
  "error.TOO_LONG": "The recording is over 3 hours",
}

const dictionaries: Record<Lang, Record<Key, string>> = { "zh-TW": zh, en }

export type T = (key: Key) => string

export const translator =
  (lang: Lang): T =>
  (key) =>
    dictionaries[lang][key] ?? key

/** "3 天前" / "3 days ago" */
export function timeAgo(iso: string, lang: Lang): string {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" })
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ]
  for (const [unit, secs] of units) {
    if (Math.abs(diff) >= secs) return rtf.format(Math.round(diff / secs), unit)
  }
  return rtf.format(0, "minute")
}
