/**
 * lib/intent-engine.ts — Unified Intent Parser V7.9.1
 *
 * Pipeline:
 *   1. Regex-first (fast, zero cost) — handles ~90% of queries
 *   2. Context-aware resolution for follow-ups
 *   3. Enhanced regex for filters (dividend, risk, compare)
 *   4. GPT fallback (JSON-only output) for truly ambiguous inputs
 *
 * GPT rules:
 *   • Output ONLY valid JSON (StructuredIntent shape)
 *   • NEVER output stock names, prices, scores, or natural language
 *   • NEVER invent symbols
 */

import { parseLineIntent, resolveCompanyToSymbol, SECTOR_MAP } from "@/lib/line-intent";
import { openaiClient, GPT_MODEL, isOpenAIConfigured } from "@/lib/openai";
import type { StructuredIntent, IntentType, ConversationContext } from "@/lib/intent-schema";

export type { StructuredIntent, ConversationContext };

// ── In-memory context store (30-min TTL) ─────────────────────────────────────

const CONTEXTS = new Map<string, ConversationContext>();
const TTL_MS = 30 * 60 * 1000;

export function getContext(userId: string): ConversationContext | undefined {
  const ctx = CONTEXTS.get(userId);
  if (!ctx || Date.now() > ctx.expiresAt) {
    CONTEXTS.delete(userId);
    return undefined;
  }
  return ctx;
}

export function setContext(
  userId: string,
  update: Partial<Omit<ConversationContext, "userId" | "expiresAt">>
): void {
  const existing = CONTEXTS.get(userId);
  const channel = update.channel ?? existing?.channel ?? "LINE";
  CONTEXTS.set(userId, {
    ...(existing ?? {}),
    ...update,
    userId,
    channel,
    expiresAt: Date.now() + TTL_MS,
  });
}

export function clearContext(userId: string): void {
  CONTEXTS.delete(userId);
}

// ── parseJpNum helper (replicates line-intent logic) ─────────────────────────

function parseJpNum(s: string): number {
  const numMap: Record<string, number> = {
    一: 1, 二: 2, 三: 3, 四: 4, 五: 5,
    六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
  };
  if (/^\d+$/.test(s)) return Math.min(20, Math.max(1, parseInt(s, 10)));
  let n = 0;
  for (const ch of s) n += numMap[ch] ?? 0;
  return n > 0 ? Math.min(20, n) : 10;
}

// ── Resolve two company names from "A和B" comparison text ────────────────────

function resolveCompareNames(a: string, b: string): { symbols?: string[]; stockNames?: string[] } {
  const codeA = a.match(/^(\d{4})(\.T)?$/) ? a.replace(".T", "") + ".T" : null;
  const codeB = b.match(/^(\d{4})(\.T)?$/) ? b.replace(".T", "") + ".T" : null;
  const symA = codeA ?? (resolveCompanyToSymbol(a) ? resolveCompanyToSymbol(a)! + ".T" : null);
  const symB = codeB ?? (resolveCompanyToSymbol(b) ? resolveCompanyToSymbol(b)! + ".T" : null);

  if (symA && symB) return { symbols: [symA, symB] };
  if (symA && !symB) return { symbols: [symA], stockNames: [b] };
  if (!symA && symB) return { stockNames: [a], symbols: [symB] };
  return { stockNames: [a, b] };
}

// ── Enhanced regex patterns (beyond base line-intent.ts) ─────────────────────

