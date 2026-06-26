#!/usr/bin/env npx tsx
/**
 * 全量股票近250个交易日价格同步
 *
 * 策略：
 *   - 新股/全量：最近 400 日历天（覆盖 250+ 交易日）
 *   - 原有重点10只股票：保留历史数据，仅补充缺失的近期数据
 *   - 限速：每只股票间隔 250ms
 *
 * 用法：npm run sync-prices-recent
 * 预计时间（全量3800只）：~16分钟
 * 可用 --limit=100 参数限制只同步前N只（测试用）
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const API_KEY = process.env.JQUANTS_API_KEY!;
const BASE = "https://api.jquants.com/v2";

// --daily: lightweight incremental mode (last 7 days, faster rate limit ~12 min)
// default: full 400-day sync (~27 min, for manual / initial load)
const DAILY_MODE = process.argv.includes("--daily");
const RATE_LIMIT_MS = DAILY_MODE ? 150 : 250;
const DATE_RANGE_DAYS = DAILY_MODE ? 7 : 400;

// 重点10只股票（保留历史，不重新同步全量）
const FOCUS_SYMBOLS = new Set([
  "7203.T","6758.T","9984.T","7974.T","9983.T",
  "6861.T","8306.T","4519.T","9432.T","6902.T",
]);

type Bar = {
  Date: string; Code: string;
  O: number; H: number; L: number; C: number;
  Vo: number; AdjC: number;
};

const FETCH_TIMEOUT_MS = 30_000; // 30s per request — prevents indefinite hangs on J-Quants stalls

async function fetchBars(code5: string, from: string, to: string): Promise<Bar[]> {
  const url = `${BASE}/equities/bars/daily?code=${code5}&dateFrom=${from}&dateTo=${to}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { headers: { "x-api-key": API_KEY }, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${body.slice(0, 100)}`);
  }
  const data = await res.json() as { data: Bar[]; pagination_key?: string };
  let bars = data.data || [];
  let pk = data.pagination_key;
  while (pk) {
    const ac2 = new AbortController();
    const t2 = setTimeout(() => ac2.abort(), FETCH_TIMEOUT_MS);
    let nx: Response;
    try {
      nx = await fetch(`${url}&pagination_key=${encodeURIComponent(pk)}`, {
        headers: { "x-api-key": API_KEY },
        signal: ac2.signal,
      });
    } finally {
      clearTimeout(t2);
    }
    const nd = await nx.json() as { data: Bar[]; pagination_key?: string };
    bars = bars.concat(nd.data || []);
    pk = nd.pagination_key;
  }
  return bars;
}

function symbolToCode5(symbol: string): string {
  return symbol.replace(/\.[A-Z]+$/, "").padEnd(5, "0").slice(0, 5);
  // More correct: "7203.T" → "7203" → "72030"
}

function toCode5(symbol: string): string {
  const base = symbol.replace(/\.[A-Z]+$/, "");
  return base.length === 4 ? base + "0" : base;
}

async function syncPrices(stock: { id: number; symbol: string }, to: string, from: string): Promise<number> {
  const code = toCode5(stock.symbol);
  const bars = await fetchBars(code, from, to);
  // J-Quants sometimes ignores dateFrom and returns full history — filter client-side
  const fromMs = new Date(from).getTime();
  const valid = bars.filter((b) => b.Date && b.C && new Date(b.Date).getTime() >= fromMs);
  if (valid.length === 0) return 0;

  // Batch insert (much faster than individual upserts)
  await prisma.dailyPrice.createMany({
    data: valid.map((b) => ({
      symbol: stock.symbol,
      date: new Date(b.Date),
      open: b.O ?? 0, high: b.H ?? 0, low: b.L ?? 0, close: b.C,
      volume: b.Vo ?? 0, adjClose: b.AdjC ?? null, source: "jquants",
    })),
    skipDuplicates: true,
  });

  // Update Stock.price from latest bar; high52w/low52w from date-filtered window only.
  // Use AdjC (split-adjusted) for high52w/low52w so stock splits don't corrupt 52-week range.
  // price/change/changeRate use raw C (unadjusted) for current-price display.
  const latest = valid[valid.length - 1];
  const prev = valid.length > 1 ? valid[valid.length - 2] : null;
  const change = prev ? latest.C - prev.C : 0;
  const changeRate = prev && prev.C ? (change / prev.C) * 100 : 0;
  const allAdj = valid.map((b) => b.AdjC ?? b.C);

  await prisma.stock.update({
    where: { id: stock.id },
    data: {
      price: latest.C,
      change,
      changeRate,
      high52w: Math.max(...allAdj),
      low52w:  Math.min(...allAdj),
      volume: latest.Vo ?? null,
      lastSyncAt: new Date(),
    },
  });

  return valid.length;
}

async function main() {
  if (!API_KEY) {
    console.error("ERROR: JQUANTS_API_KEY not set");
    process.exit(1);
  }

  // Parse --limit=N argument
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1]) : undefined;

  const startMs = Date.now();
  const to = new Date().toISOString().split("T")[0];
  const from = new Date(Date.now() - DATE_RANGE_DAYS * 86400000).toISOString().split("T")[0];

  const modeLabel = DAILY_MODE ? "[DAILY MODE] 增量同步（最近7天）" : "全量同步（最近400天）";
  console.log(`=== 股票价格同步 — ${modeLabel} ===`);
  console.log(`日期范围：${from} → ${to}`);
  console.log(`限速：${RATE_LIMIT_MS}ms/只\n`);

  let stocks = await prisma.stock.findMany({
    select: { id: true, symbol: true },
    orderBy: { symbol: "asc" },
  });

  if (limit) {
    stocks = stocks.slice(0, limit);
    console.log(`限制同步前 ${limit} 只股票（测试模式）`);
  }

  const totalAttempted = stocks.length;
  console.log(`共 ${totalAttempted} 只股票\n`);
  if (totalAttempted > 100) {
    const est = (totalAttempted * (RATE_LIMIT_MS + 200)) / 1000 / 60;
    console.log(`预计耗时：约 ${est.toFixed(0)} 分钟\n`);
  }

  let ok = 0, skip = 0, err = 0;
  const errs: string[] = [];

  for (let i = 0; i < stocks.length; i++) {
    const stock = stocks[i];
    try {
      const count = await syncPrices(stock, to, from);
      if (count > 0) ok++;
      else skip++;
    } catch (e) {
      err++;
      const msg = e instanceof Error ? e.message : String(e);
      errs.push(`${stock.symbol}: ${msg.slice(0, 80)}`);
      if (err <= 5) console.error(`  ✗ ${stock.symbol}: ${msg.slice(0, 60)}`);
    }

    const pct = Math.round(((i + 1) / stocks.length) * 100);
    if ((i + 1) % 50 === 0 || i === stocks.length - 1) {
      process.stdout.write(`\r[${i + 1}/${stocks.length}] ${pct}%  ✓${ok} ✗${err} ○${skip}  `);
    }

    if (i < stocks.length - 1) {
      await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
    }
  }

  const durationSec = ((Date.now() - startMs) / 1000).toFixed(1);
  console.log(`\n\n=== 同步完成 ===`);
  console.log(`attempted : ${totalAttempted}`);
  console.log(`success   : ${ok}`);
  console.log(`skipped   : ${skip}  (no data returned)`);
  console.log(`failed    : ${err}`);
  console.log(`duration  : ${durationSec}s`);
  if (errs.length > 0 && errs.length <= 20) {
    console.log("\n失败列表：");
    errs.forEach((e) => console.log("  " + e));
  }

  const priceCount = await prisma.dailyPrice.count();
  console.log(`\nDailyPrice 总计: ${priceCount.toLocaleString()} 条`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("CRASH:", e);
  prisma.$disconnect();
  process.exit(1);
});
