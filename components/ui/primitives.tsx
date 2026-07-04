"use client";

// ── TOHOSHOU AI · UI Kit（基础原语）── P4-T2 ─────────────────────────────────
// 全站统一组件，构建于 lib/design-tokens。新页面只允许用这里的 App* 组件，
// 禁止再自定义 Card/Badge/Button/Shadow/颜色。纯展示层，无业务逻辑。

import type { ReactNode, CSSProperties } from "react";
import { COLORS, RADIUS, SHADOW, BORDER, FONT, TRANSITION, STATUS_COLORS, toneColor, type Tone, type StatusKind } from "@/lib/design-tokens";

// ── AppCard ───────────────────────────────────────────────────────────────────
export function AppCard({
  children, header, footer, padding = 20, hover = false, accent, radius = RADIUS.xl, shadow = SHADOW.md, style, className = "", onClick,
}: {
  children?: ReactNode; header?: ReactNode; footer?: ReactNode; padding?: number; hover?: boolean;
  accent?: string; radius?: number; shadow?: string; style?: CSSProperties; className?: string; onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={className}
      style={{ background: COLORS.card, border: `1px solid ${accent ?? COLORS.border}`, borderRadius: radius, boxShadow: shadow, transition: hover ? TRANSITION.base : undefined, cursor: onClick ? "pointer" : undefined, ...style }}
    >
      {header != null && <div style={{ padding: `14px ${padding}px`, borderBottom: BORDER.soft }}>{header}</div>}
      <div style={{ padding }}>{children}</div>
      {footer != null && <div style={{ padding: `12px ${padding}px`, borderTop: BORDER.soft }}>{footer}</div>}
    </div>
  );
}

// ── AppSection（带标题头的卡片区块）────────────────────────────────────────────
export function AppSection({ title, desc, right, children }: { title: string; desc?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section style={{ background: COLORS.card, border: BORDER.hairline, borderRadius: RADIUS.xl, boxShadow: SHADOW.md, overflow: "hidden" }}>
      <header className="flex items-center justify-between gap-3" style={{ padding: "14px 20px", borderBottom: BORDER.soft }}>
        <div className="min-w-0">
          <h2 style={{ ...FONT.cardTitle, color: COLORS.text }}>{title}</h2>
          {desc && <p className="truncate" style={{ fontSize: 12, marginTop: 2, color: COLORS.textFaint }}>{desc}</p>}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </header>
      <div style={{ padding: 20 }}>{children}</div>
    </section>
  );
}

// ── AppHeader（页面 Hero）──────────────────────────────────────────────────────
export function AppHeader({
  title, titleEn, subtitle, status, statusTone = "neutral", meta, action,
}: {
  title: string; titleEn?: string; subtitle?: string; status?: string; statusTone?: Tone; meta?: ReactNode; action?: ReactNode;
}) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-center gap-4" style={{ background: COLORS.card, border: BORDER.hairline, borderRadius: RADIUS.xl, boxShadow: SHADOW.md, padding: "20px 24px" }}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 style={{ ...FONT.pageTitle, color: COLORS.text }}>{title}</h1>
          {titleEn && <span style={{ fontSize: 12, fontWeight: 500, color: COLORS.textFaint }}>{titleEn}</span>}
          {status && <AppBadge tone={statusTone}>{status}</AppBadge>}
        </div>
        {subtitle && <p style={{ ...FONT.description, marginTop: 6, color: COLORS.textMuted }}>{subtitle}</p>}
        {meta != null && <div style={{ marginTop: 8 }}>{meta}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ── AppBadge（tone 语义 pill）─────────────────────────────────────────────────
export function AppBadge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  const c = toneColor(tone);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" style={{ fontSize: 11, fontWeight: 700, color: c, background: `${c}14`, border: `1px solid ${c}29`, padding: "3px 9px", borderRadius: RADIUS.pill }}>
      <span style={{ width: 6, height: 6, borderRadius: RADIUS.pill, background: c }} />{children}
    </span>
  );
}

// ── AppStatusChip（SUCCESS/WARNING/ERROR/INFO/COMING_SOON 语义）────────────────
export function AppStatusChip({ kind, label }: { kind: StatusKind; label: string }) {
  const c = STATUS_COLORS[kind];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" style={{ fontSize: 11, fontWeight: 700, color: c, background: `${c}14`, padding: "3px 9px", borderRadius: RADIUS.pill }}>
      <span style={{ width: 6, height: 6, borderRadius: RADIUS.pill, background: c }} />{label}
    </span>
  );
}

// ── AppDot ────────────────────────────────────────────────────────────────────
export function AppDot({ color = COLORS.textFaint }: { color?: string }) {
  return <span style={{ width: 8, height: 8, borderRadius: RADIUS.pill, background: color, boxShadow: `0 0 0 3px ${color}22`, display: "inline-block", flexShrink: 0 }} />;
}

// ── AppButton（primary/secondary/ghost/danger + icon/loading/disabled）─────────
export function AppButton({
  children, onClick, variant = "secondary", size = "md", loading = false, disabled = false, icon, style,
}: {
  children?: ReactNode; onClick?: () => void; variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md"; loading?: boolean; disabled?: boolean; icon?: ReactNode; style?: CSSProperties;
}) {
  const h = size === "sm" ? 32 : 36;
  const base: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, height: h, padding: `0 ${size === "sm" ? 12 : 16}px`, fontSize: 13, fontWeight: 600, borderRadius: RADIUS.pill, transition: TRANSITION.base, cursor: disabled || loading ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1, whiteSpace: "nowrap" };
  const variants: Record<string, CSSProperties> = {
    primary: { background: COLORS.primary, color: "#fff", boxShadow: SHADOW.sm, border: "none" },
    secondary: { background: COLORS.card, color: COLORS.text, border: BORDER.hairline, boxShadow: SHADOW.sm },
    ghost: { background: "transparent", color: COLORS.primary, border: "none" },
    danger: { background: `${COLORS.danger}12`, color: COLORS.danger, border: `1px solid ${COLORS.danger}33` },
  };
  return (
    <button type="button" onClick={onClick} disabled={disabled || loading} style={{ ...base, ...variants[variant], ...style }}>
      {loading ? <span style={{ display: "inline-block", animation: TRANSITION.spin }}>↻</span> : icon}
      {children}
    </button>
  );
}

// ── AppDivider ────────────────────────────────────────────────────────────────
export function AppDivider({ vertical = false, style }: { vertical?: boolean; style?: CSSProperties }) {
  return vertical
    ? <span style={{ width: 1, alignSelf: "stretch", background: COLORS.border, ...style }} />
    : <div style={{ height: 1, background: COLORS.border, ...style }} />;
}

// ── AppMetric（标签 + 值 + 副）────────────────────────────────────────────────
export function AppMetric({ label, value, sub, color = COLORS.text }: { label: string; value: ReactNode; sub?: ReactNode; color?: string }) {
  return (
    <div>
      <div style={{ ...FONT.caption, color: COLORS.textMuted }}>{label}</div>
      <div style={{ ...FONT.metric, color, fontVariantNumeric: "tabular-nums", marginTop: 6, lineHeight: 1.1 }}>{value}</div>
      {sub != null && <div style={{ fontSize: 11, color: COLORS.textFaint, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{sub}</div>}
    </div>
  );
}
