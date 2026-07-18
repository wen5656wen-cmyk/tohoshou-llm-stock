"use client";

// ── Decision Overview V1 专用展示组件（P15-01B）───────────────────────────────
// 纯展示（哑组件）：所有 i18n 文案由 DecisionOverviewV2 解析后以字符串传入，
// 组件不 import i18n，符合既有 panels.tsx 约定。行动优先 → 执行对象 → 依据。
import type { ReactNode } from "react";
import { AppBadge } from "@/components/ui";
import { COLORS } from "@/lib/decision/ds";
import type { Tone } from "@/lib/design-tokens";

function Card({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 16, ...style }}>
      {children}
    </div>
  );
}
const Eyebrow = ({ children }: { children: ReactNode }) => (
  <div style={{ fontSize: 11, letterSpacing: "0.06em", color: COLORS.textFaint, fontWeight: 600, textTransform: "uppercase", marginBottom: 10 }}>{children}</div>
);

// ── ① 全宽全局决策卡（行动优先）───────────────────────────────────────────────
export interface ActionHeroProps {
  title: string; icon: string; actionLabel: string; tone: Tone; instruction: string;
  totalPosLabel: string; totalPos: string; addPosLabel: string; addPos: string; maxSingleLabel: string; maxSingle: string;
  riskLabel: string; risk: string; riskTone: Tone; confLabel: string; confidence: string; phaseLabel: string; phase: string;
  executable: boolean; execLabel: string; blockedLabel: string | null; freshLine: string;
}
export function ActionHero(p: ActionHeroProps) {
  const stripe = p.blockedLabel ? COLORS.danger : p.executable ? COLORS.success : COLORS.warning;
  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ display: "flex" }}>
        <div style={{ width: 4, background: stripe, flexShrink: 0 }} />
        <div style={{ flex: 1, padding: "16px 20px" }}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <Eyebrow>{p.title}</Eyebrow>
            <span className="flex items-center gap-2 text-[11px]" style={{ color: COLORS.textFaint }}>
              <AppBadge tone={p.blockedLabel ? "red" : p.executable ? "green" : "amber"}>{p.blockedLabel ?? p.execLabel}</AppBadge>
              <span>{p.phaseLabel} {p.phase}</span>
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span style={{ fontSize: 26, lineHeight: 1 }}>{p.icon}</span>
            <span style={{ fontSize: 24, fontWeight: 800, color: COLORS.text }}>{p.actionLabel}</span>
          </div>
          <div className="mt-1.5" style={{ fontSize: 14, color: COLORS.textSecondary }}>{p.instruction}</div>
          <div className="flex items-center flex-wrap gap-x-6 gap-y-2 mt-3.5" style={{ fontSize: 13 }}>
            <Metric label={p.totalPosLabel} value={p.totalPos} />
            <Metric label={p.addPosLabel} value={p.addPos} />
            <Metric label={p.maxSingleLabel} value={p.maxSingle} />
            <Metric label={p.riskLabel} value={p.risk} tone={p.riskTone} />
            <Metric label={p.confLabel} value={p.confidence} accent />
          </div>
          <div className="mt-3" style={{ fontSize: 11, color: COLORS.textFaint }}>{p.freshLine}</div>
        </div>
      </div>
    </Card>
  );
}
function Metric({ label, value, tone, accent }: { label: string; value: string; tone?: Tone; accent?: boolean }) {
  const c = tone === "red" ? COLORS.danger : tone === "amber" ? COLORS.warning : tone === "green" ? COLORS.success : accent ? COLORS.primary : COLORS.text;
  return (
    <span className="flex items-baseline gap-1.5">
      <span style={{ color: COLORS.textFaint }}>{label}</span>
      <b style={{ color: c, fontSize: 15, fontWeight: 700 }}>{value}</b>
    </span>
  );
}

