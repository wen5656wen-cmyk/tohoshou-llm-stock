#!/usr/bin/env npx tsx
/**
 * TOHOSHOU AI — 每日收盘复盘（15:30 JST 工作日）
 * 发送渠道：add_msg_template（员工确认后发出）
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { sendToVipCustomers, getWecomToken } from "../lib/notify/wecom-customer-service";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

const DRY_RUN = process.env.DRY_RUN === "1";
const SEP = "━━━━━━━━━━━━━━━━━━━━";

function fmtJpy(v: number | null | undefined): string {
  if (v == null) return "—";
  return `¥${Math.round(v).toLocaleString("ja-JP")}`;
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

function sentimentLabel(strongBuy: number, buy: number, avoid: number, total: number): string {
  if (total === 0) return "—";
  const bullRatio = (strongBuy + buy) / total;
  const bearRatio = avoid / total;
  if (bullRatio >= 0.20) return "偏多";
  if (bearRatio >= 0.30) return "偏空";
  return "中性";
}

async function main() {
  console.log(`[wecom:close] ${DRY_RUN ? "DRY RUN" : "执行"}`);

  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 3600_000);
  const days = ["日", "一", "二", "三", "四", "五", "六"];
  const dateLabel = `${jst.getUTCFullYear()}年${jst.getUTCMonth() + 1}月${jst.getUTCDate()}日`;
  const weekday = days[jst.getUTCDay()];

  // 评级分布统计
  const groups = await prisma.stockScore.groupBy({
    by: ["recommendationV2"],
    _count: { symbol: true },
    where: { recommendationV2: { not: null } },
  });
  const cm: Record<string, number> = {};
  for (const g of groups) cm[g.recommendationV2 ?? ""] = g._count.symbol;
  const total = Object.values(cm).reduce((a, b) => a + b, 0);
  const sB = cm["STRONG_BUY"] ?? 0;
  const buy = cm["BUY"] ?? 0;
  const hold = cm["HOLD"] ?? 0;
  const watch = cm["WATCH"] ?? 0;
  const avoid = cm["AVOID"] ?? 0;

  // 涨幅前3（近5日）
  const gainers = await prisma.stockScore.findMany({
    where: { return5d: { not: null }, priceCount: { gte: 20 } },
    orderBy: { return5d: "desc" },
    take: 3,
    select: { symbol: true, name: true, nameZh: true, latestClose: true, return5d: true, recommendationV2: true },
  });

  // 跌幅前3（近5日）
  const losers = await prisma.stockScore.findMany({
    where: { return5d: { not: null }, priceCount: { gte: 20 } },
    orderBy: { return5d: "asc" },
    take: 3,
    select: { symbol: true, name: true, nameZh: true, latestClose: true, return5d: true },
  });

  // STRONG_BUY 总数（明日关注）
  const sbCount = await prisma.stockScore.count({
    where: { recommendationV2: "STRONG_BUY", priceCount: { gte: 20 } },
  });

  const lines: string[] = [
    "TOHOSHOU AI 研究院",
    "每日收盘复盘",
    "",
    SEP,
    "",
    `${dateLabel}（${weekday}）15:30`,
    "",
    "【市场评级分布】",
    "",
    `强烈买入：${sB.toLocaleString()}只　买入：${buy.toLocaleString()}只`,
    `持有：${hold.toLocaleString()}只　　观察/回避：${(watch + avoid).toLocaleString()}只`,
    "",
    `情绪倾向：${sentimentLabel(sB, buy, avoid, total)}`,
  ];

  // 涨幅领先
  if (gainers.length > 0) {
    lines.push("");
    lines.push(SEP);
    lines.push("");
    lines.push("【近5日涨幅领先】");
    for (const s of gainers) {
      const name = s.nameZh ?? s.name;
      lines.push(`• ${name}（${s.symbol}）  ${fmtPct(s.return5d)}  现价 ${fmtJpy(s.latestClose)}`);
    }
  }

  // 跌幅较大
  if (losers.length > 0) {
    lines.push("");
    lines.push("【近5日跌幅较大】");
    for (const s of losers) {
      const name = s.nameZh ?? s.name;
      lines.push(`• ${name}（${s.symbol}）  ${fmtPct(s.return5d)}  现价 ${fmtJpy(s.latestClose)}`);
    }
  }

  lines.push("");
  lines.push(SEP);
  lines.push("");
  lines.push("【明日关注】");
  lines.push("");
  lines.push(`模型评级「强烈买入」标的共 ${sbCount} 只，`);
  lines.push("建议持续跟踪并结合基本面审慎评估。");
  lines.push("");
  lines.push(SEP);
  lines.push("");
  lines.push("本报告基于量化模型，不构成投资建议。");
  lines.push("历史业绩不代表未来表现，请合理控制仓位。");
  lines.push("");
  lines.push("TOHOSHOU AI 研究院");

  const content = lines.join("\n");

  if (DRY_RUN) {
    console.log("\n" + content);
  } else {
    const token = await getWecomToken();
    const r = await sendToVipCustomers(content, token);
    console.log(`[wecom:close] errcode=${r.errcode} vip=${r.vipNames.join(",")}`);
  }

  await prisma.$disconnect();
}

main().catch(err => {
  console.error("[wecom:close] 错误:", err);
  process.exit(1);
});
