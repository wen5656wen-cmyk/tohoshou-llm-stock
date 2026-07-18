"use client";

// ── Decision Overview 交易终端组件（P15-02 UI/UX 重设计）──────────────────────
// 专业交易终端风格（Bloomberg/TradingView/IBKR）：高密度、斑马纹、左侧 action 色条、
// 可扫读、点击行 → 统一详情 Modal。纯展示（哑组件），i18n 由页面解析后传入。
import type { ReactNode } from "react";
import { AppBadge } from "@/components/ui";
import { COLORS } from "@/lib/decision/ds";
import type { Tone } from "@/lib/design-tokens";

const ORANGE = "#FF9F0A";
// action → 左侧色条 & 语义色（STOP 红 / REDUCE 橙 / TP·BUY·ADD 绿 / WAIT 橙 / HOLD 灰）
export const ACTION_COLOR: Record<string, string> = {
  STOP_LOSS: COLORS.danger, REDUCE: ORANGE, TAKE_PROFIT: COLORS.success,
  BUY: COLORS.success, ADD: COLORS.success, WAIT: COLORS.warning, HOLD: "#9CA3AF",
  CASH: "#9CA3AF", NO_TRADE: "#9CA3AF",
};
export const actionColor = (a: string | null | undefined) => (a && ACTION_COLOR[a]) || "#9CA3AF";
const ZEBRA = "#FAFAFB";
const HOVER = "#F5F9FF";
const stars = (n: number) => "★".repeat(Math.max(0, Math.min(5, n))) + "☆".repeat(Math.max(0, 5 - Math.min(5, n)));

function Card({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 14, overflow: "hidden", ...style }}>{children}</div>;
}
const Eyebrow = ({ children }: { children: ReactNode }) => (
  <div style={{ fontSize: 11, letterSpacing: "0.05em", color: COLORS.textFaint, fontWeight: 600, textTransform: "uppercase" }}>{children}</div>
);
function SectionHead({ title, count, tone }: { title: string; count?: number; tone?: string }) {
  return (
    <div className="flex items-center gap-2 px-3.5 py-2" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
      {tone && <span style={{ width: 7, height: 7, borderRadius: 7, background: tone }} />}
      <b style={{ fontSize: 12.5, color: COLORS.text }}>{title}</b>
      {count != null && <span style={{ fontSize: 11, color: COLORS.textFaint }}>{count}</span>}
    </div>
  );
}

