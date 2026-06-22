#!/usr/bin/env npx tsx
/**
 * 企业微信盘中策略更新（每日 11:30 JST 工作日）
 * 推送：当前 TOP3 评级最高 + 市场情绪快照
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { sendToVipSubscribers, getWecomToken } from "../lib/notify/wecom-customer-service";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

const DRY_RUN = process.env.DRY_RUN === "1";
const NUMS = ["①", "②", "③"];
const SEP = "━━━━━━━━━━━━━━";

function fmtJpy(v: number | null | undefined): string {
  if (v == null) return "—";
  return `¥${Math.round(v).toLocaleString("ja-JP")}`;
}

function fmtReturn(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

function recLabel(v: string | null | undefined): string {
  switch (v) {
    case "STRONG_BUY": return "强烈买入 STRONG BUY";
    case "BUY":        return "买入 BUY";
    case "HOLD":       return "持有 HOLD";
    default:           return v ?? "—";
  }
}

async function main() {
  console.log(`[wecom:midday] ${DRY_RUN ? "DRY RUN" : "发送模式"} 启动`);

  const now = new Date();
  const jstMs = now.getTime() + 9 * 3600_000;
  const jst = new Date(jstMs);
  const dateLabel = `${jst.getUTCFullYear()}年${jst.getUTCMonth() + 1}月${jst.getUTCDate()}日`;

  const top3 = await prisma.stockScore.findMany({
    where: {
      recommendationV2: { in: ["STRONG_BUY", "BUY"] },
      priceCount: { gte: 20 },
      adaptiveScore: { not: null },
    },
    orderBy: [{ recommendationV2: "asc" }, { adaptiveScore: "desc" }],
    take: 3,
    select: {
      symbol: true, name: true, nameZh: true,
      adaptiveScore: true, recommendationV2: true,
      latestClose: true, return5d: true,
      entryLow: true, entryHigh: true,
    },
  });

  // 市场情绪快照
  const counts = await prisma.stockScore.groupBy({
    by: ["recommendationV2"],
    _count: { symbol: true },
    where: { recommendationV2: { not: null } },
  });
  const countMap: Record<string, number> = {};
  for (const c of counts) countMap[c.recommendationV2 ?? ""] = c._count.symbol;

  const lines: string[] = [
    "🤖 TOHOSHOU AI｜盘中策略更新",
    "",
    SEP,
    "",
    `📅 ${dateLabel} 11:30 盘中`,
    "",
    "【重点关注】",
  ];

  for (let i = 0; i < top3.length; i++) {
    const s = top3[i];
    const name = s.nameZh ?? s.name;
    lines.push("");
    lines.push(`${NUMS[i]} ${name}（${s.symbol}）`);
    lines.push(`评级：${recLabel(s.recommendationV2)}`);
    if (s.latestClose != null) lines.push(`现价：${fmtJpy(s.latestClose)}`);
    if (s.return5d != null) lines.push(`近5日：${fmtReturn(s.return5d)}`);
    if (s.entryLow != null && s.entryHigh != null) {
      lines.push(`建议区间：${fmtJpy(s.entryLow)} - ${fmtJpy(s.entryHigh)}`);
    }
  }

  lines.push("");
  lines.push(SEP);
  lines.push("");
  lines.push("【市场情绪】");
  lines.push("");
  lines.push(`强烈买入：${countMap["STRONG_BUY"] ?? 0}只`);
  lines.push(`买入：${countMap["BUY"] ?? 0}只`);
  lines.push(`持有：${countMap["HOLD"] ?? 0}只`);
  lines.push(`观察/回避：${(countMap["WATCH"] ?? 0) + (countMap["AVOID"] ?? 0)}只`);
  lines.push("");
  lines.push(SEP);
  lines.push("");
  lines.push("TOHOSHOU AI研究院");

  const msg = lines.join("\n");

  if (DRY_RUN) {
    console.log("[wecom:midday] DRY RUN 预览:");
    console.log(msg);
  } else {
    const token = await getWecomToken();
    const results = await sendToVipSubscribers(msg, token);
    console.log(`[wecom:midday] 推送完成，${results.length} 人：`, results.map(r => `${r.name}(${r.channel})`).join(", ") || "无订阅者");
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[wecom:midday] 致命错误:", err);
  process.exit(1);
});
