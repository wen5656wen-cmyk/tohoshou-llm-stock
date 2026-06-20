#!/usr/bin/env npx tsx
/**
 * TOHOSHOU AI LINE 日报广播
 *
 * 每天 08:30 JST 向所有 LINE 关注用户推送
 *
 * 内容：
 *   1. 今日 AI 推荐 TOP10
 *   2. 市场情绪（评分分布）
 *   3. 风险预警股票（RSI过热 / 急跌）
 *   4. 最新新闻头条
 *
 * 使用方法：
 *   npm run send-daily-line          // 实际发送
 *   npm run send-daily-line:dry      // DRY_RUN（仅控制台输出）
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { isConfigured } from "../lib/line";
import { pushToAll, textMsg } from "../lib/line-push";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

const DRY_RUN = process.env.DRY_RUN === "1";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

function pct(v: number | null | undefined): string {
  if (v == null) return "—";
  return (v >= 0 ? "▲" : "▼") + Math.abs(v).toFixed(1) + "%";
}

function starsOf(score: number): string {
  const s = score >= 90 ? 5 : score >= 80 ? 4 : score >= 65 ? 3 : score >= 50 ? 2 : 1;
  return "★".repeat(s) + "☆".repeat(5 - s);
}

function recEmoji(r: string | null): string {
  const map: Record<string, string> = {
    STRONG_BUY: "🔥", BUY: "✅", WATCH: "👀", HOLD: "⏸", AVOID: "❌",
  };
  return map[r ?? ""] ?? "";
}

function upProb(total: number, tech: number): number {
  return Math.min(92, Math.max(20, Math.round(total * 0.7 * 0.88 + tech * 0.3 * 0.88)));
}

// ── 1. TOP10 ───────────────────────────────────────────────────────────────

async function buildTop10Block(): Promise<string> {
  const scores = await prisma.stockScore.findMany({
    where: { priceCount: { gte: 20 } },
    orderBy: { totalScore: "desc" },
    take: 10,
    select: {
      symbol: true, name: true, nameZh: true,
      totalScore: true, technicalScore: true,
      recommendation: true, return20d: true, return5d: true,
    },
  });

  if (scores.length === 0) {
    return "⚠️ 暂无评分数据（请运行 npm run compute-scores）";
  }

  const medals = ["🥇", "🥈", "🥉"];
  const lines = [`🇯🇵 TOHOSHOU AI 今日推荐 TOP10`, ``];

  for (let i = 0; i < scores.length; i++) {
    const s = scores[i];
    const total = s.totalScore ?? 0;
    const tech  = s.technicalScore ?? 0;
    const prob  = upProb(total, tech);
    const prefix = medals[i] ?? `${i + 1}.`;

    if (i < 3) {
      lines.push(
        `${prefix} ${(s as any).nameZh || s.name} (${s.symbol.replace(".T", "")})`,
        `   AI评分 ${total}分 ${starsOf(total)} ${recEmoji(s.recommendation)}`,
        `   上涨概率 ${prob}%  20日 ${pct(s.return20d)}`,
        ``
      );
    } else {
      lines.push(
        `${i + 1}. ${(s as any).nameZh || s.name} (${s.symbol.replace(".T", "")}) ${total}分 ${recEmoji(s.recommendation)} 上涨概率${prob}%`
      );
    }
  }

  return lines.join("\n");
}

// ── 2. Market Sentiment ────────────────────────────────────────────────────

async function buildSentimentBlock(): Promise<string> {
  const [total, buy, watch, avoid, avg] = await Promise.all([
    prisma.stockScore.count({ where: { priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { recommendation: { in: ["STRONG_BUY", "BUY"] }, priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { recommendation: "WATCH", priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { recommendation: "AVOID", priceCount: { gte: 20 } } }),
    prisma.stockScore.aggregate({ _avg: { totalScore: true }, where: { priceCount: { gte: 20 } } }),
  ]);

  if (total === 0) return "";

  const buyRate  = ((buy / total) * 100).toFixed(0);
  const avgScore = Math.round(avg._avg.totalScore ?? 0);
  const sentiment =
    Number(buyRate) >= 50 ? "多头市场 🟢" :
    Number(buyRate) >= 30 ? "中性整理 🟡" :
    "空头市场 🔴";

  return [
    `📊 市场情绪`,
    `━━━━━━━━━━━━━━━━`,
    `评估股票数：${total}只`,
    `平均AI评分：${avgScore}分`,
    `买入推荐：${buy}只 (${buyRate}%) → ${sentiment}`,
    `关注：${watch}只  回避：${avoid}只`,
  ].join("\n");
}

// ── 3. Risk Alerts ─────────────────────────────────────────────────────────

async function buildRiskBlock(): Promise<string> {
  const [overbought, crashed] = await Promise.all([
    prisma.stockScore.findMany({
      where: { rsi14: { gte: 75 }, priceCount: { gte: 20 } },
      orderBy: { rsi14: "desc" },
      take: 5,
      select: { symbol: true, name: true, rsi14: true, return5d: true },
    }),
    prisma.stockScore.findMany({
      where: { return5d: { lte: -5 }, priceCount: { gte: 20 } },
      orderBy: { return5d: "asc" },
      take: 5,
      select: { symbol: true, name: true, return5d: true, rsi14: true },
    }),
  ]);

  if (overbought.length === 0 && crashed.length === 0) return "";

  const lines = [`⚠️ 风险预警股票`, `━━━━━━━━━━━━━━━━`];

  if (overbought.length > 0) {
    lines.push(`🔴 RSI超买（${overbought.length}只）`);
    for (const s of overbought) {
      lines.push(`  ${s.name} RSI=${s.rsi14?.toFixed(0)} 5日${pct(s.return5d)}`);
    }
  }

  if (crashed.length > 0) {
    if (overbought.length > 0) lines.push(``);
    lines.push(`🔻 急跌预警（${crashed.length}只）`);
    for (const s of crashed) {
      lines.push(`  ${s.name} 5日${pct(s.return5d)} RSI=${s.rsi14?.toFixed(0) ?? "—"}`);
    }
  }

  return lines.join("\n");
}

// ── 4. News ────────────────────────────────────────────────────────────────

async function buildNewsBlock(): Promise<string> {
  const news = await prisma.news.findMany({
    orderBy: { publishedAt: "desc" },
    take: 5,
    select: { title: true, source: true, sentiment: true },
  });

  if (news.length === 0) return "";

  const sentEmoji = (s: string | null) =>
    s === "POSITIVE" ? "🟢" : s === "NEGATIVE" ? "🔴" : "⚪";

  const lines = [`📰 最新新闻头条`];
  for (const n of news) {
    lines.push(`${sentEmoji(n.sentiment)} ${n.title.slice(0, 60)}`);
  }
  return lines.join("\n");
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[send-daily-line] ${DRY_RUN ? "DRY RUN" : "发送模式"} 启动`);

  if (!DRY_RUN && !isConfigured()) {
    console.error("[send-daily-line] LINE 未配置（请检查 .env）");
    process.exit(1);
  }

  const now = new Date();
  const tokyoDate = new Date(now.getTime() + 9 * 3600000);
  const dateStr = tokyoDate.toISOString().split("T")[0];
  const dow = ["日", "一", "二", "三", "四", "五", "六"][tokyoDate.getUTCDay()];

  const [top10, sentiment, risk, newsBlock, groupIds] = await Promise.all([
    buildTop10Block(),
    buildSentimentBlock(),
    buildRiskBlock(),
    buildNewsBlock(),
    prisma.lineGroup
      .findMany({ where: { isActive: true }, select: { groupId: true } })
      .then((gs) => gs.map((g) => g.groupId)),
  ]);

  const msg1 = [
    `🤖 TOHOSHOU AI 日报`,
    `📅 ${dateStr}（周${dow}）`,
    `━━━━━━━━━━━━━━━━`,
    ``,
    top10,
    ``,
    `🔗 完整排行：${APP_URL}/ai-picks`,
  ].filter(Boolean).join("\n");

  const parts2: string[] = [sentiment, risk, newsBlock].filter(Boolean);
  const msg2 = parts2.length > 0
    ? parts2.join("\n\n") + `\n\n🔗 ${APP_URL}`
    : null;

  if (DRY_RUN) {
    console.log("─── 消息1 ─────────────────────────────");
    console.log(msg1);
    if (msg2) {
      console.log("─── 消息2 ─────────────────────────────");
      console.log(msg2);
    }
    console.log("[send-daily-line] DRY RUN 完成");
  } else {
    const messages = [textMsg(msg1), ...(msg2 ? [textMsg(msg2)] : [])];
    const result = await pushToAll(messages, groupIds);
    console.log(`[send-daily-line] 推送完成：${messages.length}条，群组 ${result.groups}/${groupIds.length}，广播 ${result.broadcast ? "成功" : "失败"}`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[send-daily-line] 致命错误:", err);
  process.exit(1);
});
