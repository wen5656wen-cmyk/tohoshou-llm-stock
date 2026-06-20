#!/usr/bin/env npx tsx
/**
 * LINE 风险预警推送（每个工作日 16:35 由 cron 调用）
 *
 * 触发条件（满足任一即推送）：
 *   - RSI > 80（超买）
 *   - MACD 卖出信号
 *   - 5日跌幅 >= 7%
 *   - AI评分 < 30（高风险）
 *
 * 若当天没有任何高风险情况，则不推送（静默）
 *
 * 使用方法：
 *   npm run line:risk-alert          // 实际发送
 *   npm run line:risk-alert:dry      // DRY_RUN（仅控制台输出）
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { isConfigured } from "../lib/line";
import { pushToAll, textMsg } from "../lib/line-push";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

const DRY_RUN = process.env.DRY_RUN === "1";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

function pct(v: number | null | undefined): string {
  if (v == null) return "—";
  return (v >= 0 ? "▲" : "▼") + Math.abs(v).toFixed(1) + "%";
}

async function main() {
  console.log(`[line-risk-alert] ${DRY_RUN ? "DRY RUN" : "发送模式"} 启动`);

  if (!DRY_RUN && !isConfigured()) {
    console.error("[line-risk-alert] LINE 未配置（请检查 .env LINE_CHANNEL_ACCESS_TOKEN）");
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
    orderBy: { riskScore: "asc" },
    take: 10,
    select: {
      name: true, symbol: true,
      rsi14: true, macdSignalLabel: true,
      totalScore: true, riskScore: true,
      return5d: true, latestClose: true,
    },
  });

  if (risks.length === 0) {
    console.log("[line-risk-alert] 今日无高风险情况，不推送");
    await prisma.$disconnect();
    return;
  }

  const groupIds = await prisma.lineGroup
    .findMany({ where: { isActive: true }, select: { groupId: true } })
    .then((gs) => gs.map((g) => g.groupId));

  const now = new Date();
  const tokyoDate = new Date(now.getTime() + 9 * 3600000);
  const dateStr = tokyoDate.toISOString().split("T")[0];

  const lines = [
    `🚨 TOHOSHOU AI 风险预警`,
    `📅 ${dateStr}`,
    `━━━━━━━━━━━━━━━━`,
    `共 ${risks.length} 只股票触发风险指标`,
    ``,
  ];

  for (const r of risks) {
    const warns: string[] = [];
    if (r.rsi14 && r.rsi14 > 80) warns.push(`RSI超买 ${r.rsi14.toFixed(0)}`);
    if (r.macdSignalLabel === "SELL") warns.push("MACD卖出信号");
    if (r.totalScore !== null && r.totalScore < 30) warns.push(`AI评分低(${r.totalScore}分)`);
    if (r.return5d !== null && r.return5d <= -7) warns.push(`5日跌${Math.abs(r.return5d).toFixed(1)}%`);

    lines.push(
      `🔴 ${r.name} (${r.symbol.replace(".T", "")})`,
      `   现价 ¥${r.latestClose?.toLocaleString() ?? "—"}  5日 ${pct(r.return5d)}`,
      `   ⚠️ ${warns.join(" | ")}`,
      ``
    );
  }

  lines.push(`━━━━━━━━━━━━━━━━`, `🔗 ${APP_URL}/screener`);

  const msg = lines.join("\n");

  if (DRY_RUN) {
    console.log("─── 风险预警消息 ───────────────────────");
    console.log(msg);
    console.log("[line-risk-alert] DRY RUN 完成");
  } else {
    const result = await pushToAll([textMsg(msg)], groupIds);
    console.log(`[line-risk-alert] 推送完成：${risks.length}只高风险，群组 ${result.groups}/${groupIds.length}`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[line-risk-alert] 致命错误:", err);
  process.exit(1);
});
