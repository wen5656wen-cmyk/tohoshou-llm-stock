#!/usr/bin/env npx tsx
/**
 * LINE 朝報（毎日 08:00 JST）
 * v7.3.0: Flex Message + 中文股票名称
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { isConfigured } from "../lib/line";
import { pushToAll } from "../lib/line-push";
import { buildMorningReportFlex } from "../lib/line-flex";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

const DRY_RUN = process.env.DRY_RUN === "1";

async function main() {
  console.log(`[morning-brief] ${DRY_RUN ? "DRY RUN" : "发送模式"} 启动`);

  if (!DRY_RUN && !isConfigured()) {
    console.error("[morning-brief] LINE 未配置");
    process.exit(1);
  }

  const now = new Date();
  const tokyoDate = new Date(now.getTime() + 9 * 3600000);
  const dateStr = tokyoDate.toISOString().split("T")[0];
  const dow = ["日", "月", "火", "水", "木", "金", "土"][tokyoDate.getUTCDay()];

  const picks = await prisma.stockScore.findMany({
    where: {
      priceCount: { gte: 20 },
      recommendation: { in: ["STRONG_BUY", "BUY", "HOLD"] },
      totalScore: { gte: 65 },
    },
    orderBy: [{ totalScore: "desc" }],
    take: 5,
    select: {
      symbol: true, name: true, nameZh: true,
      totalScore: true, recommendation: true,
      latestClose: true, return5d: true, summaryReason: true,
    },
  });

  if (picks.length === 0) {
    console.log("[morning-brief] HOLD以上推薦なし、スキップ");
    await prisma.$disconnect();
    return;
  }

  const flexMessage = buildMorningReportFlex(picks, dateStr, dow);

  const groupIds = await prisma.lineGroup
    .findMany({ where: { isActive: true }, select: { groupId: true } })
    .then((gs) => gs.map((g) => g.groupId));

  if (DRY_RUN) {
    console.log("[morning-brief] DRY RUN - Flex Message preview:");
    console.log(JSON.stringify(flexMessage, null, 2));
  } else {
    const result = await pushToAll([flexMessage], groupIds);
    console.log(`[morning-brief] 推送完成 群組 ${result.groups}/${groupIds.length} broadcast ${result.broadcast}`);

    await prisma.notificationLog.create({
      data: {
        type: "MORNING_REPORT",
        title: `朝報 ${dateStr}`,
        content: `TOP${picks.length}推薦`,
        symbols: picks.map((p) => p.symbol),
        status: "SUCCESS",
        sentAt: new Date(),
      },
    }).catch(() => {});
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[morning-brief] 致命错误:", err);
  process.exit(1);
});
