#!/usr/bin/env npx tsx
/**
 * LINE リスク警告（毎工作日 16:35 JST）
 * v7.3.0: Flex Message + 中文股票名称
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { isConfigured } from "../lib/line";
import { pushToAll } from "../lib/line-push";
import { buildRiskAlertFlex } from "../lib/line-flex";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

const DRY_RUN = process.env.DRY_RUN === "1";

async function main() {
  console.log(`[risk-alert] ${DRY_RUN ? "DRY RUN" : "发送模式"} 启动`);

  if (!DRY_RUN && !isConfigured()) {
    console.error("[risk-alert] LINE 未配置");
    process.exit(1);
  }

  const risks = await prisma.stockScore.findMany({
    where: {
      priceCount: { gte: 20 },
      OR: [
        { rsi14: { gt: 80 } },
        { macdSignalLabel: "SELL" },
        { totalScore: { lt: 30 } },
        { return5d: { lte: -7 } },
      ],
    },
    orderBy: { totalScore: "asc" },
    take: 10,
    select: {
      symbol: true, name: true, nameZh: true,
      rsi14: true, macdSignalLabel: true,
      totalScore: true, return5d: true, latestClose: true,
    },
  });

  if (risks.length === 0) {
    console.log("[risk-alert] 今日无高风险情况，不推送");
    await prisma.$disconnect();
    return;
  }

  const now = new Date();
  const tokyoDate = new Date(now.getTime() + 9 * 3600000);
  const dateStr = tokyoDate.toISOString().split("T")[0];

  const flexMessage = buildRiskAlertFlex(risks, dateStr);

  const groupIds = await prisma.lineGroup
    .findMany({ where: { isActive: true }, select: { groupId: true } })
    .then((gs) => gs.map((g) => g.groupId));

  if (DRY_RUN) {
    console.log("[risk-alert] DRY RUN - Flex Message preview:");
    console.log(JSON.stringify(flexMessage, null, 2));
  } else {
    const result = await pushToAll([flexMessage], groupIds);
    console.log(`[risk-alert] 推送完成 ${risks.length}只高风险 群組 ${result.groups}/${groupIds.length}`);

    await prisma.notificationLog.create({
      data: {
        type: "REALTIME_ALERT",
        title: `リスク警告 ${dateStr}`,
        content: `${risks.length}銘柄でリスク指標発動`,
        symbols: risks.map((r) => r.symbol),
        status: "SUCCESS",
        sentAt: new Date(),
      },
    }).catch(() => {});
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[risk-alert] 致命错误:", err);
  process.exit(1);
});
