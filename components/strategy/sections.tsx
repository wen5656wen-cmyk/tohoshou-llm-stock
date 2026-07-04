"use client";
// Strategy 模块 · 区块组件（P4-T3）
import Link from "next/link";
import type { MessageKey } from "@/lib/i18n";
import type { LearningReport, BacktestSummary, OpenPosition, RecentTrade, OverviewData, TodayExecution, RecentValidationSummary, Recommendation, OverviewStrategy, StrategyDetail, StratType, ReportData } from "./types";
import { GradeBadge, RecBadge, StatusChip, SRing, SBadge, MissionCard } from "./primitives";
import { STRAT_COLOR, stratLabel, stratShort, returnColor, fmtPct, fmtScore, maturity, EXIT_REASON_KEYS, SM, SHADOW, STRAT_HEX, SFONT, gradeVerdict, retHex } from "./utils";

export function OverviewCard({
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
        active ? "ring-2 ring-offset-2 ring-offset-white ring-opacity-60 " + (
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
          <div className="text-[#86868B] mb-0.5">{t("strategy.capital.return")}</div>
          <div className={`font-semibold tabular-nums ${returnColor(snap?.cumulativeReturnPct ?? null)}`}>
            {fmtPct(snap?.cumulativeReturnPct ?? null)}
          </div>
        </div>
        <div>
          <div className="text-[#86868B] mb-0.5">{t("strategy.avg_alpha")}</div>
          <div className={`font-semibold tabular-nums ${returnColor(snap?.alpha ?? null)}`}>
            {fmtPct(snap?.alpha ?? null)}
          </div>
        </div>
        <div>
          <div className="text-[#86868B] mb-0.5">{t("strategy.win_rate")}</div>
          <div className="text-[#1D1D1F] font-semibold tabular-nums">
            {snap?.winRate != null ? `${(snap.winRate * 100).toFixed(0)}%` : "—"}
          </div>
        </div>
        <div>
          <div className="text-[#86868B] mb-0.5">{t("strategy.learning.integrity")}</div>
          <div className={`font-semibold tabular-nums ${lrn?.integrityScore != null ? "text-[#1D1D1F]" : "text-[#86868B]"}`}>
            {fmtScore(lrn?.integrityScore ?? null)}
          </div>
        </div>
      </div>

      {/* Closed trades — prominent display */}
      <div className="mt-2.5 mb-1">
        <div className="text-[10px] text-[#86868B] mb-0.5">{t("strategy.closed_count")}</div>
        <div className="text-sm font-semibold tabular-nums text-[#1D1D1F]">{data.closedTrades}</div>
      </div>

      <div className="mt-1 flex items-center gap-3 text-[10px] text-[#86868B]">
        <span>{t("strategy.open_count")} <span className="text-[#4B5563]">{data.openPositions}</span></span>
        <span>{t("strategy.sample_count")} <span className="text-[#4B5563]">{data.closedTrades}</span></span>
        {data.recommendations && (
          <span>Top10 <span className="text-[#4B5563]">{data.recommendations.top10Count}</span></span>
        )}
      </div>
    </button>
  );
}

// ── Learning section ──────────────────────────────────────────────────────────

export function LearningSection({ learning, t }: { learning: LearningReport | null; t: (k: MessageKey) => string }) {
  if (!learning) {
    return (
      <div className="bg-white rounded-lg border border-[#E8EAED] p-4 text-[#86868B] text-sm text-center">
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
    <div className="bg-white rounded-lg border border-[#E8EAED] p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-[#4B5563]">{t("strategy.learning.grade")}</h3>
        <div className="flex items-center gap-2">
          <GradeBadge grade={learning.grade} />
          <RecBadge rec={learning.recommendation} t={t} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        {scores.map(({ key, val }) => (
          <div key={key} className="text-center">
            <div className="text-[10px] text-[#86868B] mb-1">{key}</div>
            <div className="text-lg font-bold text-[#1D1D1F] tabular-nums">{fmtScore(val)}</div>
            <div className="h-1 bg-[#EEF0F4] rounded-full mt-1 overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${Math.min(100, val ?? 0)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3 text-xs text-[#6E6E73] border-t border-[#E8EAED] pt-3">
        <div>{t("strategy.win_rate")} <span className="text-[#1D1D1F] font-medium tabular-nums">
          {learning.winRate != null ? `${(learning.winRate * 100).toFixed(0)}%` : "—"}</span>
        </div>
        <div>{t("strategy.avg_alpha")} <span className={`font-medium tabular-nums ${returnColor(learning.alpha)}`}>
          {fmtPct(learning.alpha)}</span>
        </div>
        <div>n= <span className="text-[#1D1D1F] font-medium tabular-nums">{learning.sampleCount}</span></div>
      </div>

      {learning.summary && (
        <div className="mt-2 text-[10px] text-[#86868B] font-mono break-all">{learning.summary}</div>
      )}
    </div>
  );
}

// ── Backtest section ──────────────────────────────────────────────────────────

export function BacktestSection({ summaries, t }: { summaries: BacktestSummary[]; t: (k: MessageKey) => string }) {
  if (summaries.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-[#E8EAED] p-4 text-[#86868B] text-sm text-center">
        {t("strategy.collecting")}
      </div>
    );
  }

  // Sort horizons numerically
  const sorted = [...summaries].sort((a, b) => parseInt(a.horizon) - parseInt(b.horizon));

  return (
    <div className="bg-white rounded-lg border border-[#E8EAED] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#E8EAED]">
        <h3 className="text-sm font-semibold text-[#4B5563]">{t("strategy.backtest.section")}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#EEF0F4] text-[#86868B]">
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
                <tr key={row.horizon} className="border-b border-[#EEF0F4] hover:bg-[#F4F5F7]">
                  <td className="px-4 py-2.5 font-medium text-[#4B5563]">{row.horizon}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${row.winRate != null ? returnColor((row.winRate - 0.5) * 100) : "text-[#86868B]"}`}>
                    {row.winRate != null ? `${(row.winRate * 100).toFixed(0)}%` : "—"}
                  </td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${returnColor(row.avgReturnPct)}`}>
                    {fmtPct(row.avgReturnPct)}
                  </td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${returnColor(row.alpha)}`}>
                    {fmtPct(row.alpha)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[#6E6E73]">
                    {row.maxDrawdown != null ? `${row.maxDrawdown.toFixed(1)}%` : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[#4B5563]">{row.filledCount}</td>
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

export function PositionsSection({ positions, t }: { positions: OpenPosition[]; t: (k: MessageKey) => string }) {
  return (
    <div className="bg-white rounded-lg border border-[#E8EAED] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#E8EAED] flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#4B5563]">{t("strategy.position.open_title")}</h3>
        <span className="text-xs text-[#86868B]">{positions.length}</span>
      </div>
      {positions.length === 0 ? (
        <div className="p-6 text-center text-[#86868B] text-sm">{t("strategy.position.none")}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#EEF0F4] text-[#86868B]">
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
                <tr key={p.id} className="border-b border-[#EEF0F4] hover:bg-[#F4F5F7]">
                  <td className="px-4 py-2.5">
                    <Link href={`/stocks/${encodeURIComponent(p.symbol)}`} className="text-blue-400 hover:text-blue-300 font-medium">
                      {p.symbol}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[#4B5563]">
                    {p.entryPrice != null ? `¥${Math.round(p.entryPrice).toLocaleString("ja-JP")}` : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[#4B5563]">
                    {p.currentPrice != null ? `¥${Math.round(p.currentPrice).toLocaleString("ja-JP")}` : "—"}
                  </td>
                  <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${returnColor(p.returnPct)}`}>
                    {fmtPct(p.returnPct)}
                  </td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${returnColor(p.alpha)}`}>
                    {fmtPct(p.alpha)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[#6E6E73]">
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

export function TradesSection({ trades, t }: { trades: RecentTrade[]; t: (k: MessageKey) => string }) {
  return (
    <div className="bg-white rounded-lg border border-[#E8EAED] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#E8EAED] flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#4B5563]">{t("strategy.trade.recent")}</h3>
        <span className="text-xs text-[#86868B]">{trades.length}</span>
      </div>
      {trades.length === 0 ? (
        <div className="p-6 text-center text-[#86868B] text-sm">{t("strategy.trade.none")}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#EEF0F4] text-[#86868B]">
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
                <tr key={tr.id} className="border-b border-[#EEF0F4] hover:bg-[#F4F5F7]">
                  <td className="px-4 py-2.5 tabular-nums text-[#6E6E73]">
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
                  <td className="px-3 py-2.5 text-right tabular-nums text-[#4B5563]">
                    {tr.entryPrice != null ? `¥${Math.round(tr.entryPrice).toLocaleString("ja-JP")}` : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[#4B5563]">
                    {tr.exitPrice != null ? `¥${Math.round(tr.exitPrice).toLocaleString("ja-JP")}` : "—"}
                  </td>
                  <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${returnColor(tr.returnPct)}`}>
                    {fmtPct(tr.returnPct)}
                  </td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${returnColor(tr.alpha)}`}>
                    {fmtPct(tr.alpha)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[#6E6E73]">
                    {tr.holdingDays != null ? `${tr.holdingDays}${t("strategy.days_unit")}` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[#6E6E73]">
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

export function RecommendationSection({
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
    <div className="bg-white rounded-lg border border-[#E8EAED] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#E8EAED] flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#4B5563]">{t("strategy.rec.title")}</h3>
        <div className="flex items-center gap-3 text-[10px] text-[#86868B]">
          {recs.tradeDate && <span>{recs.tradeDate.slice(0, 10)}</span>}
          <span>{t("strategy.rec.top100")} <span className="text-[#4B5563]">{recs.top100Count}</span></span>
        </div>
      </div>
      {recs.top10.length === 0 ? (
        <div className="p-6 text-center text-[#86868B] text-sm">{t("strategy.collecting")}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#EEF0F4] text-[#86868B]">
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
                <tr key={rec.symbol} className="border-b border-[#EEF0F4] hover:bg-[#F4F5F7]">
                  <td className="px-4 py-2.5 text-[#86868B] tabular-nums">{rec.rank}</td>
                  <td className="px-3 py-2.5">
                    <Link href={`/stocks/${encodeURIComponent(rec.symbol)}`} className="text-blue-400 hover:text-blue-300 font-semibold">
                      {rec.symbol}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[#1D1D1F]">
                    {rec.aiScore != null ? rec.aiScore.toFixed(1) : "—"}
                  </td>
                  {extraCols.map((c) => (
                    <td key={c.label} className="px-3 py-2.5 text-right tabular-nums text-[#4B5563]">
                      {c.val(rec) != null ? (c.val(rec) as number).toFixed(1) : "—"}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-right">
                    <button
                      onClick={() => onExplain(rec.symbol)}
                      className="text-[11px] px-2 py-1 rounded-md bg-[#EEF0F4] hover:bg-[#E8EAED] text-[#1D1D1F] border border-[#E8EAED] transition-colors"
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

export function CapitalSection({
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
    <div className="bg-white rounded-lg border border-[#E8EAED] p-4">
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 text-xs">
        <div>
          <div className="text-[#86868B] mb-1">{t("strategy.capital.cash")}</div>
          <div className="text-[#1D1D1F] font-semibold tabular-nums">
            {cash != null ? `¥${Math.round(cash).toLocaleString("ja-JP")}` : "—"}
          </div>
        </div>
        <div>
          <div className="text-[#86868B] mb-1">{t("strategy.capital.invested")}</div>
          <div className="text-[#1D1D1F] font-semibold tabular-nums">
            {invested != null ? `¥${Math.round(invested).toLocaleString("ja-JP")}` : "—"}
          </div>
        </div>
        <div>
          <div className="text-[#86868B] mb-1">{t("strategy.capital.total")}</div>
          <div className="text-[#1D1D1F] font-semibold tabular-nums">
            {total != null ? `¥${Math.round(total).toLocaleString("ja-JP")}` : "—"}
          </div>
        </div>
        <div>
          <div className="text-[#86868B] mb-1">{t("strategy.capital.return")}</div>
          <div className={`font-semibold tabular-nums ${returnColor(cumReturn)}`}>
            {fmtPct(cumReturn)}
          </div>
        </div>
        <div>
          <div className="text-[#86868B] mb-1">{t("strategy.avg_alpha")}</div>
          <div className={`font-semibold tabular-nums ${returnColor(alpha)}`}>
            {fmtPct(alpha)}
          </div>
        </div>
        <div>
          <div className="text-[#86868B] mb-1">{t("strategy.win_rate")}</div>
          <div className="text-[#1D1D1F] font-semibold tabular-nums">
            {winRate != null ? `${(winRate * 100).toFixed(0)}%` : "—"}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Strategy detail tab ───────────────────────────────────────────────────────

// ── AI Explain Drawer (T2 P3) ───────────────────────────────────────────────


export function ReportSection({
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
              <option key={f} value={f} className="bg-white">{f}</option>
            ))}
          </select>
        )}
      </div>
      <div className="p-4">
        {!data || !data.content ? (
          <p className="text-[#86868B] text-sm">{t("strategy.reports.nodata")}</p>
        ) : (
          <pre className="text-xs text-[#4B5563] whitespace-pre-wrap leading-relaxed font-mono max-h-[500px] overflow-y-auto">
            {data.content}
          </pre>
        )}
      </div>
    </div>
  );
}

// ── Three status cards ────────────────────────────────────────────────────────


export function SystemStatusCard({ unified, t }: { unified: OverviewData["unified"]; t: (k: MessageKey) => string }) {
  if (!unified) return null;
  const isRunning = unified.grade && ["A+", "A", "B", "C"].includes(unified.grade);
  return (
    <div className="bg-white border border-[#E8EAED] rounded-xl p-4">
      <div className="text-[10px] font-semibold text-[#86868B] uppercase tracking-wider mb-3">
        {t("strategy.system_status.title")}
      </div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-2xl font-bold text-[#1D1D1F] tabular-nums">
            {unified.integrityScore?.toFixed(1) ?? "—"}
          </div>
          <div className="text-[10px] text-[#86868B] mt-0.5">{t("strategy.learning.integrity")}</div>
        </div>
        <div className="text-right">
          <GradeBadge grade={unified.grade ?? null} />
          <div className={`text-xs mt-1.5 font-medium ${isRunning ? "text-emerald-400" : "text-[#6E6E73]"}`}>
            {isRunning ? t("strategy.system_status.running") : t("strategy.system_status.init")}
          </div>
        </div>
      </div>
      {unified.reportDate && (
        <div className="text-[10px] text-[#86868B]">
          {t("strategy.learning.grade")} {new Date(unified.reportDate).toISOString().slice(0, 10)}
        </div>
      )}
    </div>
  );
}

export function TodayExecutionCard({ exec, t }: { exec: TodayExecution | null | undefined; t: (k: MessageKey) => string }) {
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
    <div className="bg-white border border-[#E8EAED] rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] font-semibold text-[#86868B] uppercase tracking-wider">
          {t("strategy.today_exec.title")}
        </div>
        {exec && (
          <span className={`text-xs font-semibold tabular-nums ${
            passCount === totalCount ? "text-emerald-400" : passCount >= totalCount - 2 ? "text-yellow-400" : "text-[#86868B]"
          }`}>
            {passCount}/{totalCount}
          </span>
        )}
      </div>
      {!exec ? (
        <div className="text-[#A1A1A6] text-xs">{t("strategy.collecting")}</div>
      ) : (
        <div className="grid grid-cols-2 gap-y-2 gap-x-3">
          {checks.map((c) => <StatusChip key={c.label} ok={c.ok} label={c.label} />)}
        </div>
      )}
      {exec?.validDate && (
        <div className="text-[10px] text-[#A1A1A6] mt-3">{exec.validDate}</div>
      )}
    </div>
  );
}

export function StabilizationStatusCard({ val, t }: { val: RecentValidationSummary | null | undefined; t: (k: MessageKey) => string }) {
  return (
    <div className="bg-white border border-[#E8EAED] rounded-xl p-4">
      <div className="text-[10px] font-semibold text-[#86868B] uppercase tracking-wider mb-3">
        {t("strategy.stab_card.title")}
      </div>
      {!val ? (
        <div className="text-[#A1A1A6] text-xs">{t("strategy.collecting")}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <div className="text-xl font-bold text-[#1D1D1F] tabular-nums">{val.stableDays}</div>
              <div className="text-[10px] text-[#86868B]">{t("strategy.stab_card.days")}</div>
            </div>
            <div>
              <div className="text-xl font-bold text-[#1D1D1F] tabular-nums">{val.healthDays}/{val.totalDays}</div>
              <div className="text-[10px] text-[#86868B]">{t("strategy.stab_card.health_days")}</div>
            </div>
          </div>
          <div className="border-t border-[#E8EAED] pt-2 mt-2">
            <div className={`text-xs font-medium ${val.phase7Ready ? "text-violet-400" : "text-[#86868B]"}`}>
              {val.phase7Ready ? t("strategy.stab_card.phase7_ready") : t("strategy.stab_card.phase7")}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

