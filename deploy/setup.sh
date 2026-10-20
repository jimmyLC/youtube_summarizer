#!/usr/bin/env bash
# Installs or updates the app on a Linux server that may already host other projects.
# Everything stays inside the app folder: own Node 22, own yt-dlp and ffmpeg, own user,
# own systemd units. No apt packages, no firewall changes, no system Node changes.
#
# Run as root from the app folder (deploy/push.sh does this for you):
#   ./deploy/setup.sh https://yt.jimmy-tools.com
# Safe to run again; that is also how you deploy an update.
set -euo pipefail

SITE_URL="${1:?Usage: ./deploy/setup.sh https://your-domain}"
[ "$(id -u)" -eq 0 ] || { echo "Run as root"; exit 1; }

cd "$(dirname "$0")/.."
APP_DIR="$PWD"
APP_USER="ytsum"
PORT="${PORT:-3210}"
MEM_BUILD="${MEM_BUILD:-1700M}" # hard cap for the build, so it cannot starve other services
MEM_RUN="${MEM_RUN:-1200M}"     # hard cap for the running app (including yt-dlp and ffmpeg)

case "$(uname -m)" in
  x86_64) NODE_ARCH=x64; FFMPEG_BUILD=linux64; YTDLP=yt-dlp_linux ;;
  aarch64) NODE_ARCH=arm64; FFMPEG_BUILD=linuxarm64; YTDLP=yt-dlp_linux_aarch64 ;;
  *) echo "Unsupported CPU: $(uname -m)"; exit 1 ;;
esac

mkdir -p "$APP_DIR/bin" "$APP_DIR/data"

echo "==> Node 22 (private copy in $APP_DIR/node)"
if ! "$APP_DIR/node/bin/node" -v 2>/dev/null | grep -q '^v22\.'; then
  BASE="https://nodejs.org/dist/latest-v22.x"
  FILE="$(curl -fsSL "$BASE/SHASUMS256.txt" | awk "/linux-$NODE_ARCH.tar.xz/ {print \$2}")"
  WANT="$(curl -fsSL "$BASE/SHASUMS256.txt" | awk "/linux-$NODE_ARCH.tar.xz/ {print \$1}")"
  curl -fsSL "$BASE/$FILE" -o /tmp/ytsum-node.tar.xz
  echo "$WANT  /tmp/ytsum-node.tar.xz" | sha256sum -c -
  rm -rf "$APP_DIR/node" && mkdir "$APP_DIR/node"
  tar -xJf /tmp/ytsum-node.tar.xz -C "$APP_DIR/node" --strip-components=1
  rm -f /tmp/ytsum-node.tar.xz
fi
"$APP_DIR/node/bin/node" -v

echo "==> yt-dlp and ffmpeg (private copies in $APP_DIR/bin)"
if [ ! -x "$APP_DIR/bin/yt-dlp" ]; then
  curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/$YTDLP" -o "$APP_DIR/bin/yt-dlp"
  chmod 755 "$APP_DIR/bin/yt-dlp"
fi
if [ ! -x "$APP_DIR/bin/ffmpeg" ]; then
  # Static build from GitHub (~150 MB download); only the ffmpeg binary is kept
  TMP="$(mktemp -d)"
  curl -fsSL "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-$FFMPEG_BUILD-gpl.tar.xz" -o "$TMP/ffmpeg.tar.xz"
  tar -xJf "$TMP/ffmpeg.tar.xz" -C "$TMP" --wildcards '*/bin/ffmpeg'
  mv "$TMP"/ffmpeg-*/bin/ffmpeg "$APP_DIR/bin/ffmpeg"
  rm -rf "$TMP"
  chmod 755 "$APP_DIR/bin/ffmpeg"
fi
"$APP_DIR/bin/yt-dlp" --version
"$APP_DIR/bin/ffmpeg" -version | head -1

echo "==> App user"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --home-dir "$APP_DIR" --no-create-home --shell /usr/sbin/nologin "$APP_USER"

echo "==> .env"
if [ ! -f .env ]; then
  cat > .env <<ENV
DATABASE_URL="file:$APP_DIR/data/app.db"
BETTER_AUTH_SECRET="$(openssl rand -base64 32)"
BETTER_AUTH_URL="$SITE_URL"
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
ALLOWED_EMAILS=""
GROQ_API_KEY=""
OPENAI_API_KEY=""
DEEPSEEK_API_KEY=""
ENV
  echo "Created .env with empty keys. Fill them in, then run: systemctl restart yt-summarizer"
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
chmod 600 .env

echo "==> Install, database, build (memory capped at $MEM_BUILD)"
runuser -u "$APP_USER" -- true # fail early if the user is unusable
systemd-run --scope --quiet -p "MemoryMax=$MEM_BUILD" -p "MemorySwapMax=1G" \
  runuser -u "$APP_USER" -- env \
    HOME="$APP_DIR" \
    PATH="$APP_DIR/node/bin:$APP_DIR/bin:/usr/local/bin:/usr/bin:/bin" \
    NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS="--max-old-space-size=1280" \
    nice -n 10 bash -c "cd '$APP_DIR' && npm ci --no-audit --no-fund && npx prisma db push && npm run build"
runuser -u "$APP_USER" -- "$APP_DIR/bin/yt-dlp" -U >/dev/null 2>&1 || true

echo "==> systemd service (port $PORT, localhost only)"
cat > /etc/systemd/system/yt-summarizer.service <<UNIT
[Unit]
Description=YT Summary
After=network-online.target
Wants=network-online.target

[Service]
User=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
Environment=NODE_ENV=production
Environment=HOME=$APP_DIR
Environment=PATH=$APP_DIR/node/bin:$APP_DIR/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=$APP_DIR/node/bin/node $APP_DIR/node_modules/next/dist/bin/next start -H 127.0.0.1 -p $PORT
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
# Be polite to the other projects on this machine
MemoryMax=$MEM_RUN
CPUWeight=50
Nice=5

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable yt-summarizer >/dev/null
systemctl restart yt-summarizer

echo "==> Cloudflare Tunnel (separate service; other tunnels are not touched)"
if [ -s /etc/cloudflared-ytsum/token ]; then
  cat > /etc/systemd/system/cloudflared-ytsum.service <<UNIT
[Unit]
Description=Cloudflare Tunnel for YT Summary
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=$(command -v cloudflared) --no-autoupdate tunnel run --token-file /etc/cloudflared-ytsum/token
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload
  systemctl enable cloudflared-ytsum >/dev/null
  systemctl restart cloudflared-ytsum
else
  echo "No /etc/cloudflared-ytsum/token yet; create the tunnel first (deploy/README.md step 3)."
fi

echo "==> Daily database backup at 03:00"
cat > /etc/cron.d/yt-summarizer-backup <<CRON
0 3 * * * $APP_USER $APP_DIR/deploy/backup.sh
CRON

sleep 4
echo
echo "App check: $(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/") (200 means it is running)"
