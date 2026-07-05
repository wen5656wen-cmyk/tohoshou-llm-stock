// ── TOHOSHOU AI · Financial Feature Parser（P6-T3）──────────────────────────
// 统一从现有 Financial 数据选取「最近一期」与「对比期（YoY 优先，否则顺序上一期）」，
// 并提供安全数值/归一化辅助。**只读纯函数，不改任何财务计算、不落库、不接评分。**

import type { FinancialLike } from "./types";

/** 季度排序权重：Q1<Q2<Q3<通期(null=年度，视为该财年最末)。 */
export function quarterOrder(q?: number | null): number {
  if (q == null) return 4; // 通期/年度
  return q;
}

/** 期间大小比较键（越大越新）。 */
function periodKey(f: FinancialLike): number {
  return f.fiscalYear * 10 + quarterOrder(f.quarter);
}

/** 选出最近一期（按 fiscalYear + quarter；同期取 reportedAt 更晚者）。 */
export function pickLatest(financials: FinancialLike[]): FinancialLike | null {
  if (!financials || financials.length === 0) return null;
  return [...financials].sort((a, b) => {
    const d = periodKey(b) - periodKey(a);
    if (d !== 0) return d;
    const ta = a.reportedAt ? new Date(a.reportedAt).getTime() : 0;
    const tb = b.reportedAt ? new Date(b.reportedAt).getTime() : 0;
    return tb - ta;
  })[0];
}

export interface PriorPick {
  prior: FinancialLike | null;
  kind: "YoY" | "SEQUENTIAL" | "NONE";
}

/**
 * 选出对比期：优先同季度前一财年（YoY）；否则顺序上一期（SEQUENTIAL）；都无则 NONE。
 */
export function pickPrior(financials: FinancialLike[], latest: FinancialLike): PriorPick {
  const sameQtrPrevYear = financials.find(
    (f) => f.fiscalYear === latest.fiscalYear - 1 && quarterOrder(f.quarter) === quarterOrder(latest.quarter),
  );
  if (sameQtrPrevYear) return { prior: sameQtrPrevYear, kind: "YoY" };

  const latestKey = periodKey(latest);
  const older = financials
    .filter((f) => periodKey(f) < latestKey)
    .sort((a, b) => periodKey(b) - periodKey(a));
  if (older.length > 0) return { prior: older[0], kind: "SEQUENTIAL" };

  return { prior: null, kind: "NONE" };
}

/** 有限数值检查。 */
export function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** 归一化「自己资本比率」到百分数（输入可能是分数 0-1 或百分数）。 */
export function toEquityRatioPct(f: FinancialLike): number | null {
  const er = num(f.equityRatio);
  if (er != null) return Math.abs(er) <= 1.5 ? er * 100 : er; // 0-1 视为分数 → ×100
  const eq = num(f.equity), ta = num(f.totalAssets);
  if (eq != null && ta != null && ta !== 0) return (eq / ta) * 100;
  return null;
}

/** 派生 ROE(%)：Financial.roe 字段实测为空 → 用 netProfit/equity 派生（×100）。 */
export function toRoePct(f: FinancialLike): number | null {
  const roe = num(f.roe);
  if (roe != null) return Math.abs(roe) <= 1.5 ? roe * 100 : roe;
  const np = num(f.netProfit), eq = num(f.equity);
  if (np != null && eq != null && eq !== 0) return (np / eq) * 100;
  return null;
}

/** YoY/期间增长率(%)：prior 必须为正才有意义，否则返回 null（不伪造）。 */
export function growthPct(latest: number | null, prior: number | null): number | null {
  if (latest == null || prior == null) return null;
  if (prior <= 0) return null; // 由负/零转正的百分比无意义 → null（方向另行判断）
  return ((latest - prior) / prior) * 100;
}

/** 夹取到 [0,100] 并四舍五入 1 位。 */
export function clampScore(v: number): number {
  return Math.round(Math.max(0, Math.min(100, v)) * 10) / 10;
}
