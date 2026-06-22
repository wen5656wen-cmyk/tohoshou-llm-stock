#!/usr/bin/env npx tsx
/**
 * 企业微信晨报（每日 08:00 JST 工作日）
 * 格式：纯文本风格，匹配用户设计稿
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { sendViaWorker, isAibotConfigured } from "../lib/notify/wecom-aibot";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

const DRY_RUN = process.env.DRY_RUN === "1";

const NUMS = ["①", "②", "③", "④", "⑤"];

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
    case "WATCH":      return "观察 WATCH";
    case "AVOID":      return "回避 AVOID";
    default:           return v ?? "—";
  }
}

function riskLabel(v: string | null | undefined): string {
  switch (v) {
    case "LOW":     return "低风险";
    case "MEDIUM":  return "中等风险";
    case "HIGH":    return "较高风险";
    case "EXTREME": return "高风险";
    default:        return "中等风险";
  }
}

const SEP = "━━━━━━━━━━━━━━";

async function main() {
  console.log(`[wecom:morning-report] ${DRY_RUN ? "DRY RUN" : "发送模式"} 启动`);

  const now = new Date();
  const jstMs = now.getTime() + 9 * 3600_000;
  const jst = new Date(jstMs);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth() + 1;
  const d = jst.getUTCDate();
  const dateLabel = `${y}年${m}月${d}日`;

  // ── 查询 Top5（STRONG_BUY 优先，再 BUY）────────────────────────────────────
  const top5 = await prisma.stockScore.findMany({
    where: {
      recommendationV2: { in: ["STRONG_BUY", "BUY"] },
      priceCount: { gte: 20 },
      adaptiveScore: { not: null },
    },
    orderBy: [{ recommendationV2: "asc" }, { adaptiveScore: "desc" }],
    take: 5,
    select: {
      symbol: true,
      name: true,
      nameZh: true,
      adaptiveScore: true,
      recommendationV2: true,
      latestClose: true,
      return20d: true,
      entryLow: true,
      entryHigh: true,
      target1: true,
      actionRiskLevel: true,
    },
  });

  // ── 日经 20 日收益（用于超越指数对比）────────────────────────────────────
  const gmHistory = await prisma.globalMarket.findMany({
    orderBy: { date: "desc" },
    take: 22,
    select: { nikkei: true },
  });
  const latestNk = gmHistory[0]?.nikkei ?? null;
  const oldNk    = gmHistory[gmHistory.length - 1]?.nikkei ?? null;
  const nikkei20d = latestNk && oldNk ? (latestNk - oldNk) / oldNk * 100 : null;

  // ── TOP5 组合绩效 ─────────────────────────────────────────────────────────
  const returns = top5.map(s => s.return20d).filter((v): v is number => v != null);
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : null;
  const outperform = avgReturn != null && nikkei20d != null ? avgReturn - nikkei20d : null;
  const winRate = returns.length > 0 ? Math.round(returns.filter(r => r > 0).length / returns.length * 100) : null;

  // ── 构建消息 ──────────────────────────────────────────────────────────────
  const lines: string[] = [
    "🤖 TOHOSHOU AI｜晨间策略",
    "",
    SEP,
    "",
    "📅 日期",
    dateLabel,
    "",
    "【今日重点关注】",
  ];

  const showTop = top5.slice(0, 3);

  for (let i = 0; i < showTop.length; i++) {
    const s = showTop[i];
    const name = s.nameZh ?? s.name;
    const score = s.adaptiveScore != null ? Math.round(s.adaptiveScore) : null;

    lines.push("");
    lines.push(`${NUMS[i]} ${name}（${s.symbol}）`);
    lines.push(`评级：${recLabel(s.recommendationV2)}`);
    if (score != null) lines.push(`AI评分：${score}/100`);
    lines.push("");

    if (s.entryLow != null && s.entryHigh != null) {
      lines.push("建议区间：");
      lines.push(`${fmtJpy(s.entryLow)} - ${fmtJpy(s.entryHigh)}`);
      lines.push("");
    }

    if (s.target1 != null) {
      lines.push("目标价格：");
      lines.push(fmtJpy(s.target1));
      lines.push("");
    }

    lines.push("风险等级：");
    lines.push(riskLabel(s.actionRiskLevel));
    lines.push("");
    lines.push(SEP);
  }

  // ── 模型组合表现 ──────────────────────────────────────────────────────────
  lines.push("");
  lines.push("【模型组合表现】");
  lines.push("");
  lines.push(`TOP${top5.length}组合`);
  lines.push("");
  lines.push("近1月收益：");
  lines.push(fmtReturn(avgReturn));
  lines.push("");
  if (outperform != null) {
    lines.push("超越日经225：");
    lines.push(fmtReturn(outperform));
    lines.push("");
  }
  if (winRate != null) {
    lines.push("胜率：");
    lines.push(`${winRate}%`);
    lines.push("");
  }
  lines.push(SEP);
  lines.push("");
  lines.push("风险提示：");
  lines.push("");
  lines.push("历史收益不代表未来表现，");
  lines.push("请合理控制仓位。");
  lines.push("");
  lines.push("TOHOSHOU AI研究院");

  const msg = lines.join("\n");

  if (DRY_RUN) {
    console.log("[wecom:morning-report] DRY RUN 预览:");
    console.log(msg);
  } else if (!isAibotConfigured()) {
    console.log("[wecom:morning-report] WECOM_AIBOT_* 未配置，跳过推送。消息内容：");
    console.log(msg);
  } else {
    const res = await sendViaWorker(msg);
    if (res.ok) {
      console.log("[wecom:morning-report] ✅ 推送成功");
    } else {
      console.warn("[wecom:morning-report] ⚠️ 推送失败:", res.errmsg);
    }
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[wecom:morning-report] 致命错误:", err);
  process.exit(1);
});
