"use client";

// ── Decision Terminal V2 组件（P15-03 + P16-01 Portfolio）─────────────────────
// 统一 Terminal Design System（lib/decision/terminal）。纯展示（哑组件）。
// P16-01：当前持有=真实用户持仓(编辑/卖出/删除)；机会行加「加入持有」；组合摘要/行动摘要/系统状态/历史。
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
      <b style={{ fontSize: 12.5, color: COLORS.text }}>{title}</b>
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
const miniBtn = (label: string, color: string, onClick: (e: React.MouseEvent) => void) => (
  <button onClick={onClick} style={{ fontSize: 11, fontWeight: 600, color, padding: "3px 8px", borderRadius: 6, background: `${color}12`, whiteSpace: "nowrap" }}>{label}</button>
);

// ── ① 今日决策条（≤120px，非 Hero）──────────────────────────────────────────
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
        <div className="flex items-center flex-wrap" style={{ gap: `${SP.xs}px ${SP.lg}px`, padding: `${SP.sm + 2}px ${SP.md}px`, flex: 1 }}>
          <span className="flex items-center gap-2.5">
            <span style={{ fontSize: 20, lineHeight: 1 }}>{p.icon}</span>
            <b style={{ fontSize: 21, fontWeight: 800, color: COLORS.text, letterSpacing: "-0.01em" }}>{p.actionLabel}</b>
            <span style={{ fontSize: 13, color: COLORS.textSecondary }}>{p.instruction}</span>
          </span>
          <span className="w-px self-stretch" style={{ background: TERM.gridLine }} />
          {chip(p.totalPosLabel, p.totalPos)}
          {chip(p.addPosLabel, p.addPos)}
          {chip(p.confLabel, p.confidence, undefined, true)}
          {chip(p.riskLabel, p.risk, p.riskTone)}
          <span className="ml-auto flex items-center gap-2.5">
            <AppBadge tone={p.blockedLabel ? "red" : p.executable ? "green" : "amber"}>{p.blockedLabel ?? p.execLabel}</AppBadge>
            <span style={{ fontSize: 11, color: COLORS.textFaint }}>{p.phaseLabel} {p.phase} · {p.freshLine}</span>
          </span>
        </div>
      </div>
    </Card>
  );
}

// ── ⑮ 组合摘要（顶部）──────────────────────────────────────────────────────
export function PortfolioSummaryBar(p: { items: { label: string; value: string; tone?: Tone }[] }) {
  return (
    <Card style={{ padding: `${SP.sm}px ${SP.md}px` }}>
      <div className="flex items-center flex-wrap" style={{ gap: `${SP.xs}px ${SP.xl}px` }}>
        {p.items.map((it, i) => {
          const c = it.tone === "red" ? COLORS.danger : it.tone === "green" ? COLORS.success : it.tone === "amber" ? "#F5A623" : COLORS.text;
          return <span key={i} className="flex items-baseline gap-1.5"><span style={{ fontSize: 11, color: COLORS.textFaint }}>{it.label}</span><b className="tabular-nums" style={{ fontSize: 15, color: c }}>{it.value}</b></span>;
        })}
      </div>
    </Card>
  );
}

