/**
 * compute-score-v3-shadow.ts — Adaptive Score V3 Pro（Shadow-only，P3-T1）
 *
 * 只写 AdaptiveScoreV3Shadow 表。绝不改 StockScore / DailyRecommendation / GPT Rank / Portfolio。
 * 动态权重 = 市场状态基准 × 因子质量（覆盖率/区分度/新鲜度/RankIC），带上下限、归一化、单日±5%限幅。
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { regimeBaseWeights, regimeRiskMultiplier, type DimWeights } from "../lib/scoring-v3/regime-gate";
import { assessDimension, type DimKey, type FactorQuality } from "../lib/scoring-v3/factor-quality";
import { computeDynamicWeights } from "../lib/scoring-v3/dynamic-weight";
import { computeV3, type V3StockInput } from "../lib/scoring-v3/score-v3";
import { calibrate, type CalibItem } from "../lib/scoring-v3/calibration/calibration";
import { isV3CalibrationOn } from "../lib/scoring-engine";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  const t0 = Date.now();
  console.log("🚀 Adaptive Score V3 Pro — Shadow 计算");

  // 1. 启用股票池
  const enabled = await prisma.stock.findMany({ where: { aiEnabled: true }, select: { id: true, symbol: true, marketCap: true } });
  const enabledSet = new Set(enabled.map((s) => s.symbol));
  const idToSym = new Map(enabled.map((s) => [s.id, s.symbol]));
  const mcapMap = new Map(enabled.map((s) => [s.symbol, s.marketCap]));
  console.log(`   启用股票: ${enabled.length}`);

  // 2. StockScore（技术/基本面/新闻/priceCount）
  const scores = await prisma.stockScore.findMany({
    where: { priceCount: { gte: 20 }, symbol: { in: [...enabledSet] } },
    select: { symbol: true, name: true, nameZh: true, sector: true, market: true, technicalScore: true, fundamentalScore: true, newsSentimentScore: true, priceCount: true },
  });
  console.log(`   已评分股票: ${scores.length}`);

  // 3. AlphaScore 最新
  const alphaLatest = await prisma.alphaScore.findFirst({ orderBy: { date: "desc" }, select: { date: true } });
  const alphaRows = alphaLatest ? await prisma.alphaScore.findMany({ where: { date: alphaLatest.date }, select: { symbol: true, alphaScore: true } }) : [];
  const alphaMap = new Map(alphaRows.map((r) => [r.symbol, r.alphaScore]));

  // 4. AlphaFactor 最新
  const afLatest = await prisma.alphaFactor.findFirst({ orderBy: { date: "desc" }, select: { date: true } });
  const afRows = afLatest ? await prisma.alphaFactor.findMany({ where: { date: afLatest.date } }) : [];
  const afMap = new Map(afRows.map((r) => [r.symbol, r]));

  // 5. hasFinancial（Financial 用 stockId → symbol）
  const finIds = await prisma.financial.findMany({ distinct: ["stockId"], select: { stockId: true } });
  const finSyms = new Set(finIds.map((f) => idToSym.get(f.stockId)).filter(Boolean) as string[]);

  // 6. MarketRegime 当日
  const regimeRow = await prisma.marketRegime.findFirst({ orderBy: { date: "desc" } });
  const regime = regimeRow?.regime ?? "SIDEWAYS";
  console.log(`   市场状态: ${regime}`);

  // 7. AlphaFactorReport period=30 → factor rankIc
  const reports = await prisma.alphaFactorReport.findMany({ where: { period: 30 }, select: { factor: true, rankIc: true } });
  const repMap = new Map(reports.map((r) => [r.factor, r.rankIc]));
  const alphaRankIc = reports.length ? reports.reduce((a, r) => a + Math.abs(r.rankIc ?? 0), 0) / reports.length : null;
  const flowRankIc = repMap.get("VolumeRatio") ?? repMap.get("VolumeExpansion") ?? null;

  // 8. 组装输入
  const inputs: V3StockInput[] = scores.map((s) => {
    const af = afMap.get(s.symbol);
    return {
      symbol: s.symbol, name: s.name, nameZh: s.nameZh, sector: s.sector, market: s.market,
      technicalScore: s.technicalScore, fundamentalScore: s.fundamentalScore, priceCount: s.priceCount,
      alphaScore: alphaMap.get(s.symbol) ?? null,
      atrPct: af?.atrPct ?? null, averageTurnover20: af?.averageTurnover20 ?? null,
      volumeRatio20: af?.volumeRatio20 ?? null, volumeExpansionDays: af?.volumeExpansionDays ?? null,
      buyback: af?.buyback ?? null, dividendRaise: af?.dividendRaise ?? null,
      guidanceRaise: af?.guidanceRaise ?? null, tdnetEvent: af?.tdnetEvent ?? null,
      newsSentimentScore: s.newsSentimentScore, hasFinancial: finSyms.has(s.symbol),
    };
  });

  // 9. 因子质量
  const newsRawVals = inputs.map((s) => {
    const senti = (s.newsSentimentScore ?? 8) - 8;
    const hasEvent = !!(s.buyback || s.dividendRaise || s.guidanceRaise || s.tdnetEvent);
    if (!hasEvent && Math.abs(senti) < 2) return null;
    return (s.guidanceRaise ? 2 : 0) + (s.buyback ? 1.5 : 0) + (s.dividendRaise ? 1 : 0) + (s.tdnetEvent ? 1 : 0) + senti * 0.5;
  });
  const flowRawVals = inputs.map((s) => (s.volumeRatio20 == null ? null : s.volumeRatio20 + 0.15 * (s.volumeExpansionDays ?? 0)));
  const quality: Record<DimKey, FactorQuality> = {
    technical: assessDimension(inputs.map((s) => s.technicalScore), { scaleRef: 8 }),
    fundamental: assessDimension(inputs.map((s) => (s.hasFinancial ? s.fundamentalScore : null)), { scaleRef: 6 }),
    alpha: assessDimension(inputs.map((s) => s.alphaScore), { scaleRef: 20, rankIc: alphaRankIc }),
    news: assessDimension(newsRawVals, { scaleRef: 2 }),
    flow: assessDimension(flowRawVals, { scaleRef: 1, rankIc: flowRankIc }),
  };
  console.log("   因子质量(coverage/discrim/quality):");
  for (const d of ["technical", "fundamental", "alpha", "news", "flow"] as DimKey[])
    console.log(`     ${d.padEnd(12)} cov=${quality[d].coverage.toFixed(2)} disc=${quality[d].discrimination.toFixed(2)} q=${quality[d].quality.toFixed(2)}`);

  // 10. 昨日权重（限幅用）
  const prevRow = await prisma.adaptiveScoreV3Shadow.findFirst({ orderBy: { date: "desc" }, select: { weightsJson: true, date: true } });
  const prevWeights = (prevRow?.weightsJson as unknown as DimWeights) ?? null;

  // 11. 动态权重
  const base = regimeBaseWeights(regime);
  const { weights } = computeDynamicWeights(base, quality, prevWeights);
  console.log("   今日动态权重:", Object.entries(weights).map(([k, v]) => `${k}:${(v * 100).toFixed(1)}%`).join(" "));

  // 12. 计算 V3
  const results = computeV3(inputs, weights, regime, regimeRiskMultiplier(regime));

  // 12b. 标定（P3-T3）：动态阈值评级 + Confidence + Quality + Readiness Gate
  const calOn = isV3CalibrationOn();
  const inMap = new Map(inputs.map((s) => [s.symbol, s]));
  const daysShadow = ((await prisma.adaptiveScoreV3Shadow.findMany({ distinct: ["date"], select: { date: true } })).length) + 1;
  const calItems: CalibItem[] = results.map((r) => {
    const s = inMap.get(r.symbol)!;
    return { symbol: r.symbol, scoreV3: r.scoreV3, percentile: r.percentile, subScores: r.subScores as any, contributions: r.contributions as any, riskAdjustment: r.riskAdjustment, hasFundamental: s.hasFinancial, hasAlpha: s.alphaScore != null, sector: s.sector, marketCap: mcapMap.get(r.symbol) ?? null, turnover: s.averageTurnover20 };
  });
  const { perStock: calStocks, report: calReport } = calibrate(calItems, regime, daysShadow);
  const calMap = new Map(calStocks.map((c) => [c.symbol, c]));
  console.log(`   标定(V3_CALIBRATION=${calOn ? "ON" : "OFF"}): SB阈值=${calReport.thresholds.cutoffs.sb.toFixed(1)} · Readiness=${calReport.readiness} (${calReport.readinessGrade})`);

  // 13. 写 Shadow 表（calOn 时用标定评级 + Confidence/Quality）
  const dataDate = afLatest?.date ?? regimeRow?.date ?? new Date();
  await prisma.adaptiveScoreV3Shadow.deleteMany({ where: { date: dataDate } });
  const CHUNK = 500;
  for (let i = 0; i < results.length; i += CHUNK) {
    const batch = results.slice(i, i + CHUNK).map((r) => {
      const cal = calMap.get(r.symbol);
      const rating = calOn && cal ? cal.rating : r.rating;
      const explanation = calOn && cal ? `${cal.calibReason}\n${r.explanation}` : r.explanation;
      return {
        symbol: r.symbol, date: dataDate, scoreV3: r.scoreV3, rawScore: r.rawScore,
        riskAdjustment: r.riskAdjustment, rank: r.rank, percentile: r.percentile, rating, regime,
        weightsJson: weights as object,
        factorBreakdownJson: { subScores: r.subScores, contributions: r.contributions, effectiveWeights: r.effectiveWeights } as object,
        riskAdjustmentJson: r.risk as object,
        explanation,
        confidence: cal?.confidence ?? 0, qualityScore: cal?.qualityScore ?? 0, calibrated: calOn,
      };
    });
    await prisma.adaptiveScoreV3Shadow.createMany({ data: batch });
  }

  // 13b. 写 Calibration 报告表
  await prisma.adaptiveScoreV3Calibration.upsert({
    where: { date: dataDate },
    create: {
      date: dataDate, regime,
      thresholdsJson: calReport.thresholds as object, ratingDistJson: calReport.ratingDist as object,
      confidenceStatsJson: calReport.confidenceStats as object, qualityJson: { coverage: calReport.quality, overall: calReport.qualityOverall } as object,
      sectorJson: calReport.sector as object, marketCapJson: calReport.marketCap as object, sbStatsJson: calReport.sbStats as object,
      readiness: calReport.readiness, readinessGrade: calReport.readinessGrade,
    },
    update: {
      regime, thresholdsJson: calReport.thresholds as object, ratingDistJson: calReport.ratingDist as object,
      confidenceStatsJson: calReport.confidenceStats as object, qualityJson: { coverage: calReport.quality, overall: calReport.qualityOverall } as object,
      sectorJson: calReport.sector as object, marketCapJson: calReport.marketCap as object, sbStatsJson: calReport.sbStats as object,
      readiness: calReport.readiness, readinessGrade: calReport.readinessGrade, computedAt: new Date(),
    },
  });

  const dist: Record<string, number> = calOn ? calReport.ratingDist : {};
  if (!calOn) for (const r of results) dist[r.rating] = (dist[r.rating] ?? 0) + 1;
  console.log(`   评级分布(${calOn ? "标定后" : "固定阈值"}):`, ["STRONG_BUY", "BUY", "HOLD", "WATCH", "AVOID"].map((k) => `${k}:${dist[k] ?? 0}`).join(" "));
  console.log(`✅ 写入 ${results.length} 条 (date=${dataDate.toISOString().slice(0, 10)}) 用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
