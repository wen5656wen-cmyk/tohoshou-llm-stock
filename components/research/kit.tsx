"use client";

// ── Research Terminal 深色 UI 套件 ────────────────────────────────────────────
// 展示层组件，供 AI 研究中心各深色面板共享（首用于 因子研究组：Alpha因子库 / 因子分析）。
// 纯 UI，不含任何数据获取 / 业务逻辑。所有面板复用这里的组件，禁止复制 JSX。
// 内联 style 使用统一 M 调色板（与 ResearchNav 一致）。

import type { ReactNode, CSSProperties } from "react";

export const RM = {
  bg: "#111315",
  panel: "#15181D",
  card: "#171A1F",
  border: "#2A3038",
  borderSoft: "#20242B",
  blue: "#0A84FF",
  green: "#34C759",
  amber: "#FF9F0A",
  red: "#FF453A",
  ink: "#E6E8EB",
  sub: "#9BA1A9",
  muted: "#8B949E",
  faint: "#6B7280",
} as const;

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
      style={{ background: `${c}1f`, color: c, border: `1px solid ${c}33` }}
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
  title,
  titleEn,
  subtitle,
  statusText,
  statusTone = "neutral",
  metaLabel,
  metaValue,
  action,
}: {
  title: string;
  titleEn: string;
  subtitle: string;
  statusText: string;
  statusTone?: Tone;
  metaLabel: string;
  metaValue: string;
  action?: ReactNode;
}) {
  return (
    <div
      className="rounded-2xl px-6 py-5 flex flex-col lg:flex-row lg:items-center gap-4"
      style={{ background: RM.panel, border: `1px solid ${RM.border}` }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]" style={{ color: RM.ink }}>
            {title}
          </h1>
          <span className="text-[12px] font-medium" style={{ color: RM.faint }}>
            {titleEn}
          </span>
          <ResearchStatusBadge tone={statusTone}>{statusText}</ResearchStatusBadge>
        </div>
        <p className="mt-1.5 text-[13px]" style={{ color: RM.muted }}>
          {subtitle}
        </p>
        <div className="mt-2 text-[12px]" style={{ color: RM.faint }}>
          {metaLabel}
          <span className="ml-1.5 tabular-nums" style={{ color: RM.sub }}>
            {metaValue}
          </span>
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ── Buttons ───────────────────────────────────────────────────────────────────
export function ResearchButton({
  onClick,
  children,
  variant = "ghost",
  disabled,
}: {
  onClick?: () => void;
  children: ReactNode;
  variant?: "primary" | "ghost";
  disabled?: boolean;
}) {
  const base = "text-[13px] font-semibold px-4 h-9 rounded-lg transition-all inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed";
  const style: CSSProperties =
    variant === "primary"
      ? { background: RM.blue, color: "#fff" }
      : { background: RM.card, color: RM.ink, border: `1px solid ${RM.border}` };
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
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
}) {
  const valColor = tone === "neutral" ? RM.ink : TONE_COLOR[tone];
  return (
    <div className="rounded-xl px-4 py-3.5" style={{ background: RM.card, border: `1px solid ${RM.border}` }}>
      <div className="text-[11px] font-medium truncate" style={{ color: RM.muted }}>
        {label}
      </div>
      <div className="mt-1.5 text-[24px] font-semibold leading-none tabular-nums tracking-[-0.02em]" style={{ color: valColor }}>
        {value}
      </div>
      {sub != null && (
        <div className="mt-1.5 text-[11px] tabular-nums truncate" style={{ color: RM.faint }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────
export function ResearchSection({
  title,
  desc,
  right,
  children,
}: {
  title: string;
  desc?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl overflow-hidden" style={{ background: RM.panel, border: `1px solid ${RM.border}` }}>
      <header
        className="flex items-center justify-between gap-3 px-5 py-3.5"
        style={{ borderBottom: `1px solid ${RM.borderSoft}` }}
      >
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold" style={{ color: RM.ink }}>
            {title}
          </h2>
          {desc && (
            <p className="text-[12px] mt-0.5 truncate" style={{ color: RM.faint }}>
              {desc}
            </p>
          )}
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
      style={{ background: RM.card, color: tone === "neutral" ? RM.sub : c, border: `1px solid ${RM.border}` }}
    >
      {children}
    </span>
  );
}

// ── Table primitives ──────────────────────────────────────────────────────────
export function ResearchTable({ minWidth, children }: { minWidth?: number; children: ReactNode }) {
  return (
    <div className="rounded-xl overflow-auto" style={{ border: `1px solid ${RM.border}`, background: RM.card }}>
      <table className="w-full text-[12px]" style={{ minWidth: minWidth ? `${minWidth}px` : undefined, borderCollapse: "collapse" }}>
        {children}
      </table>
    </div>
  );
}

export function RTh({
  children,
  align = "left",
  sortable,
  active,
  dir,
  onClick,
  title,
}: {
  children: ReactNode;
  align?: "left" | "right" | "center";
  sortable?: boolean;
  active?: boolean;
  dir?: "asc" | "desc";
  onClick?: () => void;
  title?: string;
}) {
  return (
    <th
      onClick={sortable ? onClick : undefined}
      title={title}
      className={`px-3 py-2.5 font-semibold whitespace-nowrap ${sortable ? "cursor-pointer select-none" : ""}`}
      style={{
        textAlign: align,
        color: active ? RM.ink : RM.muted,
        background: RM.panel,
        borderBottom: `1px solid ${RM.border}`,
        position: "sticky",
        top: 0,
        zIndex: 1,
      }}
    >
      {children}
      {sortable && active ? (dir === "desc" ? " ↓" : " ↑") : ""}
    </th>
  );
}

export function RTd({
  children,
  align = "left",
  color,
  mono,
}: {
  children: ReactNode;
  align?: "left" | "right" | "center";
  color?: string;
  mono?: boolean;
}) {
  return (
    <td
      className={`px-3 py-2 ${mono ? "tabular-nums" : ""}`}
      style={{ textAlign: align, color: color ?? RM.ink, borderBottom: `1px solid ${RM.borderSoft}` }}
    >
      {children}
    </td>
  );
}

// hover styling for <tr> rows (Tailwind arbitrary value → no global CSS needed)
export const rowHoverClass = "hover:bg-[#1C2028] transition-colors";

// ── States ────────────────────────────────────────────────────────────────────
export function ResearchLoadingState({ label = "加载中…" }: { label?: string }) {
  return (
    <div
      className="rounded-2xl flex flex-col items-center justify-center gap-3 py-16"
      style={{ background: RM.panel, border: `1px solid ${RM.border}` }}
    >
      <div
        className="w-7 h-7 rounded-full animate-spin"
        style={{ border: `2.5px solid ${RM.border}`, borderTopColor: RM.blue }}
      />
      <div className="text-[13px]" style={{ color: RM.muted }}>
        {label}
      </div>
    </div>
  );
}

export function ResearchEmptyState({
  title,
  desc,
  actions,
}: {
  title: string;
  desc?: string;
  actions?: ReactNode;
}) {
  return (
    <div
      className="rounded-2xl flex flex-col items-center justify-center text-center gap-3 py-16 px-6"
      style={{ background: RM.panel, border: `1px dashed ${RM.border}` }}
    >
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-[20px]" style={{ background: RM.card, color: RM.faint }}>
        ◍
      </div>
      <div className="text-[15px] font-semibold" style={{ color: RM.ink }}>
        {title}
      </div>
      {desc && (
        <div className="text-[13px] max-w-md" style={{ color: RM.muted }}>
          {desc}
        </div>
      )}
      {actions && <div className="mt-1 flex items-center gap-2 flex-wrap justify-center">{actions}</div>}
    </div>
  );
}

export function ResearchErrorState({
  message,
  hint,
  actions,
}: {
  message: string;
  hint?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="rounded-2xl px-6 py-8 flex flex-col items-center text-center gap-2" style={{ background: `${RM.red}12`, border: `1px solid ${RM.red}40` }}>
      <div className="text-[14px] font-semibold" style={{ color: RM.red }}>
        加载失败
      </div>
      <div className="text-[13px]" style={{ color: RM.sub }}>
        {message}
      </div>
      {hint && (
        <div className="text-[12px] mt-0.5" style={{ color: RM.faint }}>
          {hint}
        </div>
      )}
      {actions && <div className="mt-2 flex items-center gap-2 flex-wrap justify-center">{actions}</div>}
    </div>
  );
}

// ── Insight card ──────────────────────────────────────────────────────────────
export function ResearchInsightCard({
  title,
  tone = "blue",
  children,
}: {
  title: string;
  tone?: Tone;
  children: ReactNode;
}) {
  const c = TONE_COLOR[tone];
  return (
    <div className="rounded-xl px-4 py-3.5" style={{ background: RM.card, border: `1px solid ${RM.border}` }}>
      <div className="flex items-center gap-2 text-[12px] font-semibold" style={{ color: c }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />
        {title}
      </div>
      <div className="mt-2 text-[13px] leading-relaxed" style={{ color: RM.sub }}>
        {children}
      </div>
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
