"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { EXCLUDE_REASON_CODES } from "@/lib/ai-universe";
import type { MessageKey } from "@/lib/i18n/types";

// ── Shared types (data contract — unchanged from the original page) ────────────
export type PricePoint = { date: string; open?: number; high?: number; low?: number; close: number; adjClose?: number | null; volume?: number };
export type StockInfo = {
  symbol: string; name: string; nameZh: string | null; nameEn: string | null;
  sector: string | null; industry: string | null; market: string | null;
  high52w: number | null; low52w: number | null;
  aiEnabled?: boolean; excludeReason?: string | null;
  aiExcludeSource?: string | null; aiExcludeRule?: string | null; aiExcludeUpdatedAt?: string | null;
};
export type ScoreData = {
  computedAt: string | null; latestClose: number | null; latestDate: string | null;
  adaptiveScore: number | null; totalScore: number | null;
  technicalScore: number | null; fundamentalScore: number | null;
  moneyFlowScore: number | null; newsSentimentScore: number | null; globalTrendScore: number | null;
  recommendation: string | null; recommendationV2: string | null;
  recommendationReason: string | null; summaryReason: string | null; newsSummary: string | null;
  scoreSource: string | null; stockStyle: string | null; highRiskFlag: boolean;
  percentileRank: number | null; marketRank: number | null;
  opportunityScore: number | null; opportunityLabel: string | null;
  riskLevel: string;
  tradingAction: string | null; positionSizePct: number | null;
  entryLow: number | null; entryHigh: number | null;
  stopLoss: number | null; target1: number | null; target2: number | null;
  actionRiskLevel: string | null; actionReasons: string[]; actionWarnings: string[];
  overallConfidence: number | null; riskOverride: string | null;
};
export type IndicatorData = {
  latestDate: string; latestClose: number;
  ma5: number | null; ma20: number | null; ma60: number | null;
  rsi14: number | null; maTrend: string; rsiSignal: string; macdSignalLabel: string;
  return5d: number | null; return20d: number | null; return60d: number | null;
  latestVolume: number | null; avgVolume20d: number | null;
};
export type GptData = {
  strengths: string[]; risks: string[]; timeHorizon: string | null;
  summaryZh: string | null; summaryJa: string | null; summaryEn: string | null;
  action: string | null; confidence: string | null;
  finalScore: number | null; gptScore: number | null; updatedAt: string | null;
};
export type DailyRecData = { date: string | null; gptRank: number; finalScore: number; summaryZh: string | null; recommendation: string | null };
export type NewsItem = { id: number; title: string; url: string; source: string; publishedAt: string | null; sentiment: string | null; summary: string | null; category: string | null };
export type PerfStats = { total: number; wins: number; losses: number; winRate: number; avgReturnPct: number | null; avgAlphaPct: number | null };
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
export type Financial = { id: number; fiscalYear: number; quarter: number | null; revenue: number | null; operatingProfit: number | null; netProfit: number | null; eps: number | null; roe: number | null; equityRatio: number | null; reportedAt: string };
export type IntelData = {
  stock: StockInfo; score: ScoreData | null; indicators: IndicatorData | null;
  gpt: GptData | null; dailyRec: DailyRecData | null; news: NewsItem[];
  strategy: { classification: { strategyType: string; confidence: number; targetReturnPct: number; stopLossPct: number; maxHoldingDays: number } | null };
  riskAnalysis: { overall: RiskLevel; technical: RiskLevel; news: RiskLevel; fundamental: RiskLevel; volatility: RiskLevel } | null;
  historicalPerf: { sampleCount: number; overall: PerfStats | null; byStrategy: { DAY: PerfStats | null; SWING: PerfStats | null; POSITION: PerfStats | null } };
  sectorComparison: { sectorAvg: number; sectorRank: number | null; sectorTotal: number; myScore: number; topStocks: Array<{ symbol: string; name: string; nameZh: string | null; adaptiveScore: number | null; recommendation: string | null; isCurrent: boolean }> } | null;
};

