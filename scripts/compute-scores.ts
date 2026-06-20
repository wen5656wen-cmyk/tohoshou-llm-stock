#!/usr/bin/env npx tsx
/**
 * 全量AI评分计算脚本
 *
 * 读取 DB 中所有有价格数据的股票 → 计算技术指标 + AI评分 → 写入 StockScore 表
 *
 * 用法：npm run compute-scores
 * 预计时间（3800只）：约 1-2 分钟（纯DB操作，无外部API）
 * 条件：需要 >= 20 条价格记录才计入 StockScore
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { calcIndicators } from "../lib/indicators";
import { calcAiScore, type ScoreInput, type GlobalMarketData, type InstitutionalFlowData } from "../lib/ai-score";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// 最低价格数量（低于此值跳过）
const MIN_PRICE_COUNT = 20;

async function main() {
  console.log("=== AI评分全量计算 V3 ===\n");
  const start = Date.now();

  // ── V3: 预加载全球市场数据 ──────────────────────────────────────────────
  const latestGlobalMarket = await prisma.globalMarket.findFirst({
    orderBy: { date: "desc" },
    select: { date: true, nasdaqChange: true, vix: true, usdjpy: true, nikkeiChange: true, topixChange: true, score: true, source: true },
  });

  let globalMarketData: GlobalMarketData | null = null;
  if (latestGlobalMarket) {
    const ageMs = Date.now() - latestGlobalMarket.date.getTime();
    const ageDays = ageMs / 86400000;
    if (ageDays <= 7) { // accept data up to 7 days old (covers weekends)
      globalMarketData = {
        nasdaqChange: latestGlobalMarket.nasdaqChange,
        vixLevel:     latestGlobalMarket.vix,
        usdJpy:       latestGlobalMarket.usdjpy,
        nikkeiChange: latestGlobalMarket.nikkeiChange,
        topixChange:  latestGlobalMarket.topixChange,
        score:        latestGlobalMarket.score,
      };
      console.log(`✓ GlobalMarket: date=${latestGlobalMarket.date.toISOString().split("T")[0]}, score=${latestGlobalMarket.score}/10, source=${latestGlobalMarket.source}`);
    } else {
      console.log(`⚠ GlobalMarket: 数据过期 (${ageDays.toFixed(0)}天前), 使用 V2 默认值 7`);
    }
  } else {
    console.log("⚠ GlobalMarket: 无数据, 使用 V2 默认值 7 (请运行 npm run fetch-global-market)");
  }

  // ── V3: 预加载机构资金流向 ────────────────────────────────────────────────
  const FLOW_MAX_AGE_DAYS = 14; // weekly data, allow up to 2 weeks old
  const latestFlowDate = await prisma.institutionalFlow.findFirst({
    orderBy: { date: "desc" },
    select: { date: true, source: true },
  });

  let institutionalFlowData: InstitutionalFlowData | null = null;
  if (latestFlowDate) {
    const ageMs = Date.now() - latestFlowDate.date.getTime();
    const ageDays = ageMs / 86400000;
    if (ageDays <= FLOW_MAX_AGE_DAYS) {
      const flows = await prisma.institutionalFlow.findMany({
        where: { date: latestFlowDate.date, market: "ALL" },
        select: { investorType: true, netAmount: true, source: true },
      });
      const foreigners = flows.find((f) => f.investorType === "foreigners");
      const trust      = flows.find((f) => f.investorType === "trust");
      institutionalFlowData = {
        foreignersNet: foreigners?.netAmount ?? null,
        trustNet:      trust?.netAmount ?? null,
        source:        latestFlowDate.source ?? "synthetic",
      };
      const fNet = foreigners?.netAmount;
      const tNet = trust?.netAmount;
      console.log(`✓ InstitutionalFlow: date=${latestFlowDate.date.toISOString().split("T")[0]}, source=${latestFlowDate.source}`);
      console.log(`  外国人 ${fNet != null ? (fNet >= 0 ? "+" : "") + fNet.toFixed(0) : "N/A"}億円  投信 ${tNet != null ? (tNet >= 0 ? "+" : "") + tNet.toFixed(0) : "N/A"}億円`);
    } else {
      console.log(`⚠ InstitutionalFlow: 数据过期 (${ageDays.toFixed(0)}天前), 使用 V2 代理`);
    }
  } else {
    console.log("⚠ InstitutionalFlow: 无数据, 使用 V2 代理 (请运行 npm run fetch-institutional-flow)");
  }

  console.log();

  // 获取所有股票（关联 stock info）
  const stocks = await prisma.stock.findMany({
    select: {
      id: true, symbol: true, name: true, nameZh: true,
      market: true, sector: true, industry: true, scaleCategory: true,
    },
    orderBy: { symbol: "asc" },
  });
  console.log(`共 ${stocks.length} 只股票\n`);

  let computed = 0, skipped = 0, errCount = 0;
  const computedAt = new Date();

  // 分批处理（每批50只，避免并发太高）
  const BATCH = 50;

  for (let i = 0; i < stocks.length; i += BATCH) {
    const batch = stocks.slice(i, i + BATCH);

    await Promise.all(
      batch.map(async (stock) => {
        try {
          // 获取最近300条价格（desc → reverse）
          const pricesDesc = await prisma.dailyPrice.findMany({
            where: { symbol: stock.symbol },
            orderBy: { date: "desc" },
            select: { date: true, close: true },
            take: 300,
          });

          if (pricesDesc.length < MIN_PRICE_COUNT) {
            skipped++;
            return;
          }

          const prices = pricesDesc.reverse().map((p) => ({
            date: p.date.toISOString().split("T")[0],
            close: Number(p.close),
          }));

          const ind = calcIndicators(stock.symbol, prices);

          // 获取最新财务数据（最多取最近8条，优先通期）
          const fins = await prisma.financial.findMany({
            where: { stockId: stock.id },
            orderBy: [{ fiscalYear: "desc" }, { quarter: "asc" }],
            take: 8,
            select: {
              revenue: true, operatingProfit: true, netProfit: true,
              totalAssets: true, equity: true, eps: true, equityRatio: true,
            },
          });

          const best =
            fins.find((f) => f.revenue !== null && f.netProfit !== null) ??
            fins[0] ?? null;

          const [div, recentNews] = await Promise.all([
            prisma.dividend.findFirst({
              where: { symbol: stock.symbol },
              orderBy: { year: "desc" },
              select: { dividend: true, yieldRate: true },
            }),
            prisma.news.findMany({
              where: {
                stockId: stock.id,
                relatedSymbolConfidence: { gte: 70 }, // only stock-specific (Kabutan/TDnet)
                publishedAt: { gte: new Date(Date.now() - 30 * 86400000) },
              },
              select: { sentiment: true },
            }),
          ]);

          const toNum = (v: unknown): number | null => {
            const n = Number(v ?? null);
            return v === null || v === undefined || isNaN(n) || n === 0 ? null : n;
          };

          const positiveNewsCount = recentNews.filter((n) => n.sentiment === "POSITIVE").length;
          const negativeNewsCount = recentNews.filter((n) => n.sentiment === "NEGATIVE").length;
          const totalNewsCount = recentNews.length;
          const newsScore = totalNewsCount > 0
            ? Math.round(50 + ((positiveNewsCount - negativeNewsCount) / totalNewsCount) * 50)
            : null;

          const input: ScoreInput = {
            symbol: stock.symbol,
            name: stock.name,
            latestClose: ind.latestClose,
            latestDate: ind.latestDate,
            ma5: ind.ma5, ma20: ind.ma20, ma60: ind.ma60,
            rsi14: ind.rsi14,
            macd: ind.macd, macdSignal: ind.macdSignal, macdHist: ind.macdHist,
            return5d: ind.return5d, return20d: ind.return20d, return60d: ind.return60d,
            maTrend: ind.maTrend, macdSignalLabel: ind.macdSignalLabel,
            revenue:        best ? toNum(best.revenue)        : null,
            operatingProfit: best ? toNum(best.operatingProfit) : null,
            netProfit:       best ? toNum(best.netProfit)       : null,
            totalAssets:     best ? toNum(best.totalAssets)     : null,
            equity:          best ? toNum(best.equity)          : null,
            eps:             best ? toNum(best.eps)             : null,
            equityRatio:     best ? toNum(best.equityRatio)     : null,
            financialCount: fins.length,
            divAnn:       div ? toNum(div.dividend)  : null,
            divYieldRate: div ? toNum(div.yieldRate) : null,
            newsScore,
            positiveNewsCount,
            negativeNewsCount,
            totalNewsCount,
            // V3: real market data (null → fallback to V2 proxy)
            globalMarketData,
            institutionalFlowData,
          };

          const score = calcAiScore(input);

          const scorePayload = {
            technicalScore:     score.technicalScore,
            fundamentalScore:   score.fundamentalScore,
            moneyFlowScore:     score.moneyFlowScore,
            newsSentimentScore: score.newsSentimentScore,
            globalTrendScore:   score.globalTrendScore,
            riskScore:          score.riskScore,
            totalScore:         score.totalScore,
            recommendation:     score.recommendation,
            starsLabel:         score.starsLabel,
            summaryReason:      score.summaryReason,
            newsSummary:        score.newsSummary,
          };

          await prisma.stockScore.upsert({
            where: { symbol: stock.symbol },
            create: {
              symbol: stock.symbol,
              name: stock.name,
              nameZh: stock.nameZh ?? null,
              market: stock.market ?? null,
              sector: stock.sector ?? null,
              industry: stock.industry ?? null,
              scaleCategory: stock.scaleCategory ?? null,
              computedAt,
              priceCount: prices.length,
              latestDate: ind.latestDate || null,
              latestClose: ind.latestClose,
              return5d: ind.return5d, return20d: ind.return20d, return60d: ind.return60d,
              rsi14: ind.rsi14, macd: ind.macd, macdSignal: ind.macdSignal, macdHist: ind.macdHist,
              maTrend: ind.maTrend, macdSignalLabel: ind.macdSignalLabel,
              ...scorePayload,
            },
            update: {
              name: stock.name,
              nameZh: stock.nameZh ?? null,
              market: stock.market ?? null,
              sector: stock.sector ?? null,
              industry: stock.industry ?? null,
              scaleCategory: stock.scaleCategory ?? null,
              computedAt,
              priceCount: prices.length,
              latestDate: ind.latestDate || null,
              latestClose: ind.latestClose,
              return5d: ind.return5d, return20d: ind.return20d, return60d: ind.return60d,
              rsi14: ind.rsi14, macd: ind.macd, macdSignal: ind.macdSignal, macdHist: ind.macdHist,
              maTrend: ind.maTrend, macdSignalLabel: ind.macdSignalLabel,
              ...scorePayload,
            },
          });

          computed++;
        } catch (e) {
          errCount++;
          if (errCount <= 5) {
            console.error(`  ✗ ${stock.symbol}: ${e instanceof Error ? e.message : e}`);
          }
        }
      })
    );

    const done = Math.min(i + BATCH, stocks.length);
    const pct = Math.round((done / stocks.length) * 100);
    process.stdout.write(`\r[${done}/${stocks.length}] ${pct}%  ✓${computed} ○${skipped} ✗${errCount}`);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n\n=== 完成（${elapsed}s）===`);
  console.log(`计算: ${computed} 只 | 跳过(<${MIN_PRICE_COUNT}条数据): ${skipped} 只 | 错误: ${errCount} 只`);

  // 显示 TOP10
  const top10 = await prisma.stockScore.findMany({
    orderBy: { totalScore: "desc" },
    take: 10,
    select: {
      symbol: true, name: true, market: true,
      totalScore: true, recommendation: true, starsLabel: true,
      latestClose: true, return20d: true,
    },
  });

  console.log("\n=== TOP10 AI推荐 ===");
  console.log(
    `${"名称".padEnd(20)}${"代码".padEnd(10)}${"市场".padEnd(12)}${"总分".padStart(6)}${"推荐".padStart(12)}${"现价".padStart(10)}${"20日%".padStart(8)}`
  );
  console.log("─".repeat(78));
  for (const s of top10) {
    const r20 = s.return20d !== null ? (s.return20d >= 0 ? "+" : "") + s.return20d.toFixed(1) + "%" : "—";
    const mkt = (s.market ?? "").slice(0, 10);
    console.log(
      `${(s.name ?? "").slice(0, 19).padEnd(20)}${s.symbol.padEnd(10)}${mkt.padEnd(12)}${String(s.totalScore ?? 0).padStart(6)}${String(s.recommendation ?? "").padStart(12)}${String(s.latestClose?.toLocaleString() ?? "—").padStart(10)}${r20.padStart(8)}`
    );
  }

  const totalScores = await prisma.stockScore.count();
  console.log(`\nStockScore 总计: ${totalScores} 只`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("CRASH:", e);
  prisma.$disconnect();
  process.exit(1);
});
