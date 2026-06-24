"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n";
import type { PortfolioSummary } from "@/app/api/portfolio/summary/route";
import type { TrendData } from "@/app/api/portfolio/trend/route";
import type { HistoryData, HistoryCohort } from "@/app/api/portfolio/history/route";

// ── Chart constants ────────────────────────────────────────────────────────────

const M = { top: 28, right: 20, bottom: 34, left: 54 };
const VW = 800;
const VH = 280;
const CW = VW - M.left - M.right;
const CH = VH - M.top - M.bottom;

type WindowKey = "7D" | "30D" | "90D" | "ALL";

// ── Helpers ────────────────────────────────────────────────────────────────────

function returnColor(v: number | null): string {
  if (v == null) return "text-slate-400";
  return v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-slate-400";
}

function fmtReturn(v: number | null): string {
  if (v == null) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function fmtJPY(v: number): string {
  return v.toLocaleString("ja-JP") + " JPY";
}

function fmtPct(v: number | null, dec = 2): string {
  if (v == null) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(dec)}%`;
}

// ── Rating badge ───────────────────────────────────────────────────────────────

function RatingBadge({ rating }: { rating: string | null }) {
  if (!rating) return <span className="text-slate-500 text-xs">—</span>;
  const cls =
    rating === "STRONG_BUY"
      ? "bg-emerald-900/60 text-emerald-400"
      : rating === "BUY"
      ? "bg-blue-900/60 text-blue-400"
      : "bg-slate-700 text-slate-400";
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${cls}`}>{rating}</span>
  );
}

// ── Suggestion badge ───────────────────────────────────────────────────────────

