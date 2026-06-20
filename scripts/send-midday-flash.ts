#!/usr/bin/env npx tsx
/**
 * LINE 午間速報（毎日 12:30 JST）
 * v7.3.0: Flex Message + 中文股票名称
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { isConfigured } from "../lib/line";
import { pushToAll } from "../lib/line-push";
import { buildMiddayFlex } from "../lib/line-flex";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

const DRY_RUN = process.env.DRY_RUN === "1";

async function main() {
  console.log(`[midday-flash] ${DRY_RUN ? "DRY RUN" : "发送模式"} 启动`);

  if (!DRY_RUN && !isConfigured()) {
    console.error("[midday-flash] LINE 未配置");
    process.exit(1);
  }

  const now = new Date();
  const tokyoDate = new Date(now.getTime() + 9 * 3600000);
  const dateStr = tokyoDate.toISOString().split("T")[0];

  const [surgers, fallers, macdSignals] = await Promise.all([
    prisma.stockScore.findMany({
      where: {
        priceCount: { gte: 20 },
        return5d: { gte: 5 },
        totalScore: { gte: 50 },
      },
      orderBy: { return5d: "desc" },
      take: 5,
      select: {
        symbol: true, name: true, nameZh: true,
        return5d: true, totalScore: true, recommendation: true, latestClose: true,
      },
    }),
    prisma.stockScore.findMany({
      where: {
        priceCount: { gte: 20 },
        return5d: { lte: -5 },
      },
      orderBy: { return5d: "asc" },
      take: 3,
      select: {
        symbol: true, name: true, nameZh: true,
        return5d: true, totalScore: true, recommendation: true, latestClose: true,
      },
    }),
    prisma.stockScore.findMany({
      where: {
        priceCount: { gte: 20 },
        macdSignalLabel: "BUY",
        technicalScore: { gte: 20 },
        totalScore: { gte: 55 },
      },
      orderBy: { technicalScore: "desc" },
      take: 3,
      select: {
        symbol: true, name: true, nameZh: true,
        technicalScore: true, totalScore: true, recommendation: true, return5d: true,
      },
    }),
  ]);

  if (surgers.length === 0 && macdSignals.length === 0) {
    console.log("[midday-flash] 注目銘柄なし、スキップ");
    await prisma.$disconnect();
    return;
  }

  const flexMessage = buildMiddayFlex(surgers, fallers, macdSignals, dateStr);

  const groupIds = await prisma.lineGroup
    .findMany({ where: { isActive: true }, select: { groupId: true } })
    .then((gs) => gs.map((g) => g.groupId));

  if (DRY_RUN) {
    console.log("[midday-flash] DRY RUN - Flex Message preview:");
    console.log(JSON.stringify(flexMessage, null, 2));
  } else {
    const result = await pushToAll([flexMessage], groupIds);
    console.log(`[midday-flash] 推送完成 群組 ${result.groups}/${groupIds.length} broadcast ${result.broadcast}`);

    await prisma.notificationLog.create({
      data: {
        type: "MIDDAY_REPORT",
        title: `午間速報 ${dateStr}`,
        content: `急騰${surgers.length}件 MACD${macdSignals.length}件`,
        symbols: [...surgers, ...fallers].map((s) => s.symbol),
        status: "SUCCESS",
        sentAt: new Date(),
      },
    }).catch(() => {});
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[midday-flash] 致命错误:", err);
  process.exit(1);
});
