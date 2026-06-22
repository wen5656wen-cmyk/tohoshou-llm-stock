"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { fmtJpy } from "@/lib/rec-config";

// ── Types ─────────────────────────────────────────────────────────────────────

type HorizonKey = "7d" | "30d" | "90d";
type Granularity = "daily" | "weekly";

type HorizonStat = {
  winRate: number | null;
  avgReturn: number | null;
  medianReturn: number | null;
  filled: number;
  benchmarkNikkeiReturn: number | null;
  benchmarkTopixReturn: number | null;
  excessVsNikkei: number | null;
  excessVsTopix: number | null;
  maxDrawdown: number | null;
  date: string;
} | null;

type PortfolioRow = { "7d": HorizonStat; "30d": HorizonStat; "90d": HorizonStat };

type PickEntry = {
  symbol: string;
  return30d: number | null;
  gptRank: number;
  entryPrice: number | null;
  date: string;
};

type CohortEntry = {
  symbol: string;
  gptRank: number;
  finalScore: number;
  gptRating: string | null;
  buyPrice: number | null;
  entryPrice: number | null;
  return7d: number | null;
  return30d: number | null;
  return90d: number | null;
  summaryZh: string | null;
};

type Summary = {
  cohortCount: number;
  latestDate: string | null;
  portfolios: Record<string, PortfolioRow>;
  topWinners: PickEntry[];
  topLosers: PickEntry[];
  latestCohort: CohortEntry[];
};

type TrendPoint = {
  date: string;
  TOP10: number | null;
  TOP50: number | null;
  TOP100: number | null;
  ALL: number | null;
};

type TrendData = {
  horizon: string;
  series: TrendPoint[];
};

// ── Chart constants ───────────────────────────────────────────────────────────

const CHART_SERIES = [
  { key: "TOP10"  as const, label: "TOP10",   color: "#60a5fa" },
  { key: "TOP50"  as const, label: "TOP50",   color: "#34d399" },
  { key: "TOP100" as const, label: "TOP100",  color: "#fbbf24" },
  { key: "ALL"    as const, label: "ALL≈500", color: "#a78bfa" },
] as const;

const M = { top: 28, right: 20, bottom: 34, left: 50 };
const VW = 800;
const VH = 280;
const CW = VW - M.left - M.right;
const CH = VH - M.top - M.bottom;

// ── Helpers ───────────────────────────────────────────────────────────────────

function groupWeekly(series: TrendPoint[]): TrendPoint[] {
  if (series.length === 0) return [];
  const map = new Map<string, TrendPoint[]>();
  for (const pt of series) {
    const d = new Date(pt.date);
    // Monday-based ISO week key: YYYY-Www
    const dayOfWeek = (d.getUTCDay() + 6) % 7; // Mon=0, Sun=6
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() - dayOfWeek);
    const key = monday.toISOString().slice(0, 10);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(pt);
  }
  return Array.from(map.entries()).map(([weekStart, pts]) => {
    const avg = (vals: (number | null)[]): number | null => {
      const valid = vals.filter((v) => v != null) as number[];
      return valid.length ? Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 100) / 100 : null;
    };
    return {
      date: weekStart,
      TOP10:  avg(pts.map((p) => p.TOP10)),
      TOP50:  avg(pts.map((p) => p.TOP50)),
      TOP100: avg(pts.map((p) => p.TOP100)),
      ALL:    avg(pts.map((p) => p.ALL)),
    };
  });
}

// ── SVG Trend Chart ───────────────────────────────────────────────────────────

