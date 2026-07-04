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
  rank:             number;
  symbol:           string;
  aiScore:          number | null;
  finalScore:       number | null;
  technicalScore:   number | null;
  fundamentalScore: number | null;
  newsScore:        number | null;
  tradeDate:        string;
};

type TodayExecution = {
  dayRecOk:   boolean;
  swingRecOk: boolean;
  longRecOk:  boolean;
  backtestOk: boolean;
  learningOk: boolean;
  healthOk:   boolean;
  validDate:  string | null;
  isToday:    boolean;
  dayTradeSettledDate: string | null;
  dayTradeResultOk:    boolean;
  dayTradeSnapshotOk:  boolean;
};

type RecentValidationSummary = {
  healthDays:  number;
  totalDays:   number;
  phase7Ready: boolean;
  phase7Detail: string | null;
  stableDays:  number;
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
  strategies:        Record<StratType, OverviewStrategy>;
  unified:           { reportDate: string; integrityScore: number | null; grade: string | null; recommendation: string | null } | null;
  todayExecution?:   TodayExecution | null;
  recentValidation?: RecentValidationSummary | null;
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

function maturity(fillRate: number | null): { labelKey: MessageKey; cls: string } {
  if (fillRate == null || fillRate < 0.30) return { labelKey: "strategy.maturity.insufficient", cls: "text-slate-500" };
  if (fillRate < 0.50) return { labelKey: "strategy.maturity.limited",        cls: "text-orange-400" };
  if (fillRate < 0.80) return { labelKey: "strategy.status.partial",          cls: "text-yellow-400" };
  return                       { labelKey: "strategy.status.ready",            cls: "text-emerald-400" };
}

// ── Exit reason translation map ───────────────────────────────────────────────

const EXIT_REASON_KEYS: Record<string, MessageKey> = {
  DAY_CLOSE:          "strategy.exit.DAY_CLOSE",
  TAKE_PROFIT:        "strategy.exit.TAKE_PROFIT",
  STOP_LOSS:          "strategy.exit.STOP_LOSS",
  AI_SCORE_DROP:      "strategy.exit.AI_SCORE_DROP",
  DROPPED_FROM_TOP10: "strategy.exit.DROPPED_FROM_TOP10",
  MAX_HOLD_DAYS:      "strategy.exit.MAX_HOLD_DAYS",
  FUNDAMENTAL_RISK:   "strategy.exit.FUNDAMENTAL_RISK",
  NEGATIVE_NEWS:      "strategy.exit.NEGATIVE_NEWS",
  MANUAL:             "strategy.exit.MANUAL",
  MARKET_CLOSED:      "strategy.exit.MARKET_CLOSED",
  DATA_MISSING:       "strategy.exit.DATA_MISSING",
};

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

      {/* Closed trades — prominent display */}
      <div className="mt-2.5 mb-1">
        <div className="text-[10px] text-slate-500 mb-0.5">{t("strategy.closed_count")}</div>
        <div className="text-sm font-semibold tabular-nums text-slate-200">{data.closedTrades}</div>
      </div>

      <div className="mt-1 flex items-center gap-3 text-[10px] text-slate-500">
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
                  <td className={`px-4 py-2.5 text-right tabular-nums ${m.cls}`}>{t(m.labelKey)}</td>
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
        <h3 className="text-sm font-semibold text-slate-300">{t("strategy.trade.recent")}</h3>
        <span className="text-xs text-slate-500">{trades.length}</span>
      </div>
      {trades.length === 0 ? (
        <div className="p-6 text-center text-slate-500 text-sm">{t("strategy.trade.none")}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-700/30 text-slate-500">
                <th className="text-left px-4 py-2">{t("strategy.rec.date")}</th>
                <th className="text-left px-3 py-2">銘柄</th>
                <th className="text-right px-3 py-2">{t("strategy.trade.buy_price")}</th>
                <th className="text-right px-3 py-2">{t("strategy.trade.sell_price")}</th>
                <th className="text-right px-3 py-2">{t("strategy.avg_return")}</th>
                <th className="text-right px-3 py-2">Alpha</th>
                <th className="text-right px-3 py-2">{t("strategy.days_unit")}</th>
                <th className="text-right px-4 py-2">{t("strategy.trade.exit_reason")}</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((tr) => (
                <tr key={tr.id} className="border-b border-slate-700/20 hover:bg-slate-700/10">
                  <td className="px-4 py-2.5 tabular-nums text-slate-400">
                    {tr.tradeDate ? tr.tradeDate.slice(0, 10) : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${tr.win ? "bg-emerald-400" : "bg-red-400"}`} />
                      <Link href={`/stocks/${encodeURIComponent(tr.symbol)}`} className="text-blue-400 hover:text-blue-300 font-medium">
                        {tr.symbol}
                      </Link>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">
                    {tr.entryPrice != null ? `¥${Math.round(tr.entryPrice).toLocaleString("ja-JP")}` : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">
                    {tr.exitPrice != null ? `¥${Math.round(tr.exitPrice).toLocaleString("ja-JP")}` : "—"}
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
                  <td className="px-4 py-2.5 text-right text-slate-400">
                    {tr.exitReason && EXIT_REASON_KEYS[tr.exitReason]
                      ? t(EXIT_REASON_KEYS[tr.exitReason])
                      : (tr.exitReason ?? "—")}
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
  recs, strategyType, t, onExplain,
}: {
  recs: StrategyDetail["recommendations"];
  strategyType: StratType;
  t: (k: MessageKey) => string;
  onExplain: (symbol: string) => void;
}) {
  type ScoreCol = { label: string; val: (r: Recommendation) => number | null };
  const extraCols: ScoreCol[] =
    strategyType === "DAY_TRADE"
      ? [
          { label: t("strategy.rec.tech"), val: (r) => r.technicalScore },
          { label: t("strategy.rec.news"), val: (r) => r.newsScore },
          { label: t("strategy.rec.final"), val: (r) => r.finalScore },
        ]
      : strategyType === "SWING_TRADE"
      ? [
          { label: t("strategy.rec.tech"), val: (r) => r.technicalScore },
          { label: t("strategy.rec.final"), val: (r) => r.finalScore },
        ]
      : [
          { label: t("strategy.rec.fund"), val: (r) => r.fundamentalScore },
          { label: t("strategy.rec.final"), val: (r) => r.finalScore },
        ];

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
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-700/30 text-slate-500">
                <th className="text-left px-4 py-2">#</th>
                <th className="text-left px-3 py-2">銘柄</th>
                <th className="text-right px-3 py-2">{t("strategy.rec.ai_score")}</th>
                {extraCols.map((c) => (
                  <th key={c.label} className="text-right px-3 py-2">{c.label}</th>
                ))}
                <th className="text-right px-3 py-2">{t("explain.title")}</th>
              </tr>
            </thead>
            <tbody>
              {recs.top10.map((rec) => (
                <tr key={rec.symbol} className="border-b border-slate-700/20 hover:bg-slate-700/10">
                  <td className="px-4 py-2.5 text-slate-500 tabular-nums">{rec.rank}</td>
                  <td className="px-3 py-2.5">
                    <Link href={`/stocks/${encodeURIComponent(rec.symbol)}`} className="text-blue-400 hover:text-blue-300 font-semibold">
                      {rec.symbol}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-200">
                    {rec.aiScore != null ? rec.aiScore.toFixed(1) : "—"}
                  </td>
                  {extraCols.map((c) => (
                    <td key={c.label} className="px-3 py-2.5 text-right tabular-nums text-slate-300">
                      {c.val(rec) != null ? (c.val(rec) as number).toFixed(1) : "—"}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-right">
                    <button
                      onClick={() => onExplain(rec.symbol)}
                      className="text-[11px] px-2 py-1 rounded-md bg-slate-700/50 hover:bg-slate-600/60 text-slate-200 border border-slate-600/40 transition-colors"
                    >
                      {t("explain.view_reason")}
                    </button>
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

// ── AI Explain Drawer (T2 P3) ───────────────────────────────────────────────

type ExplainData = {
  strategyType: StratType;
  symbol: string;
  name: string | null;
  nameZh: string | null;
  tradeDate: string | null;
  found: boolean;
  explanationType: "RECOMMENDED" | "NOT_TOP10" | "NOT_CANDIDATE" | "DATA_INSUFFICIENT";
  conclusion: "STRONG" | "RECOMMEND" | "WATCH" | "NOT_TOP10" | "NOT_CANDIDATE" | "INSUFFICIENT";
  rank: number | null;
  isTop10: boolean;
  totalCount: number;
  totalCandidates: number;
  top10CutoffScore: number | null;
  scoreGap: number | null;
  shortfalls: { code: string; value: number | null }[];
  missingReasons: { code: string; value: number | null }[];
  improvementFactors: string[];
  scoreBreakdown: {
    aiScore: number | null; technicalScore: number | null; fundamentalScore: number | null;
    newsScore: number | null; moneyFlowScore: number | null; riskScore: number | null; finalScore: number | null;
  } | null;
  adaptiveScore: number | null;
  reasons: { code: string; value: number }[];
  risks: { code: string; value?: number }[];
  status: "RECOMMENDING" | "BOUGHT" | "SOLD" | "SKIPPED" | "WAITING_DATA" | "NOT_TOP10" | "NOT_CANDIDATE";
  recommendation: string | null;
  dataQuality: { hasNews: boolean; hasFundamental: boolean; hasPrice: boolean; scoreSource: string | null };
  generatedAt: string;
};

// Lightweight {token} interpolation — keeps all CJK strings inside i18n files.
function fill(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

// Normalize a user-typed stock code: uppercase, and append ".T" for bare digits.
function normalizeSymbol(raw: string): string {
  const s = raw.trim().toUpperCase();
  if (/^\d{3,5}$/.test(s)) return `${s}.T`;
  return s;
}

// Dimension display order per strategy (emphasis first), matching spec §10.
const DIM_ORDER: Record<StratType, string[]> = {
  DAY_TRADE:   ["TECH", "NEWS", "AI", "FUND", "FLOW", "RISK"],
  SWING_TRADE: ["AI", "TECH", "FLOW", "FUND", "NEWS", "RISK"],
  LONG_TRADE:  ["FUND", "AI", "RISK", "TECH", "NEWS", "FLOW"],
};

function dimValue(bd: NonNullable<ExplainData["scoreBreakdown"]>, code: string): number | null {
  switch (code) {
    case "AI":   return bd.aiScore;
    case "TECH": return bd.technicalScore;
    case "FUND": return bd.fundamentalScore;
    case "NEWS": return bd.newsScore;
    case "FLOW": return bd.moneyFlowScore;
    case "RISK": return bd.riskScore;
    default:     return null;
  }
}

function ExplainDrawer({
  strategyType, symbol, tradeDate, onClose,
}: {
  strategyType: StratType;
  symbol: string;
  tradeDate: string | null;
  onClose: () => void;
}) {
  const { t, lang } = useI18n();
  const [data, setData] = useState<ExplainData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setData(null);
    const qs = new URLSearchParams({ strategyType, symbol });
    if (tradeDate) qs.set("tradeDate", tradeDate.slice(0, 10));
    fetch(`/api/strategy/explain?${qs.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: ExplainData) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(() => { if (!cancelled) { setError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [strategyType, symbol, tradeDate]);

  const displayName = data ? (lang === "zh-CN" ? (data.nameZh ?? data.name) : data.name) : null;

  // Summary sentence composition (traceable — no fabrication), by explanationType
  let summary = "";
  if (data) {
    if (data.explanationType === "DATA_INSUFFICIENT") summary = t("explain.data_insufficient_msg");
    else if (data.explanationType === "NOT_CANDIDATE") summary = t("explain.not_candidate_msg");
    else if (data.explanationType === "NOT_TOP10") {
      summary = fill(t("explain.summary.NOT_TOP10"), {
        strat: stratShort(strategyType, t),
        rank: data.rank ?? "—",
        gap: data.scoreGap != null ? data.scoreGap.toFixed(1) : "—",
      });
    } else {
      summary =
        strategyType === "DAY_TRADE" ? t("explain.summary.DAY")
        : strategyType === "SWING_TRADE" ? t("explain.summary.SWING")
        : t("explain.summary.LONG");
    }
  }
  const isDI = data?.explanationType === "DATA_INSUFFICIENT";
  const isNC = data?.explanationType === "NOT_CANDIDATE";

  const fitKey: MessageKey =
    strategyType === "DAY_TRADE" ? "explain.fit.DAY"
    : strategyType === "SWING_TRADE" ? "explain.fit.SWING"
    : "explain.fit.LONG";

  const conclusionColor =
    data?.conclusion === "STRONG" ? "bg-emerald-900/50 text-emerald-300 border-emerald-700/40"
    : data?.conclusion === "RECOMMEND" ? "bg-blue-900/50 text-blue-300 border-blue-700/40"
    : data?.conclusion === "WATCH" ? "bg-amber-900/50 text-amber-300 border-amber-700/40"
    : "bg-slate-700/50 text-slate-300 border-slate-600/40";

  // Score bars
  const bd = data?.scoreBreakdown ?? null;
  const dims = bd
    ? DIM_ORDER[strategyType]
        .map((code) => ({ code, value: dimValue(bd, code) }))
        .filter((d) => d.value != null)
    : [];
  const barMax = Math.max(1, ...dims.map((d) => Math.abs(d.value as number)));

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md h-full bg-slate-900 border-l border-slate-700/60 shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-slate-900 border-b border-slate-700/50 px-5 py-4 flex items-start justify-between z-10">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-slate-100">{symbol}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-300">
                {stratLabel(strategyType, t)}
              </span>
            </div>
            {displayName && <div className="text-xs text-slate-400 mt-0.5">{displayName}</div>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-xl leading-none px-1">×</button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {loading && (
            <div className="py-10 text-center text-slate-500 text-sm">{t("explain.loading")}</div>
          )}
          {error && (
            <div className="py-10 text-center text-red-400 text-sm">{t("explain.load_error")}</div>
          )}
          {data && !loading && !error && (
            <>
              {/* Conclusion + status */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] text-slate-500">{t("explain.conclusion_label")}</span>
                <span className={`text-xs px-2.5 py-1 rounded-full border font-semibold ${conclusionColor}`}>
                  {t(`explain.conclusion.${data.conclusion}` as MessageKey)}
                </span>
                <span className="text-[10px] text-slate-500 ml-2">{t("explain.status_label")}</span>
                <span className="text-xs px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700/50">
                  {t(`explain.status.${data.status}` as MessageKey)}
                </span>
              </div>

              {/* Summary */}
              <p className="text-sm text-slate-300 leading-relaxed">{summary}</p>

              {/* Not-Top10 metrics: rank / cutoff / gap */}
              {data.explanationType === "NOT_TOP10" && (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-slate-800/50 rounded-lg p-2">
                    <div className="text-[10px] text-slate-500">{t("explain.rank")}</div>
                    <div className="text-sm font-semibold text-slate-200 tabular-nums">
                      {data.rank ?? "—"}<span className="text-[10px] text-slate-500"> / {data.totalCandidates}</span>
                    </div>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-2">
                    <div className="text-[10px] text-slate-500">{t("explain.cutoff")}</div>
                    <div className="text-sm font-semibold text-slate-200 tabular-nums">
                      {data.top10CutoffScore != null ? data.top10CutoffScore.toFixed(1) : "—"}
                    </div>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-2">
                    <div className="text-[10px] text-slate-500">{t("explain.score_gap")}</div>
                    <div className="text-sm font-semibold text-amber-400 tabular-nums">
                      {data.scoreGap != null ? `-${data.scoreGap.toFixed(1)}` : "—"}
                    </div>
                  </div>
                </div>
              )}

              {/* Not-Candidate metrics: candidate pool / overall score / rating */}
              {isNC && (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-slate-800/50 rounded-lg p-2">
                    <div className="text-[10px] text-slate-500">{t("explain.candidate_pool")}</div>
                    <div className="text-sm font-semibold text-slate-200 tabular-nums">{data.totalCandidates}</div>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-2">
                    <div className="text-[10px] text-slate-500">{t("explain.overall_score")}</div>
                    <div className="text-sm font-semibold text-slate-200 tabular-nums">
                      {data.adaptiveScore != null ? data.adaptiveScore.toFixed(1) : "—"}
                    </div>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-2">
                    <div className="text-[10px] text-slate-500">{t("explain.cutoff")}</div>
                    <div className="text-sm font-semibold text-slate-200 tabular-nums">
                      {data.top10CutoffScore != null ? data.top10CutoffScore.toFixed(1) : "—"}
                    </div>
                  </div>
                </div>
              )}

              {/* Score breakdown */}
              {bd && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t("explain.breakdown")}</h4>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-500 mr-1">{t("explain.final_score")}</span>
                      <span className="text-base font-bold text-slate-100 tabular-nums">
                        {bd.finalScore != null ? bd.finalScore.toFixed(1) : "—"}
                      </span>
                    </div>
                  </div>
                  {dims.length === 0 ? (
                    <div className="text-xs text-slate-500">{t("explain.no_data")}</div>
                  ) : (
                    <div className="space-y-1.5">
                      {dims.map((d) => {
                        const v = d.value as number;
                        const pct = (Math.abs(v) / barMax) * 100;
                        const neg = v < 0;
                        return (
                          <div key={d.code} className="flex items-center gap-2">
                            <span className="w-14 text-[11px] text-slate-400 shrink-0">
                              {t(`explain.dim.${d.code}` as MessageKey)}
                            </span>
                            <div className="flex-1 h-3 bg-slate-800 rounded overflow-hidden">
                              <div
                                className={`h-full ${neg ? "bg-red-500/70" : "bg-blue-500/70"}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className={`w-10 text-right text-[11px] tabular-nums ${neg ? "text-red-400" : "text-slate-300"}`}>
                              {v.toFixed(0)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Reasons — only for stocks in the recommendation pool */}
              {data.found && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{t("explain.reasons")}</h4>
                  {data.reasons.length === 0 ? (
                    <div className="text-xs text-slate-500">{t("explain.no_data")}</div>
                  ) : (
                    <ul className="space-y-1">
                      {data.reasons.map((r) => (
                        <li key={r.code} className="flex items-center justify-between text-xs">
                          <span className="text-slate-300">· {t(`explain.reason.${r.code}` as MessageKey)}</span>
                          <span className="text-slate-400 tabular-nums">{r.value.toFixed(1)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Main shortfalls (未入选主要短板) — NOT_TOP10 / NOT_CANDIDATE */}
              {(data.explanationType === "NOT_TOP10" || isNC) && data.shortfalls.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{t("explain.missing")}</h4>
                  <ul className="space-y-1">
                    {data.shortfalls.map((m) => (
                      <li key={m.code} className="flex items-center justify-between text-xs">
                        <span className="text-amber-300/90">· {t(`explain.short.${m.code}` as MessageKey)}</span>
                        <span className="text-slate-400 tabular-nums">{m.value != null ? m.value.toFixed(0) : ""}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Improvement factors (改善建议) */}
              {data.improvementFactors.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{t("explain.improvement")}</h4>
                  <ul className="space-y-1">
                    {data.improvementFactors.map((c) => (
                      <li key={c} className="text-xs text-emerald-300/90">→ {t(`explain.imp.${c}` as MessageKey)}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Risks — hidden when there is no usable data at all */}
              {!isDI && data.risks.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{t("explain.risks")}</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {data.risks.map((r) => (
                      <span key={r.code} className="text-[11px] px-2 py-1 rounded-md bg-red-900/20 text-red-300/90 border border-red-800/30">
                        {t(`explain.risk.${r.code}` as MessageKey)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Strategy fit */}
              {!isDI && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{t("explain.fit")}</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">{t(fitKey)}</p>
                </div>
              )}

              {/* Footer meta */}
              <div className="pt-2 border-t border-slate-800 text-[10px] text-slate-500 flex items-center justify-between">
                <span>{t("explain.updated_at")}: {data.generatedAt.slice(0, 19).replace("T", " ")}</span>
                {data.tradeDate && <span>{data.tradeDate}</span>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

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
  const [explainSymbol, setExplainSymbol] = useState<string | null>(null);
  const [queryInput, setQueryInput] = useState("");
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
      <RecommendationSection
        recs={detail.recommendations}
        strategyType={strategyType}
        t={t}
        onExplain={setExplainSymbol}
      />

      {/* Why Not Recommended — query any stock (T2 P4) */}
      <div className="bg-slate-800/30 rounded-lg border border-slate-700/40 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-300 mb-2">{t("explain.query_title")}</h3>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const sym = normalizeSymbol(queryInput);
            if (sym) setExplainSymbol(sym);
          }}
        >
          <input
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder={t("explain.query_placeholder")}
            className="flex-1 bg-slate-900/60 border border-slate-700/50 rounded-md px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-slate-500"
          />
          <button
            type="submit"
            disabled={!queryInput.trim()}
            className="text-xs px-3 py-1.5 rounded-md bg-blue-600/70 hover:bg-blue-500/70 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
          >
            {t("explain.view_reason")}
          </button>
        </form>
      </div>

      {/* AI Explain Drawer (T2 P3) */}
      {explainSymbol && (
        <ExplainDrawer
          strategyType={strategyType}
          symbol={explainSymbol}
          tradeDate={detail.recommendations.tradeDate}
          onClose={() => setExplainSymbol(null)}
        />
      )}

      {/* Recent closed trades */}
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

// ── Stabilization tab types ───────────────────────────────────────────────────

type ValidationRecord = {
  id: number;
  validationDate: string;
  dayRecOk: boolean; swingRecOk: boolean; longRecOk: boolean;
  strategyOk: boolean; snapshotOk: boolean; tradeResultOk: boolean;
  backtestOk: boolean; learningOk: boolean; healthOk: boolean;
  allPass: boolean; failCount: number; incidentReport: string | null;
  dayFilledTotal: number | null; swingClosedTotal: number | null; longClosedTotal: number | null;
  dayWinRate: number | null; swingWinRate: number | null; longWinRate: number | null;
  dayGrade: string | null; swingGrade: string | null; longGrade: string | null;
  phase7Ready: boolean;
};

type Phase7Cond = { key: string; met: boolean; current: string; target: string };

type ValidationData = {
  records: ValidationRecord[];
  latest: ValidationRecord | null;
  phase7: { ready: boolean; conditions: Phase7Cond[] };
  stats: { totalRuns: number; passRuns: number; passRate: number | null; incidentRuns: number; consecutiveHealthDays: number };
};

const PHASE7_LABEL_MAP: Record<string, MessageKey> = {
  day100:   "strategy.phase7.day100",
  swing30:  "strategy.phase7.swing30",
  long20:   "strategy.phase7.long20",
  dayB:     "strategy.phase7.gradeB",
  swingC:   "strategy.phase7.swingC",
  longC:    "strategy.phase7.longC",
  health30: "strategy.phase7.health30",
};

const CHECK_FIELDS = [
  { field: "dayRecOk",      label: "strategy.validation.check.dayRec"   as MessageKey },
  { field: "swingRecOk",    label: "strategy.validation.check.swingRec" as MessageKey },
  { field: "longRecOk",     label: "strategy.validation.check.longRec"  as MessageKey },
  { field: "strategyOk",    label: "strategy.validation.check.strategy" as MessageKey },
  { field: "snapshotOk",    label: "strategy.validation.check.snapshot" as MessageKey },
  { field: "tradeResultOk", label: "strategy.validation.check.trade"    as MessageKey },
  { field: "backtestOk",    label: "strategy.validation.check.backtest" as MessageKey },
  { field: "learningOk",    label: "strategy.validation.check.learning" as MessageKey },
  { field: "healthOk",      label: "strategy.validation.check.health"   as MessageKey },
] as const;

// ── Stabilization tab component ───────────────────────────────────────────────

function StabilizationTab({ t }: { t: (k: MessageKey) => string }) {
  const [data, setData]       = useState<ValidationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch("/api/strategy/validation")
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((d: ValidationData) => { setData(d); setLoading(false); })
      .catch((e) => { setError(String(e)); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => <div key={i} className="h-28 bg-slate-800/30 rounded-xl animate-pulse" />)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-700/40 rounded-xl p-6 text-red-400 text-sm">
        Error: {error}
      </div>
    );
  }

  const records = data?.records ?? [];
  const latest  = data?.latest ?? null;
  const phase7  = data?.phase7 ?? { ready: false, conditions: [] };
  const stats   = data?.stats  ?? { totalRuns: 0, passRuns: 0, passRate: null, incidentRuns: 0, consecutiveHealthDays: 0 };

  return (
    <div className="space-y-5">
      {/* Stabilization header banner */}
      <div className="flex items-center justify-between bg-violet-900/20 border border-violet-700/40 rounded-xl px-5 py-4">
        <div>
          <div className="text-sm font-semibold text-violet-300">{t("strategy.stabilization.title")}</div>
          <div className="text-xs text-violet-400/70 mt-0.5">{t("strategy.stabilization.period")}</div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-[10px] font-semibold text-violet-400 bg-violet-900/40 border border-violet-700/50 px-2.5 py-1 rounded">
            {t("strategy.stabilization.frozen")}
          </span>
          <span className="text-[10px] text-slate-500">
            {t("strategy.validation.passRate")}{": "}
            {stats.passRate != null ? `${(stats.passRate * 100).toFixed(0)}%` : "—"}
            {` (${stats.passRuns}/${stats.totalRuns})`}
          </span>
        </div>
      </div>

      {/* Phase 7 readiness */}
      <div className="bg-slate-800/30 rounded-xl border border-slate-700/40 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-700/40 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-300">{t("strategy.phase7.title")}</h3>
          {phase7.ready ? (
            <span className="text-xs font-bold text-emerald-300 bg-emerald-900/40 border border-emerald-700/50 px-2.5 py-1 rounded">
              🚀 {t("strategy.phase7.ready")}
            </span>
          ) : (
            <span className="text-xs text-slate-500 bg-slate-700/30 px-2.5 py-1 rounded">
              {t("strategy.phase7.not_ready")}
            </span>
          )}
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-2">
          {phase7.conditions.map((cond) => (
            <div
              key={cond.key}
              className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg border ${
                cond.met ? "bg-emerald-900/10 border-emerald-800/30" : "bg-slate-700/20 border-slate-700/30"
              }`}
            >
              <div className="flex items-center gap-2 text-xs">
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${
                  cond.met ? "bg-emerald-500/30 text-emerald-300" : "bg-slate-600/40 text-slate-400"
                }`}>
                  {cond.met ? "✓" : "○"}
                </span>
                <span className={cond.met ? "text-slate-300" : "text-slate-500"}>
                  {t(PHASE7_LABEL_MAP[cond.key] ?? "strategy.phase7.conditions")}
                </span>
              </div>
              <span className={`text-[10px] tabular-nums flex-shrink-0 font-mono ${cond.met ? "text-emerald-400" : "text-slate-500"}`}>
                {cond.current}/{cond.target}
              </span>
            </div>
          ))}
          {phase7.conditions.length === 0 && (
            <p className="col-span-2 text-center text-slate-500 text-xs py-2">
              {t("strategy.validation.noData")}
            </p>
          )}
        </div>
      </div>

      {/* Cumulative stats */}
      {latest && (
        <div className="bg-slate-800/30 rounded-xl border border-slate-700/40 p-4">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            {t("strategy.cumulative.title")}
          </div>
          <div className="grid grid-cols-3 gap-4 text-xs text-center">
            {[
              { label: "DAY",   filled: latest.dayFilledTotal,   winRate: latest.dayWinRate,   grade: latest.dayGrade   },
              { label: "SWING", filled: latest.swingClosedTotal, winRate: latest.swingWinRate, grade: latest.swingGrade },
              { label: "LONG",  filled: latest.longClosedTotal,  winRate: latest.longWinRate,  grade: latest.longGrade  },
            ].map(({ label, filled, winRate, grade }) => (
              <div key={label}>
                <div className="text-[10px] text-slate-500 mb-1">{label}</div>
                <div className="text-lg font-bold text-slate-200 tabular-nums">{filled ?? 0}</div>
                <div className="text-[10px] text-slate-400 mb-1">
                  {winRate != null ? `${(winRate * 100).toFixed(0)}% win` : "—"}
                </div>
                <GradeBadge grade={grade ?? null} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Daily validation history */}
      <div className="bg-slate-800/30 rounded-xl border border-slate-700/40 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-700/40 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-300">{t("strategy.validation.title")}</h3>
          <span className="text-xs text-slate-500">{records.length}{" "}days</span>
        </div>
        {records.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">{t("strategy.validation.noData")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="border-b border-slate-700/30 text-slate-500">
                  <th className="text-left px-4 py-2 whitespace-nowrap">{t("strategy.validation.date")}</th>
                  {CHECK_FIELDS.map(({ label }) => (
                    <th key={label} className="text-center px-1.5 py-2 whitespace-nowrap">{t(label)}</th>
                  ))}
                  <th className="text-center px-3 py-2">{t("strategy.validation.incident")}</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className={`border-b border-slate-700/20 hover:bg-slate-700/10 ${r.allPass ? "" : "bg-red-900/5"}`}>
                    <td className="px-4 py-2 text-slate-300 font-mono whitespace-nowrap">
                      {r.validationDate?.slice(0, 10)}
                    </td>
                    {CHECK_FIELDS.map(({ field }) => (
                      <td key={field} className="text-center px-1.5 py-2">
                        <span className={(r as any)[field] ? "text-emerald-400" : "text-red-400"}>
                          {(r as any)[field] ? "✓" : "✗"}
                        </span>
                      </td>
                    ))}
                    <td className="text-center px-3 py-2">
                      {r.incidentReport
                        ? <span className="text-red-400" title={r.incidentReport}>⚠</span>
                        : <span className="text-slate-600">—</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

// ── Reports tab ───────────────────────────────────────────────────────────────

type ReportData = {
  files:   string[];
  latest:  string | null;
  label:   string | null;
  content: string | null;
};

function ReportsTab({ t }: { t: (k: MessageKey) => string }) {
  const [weeklyLabel, setWeeklyLabel]   = useState<string | null>(null);
  const [monthlyLabel, setMonthlyLabel] = useState<string | null>(null);
  const [weeklyData, setWeeklyData]     = useState<ReportData | null>(null);
  const [monthlyData, setMonthlyData]   = useState<ReportData | null>(null);
  const [loading, setLoading]           = useState(true);

  const fetchReports = useCallback((wLabel: string | null, mLabel: string | null) => {
    setLoading(true);
    const wQ = wLabel ? `?label=${wLabel}` : "";
    const mQ = mLabel ? `?label=${mLabel}` : "";
    Promise.all([
      fetch(`/api/reports/weekly${wQ}`).then((r) => r.json()),
      fetch(`/api/reports/monthly${mQ}`).then((r) => r.json()),
    ]).then(([wd, md]: [ReportData, ReportData]) => {
      setWeeklyData(wd);
      setMonthlyData(md);
      if (!wLabel) setWeeklyLabel(wd.latest);
      if (!mLabel) setMonthlyLabel(md.latest);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { fetchReports(null, null); }, [fetchReports]);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => <div key={i} className="h-40 bg-slate-800/30 rounded-xl animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 bg-teal-900/20 border border-teal-700/40 rounded-xl px-5 py-4">
        <span className="text-teal-300 text-lg">📊</span>
        <div>
          <div className="text-sm font-semibold text-teal-300">{t("strategy.reports.title")}</div>
          <div className="text-xs text-teal-400/70 mt-0.5">T2 P1 — Reporting System</div>
        </div>
      </div>

      {/* Weekly Report */}
      <ReportSection
        title={t("strategy.reports.weekly.title")}
        data={weeklyData}
        selectedLabel={weeklyLabel}
        onSelect={(label) => {
          setWeeklyLabel(label);
          fetchReports(label, monthlyLabel);
        }}
        t={t}
        accent="teal"
      />

      {/* Monthly Report */}
      <ReportSection
        title={t("strategy.reports.monthly.title")}
        data={monthlyData}
        selectedLabel={monthlyLabel}
        onSelect={(label) => {
          setMonthlyLabel(label);
          fetchReports(weeklyLabel, label);
        }}
        t={t}
        accent="indigo"
      />
    </div>
  );
}

function ReportSection({
  title, data, selectedLabel, onSelect, t, accent,
}: {
  title: string;
  data: ReportData | null;
  selectedLabel: string | null;
  onSelect: (label: string) => void;
  t: (k: MessageKey) => string;
  accent: "teal" | "indigo";
}) {
  const accentCls = accent === "teal"
    ? { border: "border-teal-700/30", bg: "bg-teal-900/10", text: "text-teal-400", sel: "bg-teal-900/40 border-teal-600/50 text-teal-200" }
    : { border: "border-indigo-700/30", bg: "bg-indigo-900/10", text: "text-indigo-400", sel: "bg-indigo-900/40 border-indigo-600/50 text-indigo-200" };

  return (
    <div className={`border ${accentCls.border} rounded-xl overflow-hidden`}>
      <div className={`${accentCls.bg} px-4 py-3 flex items-center justify-between gap-3`}>
        <span className={`text-sm font-semibold ${accentCls.text}`}>{title}</span>
        {data && data.files.length > 0 && (
          <select
            value={selectedLabel ?? ""}
            onChange={(e) => onSelect(e.target.value)}
            className={`text-xs px-2 py-1 rounded border ${accentCls.sel} bg-transparent cursor-pointer`}
          >
            {data.files.map((f) => (
              <option key={f} value={f} className="bg-slate-900">{f}</option>
            ))}
          </select>
        )}
      </div>
      <div className="p-4">
        {!data || !data.content ? (
          <p className="text-slate-500 text-sm">{t("strategy.reports.nodata")}</p>
        ) : (
          <pre className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed font-mono max-h-[500px] overflow-y-auto">
            {data.content}
          </pre>
        )}
      </div>
    </div>
  );
}

// ── Three status cards ────────────────────────────────────────────────────────

function StatusChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-1.5 text-xs ${ok ? "text-emerald-400" : "text-slate-500"}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ok ? "bg-emerald-400" : "bg-slate-600"}`} />
      {label}
    </div>
  );
}

function SystemStatusCard({ unified, t }: { unified: OverviewData["unified"]; t: (k: MessageKey) => string }) {
  if (!unified) return null;
  const isRunning = unified.grade && ["A+", "A", "B", "C"].includes(unified.grade);
  return (
    <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-4">
      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3">
        {t("strategy.system_status.title")}
      </div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-2xl font-bold text-slate-100 tabular-nums">
            {unified.integrityScore?.toFixed(1) ?? "—"}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">{t("strategy.learning.integrity")}</div>
        </div>
        <div className="text-right">
          <GradeBadge grade={unified.grade ?? null} />
          <div className={`text-xs mt-1.5 font-medium ${isRunning ? "text-emerald-400" : "text-slate-400"}`}>
            {isRunning ? t("strategy.system_status.running") : t("strategy.system_status.init")}
          </div>
        </div>
      </div>
      {unified.reportDate && (
        <div className="text-[10px] text-slate-500">
          {t("strategy.learning.grade")} {new Date(unified.reportDate).toISOString().slice(0, 10)}
        </div>
      )}
    </div>
  );
}

function TodayExecutionCard({ exec, t }: { exec: TodayExecution | null | undefined; t: (k: MessageKey) => string }) {
  const checks = exec ? [
    { ok: exec.dayRecOk,          label: t("strategy.today_exec.rec_day")     },
    { ok: exec.swingRecOk,        label: t("strategy.today_exec.rec_swing")   },
    { ok: exec.longRecOk,         label: t("strategy.today_exec.rec_long")    },
    { ok: exec.backtestOk,        label: t("strategy.today_exec.backtest")    },
    { ok: exec.learningOk,        label: t("strategy.today_exec.learning")    },
    { ok: exec.healthOk,          label: t("strategy.today_exec.validation")  },
    { ok: exec.dayTradeResultOk,  label: t("strategy.today_exec.day_settled") },
  ] : [];
  const passCount = checks.filter((c) => c.ok).length;
  const totalCount = checks.length;
  return (
    <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
          {t("strategy.today_exec.title")}
        </div>
        {exec && (
          <span className={`text-xs font-semibold tabular-nums ${
            passCount === totalCount ? "text-emerald-400" : passCount >= totalCount - 2 ? "text-yellow-400" : "text-slate-500"
          }`}>
            {passCount}/{totalCount}
          </span>
        )}
      </div>
      {!exec ? (
        <div className="text-slate-600 text-xs">{t("strategy.collecting")}</div>
      ) : (
        <div className="grid grid-cols-2 gap-y-2 gap-x-3">
          {checks.map((c) => <StatusChip key={c.label} ok={c.ok} label={c.label} />)}
        </div>
      )}
      {exec?.validDate && (
        <div className="text-[10px] text-slate-600 mt-3">{exec.validDate}</div>
      )}
    </div>
  );
}

function StabilizationStatusCard({ val, t }: { val: RecentValidationSummary | null | undefined; t: (k: MessageKey) => string }) {
  return (
    <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-4">
      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3">
        {t("strategy.stab_card.title")}
      </div>
      {!val ? (
        <div className="text-slate-600 text-xs">{t("strategy.collecting")}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <div className="text-xl font-bold text-slate-100 tabular-nums">{val.stableDays}</div>
              <div className="text-[10px] text-slate-500">{t("strategy.stab_card.days")}</div>
            </div>
            <div>
              <div className="text-xl font-bold text-slate-100 tabular-nums">{val.healthDays}/{val.totalDays}</div>
              <div className="text-[10px] text-slate-500">{t("strategy.stab_card.health_days")}</div>
            </div>
          </div>
          <div className="border-t border-slate-700/40 pt-2 mt-2">
            <div className={`text-xs font-medium ${val.phase7Ready ? "text-violet-400" : "text-slate-500"}`}>
              {val.phase7Ready ? t("strategy.stab_card.phase7_ready") : t("strategy.stab_card.phase7")}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

type ActiveTab = StratType | "STABILIZATION" | "REPORTS";

// ── Premium dark primitives (P3-T15 · Bloomberg × Aladdin) ────────────────────
const SM = {
  bg: "#111315", card: "#171A1F", cardHi: "#1C2028", border: "#262B33",
  ink: "#E6E8EB", sub: "#9BA1A9", faint: "#6B7280",
  green: "#34C759", amber: "#FF9F0A", red: "#FF453A", blue: "#0A84FF",
};
const STRAT_HEX: Record<StratType, string> = { DAY_TRADE: "#FF9F0A", SWING_TRADE: "#0A84FF", LONG_TRADE: "#34C759" };
const SFONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', Inter, system-ui, sans-serif";
const gradeVerdict = (g: string | null): string => g === "A" ? "强势" : g === "B" ? "稳健" : g === "C" ? "观察" : g === "D" ? "等待" : "—";
const retHex = (v: number | null | undefined) => v == null ? SM.faint : v > 0 ? SM.green : v < 0 ? SM.red : SM.sub;

function SRing({ score, size = 62, stroke = 5, color }: { score: number | null; size?: number; stroke?: number; color: string }) {
  const s = score != null && Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : null;
  const r = (size - stroke) / 2, circ = 2 * Math.PI * r, pct = s ?? 0;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#23272E" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)} style={{ transition: "stroke-dashoffset .7s cubic-bezier(.22,1,.36,1)" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: size * 0.34, fontWeight: 700, color: SM.ink, fontVariantNumeric: "tabular-nums" }}>{s ?? "—"}</span>
      </div>
    </div>
  );
}
function SBadge({ label, color }: { label: string; color: string }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color, background: `${color}1f`, padding: "3px 9px", borderRadius: 999 }}><span style={{ width: 6, height: 6, borderRadius: 999, background: color }} />{label}</span>;
}
function MissionCard({ label, code, value, unit, sub, color, pct }: { label: string; code: string; value: string; unit?: string; sub?: string; color: string; pct?: number }) {
  return (
    <div style={{ background: SM.card, border: `1px solid ${SM.border}`, borderRadius: 16, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: SM.ink }}>{label}</span>
        <span style={{ fontSize: 10, color: SM.faint, textTransform: "uppercase", letterSpacing: "0.08em" }}>{code}</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginTop: 12 }}>
        <span style={{ fontSize: 30, fontWeight: 700, color, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em", lineHeight: 1 }}>{value}</span>
        {unit && <span style={{ fontSize: 12, color: SM.faint, fontWeight: 600 }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontSize: 11, color: SM.sub, marginTop: 5 }}>{sub}</div>}
      {pct != null && <div style={{ marginTop: 10, height: 5, borderRadius: 999, background: "#0d0f12", overflow: "hidden" }}><div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: "100%", background: color, transition: "width .4s ease" }} /></div>}
    </div>
  );
}

function StratPremiumCard({ type, data, active, onClick, label }: { type: StratType; data: OverviewStrategy; active: boolean; onClick: () => void; label: string }) {
  const c = STRAT_HEX[type];
  const lrn = data.learning;
  const snap = data.latestSnapshot;
  const ret = snap?.cumulativeReturnPct ?? null;
  const win = snap?.winRate ?? lrn?.winRate ?? null;
  const ringScore = lrn?.integrityScore ?? lrn?.confidenceScore ?? null;
  return (
    <button onClick={onClick} style={{ textAlign: "left", background: SM.card, border: `1px solid ${active ? c : SM.border}`, boxShadow: active ? `0 0 0 1px ${c}, 0 8px 30px -16px ${c}88` : "none", borderRadius: 18, padding: 18, cursor: "pointer", transition: "border-color .2s, box-shadow .2s" }}>
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

export default function StrategyPage() {
  const { t } = useI18n();
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>("DAY_TRADE");

  useEffect(() => {
    fetch("/api/strategy/overview")
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((d: OverviewData) => { setOverview(d); setOverviewLoading(false); })
      .catch(() => setOverviewLoading(false));
  }, []);

  const unified = overview?.unified;

  const execOk = overview?.todayExecution
    ? [overview.todayExecution.dayRecOk, overview.todayExecution.swingRecOk, overview.todayExecution.longRecOk, overview.todayExecution.backtestOk, overview.todayExecution.learningOk, overview.todayExecution.healthOk].filter(Boolean).length
    : null;
  const val = overview?.recentValidation;
  const tabDefs: { key: ActiveTab; label: string; color?: string }[] = [
    { key: "DAY_TRADE", label: stratShort("DAY_TRADE", t), color: STRAT_HEX.DAY_TRADE },
    { key: "SWING_TRADE", label: stratShort("SWING_TRADE", t), color: STRAT_HEX.SWING_TRADE },
    { key: "LONG_TRADE", label: stratShort("LONG_TRADE", t), color: STRAT_HEX.LONG_TRADE },
    { key: "STABILIZATION", label: t("strategy.stabilization.tab") },
    { key: "REPORTS", label: t("strategy.reports.tab") },
  ];
  const alloc = [{ t: "DAY_TRADE" as StratType, pct: 30 }, { t: "SWING_TRADE" as StratType, pct: 40 }, { t: "LONG_TRADE" as StratType, pct: 30 }];

  return (
    <div style={{ background: SM.bg, minHeight: "100vh", color: SM.ink, fontFamily: SFONT }}>
      <div style={{ maxWidth: 1600, margin: "0 auto", padding: "20px 24px 40px" }}>

        {/* ── Hero ── */}
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "stretch", marginBottom: 20 }}>
          <div style={{ flex: 1, minWidth: 320, background: SM.card, border: `1px solid ${SM.border}`, borderRadius: 18, padding: "18px 20px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", color: SM.faint, textTransform: "uppercase" }}>Strategy Intelligence</div>
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", marginTop: 6 }}>今日策略情报</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
              {ALL_TYPES.map((s) => {
                const g = overview?.strategies[s]?.learning?.grade ?? null;
                const c = STRAT_HEX[s];
                return <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: SM.ink, background: SM.cardHi, border: `1px solid ${SM.border}`, borderRadius: 999, padding: "5px 11px" }}><span style={{ width: 7, height: 7, borderRadius: 999, background: c }} />{stratShort(s, t)} · <span style={{ color: c }}>{gradeVerdict(g)}</span></span>;
              })}
            </div>
          </div>
          <div style={{ width: 260, minWidth: 220, background: SM.card, border: `1px solid ${SM.border}`, borderRadius: 18, padding: 18, display: "flex", alignItems: "center", gap: 16 }}>
            <SRing score={unified?.integrityScore ?? null} size={78} stroke={6} color={SM.blue} />
            <div>
              <div style={{ fontSize: 11, color: SM.faint }}>综合评分 · Integrity</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                <SBadge label={unified?.grade ?? "—"} color={unified?.grade === "A" ? SM.green : unified?.grade === "D" ? SM.red : SM.amber} />
              </div>
              <div style={{ fontSize: 11, color: SM.sub, marginTop: 8 }}>{unified?.recommendation ?? "—"}</div>
              <div style={{ fontSize: 10, color: SM.faint, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{unified?.reportDate ?? ""}</div>
            </div>
          </div>
        </div>

        {/* ── Mission Cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 24 }}>
          <MissionCard label="Overall Score" code="Integrity" value={unified?.integrityScore != null ? unified.integrityScore.toFixed(0) : "—"} unit="/100" sub={`等级 ${unified?.grade ?? "—"}`} color={SM.blue} pct={unified?.integrityScore ?? 0} />
          <MissionCard label="Execution" code="Today" value={execOk != null ? `${execOk}/6` : "—"} unit="OK" sub={overview?.todayExecution?.isToday ? "今日流水线" : "最近执行"} color={execOk === 6 ? SM.green : SM.amber} pct={execOk != null ? (execOk / 6) * 100 : 0} />
          <MissionCard label="Stability" code="Validation" value={val ? `${val.stableDays}` : "—"} unit="天" sub={val ? `健康 ${val.healthDays}/${val.totalDays}${val.phase7Ready ? " · Phase7" : ""}` : undefined} color={SM.green} />
          <MissionCard label="Learning" code="AI Grade" value={unified?.grade ?? "—"} sub={unified?.recommendation ?? "AI 学习评级"} color={unified?.grade === "A" ? SM.green : unified?.grade === "D" ? SM.red : SM.amber} />
        </div>

        {/* ── 3 Strategy Premium Cards ── */}
        <div style={{ fontSize: 11, fontWeight: 700, color: SM.faint, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12 }}>三策略 · Strategies</div>
        {overviewLoading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14, marginBottom: 24 }}>
            {[1, 2, 3].map((i) => <div key={i} style={{ height: 200, background: SM.card, border: `1px solid ${SM.border}`, borderRadius: 18 }} />)}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14, marginBottom: 20 }}>
            {ALL_TYPES.map((s) => (
              <StratPremiumCard key={s} type={s} data={overview?.strategies[s] ?? { openPositions: 0, closedTrades: 0, learning: null, bestBacktest: null, latestSnapshot: null, recommendations: null }} active={activeTab === s} onClick={() => setActiveTab(s)} label={stratLabel(s, t)} />
            ))}
          </div>
        )}

        {/* ── Fund allocation relationship (3:4:3) ── */}
        <div style={{ background: SM.card, border: `1px solid ${SM.border}`, borderRadius: 16, padding: "14px 18px", marginBottom: 26 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: SM.ink }}>资金分配 · Capital Allocation <span style={{ color: SM.faint, fontWeight: 500 }}>独立资金池 ¥100M</span></span>
            <div style={{ display: "flex", gap: 14 }}>
              {alloc.map((a) => <span key={a.t} style={{ fontSize: 11, color: SM.sub, display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: STRAT_HEX[a.t] }} />{stratShort(a.t, t)} {a.pct}%</span>)}
            </div>
          </div>
          <div style={{ display: "flex", height: 10, borderRadius: 999, overflow: "hidden", gap: 2 }}>
            {alloc.map((a) => <div key={a.t} style={{ width: `${a.pct}%`, background: STRAT_HEX[a.t] }} title={`${stratShort(a.t, t)} ${a.pct}%`} />)}
          </div>
        </div>

        {/* ── Segmented tabs ── */}
        <div style={{ display: "inline-flex", padding: 4, background: SM.card, border: `1px solid ${SM.border}`, borderRadius: 999, gap: 2, marginBottom: 18, flexWrap: "wrap" }}>
          {tabDefs.map((tb) => {
            const on = activeTab === tb.key;
            return (
              <button key={tb.key} onClick={() => setActiveTab(tb.key)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 15px", borderRadius: 999, fontSize: 13, fontWeight: 600, color: on ? SM.ink : SM.sub, background: on ? SM.cardHi : "transparent", border: "none", cursor: "pointer", transition: "background .2s, color .2s" }}>
                {tb.color && <span style={{ width: 7, height: 7, borderRadius: 999, background: tb.color }} />}{tb.label}
              </button>
            );
          })}
        </div>

        {/* ── Active tab content (unchanged logic) ── */}
        {activeTab === "STABILIZATION" ? (
          <StabilizationTab t={t} />
        ) : activeTab === "REPORTS" ? (
          <ReportsTab t={t} />
        ) : (
          <StrategyTab key={activeTab} strategyType={activeTab as StratType} overview={overview?.strategies[activeTab as StratType] ?? null} t={t} />
        )}
      </div>
    </div>
  );
}
