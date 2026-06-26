#!/usr/bin/env npx tsx
/**
 * V12.5 / V17.1: 每日 AI 组合快照生成脚本（3:4:3 策略配比）
 *
 * 每天从 DailyRecommendation 中选取 BUY/STRONG_BUY，
 * 按 3:4:3（DAY 30% / SWING 40% / POSITION 30%）分配 ¥100,000,000，
 * 每策略分桶各取 Top 3/4/3，写入 PortfolioSnapshot。
 *
 * 规则：
 *   - initialCapital = ¥100,000,000
 *   - 每只股票 budget = strategyBucketCapital / slotsFilled
 *   - shares = floor(budget / entryPrice / 100) * 100，< 100 则跳过
 *   - entryPrice = DailyRecommendation.buyPrice（当日 StockScore.latestClose 快照）
 *   - 同一天已有 snapshot → 跳过（除非 --force）
 *
 * 用法:
 *   npm run create:snapshot            # 今日快照
 *   npm run create:snapshot:force      # 強制重建今日快照
 *   npm run create:snapshot -- --date=2026-06-24  # 指定日期（回填）
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { buildStrategyAllocations, STRATEGY_SLOTS, STRATEGY_ALLOC, STRATEGY_TYPES } from "../lib/portfolio/snapshot-builder";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const INITIAL_CAPITAL = 100_000_000;
const LOT_SIZE = 100;

function todayJST(): string {
  return new Date().toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).replace(/\//g, "-");
}

async function main() {
  const isForce = process.argv.includes("--force");
  const dateArg = process.argv.find((a) => a.startsWith("--date="))?.split("=")[1];
  const targetDate = dateArg ?? todayJST();
  const targetDateObj = new Date(targetDate + "T00:00:00.000Z");

  console.log(`=== AI 組合スナップショット生成 (v17.1 3:4:3) ===`);
  console.log(`対象日: ${targetDate}${isForce ? " [FORCE]" : ""}\n`);

  // ── 1. 既存チェック ─────────────────────────────────────────────────────────
  const existing = await prisma.portfolioSnapshot.findUnique({
    where: { snapshotDate: targetDateObj },
    select: { id: true, positionCount: true },
  });

  if (existing) {
    if (!isForce) {
      console.log(`⏭ ${targetDate} のスナップショットは既に存在します（id=${existing.id}, positions=${existing.positionCount}）`);
      console.log("  スキップ。強制再生成は --force を付けてください。");
      await prisma.$disconnect();
      return;
    }
    console.log(`♻️ 既存スナップショット（id=${existing.id}）を削除して再生成します...`);
    await prisma.portfolioSnapshot.delete({ where: { id: existing.id } });
  }

  // ── 2. 当日 DailyRecommendation 取得 ──────────────────────────────────────
  const recs = await prisma.dailyRecommendation.findMany({
    where: { date: targetDateObj },
    orderBy: { gptRank: "asc" },
  });

  if (recs.length === 0) {
    console.error(`❌ ${targetDate} の DailyRecommendation が存在しません`);
    console.error("  先に npm run rerank:top500 を実行してください");
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log(`DailyRecommendation: ${recs.length} 件`);

  // ── 3. 3:4:3 配分計算 ──────────────────────────────────────────────────────
  const { allocations, warnings: allocWarnings } = buildStrategyAllocations(recs, INITIAL_CAPITAL);

  if (allocWarnings.length > 0) {
    console.log(`\n⚠️ 配分警告 (${allocWarnings.length} 件):`);
    for (const w of allocWarnings) console.log(`  ${w}`);
  }

  if (allocations.length === 0) {
    console.error("❌ 3:4:3 配分後の有効な配分が0件です。BUY/STRONG_BUY 銘柄が存在しません。");
    await prisma.$disconnect();
    process.exit(1);
  }

  // Strategy breakdown summary
  console.log(`\n戦略別配分:`);
  for (const st of STRATEGY_TYPES) {
    const stAllocs = allocations.filter((a) => a.strategyType === st);
    const slots = STRATEGY_SLOTS[st];
    const allocPct = (STRATEGY_ALLOC[st] * 100).toFixed(0);
    console.log(`  ${st}: ${stAllocs.length}/${slots} slots → 目標 ${allocPct}% → 各 ¥${Math.round(stAllocs[0]?.budgetAmount ?? 0).toLocaleString("ja-JP")}`);
    for (const a of stAllocs) {
      console.log(`    #${a.gptRank} ${a.symbol} (conf=${a.strategyConfidence.toFixed(0)}, tp=${a.targetReturnPct}%, sl=${a.stopLossPct}%)`);
    }
  }

  // ── 4. 現在価格取得（StockScore.latestClose → DailyPrice フォールバック） ──
  const symbols = allocations.map((a) => a.symbol);

  const scoreRows = await prisma.stockScore.findMany({
    where: { symbol: { in: symbols } },
    select: { symbol: true, latestClose: true },
  });
  const scoreMap = new Map(scoreRows.map((s) => [s.symbol, s.latestClose]));

  // Fallback: DailyPrice 直近7日
  const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const priceRows = await prisma.dailyPrice.findMany({
    where: { symbol: { in: symbols }, date: { gte: cutoff } },
    orderBy: { date: "desc" },
    select: { symbol: true, close: true, adjClose: true },
  });
  const fallbackMap = new Map<string, number>();
  for (const p of priceRows) {
    if (!fallbackMap.has(p.symbol)) {
      fallbackMap.set(p.symbol, p.adjClose ?? p.close);
    }
  }

  // TOPIX baseline price (record at creation time)
  const topixRow = await prisma.globalMarket.findFirst({
    where: { topix: { not: null } },
    orderBy: { date: "desc" },
    select: { topix: true },
  });
  const benchmarkTopixEntry = topixRow?.topix ?? null;
  if (benchmarkTopixEntry != null) {
    console.log(`\nTOPIX 基準値: ${benchmarkTopixEntry}`);
  }

  // Stock names
  const stockRows = await prisma.stock.findMany({
    where: { symbol: { in: symbols } },
    select: { symbol: true, name: true, nameZh: true },
  });
  const stockNameMap = new Map(stockRows.map((s) => [s.symbol, { name: s.name, nameZh: s.nameZh }]));

  // ── 5. 株数計算 ─────────────────────────────────────────────────────────────
  // Fetch buyPrice from recs for each symbol
  const recMap = new Map(recs.map((r) => [r.symbol, r]));

  type Position = {
    symbol: string;
    name: string;
    nameZh: string | null;
    entryPrice: number;
    shares: number;
    entryAmount: number;
    gptRank: number;
    aiScore: number | null;
    action: string | null;
    recommendation: string | null;
    strategyType: string;
    allocationWeight: number;
    strategyAllocationPct: number;
    strategyConfidence: number;
    targetReturnPct: number;
    stopLossPct: number;
    maxHoldingDays: number;
  };

  const positions: Position[] = [];
  const skipped: { symbol: string; reason: string }[] = [];

  for (const alloc of allocations) {
    const rec = recMap.get(alloc.symbol);
    const buyPx = rec?.buyPrice ?? null;
    const scorePx = scoreMap.get(alloc.symbol) ?? null;
    const fallbackPx = fallbackMap.get(alloc.symbol) ?? null;

    const entryPrice = buyPx ?? scorePx ?? fallbackPx;

    if (entryPrice == null || entryPrice <= 0) {
      const reason = `price=${entryPrice} (buyPx=${buyPx}, scorePx=${scorePx}, fallbackPx=${fallbackPx})`;
      console.log(`  ⚠️  ${alloc.symbol}: 価格なし → スキップ [${reason}]`);
      skipped.push({ symbol: alloc.symbol, reason: `no price: ${reason}` });
      continue;
    }

    const rawShares = Math.floor(alloc.budgetAmount / entryPrice / LOT_SIZE) * LOT_SIZE;

    if (rawShares < LOT_SIZE) {
      const reason = `shares=${rawShares} < ${LOT_SIZE}lot (budget=¥${Math.round(alloc.budgetAmount).toLocaleString("ja-JP")}, price=¥${entryPrice})`;
      console.log(`  ⚠️  ${alloc.symbol}: 株数不足 → スキップ [${reason}]`);
      skipped.push({ symbol: alloc.symbol, reason });
      continue;
    }

    const stockInfo = stockNameMap.get(alloc.symbol);
    positions.push({
      symbol: alloc.symbol,
      name: stockInfo?.name ?? alloc.symbol,
      nameZh: stockInfo?.nameZh ?? null,
      entryPrice,
      shares: rawShares,
      entryAmount: entryPrice * rawShares,
      gptRank: alloc.gptRank,
      aiScore: rec?.finalScore ?? null,
      action: rec?.gptRating ?? null,
      recommendation: rec?.recommendation ?? null,
      strategyType: alloc.strategyType,
      allocationWeight: alloc.allocationWeight,
      strategyAllocationPct: alloc.strategyAllocationPct,
      strategyConfidence: alloc.strategyConfidence,
      targetReturnPct: alloc.targetReturnPct,
      stopLossPct: alloc.stopLossPct,
      maxHoldingDays: alloc.maxHoldingDays,
    });
  }

  if (skipped.length > 0) {
    console.log(`\nスキップ銘柄 (${skipped.length} 件):`);
    for (const s of skipped) {
      console.log(`  ${s.symbol}: ${s.reason}`);
    }
  }

  if (positions.length === 0) {
    console.error(`❌ 有効なポジションが0件です（配分${allocations.length}件 全スキップ）`);
    console.error("  原因: 価格なし or 株数が100未満。rerank:top500 / compute-scores を先に実行してください。");
    await prisma.$disconnect();
    process.exit(1);
  }

  // ── 6. 資金計算 ─────────────────────────────────────────────────────────────
  const investedAmount = positions.reduce((s, p) => s + p.entryAmount, 0);
  const cash = INITIAL_CAPITAL - investedAmount;
  const name = `${targetDate} AI組合`;

  const totalCheck = investedAmount + cash;
  const checkOk = Math.abs(totalCheck - INITIAL_CAPITAL) < 1;

  console.log(`\n建仓結果:`);
  console.log(`  ポジション数:  ${positions.length} 件`);
  console.log(`  投資総額:     ¥${Math.round(investedAmount).toLocaleString("ja-JP")}`);
  console.log(`  残金:         ¥${Math.round(cash).toLocaleString("ja-JP")}`);
  console.log(`  合計チェック:  ¥${Math.round(totalCheck).toLocaleString("ja-JP")} (expected ¥${INITIAL_CAPITAL.toLocaleString("ja-JP")}) ${checkOk ? "✅" : "❌"}`);
  console.log(`  名称:         ${name}\n`);

  for (const p of positions) {
    console.log(`  [${p.strategyType}] #${p.gptRank} ${p.symbol} — ¥${p.entryPrice.toLocaleString("ja-JP")} × ${p.shares}株 = ¥${p.entryAmount.toLocaleString("ja-JP")} (alloc=${(p.allocationWeight * 100).toFixed(1)}%)`);
  }

  // Strategy breakdown
  console.log(`\n戦略別サマリー:`);
  for (const st of STRATEGY_TYPES) {
    const stPos = positions.filter((p) => p.strategyType === st);
    const stAmount = stPos.reduce((s, p) => s + p.entryAmount, 0);
    const stPct = investedAmount > 0 ? (stAmount / INITIAL_CAPITAL * 100).toFixed(1) : "0.0";
    console.log(`  ${st}: ${stPos.length}銘柄 ¥${Math.round(stAmount).toLocaleString("ja-JP")} (${stPct}% of ¥1億)`);
  }

  // ── 7. DB 書込 ──────────────────────────────────────────────────────────────
  const snapshot = await prisma.portfolioSnapshot.create({
    data: {
      snapshotDate: targetDateObj,
      name,
      initialCapital: INITIAL_CAPITAL,
      cash,
      investedAmount,
      positionCount: positions.length,
      sourceRecommendationDate: targetDateObj,
      status: "LIVE",
      benchmarkTopixEntry,
      positions: {
        create: positions.map((p) => ({
          symbol: p.symbol,
          name: p.name,
          nameZh: p.nameZh,
          entryPrice: p.entryPrice,
          shares: p.shares,
          entryAmount: p.entryAmount,
          gptRank: p.gptRank,
          aiScore: p.aiScore,
          action: p.action,
          recommendation: p.recommendation,
          strategyType: p.strategyType,
          allocationWeight: p.allocationWeight,
          strategyAllocationPct: p.strategyAllocationPct,
          strategyConfidence: p.strategyConfidence,
          targetReturnPct: p.targetReturnPct,
          stopLossPct: p.stopLossPct,
          maxHoldingDays: p.maxHoldingDays,
        })),
      },
    },
    include: { positions: { select: { id: true } } },
  });

  console.log(`\n✅ スナップショット作成完了`);
  console.log(`   id=${snapshot.id}  positions=${snapshot.positions.length}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("CRASH:", e);
  prisma.$disconnect();
  process.exit(1);
});
