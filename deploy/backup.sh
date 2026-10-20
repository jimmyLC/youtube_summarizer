#!/usr/bin/env bash
# Consistent copy of the SQLite database using the app's own Node (no sqlite3 CLI needed).
# Keeps the last 14 days in ./backups.
set -euo pipefail

cd "$(dirname "$0")/.."
export PATH="$PWD/node/bin:$PATH"
DEST="${BACKUP_DIR:-$PWD/backups}"
mkdir -p "$DEST"

DEST="$DEST" node -e '
require("dotenv").config()
const Database = require("better-sqlite3")
const db = new Database(process.env.DATABASE_URL.replace(/^file:/, ""))
const out = `${process.env.DEST}/app-${new Date().toISOString().slice(0, 10)}.db`
db.backup(out).then(() => { db.close(); console.log("backup:", out) })
'
find "$DEST" -name 'app-*.db' -mtime +14 -delete
