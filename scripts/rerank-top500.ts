#!/usr/bin/env npx tsx
/**
 * Top500 GPT Rerank — V9 P1
 *
 * Step 1: Load Top500 from StockScore (adaptiveScore DESC, percentileRank ASC)
 * Step 2: GPT score each stock (hash-based cache skip)
 * Step 3: finalScore = adaptiveScore × 0.7 + gptScore × 0.3  (V10: 70/30 blend)
 * Step 4: gptRating  = recommendation from finalScore + percentileRank
 * Step 5: gptRank    = rank within Top500 after finalScore DESC sort
 * Step 6: Upsert to GPTScore, output detailed log
 *
 * Usage:
 *   npm run rerank:top500
 *   npm run rerank:top500 -- --force          (ignore cache, rescore all)
 *   npm run rerank:top500 -- --limit=10       (test with 10 stocks)
 *   npm run rerank:top500 -- --dry-run        (skip GPT calls, just log Top500)
 */

import "dotenv/config";
import crypto from "crypto";
import OpenAI from "openai";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ── CLI args ──────────────────────────────────────────────────────────────────
const rawArgs = process.argv.slice(2);
const limitArg = rawArgs.find((a) => a.startsWith("--limit="));
const MAX_PROCESS = limitArg ? parseInt(limitArg.split("=")[1], 10) : 500;
const FORCE      = rawArgs.includes("--force");
const DRY_RUN    = rawArgs.includes("--dry-run");
const TOP_N      = 500;
const DISPLAY_N  = 200;
const CACHE_TTL  = 24 * 60 * 60 * 1000;  // 24 h

// ── OpenAI ───────────────────────────────────────────────────────────────────
const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY && !DRY_RUN) {
  console.error("❌  OPENAI_API_KEY not set. Run with --dry-run to skip GPT.");
  process.exit(1);
}
const oai = OPENAI_KEY
  ? new OpenAI({ apiKey: OPENAI_KEY, baseURL: "https://api.openai.com/v1" })
  : null;
const GPT_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

// ── Rating thresholds (same as compute-scores.ts) ────────────────────────────
function computeRating(finalScore: number, percentileRank: number | null): string {
  const pr = percentileRank ?? 100;
  if (finalScore >= 75 && pr <= 5)  return "STRONG_BUY";
  if (finalScore >= 70 && pr <= 15) return "BUY";
  if (finalScore >= 60)             return "HOLD";
  if (finalScore >= 45)             return "WATCH";
  return "AVOID";
}

// ── Types ─────────────────────────────────────────────────────────────────────
type GPTResponse = {
  gptScore: number;
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
  dividend: number | null;
  marketCap: number | null;
  high52w: number | null;
  low52w: number | null;
  opMarginPct: number | null;
  revenueM: number | null;
  netProfitM: number | null;
  eps: number | null;
};

