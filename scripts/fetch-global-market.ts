#!/usr/bin/env npx tsx
/**
 * V3: 全球市场数据抓取
 *
 * 数据源: Yahoo Finance (^IXIC NASDAQ / ^VIX / JPY=X / ^N225 Nikkei / ^TOPX TOPIX)
 * 写入: GlobalMarket 表
 * 评分: 0-10 → 用于 globalTrendScore 维度
 *
 * 用法: npm run fetch-global-market
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import YahooFinance from "yahoo-finance2";

const yf = new YahooFinance({ suppressNotices: ["ripHistorical", "yahooSurvey"] });
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ── Score functions ────────────────────────────────────────────────────────

function nasdaqToScore(chg: number | null): { pts: number; note: string } {
  if (chg === null) return { pts: 1.5, note: "NASDAQ: N/A" };
  if (chg > 1.5)  return { pts: 3,   note: `NASDAQ +${chg.toFixed(2)}%：科技股强势` };
  if (chg > 0.5)  return { pts: 2.5, note: `NASDAQ +${chg.toFixed(2)}%：科技股偏强` };
  if (chg > 0)    return { pts: 2,   note: `NASDAQ +${chg.toFixed(2)}%：科技股温和上涨` };
  if (chg > -0.5) return { pts: 1.5, note: `NASDAQ ${chg.toFixed(2)}%：科技股横盘` };
  if (chg > -1.5) return { pts: 0.5, note: `NASDAQ ${chg.toFixed(2)}%：科技股下跌` };
  return { pts: 0, note: `NASDAQ ${chg.toFixed(2)}%：科技股大跌` };
}

function vixToScore(vix: number | null): { pts: number; note: string } {
  if (vix === null) return { pts: 1.5, note: "VIX: N/A" };
  if (vix < 12) return { pts: 3,   note: `VIX ${vix.toFixed(1)}：恐慌极低，风险偏好强` };
  if (vix < 15) return { pts: 2.5, note: `VIX ${vix.toFixed(1)}：市场平静` };
  if (vix < 18) return { pts: 2,   note: `VIX ${vix.toFixed(1)}：波动适中` };
  if (vix < 22) return { pts: 1.5, note: `VIX ${vix.toFixed(1)}：偏高，市场有不安情绪` };
  if (vix < 28) return { pts: 0.5, note: `VIX ${vix.toFixed(1)}：高波动，风险规避` };
  return { pts: 0, note: `VIX ${vix.toFixed(1)}：极度恐慌` };
}

function usdJpyToScore(usdjpy: number | null): { pts: number; note: string } {
  if (usdjpy === null) return { pts: 1, note: "USDJPY: N/A" };
  const u = usdjpy;
  if (u >= 145 && u <= 155) return { pts: 2,   note: `美元/日元 ${u.toFixed(1)}：适度贬值，利好出口` };
  if (u >= 140 && u < 145)  return { pts: 1.5, note: `美元/日元 ${u.toFixed(1)}：温和偏弱` };
  if (u > 155 && u <= 160)  return { pts: 1.5, note: `美元/日元 ${u.toFixed(1)}：偏弱，关注干预` };
  if (u > 160)              return { pts: 0.5, note: `美元/日元 ${u.toFixed(1)}：过度贬值，干预风险高` };
  return { pts: 0.5, note: `美元/日元 ${u.toFixed(1)}：日元偏强，出口压力` };
}

function nikkeiToScore(chg: number | null): { pts: number; note: string } {
  if (chg === null) return { pts: 1, note: "日经: N/A" };
  if (chg > 1)    return { pts: 2,   note: `日经 +${chg.toFixed(2)}%：本土市场强势` };
  if (chg > 0)    return { pts: 1.5, note: `日经 +${chg.toFixed(2)}%：本土市场偏强` };
  if (chg > -0.5) return { pts: 1,   note: `日经 ${chg.toFixed(2)}%：本土市场横盘` };
  if (chg > -1.5) return { pts: 0.5, note: `日经 ${chg.toFixed(2)}%：本土市场下跌` };
  return { pts: 0, note: `日经 ${chg.toFixed(2)}%：本土市场大跌` };
}

function computeScore(
  nasdaqChg: number | null, vix: number | null,
  usdjpy: number | null, nikkeiChg: number | null
): { score: number; breakdown: string } {
  const n = nasdaqToScore(nasdaqChg);
  const v = vixToScore(vix);
  const u = usdJpyToScore(usdjpy);
  const k = nikkeiToScore(nikkeiChg);
  const raw = n.pts + v.pts + u.pts + k.pts;
  const score = Math.min(10, Math.max(0, Math.round(raw)));
  return {
    score,
    breakdown: `${n.note}；${v.note}；${u.note}；${k.note}`,
  };
}

// ── Fetch one symbol's last 2 closes ──────────────────────────────────────

async function fetchSymbol(sym: string): Promise<{ level: number | null; change: number | null }> {
  try {
    const from = new Date(Date.now() - 7 * 86400000); // 7 days back to catch weekends
    const to = new Date();
    const hist = await yf.historical(sym, { period1: from, period2: to, interval: "1d" });
    if (hist.length >= 2) {
      const latest = hist[hist.length - 1];
      const prev   = hist[hist.length - 2];
      const change = prev.close ? ((latest.close - prev.close) / prev.close) * 100 : null;
      return { level: latest.close, change };
    }
    if (hist.length === 1) return { level: hist[0].close, change: null };
    return { level: null, change: null };
  } catch {
    return { level: null, change: null };
  }
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== V3 全球市场数据抓取 ===\n");

  const todayStr = new Date().toISOString().split("T")[0];

  console.log("正在抓取...");
  const [nasdaq, usdjpy, nikkei, topix] = await Promise.all([
    fetchSymbol("^IXIC"),
    fetchSymbol("JPY=X"),
    fetchSymbol("^N225"),
    fetchSymbol("1306.T"),   // Nomura TOPIX ETF — historical available; ^TOPIX is spot-only on some regions
  ]);

  // VIX: use quote() for real-time spot price — historical() can return null close on some dates
  let vixLevel: number | null = null;
  try {
    const vixQuote = await yf.quote("^VIX");
    vixLevel = vixQuote?.regularMarketPrice ?? null;
  } catch {
    // fallback to historical if quote fails
    const vixHist = await fetchSymbol("^VIX");
    vixLevel = vixHist.level;
  }
  const vix = { level: vixLevel, change: null as number | null };

  console.log(`  NASDAQ  : ${nasdaq.level?.toFixed(2) ?? "N/A"} (${nasdaq.change != null ? (nasdaq.change >= 0 ? "+" : "") + nasdaq.change.toFixed(2) + "%" : "N/A"})`);
  console.log(`  VIX     : ${vix.level?.toFixed(2) ?? "N/A"} (real-time quote)`);
  console.log(`  USD/JPY : ${usdjpy.level?.toFixed(2) ?? "N/A"}`);
  console.log(`  Nikkei  : ${nikkei.level?.toFixed(2) ?? "N/A"} (${nikkei.change != null ? (nikkei.change >= 0 ? "+" : "") + nikkei.change.toFixed(2) + "%" : "N/A"})`);
  console.log(`  TOPIX   : ${topix.level?.toFixed(2) ?? "N/A"} (${topix.change != null ? (topix.change >= 0 ? "+" : "") + topix.change.toFixed(2) + "%" : "N/A"})`);

  const { score, breakdown } = computeScore(nasdaq.change, vix.level, usdjpy.level, nikkei.change);
  console.log(`\n全球趋势评分: ${score}/10`);
  console.log(`评分依据: ${breakdown}`);

  const record = await prisma.globalMarket.upsert({
    where: { date: new Date(todayStr) },
    create: {
      date:          new Date(todayStr),
      nasdaq:        nasdaq.level,
      nasdaqChange:  nasdaq.change,
      vix:           vix.level,
      nikkei:        nikkei.level,
      nikkeiChange:  nikkei.change,
      topix:         topix.level ?? null,
      topixChange:   topix.change ?? null,
      usdjpy:        usdjpy.level,
      score,
      source:        "yahoo",
    },
    update: {
      nasdaq:        nasdaq.level,
      nasdaqChange:  nasdaq.change,
      vix:           vix.level,
      nikkei:        nikkei.level,
      nikkeiChange:  nikkei.change,
      topix:         topix.level ?? null,
      topixChange:   topix.change ?? null,
      usdjpy:        usdjpy.level,
      score,
      source:        "yahoo",
    },
    select: { id: true, date: true, score: true },
  });

  console.log(`\n✓ DB写入: date=${record.date.toISOString().split("T")[0]}, score=${record.score}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("CRASH:", e);
  prisma.$disconnect().finally(() => process.exit(1));
});
