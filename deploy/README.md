# 部署到 Mac mini（Cloudflare Tunnel + launchd）

架構：Mac mini 上用 `launchd` 常駐執行 Next.js（port 3000），再用 Cloudflare Tunnel 把
`https://yt.jimmy-tools.com` 轉到 `localhost:3000`。不需要在路由器開 port，也不需要固定 IP。

## 事前準備

- Mac mini 已安裝 Homebrew，並已登入 GitHub（`git clone` 用）。
- 網域 `jimmy-tools.com` 的 DNS 由 Cloudflare 管理。
- 每位使用者自己在網站的設定頁填入 Groq 與 DeepSeek 的 API key（不會花到你的錢）。

## 步驟

### 1. 下載程式並安裝

```bash
git clone https://github.com/jimmyLC/youtube_summarizer.git
cd youtube_summarizer
./deploy/install-macmini.sh https://yt.jimmy-tools.com
```

腳本會安裝 Node 22、yt-dlp、ffmpeg、cloudflared，建立 `.env`、初始化資料庫、建置，
並註冊開機自動啟動。完成後 `http://localhost:3000` 應回傳 HTTP 200。

### 2. 設定 Cloudflare Tunnel

```bash
cloudflared tunnel login                      # 瀏覽器會開啟，選 jimmy-tools.com 授權
cloudflared tunnel create yt-summarizer       # 記下輸出的 Tunnel ID
cloudflared tunnel route dns yt-summarizer yt.jimmy-tools.com
```

建立 `~/.cloudflared/config.yml`（把兩處 `<TUNNEL-ID>` 和 `<你的使用者名稱>` 換掉）：

```yaml
tunnel: <TUNNEL-ID>
credentials-file: /Users/<你的使用者名稱>/.cloudflared/<TUNNEL-ID>.json

ingress:
  - hostname: yt.jimmy-tools.com
    service: http://localhost:3000
  - service: http_status:404
```

設成開機自動啟動：

```bash
cloudflared service install
```

### 3. 讓 Mac mini 不要睡著、停電後自動開機

```bash
sudo pmset -a sleep 0 disksleep 0 autorestart 1
```

### 4. 驗證

- 開啟 `https://yt.jimmy-tools.com`，註冊帳號、填入 API key、貼一支影片測試。
- 重開機一次，確認網站自己回來。

## 日常維運

| 事項 | 指令 |
|---|---|
| 看日誌 | `tail -f ~/Library/Logs/yt-summarizer.log` |
| 更新程式 | `git pull && ./deploy/install-macmini.sh https://yt.jimmy-tools.com` |
| 重新啟動 | `launchctl kickstart -k gui/$(id -u)/com.jimmy.yt-summarizer` |
| 停止服務 | `launchctl bootout gui/$(id -u)/com.jimmy.yt-summarizer` |
| 備份資料庫 | `./deploy/backup-db.sh` |

每天凌晨 3 點自動備份（`crontab -e` 加入，路徑換成實際位置）：

```
0 3 * * * cd /Users/<你的使用者名稱>/youtube_summarizer && ./deploy/backup-db.sh
```

## 注意事項

- **同時轉錄上限**：沒有字幕的影片要下載音訊，預設最多同時 2 支，多的會排隊。
  可用環境變數 `MAX_CONCURRENT_TRANSCRIPTIONS` 調整。
- **開放註冊**：任何人都能註冊。摘要與轉錄用的是各人自己的 API key，但下載音訊走的是你家的網路。
  若發現濫用，可調低上述上限，或在 Cloudflare 對該網域加上速率限制規則。
- **必須是 HTTPS**：正式環境登入 Cookie 只在 HTTPS 下有效，請一律透過 Tunnel 的網址使用，
  不要直接用 `http://<區網 IP>:3000` 登入。
- **新帳號沒有「忘記密碼」機制**：註冊時已不設安全問題，使用者忘記密碼只能由你在資料庫處理。
- **Node 版本**：請固定使用 Node 22（腳本已處理）。`better-sqlite3` 是原生模組，安裝時的 Node 版本和執行時不同會導致資料庫載入失敗。
