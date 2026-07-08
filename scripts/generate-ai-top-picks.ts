#!/usr/bin/env npx tsx
/**
 * AI Top Picks — P7 Preview (Experimental V1) daily generator.
 *
 * 每交易日从 STRONG_BUY（不足 5 补 top BUY）综合重排 Top5，写入 AiTopPick。
 * **独立实验模块 · 纯只读派生**：只读 StockScore + AlphaScore（已有数据），绝不修改
 * StrongBuy / DailyRecommendation / Promotion / Strategy / Watchlist / 任何评分逻辑。
 * entryPrice/entryDate 生成时冻结，历史不覆盖（幂等）。
 *
 * Usage:  npm run ai-top-picks
 *         npm run ai-top-picks -- --date=2026-07-08   # explicit (skip JPX guard)
 *         DRY_RUN=1 npm run ai-top-picks
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { isJPXTradingDay } from "../lib/trading-calendar/jpx";
import { composeTopPicks, type PickInput } from "../lib/ai-top-picks";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const DRY_RUN = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");

function todayJstDate(): Date {
  const jst = new Date(Date.now() + 9 * 3600 * 1000);
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()));
}

async function main() {
  console.log(`=== AI Top Picks (P7 Preview V1) ${DRY_RUN ? "(DRY RUN)" : ""} ===`);
  const dateArg = process.argv.find((a) => a.startsWith("--date="))?.split("=")[1];
  const date = dateArg ? new Date(`${dateArg}T00:00:00.000Z`) : todayJstDate();

  if (!dateArg && !isJPXTradingDay(date)) {
    console.log(`${date.toISOString().slice(0, 10)} 非 JPX 交易日 → 跳过（不生成）`);
    return;
  }

  // 1) 候选：STRONG_BUY + BUY（只读 StockScore，最新评分）
  const scores = await prisma.stockScore.findMany({
    where: { priceCount: { gte: 20 }, recommendationV2: { in: ["STRONG_BUY", "BUY"] } },
    select: {
      symbol: true, adaptiveScore: true, recommendationV2: true, highRiskFlag: true,
      ruleConfidence: true, latestClose: true,
    },
  });
  if (!scores.length) { console.log("无 STRONG_BUY/BUY 候选 → 跳过"); return; }

  // 2) AlphaScore（最新日）：symbol → alphaScore / percentile
  const alphaLatest = await prisma.alphaScore.findFirst({ orderBy: { date: "desc" }, select: { date: true } });
  const alphaMap = new Map<string, { alphaScore: number; percentile: number }>();
  if (alphaLatest) {
    const rows = await prisma.alphaScore.findMany({ where: { date: alphaLatest.date }, select: { symbol: true, alphaScore: true, percentile: true } });
    for (const r of rows) alphaMap.set(r.symbol, { alphaScore: r.alphaScore, percentile: r.percentile });
  }

  // 3) 名称
  const symbols = scores.map((s) => s.symbol);
  const stocks = await prisma.stock.findMany({ where: { symbol: { in: symbols } }, select: { symbol: true, name: true, nameZh: true } });
  const nameMap = new Map(stocks.map((s) => [s.symbol, s.nameZh || s.name]));

  const toInput = (s: (typeof scores)[number]): PickInput => {
    const a = alphaMap.get(s.symbol);
    return {
      symbol: s.symbol, name: nameMap.get(s.symbol) ?? null,
      sourceRating: s.recommendationV2 === "STRONG_BUY" ? "STRONG_BUY" : "BUY",
      latestClose: s.latestClose, aiScore: s.adaptiveScore,
      alphaScore: a?.alphaScore ?? null, contribution: a?.percentile ?? null,
      confidence: s.ruleConfidence, highRiskFlag: s.highRiskFlag,
    };
  };
  const strongBuys = scores.filter((s) => s.recommendationV2 === "STRONG_BUY").map(toInput);
  const buys = scores.filter((s) => s.recommendationV2 === "BUY").map(toInput);

  // 4) 综合重排 Top5
  const picks = composeTopPicks(strongBuys, buys, 5);
  console.log(`候选 SB ${strongBuys.length} / BUY ${buys.length} → Top ${picks.length}:`);
  for (const p of picks) console.log(`  #${p.rank} ${p.symbol} ${p.name ?? ""} composite=${p.compositeScore} (ai${p.aiScoreN}/alpha${p.alphaScoreN}/pct${p.contributionN}/conf${p.confidenceN}/risk${p.riskScore}) [${p.sourceRating}]`);

  if (DRY_RUN) { console.log("(DRY RUN — 未写)"); return; }

  // 5) upsert（entryPrice/entryDate 冻结不覆盖；重排分/理由/快照更新）
  for (const p of picks) {
    await prisma.aiTopPick.upsert({
      where: { date_symbol: { date, symbol: p.symbol } },
      create: {
        date, rank: p.rank, symbol: p.symbol, name: p.name, sourceRating: p.sourceRating,
        entryPrice: p.latestClose, entryDate: date,
        aiScore: p.aiScoreN, alphaScore: p.alphaScoreN, contribution: p.contributionN,
        confidence: p.confidenceN, riskScore: p.riskScore, compositeScore: p.compositeScore, reason: p.reason,
        currentPrice: p.latestClose, returnPct: 0,
      },
      update: {
        rank: p.rank, name: p.name, sourceRating: p.sourceRating,
        aiScore: p.aiScoreN, alphaScore: p.alphaScoreN, contribution: p.contributionN,
        confidence: p.confidenceN, riskScore: p.riskScore, compositeScore: p.compositeScore, reason: p.reason,
        // entryPrice / entryDate 不覆盖（历史冻结）
      },
    });
  }
  // 清理：删除当日已掉出 Top5 的旧行（仅限本 date，历史其它日不动；保证当日恰好 5 只）
  const keep = picks.map((p) => p.symbol);
  const removed = await prisma.aiTopPick.deleteMany({ where: { date, symbol: { notIn: keep } } });
  console.log(`✓ 写入/更新 ${picks.length} 只 Top Picks（date=${date.toISOString().slice(0, 10)}）· 清理掉出 ${removed.count} 只`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
