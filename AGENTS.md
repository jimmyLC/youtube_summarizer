# YT Summarizer（Jimmy 的 fork）

`jimmyLC/youtube_summarizer`，fork 自 `DevRico003/youtube_summarizer`（remote `upstream`）。貼 YouTube 連結，產出逐字稿與繁體中文重點摘要。Next.js 16 + Prisma + SQLite + better-auth。目前進度見 [進度.md](進度.md)。部署見 [deploy/README.md](deploy/README.md)。

## 執行與驗證

- 一律使用 **Node 22**：`export PATH="/opt/homebrew/opt/node@22/bin:$PATH"`。`better-sqlite3` 是原生模組，安裝與執行的 Node 版本不同就會載入失敗（註冊回 500）。
- 沒有字幕的影片需要 `yt-dlp` 與 `ffmpeg`（brew 安裝）。
- 預覽伺服器用 `yt-summarizer`，設定在上層資料夾 `Jimmy Claude/.claude/launch.json`，已寫死 Node 22。
- 型別檢查：`./node_modules/.bin/tsc --noEmit | grep -E "^(app|lib|components)/"`。`__tests__/` 有原作者留下的既有錯誤（引用已移除的模型），不屬於我們的改動。
- 實測用影片 `0dpoc2Enbz4`（中文、字幕關閉，會走 Groq Whisper）。摘要依 `(videoId, userId)` 快取；重測前先刪掉 `Summary` 那一筆。

## 架構決定

- **逐字稿來源順序**（`lib/transcript.ts`）：YouTube 字幕（`youtube-transcript-plus`，免 key）→ Groq Whisper（`lib/groqTranscript.ts`，yt-dlp 下載、ffmpeg 切 10 分鐘一段）→ Supadata（選填）。中文結果一律經 OpenCC（`cn`→`twp`）轉成台灣繁體，因為 Whisper 會混出簡體。
- **LLM**（`lib/llmChain.ts`）：`glm-4.7`（Z.AI）與 `deepseek-chat`，缺 key 的模型回傳 null 並被略過。
- **新增 key 的服務**要同步改：`lib/userConfig.ts`、`app/api/setup/save-key`、`app/api/setup/test-key`、`app/api/settings/api-keys`、`app/api/setup/status`、`app/settings/page.tsx`、`app/setup/page.tsx`，以及 `components/model-dropdown.tsx` 與 `model-selector-cards.tsx`。
- **摘要語言** `zh-TW` 為預設。語言名稱表在 `app/api/summarize/route.ts` 的 `LANGUAGE_NAMES`，選單在 `components/language-dropdown.tsx`，章節標題 prompt 在 `lib/topicExtraction.ts`。
- **註冊**只有 Email 與密碼，不設安全問題（因此新帳號無法自助重設密碼）。密碼規則：8 字元以上、大寫、小寫、數字；同一套規則在 `lib/auth-server.ts`、`app/register/page.tsx`、`app/forgot-password/page.tsx` 各有一份，改規則時三處一起改。

## 陷阱

- 資料庫是**專案根目錄的 `dev.db`**，路徑相對於工作目錄。用 sqlite 開 `prisma/dev.db` 會產生空檔，並讓 git 追蹤的 `prisma/dev.db-journal` 被刪除（`git checkout -- prisma/dev.db-journal` 還原）。
- React StrictMode 在開發模式會讓頁面請求送出兩次。前端用 `useRef` 去重，後端建立 Summary 遇到唯一鍵衝突（Prisma `P2002`）時回傳已存的那份；兩層都要保留。
- Whisper 的 `language: "zh"` 加繁體提示詞仍不保證輸出繁體，簡轉繁以 OpenCC 為準。
- `.env` 已被 git 忽略，內含本機產生的密鑰，不要提交。

## Git

- `origin` 是 Jimmy 的 fork，`upstream` 是原作者；只推 `origin`。
- 改動先放分支，經 Jimmy 同意後再合進 `main`。
- commit 訊息結尾附 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`。
