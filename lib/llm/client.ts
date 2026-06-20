/**
 * lib/llm/client.ts — Unified OpenAI Client
 *
 * Env:
 *   OPENAI_API_KEY   — required for LLM features
 *   OPENAI_MODEL     — default: gpt-4o-mini
 */

import OpenAI from "openai";

let _client: OpenAI | null = null;

export function llmClient(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
    _client = new OpenAI({ apiKey });
  }
  return _client;
}

export const LLM_MODEL = (): string => process.env.OPENAI_MODEL ?? "gpt-4o-mini";

export function isLLMConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}
