"use client";

// ── Research UI 套件（Apple Dashboard 浅色）────────────────────────────────────
// 展示层组件，供 AI 研究中心各面板共享。纯 UI，不含数据获取/业务逻辑。
// 统一设计语言：Apple / Stripe / Linear / OpenAI Platform 浅色后台。
// 所有面板复用这里的组件，禁止复制 JSX。

import type { ReactNode, CSSProperties } from "react";
import { COLORS, SHADOW as TOK_SHADOW } from "@/lib/design-tokens";
import { useI18n } from "@/lib/i18n";

// 研究中心调色板 —— 现由全站 Design Tokens 派生（单一来源，P4-T2），值不变。
export const RM = {
  bg: COLORS.background,
  panel: COLORS.card,
  card: COLORS.card,
  tile: COLORS.tile,
  track: COLORS.track,
  border: COLORS.border,
  borderSoft: COLORS.borderSoft,
  blue: COLORS.primary,
  green: COLORS.success,
  amber: COLORS.warning,
  red: COLORS.danger,
  purple: COLORS.purple,
  ink: COLORS.text,
  sub: COLORS.textSecondary,
  muted: COLORS.textMuted,
  faint: COLORS.textFaint,
} as const;

export const SHADOW = TOK_SHADOW.md;
export const SHADOW_SM = TOK_SHADOW.sm;
const R_CARD = 22;
const R_TILE = 16;

export type Tone = "neutral" | "blue" | "green" | "amber" | "red";

const TONE_COLOR: Record<Tone, string> = {
  neutral: RM.sub,
  blue: RM.blue,
  green: RM.green,
  amber: RM.amber,
  red: RM.red,
};

// ── Status badge ──────────────────────────────────────────────────────────────
export function ResearchStatusBadge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  const c = TONE_COLOR[tone];
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 h-[22px] rounded-full whitespace-nowrap"
      style={{ background: `${c}14`, color: c, border: `1px solid ${c}29` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />
      {children}
    </span>
  );
}

// ── Panel shell — vertical rhythm wrapper ─────────────────────────────────────
export function ResearchPanelShell({ children }: { children: ReactNode }) {
  return <div className="space-y-5">{children}</div>;
}

// ── Hero ──────────────────────────────────────────────────────────────────────
export function ResearchHero({
  title, titleEn, subtitle, statusText, statusTone = "neutral", metaLabel, metaValue, action,
}: {
  title: string; titleEn: string; subtitle: string; statusText: string; statusTone?: Tone;
  metaLabel: string; metaValue: string; action?: ReactNode;
}) {
  return (
    <div
      className="px-6 py-5 flex flex-col lg:flex-row lg:items-center gap-4"
      style={{ background: RM.panel, border: `1px solid ${RM.border}`, borderRadius: R_CARD, boxShadow: SHADOW }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]" style={{ color: RM.ink }}>{title}</h1>
          <span className="text-[12px] font-medium" style={{ color: RM.faint }}>{titleEn}</span>
          <ResearchStatusBadge tone={statusTone}>{statusText}</ResearchStatusBadge>
        </div>
        <p className="mt-1.5 text-[13px]" style={{ color: RM.muted }}>{subtitle}</p>
        <div className="mt-2 text-[12px]" style={{ color: RM.faint }}>
          {metaLabel}
          <span className="ml-1.5 tabular-nums" style={{ color: RM.sub }}>{metaValue}</span>
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ── Buttons ───────────────────────────────────────────────────────────────────
export function ResearchButton({
  onClick, children, variant = "ghost", disabled,
}: { onClick?: () => void; children: ReactNode; variant?: "primary" | "ghost"; disabled?: boolean }) {
  const base = "text-[13px] font-semibold px-4 h-9 rounded-full transition-all inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed";
  const style: CSSProperties =
    variant === "primary"
      ? { background: RM.blue, color: "#fff", boxShadow: SHADOW_SM }
      : { background: RM.panel, color: RM.ink, border: `1px solid ${RM.border}`, boxShadow: SHADOW_SM };
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={base} style={style}>
      {children}
    </button>
  );
}

// ── KPI ───────────────────────────────────────────────────────────────────────
export function ResearchKpiGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">{children}</div>;
}