// ── ① 全宽全局决策卡（紧凑）──────────────────────────────────────────────────
export interface ActionHeroProps {
  title: string; icon: string; actionLabel: string; tone: Tone; instruction: string;
  totalPosLabel: string; totalPos: string; addPosLabel: string; addPos: string; maxSingleLabel: string; maxSingle: string;
  riskLabel: string; risk: string; riskTone: Tone; confLabel: string; confidence: string; phaseLabel: string; phase: string;
  executable: boolean; execLabel: string; blockedLabel: string | null; freshLine: string;
}
export function ActionHero(p: ActionHeroProps) {
  const stripe = p.blockedLabel ? COLORS.danger : p.executable ? COLORS.success : COLORS.warning;
  return (
    <Card>
      <div style={{ display: "flex" }}>
        <div style={{ width: 4, background: stripe, flexShrink: 0 }} />
        <div style={{ flex: 1, padding: "12px 16px" }}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <span style={{ fontSize: 22, lineHeight: 1 }}>{p.icon}</span>
              <span style={{ fontSize: 21, fontWeight: 800, color: COLORS.text }}>{p.actionLabel}</span>
              <span style={{ fontSize: 13, color: COLORS.textSecondary }}>{p.instruction}</span>
            </div>
            <span className="flex items-center gap-2 text-[11px]" style={{ color: COLORS.textFaint }}>
              <AppBadge tone={p.blockedLabel ? "red" : p.executable ? "green" : "amber"}>{p.blockedLabel ?? p.execLabel}</AppBadge>
              <span>{p.phaseLabel} {p.phase}</span>
            </span>
          </div>
          <div className="flex items-center flex-wrap gap-x-5 gap-y-1 mt-2" style={{ fontSize: 13 }}>
            <Metric label={p.totalPosLabel} value={p.totalPos} />
            <Metric label={p.addPosLabel} value={p.addPos} />
            <Metric label={p.maxSingleLabel} value={p.maxSingle} />
            <Metric label={p.riskLabel} value={p.risk} tone={p.riskTone} />
            <Metric label={p.confLabel} value={p.confidence} accent />
            <span className="ml-auto" style={{ fontSize: 11, color: COLORS.textFaint }}>{p.freshLine}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
function Metric({ label, value, tone, accent }: { label: string; value: string; tone?: Tone; accent?: boolean }) {
  const c = tone === "red" ? COLORS.danger : tone === "amber" ? COLORS.warning : tone === "green" ? COLORS.success : accent ? COLORS.primary : COLORS.text;
  return <span className="flex items-baseline gap-1.5"><span style={{ color: COLORS.textFaint }}>{label}</span><b style={{ color: c, fontSize: 14, fontWeight: 700 }}>{value}</b></span>;
}

// ── ② 当前持有（Current Holdings · 动作永远第一）───────────────────────────────
export interface HoldRow {
  symbol: string; name: string; action: string; actionLabel: string;
  returnPct: string; returnTone: Tone; sellPct: string; cost: string; price: string; reason: string;
}
export function HoldingsPanel(p: { title: string; emptyLabel: string; rows: HoldRow[]; detailLabel: string; onDetail: (symbol: string) => void }) {
  return (
    <Card>
      <SectionHead title={p.title} count={p.rows.length} />
      {p.rows.length === 0 ? (
        <div className="px-3.5 py-3" style={{ fontSize: 12.5, color: COLORS.textFaint }}>{p.emptyLabel}</div>
      ) : p.rows.map((r, i) => {
        const c = actionColor(r.action);
        return (
          <div key={r.symbol} onClick={() => p.onDetail(r.symbol)} className="flex items-center gap-2 cursor-pointer"
            style={{ borderLeft: `3px solid ${c}`, background: i % 2 ? ZEBRA : COLORS.card, padding: "7px 10px 7px 9px" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = HOVER)} onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 ? ZEBRA : COLORS.card)}>
            <span style={{ fontSize: 11, fontWeight: 700, color: c, minWidth: 40 }}>{r.actionLabel}</span>
            <b className="truncate" style={{ fontSize: 13, color: COLORS.text, flex: 1, minWidth: 0 }}>{r.name} <span className="tabular-nums" style={{ fontSize: 11, color: COLORS.textFaint }}>{r.symbol}</span></b>
            <span className="tabular-nums" style={{ fontSize: 12, color: COLORS.textFaint }}>{r.cost}→{r.price}</span>
            <b className="tabular-nums" style={{ fontSize: 13, color: r.returnTone === "red" ? COLORS.danger : COLORS.success, minWidth: 56, textAlign: "right" }}>{r.returnPct}</b>
            {r.sellPct && <span className="tabular-nums" style={{ fontSize: 11, color: ORANGE, minWidth: 40, textAlign: "right" }}>{r.sellPct}</span>}
          </div>
        );
      })}
    </Card>
  );
}

