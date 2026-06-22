"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { fmtJpy } from "@/lib/rec-config";

// ── Types ─────────────────────────────────────────────────────────────────────

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

// Compact stat cell for the portfolio comparison table
function StatCell({ stat, labelWin, labelAvg }: {
  stat: HorizonStat;
  labelWin: string;
  labelAvg: string;
}) {
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
      <td className="px-2 py-2 text-right">
        <ExcessBadge value={stat.excessVsNikkei} />
      </td>
      <td className="px-2 py-2 text-right">
        <ExcessBadge value={stat.excessVsTopix} />
      </td>
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BacktestPage() {
  const { t } = useI18n();
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"latest" | "winners" | "losers">("latest");

  useEffect(() => {
    fetch("/api/backtest/summary")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  const PORTFOLIO_SIZES = ["TOP5", "TOP10", "TOP20", "ALL"] as const;
  const HORIZONS = ["7d", "30d", "90d"] as const;

  // ALL portfolio stats for the horizon stat cards (backward compat)
  const allP = data?.portfolios?.["ALL"];

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">{t("backtest.title")}</h1>
        <p className="text-slate-400 text-sm mt-1">{t("backtest.subtitle")}</p>
        {data && (
          <p className="text-slate-500 text-xs mt-1">
            {t("backtest.cohorts")}: {data.cohortCount}
          </p>
        )}
      </div>

      {loading && (
        <div className="text-slate-400 text-sm animate-pulse py-16 text-center">Loading…</div>
      )}

      {!loading && !data?.latestDate && (
        <div className="bg-[#1a2035] rounded-xl p-8 text-center text-slate-400 text-sm border border-slate-700/40">
          {t("backtest.no_data")}
        </div>
      )}

      {!loading && data && data.latestDate && (
        <>
          {/* Horizon stat cards (ALL portfolio) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {HORIZONS.map((h) => {
              const stat = allP?.[h] ?? null;
              if (!stat) {
                return (
                  <div key={h} className="bg-[#1a2035] rounded-xl p-5 border border-slate-700/40">
                    <div className="text-slate-400 text-sm mb-1">{t(`backtest.horizon_${h}` as "backtest.horizon_7d")}</div>
                    <div className="text-slate-500 text-xs">{t("backtest.no_data")}</div>
                  </div>
                );
              }
              const winColor = stat.winRate != null && stat.winRate >= 55 ? "text-emerald-400" : "text-yellow-400";
              const retColor = stat.avgReturn != null && stat.avgReturn > 0 ? "text-emerald-400" : "text-red-400";
              return (
                <div key={h} className="bg-[#1a2035] rounded-xl p-5 border border-slate-700/40">
                  <div className="text-slate-300 text-sm font-medium mb-3">{t(`backtest.horizon_${h}` as "backtest.horizon_7d")} · ALL 500</div>
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
                        {stat.avgReturn != null ? `${stat.avgReturn > 0 ? "+" : ""}${stat.avgReturn.toFixed(2)}%` : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 text-xs mb-0.5">{t("backtest.filled")}</div>
                      <div className="text-2xl font-bold text-slate-200">{stat.filled}</div>
                    </div>
                  </div>
                  <div className="mt-2 text-slate-600 text-xs">{t("backtest.as_of")} {new Date(stat.date).toLocaleDateString()}</div>
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
                      <span className="text-slate-400">{t(`backtest.horizon_${h}` as "backtest.horizon_7d")}</span>
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
                      {ps === "ALL" ? "ALL 500" : ps}
                    </td>
                    {HORIZONS.map((h) => (
                      <StatCell
                        key={h}
                        stat={data.portfolios?.[ps]?.[h] ?? null}
                        labelWin={t("backtest.win_rate")}
                        labelAvg={t("backtest.avg_return")}
                      />
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
                    : "backtest.top_losers"
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
