#!/usr/bin/env npx tsx
/**
 * 全量AI评分计算脚本 V7.7
 *
 * Pass 1: 逐只股票计算技术/基本面/资金面/情绪/全球 五维评分 + adaptiveScore
 * Pass 2: 全市场排名 → percentileRank + marketRank
 *          双门槛评级 → recommendationV2
 *          机会分 → opportunityScore + opportunityRank
 *
 * 用法：npm run compute-scores
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { calcIndicators } from "../lib/indicators";
import { calcAiScore, type ScoreInput, type GlobalMarketData, type InstitutionalFlowData, computeCatalystScore, calcDividendScore } from "../lib/ai-score";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const MIN_PRICE_COUNT = 20;

// ── V7.7 dual-threshold recommendation ─────────────────────────────────────

function computeRecommendationV2(
  adaptiveScore: number,
  percentileRank: number,
): { rec: string; reason: string } {
  if (adaptiveScore >= 75 && percentileRank <= 5) {
    return {
      rec: "STRONG_BUY",
      reason: `adaptiveScore=${adaptiveScore.toFixed(1)}（≥75）且前${percentileRank.toFixed(1)}%（≤5%）`,
    };
  }
  if (adaptiveScore >= 70 && percentileRank <= 15) {
    return {
      rec: "BUY",
      reason: `adaptiveScore=${adaptiveScore.toFixed(1)}（≥70）且前${percentileRank.toFixed(1)}%（≤15%）`,
    };
  }
  if (adaptiveScore >= 60) {
    return { rec: "HOLD", reason: `adaptiveScore=${adaptiveScore.toFixed(1)}（≥60）` };
  }
  if (adaptiveScore >= 45) {
    return { rec: "WATCH", reason: `adaptiveScore=${adaptiveScore.toFixed(1)}（≥45）` };
  }
  return { rec: "AVOID", reason: `adaptiveScore=${adaptiveScore.toFixed(1)}（<45）` };
}

// ── V7.7 opportunity score ────────────────────────────────────────────────────

function computeOpportunityScore(params: {
  adaptiveScore: number;
  percentileRank: number;
  moneyFlowScore: number | null;
  catalystScore: number | null;
  rsi14: number | null;
  highRiskFlag: boolean;
  fundamentalScore: number | null;
}): { score: number; label: string } {
  const { adaptiveScore, percentileRank, moneyFlowScore, catalystScore, rsi14, highRiskFlag, fundamentalScore } = params;

  // percentile strength: top 1% → 20 pts, top 10% → 10pts, etc.
  const percentileStrength = Math.max(0, 20 - percentileRank * 0.2);

  // base = 50% adaptiveScore
  let score = adaptiveScore * 0.50;
  score += percentileStrength; // up to 20 pts
  score += ((moneyFlowScore ?? 10) / 20) * 10; // 0-10 pts
  score += ((catalystScore ?? 5) / 10) * 10;   // 0-10 pts

  // risk penalty
  let penalty = 0;
  if (highRiskFlag) penalty += 8;
  if (rsi14 != null && rsi14 > 80) penalty += 5;
  if ((fundamentalScore ?? 15) < 8) penalty += 5;

  score = Math.max(0, Math.min(100, score - penalty));

  const isHighRisk = highRiskFlag || (rsi14 != null && rsi14 > 80);
  const label = isHighRisk ? "HIGH_RISK_SPECULATIVE" : "STEADY";

  return { score: Math.round(score * 10) / 10, label };
}

async function main() {
  console.log("=== AI评分全量计算 V7.7 ===\n");
  const start = Date.now();

  // ── 预加载空売り比率 ──────────────────────────────────────────────────────────
  const latestShortSelling = await prisma.shortSellingRatio.findFirst({
    where: { market: "ALL", source: "jpx_real" },
    orderBy: { date: "desc" },
    select: { date: true, shortSellRatio: true, source: true },
  });
  const shortSellingSource = latestShortSelling ? "jpx_real" : "fallback";
  const shortSellRatio = latestShortSelling?.shortSellRatio ?? null;
  if (latestShortSelling) {
    const dateStr = latestShortSelling.date instanceof Date
      ? latestShortSelling.date.toISOString().split("T")[0]
      : String(latestShortSelling.date).split("T")[0];
    console.log(`✓ ShortSellingRatio: ${dateStr}, 市場空売り比率=${shortSellRatio?.toFixed(1)}%`);
  } else {
    console.log("⚠ ShortSellingRatio: 無実データ → shortSellingSource=fallback");
  }

  // ── 预加载全球市场数据 ──────────────────────────────────────────────────────
  const latestGlobalMarket = await prisma.globalMarket.findFirst({
    orderBy: { date: "desc" },
    select: { date: true, nasdaqChange: true, vix: true, usdjpy: true, nikkeiChange: true, topixChange: true, score: true, source: true },
  });

  let globalMarketData: GlobalMarketData | null = null;
  if (latestGlobalMarket) {
    const ageDays = (Date.now() - latestGlobalMarket.date.getTime()) / 86400000;
    if (ageDays <= 7) {
      globalMarketData = {
        nasdaqChange: latestGlobalMarket.nasdaqChange,
        vixLevel:     latestGlobalMarket.vix,
        usdJpy:       latestGlobalMarket.usdjpy,
        nikkeiChange: latestGlobalMarket.nikkeiChange,
        topixChange:  latestGlobalMarket.topixChange,
        score:        latestGlobalMarket.score,
      };
      console.log(`✓ GlobalMarket: ${latestGlobalMarket.date.toISOString().split("T")[0]}, score=${latestGlobalMarket.score}/10`);
    } else {
      console.log(`⚠ GlobalMarket: 数据过期 ${ageDays.toFixed(0)}天前，使用默认值7`);
    }
  }

  // ── 预加载机构资金流向 ─────────────────────────────────────────────────────
  const REAL_FLOW_SOURCES = ["jquants_investor_types", "jpx", "jpx_file", "jpx_manual"];
  const latestRealFlow = await prisma.institutionalFlow.findFirst({
    where: { source: { in: REAL_FLOW_SOURCES } },
    orderBy: { date: "desc" },
    select: { date: true, source: true },
  });
  const latestFlowDate = latestRealFlow ?? await prisma.institutionalFlow.findFirst({
    orderBy: { date: "desc" },
    select: { date: true, source: true },
  });

  let institutionalFlowData: InstitutionalFlowData | null = null;
  if (latestFlowDate && (Date.now() - latestFlowDate.date.getTime()) / 86400000 <= 21) {
    const isJQuants = REAL_FLOW_SOURCES.includes(latestFlowDate.source ?? "");
    const market = isJQuants ? "TSEPrime" : "ALL";
    const flows = await prisma.institutionalFlow.findMany({
      where: { date: latestFlowDate.date, market, source: latestFlowDate.source ?? undefined },
      select: { investorType: true, netAmount: true, source: true },
    });
    const foreigners = flows.find((f) => f.investorType === "foreigners");
    const trust = flows.find((f) => f.investorType === "trust");
    institutionalFlowData = {
      foreignersNet: foreigners?.netAmount ?? null,
      trustNet:      trust?.netAmount ?? null,
      source:        latestFlowDate.source ?? "synthetic",
    };
    const icon = isJQuants ? "✓" : "⚠";
    console.log(`${icon} InstitutionalFlow: ${latestFlowDate.date.toISOString().split("T")[0]}, src=${latestFlowDate.source}`);
  }
  console.log();

  // ── Pass 1: 逐只股票计算评分 ──────────────────────────────────────────────
  const stocks = await prisma.stock.findMany({
    select: { id: true, symbol: true, name: true, nameZh: true, market: true, sector: true, industry: true, scaleCategory: true },
    orderBy: { symbol: "asc" },
  });
  console.log(`Pass 1: ${stocks.length} 只股票\n`);

  let computed = 0, skipped = 0, errCount = 0;
  const computedAt = new Date();
  const BATCH = 50;

  for (let i = 0; i < stocks.length; i += BATCH) {
    const batch = stocks.slice(i, i + BATCH);
    await Promise.all(batch.map(async (stock) => {
      try {
        const pricesDesc = await prisma.dailyPrice.findMany({
          where: { symbol: stock.symbol },
          orderBy: { date: "desc" },
          select: { date: true, close: true, adjClose: true },
          take: 300,
        });
        if (pricesDesc.length < MIN_PRICE_COUNT) { skipped++; return; }

        const prices = pricesDesc.reverse().map((p) => ({
          date: p.date.toISOString().split("T")[0],
          close: Number(p.close),
          adjClose: p.adjClose !== null ? Number(p.adjClose) : null,
        }));
        const ind = calcIndicators(stock.symbol, prices);

        const fins = await prisma.financial.findMany({
          where: { stockId: stock.id },
          orderBy: [{ fiscalYear: "desc" }, { quarter: "asc" }],
          take: 8,
          select: { revenue: true, operatingProfit: true, netProfit: true, totalAssets: true, equity: true, eps: true, equityRatio: true },
        });
        const best = fins.find((f) => f.revenue !== null && f.netProfit !== null) ?? fins[0] ?? null;

        const [div, recentNews, recentDisclosures] = await Promise.all([
          prisma.dividend.findFirst({ where: { symbol: stock.symbol }, orderBy: { year: "desc" }, select: { dividend: true, yieldRate: true, payoutRatio: true } }),
          prisma.news.findMany({ where: { stockId: stock.id, relatedSymbolConfidence: { gte: 70 }, publishedAt: { gte: new Date(Date.now() - 30 * 86400000) } }, select: { sentiment: true } }),
          prisma.disclosure.findMany({ where: { symbol: stock.symbol, publishedAt: { gte: new Date(Date.now() - 30 * 86400000) } }, select: { category: true } }),
        ]);

        const toNum = (v: unknown): number | null => {
          const n = Number(v ?? null);
          return (v === null || v === undefined || isNaN(n) || n === 0) ? null : n;
        };

        const positiveNewsCount = recentNews.filter((n) => n.sentiment === "POSITIVE").length;
        const negativeNewsCount = recentNews.filter((n) => n.sentiment === "NEGATIVE").length;
        const totalNewsCount = recentNews.length;
        const newsScore = totalNewsCount > 0 ? Math.round(50 + ((positiveNewsCount - negativeNewsCount) / totalNewsCount) * 50) : null;

        const input: ScoreInput = {
          symbol: stock.symbol, name: stock.name,
          latestClose: ind.latestClose, latestDate: ind.latestDate,
          sector: stock.sector, industry: stock.industry, scaleCategory: stock.scaleCategory,
          disclosureCategories: recentDisclosures.map((d) => d.category),
          ma5: ind.ma5, ma20: ind.ma20, ma60: ind.ma60,
          rsi14: ind.rsi14, macd: ind.macd, macdSignal: ind.macdSignal, macdHist: ind.macdHist,
          return5d: ind.return5d, return20d: ind.return20d, return60d: ind.return60d,
          maTrend: ind.maTrend, macdSignalLabel: ind.macdSignalLabel,
          revenue:        best ? toNum(best.revenue)         : null,
          operatingProfit: best ? toNum(best.operatingProfit) : null,
          netProfit:       best ? toNum(best.netProfit)       : null,
          totalAssets:     best ? toNum(best.totalAssets)     : null,
          equity:          best ? toNum(best.equity)          : null,
          eps:             best ? toNum(best.eps)             : null,
          equityRatio:     best ? toNum(best.equityRatio)     : null,
          financialCount: fins.length,
          divAnn:       div ? toNum(div.dividend)   : null,
          divYieldRate: div ? toNum(div.yieldRate)  : null,
          newsScore, positiveNewsCount, negativeNewsCount, totalNewsCount,
          globalMarketData, institutionalFlowData,
        };

        const score = calcAiScore(input);
        const divYield = div ? toNum(div.yieldRate) : null;
        const divPayout = div ? toNum(div.payoutRatio) : null;
        const dividendScore = calcDividendScore(divYield, divPayout);

        await prisma.stockScore.upsert({
          where: { symbol: stock.symbol },
          create: {
            symbol: stock.symbol, name: stock.name,
            nameZh: stock.nameZh ?? null,
            market: stock.market ?? null, sector: stock.sector ?? null,
            industry: stock.industry ?? null, scaleCategory: stock.scaleCategory ?? null,
            computedAt, priceCount: prices.length,
            latestDate: ind.latestDate || null, latestClose: ind.latestClose,
            return5d: ind.return5d, return20d: ind.return20d, return60d: ind.return60d,
            rsi14: ind.rsi14, macd: ind.macd, macdSignal: ind.macdSignal, macdHist: ind.macdHist,
            maTrend: ind.maTrend, macdSignalLabel: ind.macdSignalLabel,
            technicalScore: score.technicalScore, fundamentalScore: score.fundamentalScore,
            moneyFlowScore: score.moneyFlowScore, newsSentimentScore: score.newsSentimentScore,
            globalTrendScore: score.globalTrendScore, riskScore: score.riskScore,
            totalScore: score.totalScore, recommendation: score.recommendation,
            starsLabel: score.starsLabel, summaryReason: score.summaryReason,
            newsSummary: score.newsSummary,
            moneyFlowSource: score.moneyFlowSource, globalTrendSource: score.globalTrendSource,
            scoreSource: score.scoreSource,
            rawScore: score.rawScore, adaptiveScore: score.adaptiveScore,
            stockStyle: score.stockStyle, highRiskFlag: score.highRiskFlag,
            fxSensitivity: score.fxSensitivity, catalystScore: score.catalystScore,
            dividendScore, shortSellingSource,
            // V7.7 fields will be filled in Pass 2
          },
          update: {
            name: stock.name, nameZh: stock.nameZh ?? null,
            market: stock.market ?? null, sector: stock.sector ?? null,
            industry: stock.industry ?? null, scaleCategory: stock.scaleCategory ?? null,
            computedAt, priceCount: prices.length,
            latestDate: ind.latestDate || null, latestClose: ind.latestClose,
            return5d: ind.return5d, return20d: ind.return20d, return60d: ind.return60d,
            rsi14: ind.rsi14, macd: ind.macd, macdSignal: ind.macdSignal, macdHist: ind.macdHist,
            maTrend: ind.maTrend, macdSignalLabel: ind.macdSignalLabel,
            technicalScore: score.technicalScore, fundamentalScore: score.fundamentalScore,
            moneyFlowScore: score.moneyFlowScore, newsSentimentScore: score.newsSentimentScore,
            globalTrendScore: score.globalTrendScore, riskScore: score.riskScore,
            totalScore: score.totalScore, recommendation: score.recommendation,
            starsLabel: score.starsLabel, summaryReason: score.summaryReason,
            newsSummary: score.newsSummary,
            moneyFlowSource: score.moneyFlowSource, globalTrendSource: score.globalTrendSource,
            scoreSource: score.scoreSource,
            rawScore: score.rawScore, adaptiveScore: score.adaptiveScore,
            stockStyle: score.stockStyle, highRiskFlag: score.highRiskFlag,
            fxSensitivity: score.fxSensitivity, catalystScore: score.catalystScore,
            dividendScore, shortSellingSource,
          },
        });
        computed++;
      } catch (e) {
        errCount++;
        if (errCount <= 5) console.error(`  ✗ ${stock.symbol}: ${e instanceof Error ? e.message : e}`);
      }
    }));

    const done = Math.min(i + BATCH, stocks.length);
    process.stdout.write(`\r[${done}/${stocks.length}] ${Math.round((done / stocks.length) * 100)}%  ✓${computed} ○${skipped} ✗${errCount}`);
  }
  const pass1s = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n\n=== Pass 1 完成（${pass1s}s）: ✓${computed} ○${skipped} ✗${errCount} ===\n`);

  // ── Pass 2: 全市场排名 → percentileRank + recommendationV2 + opportunityScore ──
  console.log("Pass 2: 全市场排名计算...");
  const pass2start = Date.now();

  // 拉取全部已计算评分（按 adaptiveScore DESC）
  const allScores = await prisma.stockScore.findMany({
    where: { adaptiveScore: { not: null }, priceCount: { gte: MIN_PRICE_COUNT } },
    orderBy: { adaptiveScore: "desc" },
    select: {
      symbol: true, adaptiveScore: true,
      moneyFlowScore: true, catalystScore: true,
      rsi14: true, highRiskFlag: true, fundamentalScore: true,
    },
  });

  const total = allScores.length;
  console.log(`  排名对象: ${total} 只`);

  // 批量更新
  const UPDATE_BATCH = 200;
  let pass2Updated = 0;

  // Compute opportunityScores first (needed for opportunityRank)
  const withOpp = allScores.map((s, idx) => {
    const rank = idx + 1; // 1=best
    const percentile = (rank / total) * 100; // 0.027=top0.03%, 100=bottom

    const { score: oppScore, label: oppLabel } = computeOpportunityScore({
      adaptiveScore: s.adaptiveScore!,
      percentileRank: percentile,
      moneyFlowScore: s.moneyFlowScore,
      catalystScore: s.catalystScore,
      rsi14: s.rsi14,
      highRiskFlag: s.highRiskFlag,
      fundamentalScore: s.fundamentalScore,
    });

    return { symbol: s.symbol, rank, percentile, oppScore, oppLabel };
  });

  // Sort by oppScore for opportunityRank
  const oppRanked = [...withOpp].sort((a, b) => b.oppScore - a.oppScore);
  const oppRankMap = new Map(oppRanked.map((s, i) => [s.symbol, i + 1]));

  for (let i = 0; i < withOpp.length; i += UPDATE_BATCH) {
    const batch = withOpp.slice(i, i + UPDATE_BATCH);
    await Promise.all(batch.map(({ symbol, rank, percentile, oppScore, oppLabel }) => {
      const { rec, reason } = computeRecommendationV2(
        allScores[rank - 1]?.adaptiveScore ?? 0,
        percentile,
      );
      return prisma.stockScore.update({
        where: { symbol },
        data: {
          marketRank:          rank,
          percentileRank:      Math.round(percentile * 10) / 10,
          recommendationV2:    rec,
          recommendationReason: reason,
          opportunityScore:    oppScore,
          opportunityRank:     oppRankMap.get(symbol) ?? null,
          opportunityLabel:    oppLabel,
        },
      });
    }));
    pass2Updated += batch.length;
    process.stdout.write(`\r  Pass2: [${pass2Updated}/${total}] ${Math.round((pass2Updated / total) * 100)}%`);
  }

  const pass2s = ((Date.now() - pass2start) / 1000).toFixed(1);
  console.log(`\n  Pass 2 完成（${pass2s}s）\n`);

  // ── 统计 recommendationV2 分布 ─────────────────────────────────────────────
  const [sb, b, h, w, av, totalCount] = await Promise.all([
    prisma.stockScore.count({ where: { recommendationV2: "STRONG_BUY" } }),
    prisma.stockScore.count({ where: { recommendationV2: "BUY" } }),
    prisma.stockScore.count({ where: { recommendationV2: "HOLD" } }),
    prisma.stockScore.count({ where: { recommendationV2: "WATCH" } }),
    prisma.stockScore.count({ where: { recommendationV2: "AVOID" } }),
    prisma.stockScore.count({ where: { priceCount: { gte: MIN_PRICE_COUNT } } }),
  ]);

  const bullRate = totalCount > 0 ? ((sb + b) / totalCount * 100).toFixed(1) : "0";
  const temp = parseFloat(bullRate) >= 10 ? "HOT 🔥" :
               parseFloat(bullRate) >= 5  ? "WARM 🌤" :
               parseFloat(bullRate) >= 2  ? "NEUTRAL ⚖️" :
               (sb + b) > 0              ? "COLD ❄️" : "EXTREME_COLD 🧊";

  console.log("=== V7.7 recommendationV2 分布 ===");
  console.log(`STRONG_BUY: ${sb}  BUY: ${b}  HOLD: ${h}  WATCH: ${w}  AVOID: ${av}`);
  console.log(`买入合计: ${sb + b}（${bullRate}%）  市场温度: ${temp}`);

  // ── TOP20 adaptiveScore ────────────────────────────────────────────────────
  const top20 = await prisma.stockScore.findMany({
    where: { priceCount: { gte: MIN_PRICE_COUNT } },
    orderBy: { adaptiveScore: "desc" },
    take: 20,
    select: {
      symbol: true, name: true, nameZh: true,
      adaptiveScore: true, percentileRank: true,
      recommendationV2: true, stockStyle: true,
      highRiskFlag: true, opportunityScore: true,
    },
  });

  console.log("\n=== TOP20 adaptiveScore ===");
  console.log(`${"名称".padEnd(18)}${"代码".padEnd(10)}${"Style".padEnd(22)}${"adpScore".padStart(9)}${"pctRank".padStart(8)}${"recV2".padStart(12)}${"opp".padStart(7)}`);
  console.log("─".repeat(86));
  for (const s of top20) {
    const name = (s.nameZh ?? s.name ?? "").slice(0, 17).padEnd(18);
    const style = (s.stockStyle ?? "").padEnd(22);
    const rec = (s.recommendationV2 ?? "").padStart(12);
    const risk = s.highRiskFlag ? "⚠" : " ";
    console.log(`${name}${s.symbol.padEnd(10)}${style}${String(s.adaptiveScore?.toFixed(1) ?? "—").padStart(9)}${String(s.percentileRank?.toFixed(1) ?? "—").padStart(8)}${rec}${String(s.opportunityScore?.toFixed(0) ?? "—").padStart(7)} ${risk}`);
  }

  // ── TOP10 机会榜 ───────────────────────────────────────────────────────────
  const top10opp = await prisma.stockScore.findMany({
    where: { priceCount: { gte: MIN_PRICE_COUNT }, highRiskFlag: false },
    orderBy: { opportunityScore: "desc" },
    take: 10,
    select: { symbol: true, nameZh: true, name: true, opportunityScore: true, recommendationV2: true, adaptiveScore: true },
  });
  console.log("\n=== TOP10 稳健机会 (highRiskFlag=false) ===");
  for (const s of top10opp) {
    console.log(`  ${(s.nameZh ?? s.name ?? "").slice(0, 20).padEnd(22)} ${s.symbol.padEnd(10)} opp=${s.opportunityScore?.toFixed(1).padStart(5)} adp=${s.adaptiveScore?.toFixed(1).padStart(5)} ${s.recommendationV2 ?? ""}`);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n=== 全部完成（${elapsed}s）===`);

  // Write SyncLog
  const buyN = await prisma.stockScore.count({ where: { recommendationV2: "BUY" } });
  const sbN  = await prisma.stockScore.count({ where: { recommendationV2: "STRONG_BUY" } });
  await prisma.syncLog.create({
    data: {
      source: "compute_scores",
      status: "SUCCESS",
      message: `Pass1+Pass2完成 ${computed}只 | BUY=${buyN} STRONG_BUY=${sbN} | ${elapsed}s`,
      itemCount: computed,
      durationMs: Math.round(parseFloat(elapsed) * 1000),
    },
  });

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("CRASH:", e);
  prisma.$disconnect();
  process.exit(1);
});
