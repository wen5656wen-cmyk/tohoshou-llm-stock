// ── TOHOSHOU AI · Feature Platform Report（P6-T10 · T10.5 + T10.2）──────────
// 从统一评估行汇总每日平台状态：计数 / 晋升 / 平均 Alpha·贡献·置信 / Top·Worst /
// Pending 分类 / Trend（对比昨日快照）。**纯函数 · 只读 · 不落库 · 不改评分。**

import type { EvaluatedFeature } from "./evaluate";
import type { PendingReasonCode } from "../promotion/shadow-diagnostics";

const CONF_SCORE: Record<string, number> = { HIGH: 100, MEDIUM: 65, LOW: 30 };
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

export interface PlatformReport {
  production: number; shadow: number; disabled: number; pending: number; evaluated: number;
  promoteCandidates: number; keepShadow: number; disableCandidates: number;
  avgAlpha: number | null;          // 已评估影子 10d alpha 均值
  avgContribution: number | null;   // 已评估因子平均贡献 %
  avgConfidence: number | null;     // 平均置信度分（100/65/30）
  avgPromotionScore: number | null;
  topFeature: { id: string; score: number } | null;
  worstFeature: { id: string; score: number } | null;
  pendingByReason: Record<string, number>;
}

/** 从统一评估行构建平台报告。 */
export function buildPlatformReport(rows: EvaluatedFeature[]): PlatformReport {
  const shadow = rows.filter((r) => r.status === "SHADOW");
  const disabled = rows.filter((r) => r.status === "DISABLED");
  const evalShadow = shadow.filter((r) => !r.pending);
  const cand = [...shadow, ...disabled];

  const pendingByReason: Record<string, number> = {};
  for (const r of cand.filter((x) => x.pending)) {
    const c = (r.pendingReasonCode ?? "BACKTEST_DISABLED") as PendingReasonCode;
    pendingByReason[c] = (pendingByReason[c] ?? 0) + 1;
  }

  const evaluatedRows = rows.filter((r) => r.factorAlpha != null);
  const ranked = evalShadow.filter((r) => r.promotionScore != null)
    .sort((a, b) => (b.promotionScore ?? 0) - (a.promotionScore ?? 0));
  const top = ranked[0];
  const worst = ranked.at(-1);

  return {
    production: rows.filter((r) => r.status === "PRODUCTION").length,
    shadow: shadow.length,
    disabled: disabled.length,
    pending: cand.filter((r) => r.pending).length,
    evaluated: evaluatedRows.length,
    promoteCandidates: cand.filter((r) => r.recommendation === "PROMOTE").length,
    keepShadow: cand.filter((r) => r.recommendation === "KEEP_SHADOW" && !r.pending).length,
    disableCandidates: cand.filter((r) => r.recommendation === "DISABLE").length,
    avgAlpha: avg(evalShadow.map((r) => r.primaryAlpha).filter((x): x is number => x != null)),
    avgContribution: avg(evaluatedRows.map((r) => r.contribution).filter((x): x is number => x != null)),
    avgConfidence: avg(evalShadow.map((r) => CONF_SCORE[r.confidence] ?? 30)),
    avgPromotionScore: avg(evalShadow.map((r) => r.promotionScore).filter((x): x is number => x != null)),
    topFeature: top && top.promotionScore != null ? { id: top.id, score: top.promotionScore } : null,
    worstFeature: worst && worst.promotionScore != null && worst.id !== top?.id ? { id: worst.id, score: worst.promotionScore } : null,
    pendingByReason,
  };
}

/** Pending / 晋升 Trend（对比上一份快照）。缺上一份 → null。 */
export interface PlatformTrend {
  pendingDelta: number | null;
  promoteDelta: number | null;
  disableDelta: number | null;
  avgAlphaDelta: number | null;
  integrityDelta: number | null;
  pendingByReasonDelta: Record<string, number>;
  prevDate: string | null;
}

interface SnapshotLike {
  date: string;
  pending: number; promoteCandidates: number; disableCandidates: number;
  avgAlpha: number | null; integrityScore: number | null;
  pendingByReason: Record<string, number> | null;
}

export function buildTrend(current: PlatformReport & { integrityScore: number | null }, prev: SnapshotLike | null): PlatformTrend {
  if (!prev) {
    return { pendingDelta: null, promoteDelta: null, disableDelta: null, avgAlphaDelta: null, integrityDelta: null, pendingByReasonDelta: {}, prevDate: null };
  }
  const d = (a: number | null | undefined, b: number | null | undefined) => (a == null || b == null ? null : Math.round((a - b) * 10) / 10);
  const byReasonDelta: Record<string, number> = {};
  const codes = new Set([...Object.keys(current.pendingByReason), ...Object.keys(prev.pendingByReason ?? {})]);
  for (const c of codes) byReasonDelta[c] = (current.pendingByReason[c] ?? 0) - ((prev.pendingByReason ?? {})[c] ?? 0);
  return {
    pendingDelta: d(current.pending, prev.pending),
    promoteDelta: d(current.promoteCandidates, prev.promoteCandidates),
    disableDelta: d(current.disableCandidates, prev.disableCandidates),
    avgAlphaDelta: d(current.avgAlpha, prev.avgAlpha),
    integrityDelta: d(current.integrityScore, prev.integrityScore),
    pendingByReasonDelta: byReasonDelta,
    prevDate: prev.date,
  };
}
