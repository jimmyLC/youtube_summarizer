#!/bin/zsh
# 在 Mac mini 上安裝並以 launchd 常駐執行 YT Summarizer。
# 用法：在專案根目錄執行  ./deploy/install-macmini.sh https://yt.jimmy-tools.com
# 可重複執行（更新程式後再跑一次即可）。
set -euo pipefail

SITE_URL="${1:-}"
if [[ -z "$SITE_URL" ]]; then
  echo "請帶入網站網址，例如：./deploy/install-macmini.sh https://yt.jimmy-tools.com"
  exit 1
fi

cd "$(dirname "$0")/.."
APP_DIR="$PWD"
LABEL="com.jimmy.yt-summarizer"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/yt-summarizer.log"
NODE_BIN="/opt/homebrew/opt/node@22/bin"

echo "==> 1/6 安裝系統套件（Node 22、yt-dlp、ffmpeg、cloudflared）"
for pkg in node@22 yt-dlp ffmpeg cloudflared; do
  brew list "$pkg" >/dev/null 2>&1 || brew install "$pkg"
done
export PATH="$NODE_BIN:/opt/homebrew/bin:$PATH"

echo "==> 2/6 安裝相依套件"
npm ci --legacy-peer-deps

echo "==> 3/6 建立 .env（已存在則只更新網址）"
if [[ ! -f .env ]]; then
  cp .env.example .env
  sed -i '' "s|^APP_SECRET=.*|APP_SECRET=$(openssl rand -hex 32)|" .env
  sed -i '' "s|^BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=$(openssl rand -base64 32)|" .env
fi
sed -i '' "s|^BETTER_AUTH_URL=.*|BETTER_AUTH_URL=$SITE_URL|" .env
sed -i '' "s|^DATABASE_URL=.*|DATABASE_URL=\"file:$APP_DIR/dev.db\"|" .env

echo "==> 4/6 初始化資料庫並建置"
npx prisma generate
npx prisma db push
npx prisma db seed
npm run build

echo "==> 5/6 註冊開機自動啟動（launchd）"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>WorkingDirectory</key><string>$APP_DIR</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN/npm</string>
    <string>start</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$NODE_BIN:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>NODE_ENV</key><string>production</string>
    <key>PORT</key><string>3000</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLISTEOF
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

echo "==> 6/6 完成"
sleep 4
curl -s -o /dev/null -w "本機測試 http://localhost:3000 → HTTP %{http_code}\n" http://localhost:3000 || true
echo "日誌：$LOG"
echo "接下來請依 deploy/README.md 設定 Cloudflare Tunnel 與電源設定。"
