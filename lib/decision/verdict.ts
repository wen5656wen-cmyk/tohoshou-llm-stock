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

// ── 9 态实时决策动作 SSOT（P15-01B · Decision Engine 单一来源）──────────────────
// 全局 MarketDecision 用子集 {BUY,ADD,HOLD,WAIT,REDUCE,CASH,NO_TRADE}；
// 个股/持仓用 {BUY,ADD,HOLD,WAIT,REDUCE,TAKE_PROFIT,STOP_LOSS}。
// 图标·色调·i18n 标签键唯一来源，禁止各页/引擎复制枚举。
export type DecisionAction =
  | "BUY" | "ADD" | "HOLD" | "WAIT" | "REDUCE" | "TAKE_PROFIT" | "STOP_LOSS" | "CASH" | "NO_TRADE";
export type ActionTone = "green" | "amber" | "red" | "neutral";

export const DECISION_ACTION_META: Record<DecisionAction, { icon: string; tone: ActionTone; labelKey: string }> = {
  BUY:         { icon: "🟢", tone: "green",   labelKey: "dv.act.BUY" },
  ADD:         { icon: "➕", tone: "green",   labelKey: "dv.act.ADD" },
  HOLD:        { icon: "🔵", tone: "neutral", labelKey: "dv.act.HOLD" },
  WAIT:        { icon: "🟡", tone: "amber",   labelKey: "dv.act.WAIT" },
  REDUCE:      { icon: "🔻", tone: "amber",   labelKey: "dv.act.REDUCE" },
  TAKE_PROFIT: { icon: "💰", tone: "green",   labelKey: "dv.act.TAKE_PROFIT" },
  STOP_LOSS:   { icon: "🔴", tone: "red",     labelKey: "dv.act.STOP_LOSS" },
  CASH:        { icon: "⚪", tone: "neutral", labelKey: "dv.act.CASH" },
  NO_TRADE:    { icon: "⚫", tone: "neutral", labelKey: "dv.act.NO_TRADE" },
};

export const actionIcon = (a: string | null | undefined): string =>
  a && a in DECISION_ACTION_META ? DECISION_ACTION_META[a as DecisionAction].icon : "—";
export const actionTone = (a: string | null | undefined): ActionTone =>
  a && a in DECISION_ACTION_META ? DECISION_ACTION_META[a as DecisionAction].tone : "neutral";
export const actionLabelKey = (a: string | null | undefined): string =>
  a && a in DECISION_ACTION_META ? DECISION_ACTION_META[a as DecisionAction].labelKey : "dc.ov.noData";
