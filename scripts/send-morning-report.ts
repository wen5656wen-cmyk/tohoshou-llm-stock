#!/usr/bin/env npx tsx
/**
 * TOHOSHOU AI — 晨间策略报告（08:00 JST 工作日）
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

function jstDate(): { label: string; weekday: string } {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 3600_000);
  const days = ["日", "一", "二", "三", "四", "五", "六"];
  return {
    label: `${jst.getUTCFullYear()}年${jst.getUTCMonth() + 1}月${jst.getUTCDate()}日`,
    weekday: days[jst.getUTCDay()],
  };
}

function fmtJpy(v: number | null | undefined): string {
  if (v == null) return "—";
  return `¥${Math.round(v).toLocaleString("ja-JP")}`;
}

function fmtPct(v: number | null | undefined, sign = true): string {
  if (v == null) return "—";
  return `${sign && v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

function ratingLabel(v: string | null | undefined): string {
  switch (v) {
    case "STRONG_BUY": return "强烈买入";
    case "BUY":        return "买入";
    case "HOLD":       return "持有";
    case "WATCH":      return "观察";
    case "AVOID":      return "回避";
    default:           return v ?? "—";
  }
}

function riskLabel(v: string | null | undefined): string {
  switch (v) {
    case "LOW":     return "低";
    case "MEDIUM":  return "中等";
    case "HIGH":    return "偏高";
    case "EXTREME": return "高";
    default:        return "—";
  }
}

async function main() {
  console.log(`[wecom:morning] ${DRY_RUN ? "DRY RUN" : "执行"}`);

  const { label, weekday } = jstDate();

  // TOP3（STRONG_BUY 优先，评分降序）
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
      entryLow: true, entryHigh: true,
      target1: true, actionRiskLevel: true,
    },
  });

  // 日经225 近20日收益（用于超额收益计算）
  const gm = await prisma.globalMarket.findMany({
    orderBy: { date: "desc" },
    take: 22,
    select: { nikkei: true },
  });
  const nk0 = gm[0]?.nikkei;
  const nk20 = gm[gm.length - 1]?.nikkei;
  const nikkei20d = nk0 && nk20 ? ((nk0 - nk20) / nk20) * 100 : null;

  // 模型组合近20日均收益
  const returns = (await prisma.stockScore.findMany({
    where: { symbol: { in: top3.map(s => s.symbol) } },
    select: { return20d: true },
  })).map(r => r.return20d).filter((v): v is number => v != null);

  const avgReturn = returns.length ? returns.reduce((a, b) => a + b) / returns.length : null;
  const alpha = avgReturn != null && nikkei20d != null ? avgReturn - nikkei20d : null;
  const winRate = returns.length ? Math.round(returns.filter(r => r > 0).length / returns.length * 100) : null;

  // 构建消息
  const nums = ["①", "②", "③"];
  const lines: string[] = [
    "TOHOSHOU AI 研究院",
    "晨间策略报告",
    "",
    SEP,
    "",
    `${label}（${weekday}）`,
    "",
    "【重点配置机会】",
  ];

  for (let i = 0; i < top3.length; i++) {
    const s = top3[i];
    const name = s.nameZh ?? s.name;
    const score = s.adaptiveScore != null ? Math.round(s.adaptiveScore) : null;

    lines.push("");
    lines.push(`${nums[i]} ${name}　${s.symbol}`);
    lines.push(`   评级：${ratingLabel(s.recommendationV2)}`);
    if (score != null) lines.push(`   AI评分：${score} / 100`);
    if (s.target1 != null) lines.push(`   目标价：${fmtJpy(s.target1)}`);
    if (s.entryLow != null && s.entryHigh != null) {
      lines.push(`   建议区间：${fmtJpy(s.entryLow)} – ${fmtJpy(s.entryHigh)}`);
    }
    lines.push(`   风险等级：${riskLabel(s.actionRiskLevel)}`);
  }

  lines.push("");
  lines.push(SEP);
  lines.push("");
  lines.push("【模型组合绩效】（近20日）");
  lines.push("");
  if (avgReturn != null) lines.push(`模型收益率　　${fmtPct(avgReturn)}`);
  if (nikkei20d != null) lines.push(`日经225指数　${fmtPct(nikkei20d)}`);
  if (alpha != null)     lines.push(`超额收益率　　${fmtPct(alpha)}`);
  if (winRate != null)   lines.push(`组合胜率　　　${winRate}%`);

  lines.push("");
  lines.push(SEP);
  lines.push("");
  lines.push("本报告由量化模型生成，不构成投资建议。");
  lines.push("历史业绩不代表未来表现，请合理控制仓位。");
  lines.push("");
  lines.push("TOHOSHOU AI 研究院");

  const content = lines.join("\n");

  if (DRY_RUN) {
    console.log("\n" + content);
  } else {
    const token = await getWecomToken();
    const r = await sendToVipCustomers(content, token);
    console.log(`[wecom:morning] errcode=${r.errcode} vip=${r.vipNames.join(",")}`);
  }

  await prisma.$disconnect();
}

main().catch(err => {
  console.error("[wecom:morning] 错误:", err);
  process.exit(1);
});
