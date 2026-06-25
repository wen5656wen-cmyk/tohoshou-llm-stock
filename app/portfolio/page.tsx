"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n";
import type { PortfolioSummary } from "@/app/api/portfolio/summary/route";
import type { TrendData } from "@/app/api/portfolio/trend/route";
import type { HistoryData, HistoryCohort } from "@/app/api/portfolio/history/route";
import type { SnapshotSummary } from "@/app/api/portfolio/snapshots/route";
import type { SnapshotDetail } from "@/app/api/portfolio/snapshots/[date]/route";

// ── Watchlist types ────────────────────────────────────────────────────────────

type WlScore = {
  latestClose: number | null;
  realtimePrice: number | null;
  changePct: number | null;
  volume: number | null;
  volumeRatio: number | null;
  turnoverRate: number | null;
  realtimeUpdatedAt: string | null;
  finalScore: number;
  adaptiveScore: number | null;
  technicalScore: number | null;
  fundamentalScore: number | null;
  newsSentimentScore: number | null;
  effectiveRating: string | null;
  recommendationV2: string | null;
  return5d: number | null;
  return20d: number | null;
  percentileRank: number | null;
  computedAt: string | null;
};

type WatchlistItem = {
  id: number;
  symbol: string;
  name: string;
  nameZh: string | null;
  addedAt: string;
  score: WlScore | null;
};

// ── Chart constants ────────────────────────────────────────────────────────────

const M = { top: 28, right: 20, bottom: 34, left: 54 };
const VW = 800;
const VH = 280;
const CW = VW - M.left - M.right;
const CH = VH - M.top - M.bottom;

type WindowKey = "7D" | "30D" | "90D" | "ALL";
type TabKey = "system" | "watchlist";

// ── Helpers ────────────────────────────────────────────────────────────────────

function returnColor(v: number | null): string {
  if (v == null) return "text-slate-400";
  return v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-slate-400";
}

function fmtReturn(v: number | null): string {
  if (v == null) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function fmtNum(v: number): string {
  return v.toLocaleString("ja-JP");
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
  data, loading, window: win, t,
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
              {s.key === "portfolioReturn" ? t("portfolio.trend_ai") : s.key === "topixReturn" ? "TOPIX ETF" : "Alpha"}
            </span>
          </span>
        ))}
      </div>

      {hovered && (
        <div className="flex gap-4 text-xs mb-1 text-slate-400">
          <span className="font-mono">{hovered.date}</span>
          <span className={returnColor(hovered.portfolioReturn)}>
            {t("portfolio.trend_ai")}: {fmtReturn(hovered.portfolioReturn)}
          </span>
          {hovered.topixReturn != null && (
            <span className={returnColor(hovered.topixReturn)}>TOPIX ETF: {fmtReturn(hovered.topixReturn)}</span>
          )}
          {hovered.alpha != null && (
            <span className={returnColor(hovered.alpha)}>Alpha: {fmtReturn(hovered.alpha)}</span>
          )}
        </div>
      )}

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
          <text key={i} x={xPos(i)} y={VH - 4} textAnchor="middle" fontSize="9" fill="#64748b">{label}</text>
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
        {hoverIdx != null && (
          <line
            x1={xPos(hoverIdx)} y1={M.top}
            x2={xPos(hoverIdx)} y2={VH - M.bottom}
            stroke="#475569" strokeWidth="1" strokeDasharray="3 2"
          />
        )}
      </svg>
    </div>
  );
}

// ── Cards ──────────────────────────────────────────────────────────────────────

function AssetCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-[#1a2035] rounded-xl p-4 border border-slate-700/40 flex flex-col h-full">
      <div className="text-xs text-slate-400 mb-2">{label}</div>
      <div className="text-[40px] font-bold tabular-nums text-white leading-none flex-1 flex items-end pb-0.5">
        {value}
      </div>
      {sub && <div className="text-[13px] text-[#94A3B8] mt-2">{sub}</div>}
    </div>
  );
}

function KPICard({
  label, value, valueClass = "text-white", sub,
}: {
  label: string; value: string; valueClass?: string; sub?: string;
}) {
  return (
    <div className="bg-[#1a2035] rounded-xl p-4 border border-slate-700/40 flex flex-col h-full">
      <div className="text-xs text-slate-400 mb-2">{label}</div>
      <div className={`text-2xl font-bold tabular-nums leading-none flex-1 flex items-end pb-0.5 ${valueClass}`}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-slate-500 mt-2">{sub}</div>}
    </div>
  );
}

// ── Loading skeleton ───────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
        <div className="col-span-2 md:col-span-1 lg:col-span-2 bg-slate-800/50 rounded-xl h-24" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-slate-800/50 rounded-xl h-24" />
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

// ── Snapshot Panel ─────────────────────────────────────────────────────────────