function parseEnhanced(
  raw: string,
  context?: ConversationContext
): StructuredIntent | null {
  const t = raw.toLowerCase();

  // ── Follow-up: recommend_more ──────────────────────────────────────────────
  if (/还有[其他别的]?[吗嘛呢]?|再来[几\d五六七八九十]+只?|再推荐|其他推荐|还有吗|换几只|换其他/.test(t)) {
    return {
      intent: "recommend_more",
      excludeSymbols: context?.lastResults ?? [],
      limit: 5,
      followUp: true,
      rawText: raw,
    };
  }

  // ── Follow-up: risk_analysis ───────────────────────────────────────────────
  if (/^(风险呢|风险怎么?样|有什么风险|风险如何|风险大吗|危险吗|高风险吗)/.test(t)) {
    const symbols = context?.lastSymbols?.length ? context.lastSymbols : undefined;
    return {
      intent: "risk_analysis",
      symbols,
      followUp: !!symbols,
      rawText: raw,
    };
  }

  // ── Follow-up: reason_explain ──────────────────────────────────────────────
  if (/^(为什么|原因呢|为何|怎么推荐|为啥|解释一下|为什么推荐|凭什么)/.test(t)) {
    const symbols = context?.lastSymbols?.length ? context.lastSymbols : undefined;
    return {
      intent: "reason_explain",
      symbols,
      followUp: !!symbols,
      rawText: raw,
    };
  }

  // ── Follow-up: can-buy query with context ─────────────────────────────────
  // Guard: skip if text contains a sector keyword (e.g. "半导体能买吗" → sector_outlook)
  const hasSector = Object.keys(SECTOR_MAP).some((k) => t.includes(k));
  if (!hasSector && /现在能买吗|能买吗|可以买吗|值得买吗|要不要买/.test(t)) {
    if (context?.lastSymbols?.length) {
      return {
        intent: "stock_analysis",
        symbols: context.lastSymbols,
        followUp: true,
        rawText: raw,
      };
    }
    return { intent: "market_overview", rawText: raw };
  }

  // ── Stock compare: "A和B比" / "A vs B" ────────────────────────────────────
  const compareMatch =
    raw.match(/^(.{1,12})[和与](.{1,12})[比]/) ??
    raw.match(/^(.{1,12})\s+vs\.?\s+(.{1,12})/i) ??
    raw.match(/^(.{1,12})[对]比(.{1,12})/);
  if (compareMatch) {
    const a = compareMatch[1].trim();
    const b = compareMatch[2].trim().replace(/[比较哪个好呢？?]+$/, "").trim();
    const resolved = resolveCompareNames(a, b);
    return {
      intent: "stock_compare",
      ...resolved,
      rawText: raw,
    };
  }

  // ── TOP_PICKS with filters ─────────────────────────────────────────────────
  const hasDividend = /(高股息|高配当|配当金|股息率|高分红|dividend)/.test(t);
  const riskLevel: "LOW" | "MEDIUM" | "HIGH" | undefined =
    /(低风险|稳健|保守|安全|stable|conservative)/.test(t) ? "LOW" :
    /(高风险|激进|成长|投机|speculative)/.test(t) ? "HIGH" :
    /(中等风险|适中)/.test(t) ? "MEDIUM" : undefined;

  if (hasDividend || riskLevel) {
    // Could be combined with existing top_picks detection
    const isPicksRequest =
      /(买什么|推荐|recommend|picks|buy|今天|买哪|哪些|有什么|适合|的股)/.test(t) ||
      hasDividend || riskLevel;
    if (isPicksRequest) {
      return {
        intent: "top_picks",
        dividendPreference: hasDividend || undefined,
        riskPreference: riskLevel,
        limit: 10,
        rawText: raw,
      };
    }
  }

  // ── Limit-only re-recommend: "再来三只" ───────────────────────────────────
  const reLimitMatch = raw.match(/^再[来给弄找推推荐]?\s*([一二三四五六七八九十\d]+)\s*只?$/);
  if (reLimitMatch) {
    const n = parseJpNum(reLimitMatch[1]);
    return {
      intent: "recommend_more",
      excludeSymbols: context?.lastResults ?? [],
      limit: n,
      followUp: true,
      rawText: raw,
    };
  }

  return null;
}

// ── GPT JSON-only fallback ────────────────────────────────────────────────────

