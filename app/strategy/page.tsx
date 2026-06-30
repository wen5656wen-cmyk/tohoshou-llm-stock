"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n";

// ── Types ─────────────────────────────────────────────────────────────────────

type StratType = "DAY_TRADE" | "SWING_TRADE" | "LONG_TRADE";
const ALL_TYPES: StratType[] = ["DAY_TRADE", "SWING_TRADE", "LONG_TRADE"];

type LearningReport = {
  reportDate:      string | null;
  grade:           string | null;
  recommendation:  string | null;
  integrityScore:  number | null;
  predictionScore: number | null;
  stabilityScore:  number | null;
  confidenceScore: number | null;
  sampleCount:     number;
  fillRate:        number | null;
  winRate:         number | null;
  alpha:           number | null;
  maxDrawdown:     number | null;
  summary:         string | null;
};

type BacktestSummary = {
  horizon:         string;
  sampleCount:     number;
  filledCount:     number;
  fillRate:        number | null;
  winRate:         number | null;
  lossRate:        number | null;
  avgReturnPct:    number | null;
  alpha:           number | null;
  maxDrawdown:     number | null;
  sharpeRatio:     number | null;
  avgHoldingDays:  number | null;
  asOfDate:        string;
};

type Recommendation = {
  rank:      number;
  symbol:    string;
  aiScore:   number | null;
  finalScore: number | null;
  tradeDate: string;
};

type OpenPosition = {
  id:            number;
  symbol:        string;
  entryDate:     string;
  entryPrice:    number;
  currentPrice:  number | null;
  returnPct:     number | null;
  returnAmount:  number | null;
  alpha:         number | null;
  holdingDays:   number | null;
  quantity:      number;
};

type RecentTrade = {
  id:          number;
  symbol:      string;
  tradeDate:   string;
  returnPct:   number | null;
  returnAmount: number | null;
  alpha:       number | null;
  win:         boolean | null;
  holdingDays: number | null;
  exitReason:  string | null;
  entryPrice:  number | null;
  exitPrice:   number | null;
};

type StrategyDetail = {
  strategyType:    string;
  capitalLog:      { logDate: string; cashAfter: number; investedAfter: number; totalAfter: number } | null;
  openPositions:   OpenPosition[];
  recentTrades:    RecentTrade[];
  backtestSummaries: BacktestSummary[];
  learning:        LearningReport | null;
  recommendations: { top10: Recommendation[]; top100Count: number; tradeDate: string | null };
};

type OverviewStrategy = {
  openPositions:   number;
  closedTrades:    number;
  learning:        LearningReport | null;
  bestBacktest:    BacktestSummary | null;
  latestSnapshot:  { cumulativeReturnPct: number | null; alpha: number | null; winRate: number | null } | null;
  recommendations: { top10Count: number; top100Count: number; tradeDate: string | null } | null;
};

type OverviewData = {
  strategies: Record<StratType, OverviewStrategy>;
  unified:    { reportDate: string; integrityScore: number | null; grade: string | null; recommendation: string | null } | null;
};

// ── Color utilities ───────────────────────────────────────────────────────────

const STRAT_COLOR: Record<StratType, { bg: string; border: string; text: string; badge: string; dot: string }> = {
  DAY_TRADE:   { bg: "bg-amber-900/20",   border: "border-amber-700/40",   text: "text-amber-400",   badge: "bg-amber-900/50 text-amber-300",   dot: "bg-amber-400" },
  SWING_TRADE: { bg: "bg-blue-900/20",    border: "border-blue-700/40",    text: "text-blue-400",    badge: "bg-blue-900/50 text-blue-300",    dot: "bg-blue-400"  },
  LONG_TRADE:  { bg: "bg-emerald-900/20", border: "border-emerald-700/40", text: "text-emerald-400", badge: "bg-emerald-900/50 text-emerald-300", dot: "bg-emerald-400" },
};

function stratLabel(s: StratType, t: (k: MessageKey) => string): string {
  if (s === "DAY_TRADE")   return t("strategy.DAY");
  if (s === "SWING_TRADE") return t("strategy.SWING");
  return t("strategy.long");
}

