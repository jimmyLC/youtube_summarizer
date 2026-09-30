#!/bin/zsh
# 備份 SQLite 資料庫到 ~/yt-summarizer-backups，保留最近 14 份。
set -euo pipefail
cd "$(dirname "$0")/.."
DEST="$HOME/yt-summarizer-backups"
mkdir -p "$DEST"
sqlite3 dev.db ".backup '$DEST/dev-$(date +%Y%m%d-%H%M).db'"
ls -1t "$DEST"/dev-*.db | tail -n +15 | xargs -I{} rm -f "{}"
echo "備份完成：$DEST"