const GPT_INTENT_SYSTEM = `You are an intent classifier for TOHOSHOU AI (Japanese stock analysis).
Output ONLY a valid JSON object matching this TypeScript type:
{
  intent: "top_picks"|"recommend_more"|"stock_analysis"|"stock_compare"|"theme_rank"|"sector_outlook"|"market_overview"|"risk_analysis"|"reason_explain"|"data_source"|"help"|"unknown",
  symbols?: string[],     // TSE codes like "7203.T" — only if explicitly stated or resolvable
  stockNames?: string[],  // raw names for the query engine to resolve
  theme?: string,         // "科技"|"半导体"|etc for theme_rank
  sector?: string,        // sector keyword for sector_outlook
  riskPreference?: "LOW"|"MEDIUM"|"HIGH",
  dividendPreference?: boolean,
  excludeSymbols?: string[],
  limit?: number,
  followUp?: boolean,
  rawText: string
}

STRICT RULES:
- Output ONLY the JSON object. No explanation, no markdown, no prose.
- DO NOT invent stock symbols or codes.
- DO NOT output stock prices, scores, or recommendations.
- If user asks for high-dividend stocks: dividendPreference=true, intent=top_picks.
- If user says "还有" / "再来": intent=recommend_more, followUp=true.
- If user says "风险呢": intent=risk_analysis, followUp=true.
- If user says "为什么": intent=reason_explain, followUp=true.
- For comparisons ("A和B比"): intent=stock_compare.
- When unsure, default to intent=unknown.`;

async function callGptIntent(
  raw: string,
  context?: ConversationContext
): Promise<StructuredIntent | null> {
  if (!isOpenAIConfigured()) return null;
  try {
    const contextHint = context
      ? `\nUser context: lastIntent=${context.lastIntent}, lastSymbols=${JSON.stringify(context.lastSymbols ?? [])}`
      : "";
    const client = openaiClient();
    const res = await client.chat.completions.create({
      model: GPT_MODEL,
      messages: [
        { role: "system", content: GPT_INTENT_SYSTEM },
        { role: "user", content: `Classify this query:${contextHint}\n"${raw}"` },
      ],
      max_tokens: 200,
      temperature: 0,
      response_format: { type: "json_object" },
    });
    const text = res.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(text) as Partial<StructuredIntent>;
    if (!parsed.intent) return null;
    return { ...parsed, rawText: raw } as StructuredIntent;
  } catch {
    return null;
  }
}

// ── Map V7.9 LineIntent → StructuredIntent ───────────────────────────────────

function mapLineIntent(
  raw: string,
  context?: ConversationContext
): StructuredIntent {
  const line = parseLineIntent(raw);

  switch (line.type) {
    case "TOP_PICKS":
      return { intent: "top_picks", limit: line.limit, rawText: raw };
    case "STOCK_ANALYSIS":
      return {
        intent: "stock_analysis",
        symbols: [line.symbol],
        stockNames: line.nameQuery ? [line.nameQuery] : undefined,
        rawText: raw,
      };
    case "TECH_THEME":
      return { intent: "theme_rank", theme: "科技", rawText: raw };
    case "SECTOR_OUTLOOK":
      return {
        intent: "sector_outlook",
        sector: line.sectorLabel,
        sectors: line.sectors,
        rawText: raw,
      };
    case "MARKET_OVERVIEW":
      return { intent: "market_overview", rawText: raw };
    case "DATA_SOURCE":
      return { intent: "data_source", rawText: raw };
    case "HELP":
      return { intent: "help", rawText: raw };
    case "UNKNOWN":
      return { intent: "unknown", rawText: raw };
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function parseUserIntent(
  text: string,
  context?: ConversationContext
): Promise<StructuredIntent> {
  const raw = text.trim();
  if (!raw) return { intent: "help", rawText: "" };

  // 1. Enhanced regex (context-aware, faster path)
  const enhanced = parseEnhanced(raw, context);
  if (enhanced && enhanced.intent !== "unknown") return enhanced;

  // 2. Base regex via line-intent.ts
  const base = mapLineIntent(raw, context);
  if (base.intent !== "unknown") return base;

  // 3. GPT JSON-only fallback for ambiguous inputs
  const gpt = await callGptIntent(raw, context);
  if (gpt && gpt.intent !== "unknown") return gpt;

  // 4. UNKNOWN → treat as HELP (never return "不支持该查询")
  return { intent: "help", rawText: raw };
}
