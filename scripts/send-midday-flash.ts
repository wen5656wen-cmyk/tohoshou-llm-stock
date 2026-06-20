#!/usr/bin/env npx tsx
/**
 * LINE 午間速報（毎日 12:30 JST）
 *
 * 内容：
 *   1. 本日異動株（前日比±5%以上）
 *   2. MACD 買転換シグナル発生銘柄（TOP3）
 *   3. AI 評分急上昇株（技術面高い銘柄から）
 *
 * 异动株チェック方法：
 *   - StockScore.return5d は直近5日リターン
 *   - ただし DailyPrice の最新1日変化は Stock.changeRate フィールドで取得
 *
 * 用法：
 *   npm run line:midday-flash          # 实际发送
 *   DRY_RUN=1 npm run line:midday-flash # 控制台预览
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

async function buildMoversBlock(): Promise<string> {
  // 急騰株：5日リターン上位（本日の動きの近似値として使用）
  const [surgers, fallers] = await Promise.all([
    prisma.stockScore.findMany({
      where: {
        priceCount: { gte: 20 },
        return5d: { gte: 5 },
        totalScore: { gte: 50 }, // AI評価が一定以上の銘柄のみ
      },
      orderBy: { return5d: "desc" },
      take: 5,
      select: { symbol: true, name: true, nameZh: true, return5d: true, totalScore: true, recommendation: true, latestClose: true },
    }),
    prisma.stockScore.findMany({
      where: {
        priceCount: { gte: 20 },
        return5d: { lte: -5 },
      },
      orderBy: { return5d: "asc" },
      take: 3,
      select: { symbol: true, name: true, nameZh: true, return5d: true, totalScore: true, recommendation: true, latestClose: true },
    }),
  ]);

  const lines: string[] = [];

  if (surgers.length > 0) {
    lines.push(`🚀 急騰株（5日+5%以上・AI注目）`);
    for (const s of surgers) {
      const displayName = (s as any).nameZh || s.name;
      lines.push(`  ${displayName} (${s.symbol.replace(".T", "")}) ${pct(s.return5d)} ${recEmoji(s.recommendation)} ${s.totalScore}点`);
    }
  }

  if (fallers.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(`🔻 急落株（5日-5%以下）`);
    for (const s of fallers) {
      const displayName = (s as any).nameZh || s.name;
      lines.push(`  ${displayName} (${s.symbol.replace(".T", "")}) ${pct(s.return5d)}`);
    }
  }

  return lines.length > 0 ? lines.join("\n") : "";
}

async function buildMacdSignalsBlock(): Promise<string> {
  // MACD 買転換（macdSignalLabel=BUY、且つ技術スコア高い）
  const signals = await prisma.stockScore.findMany({
    where: {
      priceCount: { gte: 20 },
      macdSignalLabel: "BUY",
      technicalScore: { gte: 20 }, // 技術面 20/30 以上
      totalScore: { gte: 55 },
    },
    orderBy: { technicalScore: "desc" },
    take: 3,
    select: { symbol: true, name: true, nameZh: true, technicalScore: true, totalScore: true, recommendation: true, latestClose: true, return5d: true },
  });

  if (signals.length === 0) return "";

  const lines = [`📡 MACD 買転換シグナル`];
  for (const s of signals) {
    const displayName = (s as any).nameZh || s.name;
    lines.push(`  ${displayName} (${s.symbol.replace(".T", "")}) AI${s.totalScore}点 技術${s.technicalScore}/30 ${pct(s.return5d)}`);
  }
  return lines.join("\n");
}

async function buildSentimentBlock(): Promise<string> {
  const [total, hold_plus, avoid] = await Promise.all([
    prisma.stockScore.count({ where: { priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { recommendation: { in: ["STRONG_BUY", "BUY", "HOLD"] }, priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { recommendation: "AVOID", priceCount: { gte: 20 } } }),
  ]);

  if (total === 0) return "";

  const holdRate = Math.round((hold_plus / total) * 100);
  const avoidRate = Math.round((avoid / total) * 100);
  const mood =
    holdRate >= 40 ? "強気相場 🟢" :
    holdRate >= 25 ? "中立 🟡" :
    "弱気相場 🔴";

  return `📊 市場体温 HOLD以上 ${hold_plus}銘柄(${holdRate}%) 回避 ${avoid}銘柄(${avoidRate}%) → ${mood}`;
}

async function main() {
  console.log(`[midday-flash] ${DRY_RUN ? "DRY RUN" : "发送模式"} 启动`);

  if (!DRY_RUN && !isConfigured()) {
    console.error("[midday-flash] LINE 未配置（请检查 .env LINE_CHANNEL_ACCESS_TOKEN）");
    process.exit(1);
  }

  const now = new Date();
  const tokyoDate = new Date(now.getTime() + 9 * 3600000);
  const dateStr = tokyoDate.toISOString().split("T")[0];

  const [moversBlock, macdBlock, sentimentBlock] = await Promise.all([
    buildMoversBlock(),
    buildMacdSignalsBlock(),
    buildSentimentBlock(),
  ]);

  // If no notable movers, skip push
  if (!moversBlock && !macdBlock) {
    console.log("[midday-flash] 本日注目銘柄なし、送信スキップ");
    await prisma.$disconnect();
    return;
  }

  const groupIds = await prisma.lineGroup
    .findMany({ where: { isActive: true }, select: { groupId: true } })
    .then((gs) => gs.map((g) => g.groupId));

  const parts = [
    `⚡ TOHOSHOU AI 午間速報`,
    `📅 ${dateStr} 12:30 JST`,
    `━━━━━━━━━━━━━━━━`,
    moversBlock,
    macdBlock,
    sentimentBlock,
    `━━━━━━━━━━━━━━━━`,
    `🔗 ${APP_URL}/screener`,
  ].filter(Boolean).join("\n\n");

  if (DRY_RUN) {
    console.log("─── 午間速報メッセージ ─────────────────");
    console.log(parts);
    console.log("[midday-flash] DRY RUN 完成");
  } else {
    const result = await pushToAll([textMsg(parts)], groupIds);
    console.log(`[midday-flash] 推送完成：群組 ${result.groups}/${groupIds.length}，broadcast ${result.broadcast ? "成功" : "失敗"}`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[midday-flash] 致命错误:", err);
  process.exit(1);
});
