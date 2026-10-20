# 部署到 VPS（Ubuntu + Cloudflare Tunnel）

設計給**同一台機器上還有其他專案**的情況：所有東西只放在 `/srv/yt-summarizer`，用專用帳號 `ytsum`，
自帶 Node 22、yt-dlp、ffmpeg，不裝系統套件、不動防火牆、不換系統 Node，Cloudflare Tunnel 另開獨立服務。
網站只聽 `127.0.0.1:3210`。記憶體有上限（建置 1.7GB、執行 1.2GB），不會拖垮同機的其他服務。

## 第一次部署與更新

在 Mac 上、專案資料夾裡執行（同一行指令，第一次和之後更新都一樣）：

```bash
./deploy/push.sh javis-prod https://yt.jimmy-tools.com
```

它會用 rsync 把程式複製到伺服器（不會碰 `.env`、`data/`），再執行 `deploy/setup.sh`：
安裝或更新、建置、重啟服務。最後印出 `App check: 200`。

## 第一次要手動做的事

**1. 填 `.env`**（只第一次）：伺服器上的 `/srv/yt-summarizer/.env` 由腳本產生，登入密鑰是它自己隨機產生的。
需要自己填的值：`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`ALLOWED_EMAILS`、`GROQ_API_KEY`、`OPENAI_API_KEY`、`DEEPSEEK_API_KEY`。
改完執行 `systemctl restart yt-summarizer`。

**2. Cloudflare Tunnel**（獨立的一條，不要動既有的）：
1. Cloudflare → Zero Trust → Networks → Tunnels → Create a tunnel → Cloudflared，名稱 `yt-summarizer`。
2. 複製畫面上的 token，在伺服器存成 token 檔：
   ```bash
   mkdir -p /etc/cloudflared-ytsum && umask 077 && nano /etc/cloudflared-ytsum/token
   ```
3. Public Hostname：Subdomain `yt`、Domain `jimmy-tools.com`、Service `HTTP`、URL `localhost:3210`。
4. 再執行一次 `./deploy/push.sh ...`（或在伺服器上 `./deploy/setup.sh https://yt.jimmy-tools.com`），會建立並啟動 `cloudflared-ytsum` 服務。

**3. Google 登入**：Google Cloud Console → 憑證 → OAuth 用戶端 → 已授權的重新導向 URI 新增
`https://yt.jimmy-tools.com/api/auth/callback/google`。

## YouTube 擋機房 IP

2026-10-21 實測：這台 Hetzner VPS 的 IP 被 YouTube 判定為機器人（`Sign in to confirm you're not a bot`），
yt-dlp 下載音訊與字幕函式庫都失敗；只有標題查詢（oEmbed）可用。解法見 `PROJECT_STATUS.md`。

## 日常維運

| 事項 | 指令（在伺服器上） |
|---|---|
| 看日誌 | `journalctl -u yt-summarizer -f` |
| 重新啟動 | `systemctl restart yt-summarizer` |
| 狀態 | `systemctl status yt-summarizer cloudflared-ytsum` |
| 備份資料庫 | `sudo -u ytsum /srv/yt-summarizer/deploy/backup.sh`（存在 `/srv/yt-summarizer/backups`，每天 03:00 自動備份，留 14 天） |
| 更新 yt-dlp | `sudo -u ytsum env HOME=/srv/yt-summarizer /srv/yt-summarizer/bin/yt-dlp -U` |

## 注意事項

- `.env` 只存在伺服器上，不要提交到 git。
- 同時轉錄上限預設 2 支，可在 `.env` 加 `MAX_CONCURRENT_TRANSCRIPTIONS`。
- 要開放給別人用：清空 `ALLOWED_EMAILS`，但每個人用的都是你的 Groq／DeepSeek／OpenAI 額度。
- 備份和資料庫都在同一台機器上；重要資料請偶爾下載一份，或開 Hetzner 的快照。
