import OpenAI from "openai";
import { getUserApiKey } from "./userConfig";

/**
 * DeepSeek client configuration (OpenAI-compatible API)
 */
const DEEPSEEK_URL = "https://api.deepseek.com";

/**
 * Per-user client cache to avoid recreating clients
 */
const deepseekClients: Map<string, OpenAI> = new Map();

/**
 * Gets or creates a DeepSeek client for a user.
 *
 * @param userId - The user's ID to fetch their API key
 * @returns Promise<OpenAI | null> - The DeepSeek client, or null if API key is not configured
 */
export async function getDeepseekClient(userId: string): Promise<OpenAI | null> {
  const cached = deepseekClients.get(userId);
  if (cached) {
    return cached;
  }

  const apiKey = await getUserApiKey(userId, "deepseek");
  if (!apiKey) {
    return null;
  }

  const client = new OpenAI({
    apiKey: apiKey,
    baseURL: DEEPSEEK_URL,
  });

  deepseekClients.set(userId, client);
  return client;
}

/**
 * Clears the cached DeepSeek client for a specific user.
 * Useful when API key is updated.
 */
export function clearDeepseekClient(userId: string): void {
  deepseekClients.delete(userId);
}

/**
 * Checks if DeepSeek is configured and available for a user.
 */
export async function isDeepseekConfigured(userId: string): Promise<boolean> {
  const apiKey = await getUserApiKey(userId, "deepseek");
  return apiKey !== null && apiKey.length > 0;
}
