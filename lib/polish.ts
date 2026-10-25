import { deepseek, DEEPSEEK_MODEL } from "./deepseek"
import type { Line } from "./transcript"

const BATCH_LINES = 40
const BATCH_CHARS = 2000
const CONTEXT_LINES = 3
const PARALLEL = 4

/**
 * Speech-to-text writes names and finance terms as same-sounding wrong characters
 * (游庭皓 → 雪庭浩, 美股 → 美容股市). A second pass lets DeepSeek fix only those, using the
 * title and channel as the spelling reference. It must not rewrite: the model's answer is
 * checked line by line and a line that changed more than a typo-sized amount keeps its
 * original text. Never throws: if anything goes wrong the transcript stays as it was.
 */
export async function polishTranscript(lines: Line[], hint: { title: string; channel: string }): Promise<Line[]> {
  if (lines.length === 0) return lines
  const batches = toBatches(lines)
  const out: string[][] = new Array(batches.length)
  let next = 0
  let changed = 0

  const worker = async () => {
    for (let i = next++; i < batches.length; i = next++) {
      const { start, end } = batches[i]
      const original = lines.slice(start, end).map((l) => l[1])
      const context = lines.slice(Math.max(0, start - CONTEXT_LINES), start).map((l) => l[1])
      const fixed = await fixBatch(original, context, hint).catch((e) => {
        console.warn("[polish] batch failed, kept as is:", (e as Error).message)
        return original
      })
      out[i] = fixed
      if (process.env.POLISH_DEBUG) fixed.forEach((t, j) => t !== original[j] && console.log(`[polish] ${original[j]}\n      -> ${t}`))
      changed += fixed.filter((t, j) => t !== original[j]).length
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, batches.length) }, worker))

  console.log(`[polish] ${changed} of ${lines.length} lines corrected`)
  const texts = out.flat()
  return lines.map(([t], i) => [t, texts[i] ?? lines[i][1]] as Line)
}

function toBatches(lines: Line[]): { start: number; end: number }[] {
  const batches: { start: number; end: number }[] = []
  let start = 0
  let chars = 0
  lines.forEach(([, text], i) => {
    if (i > start && (i - start >= BATCH_LINES || chars + text.length > BATCH_CHARS)) {
      batches.push({ start, end: i })
      start = i
      chars = 0
    }
    chars += text.length
  })
  batches.push({ start, end: lines.length })
  return batches
}

const SYSTEM = `你是繁體中文逐字稿的校對員。使用者給你語音辨識出來的逐字稿（每一行是一句），請只修正「明顯的同音字、近音字辨識錯誤」，例如人名、公司名、地名、股票與財經或科技術語被寫成發音相近的錯字。

規則：
1. 參考影片標題、頻道名稱和上下文，判斷某個詞原本應該是什麼；沒有把握就不要改。
2. 絕對不要改寫、潤飾、換句話說、調整語氣，也不要刪減或補充任何內容。口語、贅詞、重複、語助詞全部照留。
3. 不要改標點符號和數字，除非它們就在被修正的字詞裡。
4. 不要把詞換成同義詞或不同說法（例如不要把「收益率」改成「殖利率」、「支援」改成「支持」），只有確定是辨識錯字時才改。輸出一律是繁體中文。
5. 輸出的行數必須和輸入完全相同，順序一樣，沒有要改的行就原樣輸出。

只回傳 JSON，格式：{"lines": ["第1行", "第2行", ...]}`

async function fixBatch(original: string[], context: string[], hint: { title: string; channel: string }): Promise<string[]> {
  const user = [
    `影片標題：${hint.title}`,
    `頻道：${hint.channel}`,
    context.length ? `上文（只供判斷，不要輸出）：\n${context.join("\n")}` : "",
    `要校對的 ${original.length} 行：`,
    JSON.stringify({ lines: original }),
  ]
    .filter(Boolean)
    .join("\n\n")

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await deepseek().chat.completions.create({
      model: DEEPSEEK_MODEL,
      response_format: { type: "json_object" },
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
    })
    const data = JSON.parse(res.choices[0]?.message?.content ?? "{}") as { lines?: unknown }
    const fixed = data.lines
    if (!Array.isArray(fixed) || fixed.length !== original.length) continue
    return original.map((text, i) => acceptable(text, fixed[i]) ?? text)
  }
  return original
}

/** The corrected line, or null when it is not a small fix of the original. */
function acceptable(original: string, fixed: unknown): string | null {
  if (typeof fixed !== "string") return null
  const text = fixed.trim()
  if (!text || text === original) return null
  const longest = Math.max(original.length, text.length)
  if (Math.abs(original.length - text.length) > Math.max(3, longest * 0.15)) return null
  if (distance(original, text) / longest > 0.2) return null
  return text
}

/** Levenshtein distance (lines are one sentence, so the quadratic cost is small). */
function distance(a: string, b: string): number {
  const x = [...a]
  const y = [...b]
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j)
  for (let i = 1; i <= x.length; i++) {
    const row = [i]
    for (let j = 1; j <= y.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1))
    }
    prev = row
  }
  return prev[y.length]
}
