# YT 摘要（v2）

`jimmyLC/youtube_summarizer`。原本 fork 自 `DevRico003/youtube_summarizer`（remote `upstream`），v2 已整個重寫，不再跟原作者同步。貼 YouTube 連結，產出重點摘要與逐字稿，有歷史紀錄與標籤。目前進度見 [PROJECT_STATUS.md](PROJECT_STATUS.md)。

## 執行與驗證

- 一律使用 **Node 22**：`export PATH="/opt/homebrew/opt/node@22/bin:$PATH"`。`better-sqlite3` 是原生模組，安裝與執行的 Node 版本不同就會載入失敗。
- 沒有字幕的影片需要 `yt-dlp` 與 `ffmpeg`（brew 安裝）。
- 環境變數見 `.env.example`。API key（Groq、DeepSeek）寫在 `.env`，不存資料庫；Jimmy 自己填 key，我不讀也不打。
- 第一次或改了 `prisma/schema.prisma` 之後：`npx prisma db push`（資料庫在 `data/app.db`）。
- 預覽伺服器用 `yt-summarizer`，設定在上層資料夾 `Jimmy Claude/.claude/launch.json`，已寫死 Node 22。
- 檢查：`./node_modules/.bin/tsc --noEmit`、`npx eslint app components lib`、`npx next build`。
- 測試登入後的畫面不需要 Google：在 `data/app.db` 建一個測試 User 與 Session，cookie `better-auth.session_token` = `encodeURIComponent(token + "." + base64(HMAC-SHA256(BETTER_AUTH_SECRET, token)))`。測完刪掉該 User（會連帶刪除）。這個輔助程式不要放進 repo。
- 實測影片：`0dpoc2Enbz4`（中文、無字幕，走 Groq Whisper）；`jNQXAC9IVRw`（英文、有字幕）。

## 架構

- **流程**（`lib/jobs.ts`）：`POST /api/videos` 建立 Video 後在背景執行 `startJob`，狀態依序為 `queued → transcribing → summarizing → done`（或 `error` 加錯誤代碼）。前端每 3 秒輪詢。伺服器重開時中斷的工作，會在下次讀取列表時標為 `INTERRUPTED`。重試會沿用已存的逐字稿。
- **逐字稿**（`lib/transcript.ts`）：YouTube 字幕（免 key）→ 下載音訊（yt-dlp、ffmpeg 切 10 分鐘一段，同時最多 2 支）交給 Groq Whisper，失敗時同一批音檔改送 OpenAI `whisper-1`（`OPENAI_API_KEY`，選填）。中文一律經 OpenCC（`cn`→`twp`）轉台灣繁體，並把半形逗號、問號等改成全形。存成 `[秒, 文字][]` JSON。
- **摘要與標籤**（`lib/summarize.ts`）：DeepSeek 一次呼叫回傳 JSON `{tldr, points[{time,title,detail}], tags}`。會把使用者現有的標籤放進 prompt，優先沿用。自動標籤只在影片還沒有標籤時才寫入，不覆蓋手動標籤。沒有影片使用的標籤會自動刪除。
- **本地上傳**（`components/upload-dialog.tsx`、`lib/extract-audio.ts`、`app/api/uploads/route.ts`）：瀏覽器用 ffmpeg.wasm（單執行緒，檔案放在 `public/ffmpeg/`，由 `scripts/copy-ffmpeg.mjs` 在 `predev`／`prebuild` 從 node_modules 複製，不進 git）把影片抽成 32kbps 單聲道 mp3，以原始請求內容 POST 到 `/api/uploads`（細節放 query string），伺服器存到 `data/audio/<id>.mp3` 後建立 `Video`（`origin="upload"`、`youtubeId="up_<id>"`）並 `startJob`。上傳走 `getTranscriptFromFile`（略過 YouTube 下載），轉錄後**音檔留著**供重聽；失敗保留音檔讓「重試」不必重傳；`TOO_LONG` 與刪除影片會刪。限制常數在 `lib/upload-limits.ts`（瀏覽器與伺服器共用）。標題：預設檔名，摘要後若 `titleEdited=false` 換成 AI 標題；手動改過就不動。上傳的影片沒有縮圖、YouTube 連結與時間戳跳轉。
  - ffmpeg.wasm 的坑：要用 `<script>` 載入 UMD 版（打包器會弄壞 worker）；**不能傳 `classWorkerURL`**（會變成 module worker，無法 `importScripts` 載入 UMD core）；core 用 `dist/umd`。
  - VPS 只有 ffmpeg 沒有 ffprobe，伺服器端用 `ffmpeg -i` 的輸出讀長度。
