#!/usr/bin/env npx tsx
/**
 * GPT Scoring Overlay — V8.6 P1
 *
 * Independence fix: GPT receives only raw facts (price, returns, technicals,
 * fundamentals, news). Rule scores / ratings / trading actions are withheld
 * so GPT forms an independent judgment.
 *
 * Final Score = ruleScore * 0.4 + gptScore * 0.6  (GPT-driven, computed AFTER GPT call)
 * 7 sub-dimension scores added: businessQuality, growthScore, industryScore,
 * moatScore, valuationScore, catalystScore, riskScore
 *
 * Usage:
 *   npm run gpt:score
 *   npm run gpt:score -- --limit=10
 *   npm run gpt:score -- --limit=10 --force
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
  // V8.6 P1: 7 sub-dimension scores
  businessQuality: number;
  growthScore: number;
  industryScore: number;
  moatScore: number;
  valuationScore: number;
  catalystScore: number;
  riskScore: number;
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

type StockFundamentals = {
  per: number | null;
  pbr: number | null;
  roe: number | null;
  dividend: number | null;   // yield %
  marketCap: number | null;  // 億円
  high52w: number | null;
  low52w: number | null;
  // From Financial table (latest period)
  opMarginPct: number | null;
  revenueM: number | null;   // 百万円
  netProfitM: number | null;
  eps: number | null;
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

// ── MA trend → human-readable description ─────────────────────────────────────
function describeMaTrend(trend: string | null): string {
  switch (trend) {
    case "GOLDEN":  return "MA5 > MA20 > MA60 — all moving averages aligned upward";
    case "BULLISH": return "MA5 > MA20 — short-term moving average above medium-term";
    case "BEARISH": return "MA5 < MA20 — short-term moving average below medium-term";
    case "DEAD":    return "MA5 < MA20 < MA60 — all moving averages aligned downward";
    default:        return "Mixed moving average alignment (neutral)";
  }
}

// ── MACD → human-readable ────────────────────────────────────────────────────
function describeMacd(label: string | null): string {
  switch (label) {
    case "BUY":  return "MACD line above signal line (bullish momentum)";
    case "SELL": return "MACD line below signal line (bearish momentum)";
    default:     return "MACD near signal line (no clear momentum)";
  }
}

// ── 52-week position ──────────────────────────────────────────────────────────
function describe52wPosition(close: number | null, high: number | null, low: number | null): string {
  if (!close || !high || !low || high === low) return "N/A";
  const pct = ((close - low) / (high - low)) * 100;
  const pctFromHigh = ((high - close) / high * 100).toFixed(1);
  const rangePos = pct >= 75 ? "near 52w high" : pct >= 50 ? "upper half of 52w range" : pct >= 25 ? "lower half of 52w range" : "near 52w low";
  return `¥${close.toLocaleString()} — ${rangePos} (${pct.toFixed(0)}% of range, -${pctFromHigh}% from high)`;
}

// ── GPT Prompt (independence-first design) ────────────────────────────────────
function buildPrompt(s: {
  symbol: string;
  name: string;
  nameZh: string | null;
  sector: string | null;
  market: string | null;
  return5d: number | null;
  return20d: number | null;
  return60d: number | null;
  rsi14: number | null;
  maTrend: string | null;
  macdSignalLabel: string | null;
  latestClose: number | null;
  aiThemes: string[];
  recentNews: { title: string; sentiment: string | null }[];
  fundamentals: StockFundamentals;
}): string {
  const newsStr = s.recentNews.length > 0
    ? s.recentNews.slice(0, 5).map((n, i) => `${i + 1}. ${n.title} [${n.sentiment ?? "NEUTRAL"}]`).join("\n")
    : "No recent news available";

  const themesStr = s.aiThemes.length > 0 ? s.aiThemes.join(", ") : "None";
  const f = s.fundamentals;

  const fmt = (v: number | null, suffix = "", dec = 1) =>
    v != null ? `${v.toFixed(dec)}${suffix}` : "N/A";

  const fmtRtn = (v: number | null) =>
    v != null ? `${v >= 0 ? "+" : ""}${v.toFixed(1)}%` : "N/A";

  return `You are an independent Japanese equity research analyst. Evaluate this stock on its own merits.

IMPORTANT: Do NOT anchor to any external rating or system score. Form an INDEPENDENT assessment based solely on the data below.

━━━ COMPANY ━━━
Symbol: ${s.symbol}
Name: ${s.name}${s.nameZh ? ` (${s.nameZh})` : ""}
Sector: ${s.sector ?? "Unknown"}
Market: ${s.market ?? "TSE Prime/Standard"}
AI Supply Chain Themes: ${themesStr}

━━━ PRICE & RETURNS ━━━
Current Price: ${s.latestClose != null ? `¥${s.latestClose.toLocaleString()}` : "N/A"}
52-Week Position: ${describe52wPosition(s.latestClose, f.high52w, f.low52w)}
Return 5D / 20D / 60D: ${fmtRtn(s.return5d)} / ${fmtRtn(s.return20d)} / ${fmtRtn(s.return60d)}

━━━ TECHNICAL SIGNALS ━━━
RSI(14): ${fmt(s.rsi14)} ${s.rsi14 != null ? (s.rsi14 >= 70 ? "(overbought zone)" : s.rsi14 <= 30 ? "(oversold zone)" : "(neutral zone)") : ""}
Moving Averages: ${describeMaTrend(s.maTrend)}
MACD: ${describeMacd(s.macdSignalLabel)}

━━━ VALUATION ━━━
PER: ${fmt(f.per, "x")}
PBR: ${fmt(f.pbr, "x")}
Dividend Yield: ${fmt(f.dividend, "%")}
Market Cap: ${f.marketCap != null ? `¥${f.marketCap.toFixed(0)}億` : "N/A"}

━━━ PROFITABILITY ━━━
ROE: ${fmt(f.roe, "%")}
Operating Margin: ${fmt(f.opMarginPct, "%")}
EPS: ${f.eps != null ? `¥${f.eps.toFixed(1)}` : "N/A"}
Revenue (latest): ${f.revenueM != null ? `¥${(f.revenueM / 1000).toFixed(0)}億` : "N/A"}
Net Profit (latest): ${f.netProfitM != null ? `¥${(f.netProfitM / 1000).toFixed(0)}億` : "N/A"}

━━━ RECENT NEWS (last 14 days) ━━━
${newsStr}

━━━ SCORING DIMENSIONS ━━━
Score each of the 7 dimensions independently (0-100), then synthesize a final 0-100 score:

1. businessQuality (0-100): market position, brand/IP strength, customer loyalty
2. growthScore (0-100): sector tailwinds, revenue/earnings growth trajectory, AI/tech relevance
3. industryScore (0-100): supply chain criticality, customer diversification, pricing power
4. moatScore (0-100): competitive moat depth, barriers to entry, switching costs
5. valuationScore (0-100): PER/PBR vs peers, dividend yield, margin of safety (HIGH = attractive value)
6. catalystScore (0-100): specific near-term catalysts, earnings revision potential, product cycles
7. riskScore (0-100): risk management quality (HIGH = well-managed risks; LOW = high unchecked risks)

━━━ SCORE SCALE ━━━
90-100: Exceptional — strong moat, clear catalyst, controlled risk
80-89: Strong — several dimensions clearly positive
70-79: Positive with meaningful but manageable risks
60-69: Neutral to slightly positive, mixed signals
50-59: Limited differentiators or mixed information
<50: Notable risks outweigh potential, or structurally challenged

━━━ REQUIRED OUTPUT FORMAT (strict JSON, no markdown) ━━━
{
  "gptScore": <integer 0-100, weighted synthesis of the 7 dimensions>,
  "businessQuality": <integer 0-100>,
  "growthScore": <integer 0-100>,
  "industryScore": <integer 0-100>,
  "moatScore": <integer 0-100>,
  "valuationScore": <integer 0-100>,
  "catalystScore": <integer 0-100>,
  "riskScore": <integer 0-100>,
  "confidence": <"LOW"|"MEDIUM"|"HIGH">,
  "action": <"POSITIVE"|"NEUTRAL"|"NEGATIVE">,
  "summaryZh": "<15-20 chars>",
  "summaryJa": "<15-20 chars>",
  "summaryEn": "<12-20 words>",
  "thesisZh": "<60-120 chars, end with：仅供研究参考，不构成投资建议。>",
  "thesisJa": "<60-120 chars, end with：参考情報のみ。投資助言ではありません。>",
  "thesisEn": "<50-120 chars, end with: For research only, not investment advice.>",
  "strengths": ["<point 1>", "<point 2>", "<point 3>"],
  "risks": ["<risk 1>", "<risk 2>"],
  "catalysts": ["<catalyst 1>", "<catalyst 2>"],
  "timeHorizon": <"1-3M"|"3-6M"|"6-12M">
}

FORBIDDEN phrases: 保证上涨, 必买, 稳赢, 确定收益, guaranteed returns, must buy, certain profit`;
}

// ── GPT Call with Retry ───────────────────────────────────────────────────────
async function callGPT(prompt: string, retries = 2): Promise<GPTResponse> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await oai.chat.completions.create({
        model: GPT_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.6,
        max_tokens: 1100,   // Extra tokens for 7 sub-scores
        response_format: { type: "json_object" },
      });
      const raw = resp.choices[0]?.message?.content ?? "";
      const parsed = JSON.parse(raw) as GPTResponse;

      if (typeof parsed.gptScore !== "number") throw new Error("gptScore missing");
      if (!["LOW", "MEDIUM", "HIGH"].includes(parsed.confidence)) throw new Error("invalid confidence");
      if (!["POSITIVE", "NEUTRAL", "NEGATIVE"].includes(parsed.action)) throw new Error("invalid action");
      const clamp = (v: unknown) => typeof v === "number" ? Math.max(0, Math.min(100, Math.round(v))) : 50;
      parsed.gptScore = clamp(parsed.gptScore);
      parsed.businessQuality = clamp(parsed.businessQuality);
      parsed.growthScore     = clamp(parsed.growthScore);
      parsed.industryScore   = clamp(parsed.industryScore);
      parsed.moatScore       = clamp(parsed.moatScore);
      parsed.valuationScore  = clamp(parsed.valuationScore);
      parsed.catalystScore   = clamp(parsed.catalystScore);
      parsed.riskScore       = clamp(parsed.riskScore);
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
  console.log(`\n🤖 GPT Score Overlay — V8.6 P1 (7 Sub-Dimensions, Formula 40/60)`);
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
    where: { priceCount: { gte: 60 }, adaptiveScore: { gte: 60 } },
    orderBy: [{ percentileRank: "asc" }, { adaptiveScore: "desc" }, { opportunityScore: "desc" }],
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

  const candidates = [...allSymbolsSet]
    .map((sym) => scoreBySymbol.get(sym))
    .filter(Boolean) as (typeof top100Scores[0])[];

  const totalCandidates = candidates.length;
  const toProcess = candidates.slice(0, MAX_LIMIT);
  console.log(`🎯 Total candidates: ${totalCandidates}  →  Processing: ${toProcess.length}`);

  // 4. Batch-fetch Stock fundamentals (PER, PBR, ROE, dividend, marketCap, 52w)
  const processSymbols = toProcess.map((s) => s.symbol);
  const stockFundRows = await prisma.stock.findMany({
    where: { symbol: { in: processSymbols } },
    select: {
      symbol: true, per: true, pbr: true, roe: true, dividend: true,
      marketCap: true, high52w: true, low52w: true,
    },
  });
  const stockFundMap = new Map(stockFundRows.map((s) => [s.symbol, s]));

  // 5. Batch-fetch latest Financial records (operating margin, revenue, etc.)
  const stockIdRows = await prisma.stock.findMany({
    where: { symbol: { in: processSymbols } },
    select: { id: true, symbol: true },
  });
  const symbolToStockId = new Map(stockIdRows.map((s) => [s.symbol, s.id]));
  const stockIds = stockIdRows.map((s) => s.id);

  const finRows = await prisma.financial.findMany({
    where: { stockId: { in: stockIds } },
    select: { stockId: true, fiscalYear: true, quarter: true, revenue: true, operatingProfit: true, netProfit: true, eps: true },
    orderBy: [{ fiscalYear: "desc" }, { quarter: "desc" }],
    take: stockIds.length * 4,
  });
  // Keep only latest per stockId
  const latestFinMap = new Map<number, typeof finRows[0]>();
  for (const fin of finRows) {
    if (!latestFinMap.has(fin.stockId)) latestFinMap.set(fin.stockId, fin);
  }

  // 6. Fetch recent news
  const newsRows = await prisma.news.findMany({
    where: {
      stockId: { not: null },
      publishedAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
    },
    select: { stockId: true, title: true, sentiment: true },
    orderBy: { publishedAt: "desc" },
    take: 3000,
  });
  const stockIdToSymbol = new Map(stockIdRows.map((s) => [s.id, s.symbol]));
  const newsBySymbol = new Map<string, { title: string; sentiment: string | null }[]>();
  for (const n of newsRows) {
    if (n.stockId == null) continue;
    const sym = stockIdToSymbol.get(n.stockId);
    if (!sym) continue;
    const arr = newsBySymbol.get(sym) ?? [];
    if (arr.length < 5) arr.push({ title: n.title, sentiment: n.sentiment });
    newsBySymbol.set(sym, arr);
  }

  // 7. Cache check
  const existingScores = await prisma.gPTScore.findMany({
    where: { symbol: { in: processSymbols } },
    select: { symbol: true, inputHash: true, updatedAt: true },
  });
  const existingMap = new Map(existingScores.map((s) => [s.symbol, s]));
  const NOW = Date.now();
  const CACHE_TTL = 24 * 60 * 60 * 1000;

  // 8. Process each stock
  let called = 0, cached = 0, failed = 0;
  let totalInputTokens = 0;
  const diffSamples: number[] = [];

  for (const sc of toProcess) {
    const inputHash = buildInputHash(sc);
    const existing = existingMap.get(sc.symbol);

    if (!FORCE && existing) {
      const age = NOW - existing.updatedAt.getTime();
      if (age < CACHE_TTL && existing.inputHash === inputHash) {
        cached++;
        process.stdout.write(`  ✓ ${sc.symbol.padEnd(10)} [cache]\n`);
        continue;
      }
    }

    const ruleScore = sc.adaptiveScore ?? sc.opportunityScore;
    if (ruleScore == null) {
      console.log(`  ⊘ ${sc.symbol} — no rule score, skipped`);
      continue;
    }
    if ((sc.priceCount ?? 0) < 60) continue;

    const isStale = sc.computedAt != null && (NOW - sc.computedAt.getTime()) > 2 * 24 * 60 * 60 * 1000;
    const isSuspicious = (sc.return60d ?? 0) > 300;

    // Build fundamentals
    const sf = stockFundMap.get(sc.symbol);
    const stockId = symbolToStockId.get(sc.symbol);
    const fin = stockId != null ? latestFinMap.get(stockId) : undefined;
    const opMarginPct = fin?.revenue && fin.operatingProfit
      ? (fin.operatingProfit / fin.revenue) * 100 : null;
    const fundamentals: StockFundamentals = {
      per: sf?.per ?? null,
      pbr: sf?.pbr ?? null,
      roe: sf?.roe ?? null,
      dividend: sf?.dividend ?? null,
      marketCap: sf?.marketCap ?? null,
      high52w: sf?.high52w ?? null,
      low52w: sf?.low52w ?? null,
      opMarginPct,
      revenueM: fin?.revenue ?? null,
      netProfitM: fin?.netProfit ?? null,
      eps: fin?.eps ?? null,
    };
    const hasMissingFinancials = !fin && !sf?.per && !sf?.roe;

    try {
      const prompt = buildPrompt({
        symbol: sc.symbol,
        name: sc.name,
        nameZh: sc.nameZh,
        sector: sc.sector,
        market: sc.market,
        return5d: sc.return5d,
        return20d: sc.return20d,
        return60d: sc.return60d,
        rsi14: sc.rsi14,
        maTrend: sc.maTrend,
        macdSignalLabel: sc.macdSignalLabel,
        latestClose: sc.latestClose,
        aiThemes: aiThemeMap.get(sc.symbol) ?? [],
        recentNews: newsBySymbol.get(sc.symbol) ?? [],
        fundamentals,
      });

      totalInputTokens += Math.ceil(prompt.length / 4);

      const gptResp = await callGPT(prompt);

      const diff = Math.abs(gptResp.gptScore - ruleScore);
      diffSamples.push(diff);

      let finalScore = ruleScore * 0.4 + gptResp.gptScore * 0.6;
      finalScore = applySafetyCaps(finalScore, {
        isStale,
        isSuspicious,
        return60d: sc.return60d,
        rsi14: sc.rsi14,
        hasMissingFinancials,
      });

      const upsertData = {
        model: GPT_MODEL,
        ruleScore: Math.round(ruleScore * 10) / 10,
        gptScore: gptResp.gptScore,
        finalScore,
        businessQuality: gptResp.businessQuality,
        growthScore:     gptResp.growthScore,
        industryScore:   gptResp.industryScore,
        moatScore:       gptResp.moatScore,
        valuationScore:  gptResp.valuationScore,
        catalystScore:   gptResp.catalystScore,
        riskScore:       gptResp.riskScore,
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
      };
      await prisma.gPTScore.upsert({
        where: { symbol: sc.symbol },
        create: { symbol: sc.symbol, ...upsertData },
        update: upsertData,
      });

      called++;
      const dir = gptResp.gptScore > ruleScore ? "↑" : gptResp.gptScore < ruleScore ? "↓" : "=";
      const diffStr = diff === 0 ? "±0" : `${gptResp.gptScore > ruleScore ? "+" : "-"}${diff.toFixed(0)}`;
      console.log(
        `  ✅ ${sc.symbol.padEnd(10)} rule=${ruleScore.toFixed(0).padStart(3)} gpt=${String(gptResp.gptScore).padStart(3)} final=${finalScore.toFixed(1).padStart(5)} diff=${diffStr.padStart(4)} ${dir} [${gptResp.confidence}]`
      );
    } catch (e) {
      failed++;
      console.error(`  ❌ ${sc.symbol}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 9. Summary + independence check
  const avgAbsDiff = diffSamples.length > 0
    ? diffSamples.reduce((a, b) => a + b, 0) / diffSamples.length
    : 0;
  const estInputCost  = (totalInputTokens / 1_000_000) * 0.15;
  const estOutputCost = (called * 220 / 1_000_000) * 0.6;

  console.log(`\n${"─".repeat(60)}`);
  console.log(`📈 Results:`);
  console.log(`   Candidates    : ${totalCandidates} (processed: ${toProcess.length})`);
  console.log(`   GPT calls     : ${called}`);
  console.log(`   Cache hits    : ${cached}`);
  console.log(`   Failures      : ${failed}`);
  console.log(`   avgAbsDiff    : ${avgAbsDiff.toFixed(1)} pts (gpt vs rule)`);
  console.log(`   Est tokens    : ~${totalInputTokens.toLocaleString()} input`);
  console.log(`   Est cost      : ~$${(estInputCost + estOutputCost).toFixed(4)} USD`);

  if (diffSamples.length > 0 && avgAbsDiff < 3) {
    console.log(`\n⚠  WARNING: GPT scores appear anchored to ruleScore (avgAbsDiff=${avgAbsDiff.toFixed(1)} < 3).`);
    console.log(`   Consider reviewing the prompt or removing more anchoring context.`);
  } else if (diffSamples.length > 0) {
    console.log(`   ✓  Independence check passed (avgAbsDiff=${avgAbsDiff.toFixed(1)} ≥ 3).`);
  }
  console.log(`${"─".repeat(60)}\n`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
