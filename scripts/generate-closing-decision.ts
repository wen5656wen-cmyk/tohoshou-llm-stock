#!/usr/bin/env npx tsx
/**
 * Closing Decision — P6-T12 收盘决策（每交易日 15:15 JST 收盘前最终 AI 决策）。
 *
 * 流程（目标 2 分钟内）：
 *   1) 全市场 EOD 排名（读 StockScore，不重跑 compute-scores、不改任何表）
 *   2) 候选池（AI 分 Top150）Yahoo 实时行情覆盖 + 实时重算 RSI/MACD/MA5/10/20
 *   3) 重排 Top20 → GPT 分析 → 最终 Top10
 *   4) Decision Engine → BUY_TODAY / WATCH_ONLY / STAY_CASH
 *   5) Portfolio Builder → 3-5 只建仓组合 + 仓位
 *   6) 今日第一推荐 + 今日交易总结 + push 文本（本期不外发）
 *   → upsert ClosingDecision（date 唯一，幂等）
 *
 * **独立模块 · 只读派生**：绝不修改 StockScore / DailyRecommendation / DailyAIWatchlist /
 * AiTopPick / 任何评分逻辑 / 其它 Cron。禁止直接使用上午推荐结果（Top20/指标均实时重算）。
 *
 * Usage:  npm run closing-decision
 *         npm run closing-decision -- --date=2026-07-10   # 显式（跳过 JPX 守卫）
 *         DRY_RUN=1 npm run closing-decision
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { isJPXTradingDay } from "../lib/trading-calendar/jpx";
import {
  decideVerdict, buildPortfolio, fetchRichQuotes, recomputeRealtimeIndicators,
  analyzeTop20WithGpt, assessConfidence, suggestHoldPeriod, buildSummary, buildPushText,
  type DecisionRow, type DecisionContext, type GptFact,
} from "../lib/closing-decision";
import { GPT_MODEL } from "../lib/openai";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const DRY_RUN = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");

const SHORTLIST = 150; // 候选池规模（实时覆盖）
const TOP20 = 20;      // GPT 分析规模
const TOP10 = 10;      // 最终输出
const LIQ_MIN_YEN = 5e8;

function todayJstDate(): Date {
  const jst = new Date(Date.now() + 9 * 3600 * 1000);
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()));
}
function jstClock(): string {
  const jst = new Date(Date.now() + 9 * 3600 * 1000);
  return `${String(jst.getUTCHours()).padStart(2, "0")}:${String(jst.getUTCMinutes()).padStart(2, "0")}`;
}
const riskToNum = (lvl: string | null, highRisk: boolean): number => {
  if (lvl === "EXTREME") return 90;
  if (lvl === "HIGH") return 70;
  if (lvl === "MEDIUM") return 45;
  if (lvl === "LOW") return 20;
  return highRisk ? 70 : 40;
};
function mkReason(r: DecisionRow): string {
  return [
    r.recommendationV2 === "STRONG_BUY" ? "强烈买入" : r.recommendationV2 === "BUY" ? "买入" : (r.recommendationV2 ?? ""),
    r.aiScore != null ? `AI ${r.aiScore.toFixed(0)}` : "",
    r.gptScore != null ? `GPT ${r.gptScore.toFixed(0)}` : "",
    r.inBuyZone ? "现价在买区内" : r.breakout ? "⚠已突破买区(追高)" : "低于买区",
    r.negativeNews ? "⚠重大利空" : "",
    r.lowLiquidity ? "⚠流动性不足" : "",
    r.rsi14 != null ? `RSI ${r.rsi14.toFixed(0)}` : "",
  ].filter(Boolean).join(" · ");
}

async function main() {
  const started = Date.now();
  console.log(`=== Closing Decision (P6-T12) ${DRY_RUN ? "(DRY RUN)" : ""} ===`);
  const dateArg = process.argv.find((a) => a.startsWith("--date="))?.split("=")[1];
  const date = dateArg ? new Date(`${dateArg}T00:00:00.000Z`) : todayJstDate();
  const dateStr = date.toISOString().slice(0, 10);

  if (!dateArg && !isJPXTradingDay(date)) {
    console.log(`${dateStr} 非 JPX 交易日 → 跳过（不生成）`);
    return;
  }

  // 1) 市场上下文（最新 MarketRegime）
  const regimeRow = await prisma.marketRegime.findFirst({ orderBy: { date: "desc" } });

  // 2) 全市场 EOD 排名 → 候选池 Top150（读 StockScore，只读）
  const scores = await prisma.stockScore.findMany({
    where: { priceCount: { gte: 20 }, adaptiveScore: { not: null } },
    orderBy: { adaptiveScore: "desc" },
    take: SHORTLIST,
    select: {
      symbol: true, name: true, nameZh: true, sector: true,
      adaptiveScore: true, recommendationV2: true, highRiskFlag: true, ruleConfidence: true,
      latestClose: true, return20d: true, rsi14: true, newsSentimentScore: true,
      entryLow: true, entryHigh: true, target1: true, target2: true, stopLoss: true,
      tradingAction: true, actionRiskLevel: true,
    },
  });
  if (!scores.length) { console.log("无候选（StockScore 空）→ 跳过"); return; }
  const symbols = scores.map((s) => s.symbol);

  // 2b) 流动性（AlphaFactor.averageTurnover20 最新日）
  const afLatest = await prisma.alphaFactor.findFirst({ orderBy: { date: "desc" }, select: { date: true } });
  const turnoverMap = new Map<string, number>();
  if (afLatest) {
    const rows = await prisma.alphaFactor.findMany({ where: { date: afLatest.date, symbol: { in: symbols } }, select: { symbol: true, averageTurnover20: true } });
    for (const r of rows) if (r.averageTurnover20 != null) turnoverMap.set(r.symbol, r.averageTurnover20);
  }

  // 2c) 高影响利空（Disclosure 最近 5 自然日）
  const newsCutoff = new Date(Date.now() - 5 * 86400 * 1000);
  const disclosures = await prisma.disclosure.findMany({
    where: { symbol: { in: symbols }, publishedAt: { gte: newsCutoff } },
    select: { symbol: true, category: true, sentiment: true, importance: true },
  });
  const negNews = new Set<string>();
  for (const d of disclosures) {
    const bad =
      (d.category === "FORECAST_REVISION" && d.sentiment === "NEGATIVE") ||
      d.category === "EQUITY" ||
      (d.category === "MATERIAL" && d.sentiment === "NEGATIVE") ||
      (d.sentiment === "NEGATIVE" && (d.importance ?? 0) >= 2);
    if (bad) negNews.add(d.symbol);
  }

  // 3) 实时行情（分批 Yahoo）
  console.log(`候选池 ${symbols.length} 只 → 拉取实时行情…`);
  const quotes = await fetchRichQuotes(symbols);
  const realtimeCount = [...quotes.values()].filter((q) => q.realtime).length;
  console.log(`实时行情命中 ${realtimeCount}/${symbols.length}`);

  // 3b) DailyPrice 历史（一次查询，分组）→ 实时重算指标
  const histCutoff = new Date(Date.now() - 160 * 86400 * 1000);
  const priceRows = await prisma.dailyPrice.findMany({
    where: { symbol: { in: symbols }, date: { gte: histCutoff } },
    select: { symbol: true, date: true, close: true, adjClose: true },
    orderBy: { date: "asc" },
  });
  const histMap = new Map<string, { date: Date; close: number; adjClose: number | null }[]>();
  for (const r of priceRows) {
    if (!histMap.has(r.symbol)) histMap.set(r.symbol, []);
    histMap.get(r.symbol)!.push(r);
  }

  // 4) 构建候选行（实时价 + 实时指标 + 派生标记）
  const rows: DecisionRow[] = scores.map((s) => {
    const q = quotes.get(s.symbol);
    const price = q?.price ?? s.latestClose ?? null;
    const ind = recomputeRealtimeIndicators(s.symbol, histMap.get(s.symbol) ?? [], q?.price ?? null, dateStr);
    const inBuyZone = price != null && s.entryLow != null && s.entryHigh != null && price >= s.entryLow && price <= s.entryHigh;
    const breakout = price != null && s.entryHigh != null && price > s.entryHigh;
    const negativeNews = negNews.has(s.symbol);
    const turnover = turnoverMap.get(s.symbol);
    const lowLiquidity = turnover != null && turnover < LIQ_MIN_YEN;
    const riskLevel = s.actionRiskLevel;
    const ai = s.adaptiveScore;
    const qualified =
      price != null && !negativeNews && !lowLiquidity &&
      riskLevel !== "EXTREME" &&
      (inBuyZone || (s.tradingAction === "BUY_NOW" && !breakout));
    return {
      rank: 0, symbol: s.symbol, name: s.nameZh || s.name, sector: s.sector,
      price, previousClose: q?.previousClose ?? null,
      changePct: q?.changePct ?? null, volume: q?.volume ?? null,
      volumeRatio: q?.volumeRatio ?? null, turnoverRate: q?.turnoverRate ?? null,
      quoteRealtime: q?.realtime ?? false,
      rsi14: ind.rsi14, macdHist: ind.macdHist, ma5: ind.ma5, ma10: ind.ma10, ma20: ind.ma20,
      return20d: ind.return20d ?? s.return20d,
      aiScore: ai, gptScore: null, gptNote: null, closingScore: ai ?? 0,
      recommendationV2: s.recommendationV2, action: s.tradingAction, riskLevel,
      highRiskFlag: s.highRiskFlag, newsSentiment: s.newsSentimentScore,
      entryLow: s.entryLow, entryHigh: s.entryHigh, target1: s.target1, target2: s.target2, stopLoss: s.stopLoss,
      inBuyZone, breakout, negativeNews, lowLiquidity, qualified,
      reason: null,
    };
  });
  for (const r of rows) r.reason = mkReason(r); // 全行基础理由（top20 稍后加 GPT 后重算）

  // 5) 重排：AI 分降序取 Top20 送 GPT
  const byAi = [...rows].sort((a, b) => (b.aiScore ?? 0) - (a.aiScore ?? 0));
  const top20 = byAi.slice(0, TOP20);

  // 6) GPT 分析 Top20（失败整体回退无 GPT）
  const facts: GptFact[] = top20.map((r) => ({
    symbol: r.symbol, name: r.name, sector: r.sector, aiScore: r.aiScore, price: r.price,
    changePct: r.changePct, rsi14: r.rsi14, macdHist: r.macdHist, ma5: r.ma5, ma20: r.ma20,
    return20d: r.return20d, newsSentiment: r.newsSentiment, riskLevel: r.riskLevel,
    inBuyZone: r.inBuyZone, breakout: r.breakout,
  }));
  const gptMap = await analyzeTop20WithGpt(facts);
  const gptUsed = gptMap.size > 0;
  console.log(`GPT 分析：${gptUsed ? `${gptMap.size} 只（${GPT_MODEL}）` : "未启用/回退（决策由规则引擎产出）"}`);

  // 7) 合并 GPT + 计算 closingScore + 生成理由
  for (const r of top20) {
    const g = gptMap.get(r.symbol);
    r.gptScore = g?.gptScore ?? null;
    r.gptNote = g?.note ?? null;
    r.closingScore = r.gptScore != null ? (r.aiScore ?? 0) * 0.6 + r.gptScore * 0.4 : (r.aiScore ?? 0);
    r.reason = mkReason(r);
  }

  // 8) 最终 Top10（按 closingScore 重排）
  const finalRanked = [...top20].sort((a, b) => b.closingScore - a.closingScore);
  finalRanked.forEach((r, i) => { r.rank = i + 1; });
  const top10 = finalRanked.slice(0, TOP10);

  // 9) Decision Engine（上下文用 Top20 统计）
  const withPrice = top20.filter((r) => r.price != null);
  const inZone = top20.filter((r) => r.inBuyZone).length;
  const broke = top20.filter((r) => r.breakout).length;
  // 合格候选：从**全候选池**取（Top20 多为低流动性小盘，扩大到 150 只以保证组合分散度）
  const qualifiedRows = rows.filter((r) => r.qualified);
  const ctx: DecisionContext = {
    regime: regimeRow?.regime ?? null,
    regimeScore: regimeRow?.regimeScore ?? null,
    marketTrend: regimeRow?.trendScore ?? null,
    volatility: regimeRow?.volatility ?? null,
    avgAiScore: top20.length ? top20.reduce((a, r) => a + (r.aiScore ?? 0), 0) / top20.length : null,
    avgRiskScore: top20.length ? top20.reduce((a, r) => a + riskToNum(r.riskLevel, r.highRiskFlag), 0) / top20.length : null,
    buyZoneHitRate: withPrice.length ? (inZone / withPrice.length) * 100 : null,
    breakoutRatio: withPrice.length ? (broke / withPrice.length) * 100 : null,
    newsRiskCount: top20.filter((r) => r.negativeNews).length,
    qualifiedCount: qualifiedRows.length,
    top1AiScore: top10[0]?.aiScore ?? null,
  };
  const decision = decideVerdict(ctx);
  console.log(`\n裁决：${decision.verdict}（机会分 ${decision.opportunity}）`);
  console.log(`  ${decision.reason}`);

  // 10) Portfolio Builder（合格候选按 closingScore）
  const portfolio = buildPortfolio(
    [...qualifiedRows].sort((a, b) => b.closingScore - a.closingScore),
    decision.verdict,
  );
  console.log(`组合：${portfolio.legs.length ? portfolio.legs.map((l) => `${l.symbol}(${l.weight}%)`).join(" ") : "空仓"}`);

  // 11) top1 + 信心 + 持有期 + 总结 + push
  const top1 = top10[0] ?? null;
  const confidence = assessConfidence(top1, ctx.regime);
  const holdPeriod = suggestHoldPeriod(top1);
  const summary = buildSummary(decision.verdict, top1, portfolio, top10);
  const pushText = buildPushText(dateStr, decision.verdict, top1, portfolio);

  console.log(`\n今日第一推荐：${top1 ? `${top1.symbol} ${top1.name ?? ""} · AI ${top1.aiScore ?? "?"} · GPT ${top1.gptScore ?? "—"} · 信心 ${confidence}` : "无"}`);

  if (DRY_RUN) { console.log("\n(DRY RUN — 未写库)"); return; }

  // 12) 持久化（upsert by date，幂等）
  const elapsedMs = Date.now() - started;
  const top10Json = top10.map((r) => ({
    rank: r.rank, symbol: r.symbol, name: r.name, sector: r.sector,
    price: r.price, changePct: round(r.changePct), aiScore: r.aiScore, gptScore: r.gptScore, gptNote: r.gptNote,
    closingScore: round(r.closingScore), rsi14: round(r.rsi14), macdHist: round(r.macdHist),
    ma5: round(r.ma5), ma10: round(r.ma10), ma20: round(r.ma20),
    volumeRatio: round(r.volumeRatio), turnoverRate: round(r.turnoverRate),
    newsSentiment: r.newsSentiment, riskLevel: r.riskLevel, action: r.action,
    entryLow: r.entryLow, entryHigh: r.entryHigh, target1: r.target1, target2: r.target2, stopLoss: r.stopLoss,
    inBuyZone: r.inBuyZone, breakout: r.breakout, realtime: r.quoteRealtime, reason: r.reason,
  }));
  const portfolioJson = portfolio.legs.map((l) => ({
    symbol: l.symbol, name: l.name, sector: l.sector, weight: l.weight, price: l.price,
    entryLow: l.entryLow, entryHigh: l.entryHigh, target1: l.target1, stopLoss: l.stopLoss,
    aiScore: l.aiScore, gptScore: l.gptScore, reason: l.reason,
  }));

  const payload = {
    verdict: decision.verdict, verdictReason: decision.reason,
    regime: ctx.regime, regimeScore: ctx.regimeScore, marketTrend: ctx.marketTrend, volatility: ctx.volatility,
    avgAiScore: round(ctx.avgAiScore), avgRiskScore: round(ctx.avgRiskScore),
    buyZoneHitRate: round(ctx.buyZoneHitRate), breakoutRatio: round(ctx.breakoutRatio),
    newsRiskCount: ctx.newsRiskCount, qualifiedCount: ctx.qualifiedCount, opportunity: decision.opportunity,
    top1Symbol: top1?.symbol ?? null, top1Name: top1?.name ?? null, top1AiScore: top1?.aiScore ?? null,
    top1GptScore: top1?.gptScore ?? null, top1Price: top1?.price ?? null, top1ChangePct: round(top1?.changePct ?? null),
    top1EntryLow: top1?.entryLow ?? null, top1EntryHigh: top1?.entryHigh ?? null,
    top1Target1: top1?.target1 ?? null, top1Target2: top1?.target2 ?? null, top1StopLoss: top1?.stopLoss ?? null,
    top1HoldPeriod: holdPeriod, top1Confidence: confidence,
    portfolio: JSON.parse(JSON.stringify(portfolioJson)), portfolioNote: portfolio.note,
    top10: JSON.parse(JSON.stringify(top10Json)),
    summary, pushText,
    gptModel: gptUsed ? GPT_MODEL : null, universeCount: scores.length, shortlistCount: symbols.length,
    gptAnalyzed: gptMap.size, elapsedMs, decidedAtJst: jstClock(),
  };
  await prisma.closingDecision.upsert({
    where: { date }, create: { date, ...payload }, update: payload,
  });
  console.log(`\n✓ 写入 ClosingDecision（date=${dateStr}）· 耗时 ${(elapsedMs / 1000).toFixed(1)}s`);
}

function round(v: number | null | undefined, d = 2): number | null {
  if (v == null) return null;
  return Math.round(v * 10 ** d) / 10 ** d;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
