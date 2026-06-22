#!/usr/bin/env npx tsx
/**
 * 企业微信收盘总结（每日 15:30 JST 工作日）
 * 推送：STRONG BUY/BUY/WATCH 数量 / 今日表现最佳 / 今日跌幅最大
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { sendViaWorker, isAibotConfigured } from "../lib/notify/wecom-aibot";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

const DRY_RUN = process.env.DRY_RUN === "1";

const DOW_ZH = ["日", "一", "二", "三", "四", "五", "六"];

function fmtReturn(v: number | null | undefined): string {
  if (v == null) return "—";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

function fmtPrice(v: number | null | undefined): string {
  if (v == null) return "—";
  return `¥${v.toLocaleString("ja-JP")}`;
}

function sentimentBar(strongBuy: number, buy: number, hold: number, watch: number, avoid: number): string {
  const total = strongBuy + buy + hold + watch + avoid;
  if (total === 0) return "—";
  const bullish = Math.round(((strongBuy + buy) / total) * 10);
  const bearish = Math.round((avoid / total) * 10);
  const neutral = 10 - bullish - bearish;
  return "🟢".repeat(Math.max(bullish, 0)) + "⚪".repeat(Math.max(neutral, 0)) + "🔴".repeat(Math.max(bearish, 0));
}

async function main() {
  console.log(`[wecom:market-close] ${DRY_RUN ? "DRY RUN" : "发送模式"} 启动`);


  const now = new Date();
  const jstMs = now.getTime() + 9 * 3600000;
  const jst = new Date(jstMs);
  const dateStr = jst.toISOString().split("T")[0];
  const dow = DOW_ZH[jst.getUTCDay()];

  const [
    strongBuyCount,
    buyCount,
    holdCount,
    watchCount,
    avoidCount,
    totalCount,
    avgAgg,
    topGainer,
    topLoser,
    topBuyNow,
  ] = await Promise.all([
    prisma.stockScore.count({ where: { recommendationV2: "STRONG_BUY", priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { recommendationV2: "BUY", priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { recommendationV2: "HOLD", priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { recommendationV2: "WATCH", priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { recommendationV2: "AVOID", priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { priceCount: { gte: 20 } } }),
    prisma.stockScore.aggregate({
      _avg: { adaptiveScore: true },
      where: { priceCount: { gte: 20 } },
    }),
    prisma.stockScore.findFirst({
      where: { priceCount: { gte: 20 }, return5d: { not: null } },
      orderBy: { return5d: "desc" },
      select: { symbol: true, name: true, nameZh: true, latestClose: true, return5d: true, recommendationV2: true },
    }),
    prisma.stockScore.findFirst({
      where: { priceCount: { gte: 20 }, return5d: { not: null } },
      orderBy: { return5d: "asc" },
      select: { symbol: true, name: true, nameZh: true, latestClose: true, return5d: true, recommendationV2: true },
    }),
    prisma.stockScore.findFirst({
      where: { tradingAction: "BUY_NOW", priceCount: { gte: 20 }, adaptiveScore: { gte: 65 } },
      orderBy: { adaptiveScore: "desc" },
      select: { symbol: true, name: true, nameZh: true, adaptiveScore: true, return5d: true },
    }),
  ]);

  const bar = sentimentBar(strongBuyCount, buyCount, holdCount, watchCount, avoidCount);
  const avgScore = (avgAgg._avg.adaptiveScore ?? 0).toFixed(1);

  const gainerLine = topGainer
    ? `📈 涨幅最大（5日）：**${topGainer.nameZh ?? topGainer.name}** \`${topGainer.symbol}\`  ${fmtPrice(topGainer.latestClose)} <font color="info">${fmtReturn(topGainer.return5d)}</font>`
    : "📈 涨幅最大：暂无数据";

  const loserLine = topLoser
    ? `📉 跌幅最大（5日）：**${topLoser.nameZh ?? topLoser.name}** \`${topLoser.symbol}\`  ${fmtPrice(topLoser.latestClose)} <font color="red">${fmtReturn(topLoser.return5d)}</font>`
    : "📉 跌幅最大：暂无数据";

  const buyNowLine = topBuyNow
    ? `🎯 AI推荐：**${topBuyNow.nameZh ?? topBuyNow.name}** \`${topBuyNow.symbol}\`（评分 ${topBuyNow.adaptiveScore?.toFixed(1) ?? "—"}）`
    : "";

  const md = [
    `## 📊 TOHOSHOU AI 收盘总结`,
    `**${dateStr}（${dow}）**`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `### 评级分布（共 ${totalCount} 只）`,
    `🔴 STRONG BUY：**${strongBuyCount}只**　🟢 BUY：**${buyCount}只**　⚪ HOLD：**${holdCount}只**`,
    `🟡 WATCH：**${watchCount}只**　⚫ AVOID：**${avoidCount}只**`,
    ``,
    `市场情绪：${bar}`,
    `平均AI评分：**${avgScore}**`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    gainerLine,
    loserLine,
    ...(buyNowLine ? [``, buyNowLine] : []),
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `_注：涨跌幅基于5日收益率（日内数据次日更新）_`,
  ].join("\n");

  if (DRY_RUN) {
    console.log("[wecom:market-close] DRY RUN 预览:");
    console.log(md);
  } else if (!isAibotConfigured()) {
    console.log("[wecom:market-close] WECOM_AIBOT_* 未配置，跳过推送。消息内容：");
    console.log(md);
  } else {
    const res = await sendViaWorker(md);
    if (res.ok) {
      console.log("[wecom:market-close] ✅ 推送成功（长连接）");
    } else {
      console.warn("[wecom:market-close] ⚠️ 推送失败（请检查 tohoshou-wecom-aibot 进程）:", res.errmsg);
    }
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[wecom:market-close] 致命错误:", err);
  process.exit(1);
});
