#!/usr/bin/env npx tsx
/**
 * TOHOSHOU AI — 盘中策略更新（11:30 JST 工作日）
 *
 * 仅在检测到重大信号时创建发送任务：
 *   信号条件：存在≥1只 STRONG_BUY/BUY 股票，且当前价在建议区间内
 *   无信号 → 跳过，不创建 add_msg_template 任务
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

function ratingLabel(v: string | null | undefined): string {
  switch (v) {
    case "STRONG_BUY": return "强烈买入";
    case "BUY":        return "买入";
    default:           return v ?? "—";
  }
}

async function main() {
  console.log(`[wecom:midday] ${DRY_RUN ? "DRY RUN" : "执行"}`);

  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 3600_000);
  const dateLabel = `${jst.getUTCFullYear()}年${jst.getUTCMonth() + 1}月${jst.getUTCDate()}日`;

  // 查询 STRONG_BUY/BUY 且当前价在建议区间内的标的（重大信号条件）
  const candidates = await prisma.stockScore.findMany({
    where: {
      recommendationV2: { in: ["STRONG_BUY", "BUY"] },
      priceCount: { gte: 20 },
      entryLow: { not: null },
      entryHigh: { not: null },
      latestClose: { not: null },
    },
    orderBy: [{ recommendationV2: "asc" }, { adaptiveScore: "desc" }],
    take: 20,
    select: {
      symbol: true, name: true, nameZh: true,
      recommendationV2: true, adaptiveScore: true,
      latestClose: true, return5d: true,
      entryLow: true, entryHigh: true, target1: true,
    },
  });

  // 过滤：当前价在建议区间内（重大信号）
  const inZone = candidates.filter(s =>
    s.latestClose != null &&
    s.entryLow != null &&
    s.entryHigh != null &&
    s.latestClose >= s.entryLow &&
    s.latestClose <= s.entryHigh
  ).slice(0, 3);

  if (inZone.length === 0) {
    console.log("[wecom:midday] 无重大信号（无标的进入建议区间），跳过本次推送");
    await prisma.$disconnect();
    return;
  }

  console.log(`[wecom:midday] 检测到 ${inZone.length} 只标的进入建议区间，创建发送任务`);

  const nums = ["①", "②", "③"];
  const lines: string[] = [
    "TOHOSHOU AI 研究院",
    "盘中策略更新",
    "",
    SEP,
    "",
    `${dateLabel} 11:30`,
    "",
    `【买入时机信号】`,
    "",
    `检测到 ${inZone.length} 只标的进入建议区间：`,
  ];

  for (let i = 0; i < inZone.length; i++) {
    const s = inZone[i];
    const name = s.nameZh ?? s.name;
    const upside = s.target1 != null && s.latestClose != null
      ? ((s.target1 - s.latestClose) / s.latestClose) * 100
      : null;

    lines.push("");
    lines.push(`${nums[i]} ${name}　${s.symbol}`);
    lines.push(`   评级：${ratingLabel(s.recommendationV2)}`);
    lines.push(`   当前价：${fmtJpy(s.latestClose)}`);
    lines.push(`   建议区间：${fmtJpy(s.entryLow)} – ${fmtJpy(s.entryHigh)}`);
    if (s.target1 != null) {
      lines.push(`   目标价：${fmtJpy(s.target1)}${upside != null ? `（+${upside.toFixed(1)}%）` : ""}`);
    }
    if (s.return5d != null) lines.push(`   近5日表现：${fmtPct(s.return5d)}`);
  }

  lines.push("");
  lines.push(SEP);
  lines.push("");
  lines.push("上述标的当前价位已进入模型建议买入区间，");
  lines.push("请结合个人风险偏好审慎决策。");
  lines.push("");
  lines.push("TOHOSHOU AI 研究院");

  const content = lines.join("\n");

  if (DRY_RUN) {
    console.log("\n" + content);
  } else {
    const token = await getWecomToken();
    const r = await sendToVipCustomers(content, token);
    console.log(`[wecom:midday] errcode=${r.errcode} vip=${r.vipNames.join(",")}`);
  }

  await prisma.$disconnect();
}

main().catch(err => {
  console.error("[wecom:midday] 错误:", err);
  process.exit(1);
});
