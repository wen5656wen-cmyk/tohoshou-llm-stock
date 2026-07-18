"use client";

// ── AI Decision Center V1.0 · 洞察面板（P17-03）────────────────────────────────
// Today's Decisions / Decision Changes / Portfolio Health / AI Performance / AI Alpha / Learning Status。
// 纯展示（哑组件）；数据来自前端派生 + /api/decision/insights 聚合。复用 Decision Center 页，无新页/弹窗。
import type { ReactNode } from "react";
import { COLORS, fmtPct } from "@/lib/decision/ds";
import { SP, actionColor } from "@/lib/decision/terminal";

/* eslint-disable @typescript-eslint/no-explicit-any */
type T = (k: any) => string;

function Card({ title, right, children, minH }: { title: string; right?: ReactNode; children: ReactNode; minH?: number }) {
  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: `${SP.sm + 2}px ${SP.md - 2}px`, minHeight: minH }}>
      <div className="flex items-center justify-between" style={{ marginBottom: SP.sm }}>
        <b style={{ fontSize: 12.5, color: COLORS.text }}>{title}</b>
        {right}
      </div>
      {children}
    </div>
  );
}
const Muted = ({ children }: { children: ReactNode }) => <div style={{ fontSize: 12, color: COLORS.textFaint }}>{children}</div>;
function Stars({ n }: { n: number }) {
  return <span style={{ fontSize: 13, letterSpacing: 1, lineHeight: 1 }}><span style={{ color: "#F5A623" }}>{"★".repeat(n)}</span><span style={{ color: "#D7D9DE" }}>{"★".repeat(5 - n)}</span></span>;
}
const tone = (v: number | null | undefined) => (v == null ? COLORS.text : v < 0 ? COLORS.danger : COLORS.success);

