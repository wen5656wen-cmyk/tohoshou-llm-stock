#!/usr/bin/env npx tsx
/**
 * LINE 推送测试脚本
 * npm run line:test
 * DRY_RUN=1 npm run line:test
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { isConfigured } from "../lib/line";
import { pushToAll, textMsg } from "../lib/line-push";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

const DRY_RUN = process.env.DRY_RUN === "1";

const REC_CN: Record<string, string> = {
  STRONG_BUY: "强烈买入",
  BUY:        "买入",
  WATCH:      "关注",
  HOLD:       "持有",
  AVOID:      "回避",
};

function recLabel(r: string | null): string {
  return REC_CN[r ?? ""] ?? (r ?? "—");
}

const MEDALS = ["🥇", "🥈", "🥉"];

async function main() {
  if (!DRY_RUN && !isConfigured()) {
    console.error("LINE 未配置 — 请检查 .env LINE_CHANNEL_ACCESS_TOKEN");
    process.exit(1);
  }

  const [stockCount, priceCount, finCount, scoreCount, top3, groupIds] = await Promise.all([
    prisma.stock.count(),
    prisma.dailyPrice.count(),
    prisma.financial.count(),
    prisma.stockScore.count({ where: { priceCount: { gte: 20 } } }),
    prisma.stockScore.findMany({
      where:   { priceCount: { gte: 20 } },
      orderBy: { totalScore: "desc" },
      take: 3,
      select: { symbol: true, name: true, totalScore: true, recommendation: true },
    }),
    prisma.lineGroup.findMany({
      where: { isActive: true },
      select: { groupId: true },
    }).then((gs) => gs.map((g) => g.groupId)),
  ]);

  const now = new Date();
  const tokyoStr = now.toLocaleString("zh-CN", {
    timeZone: "Asia/Tokyo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }) + " JST";

  const lines: string[] = [
    `━━━━━━━━━━━━━━━━`,
    `🇯🇵 TOHOSHOU AI`,
    ``,
    `LINE推送测试成功 ✅`,
    ``,
    `时间：`,
    tokyoStr,
    ``,
    `系统状态：`,
    `J-Quants：正常`,
    `Stock：${stockCount.toLocaleString()}只`,
    `DailyPrice：${priceCount.toLocaleString()}条`,
    `Financial：${finCount.toLocaleString()}条`,
    `AI评分：${scoreCount.toLocaleString()}只`,
    `LINE群组：${groupIds.length}个`,
    ``,
    `━━━━━━━━━━━━━━━━`,
    `今日 TOP${top3.length}`,
    ``,
  ];

  for (let i = 0; i < top3.length; i++) {
    const s = top3[i];
    const code = s.symbol.replace(".T", "");
    lines.push(
      `${MEDALS[i]} ${s.name}（${code}）`,
      ``,
      `AI评分：${s.totalScore ?? "—"}`,
      `建议：${recLabel(s.recommendation)}`,
      ``,
      `━━━━━━━━━━━━`,
    );
  }

  lines.push(
    ``,
    `这是测试消息。`,
    `如果你收到，说明：`,
    `✓ LINE Messaging API 正常`,
    `✓ TOHOSHOU AI 系统运行中`,
    `━━━━━━━━━━━━━━━━`,
  );

  const msg = lines.join("\n");

  console.log("─── 消息预览 ───────────────────────────");
  console.log(msg);
  console.log(`─── 字符数：${msg.length}`);
  console.log(`─── 活跃群组 (${groupIds.length}个)：${groupIds.join(", ") || "无"}`);

  if (DRY_RUN) {
    console.log("[DRY RUN] 未实际发送");
  } else {
    console.log("\n正在推送...");
    const result = await pushToAll([textMsg(msg)], groupIds);
    console.log(`✅ 完成：群组 ${result.groups}/${groupIds.length}，广播 ${result.broadcast ? "成功" : "失败"}`);
    if (groupIds.length === 0) {
      console.log("⚠️  没有已注册群组。请先将 Bot (@903zdoup) 邀请进 LINE 群，再启动 ngrok。");
    }
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("发送失败:", err.message ?? err);
  process.exit(1);
});
