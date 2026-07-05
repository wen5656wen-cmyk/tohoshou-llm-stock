/**
 * lib/openai.ts — GPT-5.5 client (read-only, DB-grounded)
 *
 * Rules:
 *  - GPT only interprets intent, calls DB helpers, and formats replies
 *  - GPT NEVER generates prices, scores, news, or investment advice from its own knowledge
 *  - All factual data comes from: Stock, StockScore, News, Disclosure, InstitutionalFlow, GlobalMarket
 *  - If DB has no data → return "暂无真实数据"
 */

import OpenAI from "openai";

let _client: OpenAI | null = null;

export function openaiClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  // Explicitly pin to OpenAI's base URL — prevents OPENAI_BASE_URL env var
  // (set for DeepSeek legacy client) from hijacking this client.
  _client ??= new OpenAI({ apiKey, baseURL: "https://api.openai.com/v1" });
  return _client;
}

export const GPT_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

export function isOpenAIConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}
