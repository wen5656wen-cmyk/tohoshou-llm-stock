"use client";

// ── TOHOSHOU AI · UI Kit（数据展示）── P4-T2 ─────────────────────────────────
// KpiCard / Table / EmptyState / Loading / Timeline / StackBar。构建于 design-tokens。

import type { ReactNode } from "react";
import { COLORS, RADIUS, SHADOW, BORDER, FONT, toneColor, type Tone } from "@/lib/design-tokens";

// ── AppKpiCard ────────────────────────────────────────────────────────────────
export function AppKpiCard({ label, value, sub, tone = "neutral" }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone }) {
  const c = tone === "neutral" ? COLORS.text : toneColor(tone);
  return (
    <div style={{ background: COLORS.card, border: BORDER.hairline, borderRadius: RADIUS.lg, boxShadow: SHADOW.sm, padding: 18 }}>
      <div className="truncate" style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>{label}</div>
      <div className="tabular-nums" style={{ ...FONT.metric, color: c, marginTop: 8, lineHeight: 1.1 }}>{value}</div>
      {sub != null && <div className="tabular-nums truncate" style={{ fontSize: 11, color: COLORS.textFaint, marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

export function AppKpiGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">{children}</div>;
}

// ── AppTable（Apple 风表格）───────────────────────────────────────────────────
export function AppTable({ minWidth, children }: { minWidth?: number; children: ReactNode }) {
  return (
    <div className="overflow-auto" style={{ border: BORDER.hairline, background: COLORS.card, borderRadius: RADIUS.lg }}>
      <table className="w-full" style={{ fontSize: 12, minWidth: minWidth ? `${minWidth}px` : undefined, borderCollapse: "collapse" }}>{children}</table>
    </div>
  );
}
export function AppTh({ children, align = "left", sortable, active, dir, onClick }: { children: ReactNode; align?: "left" | "right" | "center"; sortable?: boolean; active?: boolean; dir?: "asc" | "desc"; onClick?: () => void }) {
  return (
    <th onClick={sortable ? onClick : undefined} className={`px-3 py-2.5 whitespace-nowrap ${sortable ? "cursor-pointer select-none" : ""}`}
      style={{ textAlign: align, fontWeight: 600, color: active ? COLORS.text : COLORS.textMuted, background: COLORS.tile, borderBottom: BORDER.hairline, position: "sticky", top: 0, zIndex: 1 }}>
      {children}{sortable && active ? (dir === "desc" ? " ↓" : " ↑") : ""}
    </th>
  );
}
export function AppTd({ children, align = "left", color, mono }: { children: ReactNode; align?: "left" | "right" | "center"; color?: string; mono?: boolean }) {
  return <td className={`px-3 py-2 ${mono ? "tabular-nums" : ""}`} style={{ textAlign: align, color: color ?? COLORS.text, borderBottom: BORDER.soft }}>{children}</td>;
}
// <tr> hover（Tailwind 任意值，底色 = tile）
export const appRowHover = "hover:bg-[#F4F5F7] transition-colors";

// ── AppEmptyState ─────────────────────────────────────────────────────────────
export function AppEmptyState({ title, desc, actions, icon = "◍" }: { title: string; desc?: string; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-3 py-16 px-6" style={{ background: COLORS.card, border: `1px dashed ${COLORS.border}`, borderRadius: RADIUS.xl }}>
      <div className="flex items-center justify-center" style={{ width: 48, height: 48, borderRadius: RADIUS.lg, background: COLORS.tile, color: COLORS.textFaint, fontSize: 20 }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.text }}>{title}</div>
      {desc && <div className="max-w-md" style={{ ...FONT.description, color: COLORS.textMuted }}>{desc}</div>}
      {actions && <div className="mt-1 flex items-center gap-2 flex-wrap justify-center">{actions}</div>}
    </div>
  );
}

// ── AppLoading ────────────────────────────────────────────────────────────────
export function AppLoading({ label = "加载中…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16" style={{ background: COLORS.card, border: BORDER.hairline, borderRadius: RADIUS.xl, boxShadow: SHADOW.md }}>
      <div className="animate-spin" style={{ width: 28, height: 28, borderRadius: RADIUS.pill, border: `2.5px solid ${COLORS.border}`, borderTopColor: COLORS.primary }} />
      <div style={{ ...FONT.description, color: COLORS.textMuted }}>{label}</div>
    </div>
  );
}

// ── AppTimeline（垂直连线步骤）────────────────────────────────────────────────
export type AppTimelineStep = { label: string; sub?: ReactNode; right?: ReactNode; state: "done" | "current" | "waiting" };
export function AppTimeline({ steps }: { steps: AppTimelineStep[] }) {
  const dot = (s: AppTimelineStep["state"]) => (s === "done" ? COLORS.success : s === "current" ? COLORS.primary : COLORS.textFaint);
  return (
    <div className="relative">
      {steps.map((s, i) => {
        const c = dot(s.state);
        return (
          <div key={i} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className="shrink-0 mt-1.5" style={{ width: 12, height: 12, borderRadius: RADIUS.pill, background: s.state === "waiting" ? COLORS.card : c, border: `2px solid ${c}` }} />
              {i < steps.length - 1 && <span className="flex-1 my-1" style={{ width: 1, background: COLORS.border }} />}
            </div>
            <div className="flex-1 min-w-0 pb-4">
              <div className="flex items-center justify-between gap-3">
                <span style={{ fontSize: 13, fontWeight: 600, color: s.state === "waiting" ? COLORS.textFaint : COLORS.text }}>{s.label}</span>
                {s.right}
              </div>
              {s.sub != null && <div style={{ fontSize: 12, marginTop: 2, color: COLORS.textFaint }}>{s.sub}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── AppStackBar（堆叠分布条 + 图例）───────────────────────────────────────────
export function AppStackBar({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div>
      <div className="flex overflow-hidden" style={{ height: 32, borderRadius: RADIUS.md, border: BORDER.hairline }}>
        {segments.map((s) => s.value > 0 && <div key={s.label} title={`${s.label} ${s.value}`} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} />)}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5" style={{ marginTop: 10 }}>
        {segments.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5" style={{ fontSize: 12, color: COLORS.textSecondary }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color }} />
            {s.label} <b className="tabular-nums" style={{ color: COLORS.text }}>{s.value.toLocaleString()}</b>
            <span style={{ color: COLORS.textFaint }}>({((s.value / total) * 100).toFixed(1)}%)</span>
          </span>
        ))}
      </div>
    </div>
  );
}
