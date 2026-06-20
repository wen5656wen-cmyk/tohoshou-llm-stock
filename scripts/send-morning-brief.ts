#!/usr/bin/env npx tsx
/**
 * LINE 开场前早报（毎日 08:00 JST，开盘前30分钟）
 *
 * 内容：
 *   1. 全球市场动向（昨夜 NASDAQ/VIX/日元）
 *   2. STRONG_BUY / BUY 重点推荐 TOP5
 *   3. 今日注意股票（RSI>75 超买警戒）
 *
 * 用法：
 *   npm run line:morning-brief         # 实际发送
 *   DRY_RUN=1 npm run line:morning-brief # 控制台预览
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

async function buildGlobalBlock(): Promise<string> {
  const gm = await prisma.globalMarket.findFirst({
    orderBy: { date: "desc" },
    select: { date: true, nasdaqChange: true, vix: true, usdjpy: true, nikkeiChange: true, score: true },
  });

  if (!gm) return "";

  const dateStr = gm.date.toISOString().split("T")[0];
  const nasdaq = gm.nasdaqChange != null
    ? (gm.nasdaqChange >= 0 ? "▲" : "▼") + Math.abs(gm.nasdaqChange).toFixed(2) + "%"
    : "—";
  const nikkei = gm.nikkeiChange != null
    ? (gm.nikkeiChange >= 0 ? "▲" : "▼") + Math.abs(gm.nikkeiChange).toFixed(2) + "%"
    : "—";
  const vixStr = gm.vix != null ? gm.vix.toFixed(1) : "—";
  const usdStr = gm.usdjpy != null ? gm.usdjpy.toFixed(2) : "—";
  const scoreBar = "█".repeat(gm.score ?? 5) + "░".repeat(10 - (gm.score ?? 5));

  const moodLabel =
    (gm.score ?? 5) >= 8 ? "好転 🟢" :
    (gm.score ?? 5) >= 6 ? "中立 🟡" :
    "軟弱 🔴";

  return [
    `🌏 昨夜グローバル市場（${dateStr}）`,
    `NASDAQ ${nasdaq}  VIX ${vixStr}`,
    `日経 ${nikkei}  USD/JPY ${usdStr}`,
    `市場スコア ${gm.score ?? "—"}/10 [${scoreBar}] ${moodLabel}`,
  ].join("\n");
}

async function buildTopPicksBlock(): Promise<string> {
  // Strong buy first, then buy, ordered by score
  const picks = await prisma.stockScore.findMany({
    where: {
      priceCount: { gte: 20 },
      recommendation: { in: ["STRONG_BUY", "BUY", "HOLD"] },
      totalScore: { gte: 65 },
    },
    orderBy: [{ totalScore: "desc" }],
    take: 5,
    select: {
      symbol: true, name: true, nameZh: true,
      totalScore: true, technicalScore: true, fundamentalScore: true,
      moneyFlowScore: true, newsSentimentScore: true, globalTrendScore: true,
      recommendation: true,
      return5d: true, return20d: true, latestClose: true,
      summaryReason: true,
    },
  });

  if (picks.length === 0) {
    return "⚠️ 本日 HOLD以上推薦なし（市場が軟弱な可能性）";
  }

  const lines = [`🎯 TOHOSHOU AI 今日重点推荐 TOP${picks.length}`];

  for (let i = 0; i < picks.length; i++) {
    const p = picks[i];
    const displayName = (p as any).nameZh || p.name;
    const sym = p.symbol.replace(".T", "");
    const score = p.totalScore ?? 0;
    lines.push(
      ``,
      `${i + 1}. ${displayName} (${sym}) ${recEmoji(p.recommendation)}`,
      `   AI評分 ${score}分  現価 ¥${p.latestClose?.toLocaleString() ?? "—"}`,
      `   5日 ${pct(p.return5d)}  20日 ${pct(p.return20d)}`,
    );
    // Show short summary if available
    if (p.summaryReason) {
      const summary = p.summaryReason.replace(/\[.*?\]/g, "").trim();
      if (summary.length > 0) {
        lines.push(`   💡 ${summary.slice(0, 60)}`);
      }
    }
  }

  return lines.join("\n");
}

async function buildCautionBlock(): Promise<string> {
  const overbought = await prisma.stockScore.findMany({
    where: {
      priceCount: { gte: 20 },
      rsi14: { gte: 75 },
      totalScore: { gte: 50 }, // only stocks worth watching
    },
    orderBy: { rsi14: "desc" },
    take: 3,
    select: { symbol: true, name: true, nameZh: true, rsi14: true, return5d: true },
  });

  if (overbought.length === 0) return "";

  const lines = [`⚡ 超買注意（RSI≥75）`];
  for (const s of overbought) {
    const displayName = (s as any).nameZh || s.name;
    lines.push(`  ${displayName} (${s.symbol.replace(".T", "")}) RSI=${s.rsi14?.toFixed(0)} 5日${pct(s.return5d)}`);
  }
  return lines.join("\n");
}

async function main() {
  console.log(`[morning-brief] ${DRY_RUN ? "DRY RUN" : "发送模式"} 启动`);

  if (!DRY_RUN && !isConfigured()) {
    console.error("[morning-brief] LINE 未配置（请检查 .env LINE_CHANNEL_ACCESS_TOKEN）");
    process.exit(1);
  }

  const now = new Date();
  const tokyoDate = new Date(now.getTime() + 9 * 3600000);
  const dateStr = tokyoDate.toISOString().split("T")[0];
  const dow = ["日", "月", "火", "水", "木", "金", "土"][tokyoDate.getUTCDay()];

  const [globalBlock, picksBlock, cautionBlock] = await Promise.all([
    buildGlobalBlock(),
    buildTopPicksBlock(),
    buildCautionBlock(),
  ]);

  const groupIds = await prisma.lineGroup
    .findMany({ where: { isActive: true }, select: { groupId: true } })
    .then((gs) => gs.map((g) => g.groupId));

  const sections = [
    `📈 TOHOSHOU AI 朝報`,
    `📅 ${dateStr}（${dow}曜日）| 開場 09:00`,
    `━━━━━━━━━━━━━━━━`,
    globalBlock,
    `━━━━━━━━━━━━━━━━`,
    picksBlock,
    cautionBlock ? `━━━━━━━━━━━━━━━━\n${cautionBlock}` : null,
    `━━━━━━━━━━━━━━━━`,
    `🔗 詳細：${APP_URL}/ai-picks`,
  ].filter(Boolean).join("\n\n");

  if (DRY_RUN) {
    console.log("─── 朝報メッセージ ─────────────────────");
    console.log(sections);
    console.log("[morning-brief] DRY RUN 完成");
  } else {
    const result = await pushToAll([textMsg(sections)], groupIds);
    console.log(`[morning-brief] 推送完成：群組 ${result.groups}/${groupIds.length}，broadcast ${result.broadcast ? "成功" : "失敗"}`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[morning-brief] 致命错误:", err);
  process.exit(1);
});
