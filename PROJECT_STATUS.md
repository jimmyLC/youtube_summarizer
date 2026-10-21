# 進度

最後更新：2026-10-20（本地上傳、筆記本管理已部署）

## 目標

貼 YouTube 連結，立刻得到**重點摘要**與**逐字稿**，以繁體中文為主。目前自己用，之後可能開放；最終放 VPS，外網可用。

## v2 重寫（已合進 `main`，2026-10-21）

Jimmy 2026-10-20 的需求：介面中英切換、輸入網址立即轉換、下方直接是歷史紀錄、標籤分類（自動＋手動）、簡潔、API key 寫死、PWA、Google 登入、之後放 VPS。

已完成：
- 整個 app 重寫，舊的註冊／設定精靈／模型選擇／安全問題／章節編輯全部移除。
- 單頁首頁：輸入框（貼上即轉換）＋標籤篩選＋歷史紀錄。影片頁：重點／逐字稿分頁、時間戳連到 YouTube、複製、刪除、重試、改用另一種語言重新產生。
- 標籤：AI 自動給 1–3 個（優先沿用現有標籤），可手動新增／移除。
- 頻道筆記本：首頁「頻道」分頁，依 YouTube 頻道整理摘要（例如游庭皓的財經皓角底下就是他所有轉過的影片）。
- OpenAI Whisper 當轉錄備援（Groq 失敗時接手）。
- 中英介面切換（cookie 記住），深淺色跟隨系統，手機版面。
- Google 登入＋ `ALLOWED_EMAILS` 白名單（本機預設 `acsd68500@gmail.com`）。
- PWA：manifest、圖示、service worker、Android 分享選單。
- Groq 與 DeepSeek key 改為 `.env`。

已驗證（本機）：登入頁、首頁、影片頁（手機尺寸、深淺色、中英切換）、新增標籤、有字幕影片抓逐字稿、沒有 DeepSeek key 時顯示「摘要產生失敗」、API 的重試／刪除／無效網址／標籤取代、`tsc`、`eslint`、`next build`。

Jimmy 已用 Google 登入並轉換過影片；完整流程（Groq → DeepSeek）已實測。尚未驗證：OpenAI 備援的自動切換（只直接呼叫過 whisper-1）、iPhone 加到主畫面後的登入。

## 本地影片上傳（已合進 `main` 並部署到 VPS，2026-10-20）

Jimmy 的需求：上傳本地影片／錄音，一樣產出逐字稿和摘要。討論後的決定：影片和純音訊都收（mp4、mov、m4a、mp3、wav 等），單檔 1GB、長度 3 小時；只轉語音；原檔不保留；上傳時可填標題和「筆記本」（沒填進「本地上傳」）；摘要完成後，沒手動改過的標題會換成 AI 標題；同檔名同大小提醒已轉過。

做法：**瀏覽器先用 ffmpeg.wasm 把聲音抽成 32kbps 單聲道 mp3**（3 小時約 43MB），只上傳這個小檔，所以不受 Cloudflare 100MB 限制，VPS 不用跑重的 ffmpeg。伺服器收到後走原本的切段、Groq、OpenAI 備援、OpenCC、DeepSeek 流程，轉完就刪音檔。

已驗證（本機，用合成的中文語音 mp4）：抽音訊（音訊 286 倍速）、上傳、轉錄、摘要、AI 換標題、音檔轉完自動刪除、手動標題不被覆蓋、沒有聲音的影片與不支援的檔案類型會顯示錯誤、重複檔案提醒、伺服器端 80MB 上限與未登入拒絕、損壞音檔進入錯誤狀態並保留音檔供重試、刪除影片會刪音檔、`tsc`、`eslint`、`next build`。

**後續：** Jimmy 已在本機用真實檔案測過後才合併。尚未驗證：VPS 上的實測（VPS 只有 ffmpeg 沒有 ffprobe，長度檢查改用 ffmpeg 的輸出，本機沒測過 VPS 那份 ffmpeg）；手機。若大檔太慢，備案是改成切塊上傳原檔、由 VPS 抽音訊。

## 筆記本管理與標籤分頁（已合進 `main` 並部署到 VPS，2026-10-20）

Jimmy 的需求：頻道名稱可以新增、編輯、刪除，並把影片自己分類；分頁多一個「標籤」，點標籤列出相關影片。決定：「頻道」改成自己管理的「筆記本」；改名後新影片仍自動進同一個筆記本；刪除筆記本只刪筆記本、影片移到「未分類」；分類方式是影片頁換筆記本＋筆記本頁勾選批次搬移；標籤分頁含改名（同名則合併）與刪除，並移除「全部紀錄」上方的標籤篩選列。