// ── ④ Today's AI Decisions ────────────────────────────────────────────────────
export interface TodayItem { symbol: string; name: string; action: string; confidence: number | null; reason: string }
export function TodayDecisions({ title, groups, emptyLabel, onPick, t }: { title: string; groups: { action: string; label: string; items: TodayItem[] }[]; emptyLabel: string; onPick: (s: string) => void; t: T }) {
  const nonEmpty = groups.filter((g) => g.items.length > 0);
  return (
    <Card title={title} right={<span style={{ fontSize: 11, color: COLORS.textFaint }}>{nonEmpty.reduce((a, g) => a + g.items.length, 0)}</span>}>
      {nonEmpty.length === 0 ? <Muted>{emptyLabel}</Muted> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3" style={{ gap: `${SP.sm}px ${SP.lg}px` }}>
          {nonEmpty.map((g) => (
            <div key={g.action}>
              <div className="flex items-center gap-1.5" style={{ marginBottom: 4 }}>
                <span style={{ width: 7, height: 7, borderRadius: 7, background: actionColor(g.action) }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: actionColor(g.action) }}>{g.label}</span>
                <span style={{ fontSize: 10.5, color: COLORS.textFaint }}>{g.items.length}</span>
              </div>
              <div className="space-y-1">
                {g.items.slice(0, 6).map((it) => (
                  <button key={it.symbol} onClick={() => onPick(it.symbol)} className="w-full text-left flex items-baseline gap-1.5" style={{ fontSize: 12 }}>
                    <b className="tabular-nums shrink-0" style={{ color: COLORS.text }}>{it.symbol}</b>
                    <span className="truncate" style={{ color: COLORS.textSecondary, flex: 1, minWidth: 0 }}>{it.reason || it.name}</span>
                    {it.confidence != null && <span className="tabular-nums shrink-0" style={{ fontSize: 10.5, color: COLORS.textFaint }}>{Math.round(it.confidence)}</span>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── ⑤ Today Decision Changes ──────────────────────────────────────────────────
export function DecisionChanges({ title, changes, noChangeLabel, onPick, t }: { title: string; changes: any[]; noChangeLabel: string; onPick: (s: string) => void; t: T }) {
  return (
    <Card title={title} right={<span style={{ fontSize: 11, color: COLORS.textFaint }}>{changes.length || ""}</span>}>
      {changes.length === 0 ? <Muted>{noChangeLabel}</Muted> : (
        <div className="space-y-1.5">
          {changes.map((c, i) => (
            <button key={i} onClick={() => onPick(c.symbol)} className="w-full text-left flex items-baseline gap-2" style={{ fontSize: 12 }}>
              <b className="tabular-nums shrink-0" style={{ color: COLORS.text, width: 58 }}>{c.symbol}</b>
              <span className="shrink-0" style={{ fontWeight: 600 }}>
                <span style={{ color: COLORS.textFaint }}>{t(`dv.act.${c.prevAction}` as any) || c.prevAction}→</span>
                <span style={{ color: actionColor(c.action) }}>{t(`dv.act.${c.action}` as any) || c.action}</span>
              </span>
              <span className="truncate" style={{ flex: 1, minWidth: 0, color: COLORS.textSecondary }}>{c.reasonKey ? t(c.reasonKey) : ""}</span>
              {c.returnPct != null && <span className="tabular-nums shrink-0" style={{ color: tone(c.returnPct) }}>{fmtPct(c.returnPct)}</span>}
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── ⑥ Portfolio Health ────────────────────────────────────────────────────────
export function PortfolioHealth({ title, health, metrics, t }: { title: string; health: { stars: number | null; labelKey: string; reasonKeys: string[] }; metrics: { label: string; value: string }[]; t: T }) {
  return (
    <Card title={title} right={health.stars != null ? <Stars n={health.stars} /> : undefined}>
      {health.stars == null ? <Muted>{t(health.labelKey)}</Muted> : (
        <>
          <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.text, marginBottom: 2 }}>{t(health.labelKey)}</div>
          <div style={{ fontSize: 11.5, color: COLORS.textSecondary, lineHeight: 1.5, marginBottom: SP.sm }}>{health.reasonKeys.map((k) => t(k)).join(" · ") || "—"}</div>
          <div className="grid grid-cols-2" style={{ gap: `2px ${SP.md}px` }}>
            {metrics.map((m, i) => <div key={i} className="flex items-center justify-between" style={{ fontSize: 11 }}><span style={{ color: COLORS.textFaint }}>{m.label}</span><b className="tabular-nums" style={{ color: COLORS.textSecondary }}>{m.value}</b></div>)}
          </div>
        </>
      )}
    </Card>
  );
}

// ── ⑦ AI Performance ──────────────────────────────────────────────────────────
export function AiPerformance({ title, rows, emptyLabel }: { title: string; rows: { label: string; value: string; tone?: string }[]; emptyLabel?: string }) {
  const allEmpty = rows.every((r) => r.value === "—");
  return (
    <Card title={title}>
      {allEmpty && emptyLabel ? <Muted>{emptyLabel}</Muted> : (
        <div className="grid grid-cols-2" style={{ gap: `${SP.xs}px ${SP.md}px` }}>
          {rows.map((r, i) => (
            <div key={i}><div style={{ fontSize: 10.5, color: COLORS.textFaint }}>{r.label}</div><div className="tabular-nums" style={{ fontSize: 14, fontWeight: 700, color: r.tone ?? COLORS.text }}>{r.value}</div></div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── ⑧ AI Alpha ────────────────────────────────────────────────────────────────
export function AiAlpha({ title, windows, sinceStart, labels, t }: { title: string; windows: any[]; sinceStart: any; labels: { port: string; topix: string; nikkei: string; alpha: string; sinceStart: string }; t: T }) {
  const rows = [...windows, { key: labels.sinceStart, ...sinceStart, isStart: true }];
  const hasData = rows.some((r) => r.port != null || r.topix != null);
  return (
    <Card title={title}>
      {!hasData ? <Muted>—</Muted> : (
        <div style={{ fontSize: 11.5 }}>
          <div className="flex items-center" style={{ color: COLORS.textFaint, fontSize: 10, fontWeight: 600, paddingBottom: 3, borderBottom: `1px solid ${COLORS.border}` }}>
            <span style={{ flex: 1 }} /><span style={{ width: 54, textAlign: "right" }}>{labels.port}</span><span style={{ width: 54, textAlign: "right" }}>{labels.topix}</span><span style={{ width: 54, textAlign: "right" }}>{labels.alpha}</span>
          </div>
          {rows.map((r, i) => (
            <div key={i} className="flex items-center tabular-nums" style={{ padding: "3px 0", borderBottom: i < rows.length - 1 ? `1px solid ${COLORS.borderSoft ?? "#F0F0F3"}` : undefined }}>
              <span style={{ flex: 1, color: r.isStart ? COLORS.text : COLORS.textSecondary, fontWeight: r.isStart ? 700 : 400 }}>{r.isStart ? r.key : r.key}</span>
              <span style={{ width: 54, textAlign: "right", color: tone(r.port) }}>{r.port != null ? fmtPct(r.port) : "—"}</span>
              <span style={{ width: 54, textAlign: "right", color: COLORS.textSecondary }}>{r.topix != null ? fmtPct(r.topix) : "—"}</span>
              <span style={{ width: 54, textAlign: "right", fontWeight: 700, color: tone(r.alpha) }}>{r.alpha != null ? fmtPct(r.alpha) : "—"}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── ⑨ Learning Status ─────────────────────────────────────────────────────────
export function LearningStatus({ title, learning, labels, readyLabel, readyTone }: { title: string; learning: any; labels: { closed: string; decisions: string; reviews: string; hit: string; miss: string; dataset: string }; readyLabel: string; readyTone: string }) {
  const items = [
    { l: labels.closed, v: learning.closedTrades }, { l: labels.decisions, v: learning.decisionRecords },
    { l: labels.reviews, v: learning.reviewRecords }, { l: labels.dataset, v: learning.datasetSize },
    { l: labels.hit, v: learning.hit, c: COLORS.success }, { l: labels.miss, v: learning.miss, c: COLORS.danger },
  ];
  return (
    <Card title={title} right={<span style={{ fontSize: 10.5, fontWeight: 700, color: readyTone, background: `${readyTone}18`, padding: "2px 8px", borderRadius: 6 }}>{readyLabel}</span>}>
      <div className="grid grid-cols-3" style={{ gap: `${SP.xs}px ${SP.sm}px` }}>
        {items.map((it, i) => <div key={i}><div style={{ fontSize: 10, color: COLORS.textFaint }}>{it.l}</div><div className="tabular-nums" style={{ fontSize: 14, fontWeight: 700, color: it.c ?? COLORS.text }}>{it.v}</div></div>)}
      </div>
    </Card>
  );
}
