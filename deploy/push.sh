#!/usr/bin/env bash
# Run on your Mac: copies the code to the server and installs/updates it there.
#   ./deploy/push.sh <ssh-host> https://yt.jimmy-tools.com
# .env, data/ and node_modules are never copied or overwritten.
set -euo pipefail

HOST="${1:?Usage: ./deploy/push.sh <ssh-host> <https://site-url>}"
SITE_URL="${2:?Usage: ./deploy/push.sh <ssh-host> <https://site-url>}"
REMOTE_DIR="${REMOTE_DIR:-/srv/yt-summarizer}"

cd "$(dirname "$0")/.."

ssh "$HOST" "mkdir -p '$REMOTE_DIR'"
rsync -az --delete \
  --exclude '.git' --exclude 'node_modules' --exclude '.next' --exclude '.npm' \
  --exclude '/data' --exclude '/backups' --exclude '/node' --exclude '/bin' \
  --exclude '.env' --exclude '.env.*' --exclude '*.db' --exclude '*.db-journal' \
  --exclude 'tsconfig.tsbuildinfo' --exclude '.DS_Store' \
  ./ "$HOST:$REMOTE_DIR/"
ssh "$HOST" "cd '$REMOTE_DIR' && chmod +x deploy/*.sh && ./deploy/setup.sh '$SITE_URL'"
