#!/usr/bin/env npx tsx
/**
 * 企业微信晨报（每日 08:00 JST 工作日）
 * 推送：STRONG BUY Top3 / 综合评分 / 市场情绪 / 更新时间
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { sendMarkdown, isConfigured } from "../lib/notify/wecom";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

const DRY_RUN = process.env.DRY_RUN === "1";

const DOW_ZH = ["日", "一", "二", "三", "四", "五", "六"];

function fmtScore(v: number | null | undefined): string {
  return v != null ? v.toFixed(1) : "—";
}

function fmtReturn(v: number | null | undefined): string {
  if (v == null) return "—";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

function sentimentLabel(strongBuy: number, buy: number, total: number): string {
  const ratio = (strongBuy + buy) / Math.max(total, 1);
  if (strongBuy >= 10) return "🔥 BULLISH（强势）";
  if (ratio >= 0.03) return "📈 POSITIVE（偏多）";
  if (ratio >= 0.01) return "⚠️ CAUTIOUS（谨慎）";
  return "❄️ COLD（低迷）";
}

function recLabel(v: string | null | undefined): string {
  switch (v) {
    case "STRONG_BUY": return "STRONG BUY";
    case "BUY": return "BUY";
    case "HOLD": return "HOLD";
    default: return v ?? "—";
  }
}

async function main() {
  console.log(`[wecom:morning-report] ${DRY_RUN ? "DRY RUN" : "发送模式"} 启动`);

  if (!DRY_RUN && !isConfigured()) {
    console.error("[wecom:morning-report] WECOM_WEBHOOK_URL 未配置，退出");
    process.exit(1);
  }

  const now = new Date();
  const jstMs = now.getTime() + 9 * 3600000;
  const jst = new Date(jstMs);
  const dateStr = jst.toISOString().split("T")[0];
  const dow = DOW_ZH[jst.getUTCDay()];
  const timeStr = `${String(jst.getUTCHours()).padStart(2, "0")}:${String(jst.getUTCMinutes()).padStart(2, "0")} JST`;

  const [top3, strongBuyCount, buyCount, totalCount, latestCompute] = await Promise.all([
    prisma.stockScore.findMany({
      where: {
        recommendationV2: { in: ["STRONG_BUY", "BUY"] },
        priceCount: { gte: 20 },
        adaptiveScore: { not: null },
      },
      orderBy: [{ recommendationV2: "asc" }, { adaptiveScore: "desc" }],
      take: 3,
      select: {
        symbol: true,
        name: true,
        nameZh: true,
        adaptiveScore: true,
        recommendationV2: true,
        latestClose: true,
        return5d: true,
        tradingAction: true,
        computedAt: true,
      },
    }),
    prisma.stockScore.count({
      where: { recommendationV2: "STRONG_BUY", priceCount: { gte: 20 } },
    }),
    prisma.stockScore.count({
      where: { recommendationV2: "BUY", priceCount: { gte: 20 } },
    }),
    prisma.stockScore.count({ where: { priceCount: { gte: 20 } } }),
    prisma.stockScore.findFirst({
      orderBy: { computedAt: "desc" },
      select: { computedAt: true },
    }),
  ]);

  const sentiment = sentimentLabel(strongBuyCount, buyCount, totalCount);

  const computedAtStr = latestCompute?.computedAt
    ? new Date(latestCompute.computedAt.getTime() + 9 * 3600000)
        .toISOString()
        .replace("T", " ")
        .slice(0, 16) + " JST"
    : timeStr;

  const topLines = top3.length === 0
    ? "> 暂无 BUY 级别以上股票"
    : top3.map((s, i) => {
        const displayName = s.nameZh ?? s.name;
        const score = fmtScore(s.adaptiveScore);
        const ret = fmtReturn(s.return5d);
        const rec = recLabel(s.recommendationV2);
        const action = s.tradingAction === "BUY_NOW" ? " 🎯 BUY NOW" : "";
        return `**${i + 1}. ${displayName}** \`${s.symbol}\`\n   评分：<font color="info">**${score}**</font> | ${rec}${action} | 5日：${ret}`;
      }).join("\n\n");

  const md = [
    `## 📊 TOHOSHOU AI 晨报`,
    `**${dateStr}（${dow}）**`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `### 📈 STRONG BUY Top3`,
    ``,
    topLines,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `**市场情绪：** ${sentiment}`,
    `BUY级以上：<font color="info">**${strongBuyCount + buyCount}只**</font>（STRONG BUY ${strongBuyCount} / BUY ${buyCount}）`,
    `总评估：${totalCount}只`,
    `🕗 数据时间：${computedAtStr}`,
  ].join("\n");

  if (DRY_RUN) {
    console.log("[wecom:morning-report] DRY RUN 预览:");
    console.log(md);
  } else {
    const res = await sendMarkdown(md);
    if (res.ok) {
      console.log("[wecom:morning-report] ✅ 推送成功");
    } else {
      console.error("[wecom:morning-report] ❌ 推送失败:", res.errmsg);
      process.exit(1);
    }
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[wecom:morning-report] 致命错误:", err);
  process.exit(1);
});
