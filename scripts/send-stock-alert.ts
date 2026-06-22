#!/usr/bin/env npx tsx
/**
 * 企业微信股票预警（盘中每15分钟，工作日 09:00-15:30 JST）
 * 触发条件：跌破MA20 / 突破前高 / AI评分买入信号 / RSI超买
 * AlertLog 去重：同日同股票同类型只发一次（channel=WECOM）
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { sendMarkdown, isConfigured } from "../lib/notify/wecom";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

const DRY_RUN = process.env.DRY_RUN === "1";
const CHANNEL = "WECOM";

interface AlertItem {
  symbol: string;
  name: string;
  alertType: string;
  alertLabel: string;
  price: number | null;
  returnPct: number | null;
  value: string;
  reason: string;
  aiSuggestion: string;
}

function fmtReturn(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

function fmtPrice(v: number | null | undefined): string {
  if (v == null) return "—";
  return `¥${v.toLocaleString("ja-JP")}`;
}

function jstTradingDay(): Date {
  const now = new Date();
  const jstMs = now.getTime() + 9 * 3600000;
  const jst = new Date(jstMs);
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()));
}

async function filterNew(
  candidates: AlertItem[],
  tradingDay: Date
): Promise<AlertItem[]> {
  if (candidates.length === 0) return [];
  const existing = await prisma.alertLog.findMany({
    where: {
      tradingDay,
      channel: CHANNEL,
      symbol: { in: candidates.map((c) => c.symbol) },
      alertType: { in: candidates.map((c) => c.alertType) },
    },
    select: { symbol: true, alertType: true },
  });
  const sent = new Set(existing.map((e) => `${e.symbol}|${e.alertType}`));
  return candidates.filter((c) => !sent.has(`${c.symbol}|${c.alertType}`));
}

async function recordAlerts(items: AlertItem[], tradingDay: Date) {
  await prisma.alertLog.createMany({
    data: items.map((a) => ({
      symbol: a.symbol,
      alertType: a.alertType,
      channel: CHANNEL,
      tradingDay,
      value: a.value,
    })),
    skipDuplicates: true,
  });
}

async function gatherAlerts(): Promise<AlertItem[]> {
  const alerts: AlertItem[] = [];

  // 1. AI买入信号：tradingAction = BUY_NOW（高分股）
  const buyNow = await prisma.stockScore.findMany({
    where: {
      tradingAction: "BUY_NOW",
      priceCount: { gte: 20 },
      adaptiveScore: { gte: 65 },
    },
    orderBy: { adaptiveScore: "desc" },
    take: 10,
    select: {
      symbol: true, name: true, nameZh: true,
      latestClose: true, adaptiveScore: true, return5d: true, rsi14: true,
    },
  });
  for (const s of buyNow) {
    alerts.push({
      symbol: s.symbol,
      name: s.nameZh ?? s.name,
      alertType: "AI_BUY_SIGNAL",
      alertLabel: "🎯 AI买入信号",
      price: s.latestClose,
      returnPct: s.return5d,
      value: String(s.adaptiveScore?.toFixed(1) ?? ""),
      reason: `AI综合评分 ${s.adaptiveScore?.toFixed(1) ?? "—"}，交易动作 BUY NOW`,
      aiSuggestion: "可关注入场机会，注意风控",
    });
  }

  // 2. 跌破均线：maTrend DEAD/BEARISH + tradingAction SELL + return5d < -5%
  const maBreak = await prisma.stockScore.findMany({
    where: {
      maTrend: { in: ["DEAD", "BEARISH"] },
      tradingAction: { in: ["SELL", "AVOID"] },
      return5d: { lte: -5 },
      priceCount: { gte: 20 },
      adaptiveScore: { gte: 30 },
    },
    orderBy: { return5d: "asc" },
    take: 8,
    select: {
      symbol: true, name: true, nameZh: true,
      latestClose: true, return5d: true, maTrend: true, tradingAction: true,
    },
  });
  for (const s of maBreak) {
    alerts.push({
      symbol: s.symbol,
      name: s.nameZh ?? s.name,
      alertType: "BELOW_MA20",
      alertLabel: "📉 跌破均线",
      price: s.latestClose,
      returnPct: s.return5d,
      value: String(s.return5d?.toFixed(1) ?? ""),
      reason: `均线形态 ${s.maTrend}，5日跌幅 ${fmtReturn(s.return5d)}`,
      aiSuggestion: "建议减仓或回避",
    });
  }

  // 3. RSI超买：rsi14 > 83 且有BUY/STRONG_BUY评级（警示获利了结）
  const rsiHigh = await prisma.stockScore.findMany({
    where: {
      rsi14: { gte: 83 },
      recommendationV2: { in: ["STRONG_BUY", "BUY"] },
      priceCount: { gte: 20 },
    },
    orderBy: { rsi14: "desc" },
    take: 6,
    select: {
      symbol: true, name: true, nameZh: true,
      latestClose: true, rsi14: true, return5d: true,
    },
  });
  for (const s of rsiHigh) {
    const alertType = (s.rsi14 ?? 0) >= 90 ? "RSI_EXTREME" : "RSI_HIGH";
    alerts.push({
      symbol: s.symbol,
      name: s.nameZh ?? s.name,
      alertType,
      alertLabel: alertType === "RSI_EXTREME" ? "🔴 RSI极度超买" : "🟡 RSI超买",
      price: s.latestClose,
      returnPct: s.return5d,
      value: String(s.rsi14?.toFixed(1) ?? ""),
      reason: `RSI14 = ${s.rsi14?.toFixed(1) ?? "—"}，技术面过热`,
      aiSuggestion: "可考虑获利了结，等待回调",
    });
  }

  // 4. 突破前高：price >= high52w * 0.98（Stock表，批量拉取后JS过滤）
  const allStocks = await prisma.stock.findMany({
    where: { high52w: { gt: 0 }, price: { gt: 0 } },
    select: { symbol: true, name: true, nameZh: true, price: true, high52w: true },
  });
  const nearHigh = allStocks.filter(
    (s) => s.high52w != null && s.price >= s.high52w * 0.98
  );
  // Only alert on stocks that also have a decent StockScore
  if (nearHigh.length > 0) {
    const symbolSet = new Set(nearHigh.map((s) => s.symbol));
    const scores = await prisma.stockScore.findMany({
      where: {
        symbol: { in: [...symbolSet] },
        recommendationV2: { in: ["STRONG_BUY", "BUY", "HOLD"] },
        priceCount: { gte: 20 },
      },
      select: { symbol: true, return5d: true, adaptiveScore: true },
    });
    const scoreMap = new Map(scores.map((s) => [s.symbol, s]));
    for (const s of nearHigh.slice(0, 8)) {
      const sc = scoreMap.get(s.symbol);
      if (!sc) continue;
      const pct = s.high52w ? ((s.price / s.high52w - 1) * 100).toFixed(1) : "—";
      alerts.push({
        symbol: s.symbol,
        name: s.nameZh ?? s.name,
        alertType: "NEAR_52W_HIGH",
        alertLabel: "🚀 突破/逼近前高",
        price: s.price,
        returnPct: sc.return5d,
        value: pct,
        reason: `距52周高点仅 ${pct}%，创新高信号`,
        aiSuggestion: "可跟踪突破，注意量能确认",
      });
    }
  }

  return alerts;
}

function buildMarkdown(items: AlertItem[]): string {
  const lines: string[] = [
    `## ⚠️ TOHOSHOU AI 股票预警`,
    `共 **${items.length}** 条新预警`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
  ];

  for (const a of items) {
    lines.push(
      `### ${a.alertLabel}  \`${a.symbol}\``,
      `**${a.name}**`,
      `价格：${fmtPrice(a.price)} | 5日：${fmtReturn(a.returnPct)}`,
      `触发：${a.reason}`,
      `AI建议：<font color="comment">${a.aiSuggestion}</font>`,
      ``,
    );
  }

  lines.push(`_${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Tokyo" })} JST_`);
  return lines.join("\n");
}

async function main() {
  console.log(`[wecom:stock-alert] ${DRY_RUN ? "DRY RUN" : "发送模式"} 启动`);

  if (!DRY_RUN && !isConfigured()) {
    console.error("[wecom:stock-alert] WECOM_WEBHOOK_URL 未配置，退出");
    process.exit(1);
  }

  const tradingDay = jstTradingDay();
  const allAlerts = await gatherAlerts();
  const newAlerts = DRY_RUN ? allAlerts : await filterNew(allAlerts, tradingDay);

  console.log(`[wecom:stock-alert] 候选 ${allAlerts.length} 条，去重后 ${newAlerts.length} 条新预警`);

  if (newAlerts.length === 0) {
    console.log("[wecom:stock-alert] 无新预警，退出");
    await prisma.$disconnect();
    return;
  }

  const md = buildMarkdown(newAlerts);

  if (DRY_RUN) {
    console.log("[wecom:stock-alert] DRY RUN 预览:");
    console.log(md);
  } else {
    const res = await sendMarkdown(md);
    if (res.ok) {
      console.log("[wecom:stock-alert] ✅ 推送成功");
      await recordAlerts(newAlerts, tradingDay);
    } else {
      console.error("[wecom:stock-alert] ❌ 推送失败:", res.errmsg);
      process.exit(1);
    }
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[wecom:stock-alert] 致命错误:", err);
  process.exit(1);
});
