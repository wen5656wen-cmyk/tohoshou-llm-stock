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
import { getJPXTradingDayStatus } from "../lib/trading-calendar/jpx";

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

  // ⚠️ 日期口径（勿改，2026-07-21 核实）：本任务 05:30 JST 运行，此刻 UTC 仍是前一日历日，
  // 故 `todayStr`(UTC) 恰好等于「上一个日历日」，而 ^N225 / 1306.T 此刻的最新收盘正是该日的
  // 收盘 → row(date=D) 装的就是 D 当天的 JP 收盘，语义正确。
  //
  // 但原实现**没有交易日守卫**：周末/假日照样建行，Yahoo 返回的仍是上一交易日收盘 →
  // 产生纯重复的假日历行（实测 2026-07-18/19/20 三行与 07-17 完全相同，nikkeiChange 均为
  // 07-17 的 −4.03%）。这些行会：①稀释 MarketRegime 的 MA 窗口 ②让 `findFirst(latest)`
  // 返回休市日 → 顶栏「市场状态」as-of 显示休市日 ③被 compute-scores 当作最新背景读取。
  // 修：D 非 JPX 交易日 → 直接跳过，不写行。
  const todayStr = new Date().toISOString().split("T")[0];
  const tradingStatus = getJPXTradingDayStatus(new Date(`${todayStr}T03:00:00.000Z`)); // 该日 12:00 JST
  if (!tradingStatus.isTradingDay) {
    console.log(`⏭  ${todayStr} 非 JPX 交易日（${tradingStatus.reason}）→ 跳过写入（避免重复的假日历行）`);
    await prisma.$disconnect();
    return;
  }

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
