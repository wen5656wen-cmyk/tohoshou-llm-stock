#!/usr/bin/env npx tsx
/**
 * V11.1: WeChat (企业微信群机器人) risk alerts for watchlist stocks
 *
 * Data sources (no GPT): RealtimeMarket DB cache → Yahoo Finance fallback
 *                        StockScore (AI signal), News (risk), Rule Engine
 * Dedup: AlertLog — same symbol + alertType + "WECHAT" + JST trading day = send once
 *
 * Usage:
 *   npm run wechat:watchlist-alerts              # production send
 *   npm run wechat:watchlist-alerts -- --dry-run # preview only
 *   DRY_RUN=1 npx tsx scripts/send-watchlist-wechat-alerts.ts
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import YahooFinance from "yahoo-finance2";
import { isWebhookConfigured, sendMarkdown } from "../lib/wechat";
import { stockUrl, portfolioUrl } from "../lib/app-url";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);
const yf = new YahooFinance();

const DRY_RUN =
  process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");

// ─── JST trading day ────────────────────────────────────────────────────────

function jstTradingDay(): Date {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 3600 * 1000);
  // Keep only the date portion (UTC midnight = JST 09:00 of that day)
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()));
}

// ─── Indicator helpers ───────────────────────────────────────────────────────

function num(v: unknown): number | null {
  if (typeof v === "number" && !isNaN(v) && isFinite(v)) return v;
  return null;
}

function sma(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const slice = prices.slice(prices.length - period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function calcRsi14(prices: number[]): number | null {
  const period = 14;
  if (prices.length < period + 1) return null;
  const tail = prices.slice(prices.length - period - 1);
  let gains = 0, losses = 0;
  for (let i = 1; i < tail.length; i++) {
    const diff = tail[i] - tail[i - 1];
    if (diff > 0) gains += diff; else losses += -diff;
  }
  if (losses === 0) return 100;
  return 100 - 100 / (1 + gains / period / (losses / period));
}

// ─── Realtime data with DB-cache fallback ────────────────────────────────────

type RealtimeSnapshot = {
  price: number | null;
  changePct: number | null;
  volume: number | null;
  volumeRatio: number | null;
  rsi14: number | null;
  ma20: number | null;
  week52High: number | null;
  week52Low: number | null;
  fromCache: boolean;
};

async function getRealtimeSnapshot(symbol: string): Promise<RealtimeSnapshot> {
  // Use DB cache if updated within last 3 hours
  const cached = await prisma.realtimeMarket.findUnique({ where: { symbol } });
  const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
  if (cached && cached.updatedAt > threeHoursAgo) {
    return {
      price: cached.price,
      changePct: cached.changePct,
      volume: cached.volume,
      volumeRatio: cached.volumeRatio,
      rsi14: cached.rsi14,
      ma20: cached.ma20,
      week52High: cached.week52High,
      week52Low: cached.week52Low,
      fromCache: true,
    };
  }

  // Fetch fresh from Yahoo Finance
  let price: number | null = null;
  let changePct: number | null = null;
  let volume: number | null = null;
  let week52High: number | null = null;
  let week52Low: number | null = null;
  let sharesOut: number | null = null;
  let avgVol3m: number | null = null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q: any = await yf.quote(symbol);
    price      = num(q.regularMarketPrice);
    changePct  = num(q.regularMarketChangePercent);
    volume     = num(q.regularMarketVolume);
    week52High = num(q.fiftyTwoWeekHigh);
    week52Low  = num(q.fiftyTwoWeekLow);
    sharesOut  = num(q.sharesOutstanding);
    avgVol3m   = num(q.averageDailyVolume3Month);
  } catch {
    // Yahoo fetch failed — use StockScore fallback
    const ss = await prisma.stockScore.findUnique({
      where: { symbol },
      select: { latestClose: true, rsi14: true },
    });
    return {
      price: ss?.latestClose ?? null,
      changePct: null,
      volume: null,
      volumeRatio: null,
      rsi14: ss?.rsi14 ?? null,
      ma20: null,
      week52High: null,
      week52Low: null,
      fromCache: false,
    };
  }

  // DailyPrice for MA + volume ratio
  const rows = await prisma.dailyPrice.findMany({
    where: { symbol },
    orderBy: { date: "desc" },
    take: 65,
    select: { close: true, adjClose: true, volume: true },
  });

  const priceArr  = rows.map((r) => r.adjClose ?? r.close).reverse();
  const volumeArr = rows.map((r) => r.volume).reverse();

  const ma5  = sma(priceArr, 5);
  const ma20 = sma(priceArr, 20);
  const ma60 = sma(priceArr, 60);
  const rsi14 = calcRsi14(priceArr);

  const vol10 = volumeArr.slice(Math.max(0, volumeArr.length - 10));
  const avg10d = vol10.length > 0 ? vol10.reduce((a, b) => a + b, 0) / vol10.length : avgVol3m;
  const volumeRatio = (volume != null && avg10d != null && avg10d > 0) ? volume / avg10d : null;
  const turnoverRate = (volume != null && sharesOut != null && sharesOut > 0) ? (volume / sharesOut) * 100 : null;

  // Update DB cache
  const data = {
    price, changePct, volume, volumeRatio,
    turnoverRate, marketCap: null, rsi14, ma5, ma20, ma60, week52High, week52Low,
  };
  await prisma.realtimeMarket.upsert({
    where: { symbol },
    update: data,
    create: { symbol, ...data },
  }).catch(() => { /* best-effort */ });

  return { price, changePct, volume, volumeRatio, rsi14, ma20, week52High, week52Low, fromCache: false };
}

