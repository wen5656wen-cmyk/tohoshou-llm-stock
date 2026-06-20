#!/usr/bin/env npx tsx
/**
 * LINE 大引け後まとめ（毎日 15:45 JST，大引け15分後）
 *
 * 内容：
 *   1. 本日の市場総括（AI評点分布 / 平均スコア変動）
 *   2. 本日の推薦銘柄パフォーマンス（HOLD以上 TOP3の5日リターン）
 *   3. 翌日注目候補（RSI が 40-50 で底打ちサイン）
 *   4. 翌日の気になるイベント（決算スケジュールはDB未実装のため省略）
 *
 * 用法：
 *   npm run line:closing-summary         # 実際送信
 *   DRY_RUN=1 npm run line:closing-summary # プレビュー
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { isConfigured } from "../lib/line";
import { pushToAll, textMsg } from "../lib/line-push";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

const DRY_RUN = process.env.DRY_RUN === "1";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://aitohoshou.com";

function pct(v: number | null | undefined): string {
  if (v == null) return "—";
  return (v >= 0 ? "▲" : "▼") + Math.abs(v).toFixed(1) + "%";
}

function recEmoji(r: string | null | undefined): string {
  return { STRONG_BUY: "🔥", BUY: "✅", HOLD: "⏸", WATCH: "👀", AVOID: "❌" }[r ?? ""] ?? "";
}

async function buildMarketSummaryBlock(): Promise<string> {
  const [total, strongBuy, buy, hold, watch, avoid, avgAgg] = await Promise.all([
    prisma.stockScore.count({ where: { priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { recommendation: "STRONG_BUY", priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { recommendation: "BUY", priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { recommendation: "HOLD", priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { recommendation: "WATCH", priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { recommendation: "AVOID", priceCount: { gte: 20 } } }),
    prisma.stockScore.aggregate({ _avg: { totalScore: true }, where: { priceCount: { gte: 20 } } }),
  ]);

  if (total === 0) return "";

  const avgScore = Math.round(avgAgg._avg.totalScore ?? 0);
  const bullCount = strongBuy + buy;
  const bullRate = Math.round((bullCount / total) * 100);
  const holdPlusRate = Math.round(((bullCount + hold) / total) * 100);

  const mood =
    bullRate >= 20 ? "強気 🟢🟢" :
    holdPlusRate >= 40 ? "中立 🟡" :
    "弱気 🔴🔴";

  const scoreBar = "█".repeat(Math.round(avgScore / 10)) + "░".repeat(10 - Math.round(avgScore / 10));

  return [
    `📊 本日市場総括`,
    `評価対象 ${total}銘柄 | 平均 ${avgScore}点 [${scoreBar}]`,
    `💚 買推薦 ${bullCount}(${bullRate}%) | 📗 HOLD ${hold} | 🟡 WATCH ${watch} | ❌ 回避 ${avoid}`,
    `市場判定：${mood}`,
  ].join("\n");
}

async function buildTopPerformersBlock(): Promise<string> {
  const tops = await prisma.stockScore.findMany({
    where: {
      priceCount: { gte: 20 },
      recommendation: { in: ["STRONG_BUY", "BUY", "HOLD"] },
      totalScore: { gte: 65 },
    },
    orderBy: { totalScore: "desc" },
    take: 5,
    select: {
      symbol: true, name: true, nameZh: true,
      totalScore: true, recommendation: true,
      return5d: true, return20d: true, latestClose: true,
    },
  });

  if (tops.length === 0) return "";

  const lines = [`🏆 AI推薦銘柄パフォーマンス`];
  for (let i = 0; i < tops.length; i++) {
    const t = tops[i];
    const displayName = (t as any).nameZh || t.name;
    lines.push(
      `${i + 1}. ${displayName} (${t.symbol.replace(".T", "")}) ${recEmoji(t.recommendation)}`,
      `   AI ${t.totalScore}点  5日 ${pct(t.return5d)}  20日 ${pct(t.return20d)}`
    );
  }
  return lines.join("\n");
}

async function buildBottomFishingBlock(): Promise<string> {
  // 底打ちサイン候補：RSI 35-50 で AI評価がそれなり（fundamentalScore高い）
  const candidates = await prisma.stockScore.findMany({
    where: {
      priceCount: { gte: 20 },
      rsi14: { gte: 35, lte: 52 },
      fundamentalScore: { gte: 18 }, // 基本面 18/25 以上
      totalScore: { gte: 55 },
      return5d: { lte: -1 }, // 直近5日で調整中
    },
    orderBy: { fundamentalScore: "desc" },
    take: 3,
    select: { symbol: true, name: true, nameZh: true, rsi14: true, fundamentalScore: true, totalScore: true, return5d: true, latestClose: true },
  });

  if (candidates.length === 0) return "";

  const lines = [`🎣 翌日注目候補（底打ちサイン）`];
  for (const c of candidates) {
    const displayName = (c as any).nameZh || c.name;
    lines.push(
      `  ${displayName} (${c.symbol.replace(".T", "")}) RSI=${c.rsi14?.toFixed(0)} 基本${c.fundamentalScore}/25 AI${c.totalScore}点 ${pct(c.return5d)}`
    );
  }
  return lines.join("\n");
}

async function buildNewsHighlightBlock(): Promise<string> {
  // 直近のポジティブニュース（重要度高い）
  const news = await prisma.news.findMany({
    where: {
      sentiment: "POSITIVE",
      importance: { gte: 3 },
      publishedAt: { gte: new Date(Date.now() - 24 * 3600000) },
    },
    orderBy: [{ importance: "desc" }, { publishedAt: "desc" }],
    take: 3,
    select: { title: true, sentiment: true },
  });

  if (news.length === 0) return "";

  const lines = [`📰 本日注目ニュース`];
  for (const n of news) {
    lines.push(`  🟢 ${n.title.slice(0, 55)}`);
  }
  return lines.join("\n");
}

async function main() {
  console.log(`[closing-summary] ${DRY_RUN ? "DRY RUN" : "发送模式"} 启动`);

  if (!DRY_RUN && !isConfigured()) {
    console.error("[closing-summary] LINE 未配置（请检查 .env LINE_CHANNEL_ACCESS_TOKEN）");
    process.exit(1);
  }

  const now = new Date();
  const tokyoDate = new Date(now.getTime() + 9 * 3600000);
  const dateStr = tokyoDate.toISOString().split("T")[0];
  const dow = ["日", "月", "火", "水", "木", "金", "土"][tokyoDate.getUTCDay()];

  const [summaryBlock, performersBlock, fishingBlock, newsBlock] = await Promise.all([
    buildMarketSummaryBlock(),
    buildTopPerformersBlock(),
    buildBottomFishingBlock(),
    buildNewsHighlightBlock(),
  ]);

  const groupIds = await prisma.lineGroup
    .findMany({ where: { isActive: true }, select: { groupId: true } })
    .then((gs) => gs.map((g) => g.groupId));

  const parts = [
    `🔔 TOHOSHOU AI 大引けまとめ`,
    `📅 ${dateStr}（${dow}曜日）| 大引後`,
    `━━━━━━━━━━━━━━━━`,
    summaryBlock,
    performersBlock ? `━━━━━━━━━━━━━━━━\n${performersBlock}` : null,
    fishingBlock ? `━━━━━━━━━━━━━━━━\n${fishingBlock}` : null,
    newsBlock ? `━━━━━━━━━━━━━━━━\n${newsBlock}` : null,
    `━━━━━━━━━━━━━━━━`,
    `🔗 詳細：${APP_URL}/ai-picks`,
  ].filter(Boolean).join("\n\n");

  if (DRY_RUN) {
    console.log("─── 大引けまとめ ───────────────────────");
    console.log(parts);
    console.log("[closing-summary] DRY RUN 完成");
  } else {
    const result = await pushToAll([textMsg(parts)], groupIds);
    console.log(`[closing-summary] 推送完成：群組 ${result.groups}/${groupIds.length}，broadcast ${result.broadcast ? "成功" : "失敗"}`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[closing-summary] 致命错误:", err);
  process.exit(1);
});
