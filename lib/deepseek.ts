import OpenAI from "openai"

export const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat"

let client: OpenAI | null = null
export function deepseek(): OpenAI {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not set")
  client ??= new OpenAI({ apiKey, baseURL: "https://api.deepseek.com" })
  return client
}