function stratShort(s: StratType, t: (k: MessageKey) => string): string {
  if (s === "DAY_TRADE")   return t("strategy.DAY.short");
  if (s === "SWING_TRADE") return t("strategy.SWING.short");
  return t("strategy.long.short");
}

function returnColor(v: number | null): string {
  if (v == null) return "text-slate-400";
  return v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-slate-400";
}

function fmtPct(v: number | null, dec = 2): string {
  if (v == null) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(dec)}%`;
}

function fmtScore(v: number | null): string {
  if (v == null) return "—";
  return v.toFixed(1);
}

// ── Grade badge ───────────────────────────────────────────────────────────────

function GradeBadge({ grade }: { grade: string | null }) {
  if (!grade) return <span className="text-slate-500 text-xs">—</span>;
  const color =
    grade === "A+" ? "bg-emerald-500/20 text-emerald-300 border-emerald-600/40" :
    grade === "A"  ? "bg-green-500/20   text-green-300   border-green-600/40"   :
    grade === "B"  ? "bg-yellow-500/20  text-yellow-300  border-yellow-600/40"  :
    grade === "C"  ? "bg-orange-500/20  text-orange-300  border-orange-600/40"  :
                    "bg-slate-700/40   text-slate-400   border-slate-600/40";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${color}`}>
      {grade}
    </span>
  );
}

// ── Recommendation status badge ───────────────────────────────────────────────

