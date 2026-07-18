// ── 决策结论 SSOT（P13-DECISION-08 治理）─────────────────────────────────────
// BUY_TODAY / WATCH_ONLY / STAY_CASH 的图标·色调·i18n 标签唯一来源。
// 取代各页(Today/Review/Dashboard)各自复制的 VERDICT_TONE / VERDICT_ICON。
export type Verdict = "BUY_TODAY" | "WATCH_ONLY" | "STAY_CASH";
export type VerdictTone = "green" | "amber" | "red";

export const VERDICT_META: Record<Verdict, { icon: string; tone: VerdictTone; labelKey: string }> = {
  BUY_TODAY:  { icon: "🟢", tone: "green", labelKey: "dc.verdict.BUY_TODAY" },
  WATCH_ONLY: { icon: "🟡", tone: "amber", labelKey: "dc.verdict.WATCH_ONLY" },
  STAY_CASH:  { icon: "⚪", tone: "red",   labelKey: "dc.verdict.STAY_CASH" },
};

export const verdictIcon = (v: string | null | undefined) => (v && v in VERDICT_META ? VERDICT_META[v as Verdict].icon : "—");
export const verdictTone = (v: string | null | undefined): VerdictTone | "neutral" => (v && v in VERDICT_META ? VERDICT_META[v as Verdict].tone : "neutral");
