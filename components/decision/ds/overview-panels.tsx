"use client";

// ── Decision Terminal V2 组件（P15-03 · 专业交易终端）─────────────────────────
// 统一 Terminal Design System（lib/decision/terminal）：56px 行、列头对齐、斑马纹、Hover、
// Selected、左侧 action 色条、AI 等级(A+/A/B)取代星级、8pt 间距。纯展示（哑组件）。
import type { ReactNode } from "react";
import { AppBadge } from "@/components/ui";
import { COLORS } from "@/lib/decision/ds";
import { SP, ROW_H, TERM, COLW, actionColor, gradeFor } from "@/lib/decision/terminal";
import type { Tone } from "@/lib/design-tokens";

function Card({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, overflow: "hidden", ...style }}>{children}</div>;
}
function SectionHead({ title, count, tone, right }: { title: string; count?: number; tone?: string; right?: ReactNode }) {
  return (
    <div className="flex items-center gap-2" style={{ padding: `${SP.sm}px ${SP.md - 4}px`, borderBottom: `1px solid ${TERM.gridLine}` }}>
      {tone && <span style={{ width: 7, height: 7, borderRadius: 7, background: tone }} />}
      <b style={{ fontSize: 12.5, color: COLORS.text, letterSpacing: "0.01em" }}>{title}</b>
      {count != null && <span style={{ fontSize: 11, color: COLORS.textFaint }}>{count}</span>}
      {right && <span className="ml-auto">{right}</span>}
    </div>
  );
}
const Cell = ({ w, children, align = "left", color, mono }: { w: number; children: ReactNode; align?: "left" | "right" | "center"; color?: string; mono?: boolean }) => (
  <div className={mono ? "tabular-nums" : ""} style={{ width: w, flex: `0 0 ${w}px`, textAlign: align, color: color ?? COLORS.text, fontSize: 12.5, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{children}</div>
);
const HCell = ({ w, children, align = "left" }: { w: number; children: ReactNode; align?: "left" | "right" | "center" }) => (
  <div style={{ width: w, flex: `0 0 ${w}px`, textAlign: align, fontSize: 10, fontWeight: 600, letterSpacing: "0.04em", color: TERM.headerText, textTransform: "uppercase" }}>{children}</div>
);

// ── ① 今日决策条（≤140px，非 Hero）──────────────────────────────────────────
export interface DecisionBarProps {
  icon: string; actionLabel: string; instruction: string;
  totalPosLabel: string; totalPos: string; addPosLabel: string; addPos: string; maxSingleLabel: string; maxSingle: string;
  riskLabel: string; risk: string; riskTone: Tone; confLabel: string; confidence: string;
  phaseLabel: string; phase: string; executable: boolean; execLabel: string; blockedLabel: string | null; freshLine: string;
}
export function DecisionBar(p: DecisionBarProps) {
  const stripe = p.blockedLabel ? COLORS.danger : p.executable ? COLORS.success : "#F5A623";
  const chip = (label: string, value: string, tone?: Tone, accent?: boolean) => {
    const c = tone === "red" ? COLORS.danger : tone === "amber" ? "#F5A623" : tone === "green" ? COLORS.success : accent ? COLORS.primary : COLORS.text;
    return <span className="flex items-baseline gap-1.5"><span style={{ fontSize: 11, color: COLORS.textFaint }}>{label}</span><b style={{ fontSize: 14, color: c }}>{value}</b></span>;
  };
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "stretch" }}>
        <div style={{ width: 4, background: stripe, flexShrink: 0 }} />
        <div className="flex items-center flex-wrap" style={{ gap: `${SP.sm}px ${SP.lg}px`, padding: `${SP.md - 4}px ${SP.md}px`, flex: 1 }}>
          <span className="flex items-center gap-2.5">
            <span style={{ fontSize: 22, lineHeight: 1 }}>{p.icon}</span>
            <b style={{ fontSize: 22, fontWeight: 800, color: COLORS.text, letterSpacing: "-0.01em" }}>{p.actionLabel}</b>
            <span style={{ fontSize: 13, color: COLORS.textSecondary }}>{p.instruction}</span>
          </span>
          <span className="w-px self-stretch" style={{ background: TERM.gridLine }} />
          {chip(p.totalPosLabel, p.totalPos)}
          {chip(p.addPosLabel, p.addPos)}
          {chip(p.maxSingleLabel, p.maxSingle)}
          {chip(p.riskLabel, p.risk, p.riskTone)}
          {chip(p.confLabel, p.confidence, undefined, true)}
          <span className="ml-auto flex items-center gap-2.5">
            <AppBadge tone={p.blockedLabel ? "red" : p.executable ? "green" : "amber"}>{p.blockedLabel ?? p.execLabel}</AppBadge>
            <span style={{ fontSize: 11, color: COLORS.textFaint }}>{p.phaseLabel} {p.phase}</span>
          </span>
          <span className="w-full" style={{ fontSize: 11, color: COLORS.textFaint }}>{p.freshLine}</span>
        </div>
      </div>
    </Card>
  );
}

