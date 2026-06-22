#!/usr/bin/env npx tsx
/**
 * V11: LINE alerts for watchlist stocks
 * Checks realtime risk conditions (RSI, MA20, volume, 52W) for each watchlist stock.
 * Run manually or add to cron at 15:45 JST after market close.
 * Supports DRY_RUN=1 for preview.
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import YahooFinance from "yahoo-finance2";
import { isConfigured } from "../lib/line";
import { pushToAll } from "../lib/line-push";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);
const yf = new YahooFinance();

const DRY_RUN = process.env.DRY_RUN === "1";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

type RiskItem = {
  symbol: string;
  name: string;
  price: number;
  changePct: number | null;
  risks: string[];
};

async function analyzeSymbol(symbol: string, name: string): Promise<RiskItem | null> {
  let price: number | null = null;
  let changePct: number | null = null;
  let volume: number | null = null;
  let week52High: number | null = null;
  let avgVol3m: number | null = null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q: any = await yf.quote(symbol);
    price      = num(q.regularMarketPrice);
    changePct  = num(q.regularMarketChangePercent);
    volume     = num(q.regularMarketVolume);
    week52High = num(q.fiftyTwoWeekHigh);
    avgVol3m   = num(q.averageDailyVolume3Month);
  } catch {
    console.warn(`[watchlist-alerts] Yahoo quote failed for ${symbol}`);
    return null;
  }

  if (price == null) return null;

  // DailyPrice for MA + volume ratio
  const rows = await prisma.dailyPrice.findMany({
    where: { symbol },
    orderBy: { date: "desc" },
    take: 65,
    select: { close: true, adjClose: true, volume: true },
  });

  const prices  = rows.map((r) => r.adjClose ?? r.close).reverse();
  const volumes = rows.map((r) => r.volume).reverse();

  const ma20  = sma(prices, 20);
  const rsi14 = calcRsi14(prices);

  const vol10 = volumes.slice(Math.max(0, volumes.length - 10));
  const avg10dVol = vol10.length > 0 ? vol10.reduce((a, b) => a + b, 0) / vol10.length : avgVol3m;
  const volumeRatio = (volume != null && avg10dVol != null && avg10dVol > 0) ? volume / avg10dVol : null;

  // Risk detection
  const risks: string[] = [];

  if (rsi14 != null) {
    if (rsi14 > 85)      risks.push(`⛔ RSI极度超买 (${rsi14.toFixed(1)})`);
    else if (rsi14 > 75) risks.push(`⚠ RSI过热 (${rsi14.toFixed(1)})`);
  }

  if (ma20 != null && price < ma20) {
    risks.push(`⛔ 跌破MA20 (MA20=¥${ma20.toFixed(0)})`);
  }

  if (week52High != null && week52High > 0 && price >= week52High * 0.98) {
    risks.push(`⚠ 接近52周高位 (高位=¥${week52High.toFixed(0)})`);
  }

  if (volumeRatio != null && volumeRatio > 3) {
    risks.push(`⚠ 量比异常 (${volumeRatio.toFixed(1)}x)`);
  }

  if (risks.length === 0) return null;

  return { symbol, name, price, changePct, risks };
}

async function main() {
  console.log(`[watchlist-alerts] ${DRY_RUN ? "DRY RUN" : "发送模式"} 启动`);

  if (!DRY_RUN && !isConfigured()) {
    console.error("[watchlist-alerts] LINE 未配置");
    process.exit(1);
  }

  // Load watchlist
  const watchlist = await prisma.watchList.findMany({
    orderBy: { addedAt: "desc" },
  });

  if (watchlist.length === 0) {
    console.log("[watchlist-alerts] 自选股为空，退出");
    return;
  }

  console.log(`[watchlist-alerts] 检查 ${watchlist.length} 只自选股...`);

  // Analyze each symbol (sequential to avoid rate-limiting)
  const riskItems: RiskItem[] = [];
  for (const w of watchlist) {
    const result = await analyzeSymbol(w.symbol, w.name);
    if (result) {
      riskItems.push(result);
      console.log(`  ${w.symbol}: ${result.risks.join(" | ")}`);
    } else {
      console.log(`  ${w.symbol}: 无风险`);
    }
    await new Promise((r) => setTimeout(r, 150)); // rate limit
  }

  if (riskItems.length === 0) {
    console.log("[watchlist-alerts] 无风险警报，不发送");
    return;
  }

  // Build LINE message
  const lines = [
    `⚠️ 自选股风险提醒 (${riskItems.length}只)`,
    `${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Tokyo" })} JST`,
    "",
    ...riskItems.map((item) => {
      const chg = item.changePct != null ? ` ${item.changePct >= 0 ? "+" : ""}${item.changePct.toFixed(2)}%` : "";
      return [
        `【${item.name} (${item.symbol})】`,
        `  价格: ¥${item.price.toLocaleString()}${chg}`,
        ...item.risks.map((r) => `  ${r}`),
      ].join("\n");
    }),
  ];

  const message = lines.join("\n");
  console.log("\n=== 消息预览 ===");
  console.log(message);
  console.log("================\n");

  if (!DRY_RUN) {
    const { textMsg } = await import("../lib/line-push");
    const groupIds = await prisma.lineGroup.findMany({
      where: { isActive: true },
      select: { groupId: true },
    }).then((rows) => rows.map((r) => r.groupId));

    const result = await pushToAll([textMsg(message)], groupIds);
    console.log(`[watchlist-alerts] 发送完成: ${JSON.stringify(result)}`);
  } else {
    console.log("[watchlist-alerts] DRY RUN — 未实际发送");
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