function TrendChart({
  data, loading, granularity, hintText, noDataText,
}: {
  data: TrendData | null;
  loading: boolean;
  granularity: Granularity;
  hintText: string;
  noDataText: string;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const rawSeries = data?.series ?? [];
  const series = granularity === "weekly" ? groupWeekly(rawSeries) : rawSeries;
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

  if (loading) {
    return <div className="h-52 animate-pulse bg-slate-800/30 rounded-lg" />;
  }

  if (N < 2) {
    return (
      <div className="h-52 flex items-center justify-center">
        <span className="text-slate-500 text-sm">{noDataText}</span>
      </div>
    );
  }

  // Y scale
  const allVals: number[] = [];
  for (const pt of series) {
    for (const s of CHART_SERIES) {
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

  const xPos = (i: number) => M.left + (i / (N - 1)) * CW;
  const yPos = (v: number) => M.top + CH * (1 - (v - minY) / rangeY);
  const zeroY = yPos(0);

  // 5 Y ticks
  const yTicks = Array.from({ length: 5 }, (_, i) => minY + (i / 4) * rangeY);

  // ~6 X labels
  const xStep = Math.max(1, Math.ceil(N / 6));
  const xLabels = series
    .map((pt, i) => ({ i, label: pt.date.slice(5) }))
    .filter((_, i) => i === 0 || i % xStep === 0 || i === N - 1);

  const hovered = hoverIdx != null ? series[hoverIdx] : null;

  return (
    <div>
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs mb-2">
        {CHART_SERIES.map(({ key, label, color }) => (
          <span key={key} className="flex items-center gap-1.5">
            <span className="w-5 h-0.5 inline-block rounded-full" style={{ background: color }} />
            <span className="text-slate-400">{label}</span>
          </span>
        ))}
      </div>

      {/* SVG */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VW} ${VH}`}
        className="w-full"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Y grid */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line
              x1={M.left} y1={yPos(v)} x2={VW - M.right} y2={yPos(v)}
              stroke="#1e293b" strokeWidth="0.5"
            />
            <text x={M.left - 5} y={yPos(v)} textAnchor="end" dominantBaseline="middle"
              fontSize="10" fill="#64748b">
              {v.toFixed(1)}%
            </text>
          </g>
        ))}

        {/* Zero baseline */}
        <line
          x1={M.left} y1={zeroY} x2={VW - M.right} y2={zeroY}
          stroke="#475569" strokeWidth="1" strokeDasharray="4 3"
        />

        {/* X labels */}
        {xLabels.map(({ i, label }) => (
          <text key={i} x={xPos(i)} y={VH - 4} textAnchor="middle" fontSize="9" fill="#64748b">
            {label}
          </text>
        ))}

        {/* Series lines */}
        {CHART_SERIES.map(({ key, color }) => {
          let d = "";
          for (let i = 0; i < N; i++) {
            const v = series[i][key];
            if (v == null) continue;
            const prevV = i > 0 ? series[i - 1][key] : null;
            d += `${prevV == null ? "M" : "L"} ${xPos(i).toFixed(1)} ${yPos(v).toFixed(1)} `;
          }
          if (!d) return null;
          return (
            <path
              key={key} d={d.trim()}
              fill="none" stroke={color} strokeWidth="1.8"
              strokeLinejoin="round" strokeLinecap="round"
              opacity={hoverIdx != null ? 0.65 : 1}
            />
          );
        })}

        {/* Hover indicator */}
        {hoverIdx != null && (
          <g>
            <line
              x1={xPos(hoverIdx)} y1={M.top}
              x2={xPos(hoverIdx)} y2={M.top + CH}
              stroke="#94a3b8" strokeWidth="1" strokeDasharray="3 2"
            />
            {CHART_SERIES.map(({ key, color }) => {
              const v = series[hoverIdx][key];
              if (v == null) return null;
              return (
                <circle key={key}
                  cx={xPos(hoverIdx)} cy={yPos(v)} r="4.5"
                  fill={color} stroke="#0f172a" strokeWidth="2"
                />
              );
            })}
          </g>
        )}
      </svg>

      {/* Info row */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-2 px-0.5 min-h-[28px] text-xs border-t border-slate-800 pt-2">
        {hovered ? (
          <>
            <span className="text-slate-500 font-mono">{hovered.date}</span>
            {CHART_SERIES.map(({ key, label, color }) => {
              const v = hovered[key];
              return (
                <span key={key} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                  <span className="text-slate-500">{label}</span>
                  {v != null ? (
                    <span className={`font-mono font-semibold ${v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-slate-400"}`}>
                      {v > 0 ? "+" : ""}{v.toFixed(2)}%
                    </span>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </span>
              );
            })}
          </>
        ) : (
          <span className="text-slate-600">{hintText}</span>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ReturnBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-slate-400 text-xs">—</span>;
  const color = value > 0 ? "text-emerald-400" : value < 0 ? "text-red-400" : "text-slate-400";
  return (
    <span className={`font-mono text-sm ${color}`}>
      {value > 0 ? "+" : ""}{value.toFixed(2)}%
    </span>
  );
}

function ExcessBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-slate-500 text-xs">—</span>;
  const color = value > 0 ? "text-emerald-400" : value < 0 ? "text-red-400" : "text-slate-400";
  return (
    <span className={`font-mono text-xs ${color}`}>
      {value > 0 ? "+" : ""}{value.toFixed(2)}%
    </span>
  );
}