// ── ② 持仓动作（止损/减仓优先置顶）───────────────────────────────────────────
export interface HoldRow {
  symbol: string; name: string; actionLabel: string; tone: Tone; sellPctLabel: string;
  returnPct: string; returnTone: Tone; costLabel: string; priceLabel: string; reason: string;
}
export function HoldingsActionPanel(p: { title: string; emptyLabel: string; rows: HoldRow[] }) {
  return (
    <Card>
      <Eyebrow>{p.title}</Eyebrow>
      {p.rows.length === 0 ? (
        <div style={{ fontSize: 13, color: COLORS.textFaint }}>{p.emptyLabel}</div>
      ) : (
        <div className="space-y-2">
          {p.rows.map((r) => (
            <div key={r.symbol} className="flex items-center justify-between gap-2 flex-wrap" style={{ fontSize: 13 }}>
              <span className="flex items-center gap-2 min-w-0">
                <AppBadge tone={r.tone}>{r.actionLabel}</AppBadge>
                <b style={{ color: COLORS.text }}>{r.name}</b>
                <span className="tabular-nums" style={{ color: COLORS.textFaint }}>{r.symbol}</span>
              </span>
              <span className="flex items-center gap-3 tabular-nums">
                <span style={{ color: COLORS.textFaint }}>{r.costLabel}→{r.priceLabel}</span>
                <b style={{ color: r.returnTone === "red" ? COLORS.danger : COLORS.success }}>{r.returnPct}</b>
                <span style={{ color: COLORS.warning }}>{r.sellPctLabel}</span>
              </span>
              <span className="w-full" style={{ fontSize: 11, color: COLORS.textFaint }}>{r.reason}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── ③ 分组候选（立即执行 / 等待条件 / 备用替补）─────────────────────────────
export interface PickRow {
  rank: string; symbol: string; name: string; price: string; changePct: string; changeTone: Tone;
  actionLabel: string; tone: Tone; entry: string; target: string; stop: string; pos: string;
  trigger: string; score: string;
  rankDelta?: string;        // "↑3" / "↓2" / NEW 标签
  deltaTone?: Tone;          // 涨→green 跌→red 新→amber
  replaceReason?: string;    // 进入/上升原因
}
export function PickGroup(p: { title: string; tone: Tone; count: number; rows: PickRow[]; labels: { buy: string; target: string; stop: string; validUntil: string; validValue: string } }) {
  const bar = p.tone === "green" ? COLORS.success : p.tone === "amber" ? COLORS.warning : COLORS.textFaint;
  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
        <span style={{ width: 8, height: 8, borderRadius: 8, background: bar }} />
        <b style={{ fontSize: 13, color: COLORS.text }}>{p.title}</b>
        <span style={{ fontSize: 12, color: COLORS.textFaint }}>{p.count}</span>
      </div>
      {p.rows.length === 0 ? (
        <div className="px-4 py-3" style={{ fontSize: 12, color: COLORS.textFaint }}>—</div>
      ) : (
        <div>
          {p.rows.map((r) => (
            <div key={r.symbol} className="px-4 py-3" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="tabular-nums" style={{ fontSize: 11, color: COLORS.textFaint }}>#{r.rank}</span>
                  {r.rankDelta && (
                    <span className="tabular-nums" style={{ fontSize: 10, fontWeight: 700, color: r.deltaTone === "green" ? COLORS.success : r.deltaTone === "red" ? COLORS.danger : COLORS.warning }}>{r.rankDelta}</span>
                  )}
                  <b style={{ fontSize: 14, color: COLORS.text }}>{r.name}</b>
                  <span className="tabular-nums" style={{ fontSize: 11, color: COLORS.textFaint }}>{r.symbol}</span>
                  <AppBadge tone={r.tone}>{r.actionLabel}</AppBadge>
                  {r.replaceReason && <span style={{ fontSize: 10, color: COLORS.textFaint }}>· {r.replaceReason}</span>}
                </span>
                <span className="flex items-center gap-2 tabular-nums" style={{ fontSize: 13 }}>
                  <b style={{ color: COLORS.text }}>{r.price}</b>
                  <span style={{ color: r.changeTone === "red" ? COLORS.danger : r.changeTone === "green" ? COLORS.success : COLORS.textFaint }}>{r.changePct}</span>
                </span>
              </div>
              <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mt-1.5 tabular-nums" style={{ fontSize: 11, color: COLORS.textSecondary }}>
                <span>{p.labels.buy} {r.entry}</span>
                <span>{p.labels.target} {r.target}</span>
                <span>{p.labels.stop} {r.stop}</span>
                <span>{r.pos}</span>
                <span style={{ color: COLORS.textFaint }}>{p.labels.validUntil} {p.labels.validValue}</span>
              </div>
              <div className="mt-1" style={{ fontSize: 11, color: COLORS.textFaint }}>{r.trigger}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── ④ 数据新鲜度（6 时间戳分离）─────────────────────────────────────────────
export function FreshnessPanel(p: { title: string; items: { label: string; value: string; tone?: Tone }[] }) {
  return (
    <Card>
      <Eyebrow>{p.title}</Eyebrow>
      <div className="grid grid-cols-2 gap-y-2 gap-x-3" style={{ fontSize: 12 }}>
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

// ── ⑤ Top200 漏斗摘要（底部，一行）──────────────────────────────────────────
export function FunnelBar(p: { title: string; steps: { label: string; value: string }[] }) {
  return (
    <Card style={{ padding: "10px 16px" }}>
      <div className="flex items-center flex-wrap gap-x-2 gap-y-1" style={{ fontSize: 12 }}>
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