// ── ③④⑤ 候选终端列表（斑马纹 + 左色条 + 星级 + 详情按钮）────────────────────
export interface PickRow {
  rank: string; rankDelta?: string; deltaTone?: Tone; symbol: string; name: string;
  stars: number; starLabel: string; price: string; changePct: string; changeTone: Tone;
  action: string; actionLabel: string; tone: Tone;
  entry: string; target: string; stop: string; score: string; trigger: string; replaceReason?: string;
}
export function StockList(p: {
  title: string; tone: string; count: number; rows: PickRow[];
  labels: { buy: string; target: string; stop: string; why: string; detail: string };
  onDetail: (symbol: string) => void;
}) {
  return (
    <Card>
      <SectionHead title={p.title} count={p.count} tone={p.tone} />
      {p.rows.length === 0 ? (
        <div className="px-3.5 py-2.5" style={{ fontSize: 12, color: COLORS.textFaint }}>—</div>
      ) : p.rows.map((r, i) => {
        const c = actionColor(r.action);
        return (
          <div key={r.symbol} onClick={() => p.onDetail(r.symbol)} className="cursor-pointer"
            style={{ borderLeft: `3px solid ${c}`, background: i % 2 ? ZEBRA : COLORS.card, padding: "6px 10px 6px 9px" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = HOVER)} onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 ? ZEBRA : COLORS.card)}>
            <div className="flex items-center gap-2">
              <span className="tabular-nums" style={{ fontSize: 11, color: COLORS.textFaint, minWidth: 24 }}>#{r.rank}</span>
              {r.rankDelta && <span className="tabular-nums" style={{ fontSize: 10, fontWeight: 700, color: r.deltaTone === "green" ? COLORS.success : r.deltaTone === "red" ? COLORS.danger : COLORS.warning }}>{r.rankDelta}</span>}
              <b className="truncate" style={{ fontSize: 13, color: COLORS.text, minWidth: 0 }}>{r.name}</b>
              <span className="tabular-nums" style={{ fontSize: 10, color: COLORS.textFaint }}>{r.symbol}</span>
              <span title={r.starLabel} style={{ fontSize: 11, color: "#F5A623", letterSpacing: "-1px" }}>{stars(r.stars)}</span>
              <span className="ml-auto tabular-nums" style={{ fontSize: 13, fontWeight: 700, color: COLORS.text }}>{r.price}</span>
              <span className="tabular-nums" style={{ fontSize: 11, color: r.changeTone === "red" ? COLORS.danger : r.changeTone === "green" ? COLORS.success : COLORS.textFaint, minWidth: 48, textAlign: "right" }}>{r.changePct}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: c, minWidth: 34, textAlign: "right" }}>{r.actionLabel}</span>
            </div>
            <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap mt-0.5 tabular-nums" style={{ fontSize: 10.5, color: COLORS.textSecondary, paddingLeft: 26 }}>
              <span>{p.labels.buy} {r.entry}</span>
              <span>{p.labels.target} {r.target}</span>
              <span>{p.labels.stop} {r.stop}</span>
              <span>AI {r.score}</span>
              <span style={{ color: COLORS.textFaint }}>{r.replaceReason ?? r.trigger}</span>
              <button onClick={(e) => { e.stopPropagation(); p.onDetail(r.symbol); }} className="ml-auto" style={{ fontSize: 10.5, fontWeight: 600, color: COLORS.primary, padding: "1px 7px", borderRadius: 6, background: `${COLORS.primary}12` }}>{p.labels.why}</button>
              <button onClick={(e) => { e.stopPropagation(); p.onDetail(r.symbol); }} style={{ fontSize: 10.5, fontWeight: 600, color: COLORS.textSecondary, padding: "1px 7px", borderRadius: 6, background: "#F0F0F3" }}>{p.labels.detail}</button>
            </div>
          </div>
        );
      })}
    </Card>
  );
}

// ── ⑥ 数据新鲜度（紧凑）──────────────────────────────────────────────────────
export function FreshnessPanel(p: { title: string; items: { label: string; value: string; tone?: Tone }[] }) {
  return (
    <Card style={{ padding: 12 }}>
      <Eyebrow>{p.title}</Eyebrow>
      <div className="grid grid-cols-2 gap-y-1.5 gap-x-3 mt-2" style={{ fontSize: 11.5 }}>
        {p.items.map((it, i) => (
          <span key={i} className="flex items-baseline justify-between gap-2">
            <span style={{ color: COLORS.textFaint }}>{it.label}</span>
            <b className="tabular-nums" style={{ color: it.tone === "red" ? COLORS.danger : it.tone === "green" ? COLORS.success : COLORS.text }}>{it.value}</b>
          </span>
        ))}
      </div>
    </Card>
  );
}

// ── Top200 漏斗（底部一行）──────────────────────────────────────────────────
export function FunnelBar(p: { title: string; steps: { label: string; value: string }[] }) {
  return (
    <Card style={{ padding: "8px 14px" }}>
      <div className="flex items-center flex-wrap gap-x-2 gap-y-1" style={{ fontSize: 11.5 }}>
        <span style={{ color: COLORS.textFaint, fontWeight: 600 }}>{p.title}</span>
        {p.steps.map((s, i) => (
          <span key={i} className="flex items-center gap-2">
            {i > 0 && <span style={{ color: COLORS.textFaint }}>→</span>}
            <span style={{ color: COLORS.textSecondary }}>{s.label}</span>
            <b className="tabular-nums" style={{ color: COLORS.text }}>{s.value}</b>
          </span>
        ))}
      </div>
    </Card>
  );
}
