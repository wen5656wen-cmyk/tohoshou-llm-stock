#!/usr/bin/env npx tsx
/**
 * GPT Scoring Overlay — V9 P1
 *
 * Analyzes:
 *   A. All AI theme stocks (AITheme table)
 *   B. TOP100 candidates: adaptiveScore >= 60, priceCount >= 60
 *
 * Final Score = ruleScore * 0.7 + gptScore * 0.3
 *
 * Usage:
 *   npm run gpt:score
 *   npm run gpt:score -- --limit=10
 *   npm run gpt:score -- --force
 */

import "dotenv/config";
import crypto from "crypto";
import OpenAI from "openai";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ── CLI Args ──────────────────────────────────────────────────────────────────
const rawArgs = process.argv.slice(2);
const limitArg = rawArgs.find((a) => a.startsWith("--limit="));
const MAX_LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : 100;
const FORCE = rawArgs.includes("--force");

// ── OpenAI ───────────────────────────────────────────────────────────────────
const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY) {
  console.error("❌  OPENAI_API_KEY is not set. Aborting.");
  process.exit(1);
}
const oai = new OpenAI({ apiKey: OPENAI_KEY, baseURL: "https://api.openai.com/v1" });
const GPT_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

// ── Types ─────────────────────────────────────────────────────────────────────
type GPTResponse = {
  gptScore: number;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  action: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
  summaryZh: string;
  summaryJa: string;
  summaryEn: string;
  thesisZh: string;
  thesisJa: string;
  thesisEn: string;
  strengths: string[];
  risks: string[];
  catalysts: string[];
  timeHorizon: "1-3M" | "3-6M" | "6-12M";
};

// ── Safety Caps ───────────────────────────────────────────────────────────────
function applySafetyCaps(finalScore: number, stock: {
  isStale: boolean;
  isSuspicious: boolean;
  return60d: number | null;
  rsi14: number | null;
  hasMissingFinancials: boolean;
}): number {
  let capped = finalScore;
  if (stock.isStale || stock.isSuspicious) capped = Math.min(capped, 50);
  if ((stock.return60d ?? 0) > 300) capped = Math.min(capped, 75);
  if ((stock.rsi14 ?? 0) > 90) capped = Math.min(capped, 75);
  if (stock.hasMissingFinancials) capped = Math.min(capped, 70);
  return Math.round(capped * 10) / 10;
}

