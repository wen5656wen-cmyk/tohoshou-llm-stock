#!/usr/bin/env npx tsx
/**
 * V12.5: 每日 AI 组合快照生成脚本
 *
 * 每天从 DailyRecommendation 中选取 BUY/STRONG_BUY Top10，
 * 按 ¥100,000,000 等权建仓（1手=100股整数倍），写入 PortfolioSnapshot。
 *
 * 规则：
 *   - initialCapital = ¥100,000,000
 *   - 每只股票 budget = initialCapital / selectedCount
 *   - shares = floor(budget / entryPrice / 100) * 100，< 100 则跳过
 *   - entryPrice = DailyRecommendation.buyPrice（当日 StockScore.latestClose 快照）
 *   - 同一天已有 snapshot → 跳过（除非 --force）
 *
 * 用法:
 *   npm run create:snapshot            # 今日快照
 *   npm run create:snapshot:force      # 强制重建今日快照
 *   npm run create:snapshot -- --date=2026-06-24  # 指定日期（回填）
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const INITIAL_CAPITAL = 100_000_000;
const MAX_POSITIONS = 10;
const LOT_SIZE = 100;
const VALID_RATINGS = new Set(["BUY", "STRONG_BUY"]);

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

  console.log(`=== AI 組合スナップショット生成 ===`);
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

  // ── 3. BUY / STRONG_BUY フィルタ + Top10 ──────────────────────────────────
  const eligible = recs
    .filter(
      (r) =>
        (r.gptRating != null && VALID_RATINGS.has(r.gptRating)) ||
        (r.recommendation != null && VALID_RATINGS.has(r.recommendation))
    )
    .slice(0, MAX_POSITIONS);

  console.log(`BUY/STRONG_BUY 候補: ${eligible.length} 件`);

  if (eligible.length === 0) {
    console.error("❌ BUY/STRONG_BUY 銘柄が存在しません。スナップショット生成をスキップします。");
    await prisma.$disconnect();
    process.exit(1);
  }

  // ── 4. 現在価格取得（StockScore.latestClose → DailyPrice フォールバック） ──
  const symbols = eligible.map((r) => r.symbol);

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
    console.log(`TOPIX 基準値: ${benchmarkTopixEntry}`);
  }

  // Stock names
  const stockRows = await prisma.stock.findMany({
    where: { symbol: { in: symbols } },
    select: { symbol: true, name: true, nameZh: true },
  });
  const stockNameMap = new Map(stockRows.map((s) => [s.symbol, { name: s.name, nameZh: s.nameZh }]));

  // ── 5. 等権配分 + 株数計算 ─────────────────────────────────────────────────
  const selectedCount = eligible.length;
  const budgetPerStock = INITIAL_CAPITAL / selectedCount;

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
  };

  const positions: Position[] = [];
  const skipped: { symbol: string; reason: string }[] = [];

  for (const rec of eligible) {
    // entryPrice: buyPrice (当日 latestClose snapshot) or ScorePrice fallback
    const buyPx = rec.buyPrice;
    const scorePx = scoreMap.get(rec.symbol) ?? null;
    const fallbackPx = fallbackMap.get(rec.symbol) ?? null;

    const entryPrice = buyPx ?? scorePx ?? fallbackPx;

    if (entryPrice == null || entryPrice <= 0) {
      const reason = `price=${entryPrice} (buyPx=${buyPx}, scorePx=${scorePx}, fallbackPx=${fallbackPx})`;
      console.log(`  ⚠️  ${rec.symbol}: 価格なし → スキップ [${reason}]`);
      skipped.push({ symbol: rec.symbol, reason: `no price: ${reason}` });
      continue;
    }

    const rawShares = Math.floor(budgetPerStock / entryPrice / LOT_SIZE) * LOT_SIZE;

    if (rawShares < LOT_SIZE) {
      const reason = `shares=${rawShares} < ${LOT_SIZE}lot (budget=¥${Math.round(budgetPerStock).toLocaleString("ja-JP")}, price=¥${entryPrice})`;
      console.log(`  ⚠️  ${rec.symbol}: 株数不足 → スキップ [${reason}]`);
      skipped.push({ symbol: rec.symbol, reason });
      continue;
    }

    const stockInfo = stockNameMap.get(rec.symbol);
    positions.push({
      symbol: rec.symbol,
      name: stockInfo?.name ?? rec.symbol,
      nameZh: stockInfo?.nameZh ?? null,
      entryPrice,
      shares: rawShares,
      entryAmount: entryPrice * rawShares,
      gptRank: rec.gptRank,
      aiScore: rec.finalScore ?? null,
      action: rec.gptRating ?? null,
      recommendation: rec.recommendation ?? null,
    });
  }

  if (skipped.length > 0) {
    console.log(`\nスキップ銘柄 (${skipped.length} 件):`);
    for (const s of skipped) {
      console.log(`  ${s.symbol}: ${s.reason}`);
    }
  }

  if (positions.length === 0) {
    console.error(`❌ 有効なポジションが0件です（候補${eligible.length}件 全スキップ）`);
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
    console.log(`  #${p.gptRank} ${p.symbol} — ¥${p.entryPrice.toLocaleString("ja-JP")} × ${p.shares}株 = ¥${p.entryAmount.toLocaleString("ja-JP")}`);
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
