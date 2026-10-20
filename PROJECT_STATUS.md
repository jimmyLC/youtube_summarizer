# 進度

最後更新：2026-10-20

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

## 本地影片上傳（分支 `feat-local-upload`，尚未合進 `main`、尚未部署）

Jimmy 的需求：上傳本地影片／錄音，一樣產出逐字稿和摘要。討論後的決定：影片和純音訊都收（mp4、mov、m4a、mp3、wav 等），單檔 1GB、長度 3 小時；只轉語音；原檔不保留；上傳時可填標題和「筆記本」（沒填進「本地上傳」）；摘要完成後，沒手動改過的標題會換成 AI 標題；同檔名同大小提醒已轉過。

做法：**瀏覽器先用 ffmpeg.wasm 把聲音抽成 32kbps 單聲道 mp3**（3 小時約 43MB），只上傳這個小檔，所以不受 Cloudflare 100MB 限制，VPS 不用跑重的 ffmpeg。伺服器收到後走原本的切段、Groq、OpenAI 備援、OpenCC、DeepSeek 流程，轉完就刪音檔。

已驗證（本機，用合成的中文語音 mp4）：抽音訊（音訊 286 倍速）、上傳、轉錄、摘要、AI 換標題、音檔轉完自動刪除、手動標題不被覆蓋、沒有聲音的影片與不支援的檔案類型會顯示錯誤、重複檔案提醒、伺服器端 80MB 上限與未登入拒絕、損壞音檔進入錯誤狀態並保留音檔供重試、刪除影片會刪音檔、`tsc`、`eslint`、`next build`。

**尚未驗證：** 真實的大檔（~1GB）抽音訊要多久、記憶體撐不撐得住（Jimmy 選擇不先驗證，直接做）；VPS 上的實測（VPS 只有 ffmpeg 沒有 ffprobe，長度檢查改用 ffmpeg 的輸出，本機沒測過 VPS 那份 ffmpeg）；手機。若大檔太慢，備案是改成切塊上傳原檔、由 VPS 抽音訊。

## 待辦

- [ ] 用真實大檔實測本地上傳，通過後合進 `main` 並部署。

- [x] VPS 部署：已上線 https://yt.jimmy-tools.com，舊版 Mac mini 的網址已改指到 VPS（Hetzner VPS，隔離在 `/srv/yt-summarizer`，其他專案不受影響），2026-10-21。
- [x] YouTube 擋機房 IP：以家裡 Mac mini 的 tinyproxy 中繼解決（`YOUTUBE_PROXY`，只允許 YouTube 網域、只開給 VPS 的 Tailscale 位址）。已在 VPS 上實測有字幕與無字幕（Groq）影片都成功。**依賴 Mac mini 開機與登入桌面**；之後可改放 NAS。
- [x] Cloudflare Tunnel `yt-summarizer-vps` 與 Google 登入網址已設定。
- [ ] Jimmy 用手機登入驗證 Google 登入（Google 設定可能要幾分鐘才生效）。
- [ ] 手機實測 PWA（加到主畫面、Google 登入、分享）。
- [x] 舊版 v1 已全部清除（2026-10-21）：Mac mini 上的舊服務、`~/youtube_summarizer`（含舊資料庫）、舊 Tunnel 的憑證與設定、舊日誌，以及 Cloudflare 後台舊的 Tunnel `yt-summarizer` 都已刪除；舊分支也已刪除，只剩 `main`。Mac mini 現在只負責 YouTube 中繼 `com.jimmy.yt-relay`（`~/.cloudflared/cert.pem` 是帳號登入憑證，留著未刪）。