// ── Input hash ────────────────────────────────────────────────────────────────
function buildInputHash(s: {
  latestClose: number | null;
  adaptiveScore: number | null;
  return20d: number | null;
  return60d: number | null;
  percentileRank: number | null;
}): string {
  const raw = [
    s.latestClose ?? "null",
    s.adaptiveScore ?? "null",
    s.return20d ?? "null",
    s.return60d ?? "null",
    s.percentileRank ?? "null",
  ].join("|");
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

// ── Safety caps ───────────────────────────────────────────────────────────────
function applySafetyCaps(score: number, isStale: boolean, return60d: number | null, rsi14: number | null): number {
  let capped = score;
  if (isStale) capped = Math.min(capped, 55);
  if ((return60d ?? 0) > 300) capped = Math.min(capped, 75);
  if ((rsi14 ?? 0) > 90)     capped = Math.min(capped, 75);
  return Math.round(capped * 10) / 10;
}

// ── MA trend description ──────────────────────────────────────────────────────
function describeMaTrend(t: string | null): string {
  if (t === "GOLDEN")  return "MA5 > MA20 > MA60 — all moving averages aligned upward";
  if (t === "BULLISH") return "MA5 > MA20 — short-term above medium-term";
  if (t === "BEARISH") return "MA5 < MA20 — short-term below medium-term";
  if (t === "DEAD")    return "MA5 < MA20 < MA60 — all aligned downward";
  return "Mixed moving average alignment";
}

function describeMacd(label: string | null): string {
  if (label === "BUY")  return "MACD above signal (bullish momentum)";
  if (label === "SELL") return "MACD below signal (bearish momentum)";
  return "MACD near signal (neutral)";
}

function describe52w(close: number | null, high: number | null, low: number | null): string {
  if (!close || !high || !low || high === low) return "N/A";
  const pct = ((close - low) / (high - low)) * 100;
  const fromHigh = ((high - close) / high * 100).toFixed(1);
  const pos = pct >= 75 ? "near 52w high" : pct >= 50 ? "upper half of range" : pct >= 25 ? "lower half of range" : "near 52w low";
  return `¥${close.toLocaleString()} — ${pos} (${pct.toFixed(0)}% of range, -${fromHigh}% from high)`;
}

// ── GPT prompt ────────────────────────────────────────────────────────────────
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
    : "No recent news";
  const themesStr = s.aiThemes.length > 0 ? s.aiThemes.join(", ") : "None";
  const f = s.fundamentals;
  const fmt  = (v: number | null, suf = "", dec = 1) => v != null ? `${v.toFixed(dec)}${suf}` : "N/A";
  const fmtR = (v: number | null) => v != null ? `${v >= 0 ? "+" : ""}${v.toFixed(1)}%` : "N/A";

  return `You are an independent Japanese equity research analyst. Evaluate this stock on its own merits.

IMPORTANT: Do NOT anchor to any external rating. Form an INDEPENDENT assessment from the data only.

━━━ COMPANY ━━━
Symbol: ${s.symbol}
Name: ${s.name}${s.nameZh ? ` (${s.nameZh})` : ""}
Sector: ${s.sector ?? "Unknown"}
Market: ${s.market ?? "TSE Prime/Standard"}
AI Supply Chain Themes: ${themesStr}

━━━ PRICE & RETURNS ━━━
Current Price: ${s.latestClose != null ? `¥${s.latestClose.toLocaleString()}` : "N/A"}
52-Week Position: ${describe52w(s.latestClose, f.high52w, f.low52w)}
Return 5D / 20D / 60D: ${fmtR(s.return5d)} / ${fmtR(s.return20d)} / ${fmtR(s.return60d)}

━━━ TECHNICAL SIGNALS ━━━
RSI(14): ${fmt(s.rsi14)} ${s.rsi14 != null ? (s.rsi14 >= 70 ? "(overbought)" : s.rsi14 <= 30 ? "(oversold)" : "(neutral)") : ""}
Moving Averages: ${describeMaTrend(s.maTrend)}
MACD: ${describeMacd(s.macdSignalLabel)}

━━━ VALUATION ━━━
PER: ${fmt(f.per, "x")}  PBR: ${fmt(f.pbr, "x")}
Dividend Yield: ${fmt(f.dividend, "%")}
Market Cap: ${f.marketCap != null ? `¥${f.marketCap.toFixed(0)}億` : "N/A"}

━━━ PROFITABILITY ━━━
ROE: ${fmt(f.roe, "%")}  Op Margin: ${fmt(f.opMarginPct, "%")}
EPS: ${f.eps != null ? `¥${f.eps.toFixed(1)}` : "N/A"}
Revenue: ${f.revenueM != null ? `¥${(f.revenueM / 1000).toFixed(0)}億` : "N/A"}
Net Profit: ${f.netProfitM != null ? `¥${(f.netProfitM / 1000).toFixed(0)}億` : "N/A"}

━━━ RECENT NEWS (14 days) ━━━
${newsStr}

━━━ SCORING DIMENSIONS (0-100) ━━━
1. businessQuality: market position, brand, customer loyalty
2. growthScore: sector tailwinds, revenue/earnings trajectory, AI relevance
3. industryScore: supply chain criticality, pricing power, diversification
4. moatScore: competitive moat, barriers to entry, switching costs
5. valuationScore: PER/PBR vs peers, dividend, margin of safety (HIGH = good value)
6. catalystScore: near-term catalysts, earnings revision potential
7. riskScore: risk management quality (HIGH = well-managed; LOW = high risks)

━━━ SCALE ━━━
90-100: Exceptional  80-89: Strong  70-79: Positive  60-69: Neutral  50-59: Mixed  <50: Challenged

━━━ OUTPUT (strict JSON) ━━━
{"gptScore":<int 0-100>,"businessQuality":<int>,"growthScore":<int>,"industryScore":<int>,"moatScore":<int>,"valuationScore":<int>,"catalystScore":<int>,"riskScore":<int>,"confidence":"LOW|MEDIUM|HIGH","action":"POSITIVE|NEUTRAL|NEGATIVE","summaryZh":"<15-20字>","summaryJa":"<15-20字>","summaryEn":"<12-20 words>","thesisZh":"<60-120字，结尾：仅供研究参考，不构成投资建议。>","thesisJa":"<60-120字>","thesisEn":"<50-120 chars, end: For research only.>","strengths":["p1","p2","p3"],"risks":["r1","r2"],"catalysts":["c1","c2"],"timeHorizon":"1-3M|3-6M|6-12M"}`;
}

