#!/usr/bin/env npx tsx
/**
 * AI Top Picks Daily Performance — V1.1 Freeze Validation.
 *
 * 对每个已有 Top5 cohort 的交易日 D（且存在下一交易日 D+1 的收盘价），计算各 cohort
 * 已实现 1 日收益（日度再平衡、等权）：Top5 / STRONG_BUY / BUY / TOPIX，upsert AiTopPickPerf。
 * 累计/胜率/回撤/Sharpe 由 API 从整段序列派生。
 * **只读派生 · 实验期算法固定 · 不修改任何评分/推荐/Top Picks 生成。**
 *
 * Usage:  npm run ai-top-picks-perf        DRY_RUN=1 npm run ai-top-picks-perf
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const DRY_RUN = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

async function main() {
  console.log(`=== AI Top Picks Daily Perf (V1.1 Validation) ${DRY_RUN ? "(DRY RUN)" : ""} ===`);

  // 交易日历（近 60 个 DailyPrice 日期）→ D → D+1 映射
  const dpDates = await prisma.dailyPrice.findMany({ distinct: ["date"], select: { date: true }, orderBy: { date: "desc" }, take: 60 });
  const dates = dpDates.map((r) => ymd(r.date)).sort();
  const nextOf = new Map<string, string>();
  for (let i = 0; i < dates.length - 1; i++) nextOf.set(dates[i], dates[i + 1]);

  // 有 Top5 cohort 的交易日
  const cohortDays = await prisma.aiTopPick.findMany({ distinct: ["date"], select: { date: true }, orderBy: { date: "asc" } });

  let written = 0, skipped = 0;
  for (const cd of cohortDays) {
    const D = ymd(cd.date);
    const D1 = nextOf.get(D);
    if (!D1) { console.log(`  ${D}: 无下一交易日收盘 → 待实现，跳过`); skipped++; continue; }

    const dDate = new Date(`${D}T00:00:00.000Z`);
    const d1Date = new Date(`${D1}T00:00:00.000Z`);

    // cohort 成分
    const top5 = await prisma.aiTopPick.findMany({ where: { date: dDate }, select: { symbol: true } });
    const drs = await prisma.dailyRecommendation.findMany({ where: { date: dDate, recommendation: { in: ["STRONG_BUY", "BUY"] } }, select: { symbol: true, recommendation: true } });
    const sbSyms = drs.filter((r) => r.recommendation === "STRONG_BUY").map((r) => r.symbol);
    const buySyms = drs.filter((r) => r.recommendation === "BUY").map((r) => r.symbol);
    const allSyms = [...new Set([...top5.map((t) => t.symbol), ...sbSyms, ...buySyms])];

    // 两日收盘
    const px = await prisma.dailyPrice.findMany({ where: { symbol: { in: allSyms }, date: { in: [dDate, d1Date] } }, select: { symbol: true, date: true, close: true } });
    const c0 = new Map<string, number>(), c1 = new Map<string, number>();
    for (const p of px) { if (p.close == null) continue; (ymd(p.date) === D ? c0 : c1).set(p.symbol, p.close); }
    const ret1d = (sym: string): number | null => {
      const a = c0.get(sym), b = c1.get(sym);
      return a != null && b != null && a > 0 ? (b / a - 1) * 100 : null;
    };
    const cohortRet = (syms: string[]) => {
      const rs = syms.map(ret1d).filter((x): x is number => x != null);
      return { ret: mean(rs), count: rs.length, wins: rs.filter((x) => x > 0).length };
    };

    const t = cohortRet(top5.map((x) => x.symbol));
    const sb = cohortRet(sbSyms);
    const bu = cohortRet(buySyms);

    // TOPIX（断点后连续，1 日）
    const gm = await prisma.globalMarket.findMany({ where: { date: { in: [dDate, d1Date] }, topix: { not: null } }, select: { date: true, topix: true } });
    const tp0 = gm.find((g) => ymd(g.date) === D)?.topix ?? null;
    const tp1 = gm.find((g) => ymd(g.date) === D1)?.topix ?? null;
    const topixRet = tp0 != null && tp1 != null && tp0 > 0 && D >= "2026-03-30" ? (tp1 / tp0 - 1) * 100 : null;

    const round = (v: number | null) => (v == null ? null : Math.round(v * 100) / 100);
    console.log(`  ${D}→${D1}: Top5 ${round(t.ret)}%(${t.wins}/${t.count}) · SB ${round(sb.ret)}%(${sb.count}) · BUY ${round(bu.ret)}%(${bu.count}) · TOPIX ${round(topixRet)}%`);

    if (!DRY_RUN) {
      await prisma.aiTopPickPerf.upsert({
        where: { date: dDate },
        create: { date: dDate, fwdDate: d1Date, top5Ret: round(t.ret), top5WinCount: t.wins, top5PickCount: t.count, sbRet: round(sb.ret), sbCount: sb.count, buyRet: round(bu.ret), buyCount: bu.count, topixRet: round(topixRet) },
        update: { fwdDate: d1Date, top5Ret: round(t.ret), top5WinCount: t.wins, top5PickCount: t.count, sbRet: round(sb.ret), sbCount: sb.count, buyRet: round(bu.ret), buyCount: bu.count, topixRet: round(topixRet) },
      });
      written++;
    }
  }
  console.log(`=== Done · 写入 ${written} · 待实现 ${skipped} ${DRY_RUN ? "(DRY)" : ""} ===`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