export function ResearchKpiCard({
  label, value, sub, tone = "neutral",
}: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone }) {
  const valColor = tone === "neutral" ? RM.ink : TONE_COLOR[tone];
  return (
    <div className="px-4 py-3.5" style={{ background: RM.card, border: `1px solid ${RM.border}`, borderRadius: R_TILE, boxShadow: SHADOW_SM }}>
      <div className="text-[11px] font-medium truncate" style={{ color: RM.muted }}>{label}</div>
      <div className="mt-1.5 text-[24px] font-semibold leading-none tabular-nums tracking-[-0.02em]" style={{ color: valColor }}>{value}</div>
      {sub != null && <div className="mt-1.5 text-[11px] tabular-nums truncate" style={{ color: RM.faint }}>{sub}</div>}
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────
export function ResearchSection({
  title, desc, right, children,
}: { title: string; desc?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="overflow-hidden" style={{ background: RM.panel, border: `1px solid ${RM.border}`, borderRadius: R_CARD, boxShadow: SHADOW }}>
      <header className="flex items-center justify-between gap-3 px-5 py-3.5" style={{ borderBottom: `1px solid ${RM.borderSoft}` }}>
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold" style={{ color: RM.ink }}>{title}</h2>
          {desc && <p className="text-[12px] mt-0.5 truncate" style={{ color: RM.faint }}>{desc}</p>}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

// ── Chip ──────────────────────────────────────────────────────────────────────
export function ResearchChip({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  const c = TONE_COLOR[tone];
  return (
    <span
      className="inline-flex items-center text-[12px] font-medium px-2.5 h-7 rounded-lg whitespace-nowrap"
      style={{ background: RM.tile, color: tone === "neutral" ? RM.sub : c, border: `1px solid ${RM.border}` }}
    >
      {children}
    </span>
  );
}

// ── Table primitives ──────────────────────────────────────────────────────────
export function ResearchTable({ minWidth, children }: { minWidth?: number; children: ReactNode }) {
  return (
    <div className="overflow-auto" style={{ border: `1px solid ${RM.border}`, background: RM.card, borderRadius: R_TILE }}>
      <table className="w-full text-[12px]" style={{ minWidth: minWidth ? `${minWidth}px` : undefined, borderCollapse: "collapse" }}>
        {children}
      </table>
    </div>
  );
}

export function RTh({
  children, align = "left", sortable, active, dir, onClick, title,
}: {
  children: ReactNode; align?: "left" | "right" | "center"; sortable?: boolean;
  active?: boolean; dir?: "asc" | "desc"; onClick?: () => void; title?: string;
}) {
  return (
    <th
      onClick={sortable ? onClick : undefined}
      title={title}
      className={`px-3 py-2.5 font-semibold whitespace-nowrap ${sortable ? "cursor-pointer select-none" : ""}`}
      style={{ textAlign: align, color: active ? RM.ink : RM.muted, background: RM.tile, borderBottom: `1px solid ${RM.border}`, position: "sticky", top: 0, zIndex: 1 }}
    >
      {children}
      {sortable && active ? (dir === "desc" ? " ↓" : " ↑") : ""}
    </th>
  );
}

export function RTd({
  children, align = "left", color, mono,
}: { children: ReactNode; align?: "left" | "right" | "center"; color?: string; mono?: boolean }) {
  return (
    <td className={`px-3 py-2 ${mono ? "tabular-nums" : ""}`} style={{ textAlign: align, color: color ?? RM.ink, borderBottom: `1px solid ${RM.borderSoft}` }}>
      {children}
    </td>
  );
}

// hover styling for <tr> rows (Tailwind arbitrary value → no global CSS needed)
export const rowHoverClass = "hover:bg-[#F5F6F8] transition-colors";

// ── States ────────────────────────────────────────────────────────────────────
export function ResearchLoadingState({ label }: { label?: string }) {
  const { t } = useI18n();
  const text = label ?? t("common.loading");
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16" style={{ background: RM.panel, border: `1px solid ${RM.border}`, borderRadius: R_CARD, boxShadow: SHADOW }}>
      <div className="w-7 h-7 rounded-full animate-spin" style={{ border: `2.5px solid ${RM.border}`, borderTopColor: RM.blue }} />
      <div className="text-[13px]" style={{ color: RM.muted }}>{text}</div>
    </div>
  );
}

export function ResearchEmptyState({ title, desc, actions }: { title: string; desc?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-3 py-16 px-6" style={{ background: RM.panel, border: `1px dashed ${RM.border}`, borderRadius: R_CARD }}>
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-[20px]" style={{ background: RM.tile, color: RM.faint }}>◍</div>
      <div className="text-[15px] font-semibold" style={{ color: RM.ink }}>{title}</div>
      {desc && <div className="text-[13px] max-w-md" style={{ color: RM.muted }}>{desc}</div>}
      {actions && <div className="mt-1 flex items-center gap-2 flex-wrap justify-center">{actions}</div>}
    </div>
  );
}

export function ResearchErrorState({ message, hint, actions }: { message: string; hint?: ReactNode; actions?: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="px-6 py-8 flex flex-col items-center text-center gap-2" style={{ background: `${RM.red}0d`, border: `1px solid ${RM.red}33`, borderRadius: R_CARD }}>
      <div className="text-[14px] font-semibold" style={{ color: RM.red }}>{t("common.load_error")}</div>
      <div className="text-[13px]" style={{ color: RM.sub }}>{message}</div>
      {hint && <div className="text-[12px] mt-0.5" style={{ color: RM.faint }}>{hint}</div>}
      {actions && <div className="mt-2 flex items-center gap-2 flex-wrap justify-center">{actions}</div>}
    </div>
  );
}

// ── Insight card ──────────────────────────────────────────────────────────────
export function ResearchInsightCard({ title, tone = "blue", children }: { title: string; tone?: Tone; children: ReactNode }) {
  const c = TONE_COLOR[tone];
  const neutral = tone === "neutral";
  return (
    <div className="px-4 py-3.5" style={{ background: neutral ? RM.card : `${c}0a`, border: `1px solid ${neutral ? RM.border : `${c}26`}`, borderRadius: R_TILE }}>
      <div className="flex items-center gap-2 text-[12px] font-semibold" style={{ color: c }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />
        {title}
      </div>
      <div className="mt-2 text-[13px] leading-relaxed" style={{ color: RM.sub }}>{children}</div>
    </div>
  );
}

// ── Timeline (vertical connected steps) ──────────────────────────────────────
export type TimelineStep = { label: string; sub?: ReactNode; right?: ReactNode; state: "done" | "current" | "waiting" };
export function ResearchTimeline({ steps }: { steps: TimelineStep[] }) {
  const dot = (s: TimelineStep["state"]) => (s === "done" ? RM.green : s === "current" ? RM.blue : RM.faint);
  return (
    <div className="relative">
      {steps.map((s, i) => {
        const c = dot(s.state);
        return (
          <div key={i} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className="w-3 h-3 rounded-full shrink-0 mt-1.5" style={{ background: s.state === "waiting" ? RM.panel : c, border: `2px solid ${c}` }} />
              {i < steps.length - 1 && <span className="w-px flex-1 my-1" style={{ background: RM.border }} />}
            </div>
            <div className="flex-1 min-w-0 pb-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] font-semibold" style={{ color: s.state === "waiting" ? RM.faint : RM.ink }}>{s.label}</span>
                {s.right}
              </div>
              {s.sub != null && <div className="text-[12px] mt-0.5" style={{ color: RM.faint }}>{s.sub}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// stacked distribution bar (segments sum to 100%)
export function ResearchStackBar({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div>
      <div className="flex h-8 rounded-lg overflow-hidden" style={{ border: `1px solid ${RM.border}` }}>
        {segments.map((s) => s.value > 0 && (
          <div key={s.label} title={`${s.label} ${s.value}`} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2.5">
        {segments.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: RM.sub }}>
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label} <b className="tabular-nums" style={{ color: RM.ink }}>{s.value.toLocaleString()}</b>
            <span style={{ color: RM.faint }}>({((s.value / total) * 100).toFixed(1)}%)</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// segmented control (pill track + active tab) — light Apple style
export function ResearchSegmented<T extends string | number>({
  options, value, onChange,
}: { options: { key: T; label: string }[]; value: T; onChange: (k: T) => void }) {
  return (
    <div className="inline-flex p-1 rounded-full" style={{ background: RM.track, border: `1px solid ${RM.border}` }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button key={String(o.key)} onClick={() => onChange(o.key)}
            className="text-[12px] font-semibold px-3.5 h-7 rounded-full transition-all"
            style={on ? { background: RM.panel, color: RM.ink, boxShadow: SHADOW_SM } : { color: RM.sub, background: "transparent" }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// return-value color helper (green up / red down / neutral)
export function retColor(v: number | null | undefined): string {
  if (v == null) return RM.faint;
  if (v > 0) return RM.green;
  if (v < 0) return RM.red;
  return RM.sub;
}
