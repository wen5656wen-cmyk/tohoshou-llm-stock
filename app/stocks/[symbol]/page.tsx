"use client";

import { useEffect, useState, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import PriceChart from "@/components/PriceChart";
import { getRec, returnColorClass, fmtPct, fmtJpy } from "@/lib/rec-config";
import { useI18n } from "@/lib/i18n";
import { getNameLines } from "@/lib/i18n/stock-name";
import { localeSector, localeMarket } from "@/lib/i18n/market-labels";
import { getBackHref, getBackLabel } from "@/lib/navigation/back";

type PricePoint = { date: string; open?: number; high?: number; low?: number; close: number; volume?: number };

type NewsItem = {
  id: number;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  sentiment: string | null;
  summary: string | null;
  category: string | null;
  importance: number;
  relatedSymbolConfidence: number;
};

type Indicators = {
  symbol: string; latestDate: string; latestClose: number;
  ma5: number | null; ma20: number | null; ma60: number | null;
  rsi14: number | null; macd: number | null; macdSignal: number | null; macdHist: number | null;
  return5d: number | null; return20d: number | null; return60d: number | null;
  maTrend: string; rsiSignal: string; macdSignalLabel: string;
};

type Financial = {
  id: number; fiscalYear: number; quarter: number | null;
  revenue: number | null; operatingProfit: number | null; netProfit: number | null;
  eps: number | null; bps: number | null; roe: number | null; equityRatio: number | null;
  reportedAt: string;
};

type GPTData = {
  symbol: string;
  model: string;
  ruleScore: number;
  gptScore: number;
  finalScore: number;
  // V8.6 P1: 7 sub-dimension scores (null for legacy rows)
  businessQuality: number | null;
  growthScore: number | null;
  industryScore: number | null;
  moatScore: number | null;
  valuationScore: number | null;
  catalystScore: number | null;
  riskScore: number | null;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  action: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
  summaryZh: string;
  summaryJa: string;
  summaryEn: string;
  thesisZh: string;
  thesisJa: string;
  thesisEn: string;
  strengths: string[];
  risks: string[];
  catalysts: string[];
  timeHorizon: string;
  updatedAt: string;
};

type V2Score = {
  totalScore: number;
  technicalScore: number;
  fundamentalScore: number;
  moneyFlowScore: number;
  newsSentimentScore: number;
  globalTrendScore: number;
  riskScore: number;
  stars: number;
  starsLabel: string;
  recommendation: "STRONG_BUY" | "BUY" | "HOLD" | "WATCH" | "AVOID";
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  summaryReason: string;
  newsSummary: string;
  technicalReasons: string[];
  fundamentalReasons: string[];
  moneyFlowReasons: string[];
  detail: Record<string, number>;
  // V7.7 pre-computed
  adaptiveScore: number | null;
  stockStyle: string | null;
  scoreSource: string;
  highRiskFlag: boolean;
  percentileRank: number | null;
  marketRank: number | null;
  recommendationV2: string | null;
  recommendationReason: string | null;
  opportunityScore: number | null;
  opportunityRank: number | null;
  opportunityLabel: string | null;
  // V7.8 dividend & short selling
  dividendScore: number | null;
  dividendYield: number | null;
  payoutRatio: number | null;
  dividendAnn: number | null;
  shortSellingRatio: number | null;
  shortSellingDate: string | null;
  shortSellingSource: string | null;
  // V8.3 P2: AI Action
  tradingAction: string | null;
  positionSizePct: number | null;
  entryLow: number | null;
  entryHigh: number | null;
  stopLoss: number | null;
  target1: number | null;
  target2: number | null;
  actionRiskLevel: string | null;
  actionReasons: string[];
  actionWarnings: string[];
};

type StockData = {
  stock: {
    symbol: string; name: string; nameZh: string | null; nameEn: string | null;
    sector: string | null; industry: string | null; market: string | null;
    price: number; high52w: number | null; low52w: number | null;
  };
  indicators: Indicators;
  series: { last30: PricePoint[]; last250: PricePoint[] };
  financials: Financial[];
  aiScore: V2Score | null;
};

// ── Radar Chart (5-dimension pentagon SVG) ────────────────────────────────

function RadarChart({ tech, fund, money, news, global: glob }: {
  tech: number; fund: number; money: number; news: number; global: number;
}) {
  const { t } = useI18n();
  const cx = 130, cy = 130, r = 90;
  const maxes = [30, 25, 20, 15, 10];
  const scores = [tech, fund, money, news, glob];
  const labels = [
    { text: t("dim.technical"), sub: "/30" },
    { text: t("dim.fundamental"), sub: "/25" },
    { text: t("dim.money_flow"), sub: "/20" },
    { text: t("dim.sentiment"), sub: "/15" },
    { text: t("dim.global"), sub: "/10" },
  ];
  const n = 5;
  const angle = (i: number) => (2 * Math.PI * i / n) - Math.PI / 2;

  const gridPts = (scale: number) =>
    Array.from({ length: n }, (_, i) => {
      const a = angle(i);
      return `${cx + r * scale * Math.cos(a)},${cy + r * scale * Math.sin(a)}`;
    }).join(" ");

  const dataPts = scores.map((v, i) => {
    const norm = Math.min(1, v / maxes[i]);
    const a = angle(i);
    return `${cx + r * norm * Math.cos(a)},${cy + r * norm * Math.sin(a)}`;
  }).join(" ");

  return (
    <svg width={260} height={260} viewBox="0 0 260 260">
      {/* Grid rings */}
      {[0.25, 0.5, 0.75, 1].map((s, i) => (
        <polygon key={i} points={gridPts(s)} fill="none" stroke="#1e293b" strokeWidth={i === 3 ? 1.5 : 1} />
      ))}
      {/* Axis lines */}
      {Array.from({ length: n }, (_, i) => {
        const a = angle(i);
        return (
          <line key={i} x1={cx} y1={cy}
            x2={cx + r * Math.cos(a)} y2={cy + r * Math.sin(a)}
            stroke="#1e293b" strokeWidth="1"
          />
        );
      })}
      {/* Data polygon */}
      <polygon points={dataPts} fill="rgba(59,130,246,0.2)" stroke="#3b82f6" strokeWidth="2" />
      {/* Data dots */}
      {scores.map((v, i) => {
        const norm = Math.min(1, v / maxes[i]);
        const a = angle(i);
        return (
          <circle key={i}
            cx={cx + r * norm * Math.cos(a)}
            cy={cy + r * norm * Math.sin(a)}
            r={3.5} fill="#3b82f6"
          />
        );
      })}
      {/* Labels */}
      {labels.map((lbl, i) => {
        const a = angle(i);
        const lx = cx + (r + 26) * Math.cos(a);
        const ly = cy + (r + 26) * Math.sin(a);
        return (
          <g key={i}>
            <text x={lx} y={ly - 5} textAnchor="middle" fill="#94a3b8" fontSize="11" fontWeight="600">
              {lbl.text}
            </text>
            <text x={lx} y={ly + 8} textAnchor="middle" fill="#475569" fontSize="9">
              {scores[i]}{lbl.sub}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Score Bar ─────────────────────────────────────────────────────────────

function ScoreBar({ label, score, max, color }: { label: string; score: number; max: number; color: string }) {
  const pct = Math.round((score / max) * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-400 w-16 shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "#1e293b" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs tabular-nums w-10 text-right shrink-0" style={{ color }}>
        {score}/{max}
      </span>
    </div>
  );
}

function ReturnBadge({ label, val }: { label: string; val: number | null }) {
  if (val === null) return null;
  return (
    <div className="text-center">
      <div className="text-xs text-slate-500 mb-0.5">{label}</div>
      <div className={`text-sm font-bold tabular-nums ${returnColorClass(val)}`}>
        {fmtPct(val)}
      </div>
    </div>
  );
}

function MaTrendBadge({ trend }: { trend: string }) {
  const { t } = useI18n();
  const cfg: Record<string, { labelKey: string; detail: string; cls: string }> = {
    GOLDEN:  { labelKey: "trend.golden",  detail: "MA5>MA20>MA60", cls: "bg-amber-100 text-amber-700 border border-amber-200" },
    BULLISH: { labelKey: "trend.bullish", detail: "MA5>MA20",      cls: "bg-emerald-100 text-emerald-700 border border-emerald-200" },
    NEUTRAL: { labelKey: "trend.neutral", detail: "",               cls: "bg-slate-100 text-slate-600 border border-slate-200" },
    BEARISH: { labelKey: "trend.bearish", detail: "MA5<MA20",      cls: "bg-slate-100 text-slate-500 border border-slate-200" },
    DEAD:    { labelKey: "trend.dead",    detail: "MA5<MA20<MA60", cls: "bg-red-100 text-red-600 border border-red-200" },
  };
  const c = cfg[trend] ?? cfg.NEUTRAL;
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-medium whitespace-nowrap ${c.cls}`}>
      {t(c.labelKey as Parameters<typeof t>[0])}{c.detail ? ` (${c.detail})` : ""}
    </span>
  );
}

function fmtBillion(v: number | null, lang?: string): string {
  if (v === null) return "—";
  const isEn = lang === "en-US";
  if (Math.abs(v) >= 1e12) return (v / 1e12).toFixed(1) + (isEn ? "T" : "兆");
  if (Math.abs(v) >= 1e8)  return (v / 1e8).toFixed(1)  + (isEn ? "B" : "亿");
  return v.toLocaleString();
}


// ── GPT Score Card (V8.6 P1 — 7 sub-dimensions) ─────────────────────────────

const CONFIDENCE_CFG = {
  HIGH:   { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  MEDIUM: { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200"   },
  LOW:    { bg: "bg-slate-50",   text: "text-slate-500",   border: "border-slate-200"   },
};
const ACTION_CFG = {
  POSITIVE: { dot: "bg-emerald-400", text: "text-emerald-600" },
  NEUTRAL:  { dot: "bg-slate-300",   text: "text-slate-500"   },
  NEGATIVE: { dot: "bg-amber-400",   text: "text-amber-700"   },
};

function dimBarColor(score: number): string {
  if (score >= 80) return "bg-emerald-400";
  if (score >= 65) return "bg-blue-400";
  if (score >= 50) return "bg-amber-400";
  return "bg-red-400";
}

function DimBar({ label, score }: { label: string; score: number | null }) {
  if (score == null) return null;
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-[10px] text-slate-500 w-24 shrink-0 truncate">{label}</span>
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${dimBarColor(score)}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-[10px] tabular-nums text-slate-500 w-7 text-right font-medium">{score}</span>
    </div>
  );
}

function GptScoreCard({ gptData }: { gptData: GPTData | null | "not_found" }) {
  const { t, lang } = useI18n();
  if (gptData === null) return null;

  if (gptData === "not_found") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold tracking-widest text-slate-400 uppercase">GPT ASSESSMENT</span>
        </div>
        <p className="text-sm text-slate-400">{t("gpt.not_generated")}</p>
      </div>
    );
  }

  const confidence = gptData.confidence as "LOW" | "MEDIUM" | "HIGH";
  const action = gptData.action as "POSITIVE" | "NEUTRAL" | "NEGATIVE";
  const ccfg = CONFIDENCE_CFG[confidence] ?? CONFIDENCE_CFG.LOW;
  const acfg = ACTION_CFG[action] ?? ACTION_CFG.NEUTRAL;

  const summary = lang === "ja-JP" ? gptData.summaryJa : lang === "en-US" ? gptData.summaryEn : gptData.summaryZh;
  const thesis  = lang === "ja-JP" ? gptData.thesisJa  : lang === "en-US" ? gptData.thesisEn  : gptData.thesisZh;

  const hasDimScores = gptData.businessQuality != null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
        <span className="text-xs font-semibold tracking-widest text-slate-500 uppercase">{t("gpt.section_title")}</span>
        <span className="text-[10px] text-slate-300">{gptData.model} · {t("gpt.updated_at")} {new Date(gptData.updatedAt).toLocaleDateString()}</span>
      </div>

      <div className="p-5">
        {/* Score row */}
        <div className="flex gap-3 mb-2">
          {[
            { label: t("gpt.rule_score"), val: gptData.ruleScore.toFixed(1), color: "text-slate-700" },
            { label: t("gpt.gpt_score"),  val: gptData.gptScore.toFixed(1),  color: "text-violet-700" },
            { label: t("gpt.final_score"), val: gptData.finalScore.toFixed(1), color: "text-blue-700" },
          ].map((item) => (
            <div key={item.label} className="flex-1 bg-slate-50 rounded-xl p-3 text-center">
              <div className={`text-2xl font-bold tabular-nums ${item.color}`}>{item.val}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">{item.label}</div>
            </div>
          ))}
          <div className={`flex-1 rounded-xl p-3 text-center border ${ccfg.border} ${ccfg.bg}`}>
            <div className={`text-sm font-bold ${ccfg.text}`}>{t(`gpt.confidence.${confidence}` as Parameters<typeof t>[0])}</div>
            <div className={`text-[10px] mt-0.5 ${ccfg.text}`}>{t("gpt.confidence")}</div>
          </div>
        </div>

        {/* Score explanation row */}
        <div className="flex gap-3 mb-5">
          <div className="flex-1 text-[10px] text-slate-400 px-1">{t("gpt.rule_score_desc")}</div>
          <div className="flex-1 text-[10px] text-slate-400 px-1">{t("gpt.gpt_score_desc")}</div>
          <div className="flex-1 text-[10px] text-slate-400 px-1">{t("gpt.final_score_desc")}</div>
          <div className="flex-1" />
        </div>

        {/* 7 Dimension bars */}
        {hasDimScores && (
          <div className="bg-slate-50 rounded-xl p-3 mb-4 space-y-2">
            <DimBar label={t("gpt.dim.business_quality")} score={gptData.businessQuality} />
            <DimBar label={t("gpt.dim.growth")}           score={gptData.growthScore} />
            <DimBar label={t("gpt.dim.industry")}         score={gptData.industryScore} />
            <DimBar label={t("gpt.dim.moat")}             score={gptData.moatScore} />
            <DimBar label={t("gpt.dim.valuation")}        score={gptData.valuationScore} />
            <DimBar label={t("gpt.dim.catalyst")}         score={gptData.catalystScore} />
            <DimBar label={t("gpt.dim.risk")}             score={gptData.riskScore} />
          </div>
        )}

        {/* Action + Summary */}
        <div className="flex items-start gap-2 mb-3">
          <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${acfg.dot}`} />
          <div>
            <span className={`text-xs font-semibold ${acfg.text}`}>
              {t(`gpt.action.${action}` as Parameters<typeof t>[0])}
            </span>
            <span className="text-xs text-slate-500 ml-1.5">{summary}</span>
          </div>
        </div>

        {/* Thesis */}
        <div className="bg-slate-50 rounded-xl px-3 py-2.5 mb-4 text-xs text-slate-600 leading-relaxed">
          {thesis}
        </div>

        {/* Strengths / Risks / Catalysts */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          {[
            { key: "gpt.strengths" as const, items: gptData.strengths as string[], color: "text-emerald-600", dot: "text-emerald-400" },
            { key: "gpt.risks"     as const, items: gptData.risks     as string[], color: "text-red-600",     dot: "text-red-400"     },
            { key: "gpt.catalysts" as const, items: gptData.catalysts as string[], color: "text-orange-600",  dot: "text-orange-400"  },
          ].map((sec) => (
            <div key={sec.key} className="bg-slate-50 rounded-xl p-3">
              <div className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${sec.color}`}>{t(sec.key)}</div>
              {sec.items.slice(0, 3).map((item, i) => (
                <div key={i} className="flex items-start gap-1 text-[11px] text-slate-600 mb-1">
                  <span className={`shrink-0 ${sec.dot}`}>▸</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Time horizon */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400">{t("gpt.time_horizon")}: <span className="font-medium text-slate-600">{gptData.timeHorizon}</span></span>
          <span className="text-[10px] text-slate-300">{t("gpt.disclaimer")}</span>
        </div>
      </div>
    </div>
  );
}

// ── AI Action Card (v8.3 P2) ──────────────────────────────────────────────

const AI_ACTION_CFG: Record<string, { bg: string; text: string; border: string; dot: string; label: string }> = {
  BUY_NOW:       { bg: "bg-emerald-50",  text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500",  label: "BUY NOW" },
  WAIT_PULLBACK: { bg: "bg-amber-50",    text: "text-amber-700",   border: "border-amber-200",   dot: "bg-amber-500",    label: "WAIT PULLBACK" },
  HOLD:          { bg: "bg-slate-50",    text: "text-slate-700",   border: "border-slate-200",   dot: "bg-slate-400",    label: "HOLD" },
  TAKE_PROFIT:   { bg: "bg-orange-50",   text: "text-orange-700",  border: "border-orange-200",  dot: "bg-orange-500",   label: "TAKE PROFIT" },
  SELL:          { bg: "bg-red-50",      text: "text-red-700",     border: "border-red-200",     dot: "bg-red-500",      label: "SELL" },
  AVOID:         { bg: "bg-red-50",      text: "text-red-700",     border: "border-red-200",     dot: "bg-red-500",      label: "AVOID" },
};
const AI_RISK_COLOR: Record<string, string> = {
  LOW: "text-emerald-600", MEDIUM: "text-amber-600", HIGH: "text-orange-600", EXTREME: "text-red-600",
};

function AiActionCard({ score }: { score: {
  tradingAction: string | null;
  positionSizePct: number | null;
  entryLow: number | null; entryHigh: number | null;
  stopLoss: number | null; target1: number | null; target2: number | null;
  actionRiskLevel: string | null;
  actionReasons: string[]; actionWarnings: string[];
} }) {
  const { t } = useI18n();
  const action = score.tradingAction;
  if (!action) return null;
  const cfg = AI_ACTION_CFG[action] ?? AI_ACTION_CFG.HOLD;
  const riskColor = AI_RISK_COLOR[score.actionRiskLevel ?? "MEDIUM"] ?? AI_RISK_COLOR.MEDIUM;
  const reasons = score.actionReasons.slice(0, 3);
  const warnings = score.actionWarnings.slice(0, 2);

  return (
    <div className={`rounded-2xl border ${cfg.border} p-5 ${cfg.bg}`}>
      <div className="flex items-center gap-2 mb-4">
        <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
        <h3 className="text-xs font-semibold tracking-widest text-slate-500 uppercase">{t("ai_action.title")}</h3>
      </div>
      {/* Label + Position */}
      <div className="flex items-end justify-between mb-4">
        <div>
          <div className={`text-[28px] font-extrabold tracking-tight leading-none ${cfg.text}`}>
            {t(`action.${action}` as Parameters<typeof t>[0]) || cfg.label}
          </div>
          <div className={`text-xs font-semibold mt-1 ${riskColor}`}>
            {t("ai_action.risk_level")}: {t(`risk.${score.actionRiskLevel}` as Parameters<typeof t>[0]) || score.actionRiskLevel || "—"}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-slate-400 mb-0.5">{t("ai_action.position_size")}</div>
          <div className={`text-[28px] font-extrabold tabular-nums leading-none ${cfg.text}`}>
            {score.positionSizePct?.toFixed(0) ?? "0"}%
          </div>
        </div>
      </div>
      {/* Price grid */}
      {(score.entryLow != null || score.entryHigh != null || score.stopLoss != null || score.target1 != null || score.target2 != null) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          {score.entryLow != null && (
            <div className="bg-white/70 rounded-xl p-2.5">
              <div className="text-[10px] text-slate-400 mb-1">{t("ai_action.entry_range")} Low</div>
              <div className="text-sm font-bold text-slate-800 tabular-nums">¥{score.entryLow.toLocaleString()}</div>
            </div>
          )}
          {score.entryHigh != null && (
            <div className="bg-white/70 rounded-xl p-2.5">
              <div className="text-[10px] text-slate-400 mb-1">{t("ai_action.entry_range")} High</div>
              <div className="text-sm font-bold text-slate-800 tabular-nums">¥{score.entryHigh.toLocaleString()}</div>
            </div>
          )}
          {score.stopLoss != null && (
            <div className="bg-white/70 rounded-xl p-2.5">
              <div className="text-[10px] text-red-400 mb-1">{t("ai_action.stop_loss")}</div>
              <div className="text-sm font-bold text-red-600 tabular-nums">¥{score.stopLoss.toLocaleString()}</div>
            </div>
          )}
          {score.target1 != null && (
            <div className="bg-white/70 rounded-xl p-2.5">
              <div className="text-[10px] text-emerald-500 mb-1">{t("ai_action.target1")}</div>
              <div className="text-sm font-bold text-emerald-600 tabular-nums">¥{score.target1.toLocaleString()}</div>
            </div>
          )}
          {score.target2 != null && (
            <div className="bg-white/70 rounded-xl p-2.5">
              <div className="text-[10px] text-emerald-500 mb-1">{t("ai_action.target2")}</div>
              <div className="text-sm font-bold text-emerald-600 tabular-nums">¥{score.target2.toLocaleString()}</div>
            </div>
          )}
        </div>
      )}
      {/* Reasons */}
      {reasons.length > 0 && (
        <div className="space-y-1 mb-2">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{t("ai_action.reasons")}</div>
          {reasons.map((r, i) => (
            <div key={i} className="text-xs text-slate-600 flex gap-1.5">
              <span className="text-slate-400 shrink-0">·</span>
              <span>{r}</span>
            </div>
          ))}
        </div>
      )}
      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="space-y-1 mb-2">
          <div className="text-[10px] font-semibold text-amber-500 uppercase tracking-wider mb-1">{t("ai_action.warnings")}</div>
          {warnings.map((w, i) => (
            <div key={i} className="text-xs text-amber-600 flex gap-1.5">
              <span className="shrink-0">⚠</span>
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}
      {/* Disclaimer */}
      <div className="text-[10px] text-slate-400 border-t border-slate-200/60 pt-2 mt-2">
        {t("ai_action.disclaimer")}
      </div>
    </div>
  );
}

export default function StockDetailPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = use(params);
  const decoded = decodeURIComponent(symbol);
  const { t, lang } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const source = searchParams.get("source");
  const backHref = getBackHref(returnTo, source, "/screener");
  const backLabel = getBackLabel(source, lang);

  const [data, setData] = useState<StockData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartPeriod, setChartPeriod] = useState<"30" | "250">("30");
  const [activeTab, setActiveTab] = useState<"overview" | "chart" | "financials" | "indicators" | "ai" | "news">("overview");
  const [watched, setWatched] = useState(false);
  const [watchLoading, setWatchLoading] = useState(false);
  const [newsItems, setNewsItems] = useState<NewsItem[] | null>(null);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsIsGeneral, setNewsIsGeneral] = useState(false);
  const [gptData, setGptData] = useState<GPTData | null | "not_found">(null);

  useEffect(() => {
    const s = decoded;
    Promise.all([
      fetch(`/api/stocks/${encodeURIComponent(s)}`).then((r) => r.json()),
      fetch(`/api/stocks/${encodeURIComponent(s)}/indicators`).then((r) => r.json()),
      fetch(`/api/financials/${encodeURIComponent(s)}`).then((r) => r.json()),
      fetch(`/api/stocks/${encodeURIComponent(s)}/ai-score`).then((r) => r.json()).catch(() => null),
      fetch("/api/watchlist").then((r) => r.json()).then((list: { symbol: string }[]) => {
        setWatched(list.some((w) => w.symbol === s));
      }).catch(() => null),
    ])
      .then(([stock, indData, fins, aiScoreData]) => {
        if (indData.error) { setError(indData.error); setLoading(false); return; }
        setData({
          stock: {
            symbol: stock.symbol, name: stock.name,
            nameZh: stock.nameZh ?? null, nameEn: stock.nameEn ?? null,
            sector: stock.sector, industry: stock.industry, market: stock.market,
            price: stock.price, high52w: stock.high52w, low52w: stock.low52w,
          },
          indicators: indData.indicators,
          series: indData.series,
          financials: Array.isArray(fins) ? fins : [],
          aiScore: aiScoreData?.totalScore != null ? aiScoreData : null,
        });
        setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [decoded]);

  useEffect(() => {
    if (activeTab !== "ai" || gptData !== null) return;
    fetch(`/api/stocks/${encodeURIComponent(decoded)}/gpt-score`)
      .then((r) => r.json())
      .then((d) => setGptData(d.notFound ? "not_found" : (d as GPTData)))
      .catch(() => setGptData("not_found"));
  }, [activeTab, decoded, gptData]);

  useEffect(() => {
    if (activeTab !== "news" || newsItems !== null) return;
    setNewsLoading(true);
    fetch(`/api/news?symbol=${encodeURIComponent(decoded)}&limit=20`)
      .then((r) => r.json())
      .then((items: NewsItem[]) => {
        if (Array.isArray(items) && items.length > 0) { setNewsItems(items); return null; }
        setNewsIsGeneral(true);
        return fetch("/api/news?limit=15").then((r) => r.json());
      })
      .then((items: NewsItem[] | null) => {
        if (items) setNewsItems(Array.isArray(items) ? items : []);
      })
      .catch(() => { setNewsItems([]); })
      .finally(() => setNewsLoading(false));
  }, [activeTab, decoded, newsItems]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="text-slate-400 text-sm animate-pulse">{t("common.loading")}</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-red-700">
          数据加载失败：{error}
        </div>
      </div>
    );
  }

  const { stock, indicators: ind, series, financials, aiScore } = data;
  const chartData = chartPeriod === "30" ? series.last30 : series.last250;
  const isUp = (ind.return5d ?? 0) >= 0;

  const toggleWatch = async () => {
    setWatchLoading(true);
    if (watched) {
      await fetch(`/api/watchlist?symbol=${encodeURIComponent(stock.symbol)}`, { method: "DELETE" });
      setWatched(false);
    } else {
      await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: stock.symbol, name: stock.name, sector: stock.sector, market: stock.market }),
      });
      setWatched(true);
    }
    setWatchLoading(false);
  };

  const tabs = [
    { key: "overview",   label: t("tab.overview") },
    { key: "chart",      label: t("tab.chart") },
    { key: "financials", label: `${t("tab.financials")} (${financials.length})` },
    { key: "indicators", label: t("tab.technical") },
    { key: "ai",         label: aiScore ? `${t("tab.ai")} ${aiScore.adaptiveScore?.toFixed(0) ?? aiScore.totalScore}` : t("tab.ai") },
    { key: "news",       label: t("tab.news") },
  ] as const;

  return (
    <div className="p-4 md:p-6 max-w-5xl">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => {
              if (returnTo) {
                router.push(returnTo);
              } else if (typeof window !== "undefined" && window.history.length > 1) {
                router.back();
              } else {
                router.push("/screener");
              }
            }}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            ← {backLabel}
          </button>
          <button
            onClick={toggleWatch}
            disabled={watchLoading}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ${
              watched
                ? "bg-yellow-50 border-yellow-200 text-yellow-700 hover:bg-yellow-100"
                : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
            } disabled:opacity-40`}
          >
            <span>{watched ? "★" : "☆"}</span>
            {watched ? `★ ${t("nav.watchlist")}` : `+ ${t("nav.watchlist")}`}
          </button>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            {(() => {
              const nameLines = getNameLines(stock, lang);
              return (
                <>
                  <h1 style={{ fontSize: 32, fontWeight: 700, color: "#111827", lineHeight: 1.2, letterSpacing: "-0.02em" }}>
                    {nameLines[0]}
                  </h1>
                  {nameLines[1] && (
                    <p style={{ fontSize: 18, fontWeight: 500, color: "#64748b", marginTop: 2 }}>{nameLines[1]}</p>
                  )}
                  {nameLines[2] && (
                    <p style={{ fontSize: 16, fontWeight: 400, color: "#94a3b8", marginTop: 2 }}>{nameLines[2]}</p>
                  )}
                </>
              );
            })()}
            <div className="flex items-center gap-2 mt-2">
              <span className="font-mono text-sm font-semibold bg-slate-100 text-slate-500 px-2.5 py-1 rounded-lg tracking-wide">
                {stock.symbol}
              </span>
              {stock.market && (
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{localeMarket(stock.market, lang)}</span>
              )}
              {stock.sector && (
                <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">{localeSector(stock.sector, lang)}</span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[36px] font-extrabold text-slate-900 tabular-nums leading-none">
              {fmtJpy(ind.latestClose)}
            </div>
            <div className="text-xs text-slate-400 mt-1">{ind.latestDate} {t("stock.close_label")}</div>
            <div className={`text-sm font-semibold mt-1 tabular-nums ${returnColorClass(ind.return5d)}`}>
              5D {fmtPct(ind.return5d)}
            </div>
          </div>
        </div>
      </div>

      {/* Large-move notice — shown when 60d adj-return exceeds ±50% */}
      {Math.abs(ind.return60d ?? 0) > 50 && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl px-4 py-3 mb-4 flex items-start gap-2 text-sm text-amber-800">
          <span className="text-lg leading-none mt-0.5">⚠️</span>
          <div>
            <span className="font-semibold">{t("stock.data_notice")}</span>
            <span className="ml-1">{t("stock.large_move_warning")}</span>
          </div>
        </div>
      )}

      {/* Return Strip */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-5">
        <div className="flex items-center justify-around">
          <ReturnBadge label={t("stock.5d_return")}  val={ind.return5d}  />
          <div className="w-px h-8 bg-slate-100" />
          <ReturnBadge label={t("stock.20d_return")} val={ind.return20d} />
          <div className="w-px h-8 bg-slate-100" />
          <ReturnBadge label={t("stock.60d_return")} val={ind.return60d} />
          <div className="w-px h-8 bg-slate-100" />
          <div className="text-center">
            <div className="text-xs text-slate-500 mb-0.5">{t("stock.52w_high")}</div>
            <div className="text-sm font-bold text-slate-900 tabular-nums">
              {fmtJpy(stock.high52w)}
            </div>
          </div>
          <div className="w-px h-8 bg-slate-100" />
          <div className="text-center">
            <div className="text-xs text-slate-500 mb-0.5">{t("stock.52w_low")}</div>
            <div className="text-sm font-bold text-slate-900 tabular-nums">
              {fmtJpy(stock.low52w)}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-slate-100 rounded-2xl p-1 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-3 md:px-4 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Overview ─────────────────────────────────────────────────── */}
      {activeTab === "overview" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">{t("stock.ma_lines")}</h3>
              <div className="space-y-3">
                {[
                  { label: "MA5",  val: ind.ma5 },
                  { label: "MA20", val: ind.ma20 },
                  { label: "MA60", val: ind.ma60 },
                ].map(({ label, val }) => {
                  const diff = val ? ((ind.latestClose - val) / val) * 100 : null;
                  return (
                    <div key={label} className="flex items-center justify-between">
                      <span className="text-xs text-slate-500 w-10">{label}</span>
                      <span className="text-sm tabular-nums font-medium text-slate-800">
                        {val ? `¥${val.toLocaleString()}` : "—"}
                      </span>
                      {diff !== null && (
                        <span className={`text-xs tabular-nums ${returnColorClass(diff)}`}>
                          {fmtPct(diff, 1)}
                        </span>
                      )}
                    </div>
                  );
                })}
                <div className="pt-2 border-t border-slate-100">
                  <MaTrendBadge trend={ind.maTrend} />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">{t("stock.oscillators")}</h3>
              <div className="space-y-4">
                <div>
                  <div className="text-xs text-slate-500 mb-1.5">RSI (14日)</div>
                  <div className="flex items-center gap-3">
                    <div className="relative w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`absolute left-0 top-0 h-full rounded-full ${
                          (ind.rsi14 ?? 50) >= 70 ? "bg-red-400" : (ind.rsi14 ?? 50) <= 30 ? "bg-emerald-400" : "bg-slate-400"
                        }`}
                        style={{ width: `${Math.min(100, ind.rsi14 ?? 0)}%` }}
                      />
                    </div>
                    <span className="text-sm font-bold tabular-nums text-slate-700">{ind.rsi14?.toFixed(1) ?? "—"}</span>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1.5">MACD</div>
                  <div className="flex items-center gap-2 text-xs tabular-nums text-slate-700">
                    <span>MACD: <b>{ind.macd?.toFixed(2) ?? "—"}</b></span>
                    <span className="text-slate-300">|</span>
                    <span>{t("stock.hist_label")}: <b className={returnColorClass(ind.macdHist)}>
                      {ind.macdHist != null ? fmtPct(ind.macdHist, 2).replace("%","") : "—"}
                    </b></span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-700">{t("stock.price_30d")}</h3>
              <button onClick={() => setActiveTab("chart")} className="text-xs text-blue-600 hover:underline">
                {t("stock.full_chart")} →
              </button>
            </div>
            <PriceChart data={series.last30} height={160} />
          </div>
        </div>
      )}

      {/* ── Tab: Chart ───────────────────────────────────────────────────── */}
      {activeTab === "chart" && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-700">{t("stock.chart_title")}</h3>
            <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
              {(["30", "250"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setChartPeriod(p)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                    chartPeriod === p ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {p === "30" ? "30D" : "250D (~1Y)"}
                </button>
              ))}
            </div>
          </div>
          <PriceChart data={chartData} height={320} showVolume />
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-6 text-xs text-slate-500">
            <span>MA5: <b className="text-slate-700">{ind.ma5 ? `¥${ind.ma5.toLocaleString()}` : "—"}</b></span>
            <span>MA20: <b className="text-slate-700">{ind.ma20 ? `¥${ind.ma20.toLocaleString()}` : "—"}</b></span>
            <span>MA60: <b className="text-slate-700">{ind.ma60 ? `¥${ind.ma60.toLocaleString()}` : "—"}</b></span>
            <span>RSI: <b className="text-slate-700">{ind.rsi14?.toFixed(1) ?? "—"}</b></span>
          </div>
        </div>
      )}

      {/* ── Tab: Financials ──────────────────────────────────────────────── */}
      {activeTab === "financials" && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700">{t("stock.financials_title")}</h3>
          </div>
          {financials.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">{t("stock.no_financials")}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs text-slate-400 border-b border-slate-100 bg-slate-50">
                    <th className="px-5 py-2.5 font-medium">{t("fin.period")}</th>
                    <th className="px-3 py-2.5 font-medium text-right">{t("fin.revenue")}</th>
                    <th className="px-3 py-2.5 font-medium text-right">{t("fin.op_profit")}</th>
                    <th className="px-3 py-2.5 font-medium text-right">{t("fin.net_profit")}</th>
                    <th className="px-3 py-2.5 font-medium text-right">EPS</th>
                    <th className="px-3 py-2.5 font-medium text-right">ROE</th>
                    <th className="px-3 py-2.5 font-medium text-right">{t("fin.equity_ratio")}</th>
                    <th className="px-3 py-2.5 font-medium text-right">{t("fin.reported_at")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {[...financials]
                    .sort((a, b) => b.fiscalYear - a.fiscalYear || (b.quarter ?? 99) - (a.quarter ?? 99))
                    .map((f) => (
                      <tr key={f.id} className="hover:bg-slate-50">
                        <td className="px-5 py-2.5 text-sm font-medium text-slate-900">
                          {lang === "ja-JP"
                            ? `${f.fiscalYear}年${f.quarter ? `Q${f.quarter}` : t("fin.full_year")}`
                            : lang === "en-US"
                            ? `FY${f.fiscalYear}${f.quarter ? ` Q${f.quarter}` : ""}`
                            : `${f.fiscalYear}年${f.quarter ? ` Q${f.quarter}` : t("fin.full_year")}`}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-sm text-slate-700">{fmtBillion(f.revenue, lang)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-sm text-slate-700">{fmtBillion(f.operatingProfit, lang)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-sm text-slate-700">{fmtBillion(f.netProfit, lang)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-sm text-slate-700">
                          {f.eps != null ? `¥${f.eps.toFixed(2)}` : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-sm text-slate-700">
                          {f.roe != null ? `${(f.roe * 100).toFixed(1)}%` : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-sm text-slate-700">
                          {f.equityRatio != null ? `${(f.equityRatio * 100).toFixed(1)}%` : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right text-xs text-slate-400 tabular-nums">
                          {f.reportedAt ? new Date(f.reportedAt).toLocaleDateString(lang) : "—"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Indicators ──────────────────────────────────────────────── */}
      {activeTab === "indicators" && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">{t("stock.moving_averages")}</h3>
            <div className="grid grid-cols-3 gap-4 mb-4">
              {[
                { key: "MA5",  val: ind.ma5,  days: 5 },
                { key: "MA20", val: ind.ma20, days: 20 },
                { key: "MA60", val: ind.ma60, days: 60 },
              ].map(({ key, val, days }) => {
                const diff = val ? ((ind.latestClose - val) / val) * 100 : null;
                return (
                  <div key={key} className="bg-slate-50 rounded-xl p-4">
                    <div className="text-xs text-slate-500 mb-1">{key} ({days}D)</div>
                    <div className="text-lg font-bold text-slate-900 tabular-nums">
                      {fmtJpy(val)}
                    </div>
                    {diff !== null && (
                      <div className={`text-xs font-medium mt-1 tabular-nums ${returnColorClass(diff)}`}>
                        {t("stock.vs_price")} {fmtPct(diff, 2)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <MaTrendBadge trend={ind.maTrend} />
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">RSI (14D)</h3>
            <div className="flex items-center gap-4">
              <div className="text-3xl font-bold text-slate-900 tabular-nums">
                {ind.rsi14 !== null ? ind.rsi14.toFixed(1) : "—"}
              </div>
              {ind.rsi14 !== null && (
                <div className="flex-1">
                  <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden relative">
                    <div className="absolute left-[30%] top-0 w-0.5 h-full bg-blue-300 opacity-80" />
                    <div className="absolute left-[70%] top-0 w-0.5 h-full bg-red-300 opacity-80" />
                    <div
                      className={`h-full rounded-full ${ind.rsi14 >= 70 ? "bg-red-400" : ind.rsi14 <= 30 ? "bg-emerald-400" : "bg-slate-400"}`}
                      style={{ width: `${ind.rsi14}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-slate-400 mt-0.5">
                    <span>0</span><span>30</span><span>50</span><span>70</span><span>100</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">MACD (12-26-9)</h3>
            <div className="grid grid-cols-3 gap-4 mb-3">
              {[
                { label: "MACD",                                      val: ind.macd },
                { label: t("macd.trend_label"),                       val: ind.macdSignal },
                { label: t("stock.hist_label"), val: ind.macdHist },
              ].map(({ label, val }) => (
                <div key={label} className="bg-slate-50 rounded-xl p-3">
                  <div className="text-xs text-slate-500 mb-1">{label}</div>
                  <div className={`text-lg font-bold tabular-nums ${val != null ? returnColorClass(val) : "text-slate-300"}`}>
                    {val != null ? fmtPct(val, 3).replace("%","") : "—"}
                  </div>
                </div>
              ))}
            </div>
            <div className="text-xs text-slate-500">
              {t("macd.trend_label")}：
              {ind.macdSignalLabel === "BUY"     && <span className="text-emerald-600 font-medium ml-1">{t("macd.bullish")}（MACD &gt; {t("macd.trend_label")}）</span>}
              {ind.macdSignalLabel === "SELL"    && <span className="text-red-500 font-medium ml-1">{t("macd.bearish")}（MACD &lt; {t("macd.trend_label")}）</span>}
              {ind.macdSignalLabel === "NEUTRAL" && <span className="text-slate-400 ml-1">{t("macd.neutral")}</span>}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">{t("stock.returns_label")}</h3>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: t("stock.5d_return"),  val: ind.return5d },
                { label: t("stock.20d_return"), val: ind.return20d },
                { label: t("stock.60d_return"), val: ind.return60d },
              ].map(({ label, val }) => (
                <div key={label} className="bg-slate-50 rounded-xl p-4 text-center">
                  <div className="text-xs text-slate-500 mb-1">{label}</div>
                  <div className={`text-2xl font-bold tabular-nums ${val != null ? returnColorClass(val) : "text-slate-300"}`}>
                    {val != null ? fmtPct(val) : "—"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: AI Score V2 — Dark Bloomberg Style ──────────────────────── */}
      {activeTab === "ai" && (
        <div className="space-y-4">
          {!aiScore ? (
            <div className="bg-slate-50 rounded-2xl border border-slate-200 p-8 text-center text-slate-400 text-sm">
              暂无AI评分数据
            </div>
          ) : (() => {
            const rv2 = aiScore.recommendationV2 ?? aiScore.recommendation;
            const rec = getRec(rv2);
            const riskColors = { LOW: "#10b981", MEDIUM: "#f59e0b", HIGH: "#ef4444" };
            const riskLabelFor = (k: string) => t(`risk.${k}` as Parameters<typeof t>[0]);
            const styleLabelFor = (k: string) => t(`style.${k}` as Parameters<typeof t>[0]);
            const sourceLabelFor = (k: string) => t(`stock.score_source.${k}` as Parameters<typeof t>[0]);

            return (
              <>
                {/* V9 P1: GPT Score Overlay */}
                <GptScoreCard gptData={gptData} />

                {/* V8.3 P2: AI Action — TOP of AI Tab */}
                <AiActionCard score={aiScore} />

                {/* Main Score Card — Dark Bloomberg */}
                <div style={{ background: "#0f172a", borderRadius: 16, padding: "20px 20px", border: "1px solid #1e293b" }}>
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 md:gap-6">
                    {/* Left: Score + V7.7 label */}
                    <div className="shrink-0">
                      <div className="text-xs font-semibold tracking-widest mb-1" style={{ color: "#475569" }}>
                        TOHOSHOU AI V7.7
                      </div>
                      <div style={{ fontSize: 10, color: "#334155", marginBottom: 12 }}>
                        {sourceLabelFor(aiScore.scoreSource) ?? aiScore.scoreSource}
                      </div>
                      {/* adaptiveScore (primary) */}
                      <div className="flex items-baseline gap-3 mb-2">
                        <span style={{ fontSize: 72, fontWeight: 900, lineHeight: 1, color: rec.color, fontVariantNumeric: "tabular-nums" }}>
                          {aiScore.adaptiveScore != null ? aiScore.adaptiveScore.toFixed(0) : aiScore.totalScore}
                        </span>
                        <span style={{ fontSize: 24, color: "#475569", fontWeight: 400 }}>/100</span>
                      </div>
                      {/* V7.7 primary rating */}
                      <div className="flex items-center gap-3 mb-3">
                        <span style={{
                          fontSize: 18, fontWeight: 700, color: rec.color,
                          background: rec.glow, padding: "4px 12px", borderRadius: 8,
                          border: `1px solid ${rec.color}40`,
                        }}>
                          {rec.label}
                        </span>
                        {aiScore.highRiskFlag && (
                          <span style={{ fontSize: 11, color: "#ef4444", background: "#ef444420", padding: "2px 8px", borderRadius: 6, border: "1px solid #ef444440" }}>⚠ {t("stock.high_risk")}</span>
                        )}
                      </div>
                      {/* Rank row */}
                      <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
                        {aiScore.percentileRank != null && (
                          <span style={{ fontSize: 11, color: "#94a3b8" }}>
                            {t("stock.market_rank")}：<strong style={{ color: "#f8fafc" }}>{aiScore.percentileRank.toFixed(1)}%</strong>（#{aiScore.marketRank}）
                          </span>
                        )}
                        {aiScore.opportunityScore != null && (
                          <span style={{ fontSize: 11, color: "#94a3b8" }}>
                            {t("stock.opportunity_score")}：<strong style={{ color: "#f8fafc" }}>{aiScore.opportunityScore.toFixed(1)}</strong>
                            {aiScore.opportunityLabel && <span style={{ color: "#64748b" }}> · {aiScore.opportunityLabel === "STEADY" ? t("stock.steady") : t("stock.high_risk")}</span>}
                          </span>
                        )}
                      </div>
                      {aiScore.stockStyle && (
                        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>
                          {t("stock.style_label")}：{styleLabelFor(aiScore.stockStyle)}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <span style={{
                          fontSize: 11, fontWeight: 600, color: riskColors[aiScore.riskLevel as keyof typeof riskColors],
                          background: `${riskColors[aiScore.riskLevel as keyof typeof riskColors]}20`,
                          padding: "2px 8px", borderRadius: 6,
                          border: `1px solid ${riskColors[aiScore.riskLevel as keyof typeof riskColors]}40`,
                        }}>
                          {riskLabelFor(aiScore.riskLevel)}
                        </span>
                      </div>
                      <p style={{ color: "#64748b", fontSize: 12, marginTop: 12, lineHeight: 1.6, maxWidth: 280 }}>
                        {aiScore.recommendationReason ?? aiScore.summaryReason}
                      </p>
                    </div>

                    {/* Center: Radar — hidden on mobile */}
                    <div className="hidden md:flex flex-1 justify-center">
                      <RadarChart
                        tech={aiScore.technicalScore}
                        fund={aiScore.fundamentalScore}
                        money={aiScore.moneyFlowScore}
                        news={aiScore.newsSentimentScore}
                        global={aiScore.globalTrendScore}
                      />
                    </div>

                    {/* Right: 5 bars */}
                    <div className="md:shrink-0 md:w-56 space-y-3 md:space-y-4 pt-0 md:pt-2">
                      <ScoreBar label="技術面" score={aiScore.technicalScore}     max={30} color="#3b82f6" />
                      <ScoreBar label="基本面" score={aiScore.fundamentalScore}   max={25} color="#10b981" />
                      <ScoreBar label="資金面" score={aiScore.moneyFlowScore}     max={20} color="#8b5cf6" />
                      <ScoreBar label="情绪"   score={aiScore.newsSentimentScore} max={15} color="#f59e0b" />
                      <ScoreBar label="趋势"   score={aiScore.globalTrendScore}   max={10} color="#06b6d4" />
                    </div>
                  </div>
                </div>

                {/* Dimension Analysis Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
                  {[
                    { title: "技術面分析", reasons: aiScore.technicalReasons,    color: "#3b82f6", bg: "bg-blue-50/50",    border: "border-blue-100" },
                    { title: "基本面分析", reasons: aiScore.fundamentalReasons,  color: "#10b981", bg: "bg-emerald-50/50", border: "border-emerald-100" },
                    { title: "资金面分析", reasons: aiScore.moneyFlowReasons,    color: "#8b5cf6", bg: "bg-violet-50/50",  border: "border-violet-100" },
                  ].map((sec) => (
                    <div key={sec.title} className={`rounded-2xl border ${sec.border} ${sec.bg} p-4`}>
                      <div className="text-xs font-bold mb-3" style={{ color: sec.color }}>{sec.title}</div>
                      <ul className="space-y-2">
                        {sec.reasons.map((r, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-xs text-slate-600">
                            <span className="shrink-0 mt-0.5" style={{ color: sec.color }}>▸</span>
                            <span>{r}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>

                {/* News Sentiment */}
                {aiScore.newsSummary && (
                  <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-4">
                    <div className="text-xs font-bold text-amber-700 mb-2">新闻情绪分析</div>
                    <p className="text-xs text-slate-600">{aiScore.newsSummary}</p>
                  </div>
                )}

                {/* V7.8: Dividend & Short Selling */}
                {(aiScore.dividendYield != null || aiScore.shortSellingRatio != null) && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <h3 className="text-sm font-semibold text-slate-700 mb-4">Dividend · Short Selling</h3>
                    <div className="grid grid-cols-2 gap-4">
                      {aiScore.dividendYield != null && (
                        <div className="bg-teal-50 rounded-lg p-3">
                          <div className="text-xs text-teal-600 mb-1">配当利回り</div>
                          <div className="text-xl font-bold text-teal-700">{aiScore.dividendYield.toFixed(2)}%</div>
                          {aiScore.dividendAnn != null && (
                            <div className="text-xs text-teal-500 mt-1">年間 ¥{aiScore.dividendAnn.toFixed(0)}</div>
                          )}
                          {aiScore.payoutRatio != null && (
                            <div className="text-xs text-teal-500">
                              配当性向 {(aiScore.payoutRatio < 1.5 ? aiScore.payoutRatio * 100 : aiScore.payoutRatio).toFixed(0)}%
                            </div>
                          )}
                          {aiScore.dividendScore != null && (
                            <div className="text-xs text-teal-600 mt-1 font-medium">配当スコア {aiScore.dividendScore}/10</div>
                          )}
                        </div>
                      )}
                      {aiScore.shortSellingRatio != null && (
                        <div className="bg-red-50 rounded-lg p-3">
                          <div className="text-xs text-red-600 mb-1">市場空売り比率</div>
                          <div className="text-xl font-bold text-red-700">{aiScore.shortSellingRatio.toFixed(1)}%</div>
                          <div className="text-xs text-red-500 mt-1">
                            {aiScore.shortSellingDate ? `${aiScore.shortSellingDate} JPX` : "JPX日次"}
                          </div>
                          <div className="text-xs text-red-400 mt-1">
                            {aiScore.shortSellingSource === "jpx_real" ? "✓ 実データ" : "⚠ fallback"}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Sub-score Detail Bars */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                  <h3 className="text-sm font-semibold text-slate-700 mb-5">Score Details</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                    {[
                      { label: "均线趋势",   key: "maTrendScore",       max: 12, color: "bg-blue-400" },
                      { label: "MACD信号",   key: "macdScore",           max: 8,  color: "bg-blue-400" },
                      { label: "RSI位置",    key: "rsiScore",            max: 6,  color: "bg-blue-400" },
                      { label: "价格动能",   key: "momentumScore",       max: 4,  color: "bg-blue-400" },
                      { label: "营业利润率", key: "opMarginScore",       max: 8,  color: "bg-emerald-400" },
                      { label: "ROE",        key: "roeScore",            max: 7,  color: "bg-emerald-400" },
                      { label: "EPS",        key: "epsScore",            max: 5,  color: "bg-emerald-400" },
                      { label: "自有资本率", key: "equityRatioScore",    max: 5,  color: "bg-emerald-400" },
                      { label: "资金流入",   key: "inflowScore",         max: 8,  color: "bg-violet-400" },
                      { label: "趋势稳定",   key: "stabilityScore",      max: 7,  color: "bg-violet-400" },
                      { label: "空方压力",   key: "shortPressureScore",  max: 5,  color: "bg-violet-400" },
                    ].map((item) => {
                      const score = (aiScore.detail as Record<string, number>)[item.key] ?? 0;
                      const pct = Math.round((score / item.max) * 100);
                      return (
                        <div key={item.key} className="flex items-center gap-3">
                          <span className="text-xs text-slate-500 w-24 shrink-0">{item.label}</span>
                          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${item.color}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs tabular-nums text-slate-600 w-12 text-right shrink-0">
                            {score}/{item.max}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* ── Tab: News ─────────────────────────────────────────────────────── */}
      {activeTab === "news" && (
        <div className="space-y-3">
          {newsLoading && (
            <div className="text-center py-12 text-slate-400 text-sm animate-pulse">{t("common.loading")}</div>
          )}
          {newsIsGeneral && newsItems && newsItems.length > 0 && (
            <div className="text-xs text-slate-400 bg-slate-50 rounded-lg px-3 py-2 mb-1">
              {t("news.no_stock_news")}
            </div>
          )}
          {!newsLoading && newsItems !== null && newsItems.length === 0 && (
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-8 text-center">
              <div className="text-slate-400 text-sm">{t("news.no_data")}</div>
            </div>
          )}
          {!newsLoading && newsItems && newsItems.map((item) => {
            const sentimentColor =
              item.sentiment === "POSITIVE" ? "text-green-700 bg-green-50 border-green-100"
              : item.sentiment === "NEGATIVE" ? "text-red-700 bg-red-50 border-red-100"
              : "text-slate-500 bg-slate-50 border-slate-100";
            const sentimentEmoji =
              item.sentiment === "POSITIVE" ? "🟢" : item.sentiment === "NEGATIVE" ? "🔴" : "⚪";

            const categoryLabel: Record<string, string> = {
              EARNINGS: t("news.earnings"), GUIDANCE: t("news.guidance"), DIVIDEND: t("news.dividend"),
              BUYBACK: t("news.buyback"), IR: t("news.ir"), MARKET: t("news.market_cat"), OTHER: "",
            };
            const categoryColor: Record<string, string> = {
              EARNINGS: "bg-purple-50 text-purple-700 border-purple-100",
              GUIDANCE: "bg-amber-50 text-amber-700 border-amber-100",
              DIVIDEND: "bg-teal-50 text-teal-700 border-teal-100",
              BUYBACK: "bg-blue-50 text-blue-700 border-blue-100",
              IR: "bg-slate-100 text-slate-600 border-slate-200",
              MARKET: "bg-slate-50 text-slate-400 border-slate-100",
              OTHER: "",
            };

            const cat = item.category ?? "OTHER";
            const catLabel = categoryLabel[cat] ?? "";
            const catColor = categoryColor[cat] ?? "";
            const imp = item.importance ?? 0;
            const impLevel = imp >= 7 ? "HIGH" : imp >= 4 ? "MEDIUM" : "LOW";
            const impDot = impLevel === "HIGH" ? "bg-red-400" : impLevel === "MEDIUM" ? "bg-amber-400" : "bg-slate-300";
            const displayUrl = item.url.startsWith("tdnet:") ? item.url.slice(6) : item.url;

            return (
              <a
                key={item.id}
                href={displayUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-white rounded-2xl border border-slate-200 shadow-sm p-4 hover:border-slate-300 hover:shadow transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      {catLabel && (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${catColor}`}>
                          {catLabel}
                        </span>
                      )}
                      {impLevel !== "LOW" && (
                        <span className={`w-1.5 h-1.5 rounded-full ${impDot}`} />
                      )}
                      {item.relatedSymbolConfidence >= 70 && (
                        <span className="text-[10px] text-teal-600 bg-teal-50 border border-teal-100 px-1.5 py-0.5 rounded">{t("news.stock_badge")}</span>
                      )}
                    </div>
                    <div className="text-sm font-medium text-slate-900 leading-snug line-clamp-2 mb-2">{item.title}</div>
                    {item.summary && (
                      <div className="text-xs text-slate-500 line-clamp-2 mb-2">{item.summary}</div>
                    )}
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span>{item.source}</span>
                      <span>·</span>
                      <span>{new Date(item.publishedAt).toLocaleDateString(lang, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  </div>
                  <div className={`shrink-0 flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg border ${sentimentColor}`}>
                    <span>{sentimentEmoji}</span>
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
