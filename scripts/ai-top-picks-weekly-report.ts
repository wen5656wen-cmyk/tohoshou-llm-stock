#!/usr/bin/env npx tsx
/**
 * AI Top Picks Weekly Report — V1.1 Freeze Validation.
 *
 * 每周（金曜）从 AiTopPickPerf + AiTopPick + AiTopPickFilter 汇总周报：累计收益 / Alpha /
 * Sharpe / Win Rate / Max Drawdown / Best·Worst Pick / Rejected Summary / Filter Effectiveness，
 * 写 reports/ai-top-picks-weekly-<week>.json。**只读派生 · 实验期算法固定 · 不改任何生产。**
 *
 * Usage:  npm run ai-top-picks-weekly
 */
import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { summarize, weeklyRollup, isoWeek, type DailyPerf } from "../lib/ai-top-picks/performance";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const ymd = (d: Date) => d.toISOString().slice(0, 10);

async function main() {
  console.log("=== AI Top Picks Weekly Report (V1.1 Validation) ===");
  const perfRows = await prisma.aiTopPickPerf.findMany({ orderBy: { date: "asc" } });
  const perf: DailyPerf[] = perfRows.map((r) => ({
    date: ymd(r.date), fwdDate: ymd(r.fwdDate), top5Ret: r.top5Ret, top5WinCount: r.top5WinCount,
    top5PickCount: r.top5PickCount, sbRet: r.sbRet, buyRet: r.buyRet, topixRet: r.topixRet,
  }));

  const summary = summarize(perf);
  const weekly = weeklyRollup(perf);
  const currentWeek = weekly[weekly.length - 1] ?? null;

  // Filter Effectiveness（近 7 日过滤统计累计）
  const filters = await prisma.aiTopPickFilter.findMany({ orderBy: { date: "desc" }, take: 7 });
  const filterAgg = filters.reduce((a, f) => ({
    candidates: a.candidates + f.candidates, newsReject: a.newsReject + f.newsReject,
    liquidityReject: a.liquidityReject + f.liquidityReject, momentumPenalty: a.momentumPenalty + f.momentumPenalty,
    finalPicks: a.finalPicks + f.finalPicks,
  }), { candidates: 0, newsReject: 0, liquidityReject: 0, momentumPenalty: 0, finalPicks: 0 });

  const report = {
    generatedAt: new Date().toISOString(),
    validationDays: summary.days,
    currentWeek: currentWeek?.week ?? isoWeek(perf[perf.length - 1]?.date ?? "2026-07-08"),
    cumulative: {
      top5: summary.top5, strongBuy: summary.strongBuy, buy: summary.buy, topix: summary.topix,
      alphaVsTopix: summary.top5AlphaVsTopix, alphaVsStrongBuy: summary.top5AlphaVsStrongBuy, alphaVsBuy: summary.top5AlphaVsBuy,
      pickWinRate: summary.pickWinRate,
    },
    thisWeek: currentWeek,
    weekly,
    filterEffectiveness7d: filterAgg,
  };

  console.log(`验证天数 ${summary.days} · Top5累计 ${summary.top5.cumReturn ?? "—"}% · Alpha(vsTOPIX) ${summary.top5AlphaVsTopix ?? "—"}% · Sharpe ${summary.top5.sharpe ?? "—"} · 胜率 ${summary.top5.winRate ?? "—"}% · MDD ${summary.top5.maxDrawdown ?? "—"}%`);
  console.log(`本周 ${report.currentWeek}: Top5 ${currentWeek?.top5.cumReturn ?? "—"}% vs TOPIX ${currentWeek?.topix.cumReturn ?? "—"}%`);
  console.log(`Filter 7d: 候选 ${filterAgg.candidates} · News拒 ${filterAgg.newsReject} · 流动性拒 ${filterAgg.liquidityReject} · 动量罚 ${filterAgg.momentumPenalty} · Final ${filterAgg.finalPicks}`);

  const dir = path.join(process.cwd(), "reports");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `ai-top-picks-weekly-${report.currentWeek}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(`✓ 写入 ${file}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
