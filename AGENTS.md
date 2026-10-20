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
- **頻道筆記本**：不另存資料，直接用 `Video.channel`（YouTube oEmbed 回傳的頻道名稱）分組。首頁「頻道」分頁（`/?view=channels`）列出頻道，`/c/<頻道名>` 是該頻道的所有摘要（含一句話總結）；頻道名稱空白的影片歸在 `/c/_`（未知頻道）。伺服器與瀏覽器共用的型別和 `groupChannels` 放在 `lib/video-types.ts`，**不能引用 `lib/videos.ts`**（它會連到資料庫，瀏覽器端打包會失敗）。
- **摘要語言**跟著轉換當下的介面語言（`zh-TW` / `en`），影片頁可以改用另一種語言重新產生。
- **介面語言**：`lib/i18n.ts` 字典 + `components/i18n.tsx`，存在 cookie `lang`，伺服器端渲染就用對的語言。新增文字時兩種語言都要加。
- **登入**（`lib/auth.ts`）：better-auth，只有 Google。`ALLOWED_EMAILS` 白名單（空白 = 任何人），在建立 user 與建立 session 時都會檢查。
- **PWA**：`app/manifest.ts`、圖示由 `lib/app-icon.tsx` 產生（`/icon`、`/apple-icon`、`/icons/192|512|maskable`），`public/sw.js` 只在正式環境註冊。Android 可從分享選單把連結分享給本 app（`share_target` → `/?text=`）。
- **樣式**：Tailwind，色彩 token 在 `app/globals.css`（`bg fg muted subtle line accent`），深淺色跟隨系統。

## 陷阱

- `.env` 已被 git 忽略，不要提交。`.env.v1-backup` 是 v1 的設定備份。
- 舊版資料庫 `dev.db`（v1）保留在根目錄但已不使用。
- **部署**：Hetzner VPS（ssh 別名 `javis-prod`）。這台機器還跑著別的專案（各有自己的 Cloudflare Tunnel），**不能動它們**；本專案全部隔離在 `/srv/yt-summarizer`、使用者 `ytsum`、服務 `yt-summarizer` 與 `cloudflared-ytsum`、port 3210。用 `./deploy/push.sh javis-prod https://yt.jimmy-tools.com` 部署與更新，步驟見 `deploy/README.md`。`main` 就是 v2（已合併）。Mac mini 上的 v1 已全部清除，現在只剩 YouTube 中繼在用。
- **YouTube 擋 VPS 的 IP**（2026-10-21 實測）：伺服器上的 `.env` 設 `YOUTUBE_PROXY=http://<Mac mini 的 Tailscale IP>:8888`，抓字幕（undici ProxyAgent）與 yt-dlp（`--proxy`）都走家裡 Mac mini 上的 tinyproxy（設定在 Mac mini 的 `~/yt-relay/`，launchd `com.jimmy.yt-relay`，只聽 Tailscale 位址（IP 看 Mac mini 上的 `tailscale ip -4`）、只允許 VPS、只放行 youtube.com / googlevideo.com / ytimg.com / youtu.be）。Mac mini 關機或沒登入桌面，轉換就會失敗。本機開發不設這個變數，直連即可。
- Whisper 的 `language: "zh"` 加繁體提示詞仍不保證輸出繁體，以 OpenCC 為準。

## Git

- 只推 `origin`（Jimmy 的 repo）。
- 改動先放分支，經 Jimmy 同意後再合進 `main`。
- commit 訊息結尾附 `Co-Authored-By` 行（模型名稱依當下使用的模型）。