// ── Input Hash ────────────────────────────────────────────────────────────────
function buildInputHash(s: {
  latestClose: number | null;
  adaptiveScore: number | null;
  opportunityScore: number | null;
  recommendationV2: string | null;
  tradingAction: string | null;
  return20d: number | null;
  return60d: number | null;
}): string {
  const raw = [
    s.latestClose ?? "null",
    s.adaptiveScore ?? "null",
    s.opportunityScore ?? "null",
    s.recommendationV2 ?? "null",
    s.tradingAction ?? "null",
    s.return20d ?? "null",
    s.return60d ?? "null",
  ].join("|");
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

// ── GPT Prompt ────────────────────────────────────────────────────────────────
function buildPrompt(s: {
  symbol: string;
  name: string;
  nameZh: string | null;
  sector: string | null;
  market: string | null;
  adaptiveScore: number | null;
  percentileRank: number | null;
  opportunityScore: number | null;
  return5d: number | null;
  return20d: number | null;
  return60d: number | null;
  rsi14: number | null;
  maTrend: string | null;
  macdSignalLabel: string | null;
  tradingAction: string | null;
  recommendationV2: string | null;
  latestClose: number | null;
  stockStyle: string | null;
  aiThemes: string[];
  recentNews: { title: string; sentiment: string | null }[];
}): string {
  const newsStr = s.recentNews.length > 0
    ? s.recentNews.slice(0, 5).map((n, i) => `${i + 1}. ${n.title} [${n.sentiment ?? "NEUTRAL"}]`).join("\n")
    : "No recent news";

  const themesStr = s.aiThemes.length > 0 ? s.aiThemes.join(", ") : "None";

  return `You are a Japanese equity research analyst. Analyze this stock and return STRICT JSON only.

STOCK DATA:
Symbol: ${s.symbol}
Name: ${s.name}${s.nameZh ? ` / ${s.nameZh}` : ""}
Sector: ${s.sector ?? "Unknown"}
Market: ${s.market ?? "TSE"}
AI Themes: ${themesStr}
Stock Style: ${s.stockStyle ?? "Unknown"}

QUANTITATIVE SIGNALS:
- Rule-based AI Score: ${s.adaptiveScore?.toFixed(1) ?? "N/A"} / 100
- Market Percentile: Top ${s.percentileRank?.toFixed(1) ?? "?"}%
- Opportunity Score: ${s.opportunityScore?.toFixed(1) ?? "N/A"}
- Rating: ${s.recommendationV2 ?? "N/A"}
- Trading Action: ${s.tradingAction ?? "N/A"}
- Latest Price: ¥${s.latestClose?.toLocaleString() ?? "N/A"}
- Return 5D: ${s.return5d != null ? `${s.return5d > 0 ? "+" : ""}${s.return5d.toFixed(1)}%` : "N/A"}
- Return 20D: ${s.return20d != null ? `${s.return20d > 0 ? "+" : ""}${s.return20d.toFixed(1)}%` : "N/A"}
- Return 60D: ${s.return60d != null ? `${s.return60d > 0 ? "+" : ""}${s.return60d.toFixed(1)}%` : "N/A"}
- RSI(14): ${s.rsi14?.toFixed(1) ?? "N/A"}
- MA Trend: ${s.maTrend ?? "N/A"}
- MACD Signal: ${s.macdSignalLabel ?? "N/A"}

RECENT NEWS:
${newsStr}

SCORING CRITERIA:
90-100: Exceptional business logic, clear market position, specific catalysts, controlled risk
80-89: Strong, worth close attention
70-79: Promising but with notable risks
60-69: Neutral to slightly positive
50-59: Insufficient information or average appeal
<50: Significant risks or weak thesis

REQUIRED JSON FORMAT (no markdown, no explanation):
{
  "gptScore": <number 0-100>,
  "confidence": <"LOW"|"MEDIUM"|"HIGH">,
  "action": <"POSITIVE"|"NEUTRAL"|"NEGATIVE">,
  "summaryZh": "<15-25 chars Chinese summary>",
  "summaryJa": "<15-25 chars Japanese summary>",
  "summaryEn": "<15-25 words English summary>",
  "thesisZh": "<50-120 chars Chinese investment thesis>",
  "thesisJa": "<50-120 chars Japanese investment thesis>",
  "thesisEn": "<50-120 chars English investment thesis>",
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "risks": ["<risk 1>", "<risk 2>"],
  "catalysts": ["<catalyst 1>", "<catalyst 2>"],
  "timeHorizon": <"1-3M"|"3-6M"|"6-12M">
}

MANDATORY DISCLAIMER: Include in thesis fields: 仅供研究参考，不构成投资建议。/ 参考情報のみ。投資助言ではありません。/ For research only. Not investment advice.
FORBIDDEN: 保证上涨, 必买, 稳赢, 确定收益, guaranteed returns, must buy, certain profit`;
}

// ── GPT Call with Retry ───────────────────────────────────────────────────────
async function callGPT(prompt: string, retries = 2): Promise<GPTResponse> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await oai.chat.completions.create({
        model: GPT_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 800,
        response_format: { type: "json_object" },
      });
      const raw = resp.choices[0]?.message?.content ?? "";
      const parsed = JSON.parse(raw) as GPTResponse;

      // Validate required fields
      if (typeof parsed.gptScore !== "number") throw new Error("gptScore missing");
      if (!["LOW", "MEDIUM", "HIGH"].includes(parsed.confidence)) throw new Error("invalid confidence");
      if (!["POSITIVE", "NEUTRAL", "NEGATIVE"].includes(parsed.action)) throw new Error("invalid action");
      parsed.gptScore = Math.max(0, Math.min(100, parsed.gptScore));
      parsed.strengths = Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 5) : [];
      parsed.risks = Array.isArray(parsed.risks) ? parsed.risks.slice(0, 5) : [];
      parsed.catalysts = Array.isArray(parsed.catalysts) ? parsed.catalysts.slice(0, 5) : [];

      return parsed;
    } catch (e) {
      if (attempt === retries) throw e;
      console.warn(`  ⚠ GPT parse failed (attempt ${attempt + 1}), retrying...`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error("All GPT retries exhausted");
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🤖 GPT Score Overlay — V9 P1`);
  console.log(`   Model: ${GPT_MODEL}  |  Limit: ${MAX_LIMIT}  |  Force: ${FORCE}`);
  console.log(`${"─".repeat(60)}`);

  // 1. AI theme symbols
  const aiThemeRows = await prisma.aITheme.findMany({ select: { symbol: true, theme: true } });
  const aiThemeMap = new Map<string, string[]>();
  for (const row of aiThemeRows) {
    const arr = aiThemeMap.get(row.symbol) ?? [];
    arr.push(row.theme);
    aiThemeMap.set(row.symbol, arr);
  }
  const aiThemeSymbols = new Set(aiThemeMap.keys());
  console.log(`📌 AI theme symbols: ${aiThemeSymbols.size}`);

  // 2. TOP100 candidates
  const top100Scores = await prisma.stockScore.findMany({
    where: {
      priceCount: { gte: 60 },
      adaptiveScore: { gte: 60 },
    },
    orderBy: [
      { percentileRank: "asc" },
      { adaptiveScore: "desc" },
      { opportunityScore: "desc" },
    ],
    take: 100,
    select: {
      symbol: true, name: true, nameZh: true, sector: true, market: true,
      adaptiveScore: true, percentileRank: true, opportunityScore: true,
      return5d: true, return20d: true, return60d: true,
      rsi14: true, maTrend: true, macdSignalLabel: true,
      tradingAction: true, recommendationV2: true, latestClose: true,
      stockStyle: true, priceCount: true, computedAt: true,
    },
  });
  const top100Symbols = new Set(top100Scores.map((s) => s.symbol));
  console.log(`📊 TOP100 candidates: ${top100Scores.length}`);

  // 3. Deduplicate — AI theme + TOP100
  const allSymbolsSet = new Set([...aiThemeSymbols, ...top100Symbols]);
  const scoreBySymbol = new Map(top100Scores.map((s) => [s.symbol, s]));

  // Fetch AI-theme-only stocks that aren't in TOP100
  const aiOnlySymbols = [...aiThemeSymbols].filter((sym) => !top100Symbols.has(sym));
  const aiOnlyScores = aiOnlySymbols.length > 0
    ? await prisma.stockScore.findMany({
        where: { symbol: { in: aiOnlySymbols }, priceCount: { gte: 60 } },
        select: {
          symbol: true, name: true, nameZh: true, sector: true, market: true,
          adaptiveScore: true, percentileRank: true, opportunityScore: true,
          return5d: true, return20d: true, return60d: true,
          rsi14: true, maTrend: true, macdSignalLabel: true,
          tradingAction: true, recommendationV2: true, latestClose: true,
          stockStyle: true, priceCount: true, computedAt: true,
        },
      })
    : [];

  for (const s of aiOnlyScores) scoreBySymbol.set(s.symbol, s);

  // Build candidate list
  const candidates = [...allSymbolsSet]
    .map((sym) => scoreBySymbol.get(sym))
    .filter(Boolean) as (typeof top100Scores[0])[];

  const totalCandidates = candidates.length;
  const toProcess = candidates.slice(0, MAX_LIMIT);
  console.log(`🎯 Total candidates: ${totalCandidates}  →  Processing: ${toProcess.length}`);

  // 4. Fetch recent news for all candidates (batch)
  const newsRows = await prisma.news.findMany({
    where: {
      stockId: { not: null },
      publishedAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
    },
    select: { stockId: true, title: true, sentiment: true },
    orderBy: { publishedAt: "desc" },
    take: 3000,
  });
  // Join via stock lookup
  const stockRows = await prisma.stock.findMany({
    where: { symbol: { in: toProcess.map((s) => s.symbol) } },
    select: { id: true, symbol: true },
  });
  const stockIdToSymbol = new Map(stockRows.map((s) => [s.id, s.symbol]));
  const newsBySymbol = new Map<string, { title: string; sentiment: string | null }[]>();
  for (const n of newsRows) {
    if (n.stockId == null) continue;
    const sym = stockIdToSymbol.get(n.stockId);
    if (!sym) continue;
    const arr = newsBySymbol.get(sym) ?? [];
    if (arr.length < 5) arr.push({ title: n.title, sentiment: n.sentiment });
    newsBySymbol.set(sym, arr);
  }

  // 5. Check existing GPT scores for cache
  const existingScores = await prisma.gPTScore.findMany({
    where: { symbol: { in: toProcess.map((s) => s.symbol) } },
    select: { symbol: true, inputHash: true, updatedAt: true },
  });
  const existingMap = new Map(existingScores.map((s) => [s.symbol, s]));
  const NOW = Date.now();
  const CACHE_TTL = 24 * 60 * 60 * 1000;

  // 6. Process each stock
  let called = 0, cached = 0, failed = 0;
  let totalInputTokens = 0;

  for (const sc of toProcess) {
    const inputHash = buildInputHash(sc);
    const existing = existingMap.get(sc.symbol);

    // Cache check
    if (!FORCE && existing) {
      const age = NOW - existing.updatedAt.getTime();
      if (age < CACHE_TTL && existing.inputHash === inputHash) {
        cached++;
        process.stdout.write(`  ✓ ${sc.symbol.padEnd(10)} [cache]\n`);
        continue;
      }
    }

    // Skip if no adaptiveScore and no opportunityScore
    const ruleScore = sc.adaptiveScore ?? sc.opportunityScore;
    if (ruleScore == null) {
      console.log(`  ⊘ ${sc.symbol} — no rule score, skipped`);
      continue;
    }

    // Safety: skip if priceCount < 60
    if ((sc.priceCount ?? 0) < 60) continue;

    // Derive stale/suspicious flags
    const isStale = sc.computedAt != null && (NOW - sc.computedAt.getTime()) > 2 * 24 * 60 * 60 * 1000;
    const isSuspicious = (sc.return60d ?? 0) > 300;

    try {
      const prompt = buildPrompt({
        symbol: sc.symbol,
        name: sc.name,
        nameZh: sc.nameZh,
        sector: sc.sector,
        market: sc.market,
        adaptiveScore: sc.adaptiveScore,
        percentileRank: sc.percentileRank,
        opportunityScore: sc.opportunityScore,
        return5d: sc.return5d,
        return20d: sc.return20d,
        return60d: sc.return60d,
        rsi14: sc.rsi14,
        maTrend: sc.maTrend,
        macdSignalLabel: sc.macdSignalLabel,
        tradingAction: sc.tradingAction,
        recommendationV2: sc.recommendationV2,
        latestClose: sc.latestClose,
        stockStyle: sc.stockStyle,
        aiThemes: aiThemeMap.get(sc.symbol) ?? [],
        recentNews: newsBySymbol.get(sc.symbol) ?? [],
      });

      totalInputTokens += Math.ceil(prompt.length / 4);

      const gptResp = await callGPT(prompt);

      // Compute final score
      let finalScore = ruleScore * 0.7 + gptResp.gptScore * 0.3;
      finalScore = applySafetyCaps(finalScore, {
        isStale,
        isSuspicious,
        return60d: sc.return60d,
        rsi14: sc.rsi14,
        hasMissingFinancials: false,
      });

      // Upsert
      await prisma.gPTScore.upsert({
        where: { symbol: sc.symbol },
        create: {
          symbol: sc.symbol,
          model: GPT_MODEL,
          ruleScore: Math.round(ruleScore * 10) / 10,
          gptScore: gptResp.gptScore,
          finalScore,
          confidence: gptResp.confidence,
          action: gptResp.action,
          summaryZh: gptResp.summaryZh,
          summaryJa: gptResp.summaryJa,
          summaryEn: gptResp.summaryEn,
          thesisZh: gptResp.thesisZh,
          thesisJa: gptResp.thesisJa,
          thesisEn: gptResp.thesisEn,
          strengths: gptResp.strengths,
          risks: gptResp.risks,
          catalysts: gptResp.catalysts,
          timeHorizon: gptResp.timeHorizon,
          inputHash,
        },
        update: {
          model: GPT_MODEL,
          ruleScore: Math.round(ruleScore * 10) / 10,
          gptScore: gptResp.gptScore,
          finalScore,
          confidence: gptResp.confidence,
          action: gptResp.action,
          summaryZh: gptResp.summaryZh,
          summaryJa: gptResp.summaryJa,
          summaryEn: gptResp.summaryEn,
          thesisZh: gptResp.thesisZh,
          thesisJa: gptResp.thesisJa,
          thesisEn: gptResp.thesisEn,
          strengths: gptResp.strengths,
          risks: gptResp.risks,
          catalysts: gptResp.catalysts,
          timeHorizon: gptResp.timeHorizon,
          inputHash,
        },
      });

      called++;
      const action_emoji = gptResp.action === "POSITIVE" ? "↑" : gptResp.action === "NEGATIVE" ? "↓" : "→";
      console.log(`  ✅ ${sc.symbol.padEnd(10)} gpt=${gptResp.gptScore} rule=${ruleScore.toFixed(0)} final=${finalScore.toFixed(1)} [${gptResp.confidence}] ${action_emoji}`);
    } catch (e) {
      failed++;
      console.error(`  ❌ ${sc.symbol}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 7. Summary
  const estInputCost = (totalInputTokens / 1_000_000) * 0.15; // gpt-4o-mini input rate
  const estOutputCost = (called * 200 / 1_000_000) * 0.6;     // estimated output tokens
  const estTotal = estInputCost + estOutputCost;

  console.log(`\n${"─".repeat(60)}`);
  console.log(`📈 Results:`);
  console.log(`   Candidates : ${totalCandidates} (processed: ${toProcess.length})`);
  console.log(`   GPT calls  : ${called}`);
  console.log(`   Cache hits : ${cached}`);
  console.log(`   Failures   : ${failed}`);
  console.log(`   Est tokens : ~${totalInputTokens.toLocaleString()} input`);
  console.log(`   Est cost   : ~$${estTotal.toFixed(4)} USD`);
  console.log(`${"─".repeat(60)}\n`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