// ─── Alert types ─────────────────────────────────────────────────────────────

type AlertLevel = "danger" | "warn" | "info";

type Alert = {
  type: string;      // matches AlertLog.alertType
  level: AlertLevel;
  emoji: string;
  label: string;     // zh-CN display
  value: string | null;
};

function computeAlerts(rt: RealtimeSnapshot, tradingAction: string | null): Alert[] {
  const alerts: Alert[] = [];

  const rsi = rt.rsi14;
  if (rsi != null) {
    if (rsi > 85)       alerts.push({ type: "RSI_EXTREME", level: "danger", emoji: "⛔", label: "RSI极度超买",    value: rsi.toFixed(1) });
    else if (rsi > 75)  alerts.push({ type: "RSI_HIGH",    level: "warn",   emoji: "⚠️",  label: "RSI过热",       value: rsi.toFixed(1) });
  }

  const price = rt.price;
  const ma20  = rt.ma20;
  if (price != null && ma20 != null && price < ma20) {
    alerts.push({ type: "BELOW_MA20", level: "danger", emoji: "⛔", label: "跌破MA20", value: `MA20=¥${Math.round(ma20).toLocaleString()}` });
  }

  const w52h = rt.week52High;
  if (price != null && w52h != null && w52h > 0 && price >= w52h * 0.98) {
    alerts.push({ type: "NEAR_52W_HIGH", level: "warn", emoji: "⚠️", label: "接近52周高位", value: `高位=¥${Math.round(w52h).toLocaleString()}` });
  }

  const vr = rt.volumeRatio;
  if (vr != null && vr > 3) {
    alerts.push({ type: "VOL_SPIKE", level: "warn", emoji: "⚠️", label: "量比异常", value: `${vr.toFixed(1)}x` });
  }

  if (tradingAction === "BUY_NOW") {
    alerts.push({ type: "AI_BUY_SIGNAL", level: "info", emoji: "🟢", label: "AI立即买入信号", value: null });
  }

  return alerts;
}

// ─── AlertLog dedup ──────────────────────────────────────────────────────────

async function filterNewAlerts(
  symbol: string,
  alerts: Alert[],
  tradingDay: Date
): Promise<Alert[]> {
  if (alerts.length === 0) return [];

  const existing = await prisma.alertLog.findMany({
    where: {
      symbol,
      channel: "WECHAT",
      tradingDay,
      alertType: { in: alerts.map((a) => a.type) },
    },
    select: { alertType: true },
  });

  const sentTypes = new Set(existing.map((e) => e.alertType));
  return alerts.filter((a) => !sentTypes.has(a.type));
}

