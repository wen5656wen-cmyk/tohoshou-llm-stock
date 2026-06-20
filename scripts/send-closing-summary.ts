#!/usr/bin/env npx tsx
/**
 * LINE 大引けまとめ（毎日 15:45 JST）
 * v7.3.0: Flex Message + 中文股票名称
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { isConfigured } from "../lib/line";
import { pushToAll } from "../lib/line-push";
import { buildCloseReportFlex } from "../lib/line-flex";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

const DRY_RUN = process.env.DRY_RUN === "1";

async function main() {
  console.log(`[closing-summary] ${DRY_RUN ? "DRY RUN" : "发送模式"} 启动`);

  if (!DRY_RUN && !isConfigured()) {
    console.error("[closing-summary] LINE 未配置");
    process.exit(1);
  }

  const now = new Date();
  const tokyoDate = new Date(now.getTime() + 9 * 3600000);
  const dateStr = tokyoDate.toISOString().split("T")[0];
  const dow = ["日", "月", "火", "水", "木", "金", "土"][tokyoDate.getUTCDay()];

  const [total, strongBuy, buy, hold, watch, avoid, avgAgg, topPerformers, fishingCandidates] =
    await Promise.all([
      prisma.stockScore.count({ where: { priceCount: { gte: 20 } } }),
      prisma.stockScore.count({ where: { recommendation: "STRONG_BUY", priceCount: { gte: 20 } } }),
      prisma.stockScore.count({ where: { recommendation: "BUY", priceCount: { gte: 20 } } }),
      prisma.stockScore.count({ where: { recommendation: "HOLD", priceCount: { gte: 20 } } }),
      prisma.stockScore.count({ where: { recommendation: "WATCH", priceCount: { gte: 20 } } }),
      prisma.stockScore.count({ where: { recommendation: "AVOID", priceCount: { gte: 20 } } }),
      prisma.stockScore.aggregate({
        _avg: { totalScore: true },
        where: { priceCount: { gte: 20 } },
      }),
      prisma.stockScore.findMany({
        where: {
          priceCount: { gte: 20 },
          recommendation: { in: ["STRONG_BUY", "BUY", "HOLD"] },
          totalScore: { gte: 65 },
        },
        orderBy: { totalScore: "desc" },
        take: 5,
        select: { symbol: true, name: true, nameZh: true, totalScore: true, recommendation: true, return5d: true },
      }),
      prisma.stockScore.findMany({
        where: {
          priceCount: { gte: 20 },
          rsi14: { gte: 35, lte: 52 },
          fundamentalScore: { gte: 18 },
          totalScore: { gte: 55 },
          return5d: { lte: -1 },
        },
        orderBy: { fundamentalScore: "desc" },
        take: 3,
        select: { symbol: true, name: true, nameZh: true, totalScore: true, rsi14: true, return5d: true },
      }),
    ]);

  if (total === 0) {
    console.log("[closing-summary] データなし、スキップ");
    await prisma.$disconnect();
    return;
  }

  const flexMessage = buildCloseReportFlex({
    dateStr,
    dowLabel: dow,
    total,
    strongBuy,
    buy,
    hold,
    watch,
    avoid,
    avgScore: Math.round(avgAgg._avg.totalScore ?? 0),
    topPerformers,
    fishingCandidates,
  });

  const groupIds = await prisma.lineGroup
    .findMany({ where: { isActive: true }, select: { groupId: true } })
    .then((gs) => gs.map((g) => g.groupId));

  if (DRY_RUN) {
    console.log("[closing-summary] DRY RUN - Flex Message preview:");
    console.log(JSON.stringify(flexMessage, null, 2));
  } else {
    const result = await pushToAll([flexMessage], groupIds);
    console.log(`[closing-summary] 推送完成 群組 ${result.groups}/${groupIds.length} broadcast ${result.broadcast}`);

    await prisma.notificationLog.create({
      data: {
        type: "CLOSE_REPORT",
        title: `大引けまとめ ${dateStr}`,
        content: `BUY:${buy} HOLD:${hold} AVOID:${avoid}`,
        symbols: topPerformers.map((p) => p.symbol),
        status: "SUCCESS",
        sentAt: new Date(),
      },
    }).catch(() => {});
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[closing-summary] 致命错误:", err);
  process.exit(1);
});