- **錄音檔與逐字稿編輯**（`lib/uploads.ts`、`app/api/videos/[id]/{audio,transcript,resummarize}`、`components/audio-player.tsx`）：每支影片都留一份聽用音檔 `data/audio/<id>.mp3`（`AUDIO_DIR` 可改位置；32kbps 單聲道，1 小時約 14MB），刪影片時一起刪。YouTube 影片：沒字幕走 Whisper 的，`splitAndTranscribe` 轉錄成功後用 ffmpeg concat（不重新編碼）把切段接回一個檔；有字幕的沒下載過音訊，`runJob` 在寫摘要的同時用 `saveYoutubeAudio` 另外下載（失敗只記警告，不影響摘要）；先寫 `.part` 再改名，不會有寫到一半的檔。重試時沒有音檔的 YouTube 影片會補下載。`GET .../audio` 要登入且是自己的影片，支援 Range，**每次最多回 2MB**（讀進記憶體而不是串流：串流在瀏覽器每次拖拉中止請求時，伺服器會丟 `Controller is already closed`）。影片頁底部固定播放條（倍速 1／1.25／1.5、前後 5 秒），點段落或時間就跳到那段播放並標出目前段落；有音檔時時間戳改成跳播放條，不再連到 YouTube。逐字稿編輯：按「編輯」整份進入編輯模式，一段一個文字框，**修改暫存在畫面和瀏覽器 localStorage（`yt-transcript-draft:<id>`，段落數對得上才還原），按「儲存」才 `PUT .../transcript` 整份寫入**；存下去每個段落（約 45 秒）合成一行，時間點只剩段落開頭（重新切段結果不變）。「重新產生摘要」（`POST .../resummarize`，`startJob(id, {summaryOnly: true})`）只重做摘要，**標籤和標題都不動**；編輯模式中停用。
- **筆記本**（`Notebook` 資料表，`lib/notebooks.ts`）：Jimmy 自己管理的資料夾，一部影片屬於一個筆記本（`Video.notebookId`，null = 內建的「未分類」，網址 `/n/_`）。首頁「筆記本」分頁可新增、改名、刪除（刪除只刪筆記本，影片移到未分類）；筆記本頁（`/n/<id>`）有「選取」模式可批次搬移；影片頁點筆記本名稱可換筆記本或輸入新名稱建立。新轉的 YouTube 影片由 `notebookForChannel` 自動放進 `matchChannel` 等於其頻道名稱的筆記本（沒有就用頻道名稱建立）；**`matchChannel` 不會因改名而變**，所以改名後新影片仍會進同一個筆記本。`Video.channel` 只是轉換當下的 YouTube 頻道名稱紀錄，分組一律看 `notebookId`。既有資料由 `scripts/migrate-notebooks.mjs` 一次性轉換（靠 `PRAGMA user_version` 防止重跑，所以刪掉的筆記本不會復活；`deploy/setup.sh` 在 `prisma db push` 後會執行）。伺服器與瀏覽器共用的型別與 `notebookRows`、`tagRows` 放在 `lib/video-types.ts`（不能引用資料庫）。
- **會員專屬影片**（`lib/member-cookies.ts`、設定頁 `/settings`、`app/api/settings/cookies`）：Jimmy 在設定頁貼上從無痕視窗匯出的 YouTube cookies.txt（Netscape 格式），伺服器只留 youtube.com／google.com 的行，存成 `data/cookies/<userId>.txt`（目錄 700、檔案 600），**內容絕不回傳瀏覽器**。只有 `MEMBER_COOKIES_EMAILS`（逗號分隔）裡的信箱能使用；空白 = 功能關閉，設定連結也不會出現。`fromAudio` 先照常下載，**只有 yt-dlp 回報會員專屬（members-only）時才複製一份 cookies 重試**（yt-dlp 會改寫它拿到的 cookies 檔，所以給拋棄式複本），一般影片完全不碰登入。錯誤碼 `MEMBERS_ONLY`（沒存登入）、`COOKIES_EXPIRED`（登入過期或帳號不是會員）。會員影片不抓字幕，一律下載音訊走語音轉文字。測試用 `YT_DLP_BIN` 可換成假的 yt-dlp（測試完要從 `.env` 拿掉）。
- **標籤管理**：首頁「標籤」分頁列出所有標籤與影片數，點進去是 `/t/<名稱>`；編輯模式可改名（改成已存在的名稱會合併，`PATCH /api/tags`）與刪除（`DELETE /api/tags`）。「全部紀錄」分頁不再有標籤篩選列。
- **摘要語言**跟著轉換當下的介面語言（`zh-TW` / `en`），影片頁可以改用另一種語言重新產生。
- **介面語言**：`lib/i18n.ts` 字典 + `components/i18n.tsx`，存在 cookie `lang`，伺服器端渲染就用對的語言。新增文字時兩種語言都要加。
- **登入**（`lib/auth.ts`）：better-auth，只有 Google。`ALLOWED_EMAILS` 白名單（空白 = 任何人），在建立 user 與建立 session 時都會檢查。
- **PWA**：`app/manifest.ts`、圖示由 `lib/app-icon.tsx` 產生（`/icon`、`/apple-icon`、`/icons/192|512|maskable`），`public/sw.js` 只在正式環境註冊。Android 可從分享選單把連結分享給本 app（`share_target` → `/?text=`）。
- **樣式**：Tailwind，色彩 token 在 `app/globals.css`（`bg fg muted subtle line accent`），深淺色跟隨系統。