async function recordAlerts(
  symbol: string,
  alerts: Alert[],
  tradingDay: Date
): Promise<void> {
  for (const a of alerts) {
    await prisma.alertLog.upsert({
      where: { symbol_alertType_channel_tradingDay: { symbol, alertType: a.type, channel: "WECHAT", tradingDay } },
      update: { value: a.value, sentAt: new Date() },
      create: { symbol, alertType: a.type, channel: "WECHAT", tradingDay, value: a.value },
    }).catch(() => { /* ignore duplicate race */ });
  }
}

// ─── WeChat Markdown formatter ───────────────────────────────────────────────

type StockAlertBlock = {
  symbol: string;
  name: string;
  nameZh: string | null;
  price: number | null;
  changePct: number | null;
  alerts: Alert[];
};

function fmtChange(pct: number | null): string {
  if (pct == null) return "";
  const sign  = pct >= 0 ? "+" : "";
  const color = pct >= 0 ? "green" : "red";
  return ` <font color="${color}">${sign}${pct.toFixed(2)}%</font>`;
}

function fmtAlertLine(a: Alert): string {
  const val = a.value ? ` (${a.value})` : "";
  const color = a.level === "danger" ? "red" : a.level === "warn" ? "warning" : "green";
  return `> <font color="${color}">${a.emoji} ${a.label}${val}</font>`;
}

function buildMarkdown(blocks: StockAlertBlock[], tradingDay: Date): string {
  const jstTimeStr = new Date(tradingDay.getTime() + 9 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);

  const dangerCount = blocks.filter((b) => b.alerts.some((a) => a.level === "danger")).length;
  const warnCount   = blocks.filter((b) => b.alerts.some((a) => a.level === "warn" && !b.alerts.some((x) => x.level === "danger"))).length;
  const infoCount   = blocks.filter((b) => b.alerts.every((a) => a.level === "info")).length;

  const summaryParts: string[] = [];
  if (dangerCount > 0) summaryParts.push(`<font color="red">高风险 ${dangerCount}只</font>`);
  if (warnCount   > 0) summaryParts.push(`<font color="warning">注意 ${warnCount}只</font>`);
  if (infoCount   > 0) summaryParts.push(`<font color="green">机会 ${infoCount}只</font>`);

  const lines: string[] = [
    `# ⚠️ 自选股提醒 — TOHOSHOU AI`,
    `> 检测日期：**${jstTimeStr}** (JST) · 共 **${blocks.length}** 只 · ${summaryParts.join(" / ")}`,
    "",
  ];

  // Group by level priority: danger first, then warn, then info
  const sorted = [...blocks].sort((a, b) => {
    const lvl = (bl: StockAlertBlock) => bl.alerts.some((x) => x.level === "danger") ? 0 : bl.alerts.some((x) => x.level === "warn") ? 1 : 2;
    return lvl(a) - lvl(b);
  });

  for (const block of sorted) {
    const displayName = block.nameZh || block.name;
    const priceStr    = block.price != null ? `¥${block.price.toLocaleString()}` : "—";
    const changeStr   = fmtChange(block.changePct);
    const topLevel    = block.alerts[0].level;
    const headerColor = topLevel === "danger" ? "red" : topLevel === "warn" ? "warning" : "green";

    lines.push(`**<font color="${headerColor}">【${displayName} (${block.symbol})】</font>**`);
    lines.push(`> 价格：${priceStr}${changeStr}`);
    for (const a of block.alerts) {
      lines.push(fmtAlertLine(a));
    }
    lines.push(`> [→ 查看详情](${stockUrl(block.symbol)})`);
    lines.push("");
  }

  lines.push("---");
  lines.push(`[📊 我的自选股](${portfolioUrl()})`);

  return lines.join("\n");
}

// ─── News risk check ─────────────────────────────────────────────────────────

