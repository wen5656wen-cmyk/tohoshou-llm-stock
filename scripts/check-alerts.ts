#!/usr/bin/env npx tsx
/**
 * 異動アラートチェック（毎30分 cron 実行）
 * v7.3.0: 价格涨跌 ≥5%, 成交量 ≥2x 均量, HIGH 重要新闻
 * 去重：同一 symbol + type + 今日 → 只推一次
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { isConfigured } from "../lib/line";
import { pushToAll } from "../lib/line-push";
import { buildAlertFlex } from "../lib/line-flex";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

const DRY_RUN = process.env.DRY_RUN === "1";

async function isSentToday(symbol: string, alertType: string): Promise<boolean> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const existing = await prisma.notificationLog.findFirst({
    where: {
      type: { in: ["REALTIME_ALERT", "NEWS_ALERT"] }, // cover all alert types
      symbols: { hasSome: [symbol] },
      title: { contains: alertType },
      status: "SUCCESS", // only deduplicate successful sends, allow retry on failure
      createdAt: { gte: todayStart },
    },
  });
  return !!existing;
}

async function main() {
  console.log(`[check-alerts] ${DRY_RUN ? "DRY RUN" : "发送模式"} 启动`);

  if (!DRY_RUN && !isConfigured()) {
    console.error("[check-alerts] LINE 未配置");
    process.exit(1);
  }

  const now = new Date();
  const tokyoDate = new Date(now.getTime() + 9 * 3600000);
  const dateStr = tokyoDate.toISOString().split("T")[0];

  const groupIds = await prisma.lineGroup
    .findMany({ where: { isActive: true }, select: { groupId: true } })
    .then((gs) => gs.map((g) => g.groupId));

  // 1. 价格涨跌 ≥5%（使用 Stock.changeRate）
  const priceMovers = await prisma.stock.findMany({
    where: {
      changeRate: { not: null },
      OR: [
        { changeRate: { gte: 5 } },
        { changeRate: { lte: -5 } },
      ],
    },
    orderBy: [
      { changeRate: "asc" }, // biggest movers first
    ],
    take: 5,
    select: { symbol: true, name: true, nameZh: true, nameEn: true, changeRate: true, price: true },
  });

  for (const mover of priceMovers) {
    if (Math.abs(mover.changeRate ?? 0) < 5) continue;
    const alertType = mover.changeRate! >= 0 ? "急騰" : "急落";
    if (await isSentToday(mover.symbol, alertType)) continue;

    const stockScore = await prisma.stockScore.findUnique({
      where: { symbol: mover.symbol },
      select: { totalScore: true, recommendation: true },
    });

    const alertFlex = buildAlertFlex({
      stock: {
        symbol: mover.symbol,
        name: mover.name,
        nameZh: mover.nameZh,
        nameEn: mover.nameEn,
        totalScore: stockScore?.totalScore,
        recommendation: stockScore?.recommendation,
        latestClose: mover.price,
      },
      alertType,
      reasons: [`株価${alertType}：${mover.changeRate! >= 0 ? "▲" : "▼"}${Math.abs(mover.changeRate!).toFixed(1)}%`],
      priceChange: mover.changeRate,
      riskNote: mover.changeRate! <= -5 ? "急落時は冷静に判断してください" : undefined,
    });

    if (DRY_RUN) {
      console.log(`[check-alerts] DRY RUN ${alertType} ${mover.symbol}`);
      console.log(JSON.stringify(alertFlex, null, 2));
    } else {
      await pushToAll([alertFlex], groupIds);
      await prisma.notificationLog.create({
        data: {
          type: "REALTIME_ALERT",
          title: `${alertType} ${mover.symbol} ${dateStr}`,
          content: `${mover.changeRate! >= 0 ? "▲" : "▼"}${Math.abs(mover.changeRate!).toFixed(1)}%`,
          symbols: [mover.symbol],
          status: "SUCCESS",
          sentAt: new Date(),
        },
      });
      console.log(`[check-alerts] 送信済 ${alertType} ${mover.symbol}`);
    }
  }

  // 2. 成交量 ≥2x 均量
  const volumeMovers = await prisma.stock.findMany({
    where: {
      volume: { not: null },
      avgVolume: { not: null },
    },
    select: { symbol: true, name: true, nameZh: true, nameEn: true, volume: true, avgVolume: true, price: true, changeRate: true },
    take: 500, // scan top 500 by volume
  });

  for (const s of volumeMovers) {
    if (!s.volume || !s.avgVolume || s.avgVolume <= 0) continue;
    const ratio = s.volume / s.avgVolume;
    if (ratio < 2) continue;
    if (await isSentToday(s.symbol, "出来高急増")) continue;

    const stockScore = await prisma.stockScore.findUnique({
      where: { symbol: s.symbol },
      select: { totalScore: true, recommendation: true },
    });

    const alertFlex = buildAlertFlex({
      stock: {
        symbol: s.symbol,
        name: s.name,
        nameZh: s.nameZh,
        nameEn: s.nameEn,
        totalScore: stockScore?.totalScore,
        recommendation: stockScore?.recommendation,
        latestClose: s.price,
      },
      alertType: "出来高急増",
      reasons: [
        `出来高 ${ratio.toFixed(1)}倍（20日均量比）`,
        ...(s.changeRate != null ? [`株価 ${s.changeRate >= 0 ? "▲" : "▼"}${Math.abs(s.changeRate).toFixed(1)}%`] : []),
      ],
      priceChange: s.changeRate,
    });

    if (DRY_RUN) {
      console.log(`[check-alerts] DRY RUN 出来高急増 ${s.symbol} ratio=${ratio.toFixed(1)}`);
    } else {
      await pushToAll([alertFlex], groupIds);
      await prisma.notificationLog.create({
        data: {
          type: "REALTIME_ALERT",
          title: `出来高急増 ${s.symbol} ${dateStr}`,
          content: `出来高 ${ratio.toFixed(1)}倍`,
          symbols: [s.symbol],
          status: "SUCCESS",
          sentAt: new Date(),
        },
      });
      console.log(`[check-alerts] 送信済 出来高急増 ${s.symbol} ${ratio.toFixed(1)}倍`);
    }
  }

  // 3. HIGH importance news（今日）
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const highNews = await prisma.news.findMany({
    where: {
      importance: { gte: 4 },
      publishedAt: { gte: todayStart },
      relatedSymbolConfidence: { gte: 70 },
    },
    orderBy: [{ importance: "desc" }, { publishedAt: "desc" }],
    take: 3,
    select: {
      title: true,
      stockId: true,
      importance: true,
      stock: { select: { symbol: true, name: true, nameZh: true, nameEn: true } },
    },
  });

  for (const news of highNews) {
    if (!news.stock) continue;
    const { symbol, name, nameZh, nameEn } = news.stock;
    if (await isSentToday(symbol, "重要ニュース")) continue;

    const stockScore = await prisma.stockScore.findUnique({
      where: { symbol },
      select: { totalScore: true, recommendation: true, latestClose: true },
    });

    const alertFlex = buildAlertFlex({
      stock: {
        symbol,
        name,
        nameZh,
        nameEn,
        totalScore: stockScore?.totalScore,
        recommendation: stockScore?.recommendation,
        latestClose: stockScore?.latestClose,
      },
      alertType: "重要ニュース",
      reasons: [`📰 ${news.title.slice(0, 60)}`],
      riskNote: news.importance >= 5 ? "重要情報：詳細確認を推奨します" : undefined,
    });

    if (DRY_RUN) {
      console.log(`[check-alerts] DRY RUN 重要ニュース ${symbol}`);
    } else {
      await pushToAll([alertFlex], groupIds);
      await prisma.notificationLog.create({
        data: {
          type: "NEWS_ALERT",
          title: `重要ニュース ${symbol} ${dateStr}`,
          content: news.title.slice(0, 200),
          symbols: [symbol],
          status: "SUCCESS",
          sentAt: new Date(),
        },
      });
      console.log(`[check-alerts] 送信済 重要ニュース ${symbol}`);
    }
  }

  console.log("[check-alerts] チェック完了");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[check-alerts] 致命错误:", err);
  process.exit(1);
});
