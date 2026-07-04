// Strategy 模块 · 工具与色值（P4-T3）
import type { MessageKey } from "@/lib/i18n";
import type { StratType, ExplainData } from "./types";
import { COLORS, SHADOW as TOK } from "@/lib/design-tokens";

export const STRAT_COLOR: Record<StratType, { bg: string; border: string; text: string; badge: string; dot: string }> = {
  DAY_TRADE:   { bg: "bg-amber-900/20",   border: "border-amber-700/40",   text: "text-amber-400",   badge: "bg-amber-900/50 text-amber-300",   dot: "bg-amber-400" },
  SWING_TRADE: { bg: "bg-blue-900/20",    border: "border-blue-700/40",    text: "text-blue-400",    badge: "bg-blue-900/50 text-blue-300",    dot: "bg-blue-400"  },
  LONG_TRADE:  { bg: "bg-emerald-900/20", border: "border-emerald-700/40", text: "text-emerald-400", badge: "bg-emerald-900/50 text-emerald-300", dot: "bg-emerald-400" },
};

export function stratLabel(s: StratType, t: (k: MessageKey) => string): string {
  if (s === "DAY_TRADE")   return t("strategy.DAY");
  if (s === "SWING_TRADE") return t("strategy.SWING");
  return t("strategy.long");
}

export function stratShort(s: StratType, t: (k: MessageKey) => string): string {
  if (s === "DAY_TRADE")   return t("strategy.DAY.short");
  if (s === "SWING_TRADE") return t("strategy.SWING.short");
  return t("strategy.long.short");
}

export function returnColor(v: number | null): string {
  if (v == null) return "text-[#6E6E73]";
  return v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-[#6E6E73]";
}

export function fmtPct(v: number | null, dec = 2): string {
  if (v == null) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(dec)}%`;
}

export function fmtScore(v: number | null): string {
  if (v == null) return "—";
  return v.toFixed(1);
}


export function maturity(fillRate: number | null): { labelKey: MessageKey; cls: string } {
  if (fillRate == null || fillRate < 0.30) return { labelKey: "strategy.maturity.insufficient", cls: "text-[#86868B]" };
  if (fillRate < 0.50) return { labelKey: "strategy.maturity.limited",        cls: "text-orange-400" };
  if (fillRate < 0.80) return { labelKey: "strategy.status.partial",          cls: "text-yellow-400" };
  return                       { labelKey: "strategy.status.ready",            cls: "text-emerald-400" };
}

// ── Exit reason translation map ───────────────────────────────────────────────

export const EXIT_REASON_KEYS: Record<string, MessageKey> = {
  DAY_CLOSE:          "strategy.exit.DAY_CLOSE",
  TAKE_PROFIT:        "strategy.exit.TAKE_PROFIT",
  STOP_LOSS:          "strategy.exit.STOP_LOSS",
  AI_SCORE_DROP:      "strategy.exit.AI_SCORE_DROP",
  DROPPED_FROM_TOP10: "strategy.exit.DROPPED_FROM_TOP10",
  MAX_HOLD_DAYS:      "strategy.exit.MAX_HOLD_DAYS",
  FUNDAMENTAL_RISK:   "strategy.exit.FUNDAMENTAL_RISK",
  NEGATIVE_NEWS:      "strategy.exit.NEGATIVE_NEWS",
  MANUAL:             "strategy.exit.MANUAL",
  MARKET_CLOSED:      "strategy.exit.MARKET_CLOSED",
  DATA_MISSING:       "strategy.exit.DATA_MISSING",
};

// ── Overview card ─────────────────────────────────────────────────────────────


export function fill(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

// Normalize a user-typed stock code: uppercase, and append ".T" for bare digits.
export function normalizeSymbol(raw: string): string {
  const s = raw.trim().toUpperCase();
  if (/^\d{3,5}$/.test(s)) return `${s}.T`;
  return s;
}

// Dimension display order per strategy (emphasis first), matching spec §10.
export const DIM_ORDER: Record<StratType, string[]> = {
  DAY_TRADE:   ["TECH", "NEWS", "AI", "FUND", "FLOW", "RISK"],
  SWING_TRADE: ["AI", "TECH", "FLOW", "FUND", "NEWS", "RISK"],
  LONG_TRADE:  ["FUND", "AI", "RISK", "TECH", "NEWS", "FLOW"],
};

export function dimValue(bd: NonNullable<ExplainData["scoreBreakdown"]>, code: string): number | null {
  switch (code) {
    case "AI":   return bd.aiScore;
    case "TECH": return bd.technicalScore;
    case "FUND": return bd.fundamentalScore;
    case "NEWS": return bd.newsScore;
    case "FLOW": return bd.moneyFlowScore;
    case "RISK": return bd.riskScore;
    default:     return null;
  }
}


export const SM = {
  bg: COLORS.background, card: COLORS.card, cardHi: COLORS.tile, border: COLORS.border,
  ink: COLORS.text, sub: COLORS.textSecondary, faint: COLORS.textFaint,
  green: COLORS.success, amber: COLORS.warning, red: COLORS.danger, blue: COLORS.primary,
};
export const SHADOW = TOK.md;
export const STRAT_HEX: Record<StratType, string> = { DAY_TRADE: "#FF9F0A", SWING_TRADE: "#0A84FF", LONG_TRADE: "#34C759" };
export const SFONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', Inter, system-ui, sans-serif";
export const gradeVerdict = (g: string | null): string => g === "A" ? "强势" : g === "B" ? "稳健" : g === "C" ? "观察" : g === "D" ? "等待" : "—";
export const retHex = (v: number | null | undefined) => v == null ? SM.faint : v > 0 ? SM.green : v < 0 ? SM.red : SM.sub;

