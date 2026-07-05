// ── TOHOSHOU AI · Institution Flow Parser（P6-T4）───────────────────────────
// 统一从现有 InstitutionalFlow 构建「投资部门 → 周度净额序列」（跨市场汇总）。
// **只读纯函数，不改任何数据、不落库、不接评分。** 禁止页面自行计算。

import type { InstitutionalFlowLike } from "./types";

/** 一个周度数据点（净额 億円，正=買越 / 负=売越）。 */
export interface WeekPoint {
  week: string; // 週末金曜 YYYY-MM-DD
  net: number;
}

export function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** 日期 → 周 key（取日历日 YYYY-MM-DD，UTC 稳定）。 */
export function weekKey(d: Date | string): string {
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toISOString().slice(0, 10);
}

export interface SeriesOptions {
  market?: string; // "ALL"（默认，跨 3 市场汇总）或 TSEPrime/TSEStandard/TSEGrowth
}

/**
 * 构建某投资部门的周度净额序列（按周汇总跨市场 netAmount），按周升序。
 * netAmount 全缺 → 空序列（上层据此判 N/A）。
 */
export function buildSeries(
  flows: InstitutionalFlowLike[],
  investorType: string,
  opts: SeriesOptions = {},
): WeekPoint[] {
  const wantMarket = opts.market && opts.market !== "ALL" ? opts.market : null;
  const byWeek = new Map<string, number>();
  for (const f of flows) {
    if (f.investorType !== investorType) continue;
    if (wantMarket && (f.market ?? "") !== wantMarket) continue;
    const net = num(f.netAmount);
    if (net == null) continue;
    const wk = weekKey(f.date);
    byWeek.set(wk, (byWeek.get(wk) ?? 0) + net);
  }
  return [...byWeek.entries()]
    .map(([week, net]) => ({ week, net }))
    .sort((a, b) => (a.week < b.week ? -1 : a.week > b.week ? 1 : 0));
}

/** 合成序列：按周把多个部门的净额相加（用于 smart money = 外资+信托+保险）。 */
export function sumSeries(seriesList: WeekPoint[][]): WeekPoint[] {
  const byWeek = new Map<string, number>();
  for (const s of seriesList) {
    for (const p of s) byWeek.set(p.week, (byWeek.get(p.week) ?? 0) + p.net);
  }
  return [...byWeek.entries()]
    .map(([week, net]) => ({ week, net }))
    .sort((a, b) => (a.week < b.week ? -1 : a.week > b.week ? 1 : 0));
}

/** 从最新往回数，连续满足 sign 的周数（sign: +1 买越 / -1 売越）。 */
export function streak(series: WeekPoint[], sign: 1 | -1): number {
  let n = 0;
  for (let i = series.length - 1; i >= 0; i--) {
    if (Math.sign(series[i].net) === sign) n++;
    else break;
  }
  return n;
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
export function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}
export function clampScore(v: number): number {
  return Math.round(Math.max(0, Math.min(100, v)) * 10) / 10;
}