function SnapshotCard({
  snap,
  t,
}: {
  snap: SnapshotSummary;
  t: (k: MessageKey) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<SnapshotDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState(false);

  const handleExpand = useCallback(() => {
    if (!expanded && !detail && !detailError) {
      setLoadingDetail(true);
      setDetailError(false);
      fetch(`/api/portfolio/snapshots/${snap.snapshotDate}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((d: SnapshotDetail) => { setDetail(d); setLoadingDetail(false); })
        .catch(() => { setDetailError(true); setLoadingDetail(false); });
    }
    setExpanded((v) => !v);
  }, [expanded, detail, detailError, snap.snapshotDate]);

  const pnlColor = snap.unrealizedPnl >= 0 ? "text-emerald-400" : "text-red-400";
  const pnlSign = snap.unrealizedPnl >= 0 ? "+" : "";

  return (
    <div className="bg-[#1a2035] rounded-xl border border-slate-700/40 overflow-hidden">
      {/* ── Card header ─────────────────────────────────────────────────────── */}
      <div
        className="px-5 py-4 cursor-pointer hover:bg-slate-800/30 transition-colors"
        onClick={handleExpand}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="text-white font-semibold text-sm">{snap.snapshotDate} AI組合</div>
            <div className="text-xs text-slate-500 mt-0.5">
              {t("portfolio.snap_invested")}：¥{Math.round(snap.investedAmount).toLocaleString("ja-JP")}
              　{t("portfolio.snap_cash")}：¥{Math.round(snap.cash).toLocaleString("ja-JP")}
            </div>
          </div>
          <span className="text-slate-500 text-xs mt-0.5">{expanded ? "▲" : "▼"}</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
          <div>
            <div className="text-xs text-slate-400 mb-0.5">{t("portfolio.snap_total_assets")}</div>
            <div className="text-sm font-semibold text-white tabular-nums">
              ¥{Math.round(snap.totalAssets).toLocaleString("ja-JP")}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-0.5">{t("portfolio.snap_pnl")}</div>
            <div className={`text-sm font-semibold tabular-nums ${pnlColor}`}>
              {pnlSign}¥{Math.round(snap.unrealizedPnl).toLocaleString("ja-JP")}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-0.5">{t("portfolio.snap_return_pct")}</div>
            <div className={`text-sm font-bold tabular-nums ${pnlColor}`}>
              {pnlSign}{snap.returnPct.toFixed(2)}%
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-0.5">{t("portfolio.snap_positions")}</div>
            <div className="text-sm font-semibold text-white">
              {snap.positionCount}
            </div>
          </div>
        </div>

        {/* Benchmark row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <div className="text-xs text-slate-400 mb-0.5">{t("portfolio.snap_holding_days")}</div>
            <div className="text-sm font-semibold text-slate-300">
              {snap.holdingDays}{t("portfolio.snap_days_unit")}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-0.5">{t("portfolio.snap_topix_return")}</div>
            <div className={`text-sm font-semibold tabular-nums ${returnColor(snap.benchmarkTopixReturnPct)}`}>
              {fmtPct(snap.benchmarkTopixReturnPct)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-0.5">{t("portfolio.snap_alpha")}</div>
            <div className={`text-sm font-bold tabular-nums ${returnColor(snap.alphaVsTopix)}`}>
              {fmtPct(snap.alphaVsTopix)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-0.5">vs TOPIX</div>
            <div className="text-sm font-semibold">
              {snap.isOutperformingTopix == null ? (
                <span className="text-slate-500">—</span>
              ) : snap.isOutperformingTopix ? (
                <span className="text-emerald-400 font-bold">{t("portfolio.snap_outperform")}</span>
              ) : (
                <span className="text-red-400 font-bold">{t("portfolio.snap_underperform")}</span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-2 text-right">
          <button className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
            {expanded ? t("portfolio.snap_collapse") : t("portfolio.snap_expand")} →
          </button>
        </div>
      </div>

      {/* ── Expanded positions ───────────────────────────────────────────────── */}
      {expanded && (
        <div className="border-t border-slate-700/40">
          {loadingDetail ? (
            <div className="p-6 text-center text-slate-500 text-sm animate-pulse">{t("portfolio.snap_loading")}</div>
          ) : detailError ? (
            <div className="p-6 text-center text-red-400 text-sm">
              {t("portfolio.snap_detail_error")}
              <button
                className="ml-3 underline text-red-300 hover:text-red-200"
                onClick={() => { setDetailError(false); setDetail(null); }}
              >
                ↩
              </button>
            </div>
          ) : detail && detail.positions.length === 0 ? (
            <div className="p-6 text-center text-slate-500 text-sm">{t("portfolio.snap_no_positions")}</div>
          ) : detail ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700/40 text-slate-400">
                    <th className="text-left py-2 px-4">{t("common.symbol")}</th>
                    <th className="text-left py-2 px-3">{t("common.name")}</th>
                    <th className="text-right py-2 px-3">{t("portfolio.snap_entry_price")}</th>
                    <th className="text-right py-2 px-3">{t("portfolio.snap_current_price")}</th>
                    <th className="text-right py-2 px-3">{t("portfolio.snap_shares")}</th>
                    <th className="text-right py-2 px-3">{t("portfolio.snap_entry_amount")}</th>
                    <th className="text-right py-2 px-3">{t("portfolio.snap_market_value")}</th>
                    <th className="text-right py-2 px-3">{t("portfolio.snap_pos_pnl")}</th>
                    <th className="text-right py-2 px-3">{t("portfolio.snap_return_pct")}</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.positions.map((pos) => {
                    const posColor =
                      pos.returnPct == null
                        ? "text-slate-400"
                        : pos.returnPct > 0
                        ? "text-emerald-400"
                        : pos.returnPct < 0
                        ? "text-red-400"
                        : "text-slate-400";
                    const pnlS = pos.unrealizedPnl != null && pos.unrealizedPnl >= 0 ? "+" : "";
                    return (
                      <tr key={pos.id} className="border-b border-slate-700/20 hover:bg-slate-800/30 transition-colors">
                        <td className="py-2 px-4">
                          <Link href={`/stocks/${encodeURIComponent(pos.symbol)}`} className="font-mono text-blue-400 hover:text-blue-300">
                            {pos.symbol}
                          </Link>
                          {pos.gptRank != null && (
                            <div className="text-[10px] text-slate-500">#{pos.gptRank}</div>
                          )}
                        </td>
                        <td className="py-2 px-3 text-slate-200 max-w-[120px] truncate">{pos.nameZh ?? pos.name}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-slate-300">
                          ¥{pos.entryPrice.toLocaleString("ja-JP")}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-slate-200">
                          {pos.currentPrice != null ? `¥${pos.currentPrice.toLocaleString("ja-JP")}` : "—"}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-slate-300">
                          {pos.shares.toLocaleString("ja-JP")}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-slate-400">
                          ¥{Math.round(pos.entryAmount).toLocaleString("ja-JP")}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-slate-200">
                          {pos.marketValue != null ? `¥${Math.round(pos.marketValue).toLocaleString("ja-JP")}` : "—"}
                        </td>
                        <td className={`py-2 px-3 text-right tabular-nums font-medium ${posColor}`}>
                          {pos.unrealizedPnl != null
                            ? `${pnlS}¥${Math.round(pos.unrealizedPnl).toLocaleString("ja-JP")}`
                            : "—"}
                        </td>
                        <td className={`py-2 px-3 text-right tabular-nums font-semibold ${posColor}`}>
                          {pos.returnPct != null
                            ? `${pos.returnPct >= 0 ? "+" : ""}${pos.returnPct.toFixed(2)}%`
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="px-5 py-3 border-t border-slate-700/40 flex flex-wrap gap-6 text-xs text-slate-500">
                <span>{t("portfolio.snap_invested")}：<span className="text-slate-200 font-medium">¥{Math.round(detail.investedAmount).toLocaleString("ja-JP")}</span></span>
                <span>{t("portfolio.snap_cash")}：<span className="text-slate-400">¥{Math.round(detail.cash).toLocaleString("ja-JP")}</span></span>
                <span>{t("portfolio.snap_total_assets")}：<span className={detail.unrealizedPnl >= 0 ? "text-emerald-400 font-medium" : "text-red-400 font-medium"}>¥{Math.round(detail.totalAssets).toLocaleString("ja-JP")}</span></span>
                <span className="ml-auto italic">{t("portfolio.simulate_disclaimer")}</span>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function SnapshotsPanel({ t }: { t: (k: MessageKey) => string }) {
  const [snapshots, setSnapshots] = useState<SnapshotSummary[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/portfolio/snapshots")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d: SnapshotSummary[]) => { setSnapshots(d); setLoading(false); })
      .catch(() => { setSnapshots([]); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-slate-800/50 rounded-xl h-32" />
        ))}
      </div>
    );
  }

  if (!snapshots || snapshots.length === 0) {
    return (
      <div className="bg-[#1a2035] rounded-xl border border-slate-700/40 p-14 text-center">
        <div className="text-slate-400 text-sm">{t("portfolio.snap_no_data")}</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 px-1 mb-1">
        <span className="text-sm font-semibold text-white">{t("portfolio.snap_section_title")}</span>
        <span className="text-xs text-slate-500">{t("portfolio.tab_snapshots_desc")}</span>
      </div>
      {snapshots.map((s) => (
        <SnapshotCard key={s.id} snap={s} t={t} />
      ))}
    </div>
  );
}

// ── Watchlist helpers ──────────────────────────────────────────────────────────

function fmtVol(v: number | null): string {
  if (v == null) return "—";
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}億`;
  if (v >= 10_000) return `${(v / 10_000).toFixed(1)}万`;
  return v.toLocaleString("ja-JP");
}

function isJSTTradingHours(): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  if (p.weekday === "Sat" || p.weekday === "Sun") return false;
  const total = parseInt(p.hour, 10) * 60 + parseInt(p.minute, 10);
  return (total >= 540 && total <= 690) || (total >= 750 && total <= 930);
}

// ── Watchlist Card ─────────────────────────────────────────────────────────────

function WatchlistCard({
  item, t, onDelete,
}: {
  item: WatchlistItem;
  t: (k: MessageKey) => string;
  onDelete: (symbol: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const s = item.score;
  const displayPrice = s?.realtimePrice ?? s?.latestClose ?? null;
  const changePct = s?.changePct ?? null;

  const handleDelete = useCallback(async () => {
    if (!window.confirm(`删除自选股 ${item.symbol}？`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/watchlist?symbol=${encodeURIComponent(item.symbol)}`, { method: "DELETE" });
      onDelete(item.symbol);
    } finally {
      setDeleting(false);
    }
  }, [item.symbol, onDelete]);

  const updatedTime = s?.realtimeUpdatedAt
    ? new Date(s.realtimeUpdatedAt).toLocaleTimeString("ja-JP", {
        hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Tokyo",
      })
    : null;

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700/40 p-3 flex flex-col gap-2">
      {/* Header: symbol + name + rating */}
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1 mr-1">
          <Link href={`/stocks/${encodeURIComponent(item.symbol)}`} className="font-mono text-blue-400 hover:text-blue-300 text-xs font-bold block leading-tight">
            {item.symbol}
          </Link>
          <div className="text-[11px] text-slate-300 truncate leading-tight">{item.nameZh ?? item.name}</div>
        </div>
        <RatingBadge rating={s?.effectiveRating ?? null} />
      </div>

      {/* Price (full width) → returns row below — no overlap */}
      <div className="flex flex-col gap-0.5">
        <div className="text-[9px] text-slate-500 leading-none">{t("portfolio.wl_realtime_price")}</div>
        <div className="text-[18px] leading-[1.1] font-bold text-white tabular-nums">
          {displayPrice != null ? `¥${displayPrice.toLocaleString("ja-JP")}` : "—"}
        </div>
        <div className="flex items-baseline flex-wrap gap-x-1.5 gap-y-0 mt-0.5 text-[13px] tabular-nums">
          <span className="text-[9px] text-slate-500">{t("portfolio.wl_1d_change")}</span>
          <span className={`font-semibold ${returnColor(changePct)}`}>{fmtPct(changePct)}</span>
          <span className="text-slate-600 text-[10px]">│</span>
          <span className="text-[9px] text-slate-500">5D</span>
          <span className={returnColor(s?.return5d ?? null)}>{fmtPct(s?.return5d ?? null)}</span>
          <span className="text-slate-600 text-[10px]">│</span>
          <span className="text-[9px] text-slate-500">20D</span>
          <span className={returnColor(s?.return20d ?? null)}>{fmtPct(s?.return20d ?? null)}</span>
        </div>
      </div>

      {/* Volume row */}
      <div className="flex flex-wrap gap-2 text-[10px] text-slate-500">
        <span>{t("portfolio.wl_vol")} <span className="text-slate-300">{fmtVol(s?.volume ?? null)}</span></span>
        <span>{t("portfolio.wl_vol_ratio")} <span className="text-slate-300">{s?.volumeRatio != null ? s.volumeRatio.toFixed(2) : "—"}</span></span>
        <span>{t("portfolio.wl_turnover")} <span className="text-slate-300">{s?.turnoverRate != null ? `${s.turnoverRate.toFixed(1)}%` : "—"}</span></span>
      </div>

      {/* Scores + update time */}
      <div className="flex items-center justify-between text-[10px]">
        <div className="flex gap-2 text-slate-500">
          <span>AI <span className="text-white font-semibold">{s ? s.finalScore.toFixed(1) : "—"}</span></span>
          <span>技 <span className="text-slate-300">{s?.technicalScore ?? "—"}</span></span>
          <span>基 <span className="text-slate-300">{s?.fundamentalScore ?? "—"}</span></span>
        </div>
        {updatedTime && <span className="text-slate-600">{updatedTime}</span>}
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between pt-1.5 border-t border-slate-700/30 mt-auto">
        <Link href={`/stocks/${encodeURIComponent(item.symbol)}`} className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors">
          {t("portfolio.wl_detail_btn")} →
        </Link>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="text-[10px] text-slate-600 hover:text-red-400 transition-colors disabled:opacity-50"
        >
          {t("portfolio.wl_delete_btn")}
        </button>
      </div>
    </div>
  );
}

// ── Watchlist suggestion badge ─────────────────────────────────────────────────

const BUY_RATINGS = new Set(["STRONG_BUY", "BUY"]);
const INITIAL_CAPITAL_WL = 100_000_000;

function wlSuggestion(rating: string | null): { labelKey: MessageKey; cls: string } {
  if (rating === "STRONG_BUY" || rating === "BUY")
    return { labelKey: "portfolio.wl_suggest_buy",     cls: "bg-emerald-900/60 text-emerald-400" };
  if (rating === "HOLD")
    return { labelKey: "portfolio.suggest_hold",        cls: "bg-blue-900/60 text-blue-400" };
  if (rating === "WATCH")
    return { labelKey: "portfolio.wl_suggest_watch",   cls: "bg-yellow-900/60 text-yellow-400" };
  if (rating === "AVOID" || rating === "SELL")
    return { labelKey: "portfolio.wl_suggest_sell",    cls: "bg-red-900/60 text-red-400" };
  return   { labelKey: "portfolio.wl_suggest_pending", cls: "bg-slate-700 text-slate-400" };
}

// ── Watchlist Portfolio Panel ──────────────────────────────────────────────────

function WatchlistPanel({
  items, loading, t, onRefresh,
}: {
  items: WatchlistItem[] | null;
  loading: boolean;
  t: (k: MessageKey) => string;
  onRefresh: () => void;
}) {
  const [displayItems, setDisplayItems] = useState<WatchlistItem[]>(items ?? []);
  const [showScoreDetail, setShowScoreDetail] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  useEffect(() => {
    if (items != null) {
      setDisplayItems(items);
      if (!loading) setLastRefreshed(new Date());
    }
  }, [items, loading]);

  // Auto-refresh every 60s during JST trading hours
  useEffect(() => {
    const id = setInterval(() => { if (isJSTTradingHours()) onRefresh(); }, 60_000);
    return () => clearInterval(id);
  }, [onRefresh]);

  const handleDelete = useCallback((symbol: string) => {
    setDisplayItems((prev) => prev.filter((i) => i.symbol !== symbol));
  }, []);

  // Initial loading skeleton
  if (loading && displayItems.length === 0) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="bg-slate-800/50 rounded-xl h-48" />
        <div className="bg-slate-800/50 rounded-xl h-64" />
      </div>
    );
  }

  // Empty state
  if (!loading && displayItems.length === 0 && items != null) {
    return (
      <div className="bg-[#1a2035] rounded-xl border border-slate-700/40 p-14 text-center">
        <div className="text-4xl mb-4 text-slate-600">☆</div>
        <div className="text-white font-medium mb-2">{t("portfolio.wl_empty_title")}</div>
        <p className="text-slate-500 text-xs mb-6">{t("portfolio.tab_watchlist_desc")}</p>
        <Link
          href="/stocks"
          className="inline-flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {t("portfolio.wl_empty_btn")} →
        </Link>
      </div>
    );
  }

  // ── Simulated portfolio logic ────────────────────────────────────────────────
  const eligible = displayItems
    .filter((w) => w.score && BUY_RATINGS.has(w.score.effectiveRating ?? ""))
    .slice(0, 10);
  const simItems = eligible.length >= 2 ? eligible : displayItems.slice(0, Math.min(10, displayItems.length));
  const alloc = simItems.length > 0 ? INITIAL_CAPITAL_WL / simItems.length : 0;

  const positions = simItems
    .map((w) => {
      const entryPrice = w.score?.latestClose ?? null;
      const currentPrice = w.score?.realtimePrice ?? entryPrice;
      const shares = entryPrice && entryPrice > 0 ? Math.floor(alloc / entryPrice) : 0;
      const marketValue = shares * (currentPrice ?? 0);
      const pnl = (currentPrice != null && entryPrice != null && shares > 0)
        ? (currentPrice - entryPrice) * shares : null;
      const retPct = (entryPrice && entryPrice > 0 && currentPrice != null)
        ? ((currentPrice - entryPrice) / entryPrice) * 100 : null;
      return { ...w, entryPrice, currentPrice, shares, marketValue, pnl, retPct };
    })
    .filter((p) => p.shares > 0);

  const totalMarketValue = positions.reduce((s, p) => s + p.marketValue, 0);
  const cash = INITIAL_CAPITAL_WL - positions.reduce((s, p) => s + (p.entryPrice ?? 0) * p.shares, 0);
  const inTradingHours = isJSTTradingHours();

  return (
    <div className="space-y-4">

      {/* ── A. 自选股实时监控卡片 ────────────────────────────────────────────── */}
      <div className="bg-[#1a2035] rounded-xl border border-slate-700/40">
        <div className="px-5 py-4 border-b border-slate-700/40">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-base font-semibold text-white">{t("portfolio.wl_realtime_title")}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{t("portfolio.wl_realtime_desc")}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {inTradingHours && (
                <span className="text-[10px] text-emerald-500 bg-emerald-900/30 px-2 py-0.5 rounded-full border border-emerald-800/40">
                  {t("portfolio.wl_auto_refreshing")}
                </span>
              )}
              {lastRefreshed && (
                <span className="text-[10px] text-slate-600">
                  {lastRefreshed.toLocaleTimeString("zh-CN", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              )}
              <button
                onClick={onRefresh}
                disabled={loading}
                className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-40 px-2 py-1 rounded bg-blue-900/20 hover:bg-blue-900/40 transition-colors"
              >
                ↻
              </button>
            </div>
          </div>
        </div>
        <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {displayItems.map((item) => (
            <WatchlistCard key={item.symbol} item={item} t={t} onDelete={handleDelete} />
          ))}
        </div>
      </div>

      {/* ── B. 实时模拟组合 ──────────────────────────────────────────────────── */}
      <div className="bg-[#1a2035] rounded-xl border border-slate-700/40">
        <div className="px-5 py-4 border-b border-slate-700/40">
          <h2 className="text-base font-semibold text-white">{t("portfolio.wl_section_simulate")}</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {t("portfolio.initial_capital_label")} {fmtNum(INITIAL_CAPITAL_WL)} · {t("portfolio.wl_simulate_rule")}
          </p>
        </div>
        {positions.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            自选股中暂无 BUY / STRONG_BUY 评级的股票，无法模拟建仓
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/40 text-xs text-slate-400">
                    <th className="text-left py-2.5 px-4">{t("common.symbol")}</th>
                    <th className="text-left py-2.5 px-3">{t("common.name")}</th>
                    <th className="text-right py-2.5 px-3">{t("portfolio.wl_sim_entry")}</th>
                    <th className="text-right py-2.5 px-3">{t("portfolio.wl_sim_current")}</th>
                    <th className="text-right py-2.5 px-3">{t("portfolio.snap_shares")}</th>
                    <th className="text-right py-2.5 px-3">{t("portfolio.snap_market_value")}</th>
                    <th className="text-right py-2.5 px-3">{t("portfolio.snap_pnl")}</th>
                    <th className="text-right py-2.5 px-3">{t("portfolio.snap_return_pct")}</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => (
                    <tr key={p.symbol} className="border-b border-slate-700/20 hover:bg-slate-800/30 transition-colors">
                      <td className="py-2.5 px-4">
                        <Link href={`/stocks/${encodeURIComponent(p.symbol)}`} className="font-mono text-blue-400 hover:text-blue-300 text-xs font-medium">
                          {p.symbol}
                        </Link>
                      </td>
                      <td className="py-2.5 px-3 text-slate-200 text-xs max-w-[120px] truncate">
                        {p.nameZh ?? p.name}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-xs text-slate-400">
                        {p.entryPrice != null ? `¥${p.entryPrice.toLocaleString("ja-JP")}` : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-xs text-slate-200">
                        {p.currentPrice != null ? `¥${p.currentPrice.toLocaleString("ja-JP")}` : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-xs text-slate-300">
                        {p.shares.toLocaleString("ja-JP")}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-xs text-slate-200 font-medium">
                        {fmtNum(Math.round(p.marketValue))}
                      </td>
                      <td className={`py-2.5 px-3 text-right tabular-nums text-xs font-medium ${returnColor(p.pnl)}`}>
                        {p.pnl != null ? `${p.pnl >= 0 ? "+" : ""}${fmtNum(Math.round(p.pnl))}` : "—"}
                      </td>
                      <td className={`py-2.5 px-3 text-right tabular-nums text-xs font-semibold ${returnColor(p.retPct)}`}>
                        {p.retPct != null ? `${p.retPct >= 0 ? "+" : ""}${p.retPct.toFixed(2)}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 border-t border-slate-700/40 flex flex-wrap gap-6 text-xs text-slate-500">
              <span>已建仓：<span className="text-slate-200 font-medium">{fmtNum(Math.round(totalMarketValue))}</span></span>
              <span>现金：<span className="text-slate-400">{fmtNum(Math.round(cash))}</span></span>
              <span>持仓：<span className="text-slate-300">{positions.length}</span></span>
              <span className="ml-auto italic">{t("portfolio.simulate_disclaimer")}</span>
            </div>
          </>
        )}
      </div>

      {/* ── C. AI评分明细（折叠）──────────────────────────────────────────────── */}
      <div className="bg-[#1a2035] rounded-xl border border-slate-700/40">
        <button
          className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-slate-800/30 transition-colors rounded-xl"
          onClick={() => setShowScoreDetail((v) => !v)}
        >
          <h2 className="text-base font-semibold text-white">{t("portfolio.wl_score_detail_title")}</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">{displayItems.length} {t("portfolio.wl_count_unit")}</span>
            <span className="text-slate-500 text-sm">{showScoreDetail ? "▲" : "▼"}</span>
          </div>
        </button>
        {showScoreDetail && (
          <div className="border-t border-slate-700/40 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/40 text-xs text-slate-400">
                  <th className="text-left py-2.5 px-4">{t("common.symbol")}</th>
                  <th className="text-left py-2.5 px-3">{t("common.name")}</th>
                  <th className="text-right py-2.5 px-3">AI</th>
                  <th className="text-center py-2.5 px-3">{t("backtest.col_rating")}</th>
                  <th className="text-right py-2.5 px-3">技术</th>
                  <th className="text-right py-2.5 px-3">基本</th>
                  <th className="text-right py-2.5 px-3">5D</th>
                  <th className="text-right py-2.5 px-3">20D</th>
                </tr>
              </thead>
              <tbody>
                {displayItems.map((w) => (
                  <tr key={w.symbol} className="border-b border-slate-700/20 hover:bg-slate-800/30 transition-colors">
                    <td className="py-2.5 px-4">
                      <Link href={`/stocks/${encodeURIComponent(w.symbol)}`} className="font-mono text-blue-400 hover:text-blue-300 text-xs font-medium">
                        {w.symbol}
                      </Link>
                    </td>
                    <td className="py-2.5 px-3 text-slate-200 text-xs max-w-[120px] truncate">{w.nameZh ?? w.name}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-xs text-slate-200 font-medium">
                      {w.score ? w.score.finalScore.toFixed(1) : "—"}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {w.score?.effectiveRating ? (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${wlSuggestion(w.score.effectiveRating).cls}`}>
                          {w.score.effectiveRating}
                        </span>
                      ) : <span className="text-slate-500 text-xs">—</span>}
                    </td>
                    <td className="py-2.5 px-3 text-right text-xs text-slate-300 tabular-nums">{w.score?.technicalScore?.toFixed(0) ?? "—"}</td>
                    <td className="py-2.5 px-3 text-right text-xs text-slate-300 tabular-nums">{w.score?.fundamentalScore?.toFixed(0) ?? "—"}</td>
                    <td className={`py-2.5 px-3 text-right tabular-nums text-xs ${returnColor(w.score?.return5d ?? null)}`}>
                      {w.score?.return5d != null ? `${w.score.return5d > 0 ? "+" : ""}${w.score.return5d.toFixed(1)}%` : "—"}
                    </td>
                    <td className={`py-2.5 px-3 text-right tabular-nums text-xs ${returnColor(w.score?.return20d ?? null)}`}>
                      {w.score?.return20d != null ? `${w.score.return20d > 0 ? "+" : ""}${w.score.return20d.toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── D. 调仓建议 ──────────────────────────────────────────────────────── */}
      <div className="bg-[#1a2035] rounded-xl border border-slate-700/40">
        <div className="px-5 py-4 border-b border-slate-700/40">
          <h2 className="text-base font-semibold text-white">{t("portfolio.wl_section_adjust")}</h2>
        </div>
        <div className="divide-y divide-slate-700/20">
          {displayItems.map((w) => {
            const sugg = wlSuggestion(w.score?.effectiveRating ?? null);
            return (
              <div key={w.symbol} className="flex items-center justify-between px-5 py-3 hover:bg-slate-800/30 transition-colors">
                <div className="flex items-center gap-3">
                  <Link href={`/stocks/${encodeURIComponent(w.symbol)}`} className="font-mono text-blue-400 hover:text-blue-300 text-xs font-medium">
                    {w.symbol}
                  </Link>
                  <span className="text-xs text-slate-300 max-w-[180px] truncate">{w.nameZh ?? w.name}</span>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${sugg.cls}`}>
                  {t(sugg.labelKey)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const { t } = useI18n();

  const [activeTab, setActiveTab] = useState<TabKey>("system");
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [trend, setTrend] = useState<TrendData | null>(null);
  const [history, setHistory] = useState<HistoryData | null>(null);

  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingTrend, setLoadingTrend] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [errorSummary, setErrorSummary] = useState(false);

  const [trendWindow, setTrendWindow] = useState<WindowKey>("ALL");

  // Watchlist portfolio state
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[] | null>(null);
  const [loadingWatchlist, setLoadingWatchlist] = useState(false);
  const [watchlistLoaded, setWatchlistLoaded] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoadingSummary(true);
    setLoadingTrend(true);
    setLoadingHistory(true);
    setErrorSummary(false);

    fetch("/api/portfolio/summary")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d: PortfolioSummary) => { setSummary(d); setLoadingSummary(false); })
      .catch(() => { setErrorSummary(true); setLoadingSummary(false); });

    fetch("/api/portfolio/trend")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d: TrendData) => { setTrend(d); setLoadingTrend(false); })
      .catch(() => setLoadingTrend(false));

    fetch("/api/portfolio/history")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d: HistoryData) => { setHistory(d); setLoadingHistory(false); })
      .catch(() => setLoadingHistory(false));
  }, []);

  const fetchWatchlist = useCallback(() => {
    setLoadingWatchlist(true);
    fetch("/api/watchlist")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d: WatchlistItem[]) => { setWatchlistItems(d); setWatchlistLoaded(true); setLoadingWatchlist(false); })
      .catch(() => { setWatchlistItems([]); setWatchlistLoaded(true); setLoadingWatchlist(false); });
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Lazy-load watchlist data on first tab switch
  useEffect(() => {
    if (activeTab === "watchlist" && !watchlistLoaded) fetchWatchlist();
  }, [activeTab, watchlistLoaded, fetchWatchlist]);

  // trend.maxDrawdown is always a number (negative = drawdown, 0 = no data / flat)
  const maxDrawdown: number | null = trend ? trend.maxDrawdown : null;
  const windows: WindowKey[] = ["7D", "30D", "90D", "ALL"];

  const TABS: { key: TabKey; label: MessageKey }[] = [
    { key: "system",    label: "portfolio.tab_system"    },
    { key: "watchlist", label: "portfolio.tab_watchlist" },
  ];

  return (
    <div className="p-4 md:p-6 max-w-6xl bg-[#0f172a] min-h-screen">

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-white">{t("portfolio.ai_title")}</h1>
      </div>

      {/* ── Tab bar ─────────────────────────────────────────────────────────── */}
      <div className="flex border-b border-slate-700/40 mb-0">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-5 py-2.5 text-sm font-medium transition-colors relative ${
              activeTab === key
                ? "text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {t(label)}
            {activeTab === key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-t-full" />
            )}
          </button>
        ))}
      </div>

      {/* ── Tab description ─────────────────────────────────────────────────── */}
      <div className="px-1 py-3 mb-5">
        <p className="text-xs text-slate-500 leading-relaxed">
          {activeTab === "system"
            ? t("portfolio.tab_system_desc")
            : t("portfolio.tab_watchlist_desc")}
        </p>
      </div>

      {/* ── System AI Portfolio ──────────────────────────────────────────────── */}
      {activeTab === "system" && (
        <>
          {/* Loading */}
          {loadingSummary && !errorSummary && <Skeleton />}

          {/* Error */}
          {errorSummary && !summary && (
            <div className="bg-[#1a2035] rounded-xl p-12 text-center border border-slate-700/40">
              <div className="text-slate-400 mb-4">{t("portfolio.loading_error")}</div>
              <button
                onClick={fetchAll}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
              >
                {t("portfolio.retry")}
              </button>
            </div>
          )}

          {/* No data */}
          {!loadingSummary && !errorSummary && !summary && (
            <div className="bg-[#1a2035] rounded-xl p-12 text-center border border-slate-700/40">
              <div className="text-slate-400">{t("portfolio.no_data")}</div>
            </div>
          )}

          {/* Content */}
          {summary && (
            <>
              {/* System meta row */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <p className="text-sm font-medium text-slate-300">{t("portfolio.system_subtitle")}</p>
                  <div className="flex flex-wrap gap-4 mt-0.5 text-xs text-slate-500">
                    <span>{t("portfolio.initial_capital_label")}：{summary.initialCapital.toLocaleString("ja-JP")}</span>
                    <span>{t("portfolio.cohort_date_label")}：{summary.cohortDate}</span>
                  </div>
                </div>
                <span className="text-[11px] text-slate-500 bg-slate-800/60 px-3 py-1 rounded-full border border-slate-700/40">
                  {t("portfolio.simulate_disclaimer")}
                </span>
              </div>

              {/* ── 6 KPI Cards (7-col grid) ─────────────────────────────────── */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3 mb-6">
                {/* Assets: 2 cols wide on desktop */}
                <div className="col-span-2 md:col-span-1 lg:col-span-2">
                  <AssetCard
                    label={t("portfolio.current_assets")}
                    value={fmtNum(summary.currentValue)}
                    sub={`${t("portfolio.initial_capital_label")}：${summary.initialCapital.toLocaleString("ja-JP")}`}
                  />
                </div>
                <KPICard
                  label={t("portfolio.cumulative_return")}
                  value={fmtPct(summary.returnPct)}
                  valueClass={returnColor(summary.returnPct)}
                />
                <KPICard
                  label="TOPIX ETF"
                  value={fmtPct(summary.topixReturnPct)}
                  valueClass={returnColor(summary.topixReturnPct)}
                  sub="1306.T"
                />
                <KPICard
                  label={t("portfolio.alpha")}
                  value={fmtPct(summary.alpha)}
                  valueClass={returnColor(summary.alpha)}
                />
                <KPICard
                  label={t("backtest.win_rate")}
                  value={summary.winRate != null ? `${summary.winRate.toFixed(1)}%` : "—"}
                  valueClass="text-blue-400"
                />
                <KPICard
                  label={t("portfolio.max_drawdown")}
                  value={maxDrawdown != null ? `${maxDrawdown.toFixed(2)}%` : loadingTrend ? "…" : "—"}
                  valueClass={maxDrawdown != null && maxDrawdown < -5 ? "text-red-400" : "text-slate-300"}
                />
              </div>

              {/* ── Holdings Table ────────────────────────────────────────────── */}
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
                          <td className="py-2.5 px-3 text-slate-200 text-xs max-w-[140px] truncate">{pos.name}</td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-xs text-slate-300">
                            {pos.entryPrice != null
                              ? `¥${pos.entryPrice.toLocaleString("ja-JP")}`
                              : <span className="text-slate-500">{t("portfolio.pending_entry")}</span>}
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
                          <td className="py-2.5 px-3 text-center"><RatingBadge rating={pos.gptRating} /></td>
                          <td className="py-2.5 px-3 text-center"><SuggestionBadge suggestion={pos.aiSuggestion} t={t} /></td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-xs text-slate-500">
                            {pos.daysHeld != null ? pos.daysHeld : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── Trend Chart ───────────────────────────────────────────────── */}
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
                  <TrendChart data={trend} loading={loadingTrend} window={trendWindow} t={t} />
                </div>
              </div>

              {/* ── History Table ─────────────────────────────────────────────── */}
              <div className="bg-[#1a2035] rounded-xl border border-slate-700/40 mb-6">
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

              {/* ── AI Snapshots ──────────────────────────────────────────────── */}
              <SnapshotsPanel t={t} />
            </>
          )}
        </>
      )}

      {/* ── My Watchlist Portfolio ────────────────────────────────────────────── */}
      {activeTab === "watchlist" && (
        <WatchlistPanel items={watchlistItems} loading={loadingWatchlist} t={t} onRefresh={fetchWatchlist} />
      )}

    </div>
  );
}