function SuggestionBadge({ suggestion, t }: { suggestion: string; t: (k: MessageKey) => string }) {
  const map: Record<string, { cls: string; labelKey: MessageKey }> = {
    ADD:    { cls: "bg-emerald-900/60 text-emerald-400", labelKey: "portfolio.suggest_add" },
    HOLD:   { cls: "bg-blue-900/60 text-blue-400",       labelKey: "portfolio.suggest_hold" },
    REDUCE: { cls: "bg-yellow-900/60 text-yellow-400",   labelKey: "portfolio.suggest_reduce" },
    SELL:   { cls: "bg-red-900/60 text-red-400",         labelKey: "portfolio.suggest_sell" },
  };
  const cfg = map[suggestion] ?? map["HOLD"];
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${cfg.cls}`}>{t(cfg.labelKey)}</span>
  );
}

// ── SVG Trend Chart ────────────────────────────────────────────────────────────

const PORTFOLIO_SERIES = [
  { key: "portfolioReturn" as const, color: "#60a5fa", dashed: false },
  { key: "topixReturn"     as const, color: "#fb7185", dashed: true  },
  { key: "alpha"           as const, color: "#34d399", dashed: false },
] as const;

function filterByWindow(points: TrendData["points"], window: WindowKey) {
  if (window === "ALL" || points.length === 0) return points;
  const days = window === "7D" ? 7 : window === "30D" ? 30 : 90;
  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return points.filter((p) => p.date >= cutoffStr);
}

function TrendChart({
  data,
  loading,
  window: win,
  t,
}: {
  data: TrendData | null;
  loading: boolean;
  window: WindowKey;
  t: (k: MessageKey) => string;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const rawPoints = data?.points ?? [];
  const series = filterByWindow(rawPoints, win);
  const N = series.length;

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!svgRef.current || N < 2) return;
      const rect = svgRef.current.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      const chartXPct = (pct * VW - M.left) / CW;
      const idx = Math.max(0, Math.min(N - 1, Math.round(chartXPct * (N - 1))));
      setHoverIdx(idx);
    },
    [N],
  );
  const handleMouseLeave = useCallback(() => setHoverIdx(null), []);

  if (loading) return <div className="h-52 animate-pulse bg-slate-800/30 rounded-lg" />;

  if (N < 2) {
    return (
      <div className="h-52 flex items-center justify-center">
        <span className="text-slate-500 text-sm">{t("portfolio.no_data")}</span>
      </div>
    );
  }

  const allVals: number[] = [];
  for (const pt of series) {
    for (const s of PORTFOLIO_SERIES) {
      const v = pt[s.key];
      if (v != null) allVals.push(v);
    }
  }
  const rawMin = Math.min(0, ...allVals);
  const rawMax = Math.max(0, ...allVals);
  const pad = Math.max(0.5, (rawMax - rawMin) * 0.12);
  const minY = rawMin - pad;
  const maxY = rawMax + pad;
  const rangeY = maxY - minY || 1;

  const xPos = (i: number) => M.left + (i / Math.max(N - 1, 1)) * CW;
  const yPos = (v: number) => M.top + CH * (1 - (v - minY) / rangeY);
  const zeroY = yPos(0);

  const yTicks = Array.from({ length: 5 }, (_, i) => minY + (i / 4) * rangeY);
  const xStep = Math.max(1, Math.ceil(N / 6));
  const xLabels = series
    .map((pt, i) => ({ i, label: pt.date.slice(5) }))
    .filter((_, i) => i === 0 || i % xStep === 0 || i === N - 1);

  const hovered = hoverIdx != null ? series[hoverIdx] : null;

  return (
    <div>
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs mb-2">
        {PORTFOLIO_SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            {s.dashed ? (
              <svg width="20" height="8" className="inline-block">
                <line x1="0" y1="4" x2="20" y2="4" stroke={s.color} strokeWidth="1.5" strokeDasharray="4 2" />
              </svg>
            ) : (
              <span className="w-5 h-0.5 inline-block rounded-full" style={{ background: s.color }} />
            )}
            <span className="text-slate-400">
              {s.key === "portfolioReturn"
                ? t("portfolio.trend_ai")
                : s.key === "topixReturn"
                ? "TOPIX ETF"
                : "Alpha"}
            </span>
          </span>
        ))}
      </div>

      {/* Hover tooltip */}
      {hovered && (
        <div className="flex gap-4 text-xs mb-1 text-slate-400">
          <span className="font-mono">{hovered.date}</span>
          <span className={returnColor(hovered.portfolioReturn)}>
            {t("portfolio.trend_ai")}: {fmtReturn(hovered.portfolioReturn)}
          </span>
          {hovered.topixReturn != null && (
            <span className={returnColor(hovered.topixReturn)}>
              TOPIX ETF: {fmtReturn(hovered.topixReturn)}
            </span>
          )}
          {hovered.alpha != null && (
            <span className={returnColor(hovered.alpha)}>
              Alpha: {fmtReturn(hovered.alpha)}
            </span>
          )}
        </div>
      )}

      {/* SVG */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VW} ${VH}`}
        className="w-full"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={M.left} y1={yPos(v)} x2={VW - M.right} y2={yPos(v)} stroke="#1e293b" strokeWidth="0.5" />
            <text x={M.left - 5} y={yPos(v)} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="#64748b">
              {v.toFixed(1)}%
            </text>
          </g>
        ))}

        <line x1={M.left} y1={zeroY} x2={VW - M.right} y2={zeroY} stroke="#475569" strokeWidth="1" strokeDasharray="4 3" />

        {xLabels.map(({ i, label }) => (
          <text key={i} x={xPos(i)} y={VH - 4} textAnchor="middle" fontSize="9" fill="#64748b">
            {label}
          </text>
        ))}

        {PORTFOLIO_SERIES.map(({ key, color, dashed }) => {
          const pts = series
            .map((pt, i) => {
              const v = pt[key];
              if (v == null) return null;
              return `${xPos(i).toFixed(1)},${yPos(v).toFixed(1)}`;
            })
            .filter(Boolean);
          if (pts.length < 2) return null;
          return (
            <polyline
              key={key}
              points={pts.join(" ")}
              fill="none"
              stroke={color}
              strokeWidth={key === "alpha" ? "1" : "1.5"}
              strokeDasharray={dashed ? "5 3" : undefined}
              strokeOpacity={0.9}
            />
          );
        })}

        {/* Hover vertical line */}
        {hoverIdx != null && (
          <line
            x1={xPos(hoverIdx)}
            y1={M.top}
            x2={xPos(hoverIdx)}
            y2={VH - M.bottom}
            stroke="#475569"
            strokeWidth="1"
            strokeDasharray="3 2"
          />
        )}
      </svg>
    </div>
  );
}