// ── ⑪ 今日行动摘要（可点击进入对应列表）─────────────────────────────────────
export function ActionSummary(p: { title: string; items: { action: string; label: string; count: number }[]; onClick?: (action: string) => void }) {
  return (
    <Card style={{ padding: `${SP.sm}px ${SP.md - 2}px` }}>
      <div className="flex items-center flex-wrap" style={{ gap: `${SP.xs}px ${SP.md}px` }}>
        <span style={{ fontSize: 11, color: COLORS.textFaint, fontWeight: 600 }}>{p.title}</span>
        {p.items.filter((x) => x.count > 0).map((x) => {
          const c = actionColor(x.action);
          return (
            <button key={x.action} onClick={() => p.onClick?.(x.action)} className="flex items-center gap-1.5" style={{ padding: "3px 9px", borderRadius: 8, background: `${c}12` }}>
              <span style={{ width: 8, height: 8, borderRadius: 8, background: c }} />
              <span style={{ fontSize: 12, color: COLORS.textSecondary }}>{x.label}</span>
              <b className="tabular-nums" style={{ fontSize: 13, color: c }}>{x.count}</b>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

// ── ② 当前持有（真实用户持仓 · symbol 第一视觉 · 编辑/卖出/删除）──────────────
export interface HoldRow {
  symbol: string; name: string; action: string; actionLabel: string;
  pnl: string; pnlTone: Tone; current: string; target: string; stop: string; ai: number | null;
}
export function HoldingsTable(p: {
  title: string; emptyLabel: string; rows: HoldRow[]; selected: string | null;
  cols: { action: string; current: string; pnl: string; target: string; stop: string };
  labels: { edit: string; sell: string; del: string };
  onDetail: (s: string) => void; onEdit: (s: string) => void; onSell: (s: string) => void; onDelete: (s: string) => void;
}) {
  return (
    <Card>
      <SectionHead title={p.title} count={p.rows.length} />
      {p.rows.length === 0 ? <div style={{ padding: `${SP.md - 2}px ${SP.md - 4}px`, fontSize: 12.5, color: COLORS.textFaint }}>{p.emptyLabel}</div> : (
        <>
          <div className="flex items-center" style={{ padding: `6px ${SP.md - 4}px`, gap: SP.sm, background: TERM.header, borderBottom: `1px solid ${TERM.gridLine}` }}>
            <div style={{ flex: 1 }} />
            <HCell w={COLW.action}>{p.cols.action}</HCell>
            <HCell w={COLW.pnl} align="right">{p.cols.pnl}</HCell>
            <HCell w={COLW.current} align="right">{p.cols.current}</HCell>
            <HCell w={COLW.target} align="right">{p.cols.target}</HCell>
            <HCell w={COLW.stop} align="right">{p.cols.stop}</HCell>
            <div style={{ width: 168, flex: "0 0 168px" }} />
          </div>
          {p.rows.map((r, i) => (
            <div key={r.symbol} onClick={() => p.onDetail(r.symbol)} className="flex items-center cursor-pointer"
              style={{ minHeight: ROW_H, borderLeft: `4px solid ${actionColor(r.action)}`, background: p.selected === r.symbol ? TERM.selected : i % 2 ? TERM.zebra : COLORS.card, padding: `0 ${SP.md - 4}px`, gap: SP.sm, borderBottom: `1px solid ${TERM.gridLine}` }}
              onMouseEnter={(e) => { if (p.selected !== r.symbol) e.currentTarget.style.background = TERM.hover; }}
              onMouseLeave={(e) => { if (p.selected !== r.symbol) e.currentTarget.style.background = i % 2 ? TERM.zebra : COLORS.card; }}>
              {/* symbol 第一视觉（最大字），名称第二 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="tabular-nums truncate" style={{ fontSize: 15, fontWeight: 800, color: COLORS.text, lineHeight: 1.2 }}>{r.symbol}</div>
                <div className="truncate" style={{ fontSize: 11, color: COLORS.textFaint }}>{r.name}</div>
              </div>
              <Cell w={COLW.action}><span style={{ fontSize: 11, fontWeight: 700, color: actionColor(r.action), background: `${actionColor(r.action)}18`, padding: "2px 7px", borderRadius: 6 }}>{r.actionLabel}</span></Cell>
              <Cell w={COLW.pnl} align="right" mono color={r.pnlTone === "red" ? COLORS.danger : COLORS.success}><b>{r.pnl}</b></Cell>
              <Cell w={COLW.current} align="right" mono>{r.current}</Cell>
              <Cell w={COLW.target} align="right" mono color={COLORS.textSecondary}>{r.target}</Cell>
              <Cell w={COLW.stop} align="right" mono color={COLORS.danger}>{r.stop}</Cell>
              <div className="flex items-center justify-end gap-1.5" style={{ width: 168, flex: "0 0 168px" }}>
                {miniBtn(p.labels.edit, COLORS.textSecondary, (e) => { e.stopPropagation(); p.onEdit(r.symbol); })}
                {miniBtn(p.labels.sell, COLORS.danger, (e) => { e.stopPropagation(); p.onSell(r.symbol); })}
                {miniBtn(p.labels.del, COLORS.textFaint, (e) => { e.stopPropagation(); p.onDelete(r.symbol); })}
              </div>
            </div>
          ))}
        </>
      )}
    </Card>
  );
}

// ── ③④⑤ 机会 / 等待 / 观察（Terminal List · 加入持有）─────────────────────
export interface PickRow {
  rank: string; rankDelta?: string; deltaTone?: Tone; symbol: string; name: string; ai: number | null;
  action: string; actionLabel: string; price: string; changePct: string; changeTone: Tone;
  entry: string; target: string; stop: string;
}
export interface ColLabels { symbol: string; action: string; current: string; pnl: string; change: string; entry: string; target: string; stop: string; ai: string; detail: string; }
export function OpportunityTable(p: {
  title: string; tone: string; count: number; rows: PickRow[]; selected: string | null; cols: ColLabels;
  addLabel: string; onDetail: (s: string) => void; onAdd: (s: string) => void;
}) {
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
            <div style={{ width: 76, flex: "0 0 76px" }} />
          </div>
          {p.rows.map((r, i) => {
            const g = gradeFor(r.ai);
            return (
              <div key={r.symbol} onClick={() => p.onDetail(r.symbol)} className="flex items-center cursor-pointer"
                style={{ minHeight: ROW_H, borderLeft: `4px solid ${actionColor(r.action)}`, background: p.selected === r.symbol ? TERM.selected : i % 2 ? TERM.zebra : COLORS.card, padding: `0 ${SP.md - 4}px`, gap: SP.sm, borderBottom: `1px solid ${TERM.gridLine}` }}
                onMouseEnter={(e) => { if (p.selected !== r.symbol) e.currentTarget.style.background = TERM.hover; }}
                onMouseLeave={(e) => { if (p.selected !== r.symbol) e.currentTarget.style.background = i % 2 ? TERM.zebra : COLORS.card; }}>
                <div className="flex items-center gap-1.5" style={{ flex: 1, minWidth: 0 }}>
                  <span className="tabular-nums" style={{ fontSize: 11, color: COLORS.textFaint, width: 30 }}>#{r.rank}</span>
                  {r.rankDelta && <span className="tabular-nums" style={{ fontSize: 10, fontWeight: 700, color: r.deltaTone === "green" ? COLORS.success : r.deltaTone === "red" ? COLORS.danger : "#F5A623" }}>{r.rankDelta}</span>}
                  <div style={{ minWidth: 0 }}>
                    <div className="truncate" style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, lineHeight: 1.25 }}>{r.name}</div>
                    <div className="tabular-nums" style={{ fontSize: 10.5, color: COLORS.textFaint }}>{r.symbol}</div>
                  </div>
                </div>
                <Cell w={COLW.action}><span style={{ fontSize: 11, fontWeight: 700, color: actionColor(r.action), background: `${actionColor(r.action)}18`, padding: "2px 7px", borderRadius: 6 }}>{r.actionLabel}</span></Cell>
                <Cell w={COLW.current} align="right" mono><b>{r.price}</b></Cell>
                <Cell w={COLW.pnl} align="right" mono color={r.changeTone === "red" ? COLORS.danger : r.changeTone === "green" ? COLORS.success : COLORS.textFaint}>{r.changePct}</Cell>
                <Cell w={COLW.entry} align="right" mono color={COLORS.textSecondary}>{r.entry}</Cell>
                <Cell w={COLW.target} align="right" mono color={COLORS.textSecondary}>{r.target}</Cell>
                <Cell w={COLW.stop} align="right" mono color={COLORS.danger}>{r.stop}</Cell>
                <Cell w={COLW.ai} align="right"><span className="tabular-nums" style={{ fontSize: 12.5, fontWeight: 700, color: g.color }}>{g.grade}</span> <span className="tabular-nums" style={{ fontSize: 10.5, color: COLORS.textFaint }}>{r.ai != null ? Math.round(r.ai) : "—"}</span></Cell>
                <div className="flex items-center justify-end" style={{ width: 76, flex: "0 0 76px" }}>
                  {miniBtn(p.addLabel, COLORS.success, (e) => { e.stopPropagation(); p.onAdd(r.symbol); })}
                </div>
              </div>
            );
          })}
        </>
      )}
    </Card>
  );
}

// ── ⑬ 系统状态（改名自「数据新鲜度」）───────────────────────────────────────
export function SystemStatus(p: { title: string; items: { label: string; status: string; value: string; dot: string }[] }) {
  return (
    <Card style={{ padding: SP.md - 4 }}>
      <div style={{ fontSize: 11, letterSpacing: "0.05em", color: COLORS.textFaint, fontWeight: 600, textTransform: "uppercase", marginBottom: SP.sm }}>{p.title}</div>
      <div className="space-y-2">
        {p.items.map((it, i) => (
          <div key={i} className="flex items-center gap-2" style={{ fontSize: 12 }}>
            <span style={{ color: COLORS.textFaint, width: 60 }}>{it.label}</span>
            <span className="flex items-center gap-1.5" style={{ flex: 1 }}><span style={{ width: 7, height: 7, borderRadius: 7, background: it.dot }} /><span style={{ color: COLORS.textSecondary }}>{it.status}</span></span>
            <b className="tabular-nums" style={{ color: COLORS.text }}>{it.value}</b>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── ⑧ 历史交易 ─────────────────────────────────────────────────────────────
export interface HistoryRow { symbol: string; name: string; sellDate: string; returnPct: string; retTone: Tone; pnl: string; days: string; reason: string; beatTopix: boolean | null; beatNikkei: boolean | null; }
export function HistoryPanel(p: { title: string; emptyLabel: string; rows: HistoryRow[]; cols: { date: string; pnl: string; days: string; vs: string } }) {
  return (
    <Card>
      <SectionHead title={p.title} count={p.rows.length} />
      {p.rows.length === 0 ? <div style={{ padding: `${SP.sm}px ${SP.md - 4}px`, fontSize: 12, color: COLORS.textFaint }}>{p.emptyLabel}</div> : p.rows.map((r, i) => (
        <div key={i} className="flex items-center" style={{ minHeight: 44, background: i % 2 ? TERM.zebra : COLORS.card, padding: `0 ${SP.md - 4}px`, gap: SP.sm, borderBottom: `1px solid ${TERM.gridLine}`, fontSize: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}><b className="tabular-nums" style={{ fontSize: 13, color: COLORS.text }}>{r.symbol}</b> <span style={{ color: COLORS.textFaint }}>{r.name}</span></div>
          <span className="tabular-nums" style={{ width: 90, color: COLORS.textFaint }}>{r.sellDate}</span>
          <b className="tabular-nums" style={{ width: 70, textAlign: "right", color: r.retTone === "red" ? COLORS.danger : COLORS.success }}>{r.returnPct}</b>
          <span className="tabular-nums" style={{ width: 80, textAlign: "right", color: COLORS.textSecondary }}>{r.pnl}</span>
          <span className="tabular-nums" style={{ width: 50, textAlign: "right", color: COLORS.textFaint }}>{r.days}</span>
          <span style={{ width: 80, textAlign: "right" }}>{r.reason}</span>
          <span className="flex items-center gap-1 justify-end" style={{ width: 72 }}>
            {r.beatTopix != null && <span style={{ fontSize: 10, color: r.beatTopix ? COLORS.success : COLORS.textFaint }}>TPX{r.beatTopix ? "✓" : "✗"}</span>}
            {r.beatNikkei != null && <span style={{ fontSize: 10, color: r.beatNikkei ? COLORS.success : COLORS.textFaint }}>NK{r.beatNikkei ? "✓" : "✗"}</span>}
          </span>
        </div>
      ))}
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
