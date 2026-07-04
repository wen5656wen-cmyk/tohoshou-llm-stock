// ── Explain AI Engine · 工具（P5-T1）─────────────────────────────────────────
// 只做展示层的比率/等级/格式换算，不做任何评分计算。

import { DIM_MAX, type DimKey } from "./templates";

// 维度得分 → 完成度百分比（读现有分 / 满分，非重算）
export function dimRatio(score: number | null | undefined, dim: DimKey): number | null {
  if (score == null) return null;
  return Math.max(0, Math.min(100, (score / DIM_MAX[dim]) * 100));
}

// 强/中/弱等级（展示层阈值，非评分）
export function dimTier(ratio: number | null): "strong" | "mid" | "weak" | "na" {
  if (ratio == null) return "na";
  if (ratio >= 65) return "strong";
  if (ratio >= 40) return "mid";
  return "weak";
}

// 波动率 → 风险等级（沿用 AI 指挥中心既有口径 <20 低 / ≤25 中 / >25 高）
export function volRisk(v: number | null | undefined): { level: "低" | "中" | "高" | "—"; tone: "green" | "amber" | "red" | "neutral" } {
  if (v == null) return { level: "—", tone: "neutral" };
  if (v < 20) return { level: "低", tone: "green" };
  if (v <= 25) return { level: "中", tone: "amber" };
  return { level: "高", tone: "red" };
}

export function fx(v: number | null | undefined, d = 1): string {
  return v == null ? "—" : v.toFixed(d);
}
export function pct(v: number | null | undefined, d = 2): string {
  return v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(d)}%`;
}

// 尝试把 Json 型 reasons/warnings 读成字符串数组（只读，容错）
export function toStringList(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.map((x) => (typeof x === "string" ? x : typeof x === "object" && x && "label" in (x as object) ? String((x as { label: unknown }).label) : typeof x === "object" && x && "text" in (x as object) ? String((x as { text: unknown }).text) : String(x))).filter(Boolean);
  }
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}