// ── Summary Cards ──────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  valueClass = "text-white",
  sub,
}: {
  label: string;
  value: string;
  valueClass?: string;
  sub?: string;
}) {
  return (
    <div className="bg-[#1a2035] rounded-xl p-4 border border-slate-700/40">
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${valueClass}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Loading skeleton ───────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-slate-800/50 rounded-xl h-20" />
        ))}
      </div>
      <div className="bg-slate-800/50 rounded-xl h-64" />
      <div className="bg-slate-800/50 rounded-xl h-48" />
    </div>
  );
}

// ── History table ──────────────────────────────────────────────────────────────

function HistoryTable({ cohorts, t }: { cohorts: HistoryCohort[]; t: (k: MessageKey) => string }) {
  if (cohorts.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-slate-700/50 text-xs text-slate-400">
            <th className="text-left py-2 px-3">{t("table.date")}</th>
            <th className="text-right py-2 px-3">{t("backtest.col_count")}</th>
            <th className="text-right py-2 px-3">{t("portfolio.history_col_return7d")}</th>
            <th className="text-right py-2 px-3">{t("portfolio.history_col_winrate")}</th>
            <th className="text-right py-2 px-3">{t("portfolio.history_col_topix")}</th>
            <th className="text-right py-2 px-3">{t("portfolio.history_col_alpha")}</th>
          </tr>
        </thead>
        <tbody>
          {cohorts.map((row) => (
            <tr key={row.date} className="border-b border-slate-700/20 hover:bg-slate-800/30 transition-colors">
              <td className="py-2 px-3 font-mono text-xs text-slate-300">{row.date}</td>
              <td className="py-2 px-3 text-right text-slate-400">{row.count}</td>
              <td className={`py-2 px-3 text-right tabular-nums text-xs ${returnColor(row.avgReturn7d)}`}>
                {fmtReturn(row.avgReturn7d)}
              </td>
              <td className="py-2 px-3 text-right text-slate-400 text-xs">
                {row.winRate7d != null ? `${row.winRate7d.toFixed(1)}%` : "—"}
              </td>
              <td className={`py-2 px-3 text-right tabular-nums text-xs ${returnColor(row.topixReturn7d)}`}>
                {fmtReturn(row.topixReturn7d)}
              </td>
              <td className={`py-2 px-3 text-right tabular-nums text-xs font-medium ${returnColor(row.alpha7d)}`}>
                {fmtReturn(row.alpha7d)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const { t } = useI18n();

  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [trend, setTrend] = useState<TrendData | null>(null);
  const [history, setHistory] = useState<HistoryData | null>(null);

  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingTrend, setLoadingTrend] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const [errorSummary, setErrorSummary] = useState(false);
  const [trendWindow, setTrendWindow] = useState<WindowKey>("ALL");

  const fetchAll = useCallback(async () => {
    setLoadingSummary(true);
    setLoadingTrend(true);
    setLoadingHistory(true);
    setErrorSummary(false);

    // Summary
    fetch("/api/portfolio/summary")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d: PortfolioSummary) => { setSummary(d); setLoadingSummary(false); })
      .catch(() => { setErrorSummary(true); setLoadingSummary(false); });

    // Trend
    fetch("/api/portfolio/trend")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d: TrendData) => { setTrend(d); setLoadingTrend(false); })
      .catch(() => setLoadingTrend(false));

    // History
    fetch("/api/portfolio/history")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d: HistoryData) => { setHistory(d); setLoadingHistory(false); })
      .catch(() => setLoadingHistory(false));
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Merge maxDrawdown from trend into summary cards
  const maxDrawdown = trend?.maxDrawdown ?? null;

  // Loading state
  if (loadingSummary && !errorSummary) {
    return (
      <div className="p-4 md:p-6 max-w-6xl bg-[#0f172a] min-h-screen">
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-white">{t("portfolio.ai_title")}</h1>
          <p className="text-sm text-slate-400 mt-1">{t("portfolio.ai_subtitle")}</p>
        </div>
        <Skeleton />
      </div>
    );
  }

  // Error state
  if (errorSummary && !summary) {
    return (
      <div className="p-4 md:p-6 max-w-6xl bg-[#0f172a] min-h-screen">
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-white">{t("portfolio.ai_title")}</h1>
        </div>
        <div className="bg-[#1a2035] rounded-xl p-12 text-center border border-slate-700/40">
          <div className="text-slate-400 mb-4">{t("portfolio.loading_error")}</div>
          <button
            onClick={fetchAll}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
          >
            {t("portfolio.retry")}
          </button>
        </div>
      </div>
    );
  }

  // No data
  if (!summary) {
    return (
      <div className="p-4 md:p-6 max-w-6xl bg-[#0f172a] min-h-screen">
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-white">{t("portfolio.ai_title")}</h1>
        </div>
        <div className="bg-[#1a2035] rounded-xl p-12 text-center border border-slate-700/40">
          <div className="text-slate-400">{t("portfolio.no_data")}</div>
        </div>
      </div>
    );
  }

  const windows: WindowKey[] = ["7D", "30D", "90D", "ALL"];

  return (
    <div className="p-4 md:p-6 max-w-6xl bg-[#0f172a] min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">{t("portfolio.ai_title")}</h1>
        <p className="text-sm text-slate-400 mt-0.5">{t("portfolio.ai_subtitle")}</p>
        <p className="text-xs text-slate-500 mt-1 font-mono">{t("table.date")}: {summary.cohortDate}</p>
      </div>

      {/* 6 Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <SummaryCard
          label={t("portfolio.current_assets")}
          value={fmtJPY(summary.currentValue)}
          sub={`${t("portfolio.ai_subtitle").split("·")[1]?.trim()}`}
        />
        <SummaryCard
          label={t("portfolio.cumulative_return")}
          value={fmtPct(summary.returnPct)}
          valueClass={returnColor(summary.returnPct)}
        />
        <SummaryCard
          label="TOPIX ETF"
          value={fmtPct(summary.topixReturnPct)}
          valueClass={returnColor(summary.topixReturnPct)}
          sub="1306.T ETF"
        />
        <SummaryCard
          label={t("portfolio.alpha")}
          value={fmtPct(summary.alpha)}
          valueClass={returnColor(summary.alpha)}
          sub="Alpha"
        />
        <SummaryCard
          label={t("backtest.win_rate")}
          value={summary.winRate != null ? `${summary.winRate.toFixed(1)}%` : "—"}
          valueClass="text-blue-400"
        />
        <SummaryCard
          label={t("portfolio.max_drawdown")}
          value={maxDrawdown != null ? `-${maxDrawdown.toFixed(2)}%` : loadingTrend ? "…" : "—"}
          valueClass={maxDrawdown != null && maxDrawdown > 5 ? "text-red-400" : "text-slate-300"}
        />
      </div>

      {/* Holdings Table */}
      <div className="bg-[#1a2035] rounded-xl border border-slate-700/40 mb-6">
        <div className="px-5 py-4 border-b border-slate-700/40">
          <h2 className="text-base font-semibold text-white">{t("portfolio.holdings_title")}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/40 text-xs text-slate-400">
                <th className="text-left py-2.5 px-4">{t("common.symbol")}</th>
                <th className="text-left py-2.5 px-3">{t("common.name")}</th>
                <th className="text-right py-2.5 px-3">{t("portfolio.col_buy_price")}</th>
                <th className="text-right py-2.5 px-3">{t("portfolio.col_current")}</th>
                <th className="text-right py-2.5 px-3">{t("portfolio.cumulative_return")}</th>
                <th className="text-right py-2.5 px-3">{t("portfolio.col_value")}</th>
                <th className="text-center py-2.5 px-3">{t("backtest.col_rating")}</th>
                <th className="text-center py-2.5 px-3">{t("portfolio.col_suggestion")}</th>
                <th className="text-right py-2.5 px-3">{t("portfolio.col_days")}</th>
              </tr>
            </thead>
            <tbody>
              {summary.positions.map((pos) => (
                <tr key={pos.symbol} className="border-b border-slate-700/20 hover:bg-slate-800/30 transition-colors">
                  <td className="py-2.5 px-4">
                    <Link
                      href={`/stocks/${encodeURIComponent(pos.symbol)}`}
                      className="font-mono text-blue-400 hover:text-blue-300 text-xs font-medium"
                    >
                      {pos.symbol}
                    </Link>
                    <div className="text-[10px] text-slate-500 font-mono">#{pos.gptRank}</div>
                  </td>
                  <td className="py-2.5 px-3 text-slate-200 text-xs max-w-[140px] truncate">
                    {pos.name}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-xs text-slate-300">
                    {pos.entryPrice != null ? `¥${pos.entryPrice.toLocaleString("ja-JP")}` : (
                      <span className="text-slate-500">{t("portfolio.pending_entry")}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-xs text-slate-200">
                    {pos.currentPrice != null ? `¥${pos.currentPrice.toLocaleString("ja-JP")}` : "—"}
                  </td>
                  <td className={`py-2.5 px-3 text-right tabular-nums text-xs font-medium ${returnColor(pos.returnPct)}`}>
                    {fmtReturn(pos.returnPct)}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-xs text-slate-300">
                    {pos.currentValue != null ? `¥${Math.round(pos.currentValue).toLocaleString("ja-JP")}` : "—"}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <RatingBadge rating={pos.gptRating} />
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <SuggestionBadge suggestion={pos.aiSuggestion} t={t} />
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-xs text-slate-500">
                    {pos.daysHeld != null ? pos.daysHeld : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Trend Chart */}
      <div className="bg-[#1a2035] rounded-xl border border-slate-700/40 mb-6">
        <div className="px-5 py-4 border-b border-slate-700/40 flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-base font-semibold text-white">{t("portfolio.trend_title")}</h2>
          <div className="flex gap-1">
            {windows.map((w) => (
              <button
                key={w}
                onClick={() => setTrendWindow(w)}
                className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  trendWindow === w
                    ? "bg-blue-600 text-white"
                    : "bg-slate-700/50 text-slate-400 hover:text-slate-200 hover:bg-slate-700"
                }`}
              >
                {w}
              </button>
            ))}
          </div>
        </div>
        <div className="px-5 py-4">
          <TrendChart
            data={trend}
            loading={loadingTrend}
            window={trendWindow}
            t={t}
          />
        </div>
      </div>

      {/* History Table */}
      <div className="bg-[#1a2035] rounded-xl border border-slate-700/40">
        <div className="px-5 py-4 border-b border-slate-700/40">
          <h2 className="text-base font-semibold text-white">{t("portfolio.history_title")}</h2>
        </div>
        <div className="px-2 py-2">
          {loadingHistory ? (
            <div className="p-6 text-center text-slate-500 text-sm animate-pulse">{t("common.loading")}</div>
          ) : history && history.cohorts.length > 0 ? (
            <HistoryTable cohorts={history.cohorts} t={t} />
          ) : (
            <div className="p-6 text-center text-slate-500 text-sm">{t("portfolio.no_data")}</div>
          )}
        </div>
      </div>
    </div>
  );
}