已驗證（本機，測試帳號）：新增、改名、重名被擋、刪除筆記本（確認視窗顯示影片數）、影片頁換筆記本與建立新筆記本、選取模式批次搬移、標籤分頁改名合併與刪除、新轉 YouTube 影片自動進筆記本且改名後仍跟著走、舊資料遷移（Jimmy 的兩個頻道轉成筆記本，影片都在）、`tsc`、`eslint`、`next build`。遷移前已備份 `data/app.db.bak-before-notebooks`（不進 git）。
尚未驗證：手機版面。

## YouTube 會員專屬影片（已合進 `main` 並部署到 VPS，2026-10-21）

Jimmy 的需求：有些頻道有會員專區影片，也想做摘要。App 內登入做不到（Google 不允許嵌入登入，我們的 Google 登入也拿不到 YouTube 網站權限），改用 cookies：Jimmy 在設定頁匯入一次 YouTube 登入狀態（步驟寫在頁面裡），只在一般下載因會員專屬失敗時才自動帶 cookies 重試；只限 `acsd68500@gmail.com`；會員影片不抓字幕，一律下載音訊轉文字。下載走家裡 Mac mini 的中繼，所以 YouTube 看到的是家裡的 IP。

已驗證（本機，用假的 yt-dlp 模擬會員專屬錯誤）：沒存登入 → `MEMBERS_ONLY`；存了 cookies → 先試一般下載失敗、再帶 cookies 成功、轉出逐字稿與摘要；cookies 失效 → `COOKIES_EXPIRED`；只留 YouTube／Google 的 cookies（facebook 等其他網域不存）；檔案權限 600／目錄 700；暫存複本用完即刪；無效內容與缺登入 cookie 被拒；未登入或不在白名單回 403；設定頁與選單連結；`tsc`、`eslint`、`next build`。
Jimmy 已在本機匯出 cookies 並成功轉了真的會員影片（九日說白話 219 會員版）。VPS `.env` 已加 `MEMBER_COOKIES_EMAILS`。**尚未驗證：** 在 VPS 上用真的 cookies 轉會員影片（要在線上設定頁重新貼 cookies，本機與線上各存各的；VPS 走家裡中繼）；yt-dlp 實際回報的會員專屬錯誤文字是否都符合我寫的判斷（依官方訊息寫，但沒有真實樣本）。

同日另外修正標籤：改成**不讓 AI 看到現有標籤**，只看內容決定標籤，再以「同一個詞」（忽略大小寫、空格、#、臺／台）沿用現有標籤的寫法；原本在提示詞裡叫 AI「合適就沿用」，AI 會把舊標籤硬套在不相關的影片上（重現過多次）。意思相近但寫法不同的標籤不會自動合併，可在標籤分頁手動合併。

## 待辦

- [x] 本地上傳、標籤提示詞修正、筆記本管理與標籤分頁：Jimmy 在本機測過後合併並部署；VPS 上的資料庫是空的，筆記本遷移跑了 0 個頻道（正常）。部署前已備份 VPS 資料庫。
- [ ] 在 VPS 上實測一次本地上傳（長度檢查用 ffmpeg 輸出，本機沒測過 VPS 那份 ffmpeg）。

- [x] VPS 部署：已上線 https://yt.jimmy-tools.com，舊版 Mac mini 的網址已改指到 VPS（Hetzner VPS，隔離在 `/srv/yt-summarizer`，其他專案不受影響），2026-10-21。
- [x] YouTube 擋機房 IP：以家裡 Mac mini 的 tinyproxy 中繼解決（`YOUTUBE_PROXY`，只允許 YouTube 網域、只開給 VPS 的 Tailscale 位址）。已在 VPS 上實測有字幕與無字幕（Groq）影片都成功。**依賴 Mac mini 開機與登入桌面**；之後可改放 NAS。
- [x] Cloudflare Tunnel `yt-summarizer-vps` 與 Google 登入網址已設定。
- [ ] Jimmy 用手機登入驗證 Google 登入（Google 設定可能要幾分鐘才生效）。
- [ ] 手機實測 PWA（加到主畫面、Google 登入、分享）。
- [x] 舊版 v1 已全部清除（2026-10-21）：Mac mini 上的舊服務、`~/youtube_summarizer`（含舊資料庫）、舊 Tunnel 的憑證與設定、舊日誌，以及 Cloudflare 後台舊的 Tunnel `yt-summarizer` 都已刪除；舊分支也已刪除，只剩 `main`。Mac mini 現在只負責 YouTube 中繼 `com.jimmy.yt-relay`（`~/.cloudflared/cert.pem` 是帳號登入憑證，留著未刪）。