## 陷阱

- `.env` 已被 git 忽略，不要提交。`.env.v1-backup` 是 v1 的設定備份。
- 舊版資料庫 `dev.db`（v1）保留在根目錄但已不使用。
- **部署**：Hetzner VPS（ssh 別名 `javis-prod`）。這台機器還跑著別的專案（各有自己的 Cloudflare Tunnel），**不能動它們**；本專案全部隔離在 `/srv/yt-summarizer`、使用者 `ytsum`、服務 `yt-summarizer` 與 `cloudflared-ytsum`、port 3210。用 `./deploy/push.sh javis-prod https://yt.jimmy-tools.com` 部署與更新，步驟見 `deploy/README.md`。`main` 就是 v2（已合併），本地上傳與筆記本管理也已合併並部署（2026-10-20）。Mac mini 上的 v1 已全部清除，現在只剩 YouTube 中繼在用。
- **YouTube 擋 VPS 的 IP**（2026-10-21 實測）：伺服器上的 `.env` 設 `YOUTUBE_PROXY=http://<Mac mini 的 Tailscale IP>:8888`，抓字幕（undici ProxyAgent）與 yt-dlp（`--proxy`）都走家裡 Mac mini 上的 tinyproxy（設定在 Mac mini 的 `~/yt-relay/`，launchd `com.jimmy.yt-relay`，只聽 Tailscale 位址（IP 看 Mac mini 上的 `tailscale ip -4`）、只允許 VPS、只放行 youtube.com / googlevideo.com / ytimg.com / youtu.be）。Mac mini 關機或沒登入桌面，轉換就會失敗。本機開發不設這個變數，直連即可。
- Whisper 的 `language: "zh"` 加繁體提示詞仍不保證輸出繁體，以 OpenCC 為準。

## Git

- 只推 `origin`（Jimmy 的 repo）。
- 改動先放分支，經 Jimmy 同意後再合進 `main`。
- commit 訊息結尾附 `Co-Authored-By` 行（模型名稱依當下使用的模型）。
