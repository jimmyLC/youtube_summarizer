# 進度

最後更新：2026-10-15

## 目標

貼 YouTube 連結，產出**逐字稿**與 **AI 重點摘要**，以繁體中文為主。

## 已完成（都已合進 `main`）

- 從 `DevRico003/youtube_summarizer` fork 到 `jimmyLC/youtube_summarizer`。
- 繁體中文（`zh-TW`）加入語言選單並設為預設，摘要與章節標題都用繁體中文。
- 新增 **DeepSeek** 作為摘要模型（與原本的 Z.AI GLM-4.7 並列），設定精靈可切換。
- 逐字稿改為 **YouTube 字幕 → Groq Whisper → Supadata** 三層備援；不再必須有 Supadata。
- 中文逐字稿自動簡轉繁（OpenCC，台灣用詞）。
- 註冊精簡：拿掉安全問題那一步，密碼改為 8 字元＋大小寫＋數字。
- 修正重複存檔錯誤（`Unique constraint failed`）、頁面標題抓不到、章節標題是英文。
- 新增 Mac mini 部署腳本與說明（`deploy/`）、轉錄同時上限（預設 2）。
- **已上線**：https://yt.jimmy-tools.com 跑在 Mac mini（launchd 常駐 + Cloudflare Tunnel `yt-summarizer`），2026-10-15 確認可連線。
- 修正 README：macOS 的 `cloudflared service install` 產生的服務沒有帶 `tunnel run` 會立刻結束（Error 1033），改用自訂 launchd 設定。

## 驗證結果

用影片 `0dpoc2Enbz4`（18 分鐘、中文、字幕關閉）在本機以 Chrome 實測：走 Groq Whisper → DeepSeek，產出繁體中文標題、8 個章節、重點摘要與帶時間戳的繁體逐字稿，無錯誤訊息。

## 待辦

- [ ] **開啟 Mac mini 自動登入**：網站與 Tunnel 都是使用者層級服務，沒登入桌面就不會執行（系統設定 → 使用者與群組 → 自動登入）。
- [ ] **重開機測試**：重開後等一兩分鐘，確認網站與 Tunnel 自己恢復。
- [ ] 實測 YouTube 是否會擋家用 IP（沒有字幕的影片走 yt-dlp 下載音訊）。
- [ ] 介面文字（按鈕、說明）仍是英文，只有 AI 產出是繁體中文；是否中文化待決定。
- [ ] 開放註冊後的濫用防護（目前只有轉錄同時上限與每人每分鐘 10 次的摘要限制）。
- [ ] 忘記密碼：新帳號沒有安全問題，只能由管理者處理，需要時再補機制。
- [ ] `__tests__/` 是原作者留下的測試，仍引用已移除的模型，與我們的改動無關，需要時再整理。
- [ ] 可選：摘要改用 Groq 上的 Llama，讓使用者只需要一組 key。