// ── Palette ───────────────────────────────────────────────────────────────────
export const C = {
  blue: "#007AFF", green: "#34C759", red: "#FF3B30", amber: "#FF9F0A", purple: "#5856D6",
  ink: "#1D1D1F", sub: "#6E6E73", faint: "#86868B", line: "#ECECEC",
};
export function recColor(key: string | null | undefined): string {
  switch (key) { case "STRONG_BUY": return C.green; case "BUY": return C.blue; case "WATCH": return C.amber; case "AVOID": return C.red; default: return C.sub; }
}
export function riskColor(level: string): string {
  return level === "LOW" ? C.green : level === "MEDIUM" ? C.amber : C.red;
}
export function stratColor(key: string): string {
  return key === "DAY" ? C.amber : key === "POSITION" ? C.green : C.blue;
}
export function retColor(v: number | null | undefined): string { return v == null ? C.faint : v >= 0 ? C.green : C.red; }

// ── ScoreRing (Apple Activity Ring) ───────────────────────────────────────────
export function ScoreRing({ score, size = 72, stroke = 6, color }: { score: number | null; size?: number; stroke?: number; color: string }) {
  const s = score != null && Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : null;
  const r = (size - stroke) / 2, circ = 2 * Math.PI * r, pct = s ?? 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#EEEEF1" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)} style={{ transition: "stroke-dashoffset 700ms cubic-bezier(0.22,1,0.36,1)" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-semibold tabular-nums leading-none" style={{ fontSize: size * 0.34, color: C.ink }}>{s ?? "—"}</span>
        <span className="text-[9px] font-medium mt-0.5" style={{ color: C.faint }}>AI</span>
      </div>
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────
export function Card({ title, right, children, className = "", pad = true }: { title?: string; right?: React.ReactNode; children: React.ReactNode; className?: string; pad?: boolean }) {
  return (
    <div className={`dash-card ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-2 px-5 pt-4 pb-3" style={{ borderBottom: `1px solid ${C.line}` }}>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: C.faint }}>{title}</h2>
          {right}
        </div>
      )}
      <div className={pad ? "p-5" : ""}>{children}</div>
    </div>
  );
}

// ── MetricCell (compact strip) ────────────────────────────────────────────────
export function MetricCell({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="flex flex-col justify-center px-3.5 py-2.5 min-w-0">
      <span className="text-[10px] font-medium truncate" style={{ color: C.faint }}>{label}</span>
      <span className="text-[15px] font-semibold tabular-nums leading-tight mt-0.5" style={{ color: color ?? C.ink }}>{value}</span>
      {sub && <span className="text-[10px] tabular-nums" style={{ color: C.faint }}>{sub}</span>}
    </div>
  );
}

// ── ScoreBar (dimension breakdown) ────────────────────────────────────────────
export function ScoreBar({ label, score, max, color, desc }: { label: string; score: number | null; max: number; color: string; desc?: string }) {
  const s = score ?? 0, pct = Math.round((s / max) * 100);
  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="text-[12px] w-20 shrink-0" style={{ color: C.sub }}>{label}</span>
        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "#EEEEF1" }}>
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color, transition: "width .5s ease" }} />
        </div>
        <span className="text-[12px] tabular-nums w-12 text-right shrink-0 font-semibold" style={{ color }}>{s}/{max}</span>
      </div>
      {desc && <div className="text-[10px] mt-0.5 pl-[92px]" style={{ color: C.faint }}>{desc}</div>}
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
export function Skel({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

// ── AI Universe admin control (moved verbatim, Apple-restyled container) ───────
export function AiUniverseControl({
  symbol, aiEnabled, excludeReason, aiExcludeSource, aiExcludeRule, aiExcludeUpdatedAt, onUpdate,
}: {
  symbol: string; aiEnabled: boolean; excludeReason: string | null; aiExcludeSource: string | null;
  aiExcludeRule: string | null; aiExcludeUpdatedAt: string | null;
  onUpdate: (aiEnabled: boolean, excludeReason: string | null, aiExcludeSource: string | null, aiExcludeRule: string | null, aiExcludeUpdatedAt: string | null) => void;
}) {
  const { t, lang } = useI18n();
  const [saving, setSaving] = useState(false);
  const [reasonSel, setReasonSel] = useState<string>(excludeReason ?? "LOW_GROWTH");

  async function submit(nextEnabled: boolean) {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/stocks/${encodeURIComponent(symbol)}/ai-universe`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextEnabled ? { aiEnabled: true } : { aiEnabled: false, excludeReason: reasonSel }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json(); const st = json.stock;
      onUpdate(st.aiEnabled, st.excludeReason ?? null, st.aiExcludeSource ?? null, st.aiExcludeRule ?? null, st.aiExcludeUpdatedAt ?? null);
    } catch { /* re-enable for retry */ } finally { setSaving(false); }
  }

  const isWatchlistInclude = aiEnabled && aiExcludeSource === "MANUAL" && aiExcludeRule === "MANUAL_INCLUDE_WATCHLIST";
  const overrideWarning = aiEnabled && aiExcludeSource === "MANUAL" && !!aiExcludeRule && !isWatchlistInclude;
  const updatedStr = aiExcludeUpdatedAt ? new Date(aiExcludeUpdatedAt).toLocaleString(lang === "en-US" ? "en-US" : lang === "ja-JP" ? "ja-JP" : "zh-CN") : null;

  return (
    <div className="dash-card p-3.5" style={overrideWarning || !aiEnabled ? { borderColor: "#FFE8B3", background: "#FFFBF0" } : undefined}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold" style={{ color: C.ink }}>{t("universe.title")}</span>
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={aiEnabled ? { color: C.green, background: `${C.green}14` } : { color: C.amber, background: `${C.amber}14` }}>
            {aiEnabled ? t("universe.enabled_label") : `${t("universe.excluded_label")} · ${t(`universe.reason.${excludeReason ?? "OTHER"}` as MessageKey)}`}
          </span>
        </div>
        {aiEnabled ? (
          <div className="flex items-center gap-2 flex-wrap">
            <select value={reasonSel} onChange={(e) => setReasonSel(e.target.value)}
              className="rounded-lg px-2 py-1.5 text-[12px] focus:outline-none" style={{ border: `1px solid ${C.line}`, color: C.ink }}>
              {EXCLUDE_REASON_CODES.map((code) => <option key={code} value={code}>{t(`universe.reason.${code}` as MessageKey)}</option>)}
            </select>
            <button onClick={() => submit(false)} disabled={saving}
              className="text-[12px] font-semibold px-3 py-1.5 rounded-lg disabled:opacity-40" style={{ color: C.amber, background: `${C.amber}14` }}>
              {saving ? t("universe.updating") : t("universe.remove")}
            </button>
          </div>
        ) : (
          <button onClick={() => submit(true)} disabled={saving}
            className="text-[12px] font-semibold px-3 py-1.5 rounded-lg disabled:opacity-40" style={{ color: C.green, background: `${C.green}14` }}>
            {saving ? t("universe.updating") : t("universe.add")}
          </button>
        )}
      </div>
      {(aiExcludeSource || aiExcludeRule || updatedStr) && (
        <div className="mt-2.5 pt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[11px]" style={{ borderTop: `1px solid ${C.line}`, color: C.faint }}>
          {aiExcludeSource && <span>{t("universe.source_label")}：<span className="font-medium" style={{ color: C.sub }}>{t(`universe.source.${aiExcludeSource}` as MessageKey)}</span></span>}
          {aiExcludeRule && <span>{t("universe.rule_label")}：<span className="font-medium" style={{ color: C.sub }}>{t(`universe.rule.${aiExcludeRule}` as MessageKey)}</span></span>}
          {updatedStr && <span>{t("universe.updated_label")}：<span className="font-medium tabular-nums" style={{ color: C.sub }}>{updatedStr}</span></span>}
        </div>
      )}
      {overrideWarning && <div className="mt-2 text-[11px] px-2.5 py-1.5 rounded-lg" style={{ color: C.amber, background: `${C.amber}12` }}>⚠ {t("universe.override_warning")}</div>}
      {isWatchlistInclude && <div className="mt-2 text-[11px] px-2.5 py-1.5 rounded-lg" style={{ color: C.green, background: `${C.green}12` }}>★ {t("universe.watchlist_note")}</div>}
    </div>
  );
}
