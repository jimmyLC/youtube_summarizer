# YT摘要筆記

貼上 YouTube 連結，立刻得到重點摘要與逐字稿。以繁體中文為主，介面可切換中英文，手機可加到主畫面當 App 用（PWA）。

- 有字幕的影片直接用字幕；沒有字幕的影片用 Groq Whisper 轉錄語音。
- 也可以上傳本地影片或錄音（單檔 1GB、3 小時內）：在瀏覽器裡先抽出聲音再上傳，轉完不保留原檔。
- DeepSeek 產生重點摘要（附時間戳）與標籤。
- 歷史紀錄與標籤分類，Google 帳號登入。

## 本機執行

需要 Node 22、`yt-dlp`、`ffmpeg`。

```bash
npm install
cp .env.example .env   # 填入各項設定
npx prisma db push
npm run dev
```

Google 登入：在 Google Cloud Console 建立「OAuth 用戶端 ID」（網頁應用程式），授權重新導向 URI 填 `http://localhost:3000/api/auth/callback/google`（正式站換成正式網址）。

技術：Next.js 16、Prisma + SQLite、better-auth、Tailwind。原始專案 fork 自 [DevRico003/youtube_summarizer](https://github.com/DevRico003/youtube_summarizer)（MIT）。
