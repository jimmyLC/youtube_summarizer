// One-time: turns the YouTube channel names already stored on videos into notebooks.
// Safe to run again: it only runs while PRAGMA user_version is 0, so notebooks the user
// later deletes are not brought back. Used by deploy/setup.sh and by hand locally.
import "dotenv/config"
import Database from "better-sqlite3"
import { randomBytes } from "node:crypto"

const file = (process.env.DATABASE_URL || "file:./data/app.db").replace(/^file:/, "")
const db = new Database(file)
if (db.pragma("user_version", { simple: true }) >= 1) {
  console.log("notebooks: already migrated")
  process.exit(0)
}

const id = () => "c" + randomBytes(12).toString("hex")
const now = new Date().toISOString()
const rows = db
  .prepare("SELECT DISTINCT userId, channel, origin FROM Video WHERE channel != '' AND notebookId IS NULL")
  .all()
const find = db.prepare("SELECT id FROM Notebook WHERE userId = ? AND name = ?")
const insert = db.prepare("INSERT INTO Notebook (id, userId, name, matchChannel, createdAt) VALUES (?, ?, ?, ?, ?)")
const assign = db.prepare("UPDATE Video SET notebookId = ? WHERE userId = ? AND channel = ? AND notebookId IS NULL")

db.transaction(() => {
  for (const { userId, channel, origin } of rows) {
    const nb = find.get(userId, channel)?.id ?? id()
    if (!find.get(userId, channel)) insert.run(nb, userId, channel, origin === "upload" ? "" : channel, now)
    assign.run(nb, userId, channel)
  }
  db.pragma("user_version = 1")
})()
console.log(`notebooks: migrated ${rows.length} channel(s)`)