// ── GPT call with retry ───────────────────────────────────────────────────────
async function callGPT(prompt: string, retries = 2): Promise<GPTResponse> {
  if (!oai) throw new Error("No OpenAI client (dry-run mode)");
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await oai.chat.completions.create({
        model: GPT_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.6,
        max_tokens: 1100,
        response_format: { type: "json_object" },
      });
      const raw = resp.choices[0]?.message?.content ?? "";
      const parsed = JSON.parse(raw) as GPTResponse;
      if (typeof parsed.gptScore !== "number") throw new Error("gptScore missing");
      const clamp = (v: unknown) => typeof v === "number" ? Math.max(0, Math.min(100, Math.round(v))) : 50;
      parsed.gptScore       = clamp(parsed.gptScore);
      parsed.businessQuality = clamp(parsed.businessQuality);
      parsed.growthScore    = clamp(parsed.growthScore);
      parsed.industryScore  = clamp(parsed.industryScore);
      parsed.moatScore      = clamp(parsed.moatScore);
      parsed.valuationScore = clamp(parsed.valuationScore);
      parsed.catalystScore  = clamp(parsed.catalystScore);
      parsed.riskScore      = clamp(parsed.riskScore);
      parsed.strengths = Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 5) : [];
      parsed.risks     = Array.isArray(parsed.risks)     ? parsed.risks.slice(0, 5)     : [];
      parsed.catalysts = Array.isArray(parsed.catalysts) ? parsed.catalysts.slice(0, 5) : [];
      if (!["LOW","MEDIUM","HIGH"].includes(parsed.confidence))      parsed.confidence = "MEDIUM";
      if (!["POSITIVE","NEUTRAL","NEGATIVE"].includes(parsed.action)) parsed.action    = "NEUTRAL";
      return parsed;
    } catch (e) {
      if (attempt === retries) throw e;
      console.warn(`  ⚠ GPT parse error (attempt ${attempt + 1}), retrying...`);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw new Error("All GPT retries exhausted");
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const scriptStart = Date.now();
  console.log(`\n🚀 Top500 GPT Rerank — V9 P1`);
  console.log(`   Model: ${GPT_MODEL}  |  MaxProcess: ${MAX_PROCESS}  |  Force: ${FORCE}  |  DryRun: ${DRY_RUN}`);
  console.log(`${"═".repeat(70)}`);

  // ── Step 1: Load Top500 from StockScore ────────────────────────────────────
  console.log(`\n[Step 1] Loading Top${TOP_N} from StockScore…`);
  const top500 = await prisma.stockScore.findMany({
    where: { priceCount: { gte: 20 }, adaptiveScore: { not: null } },
    orderBy: [{ adaptiveScore: "desc" }, { percentileRank: "asc" }],
    take: TOP_N,
    select: {
      symbol: true, name: true, nameZh: true, sector: true, market: true,
      adaptiveScore: true, percentileRank: true, opportunityScore: true,
      return5d: true, return20d: true, return60d: true,
      rsi14: true, maTrend: true, macdSignalLabel: true,
      latestClose: true, priceCount: true, computedAt: true,
    },
  });

  const totalStocks = await prisma.stockScore.count({ where: { adaptiveScore: { not: null } } });
  console.log(`   totalStocks        = ${totalStocks}`);
  console.log(`   ruleSelectedCount  = ${top500.length} (Top${TOP_N})`);

  if (top500.length === 0) {
    console.error("❌ No scored stocks found. Run npm run compute-scores first.");
    process.exit(1);
  }

  const toProcess = top500.slice(0, MAX_PROCESS);
  const processSymbols = toProcess.map((s) => s.symbol);

  // ── Step 2: Batch-fetch auxiliary data ────────────────────────────────────
  console.log(`\n[Step 2] Fetching fundamentals, news, themes…`);

  const [aiThemeRows, stockFundRows, stockIdRows] = await Promise.all([
    prisma.aITheme.findMany({ select: { symbol: true, theme: true } }),
    prisma.stock.findMany({
      where: { symbol: { in: processSymbols } },
      select: { symbol: true, per: true, pbr: true, roe: true, dividend: true, marketCap: true, high52w: true, low52w: true },
    }),
    prisma.stock.findMany({
      where: { symbol: { in: processSymbols } },
      select: { id: true, symbol: true },
    }),
  ]);

  const aiThemeMap = new Map<string, string[]>();
  for (const r of aiThemeRows) {
    const arr = aiThemeMap.get(r.symbol) ?? []; arr.push(r.theme); aiThemeMap.set(r.symbol, arr);
  }
  const stockFundMap = new Map(stockFundRows.map((s) => [s.symbol, s]));
  const symbolToStockId = new Map(stockIdRows.map((s) => [s.symbol, s.id]));
  const stockIdToSymbol = new Map(stockIdRows.map((s) => [s.id, s.symbol]));
  const stockIds = stockIdRows.map((s) => s.id);

  const [finRows, newsRows] = await Promise.all([
    prisma.financial.findMany({
      where: { stockId: { in: stockIds } },
      select: { stockId: true, revenue: true, operatingProfit: true, netProfit: true, eps: true, fiscalYear: true, quarter: true },
      orderBy: [{ fiscalYear: "desc" }, { quarter: "desc" }],
      take: stockIds.length * 4,
    }),
    prisma.news.findMany({
      where: { stockId: { in: stockIds }, publishedAt: { gte: new Date(Date.now() - 14 * 86400_000) } },
      select: { stockId: true, title: true, sentiment: true },
      orderBy: { publishedAt: "desc" },
      take: 5000,
    }),
  ]);

  const latestFinMap = new Map<number, typeof finRows[0]>();
  for (const f of finRows) { if (!latestFinMap.has(f.stockId)) latestFinMap.set(f.stockId, f); }

  const newsBySymbol = new Map<string, { title: string; sentiment: string | null }[]>();
  for (const n of newsRows) {
    if (n.stockId == null) continue;
    const sym = stockIdToSymbol.get(n.stockId); if (!sym) continue;
    const arr = newsBySymbol.get(sym) ?? []; if (arr.length < 5) arr.push({ title: n.title, sentiment: n.sentiment });
    newsBySymbol.set(sym, arr);
  }

  // ── Step 3: Load existing GPTScore cache ──────────────────────────────────
  const existingScores = await prisma.gPTScore.findMany({
    where: { symbol: { in: processSymbols } },
    select: { symbol: true, inputHash: true, updatedAt: true, gptScore: true, finalScore: true },
  });
  const existingMap = new Map(existingScores.map((s) => [s.symbol, s]));

  // ── Step 4: GPT scoring loop ──────────────────────────────────────────────
  console.log(`\n[Step 3] GPT scoring Top${toProcess.length}…`);
  const NOW = Date.now();

  type UpsertPayload = {
    model: string; ruleScore: number; gptScore: number; finalScore: number;
    gptRating: string; gptRank: number | null;
    businessQuality: number; growthScore: number; industryScore: number;
    moatScore: number; valuationScore: number; catalystScore: number; riskScore: number;
    confidence: string; action: string;
    summaryZh: string; summaryJa: string; summaryEn: string;
    thesisZh: string; thesisJa: string; thesisEn: string;
    strengths: string[]; risks: string[]; catalysts: string[];
    timeHorizon: string; inputHash: string;
  };

  type ScoredEntry = {
    symbol: string;
    adaptiveScore: number;
    percentileRank: number | null;
    gptScore: number;
    finalScore: number;
    gptRating: string;
    gptRank: number | null;
    upsertData: UpsertPayload | null;
    fromCache: boolean;
  };

  const scored: ScoredEntry[] = [];
  let gptCalled = 0, gptCached = 0, gptFailed = 0;

  for (const sc of toProcess) {
    const inputHash = buildInputHash(sc);
    const existing  = existingMap.get(sc.symbol);
    const ruleScore = sc.adaptiveScore ?? 0;

    // Cache check
    if (!FORCE && !DRY_RUN && existing) {
      const age = NOW - existing.updatedAt.getTime();
      if (age < CACHE_TTL && existing.inputHash === inputHash) {
        const cachedGptScore = existing.gptScore;
        // Recompute finalScore with V10 70/30 formula (not the stored V9 pure-GPT value)
        const isStaleCache = sc.computedAt != null && (NOW - sc.computedAt.getTime()) > 2 * 86400_000;
        const rawFinalCache = applySafetyCaps(cachedGptScore, isStaleCache, sc.return60d, sc.rsi14);
        const finalScore = Math.round((ruleScore * 0.7 + rawFinalCache * 0.3) * 10) / 10;
        const gptRating = computeRating(finalScore, sc.percentileRank);
        scored.push({
          symbol: sc.symbol,
          adaptiveScore: ruleScore,
          percentileRank: sc.percentileRank,
          gptScore: cachedGptScore,
          finalScore,
          gptRating,
          gptRank: null,
          upsertData: null as never,
          fromCache: true,
        });
        gptCached++;
        process.stdout.write(`  ✓ ${sc.symbol.padEnd(10)} [cache] gpt=${String(Math.round(cachedGptScore)).padStart(3)} final=${finalScore.toFixed(1).padStart(5)}\n`);
        continue;
      }
    }

    if (DRY_RUN) {
      const gptRating = computeRating(ruleScore, sc.percentileRank);
      scored.push({
        symbol: sc.symbol, adaptiveScore: ruleScore, percentileRank: sc.percentileRank,
        gptScore: ruleScore, finalScore: ruleScore, gptRating,
        gptRank: null, upsertData: null as never, fromCache: false,
      });
      process.stdout.write(`  ○ ${sc.symbol.padEnd(10)} [dry-run] rule=${ruleScore.toFixed(0).padStart(3)}\n`);
      continue;
    }

    // Build fundamentals
    const isStale = sc.computedAt != null && (NOW - sc.computedAt.getTime()) > 2 * 86400_000;
    const sf  = stockFundMap.get(sc.symbol);
    const fin = latestFinMap.get(symbolToStockId.get(sc.symbol) ?? -1);
    const opMarginPct = fin?.revenue && fin.operatingProfit ? (fin.operatingProfit / fin.revenue) * 100 : null;
    const fundamentals: StockFundamentals = {
      per: sf?.per ?? null, pbr: sf?.pbr ?? null, roe: sf?.roe ?? null,
      dividend: sf?.dividend ?? null, marketCap: sf?.marketCap ?? null,
      high52w: sf?.high52w ?? null, low52w: sf?.low52w ?? null,
      opMarginPct, revenueM: fin?.revenue ?? null, netProfitM: fin?.netProfit ?? null, eps: fin?.eps ?? null,
    };

    try {
      const prompt = buildPrompt({
        symbol: sc.symbol, name: sc.name, nameZh: sc.nameZh, sector: sc.sector, market: sc.market,
        return5d: sc.return5d, return20d: sc.return20d, return60d: sc.return60d,
        rsi14: sc.rsi14, maTrend: sc.maTrend, macdSignalLabel: sc.macdSignalLabel, latestClose: sc.latestClose,
        aiThemes: aiThemeMap.get(sc.symbol) ?? [],
        recentNews: newsBySymbol.get(sc.symbol) ?? [],
        fundamentals,
      });

      const gptResp = await callGPT(prompt);
      const rawFinal = applySafetyCaps(gptResp.gptScore, isStale, sc.return60d, sc.rsi14);
      const finalScore = Math.round((ruleScore * 0.7 + rawFinal * 0.3) * 10) / 10;  // V10: 70/30 blend
      const gptRating  = computeRating(finalScore, sc.percentileRank);

      const upsertData = {
        model: GPT_MODEL,
        ruleScore: Math.round(ruleScore * 10) / 10,
        gptScore:  gptResp.gptScore,
        finalScore,
        gptRating,
        gptRank: null as number | null,  // assigned after sorting
        businessQuality: gptResp.businessQuality,
        growthScore:     gptResp.growthScore,
        industryScore:   gptResp.industryScore,
        moatScore:       gptResp.moatScore,
        valuationScore:  gptResp.valuationScore,
        catalystScore:   gptResp.catalystScore,
        riskScore:       gptResp.riskScore,
        confidence:  gptResp.confidence,
        action:      gptResp.action,
        summaryZh:   gptResp.summaryZh,
        summaryJa:   gptResp.summaryJa,
        summaryEn:   gptResp.summaryEn,
        thesisZh:    gptResp.thesisZh,
        thesisJa:    gptResp.thesisJa,
        thesisEn:    gptResp.thesisEn,
        strengths:   gptResp.strengths,
        risks:       gptResp.risks,
        catalysts:   gptResp.catalysts,
        timeHorizon: gptResp.timeHorizon,
        inputHash,
      };

      scored.push({
        symbol: sc.symbol, adaptiveScore: ruleScore, percentileRank: sc.percentileRank,
        gptScore: gptResp.gptScore, finalScore, gptRating,
        gptRank: null, upsertData, fromCache: false,
      });
      gptCalled++;

      const diff   = (gptResp.gptScore - ruleScore).toFixed(0);
      const dir    = gptResp.gptScore > ruleScore ? "↑" : gptResp.gptScore < ruleScore ? "↓" : "=";
      const diffStr = parseFloat(diff) > 0 ? `+${diff}` : diff;
      console.log(
        `  ✅ ${sc.symbol.padEnd(10)} rule=${ruleScore.toFixed(0).padStart(3)} gpt=${String(gptResp.gptScore).padStart(3)} final=${finalScore.toFixed(1).padStart(5)} diff=${diffStr.padStart(4)} ${dir} [${gptResp.confidence}]`
      );
    } catch (e) {
      gptFailed++;
      console.error(`  ❌ ${sc.symbol}: ${e instanceof Error ? e.message : String(e)}`);
      // Still include in scored with ruleScore as fallback (no gpt upsert)
    }
  }

  // ── Step 5: Sort by finalScore DESC, assign gptRank ──────────────────────
  console.log(`\n[Step 4] Sorting by finalScore DESC, assigning gptRank…`);
  scored.sort((a, b) => {
    const diff = b.finalScore - a.finalScore;
    if (Math.abs(diff) > 0.01) return diff;
    return (b.adaptiveScore ?? 0) - (a.adaptiveScore ?? 0);
  });

  scored.forEach((s, i) => {
    s.gptRank = i + 1;
    if (s.upsertData) s.upsertData.gptRank = i + 1;
  });

  const gptRerankCount = scored.length;

  // ── Step 6: Upsert to DB ─────────────────────────────────────────────────
  if (!DRY_RUN) {
    // Clear all stale gptRank values before writing fresh ranks.
    // This eliminates duplicates from previous --limit=N test runs or partial runs.
    await prisma.gPTScore.updateMany({ data: { gptRank: null } });
    console.log(`[Step 5] Cleared all stale gptRank. Upserting ${scored.length} entries to GPTScore…`);
    let savedCount = 0;
    for (const entry of scored) {
      if (entry.fromCache) {
        // Cache hit: write new V10 finalScore + gptRating + gptRank (gptRank cleared above)
        await prisma.gPTScore.update({
          where: { symbol: entry.symbol },
          data: { finalScore: entry.finalScore, ruleScore: entry.adaptiveScore, gptRating: entry.gptRating, gptRank: entry.gptRank },
        }).catch(() => {});
        savedCount++;
        continue;
      }
      if (!entry.upsertData) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await prisma.gPTScore.upsert({
        where: { symbol: entry.symbol },
        create: { symbol: entry.symbol, ...(entry.upsertData as Record<string, unknown>) } as Parameters<typeof prisma.gPTScore.upsert>[0]["create"],
        update: entry.upsertData as Record<string, unknown>,
      });
      savedCount++;
    }
    console.log(`   finalSavedCount = ${savedCount}`);
  }

  // ── Step 7: Rating distribution ─────────────────────────────────────────
  const ratingCounts = { STRONG_BUY: 0, BUY: 0, HOLD: 0, WATCH: 0, AVOID: 0 };
  for (const s of scored) {
    const r = s.gptRating as keyof typeof ratingCounts;
    if (r in ratingCounts) ratingCounts[r]++;
  }

  // ── Log output ───────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - scriptStart) / 1000).toFixed(1);
  const displayPool  = scored.slice(0, DISPLAY_N);
  const reservePool  = scored.slice(DISPLAY_N, TOP_N);

  console.log(`\n${"═".repeat(70)}`);
  console.log(`📊 RERANK RESULTS — V9 P1`);
  console.log(`${"─".repeat(70)}`);
  console.log(`  totalStocks        = ${totalStocks}`);
  console.log(`  ruleScoredStocks   = ${top500.length}`);
  console.log(`  ruleSelectedCount  = ${toProcess.length} (Top${TOP_N})`);
  console.log(`  gptRerankCount     = ${gptRerankCount}`);
  console.log(`  gptSuccessCount    = ${gptCalled}`);
  console.log(`  gptCachedCount     = ${gptCached}`);
  console.log(`  gptFailCount       = ${gptFailed}`);
  console.log(`  finalSavedCount    = ${DRY_RUN ? "(dry-run skip)" : scored.length}`);
  console.log(`  displayCount       = ${displayPool.length} (Rank 1–${DISPLAY_N})`);
  console.log(`  reserveCount       = ${reservePool.length} (Rank ${DISPLAY_N + 1}–${TOP_N})`);
  console.log(`${"─".repeat(70)}`);
  console.log(`  strongBuyCount  = ${ratingCounts.STRONG_BUY}`);
  console.log(`  buyCount        = ${ratingCounts.BUY}`);
  console.log(`  holdCount       = ${ratingCounts.HOLD}`);
  console.log(`  watchCount      = ${ratingCounts.WATCH}`);
  console.log(`  avoidCount      = ${ratingCounts.AVOID}`);
  console.log(`${"─".repeat(70)}`);
  console.log(`  ⏱  elapsed: ${elapsed}s`);

  // Top10
  console.log(`\n🏆 TOP 10 (by finalScore)`);
  console.log(`${"─".repeat(90)}`);
  console.log(`  #   symbol       adaptiveScore  gptScore  finalScore  percentileRank  gptRating`);
  console.log(`${"─".repeat(90)}`);
  scored.slice(0, 10).forEach((s, i) => {
    console.log(
      `  ${String(i + 1).padStart(2)}  ${s.symbol.padEnd(12)} ` +
      `${s.adaptiveScore.toFixed(1).padStart(12)}  ` +
      `${String(Math.round(s.gptScore)).padStart(8)}  ` +
      `${s.finalScore.toFixed(1).padStart(10)}  ` +
      `${(s.percentileRank?.toFixed(1) ?? "N/A").padStart(14)}  ` +
      `${s.gptRating}`
    );
  });
  console.log(`${"═".repeat(70)}\n`);

  // ── Step 8: Save DailyRecommendation snapshot ────────────────────────────
  if (!DRY_RUN) {
    console.log("📸 Step 8 — saving DailyRecommendation snapshot …");
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Fetch buy prices from StockScore.latestClose in one query
    const symbols = scored.map((s) => s.symbol);
    const priceRows = await prisma.stockScore.findMany({
      where: { symbol: { in: symbols } },
      select: { symbol: true, latestClose: true },
    });
    const priceMap = new Map<string, number | null>(
      priceRows.map((r) => [r.symbol, r.latestClose ?? null]),
    );

    // Fetch GPT summaryZh for display
    const gptRows = await prisma.gPTScore.findMany({
      where: { symbol: { in: symbols } },
      select: { symbol: true, summaryZh: true },
    });
    const summaryMap = new Map<string, string>(
      gptRows.map((r) => [r.symbol, r.summaryZh]),
    );

    let savedCount = 0;
    for (const entry of scored) {
      try {
        await prisma.dailyRecommendation.upsert({
          where: { date_symbol: { date: today, symbol: entry.symbol } },
          create: {
            date: today,
            symbol: entry.symbol,
            gptRank: entry.gptRank!,
            finalScore: entry.finalScore,
            adaptiveScore: entry.adaptiveScore,
            gptScore: entry.gptScore,
            gptRating: entry.gptRating ?? null,
            buyPrice: priceMap.get(entry.symbol) ?? null,
            summaryZh: summaryMap.get(entry.symbol) ?? null,
          },
          update: {
            gptRank: entry.gptRank!,
            finalScore: entry.finalScore,
            adaptiveScore: entry.adaptiveScore,
            gptScore: entry.gptScore,
            gptRating: entry.gptRating ?? null,
            buyPrice: priceMap.get(entry.symbol) ?? null,
            summaryZh: summaryMap.get(entry.symbol) ?? null,
          },
        });
        savedCount++;
      } catch {
        // individual upsert failure — continue
      }
    }
    console.log(`  ✅ saved ${savedCount}/${scored.length} entries for ${today.toISOString().slice(0, 10)}`);
  } else {
    console.log("  [DRY_RUN] skip DailyRecommendation snapshot");
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
