import fs from "fs"
import { NextResponse } from "next/server"
import { currentUserId } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { audioPath } from "@/lib/uploads"

type Ctx = { params: Promise<{ id: string }> }

/** Longest piece sent per request; the player asks again for the next one. */
const MAX_PIECE = 2 * 1024 * 1024

async function readPiece(file: string, start: number, end: number) {
  const handle = await fs.promises.open(file, "r")
  try {
    const buffer = Buffer.alloc(end - start + 1)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, start)
    return buffer.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}

/**
 * The recording, with Range support so the player can seek and iOS Safari will play it.
 * Pieces are read into memory instead of streamed: the player aborts requests on every seek,
 * and aborted web streams make the server throw "Controller is already closed".
 */
export async function GET(req: Request, { params }: Ctx) {
  const userId = await currentUserId()
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
  const { id } = await params
  if (!(await prisma.video.findFirst({ where: { id, userId }, select: { id: true } }))) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })
  }
  const file = audioPath(id)
  const size = await fs.promises.stat(file).then((s) => s.size, () => 0)
  if (!size) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })

  const headers = {
    "Content-Type": "audio/mpeg",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "")
  if (!match || (!match[1] && !match[2])) {
    return new Response(await fs.promises.readFile(file), { headers: { ...headers, "Content-Length": String(size) } })
  }
  // "bytes=a-b", "bytes=a-" or "bytes=-n" (the last n bytes)
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]))
  const wanted = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1
  if (start > wanted || start >= size) {
    return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } })
  }
  const end = Math.min(wanted, start + MAX_PIECE - 1)
  const piece = await readPiece(file, start, end)
  return new Response(piece, {
    status: 206,
    headers: { ...headers, "Content-Length": String(piece.length), "Content-Range": `bytes ${start}-${start + piece.length - 1}/${size}` },
  })
}
