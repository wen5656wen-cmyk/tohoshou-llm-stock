"use client";
// Strategy 模块 · 展示原语（P4-T3）
import type { StratType, OverviewStrategy } from "./types";
import type { MessageKey } from "@/lib/i18n";
import { SM, SHADOW, STRAT_HEX, SFONT, gradeVerdict, retHex, returnColor, fmtPct, fmtScore, stratLabel, stratShort } from "./utils";

export function GradeBadge({ grade }: { grade: string | null }) {
  if (!grade) return <span className="text-[#86868B] text-xs">—</span>;
  const color =
    grade === "A+" ? "bg-emerald-500/20 text-emerald-300 border-emerald-600/40" :
    grade === "A"  ? "bg-green-500/20   text-green-300   border-green-600/40"   :
    grade === "B"  ? "bg-yellow-500/20  text-yellow-300  border-yellow-600/40"  :
    grade === "C"  ? "bg-orange-500/20  text-orange-300  border-orange-600/40"  :
                    "bg-[#EEF0F4]   text-[#6E6E73]   border-[#E8EAED]";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${color}`}>
      {grade}
    </span>
  );
}

// ── Recommendation status badge ───────────────────────────────────────────────

export function RecBadge({ rec, t }: { rec: string | null; t: (k: MessageKey) => string }) {
  if (!rec) return <span className="text-[#86868B] text-xs">—</span>;
  const cfg =
    rec === "READY"     ? { cls: "bg-emerald-500/20 text-emerald-300 border-emerald-600/40", label: t("strategy.status.ready")     } :
    rec === "PARTIAL"   ? { cls: "bg-yellow-500/20  text-yellow-300  border-yellow-600/40",  label: t("strategy.status.partial")   } :
                          { cls: "bg-[#EEF0F4]   text-[#6E6E73]   border-[#E8EAED]",   label: t("strategy.status.not_ready") };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ── Fillrate maturity label ───────────────────────────────────────────────────


export function StatusChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-1.5 text-xs ${ok ? "text-emerald-400" : "text-[#86868B]"}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ok ? "bg-emerald-400" : "bg-[#D2D5DB]"}`} />
      {label}
    </div>
  );
}


export function SRing({ score, size = 62, stroke = 5, color }: { score: number | null; size?: number; stroke?: number; color: string }) {
  const s = score != null && Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : null;
  const r = (size - stroke) / 2, circ = 2 * Math.PI * r, pct = s ?? 0;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E8EAED" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)} style={{ transition: "stroke-dashoffset .7s cubic-bezier(.22,1,.36,1)" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: size * 0.34, fontWeight: 700, color: SM.ink, fontVariantNumeric: "tabular-nums" }}>{s ?? "—"}</span>
      </div>
    </div>
  );
}
export function SBadge({ label, color }: { label: string; color: string }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color, background: `${color}1f`, padding: "3px 9px", borderRadius: 999 }}><span style={{ width: 6, height: 6, borderRadius: 999, background: color }} />{label}</span>;
}
export function MissionCard({ label, code, value, unit, sub, color, pct }: { label: string; code: string; value: string; unit?: string; sub?: string; color: string; pct?: number }) {
  return (
    <div style={{ background: SM.card, border: `1px solid ${SM.border}`, borderRadius: 16, padding: 16 , boxShadow: SHADOW }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: SM.ink }}>{label}</span>
        <span style={{ fontSize: 10, color: SM.faint, textTransform: "uppercase", letterSpacing: "0.08em" }}>{code}</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginTop: 12 }}>
        <span style={{ fontSize: 30, fontWeight: 700, color, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em", lineHeight: 1 }}>{value}</span>
        {unit && <span style={{ fontSize: 12, color: SM.faint, fontWeight: 600 }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontSize: 11, color: SM.sub, marginTop: 5 }}>{sub}</div>}
      {pct != null && <div style={{ marginTop: 10, height: 5, borderRadius: 999, background: "#EEF0F4", overflow: "hidden" }}><div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: "100%", background: color, transition: "width .4s ease" }} /></div>}
    </div>
  );
}

export function StratPremiumCard({ type, data, active, onClick, label }: { type: StratType; data: OverviewStrategy; active: boolean; onClick: () => void; label: string }) {
  const c = STRAT_HEX[type];
  const lrn = data.learning;
  const snap = data.latestSnapshot;
  const ret = snap?.cumulativeReturnPct ?? null;
  const win = snap?.winRate ?? lrn?.winRate ?? null;
  const ringScore = lrn?.integrityScore ?? lrn?.confidenceScore ?? null;
  return (
    <button onClick={onClick} style={{ textAlign: "left", background: SM.card, border: `1px solid ${active ? c : SM.border}`, boxShadow: active ? `0 0 0 1px ${c}, 0 10px 30px -12px ${c}66` : SHADOW, borderRadius: 18, padding: 18, cursor: "pointer", transition: "border-color .2s, box-shadow .2s" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 9, height: 9, borderRadius: 999, background: c }} />
          <span style={{ fontSize: 16, fontWeight: 700, color: SM.ink }}>{label}</span>
        </span>
        <SBadge label={`${lrn?.grade ?? "—"} · ${gradeVerdict(lrn?.grade ?? null)}`} color={c} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 14 }}>
        <SRing score={ringScore} size={64} color={c} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div><div style={{ fontSize: 10, color: SM.faint }}>累计收益</div><div style={{ fontSize: 17, fontWeight: 700, color: retHex(ret), fontVariantNumeric: "tabular-nums" }}>{fmtPct(ret)}</div></div>
            <div><div style={{ fontSize: 10, color: SM.faint }}>胜率</div><div style={{ fontSize: 17, fontWeight: 700, color: SM.ink, fontVariantNumeric: "tabular-nums" }}>{win != null ? `${win.toFixed(0)}%` : "—"}</div></div>
            <div><div style={{ fontSize: 10, color: SM.faint }}>Alpha</div><div style={{ fontSize: 17, fontWeight: 700, color: retHex(lrn?.alpha ?? null), fontVariantNumeric: "tabular-nums" }}>{fmtPct(lrn?.alpha ?? null)}</div></div>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${SM.border}`, fontSize: 12, color: SM.sub, fontVariantNumeric: "tabular-nums", flexWrap: "wrap" }}>
        <span>持仓 <b style={{ color: SM.ink }}>{data.openPositions}</b></span>
        <span>已平 <b style={{ color: SM.ink }}>{data.closedTrades}</b></span>
        <span>Top10 <b style={{ color: SM.ink }}>{data.recommendations?.top10Count ?? "—"}</b></span>
        <span>仓位 <b style={{ color: SM.ink }}>{type === "SWING_TRADE" ? "40%" : "30%"}</b></span>
      </div>
      {lrn?.summary && <div style={{ fontSize: 11, color: SM.faint, marginTop: 10, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{lrn.summary}</div>}
    </button>
  );
}