function StatCell({ stat }: { stat: HorizonStat }) {
  if (!stat || stat.filled === 0) {
    return (
      <td className="px-3 py-2 text-center" colSpan={4}>
        <span className="text-slate-600 text-xs">—</span>
      </td>
    );
  }
  const winColor = stat.winRate != null && stat.winRate >= 55 ? "text-emerald-400" : "text-yellow-400";
  const retColor = stat.avgReturn != null && stat.avgReturn > 0 ? "text-emerald-400" : "text-red-400";
  return (
    <>
      <td className="px-2 py-2 text-right">
        <span className={`font-mono text-xs ${retColor}`}>
          {stat.avgReturn != null ? `${stat.avgReturn > 0 ? "+" : ""}${stat.avgReturn.toFixed(1)}%` : "—"}
        </span>
      </td>
      <td className="px-2 py-2 text-right">
        <span className={`font-mono text-xs ${winColor}`}>
          {stat.winRate != null ? `${stat.winRate.toFixed(0)}%` : "—"}
        </span>
      </td>
      <td className="px-2 py-2 text-right"><ExcessBadge value={stat.excessVsNikkei} /></td>
      <td className="px-2 py-2 text-right"><ExcessBadge value={stat.excessVsTopix} /></td>
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BacktestPage() {
  const { t } = useI18n();
  const [data,        setData]        = useState<Summary | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [tab,         setTab]         = useState<"latest" | "winners" | "losers">("latest");
  const [trendData,   setTrendData]   = useState<TrendData | null>(null);
  const [trendLoad,   setTrendLoad]   = useState(true);
  const [trendH,      setTrendH]      = useState<HorizonKey>("30d");
  const [granularity, setGranularity] = useState<Granularity>("daily");

  const loadSummary = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/backtest/summary")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch(() => setError("load_failed"))
      .finally(() => setLoading(false));
  }, []);

  const loadTrend = useCallback((horizon: HorizonKey) => {
    setTrendLoad(true);
    fetch(`/api/backtest/trend?horizon=${horizon}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setTrendData(d ?? null))
      .catch(() => setTrendData(null))
      .finally(() => setTrendLoad(false));
  }, []);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { loadTrend(trendH); }, [loadTrend, trendH]);

  const PORTFOLIO_SIZES = ["TOP5", "TOP10", "TOP20", "ALL"] as const;
  const HORIZONS: HorizonKey[] = ["7d", "30d", "90d"];
  const allP = data?.portfolios?.["ALL"];

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-white">{t("backtest.title")}</h1>
        <p className="text-slate-400 text-sm mt-1">{t("backtest.subtitle")}</p>
        {data && (
          <p className="text-slate-500 text-xs mt-1">
            {t("backtest.cohorts")}: {data.cohortCount}
          </p>
        )}
      </div>

      {/* Risk Banner */}
      <div className="mb-6 bg-amber-950/40 border border-amber-800/50 rounded-lg px-4 py-3 flex items-start gap-2.5">
        <span className="text-amber-500 text-sm flex-shrink-0 mt-0.5">⚠</span>
        <span className="text-amber-300/80 text-xs leading-relaxed">{t("backtest.risk_banner")}</span>
      </div>

      {loading && (
        <div className="text-slate-400 text-sm animate-pulse py-16 text-center">Loading…</div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="bg-red-950/40 border border-red-800/50 rounded-xl p-10 text-center">
          <p className="text-red-400 text-sm mb-4">{t("backtest.error_load")}</p>
          <button
            onClick={loadSummary}
            className="px-5 py-2 bg-red-900/50 text-red-300 rounded-lg text-sm hover:bg-red-900/70 transition-colors border border-red-800/50"
          >
            {t("backtest.retry")}
          </button>
        </div>
      )}

      {/* No data */}
      {!loading && !error && !data?.latestDate && (
        <div className="bg-[#1a2035] rounded-xl p-8 text-center text-slate-400 text-sm border border-slate-700/40">
          {t("backtest.no_data")}
        </div>
      )}

      {!loading && !error && data && data.latestDate && (
        <>
          {/* Horizon stat cards (ALL portfolio) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {HORIZONS.map((h) => {
              const stat = allP?.[h] ?? null;
              if (!stat) {
                return (
                  <div key={h} className="bg-[#1a2035] rounded-xl p-5 border border-slate-700/40">
                    <div className="text-slate-400 text-sm mb-1">
                      {t(`backtest.horizon_${h}` as "backtest.horizon_7d")}
                    </div>
                    <div className="text-slate-500 text-xs">{t("backtest.no_data")}</div>
                  </div>
                );
              }
              const winColor = stat.winRate != null && stat.winRate >= 55 ? "text-emerald-400" : "text-yellow-400";
              const retColor = stat.avgReturn != null && stat.avgReturn > 0 ? "text-emerald-400" : "text-red-400";
              return (
                <div key={h} className="bg-[#1a2035] rounded-xl p-5 border border-slate-700/40">
                  <div className="text-slate-300 text-sm font-medium mb-3">
                    {t(`backtest.horizon_${h}` as "backtest.horizon_7d")} · ALL≈500
                  </div>
                  <div className="flex gap-6">
                    <div>
                      <div className="text-slate-500 text-xs mb-0.5">{t("backtest.win_rate")}</div>
                      <div className={`text-2xl font-bold ${winColor}`}>
                        {stat.winRate != null ? `${stat.winRate.toFixed(1)}%` : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 text-xs mb-0.5">{t("backtest.avg_return")}</div>
                      <div className={`text-2xl font-bold ${retColor}`}>
                        {stat.avgReturn != null
                          ? `${stat.avgReturn > 0 ? "+" : ""}${stat.avgReturn.toFixed(2)}%`
                          : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 text-xs mb-0.5">{t("backtest.filled")}</div>
                      <div className="text-2xl font-bold text-slate-200">{stat.filled}</div>
                    </div>
                  </div>
                  <div className="mt-2 text-slate-600 text-xs">
                    {t("backtest.as_of")} {new Date(stat.date).toLocaleDateString()}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Portfolio comparison table */}
          <div className="bg-[#1a2035] rounded-xl border border-slate-700/40 mb-6 overflow-x-auto">
            <div className="px-4 pt-4 pb-2">
              <h2 className="text-slate-200 text-sm font-semibold">{t("backtest.portfolio_title")}</h2>
            </div>
            <table className="w-full text-xs min-w-[700px]">
              <thead>
                <tr className="border-b border-slate-700/40 text-slate-500">
                  <th className="px-3 py-2 text-left">{t("backtest.col_portfolio")}</th>
                  {HORIZONS.map((h) => (
                    <th key={h} className="px-2 py-2 text-center" colSpan={4}>
                      <span className="text-slate-400">
                        {t(`backtest.horizon_${h}` as "backtest.horizon_7d")}
                      </span>
                    </th>
                  ))}
                </tr>
                <tr className="border-b border-slate-800 text-slate-600 text-[10px]">
                  <th className="px-3 py-1" />
                  {HORIZONS.map((h) => (
                    <>
                      <th key={`${h}-ai`}  className="px-2 py-1 text-right">{t("backtest.avg_return")}</th>
                      <th key={`${h}-win`} className="px-2 py-1 text-right">{t("backtest.win_rate")}</th>
                      <th key={`${h}-n`}   className="px-2 py-1 text-right">{t("backtest.col_nikkei")}</th>
                      <th key={`${h}-t`}   className="px-2 py-1 text-right">{t("backtest.col_topix")}</th>
                    </>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PORTFOLIO_SIZES.map((ps) => (
                  <tr key={ps} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
                    <td className="px-3 py-2 text-slate-300 font-mono font-medium">
                      {ps === "ALL" ? "ALL≈500" : ps}
                    </td>
                    {HORIZONS.map((h) => (
                      <StatCell key={h} stat={data.portfolios?.[ps]?.[h] ?? null} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2 text-slate-600 text-[10px] flex flex-wrap gap-3">
              <span>{t("backtest.entry_note")}</span>
              <span>·</span>
              <span>{t("backtest.benchmark_note")}</span>
            </div>
          </div>

          {/* Historical Trend Chart */}
          <div className="bg-[#1a2035] rounded-xl border border-slate-700/40 mb-6 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="text-slate-200 text-sm font-semibold">{t("backtest.trend_title")}</h2>
              <div className="flex items-center gap-3">
                {/* Granularity toggle */}
                <div className="flex gap-1 text-xs">
                  {(["daily", "weekly"] as Granularity[]).map((g) => (
                    <button
                      key={g}
                      onClick={() => setGranularity(g)}
                      className={`px-2.5 py-1 rounded transition-colors ${
                        granularity === g
                          ? "bg-slate-600 text-white"
                          : "text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      {g === "daily" ? "每日" : "按周"}
                    </button>
                  ))}
                </div>
                {/* Horizon tabs */}
                <div className="flex gap-1">
                  {HORIZONS.map((h) => (
                    <button
                      key={h}
                      onClick={() => setTrendH(h)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                        trendH === h
                          ? "bg-blue-600 text-white"
                          : "bg-slate-800/60 text-slate-400 hover:text-white border border-slate-700/40"
                      }`}
                    >
                      {t(`backtest.horizon_${h}` as "backtest.horizon_7d")}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <TrendChart
              data={trendData}
              loading={trendLoad}
              granularity={granularity}
              hintText={t("backtest.trend_hint")}
              noDataText={t("backtest.trend_no_data")}
            />
          </div>

          {/* Tab switcher */}
          <div className="flex gap-2 mb-4">
            {(["latest", "winners", "losers"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  tab === k
                    ? "bg-blue-600 text-white"
                    : "bg-[#1a2035] text-slate-400 hover:text-white border border-slate-700/40"
                }`}
              >
                {t(
                  k === "latest"
                    ? "backtest.latest_picks"
                    : k === "winners"
                    ? "backtest.top_winners"
                    : "backtest.top_losers",
                )}
              </button>
            ))}
          </div>

          {/* Latest cohort table */}
          {tab === "latest" && (
            <div className="bg-[#1a2035] rounded-xl border border-slate-700/40 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/40 text-slate-400 text-xs">
                    <th className="px-4 py-3 text-left">{t("backtest.col_rank")}</th>
                    <th className="px-4 py-3 text-left">{t("backtest.col_symbol")}</th>
                    <th className="px-4 py-3 text-right">{t("backtest.col_score")}</th>
                    <th className="px-4 py-3 text-left">{t("backtest.col_rating")}</th>
                    <th className="px-4 py-3 text-right">{t("backtest.col_entry_price")}</th>
                    <th className="px-4 py-3 text-right">{t("backtest.col_ret7d")}</th>
                    <th className="px-4 py-3 text-right">{t("backtest.col_ret30d")}</th>
                    <th className="px-4 py-3 text-right">{t("backtest.col_ret90d")}</th>
                    <th className="px-4 py-3 text-left hidden xl:table-cell">{t("backtest.col_summary")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.latestCohort.map((row) => (
                    <tr
                      key={row.symbol}
                      className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="px-4 py-3 text-slate-400 font-mono text-xs">{row.gptRank}</td>
                      <td className="px-4 py-3">
                        <Link href={`/stocks/${row.symbol}`} className="text-blue-400 hover:text-blue-300 font-medium">
                          {row.symbol}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-white">{row.finalScore.toFixed(1)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-2 py-0.5 rounded font-medium ${
                            row.gptRating === "STRONG_BUY"
                              ? "bg-emerald-900/60 text-emerald-400"
                              : row.gptRating === "BUY"
                              ? "bg-blue-900/60 text-blue-400"
                              : "bg-slate-700/60 text-slate-300"
                          }`}
                        >
                          {row.gptRating ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-300 font-mono text-xs">
                        {row.entryPrice ? fmtJpy(row.entryPrice) : row.buyPrice ? fmtJpy(row.buyPrice) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right"><ReturnBadge value={row.return7d} /></td>
                      <td className="px-4 py-3 text-right"><ReturnBadge value={row.return30d} /></td>
                      <td className="px-4 py-3 text-right"><ReturnBadge value={row.return90d} /></td>
                      <td className="px-4 py-3 hidden xl:table-cell text-slate-400 text-xs max-w-xs truncate">
                        {row.summaryZh ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Winners / Losers tables */}
          {(tab === "winners" || tab === "losers") && (
            <div className="bg-[#1a2035] rounded-xl border border-slate-700/40 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/40 text-slate-400 text-xs">
                    <th className="px-4 py-3 text-left">{t("backtest.col_symbol")}</th>
                    <th className="px-4 py-3 text-right">{t("backtest.col_rank")}</th>
                    <th className="px-4 py-3 text-right">{t("backtest.col_entry_price")}</th>
                    <th className="px-4 py-3 text-right">{t("backtest.col_ret30d")}</th>
                    <th className="px-4 py-3 text-right">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {(tab === "winners" ? data.topWinners : data.topLosers).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-slate-500 text-sm">
                        {t("backtest.no_data")}
                      </td>
                    </tr>
                  ) : (
                    (tab === "winners" ? data.topWinners : data.topLosers).map((row, i) => (
                      <tr
                        key={i}
                        className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <Link href={`/stocks/${row.symbol}`} className="text-blue-400 hover:text-blue-300 font-medium">
                            {row.symbol}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-400 font-mono text-xs">#{row.gptRank}</td>
                        <td className="px-4 py-3 text-right text-slate-300 font-mono text-xs">
                          {row.entryPrice ? fmtJpy(row.entryPrice) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right"><ReturnBadge value={row.return30d} /></td>
                        <td className="px-4 py-3 text-right text-slate-500 text-xs">
                          {new Date(row.date).toLocaleDateString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