function RecBadge({ rec, t }: { rec: string | null; t: (k: MessageKey) => string }) {
  if (!rec) return <span className="text-slate-500 text-xs">—</span>;
  const cfg =
    rec === "READY"     ? { cls: "bg-emerald-500/20 text-emerald-300 border-emerald-600/40", label: t("strategy.status.ready")     } :
    rec === "PARTIAL"   ? { cls: "bg-yellow-500/20  text-yellow-300  border-yellow-600/40",  label: t("strategy.status.partial")   } :
                          { cls: "bg-slate-600/30   text-slate-400   border-slate-600/40",   label: t("strategy.status.not_ready") };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ── Fillrate maturity label ───────────────────────────────────────────────────

function maturity(fillRate: number | null): { label: string; cls: string } {
  if (fillRate == null || fillRate < 0.30) return { label: "INSUFFICIENT", cls: "text-slate-500" };
  if (fillRate < 0.50) return { label: "LIMITED",       cls: "text-orange-400" };
  if (fillRate < 0.80) return { label: "PARTIAL",       cls: "text-yellow-400" };
  return                       { label: "READY",         cls: "text-emerald-400" };
}

// ── Overview card ─────────────────────────────────────────────────────────────

function OverviewCard({
  strategyType, data, t, active, onClick,
}: {
  strategyType: StratType;
  data: OverviewStrategy;
  t: (k: MessageKey) => string;
  active: boolean;
  onClick: () => void;
}) {
  const c = STRAT_COLOR[strategyType];
  const lrn = data.learning;
  const snap = data.latestSnapshot;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border transition-all p-4 ${c.bg} ${c.border} ${
        active ? "ring-2 ring-offset-2 ring-offset-[#0f172a] ring-opacity-60 " + (
          strategyType === "DAY_TRADE"   ? "ring-amber-500"  :
          strategyType === "SWING_TRADE" ? "ring-blue-500"   : "ring-emerald-500"
        ) : "hover:brightness-110"
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${c.dot}`} />
          <span className={`text-sm font-semibold ${c.text}`}>{stratLabel(strategyType, t)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <GradeBadge grade={lrn?.grade ?? null} />
          <RecBadge rec={lrn?.recommendation ?? null} t={t} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-slate-500 mb-0.5">{t("strategy.capital.return")}</div>
          <div className={`font-semibold tabular-nums ${returnColor(snap?.cumulativeReturnPct ?? null)}`}>
            {fmtPct(snap?.cumulativeReturnPct ?? null)}
          </div>
        </div>
        <div>
          <div className="text-slate-500 mb-0.5">{t("strategy.avg_alpha")}</div>
          <div className={`font-semibold tabular-nums ${returnColor(snap?.alpha ?? null)}`}>
            {fmtPct(snap?.alpha ?? null)}
          </div>
        </div>
        <div>
          <div className="text-slate-500 mb-0.5">{t("strategy.win_rate")}</div>
          <div className="text-slate-200 font-semibold tabular-nums">
            {snap?.winRate != null ? `${(snap.winRate * 100).toFixed(0)}%` : "—"}
          </div>
        </div>
        <div>
          <div className="text-slate-500 mb-0.5">{t("strategy.learning.integrity")}</div>
          <div className={`font-semibold tabular-nums ${lrn?.integrityScore != null ? "text-slate-200" : "text-slate-500"}`}>
            {fmtScore(lrn?.integrityScore ?? null)}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3 text-[10px] text-slate-500">
        <span>{t("strategy.open_count")} <span className="text-slate-300">{data.openPositions}</span></span>
        <span>{t("strategy.sample_count")} <span className="text-slate-300">{data.closedTrades}</span></span>
        {data.recommendations && (
          <span>Top10 <span className="text-slate-300">{data.recommendations.top10Count}</span></span>
        )}
      </div>
    </button>
  );
}

// ── Learning section ──────────────────────────────────────────────────────────

function LearningSection({ learning, t }: { learning: LearningReport | null; t: (k: MessageKey) => string }) {
  if (!learning) {
    return (
      <div className="bg-slate-800/30 rounded-lg border border-slate-700/40 p-4 text-slate-500 text-sm text-center">
        {t("strategy.collecting")}
      </div>
    );
  }

  const scores = [
    { key: t("strategy.learning.prediction"), val: learning.predictionScore },
    { key: t("strategy.learning.stability"),  val: learning.stabilityScore  },
    { key: t("strategy.learning.confidence"), val: learning.confidenceScore },
    { key: t("strategy.learning.integrity"),  val: learning.integrityScore  },
  ];

  return (
    <div className="bg-slate-800/30 rounded-lg border border-slate-700/40 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-300">{t("strategy.learning.grade")}</h3>
        <div className="flex items-center gap-2">
          <GradeBadge grade={learning.grade} />
          <RecBadge rec={learning.recommendation} t={t} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        {scores.map(({ key, val }) => (
          <div key={key} className="text-center">
            <div className="text-[10px] text-slate-500 mb-1">{key}</div>
            <div className="text-lg font-bold text-slate-100 tabular-nums">{fmtScore(val)}</div>
            <div className="h-1 bg-slate-700 rounded-full mt-1 overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${Math.min(100, val ?? 0)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3 text-xs text-slate-400 border-t border-slate-700/40 pt-3">
        <div>{t("strategy.win_rate")} <span className="text-slate-200 font-medium tabular-nums">
          {learning.winRate != null ? `${(learning.winRate * 100).toFixed(0)}%` : "—"}</span>
        </div>
        <div>{t("strategy.avg_alpha")} <span className={`font-medium tabular-nums ${returnColor(learning.alpha)}`}>
          {fmtPct(learning.alpha)}</span>
        </div>
        <div>n= <span className="text-slate-200 font-medium tabular-nums">{learning.sampleCount}</span></div>
      </div>

      {learning.summary && (
        <div className="mt-2 text-[10px] text-slate-500 font-mono break-all">{learning.summary}</div>
      )}
    </div>
  );
}

// ── Backtest section ──────────────────────────────────────────────────────────

function BacktestSection({ summaries, t }: { summaries: BacktestSummary[]; t: (k: MessageKey) => string }) {
  if (summaries.length === 0) {
    return (
      <div className="bg-slate-800/30 rounded-lg border border-slate-700/40 p-4 text-slate-500 text-sm text-center">
        {t("strategy.collecting")}
      </div>
    );
  }

  // Sort horizons numerically
  const sorted = [...summaries].sort((a, b) => parseInt(a.horizon) - parseInt(b.horizon));

  return (
    <div className="bg-slate-800/30 rounded-lg border border-slate-700/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700/40">
        <h3 className="text-sm font-semibold text-slate-300">{t("strategy.backtest.section")}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-700/30 text-slate-500">
              <th className="text-left px-4 py-2">期間</th>
              <th className="text-right px-3 py-2">{t("strategy.win_rate")}</th>
              <th className="text-right px-3 py-2">{t("strategy.avg_return")}</th>
              <th className="text-right px-3 py-2">{t("strategy.avg_alpha")}</th>
              <th className="text-right px-3 py-2">Drawdown</th>
              <th className="text-right px-3 py-2">n</th>
              <th className="text-right px-4 py-2">Fill</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const m = maturity(row.fillRate);
              return (
                <tr key={row.horizon} className="border-b border-slate-700/20 hover:bg-slate-700/10">
                  <td className="px-4 py-2.5 font-medium text-slate-300">{row.horizon}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${row.winRate != null ? returnColor((row.winRate - 0.5) * 100) : "text-slate-500"}`}>
                    {row.winRate != null ? `${(row.winRate * 100).toFixed(0)}%` : "—"}
                  </td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${returnColor(row.avgReturnPct)}`}>
                    {fmtPct(row.avgReturnPct)}
                  </td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${returnColor(row.alpha)}`}>
                    {fmtPct(row.alpha)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-400">
                    {row.maxDrawdown != null ? `${row.maxDrawdown.toFixed(1)}%` : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">{row.filledCount}</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums ${m.cls}`}>{m.label}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Positions section ─────────────────────────────────────────────────────────

function PositionsSection({ positions, t }: { positions: OpenPosition[]; t: (k: MessageKey) => string }) {
  return (
    <div className="bg-slate-800/30 rounded-lg border border-slate-700/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700/40 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-300">{t("strategy.position.open_title")}</h3>
        <span className="text-xs text-slate-500">{positions.length}</span>
      </div>
      {positions.length === 0 ? (
        <div className="p-6 text-center text-slate-500 text-sm">{t("strategy.position.none")}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-700/30 text-slate-500">
                <th className="text-left px-4 py-2">銘柄</th>
                <th className="text-right px-3 py-2">買値</th>
                <th className="text-right px-3 py-2">現在値</th>
                <th className="text-right px-3 py-2">損益%</th>
                <th className="text-right px-3 py-2">α</th>
                <th className="text-right px-4 py-2">保有</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.id} className="border-b border-slate-700/20 hover:bg-slate-700/10">
                  <td className="px-4 py-2.5">
                    <Link href={`/stocks/${encodeURIComponent(p.symbol)}`} className="text-blue-400 hover:text-blue-300 font-medium">
                      {p.symbol}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">
                    {p.entryPrice != null ? `¥${Math.round(p.entryPrice).toLocaleString("ja-JP")}` : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">
                    {p.currentPrice != null ? `¥${Math.round(p.currentPrice).toLocaleString("ja-JP")}` : "—"}
                  </td>
                  <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${returnColor(p.returnPct)}`}>
                    {fmtPct(p.returnPct)}
                  </td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${returnColor(p.alpha)}`}>
                    {fmtPct(p.alpha)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-400">
                    {p.holdingDays != null ? `${p.holdingDays}${t("strategy.days_unit")}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Trades section ────────────────────────────────────────────────────────────

function TradesSection({ trades, t }: { trades: RecentTrade[]; t: (k: MessageKey) => string }) {
  return (
    <div className="bg-slate-800/30 rounded-lg border border-slate-700/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700/40 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-300">{t("strategy.trade.title")}</h3>
        <span className="text-xs text-slate-500">{trades.length}</span>
      </div>
      {trades.length === 0 ? (
        <div className="p-6 text-center text-slate-500 text-sm">{t("strategy.trade.none")}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-700/30 text-slate-500">
                <th className="text-left px-4 py-2">銘柄</th>
                <th className="text-right px-3 py-2">日付</th>
                <th className="text-right px-3 py-2">損益%</th>
                <th className="text-right px-3 py-2">α</th>
                <th className="text-right px-3 py-2">保有</th>
                <th className="text-right px-4 py-2">決済</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((tr) => (
                <tr key={tr.id} className="border-b border-slate-700/20 hover:bg-slate-700/10">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${tr.win ? "bg-emerald-400" : "bg-red-400"}`} />
                      <Link href={`/stocks/${encodeURIComponent(tr.symbol)}`} className="text-blue-400 hover:text-blue-300 font-medium">
                        {tr.symbol}
                      </Link>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-400">
                    {tr.tradeDate ? tr.tradeDate.slice(0, 10) : "—"}
                  </td>
                  <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${returnColor(tr.returnPct)}`}>
                    {fmtPct(tr.returnPct)}
                  </td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${returnColor(tr.alpha)}`}>
                    {fmtPct(tr.alpha)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-400">
                    {tr.holdingDays != null ? `${tr.holdingDays}${t("strategy.days_unit")}` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-500">
                    {tr.exitReason ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Recommendations section ───────────────────────────────────────────────────

function RecommendationSection({
  recs, t,
}: {
  recs: StrategyDetail["recommendations"];
  t: (k: MessageKey) => string;
}) {
  return (
    <div className="bg-slate-800/30 rounded-lg border border-slate-700/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700/40 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-300">{t("strategy.rec.title")}</h3>
        <div className="flex items-center gap-3 text-[10px] text-slate-500">
          {recs.tradeDate && <span>{recs.tradeDate.slice(0, 10)}</span>}
          <span>{t("strategy.rec.top100")} <span className="text-slate-300">{recs.top100Count}</span></span>
        </div>
      </div>
      {recs.top10.length === 0 ? (
        <div className="p-6 text-center text-slate-500 text-sm">{t("strategy.collecting")}</div>
      ) : (
        <div className="p-3 grid grid-cols-2 md:grid-cols-5 gap-2">
          {recs.top10.map((rec) => (
            <Link
              key={rec.symbol}
              href={`/stocks/${encodeURIComponent(rec.symbol)}`}
              className="bg-slate-700/30 rounded-lg p-2.5 hover:bg-slate-700/50 transition-colors text-center"
            >
              <div className="text-[10px] text-slate-500 mb-0.5">#{rec.rank}</div>
              <div className="text-sm font-semibold text-blue-400">{rec.symbol}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {t("strategy.rec.ai_score")} {rec.aiScore != null ? rec.aiScore.toFixed(1) : "—"}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Capital stats ─────────────────────────────────────────────────────────────

function CapitalSection({
  capitalLog, snapshot, t,
}: {
  capitalLog: StrategyDetail["capitalLog"];
  snapshot: OverviewStrategy["latestSnapshot"] | null;
  t: (k: MessageKey) => string;
}) {
  const cash      = capitalLog?.cashAfter      ?? null;
  const invested  = capitalLog?.investedAfter  ?? null;
  const total     = capitalLog?.totalAfter     ?? null;
  const cumReturn = snapshot?.cumulativeReturnPct ?? null;
  const alpha     = snapshot?.alpha ?? null;
  const winRate   = snapshot?.winRate ?? null;

  return (
    <div className="bg-slate-800/30 rounded-lg border border-slate-700/40 p-4">
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 text-xs">
        <div>
          <div className="text-slate-500 mb-1">{t("strategy.capital.cash")}</div>
          <div className="text-slate-200 font-semibold tabular-nums">
            {cash != null ? `¥${Math.round(cash).toLocaleString("ja-JP")}` : "—"}
          </div>
        </div>
        <div>
          <div className="text-slate-500 mb-1">{t("strategy.capital.invested")}</div>
          <div className="text-slate-200 font-semibold tabular-nums">
            {invested != null ? `¥${Math.round(invested).toLocaleString("ja-JP")}` : "—"}
          </div>
        </div>
        <div>
          <div className="text-slate-500 mb-1">{t("strategy.capital.total")}</div>
          <div className="text-slate-200 font-semibold tabular-nums">
            {total != null ? `¥${Math.round(total).toLocaleString("ja-JP")}` : "—"}
          </div>
        </div>
        <div>
          <div className="text-slate-500 mb-1">{t("strategy.capital.return")}</div>
          <div className={`font-semibold tabular-nums ${returnColor(cumReturn)}`}>
            {fmtPct(cumReturn)}
          </div>
        </div>
        <div>
          <div className="text-slate-500 mb-1">{t("strategy.avg_alpha")}</div>
          <div className={`font-semibold tabular-nums ${returnColor(alpha)}`}>
            {fmtPct(alpha)}
          </div>
        </div>
        <div>
          <div className="text-slate-500 mb-1">{t("strategy.win_rate")}</div>
          <div className="text-slate-200 font-semibold tabular-nums">
            {winRate != null ? `${(winRate * 100).toFixed(0)}%` : "—"}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Strategy detail tab ───────────────────────────────────────────────────────

function StrategyTab({
  strategyType,
  overview,
  t,
}: {
  strategyType: StratType;
  overview: OverviewStrategy | null;
  t: (k: MessageKey) => string;
}) {
  const [detail, setDetail] = useState<StrategyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]  = useState<string | null>(null);

  const fetchDetail = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/strategy/${strategyType}`)
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((d: StrategyDetail) => { setDetail(d); setLoading(false); })
      .catch((e) => { setError(String(e)); setLoading(false); });
  }, [strategyType]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 bg-slate-800/30 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="bg-red-900/20 border border-red-700/40 rounded-xl p-6 text-red-400 text-sm">
        Error: {error ?? "No data"}
      </div>
    );
  }

  const isDayTrade = strategyType === "DAY_TRADE";

  return (
    <div className="space-y-4">
      {/* Capital stats for SWING/LONG */}
      {!isDayTrade && (
        <CapitalSection capitalLog={detail.capitalLog} snapshot={overview?.latestSnapshot ?? null} t={t} />
      )}

      {/* Recommendations (Top10) */}
      <RecommendationSection recs={detail.recommendations} t={t} />

      {/* Trades (all strategies — "今日交易" for DAY, "最近交易" for SWING/LONG) */}
      <TradesSection trades={detail.recentTrades} t={t} />

      {/* Positions (SWING / LONG only — spec: DAY 禁止显示持有至今/当前持仓) */}
      {!isDayTrade && (
        <PositionsSection positions={detail.openPositions} t={t} />
      )}

      {/* Learning */}
      <div>
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          {t("strategy.learning.grade")}
        </div>
        <LearningSection learning={detail.learning} t={t} />
      </div>

      {/* Backtest */}
      <div>
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          {t("strategy.backtest.section")}
        </div>
        <BacktestSection summaries={detail.backtestSummaries} t={t} />
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function StrategyPage() {
  const { t } = useI18n();
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<StratType>("DAY_TRADE");

  useEffect(() => {
    fetch("/api/strategy/overview")
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((d: OverviewData) => { setOverview(d); setOverviewLoading(false); })
      .catch(() => setOverviewLoading(false));
  }, []);

  const unified = overview?.unified;

  return (
    <div className="p-4 md:p-6 max-w-6xl bg-[#0f172a] min-h-screen">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">{t("strategy.center.title")}</h1>
          <p className="text-slate-400 text-sm mt-0.5">{t("strategy.center.subtitle")}</p>
        </div>
        {unified && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-slate-500">{t("strategy.learning.integrity")}</span>
            <span className="text-lg font-bold text-slate-100 tabular-nums">
              {unified.integrityScore?.toFixed(1) ?? "—"}
            </span>
            <GradeBadge grade={unified.grade ?? null} />
            <RecBadge rec={unified.recommendation ?? null} t={t} />
          </div>
        )}
      </div>

      {/* Overview cards */}
      <div className="mb-6">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
          {t("strategy.center.overview")}
        </div>
        {overviewLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-32 bg-slate-800/30 rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {ALL_TYPES.map((s) => (
              <OverviewCard
                key={s}
                strategyType={s}
                data={overview?.strategies[s] ?? {
                  openPositions: 0, closedTrades: 0,
                  learning: null, bestBacktest: null, latestSnapshot: null, recommendations: null,
                }}
                t={t}
                active={activeTab === s}
                onClick={() => setActiveTab(s)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="mb-4 flex items-center gap-1 border-b border-slate-700/50">
        {ALL_TYPES.map((s) => {
          const c = STRAT_COLOR[s];
          return (
            <button
              key={s}
              onClick={() => setActiveTab(s)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === s
                  ? `${c.text} border-current`
                  : "text-slate-500 border-transparent hover:text-slate-300"
              }`}
            >
              {stratShort(s, t)}
            </button>
          );
        })}
      </div>

      {/* Active tab content */}
      <StrategyTab
        key={activeTab}
        strategyType={activeTab}
        overview={overview?.strategies[activeTab] ?? null}
        t={t}
      />
    </div>
  );
}