// 通用终端行外壳
function TermRow({ action, selected, index, onClick, children }: { action: string; selected: boolean; index: number; onClick: () => void; children: ReactNode }) {
  const bg = selected ? TERM.selected : index % 2 ? TERM.zebra : COLORS.card;
  return (
    <div onClick={onClick} className="flex items-center cursor-pointer"
      style={{ minHeight: ROW_H, borderLeft: `4px solid ${actionColor(action)}`, background: bg, padding: `0 ${SP.md - 4}px`, gap: SP.sm, borderBottom: `1px solid ${TERM.gridLine}` }}
      onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = TERM.hover; }}
      onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = index % 2 ? TERM.zebra : COLORS.card; }}>
      {children}
    </div>
  );
}
function NameCell({ name, symbol, rank, rankDelta, deltaTone }: { name: string; symbol: string; rank?: string; rankDelta?: string; deltaTone?: Tone }) {
  return (
    <div className="flex items-center gap-1.5" style={{ flex: 1, minWidth: 0 }}>
      {rank && <span className="tabular-nums" style={{ fontSize: 11, color: COLORS.textFaint, width: 30 }}>#{rank}</span>}
      {rankDelta && <span className="tabular-nums" style={{ fontSize: 10, fontWeight: 700, color: deltaTone === "green" ? COLORS.success : deltaTone === "red" ? COLORS.danger : "#F5A623" }}>{rankDelta}</span>}
      <div style={{ minWidth: 0 }}>
        <div className="truncate" style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, lineHeight: 1.25 }}>{name}</div>
        <div className="tabular-nums" style={{ fontSize: 10.5, color: COLORS.textFaint }}>{symbol}</div>
      </div>
    </div>
  );
}
function ActionTag({ action, label }: { action: string; label: string }) {
  const c = actionColor(action);
  return <Cell w={COLW.action}><span style={{ fontSize: 11, fontWeight: 700, color: c, background: `${c}18`, padding: "2px 7px", borderRadius: 6 }}>{label}</span></Cell>;
}
function GradeCell({ ai }: { ai: number | null }) {
  const g = gradeFor(ai);
  return <Cell w={COLW.ai} align="right"><span className="tabular-nums" style={{ fontSize: 12.5, fontWeight: 700, color: g.color }}>{g.grade}</span> <span className="tabular-nums" style={{ fontSize: 10.5, color: COLORS.textFaint }}>{ai != null ? Math.round(ai) : "—"}</span></Cell>;
}

// ── ② 当前持有（Terminal List · 永远第一）─────────────────────────────────────
export interface HoldRow {
  symbol: string; name: string; action: string; actionLabel: string;
  pnl: string; pnlTone: Tone; cost: string; price: string; target: string; stop: string; sellPct: string; ai: number | null;
}
export function HoldingsTable(p: { title: string; emptyLabel: string; rows: HoldRow[]; selected: string | null; detailLabel: string; cols: ColLabels; onDetail: (s: string) => void }) {
  return (
    <Card>
      <SectionHead title={p.title} count={p.rows.length} />
      {p.rows.length === 0 ? <div style={{ padding: `${SP.md - 4}px`, fontSize: 12.5, color: COLORS.textFaint }}>{p.emptyLabel}</div> : (
        <>
          <div className="flex items-center" style={{ padding: `6px ${SP.md - 4}px`, gap: SP.sm, background: TERM.header, borderBottom: `1px solid ${TERM.gridLine}` }}>
            <div style={{ flex: 1 }}><span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.04em", color: TERM.headerText, textTransform: "uppercase" }}>{p.cols.symbol}</span></div>
            <HCell w={COLW.action}>{p.cols.action}</HCell>
            <HCell w={COLW.current} align="right">{p.cols.current}</HCell>
            <HCell w={COLW.pnl} align="right">{p.cols.pnl}</HCell>
            <HCell w={COLW.target} align="right">{p.cols.target}</HCell>
            <HCell w={COLW.stop} align="right">{p.cols.stop}</HCell>
            <HCell w={COLW.detail} align="right">{p.cols.detail}</HCell>
          </div>
          {p.rows.map((r, i) => (
            <TermRow key={r.symbol} action={r.action} selected={p.selected === r.symbol} index={i} onClick={() => p.onDetail(r.symbol)}>
              <NameCell name={r.name} symbol={r.symbol} />
              <ActionTag action={r.action} label={r.actionLabel} />
              <Cell w={COLW.current} align="right" mono>{r.price}</Cell>
              <Cell w={COLW.pnl} align="right" mono color={r.pnlTone === "red" ? COLORS.danger : COLORS.success}><b>{r.pnl}</b></Cell>
              <Cell w={COLW.target} align="right" mono color={COLORS.textSecondary}>{r.target}</Cell>
              <Cell w={COLW.stop} align="right" mono color={COLORS.danger}>{r.stop}</Cell>
              <Cell w={COLW.detail} align="right"><span style={{ fontSize: 11, color: COLORS.primary }}>{p.detailLabel} ›</span></Cell>
            </TermRow>
          ))}
        </>
      )}
    </Card>
  );
}