async function hasNegativeNewsToday(symbol: string, tradingDay: Date): Promise<boolean> {
  const dayStart = tradingDay; // already UTC midnight = JST 09:00
  const dayEnd   = new Date(dayStart.getTime() + 24 * 3600 * 1000);

  const count = await prisma.news.count({
    where: {
      publishedAt: { gte: dayStart, lt: dayEnd },
      sentiment: "NEGATIVE",
      relatedSymbolConfidence: { gte: 70 },
      stock: { symbol },
    },
  });
  return count > 0;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[wechat-alerts] ${DRY_RUN ? "─ DRY RUN ─" : "发送模式"} 启动`);

  if (!DRY_RUN && !isWebhookConfigured()) {
    console.error("[wechat-alerts] WECHAT_WORK_WEBHOOK_URL 未配置，退出");
    process.exit(1);
  }

  const tradingDay = jstTradingDay();
  console.log(`[wechat-alerts] 交易日: ${tradingDay.toISOString().slice(0, 10)}`);

  // Load watchlist
  const watchlist = await prisma.watchList.findMany({
    orderBy: { addedAt: "desc" },
  });
  if (watchlist.length === 0) {
    console.log("[wechat-alerts] 自选股为空，退出");
    return;
  }
  console.log(`[wechat-alerts] 检查 ${watchlist.length} 只自选股...`);

  // Load StockScore for all watchlist symbols (AI action + nameZh)
  const symbols = watchlist.map((w) => w.symbol);
  const [scoreRows, stockRows] = await Promise.all([
    prisma.stockScore.findMany({
      where: { symbol: { in: symbols } },
      select: { symbol: true, tradingAction: true, adaptiveScore: true, recommendationV2: true },
    }),
    prisma.stock.findMany({
      where: { symbol: { in: symbols } },
      select: { symbol: true, nameZh: true },
    }),
  ]);
  const scoreMap = new Map(scoreRows.map((s) => [s.symbol, s]));
  const stockMap = new Map(stockRows.map((s) => [s.symbol, s.nameZh]));

  // Analyze each symbol
  const alertBlocks: StockAlertBlock[] = [];

  for (const w of watchlist) {
    const rt = await getRealtimeSnapshot(w.symbol);
    const ss = scoreMap.get(w.symbol) ?? null;

    // Compute risk alerts
    let alerts = computeAlerts(rt, ss?.tradingAction ?? null);

    // News risk
    const hasNewsRisk = await hasNegativeNewsToday(w.symbol, tradingDay);
    if (hasNewsRisk) {
      alerts.push({ type: "NEWS_RISK", level: "warn", emoji: "📰", label: "负面新闻风险", value: null });
    }

    if (alerts.length === 0) {
      console.log(`  ${w.symbol}: 无新提醒`);
      await new Promise((r) => setTimeout(r, 100));
      continue;
    }

    // Dedup — filter already-sent alerts
    const newAlerts = await filterNewAlerts(w.symbol, alerts, tradingDay);

    if (newAlerts.length === 0) {
      console.log(`  ${w.symbol}: ${alerts.length}个提醒今日已推送，跳过`);
      await new Promise((r) => setTimeout(r, 100));
      continue;
    }

    const displayAlertList = newAlerts.map((a) => `${a.emoji}${a.label}${a.value ? `(${a.value})` : ""}`).join(" | ");
    console.log(`  ${w.symbol}: ${displayAlertList}`);

    alertBlocks.push({
      symbol: w.symbol,
      name: w.name,
      nameZh: stockMap.get(w.symbol) ?? null,
      price: rt.price,
      changePct: rt.changePct,
      alerts: newAlerts,
    });

    await new Promise((r) => setTimeout(r, 150)); // rate limit
  }

  if (alertBlocks.length === 0) {
    console.log("[wechat-alerts] 无新提醒需要推送");
    return;
  }

  // Build and send WeChat Markdown
  const markdown = buildMarkdown(alertBlocks, tradingDay);
  console.log("\n=== WeChat 消息预览 ===");
  console.log(markdown);
  console.log("======================\n");

  if (!DRY_RUN) {
    const result = await sendMarkdown(markdown);
    if (result.ok) {
      console.log("[wechat-alerts] ✅ 推送成功");
      // Record AlertLog for all sent alerts
      for (const block of alertBlocks) {
        await recordAlerts(block.symbol, block.alerts, tradingDay);
      }
      console.log(`[wechat-alerts] ✅ AlertLog 已记录 (${alertBlocks.reduce((n, b) => n + b.alerts.length, 0)} 条)`);
    } else {
      console.error(`[wechat-alerts] ❌ 推送失败: ${result.errmsg}`);
      process.exit(1);
    }
  } else {
    console.log("[wechat-alerts] DRY RUN — 未实际推送，AlertLog 未写入");
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
