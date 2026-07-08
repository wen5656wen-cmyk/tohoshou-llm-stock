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
import { composeTopPicks, TOP_PICK_GATES, type PickInput, type NegativeNews } from "../lib/ai-top-picks";

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
      ruleConfidence: true, latestClose: true, return20d: true,
    },
  });
  if (!scores.length) { console.log("无 STRONG_BUY/BUY 候选 → 跳过"); return; }
  const symbols = scores.map((s) => s.symbol);

  // 2) AlphaScore（最新日）：symbol → alphaScore / percentile
  const alphaLatest = await prisma.alphaScore.findFirst({ orderBy: { date: "desc" }, select: { date: true } });
  const alphaMap = new Map<string, { alphaScore: number; percentile: number }>();
  if (alphaLatest) {
    const rows = await prisma.alphaScore.findMany({ where: { date: alphaLatest.date }, select: { symbol: true, alphaScore: true, percentile: true } });
    for (const r of rows) alphaMap.set(r.symbol, { alphaScore: r.alphaScore, percentile: r.percentile });
  }

  // 3) 名称
  const stocks = await prisma.stock.findMany({ where: { symbol: { in: symbols } }, select: { symbol: true, name: true, nameZh: true } });
  const nameMap = new Map(stocks.map((s) => [s.symbol, s.nameZh || s.name]));

  // 3b) V1.1 Gate2 流动性：AlphaFactor.averageTurnover20（最新日，日元）
  const afLatest = await prisma.alphaFactor.findFirst({ orderBy: { date: "desc" }, select: { date: true } });
  const turnoverMap = new Map<string, number>();
  if (afLatest) {
    const rows = await prisma.alphaFactor.findMany({ where: { date: afLatest.date, symbol: { in: symbols } }, select: { symbol: true, averageTurnover20: true } });
    for (const r of rows) if (r.averageTurnover20 != null) turnoverMap.set(r.symbol, r.averageTurnover20);
  }

  // 3c) V1.1 Gate1 News：最近 ~3 交易日高影响利空（Disclosure 结构化事件）
  const newsCutoff = new Date(Date.now() - TOP_PICK_GATES.newsLookbackDays * 86400 * 1000);
  const disclosures = await prisma.disclosure.findMany({
    where: { symbol: { in: symbols }, publishedAt: { gte: newsCutoff } },
    select: { symbol: true, category: true, sentiment: true, importance: true, title: true, publishedAt: true },
    orderBy: { publishedAt: "desc" },
  });
  const negNewsMap = new Map<string, NegativeNews>();
  const isHighNegative = (d: (typeof disclosures)[number]): boolean =>
    (d.category === "FORECAST_REVISION" && d.sentiment === "NEGATIVE") ||   // 业绩下修
    d.category === "EQUITY" ||                                              // 增发/稀释
    (d.category === "MATERIAL" && d.sentiment === "NEGATIVE") ||            // 诉讼/退市/审计等重大负面
    (d.sentiment === "NEGATIVE" && (d.importance ?? 0) >= 2);              // 其他高影响负面
  for (const d of disclosures) {
    if (!negNewsMap.has(d.symbol) && isHighNegative(d)) {
      negNewsMap.set(d.symbol, { category: d.category, title: d.title, publishedAt: d.publishedAt.toISOString().slice(0, 10) });
    }
  }

  const toInput = (s: (typeof scores)[number]): PickInput => {
    const a = alphaMap.get(s.symbol);
    return {
      symbol: s.symbol, name: nameMap.get(s.symbol) ?? null,
      sourceRating: s.recommendationV2 === "STRONG_BUY" ? "STRONG_BUY" : "BUY",
      latestClose: s.latestClose, aiScore: s.adaptiveScore,
      alphaScore: a?.alphaScore ?? null, contribution: a?.percentile ?? null,
      confidence: s.ruleConfidence, highRiskFlag: s.highRiskFlag,
      gate: { turnover: turnoverMap.get(s.symbol) ?? null, momentum20d: s.return20d, negativeNews: negNewsMap.get(s.symbol) ?? null },
    };
  };
  const strongBuys = scores.filter((s) => s.recommendationV2 === "STRONG_BUY").map(toInput);
  const buys = scores.filter((s) => s.recommendationV2 === "BUY").map(toInput);

  // 4) Quality Gates + 综合重排 Top5
  const { picks, rejected, stats } = composeTopPicks(strongBuys, buys, 5, TOP_PICK_GATES);
  console.log(`候选 ${stats.candidates} → News拒 ${stats.newsReject} · 流动性拒 ${stats.liquidityReject} · 动量罚 ${stats.momentumPenalty} → Top ${stats.finalPicks}:`);
  for (const p of picks) console.log(`  #${p.rank} ${p.symbol} ${p.name ?? ""} comp=${p.compositeScore}${p.momentumPenalty ? `(raw${p.rawComposite}−${p.momentumPenalty})` : ""} (ai${p.aiScoreN}/alpha${p.alphaScoreN}/pct${p.contributionN}/turn${p.gate.turnover ? (p.gate.turnover / 1e8).toFixed(1) + "亿" : "—"}/m20d${p.gate.momentum20d ?? "—"}) [${p.sourceRating}]`);
  for (const r of rejected) console.log(`  ✗ ${r.symbol} ${r.name ?? ""} REJECT ${r.reason} — ${r.detail}`);

  if (DRY_RUN) { console.log("(DRY RUN — 未写)"); return; }

  // 5) upsert（entryPrice/entryDate 冻结不覆盖；重排分/理由/门控快照更新）
  for (const p of picks) {
    await prisma.aiTopPick.upsert({
      where: { date_symbol: { date, symbol: p.symbol } },
      create: {
        date, rank: p.rank, symbol: p.symbol, name: p.name, sourceRating: p.sourceRating,
        entryPrice: p.latestClose, entryDate: date,
        aiScore: p.aiScoreN, alphaScore: p.alphaScoreN, contribution: p.contributionN,
        confidence: p.confidenceN, riskScore: p.riskScore, compositeScore: p.compositeScore,
        momentumPenalty: p.momentumPenalty, turnover: p.gate.turnover, momentum20d: p.gate.momentum20d, reason: p.reason,
        currentPrice: p.latestClose, returnPct: 0,
      },
      update: {
        rank: p.rank, name: p.name, sourceRating: p.sourceRating,
        aiScore: p.aiScoreN, alphaScore: p.alphaScoreN, contribution: p.contributionN,
        confidence: p.confidenceN, riskScore: p.riskScore, compositeScore: p.compositeScore,
        momentumPenalty: p.momentumPenalty, turnover: p.gate.turnover, momentum20d: p.gate.momentum20d, reason: p.reason,
        // entryPrice / entryDate 不覆盖（历史冻结）
      },
    });
  }

  // 5b) Filter Log（Gate 统计 + 被拒候选）
  await prisma.aiTopPickFilter.upsert({
    where: { date },
    create: {
      date, candidates: stats.candidates, newsReject: stats.newsReject, liquidityReject: stats.liquidityReject,
      momentumPenalty: stats.momentumPenalty, finalPicks: stats.finalPicks,
      rejected: JSON.parse(JSON.stringify(rejected)), config: JSON.parse(JSON.stringify(TOP_PICK_GATES)),
    },
    update: {
      candidates: stats.candidates, newsReject: stats.newsReject, liquidityReject: stats.liquidityReject,
      momentumPenalty: stats.momentumPenalty, finalPicks: stats.finalPicks,
      rejected: JSON.parse(JSON.stringify(rejected)), config: JSON.parse(JSON.stringify(TOP_PICK_GATES)),
    },
  });
  // 清理：删除当日已掉出 Top5 的旧行（仅限本 date，历史其它日不动；保证当日恰好 5 只）
  const keep = picks.map((p) => p.symbol);
  const removed = await prisma.aiTopPick.deleteMany({ where: { date, symbol: { notIn: keep } } });
  console.log(`✓ 写入/更新 ${picks.length} 只 Top Picks（date=${date.toISOString().slice(0, 10)}）· 清理掉出 ${removed.count} 只`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
