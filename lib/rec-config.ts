// lib/rec-config.ts — Single source of truth for recommendation display
// All pages and components import from here — never define REC_CFG locally
import type { Lang } from "./i18n/types";

export const REC_CONFIG = {
  STRONG_BUY: {
    label: "STRONG BUY",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
    solid: "bg-emerald-600 text-white",
    color: "#059669",
    glow: "rgba(5,150,105,0.15)",
  },
  BUY: {
    label: "BUY",
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
    solid: "bg-blue-600 text-white",
    color: "#2563eb",
    glow: "rgba(37,99,235,0.15)",
  },
  HOLD: {
    label: "HOLD",
    bg: "bg-slate-100",
    text: "text-slate-600",
    border: "border-slate-200",
    solid: "bg-slate-500 text-white",
    color: "#64748b",
    glow: "rgba(100,116,139,0.15)",
  },
  WATCH: {
    label: "WATCH",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
    solid: "bg-amber-500 text-white",
    color: "#d97706",
    glow: "rgba(217,119,6,0.15)",
  },
  AVOID: {
    label: "AVOID",
    bg: "bg-red-50",
    text: "text-red-600",
    border: "border-red-200",
    solid: "bg-red-500 text-white",
    color: "#dc2626",
    glow: "rgba(220,38,38,0.15)",
  },
} as const;

export type RecKey = keyof typeof REC_CONFIG;

export function getRec(key: string | null | undefined) {
  return REC_CONFIG[(key as RecKey)] ?? REC_CONFIG.HOLD;
}

const REC_LABELS: Record<Lang, Record<RecKey, string>> = {
  "zh-CN": { STRONG_BUY: "强烈买入", BUY: "买入", HOLD: "持有", WATCH: "观察", AVOID: "回避" },
  "ja-JP": { STRONG_BUY: "強い買い", BUY: "買い", HOLD: "保持", WATCH: "注目", AVOID: "回避" },
  "en-US": { STRONG_BUY: "STRONG BUY", BUY: "BUY", HOLD: "HOLD", WATCH: "WATCH", AVOID: "AVOID" },
};

export function getRecommendationLabel(value: string | null | undefined, lang: Lang = "zh-CN"): string {
  if (!value) return "—";
  return REC_LABELS[lang]?.[value as RecKey] ?? value;
}

// International convention: green = up, red = down
export function returnColorClass(val: number | null | undefined): string {
  if (val == null) return "text-slate-400";
  return val >= 0 ? "text-emerald-600" : "text-red-500";
}

// +25.32% / -25.32%
export function fmtPct(val: number | null | undefined, decimals = 2): string {
  if (val == null) return "—";
  const sign = val >= 0 ? "+" : "";
  return `${sign}${val.toFixed(decimals)}%`;
}

// ¥1,234,567
export function fmtJpy(val: number | null | undefined): string {
  if (val == null) return "—";
  return `¥${val.toLocaleString()}`;
}

// Final Score color — 90+ violet / 80+ blue / 70+ emerald / 60+ amber / <60 slate
export function finalScoreColor(score: number | null | undefined): string {
  if (score == null) return "text-slate-400";
  if (score >= 90) return "text-violet-600";
  if (score >= 80) return "text-blue-600";
  if (score >= 70) return "text-emerald-600";
  if (score >= 60) return "text-amber-500";
  return "text-slate-400";
}

// Hex variant for inline styles (dark card, etc.)
export function finalScoreHex(score: number | null | undefined): string {
  if (score == null) return "#94a3b8";
  if (score >= 90) return "#7c3aed";
  if (score >= 80) return "#2563eb";
  if (score >= 70) return "#059669";
  if (score >= 60) return "#d97706";
  return "#94a3b8";
}
