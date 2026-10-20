import fs from "fs"
import { randomUUID } from "crypto"
import { Readable, Transform } from "stream"
import { pipeline } from "stream/promises"
import { NextResponse } from "next/server"
import { currentUserId } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { startJob } from "@/lib/jobs"
import { MAX_AUDIO_BYTES, MAX_FILE_BYTES, fileBaseName } from "@/lib/upload-limits"
import { cleanName, notebookByName } from "@/lib/notebooks"
import { audioPath, ensureUploadDir, removeAudio } from "@/lib/uploads"

const unauthorized = () => NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })

/** ?fileName=&fileSize= -> the video already made from the same file, or null. */
export async function GET(req: Request) {
  const userId = await currentUserId()
  if (!userId) return unauthorized()
  const params = new URL(req.url).searchParams
  const fileName = params.get("fileName") ?? ""
  const fileSize = Number(params.get("fileSize"))
  if (!fileName || !fileSize) return NextResponse.json(null)
  const found = await prisma.video.findFirst({
    where: { userId, origin: "upload", fileName, fileSize },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true },
  })
  return NextResponse.json(found)
}

/**
 * The browser sends the audio it extracted (mono mp3) as the raw request body;
 * the details travel in the query string: fileName, fileSize, title, titleEdited, channel, lang.
 */
export async function POST(req: Request) {
  const userId = await currentUserId()
  if (!userId) return unauthorized()

  const params = new URL(req.url).searchParams
  const fileName = (params.get("fileName") ?? "").slice(0, 300)
  const fileSize = Number(params.get("fileSize")) || 0
  if (!req.body || !fileName || fileSize > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 })
  }
  if (Number(req.headers.get("content-length")) > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "TOO_BIG" }, { status: 413 })
  }

  const id = randomUUID()
  await ensureUploadDir()
  let received = 0
  const limit = new Transform({
    transform(chunk: Buffer, _enc, done) {
      received += chunk.length
      done(received > MAX_AUDIO_BYTES ? new Error("TOO_BIG") : null, chunk)
    },
  })
  try {
    await pipeline(Readable.fromWeb(req.body as never), limit, fs.createWriteStream(audioPath(id)))
  } catch (e) {
    await removeAudio(id)
    const tooBig = (e as Error).message === "TOO_BIG"
    return NextResponse.json({ error: tooBig ? "TOO_BIG" : "UPLOAD_FAILED" }, { status: tooBig ? 413 : 400 })
  }
  if (received === 0) {
    await removeAudio(id)
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 })
  }

  const channel = cleanName(params.get("channel")) || "本地上傳"
  const notebook = await notebookByName(userId, channel)
  const title = (params.get("title") ?? "").trim().slice(0, 200) || fileBaseName(fileName)
  const video = await prisma.video.create({
    data: {
      id,
      userId,
      youtubeId: `up_${id}`,
      origin: "upload",
      title,
      titleEdited: params.get("titleEdited") === "1",
      channel,
      notebookId: notebook.id,
      lang: params.get("lang") === "en" ? "en" : "zh-TW",
      fileName,
      fileSize: fileSize || null,
    },
  })
  startJob(video.id)
  return NextResponse.json({ id: video.id })
}
