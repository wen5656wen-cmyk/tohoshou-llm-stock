// ── TOHOSHOU AI · AI Top Picks Performance 指标（V1.1 Freeze Validation）─────
// 从每日已实现 1 日收益序列（AiTopPickPerf）派生累计收益 / 胜率 / 最大回撤 / Sharpe /
// 平均持仓收益 / Alpha + 各 cohort（Top5 / STRONG_BUY / BUY / TOPIX）对比 + 周汇总。
// **纯函数 · 只读 · 不接评分 · 实验期算法固定。** 模型：日度再平衡、1 日持有、等权。

const r2 = (v: number) => Math.round(v * 100) / 100;

/** 一日的各 cohort 已实现 1 日收益（%）。 */
export interface DailyPerf {
  date: string;
  fwdDate: string;
  top5Ret: number | null;
  top5WinCount: number;
  top5PickCount: number;
  sbRet: number | null;
  buyRet: number | null;
  topixRet: number | null;
}

/** 单 cohort 的累计统计。 */
export interface CohortStats {
  cumReturn: number | null;   // 复利累计 %
  avgDailyReturn: number | null;
  winRate: number | null;     // 日胜率 %（当日收益 > 0）
  maxDrawdown: number | null; // 最大回撤 %（≤0）
  sharpe: number | null;      // 年化（×√252）
  days: number;               // 有效天数
}

/** 复利累计收益曲线（起点 0）。 */
function equityCurve(rets: number[]): number[] {
  const curve: number[] = [];
  let eq = 1;
  for (const r of rets) { eq *= 1 + r / 100; curve.push((eq - 1) * 100); }
  return curve;
}

function maxDrawdown(rets: number[]): number | null {
  if (!rets.length) return null;
  let eq = 1, peak = 1, mdd = 0;
  for (const r of rets) {
    eq *= 1 + r / 100;
    if (eq > peak) peak = eq;
    const dd = (eq / peak - 1) * 100;
    if (dd < mdd) mdd = dd;
  }
  return r2(mdd);
}

function mean(xs: number[]): number { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }
function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

/** 从一列 1 日收益派生 cohort 统计。 */
export function cohortStats(rets: (number | null)[]): CohortStats {
  const r = rets.filter((x): x is number => x != null);
  if (!r.length) return { cumReturn: null, avgDailyReturn: null, winRate: null, maxDrawdown: null, sharpe: null, days: 0 };
  const curve = equityCurve(r);
  const sd = std(r);
  return {
    cumReturn: r2(curve[curve.length - 1]),
    avgDailyReturn: r2(mean(r)),
    winRate: r2((r.filter((x) => x > 0).length / r.length) * 100),
    maxDrawdown: maxDrawdown(r),
    sharpe: sd > 0 ? r2((mean(r) / sd) * Math.sqrt(252)) : null,
    days: r.length,
  };
}

/** 全量表现汇总（4 cohort 对比 + Alpha）。 */
export interface PerformanceSummary {
  days: number;
  top5: CohortStats;
  strongBuy: CohortStats;
  buy: CohortStats;
  topix: CohortStats;
  top5AlphaVsTopix: number | null;   // Top5 累计 − TOPIX 累计
  top5AlphaVsStrongBuy: number | null;
  top5AlphaVsBuy: number | null;
  pickWinRate: number | null;        // 个股级胜率（所有 Top5 个股 1 日正收益占比）
  todayTop5Ret: number | null;       // 最近一日 Top5 收益
  latestDate: string | null;
}

export function summarize(perf: DailyPerf[]): PerformanceSummary {
  const sorted = [...perf].sort((a, b) => a.date.localeCompare(b.date));
  const top5 = cohortStats(sorted.map((p) => p.top5Ret));
  const strongBuy = cohortStats(sorted.map((p) => p.sbRet));
  const buy = cohortStats(sorted.map((p) => p.buyRet));
  const topix = cohortStats(sorted.map((p) => p.topixRet));
  const diff = (a: number | null, b: number | null) => (a == null || b == null ? null : r2(a - b));
  const totalWin = sorted.reduce((s, p) => s + p.top5WinCount, 0);
  const totalPicks = sorted.reduce((s, p) => s + p.top5PickCount, 0);
  const last = sorted[sorted.length - 1];
  return {
    days: sorted.length,
    top5, strongBuy, buy, topix,
    top5AlphaVsTopix: diff(top5.cumReturn, topix.cumReturn),
    top5AlphaVsStrongBuy: diff(top5.cumReturn, strongBuy.cumReturn),
    top5AlphaVsBuy: diff(top5.cumReturn, buy.cumReturn),
    pickWinRate: totalPicks > 0 ? r2((totalWin / totalPicks) * 100) : null,
    todayTop5Ret: last?.top5Ret ?? null,
    latestDate: last?.date ?? null,
  };
}

/** ISO 周键（yyyy-Www），用 UTC 计算（无 Date.now 依赖）。 */
export function isoWeek(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  const day = (d.getUTCDay() + 6) % 7; // Mon=0
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThu.getTime()) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export interface WeeklyRow {
  week: string;
  days: number;
  top5: CohortStats;
  topix: CohortStats;
  alphaVsTopix: number | null;
  bestPick: { date: string; ret: number } | null;
  worstPick: { date: string; ret: number } | null;
}

/** 按 ISO 周汇总。 */
export function weeklyRollup(perf: DailyPerf[]): WeeklyRow[] {
  const byWeek = new Map<string, DailyPerf[]>();
  for (const p of perf) {
    const w = isoWeek(p.date);
    (byWeek.get(w) ?? byWeek.set(w, []).get(w)!).push(p);
  }
  const out: WeeklyRow[] = [];
  for (const [week, rows] of [...byWeek.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const top5 = cohortStats(rows.map((r) => r.top5Ret));
    const topix = cohortStats(rows.map((r) => r.topixRet));
    const withRet = rows.filter((r) => r.top5Ret != null);
    const best = withRet.length ? withRet.reduce((a, b) => (b.top5Ret! > a.top5Ret! ? b : a)) : null;
    const worst = withRet.length ? withRet.reduce((a, b) => (b.top5Ret! < a.top5Ret! ? b : a)) : null;
    out.push({
      week, days: rows.length, top5, topix,
      alphaVsTopix: top5.cumReturn != null && topix.cumReturn != null ? r2(top5.cumReturn - topix.cumReturn) : null,
      bestPick: best ? { date: best.date, ret: best.top5Ret! } : null,
      worstPick: worst ? { date: worst.date, ret: worst.top5Ret! } : null,
    });
  }
  return out;
}