// ── ③④⑤ 机会 / 等待 / 观察（Terminal List）────────────────────────────────
export interface PickRow {
  rank: string; rankDelta?: string; deltaTone?: Tone; symbol: string; name: string; ai: number | null;
  action: string; actionLabel: string; price: string; changePct: string; changeTone: Tone;
  entry: string; target: string; stop: string;
}
export interface ColLabels { symbol: string; action: string; current: string; pnl: string; change: string; entry: string; target: string; stop: string; ai: string; detail: string; }
export function OpportunityTable(p: { title: string; tone: string; count: number; rows: PickRow[]; selected: string | null; cols: ColLabels; detailLabel: string; onDetail: (s: string) => void }) {
  return (
    <Card>
      <SectionHead title={p.title} count={p.count} tone={p.tone} />
      {p.rows.length === 0 ? <div style={{ padding: `${SP.sm}px ${SP.md - 4}px`, fontSize: 12, color: COLORS.textFaint }}>—</div> : (
        <>
          <div className="flex items-center" style={{ padding: `6px ${SP.md - 4}px`, gap: SP.sm, background: TERM.header, borderBottom: `1px solid ${TERM.gridLine}` }}>
            <div style={{ flex: 1 }}><span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.04em", color: TERM.headerText, textTransform: "uppercase" }}>{p.cols.symbol}</span></div>
            <HCell w={COLW.action}>{p.cols.action}</HCell>
            <HCell w={COLW.current} align="right">{p.cols.current}</HCell>
            <HCell w={COLW.pnl} align="right">{p.cols.change}</HCell>
            <HCell w={COLW.entry} align="right">{p.cols.entry}</HCell>
            <HCell w={COLW.target} align="right">{p.cols.target}</HCell>
            <HCell w={COLW.stop} align="right">{p.cols.stop}</HCell>
            <HCell w={COLW.ai} align="right">{p.cols.ai}</HCell>
            <HCell w={COLW.detail} align="right">{p.cols.detail}</HCell>
          </div>
          {p.rows.map((r, i) => (
            <TermRow key={r.symbol} action={r.action} selected={p.selected === r.symbol} index={i} onClick={() => p.onDetail(r.symbol)}>
              <NameCell name={r.name} symbol={r.symbol} rank={r.rank} rankDelta={r.rankDelta} deltaTone={r.deltaTone} />
              <ActionTag action={r.action} label={r.actionLabel} />
              <Cell w={COLW.current} align="right" mono><b>{r.price}</b></Cell>
              <Cell w={COLW.pnl} align="right" mono color={r.changeTone === "red" ? COLORS.danger : r.changeTone === "green" ? COLORS.success : COLORS.textFaint}>{r.changePct}</Cell>
              <Cell w={COLW.entry} align="right" mono color={COLORS.textSecondary}>{r.entry}</Cell>
              <Cell w={COLW.target} align="right" mono color={COLORS.textSecondary}>{r.target}</Cell>
              <Cell w={COLW.stop} align="right" mono color={COLORS.danger}>{r.stop}</Cell>
              <GradeCell ai={r.ai} />
              <Cell w={COLW.detail} align="right"><span style={{ fontSize: 11, color: COLORS.primary }}>{p.detailLabel} ›</span></Cell>
            </TermRow>
          ))}
        </>
      )}
    </Card>
  );
}

// ── 辅助面板（右栏，紧凑）──────────────────────────────────────────────────
export function FreshnessPanel(p: { title: string; items: { label: string; value: string; tone?: Tone }[] }) {
  return (
    <Card style={{ padding: SP.md - 4 }}>
      <div style={{ fontSize: 11, letterSpacing: "0.05em", color: COLORS.textFaint, fontWeight: 600, textTransform: "uppercase", marginBottom: SP.sm }}>{p.title}</div>
      <div className="grid grid-cols-2" style={{ gap: `${SP.xs + 2}px ${SP.md - 4}px`, fontSize: 11.5 }}>
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
export function FunnelBar(p: { title: string; steps: { label: string; value: string }[] }) {
  return (
    <Card style={{ padding: `${SP.sm}px ${SP.md - 2}px` }}>
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
