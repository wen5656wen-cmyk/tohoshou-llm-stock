"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { fmtJpy } from "@/lib/rec-config";

type HorizonStat = {
  winRate: number | null;
  avgReturn: number | null;
  filled: number;
  date: string;
} | null;

type PickEntry = {
  symbol: string;
  return30d: number | null;
  gptRank: number;
  buyPrice: number | null;
  date: string;
};

type CohortEntry = {
  symbol: string;
  gptRank: number;
  finalScore: number;
  gptRating: string | null;
  buyPrice: number | null;
  return7d: number | null;
  return30d: number | null;
  return90d: number | null;
  summaryZh: string | null;
};

type Summary = {
  cohortCount: number;
  horizons: { "7d": HorizonStat; "30d": HorizonStat; "90d": HorizonStat };
  topWinners: PickEntry[];
  topLosers: PickEntry[];
  latestCohort: CohortEntry[];
  latestDate: string | null;
};

function ReturnBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-slate-400 text-xs">—</span>;
  const color = value > 0 ? "text-emerald-400" : value < 0 ? "text-red-400" : "text-slate-400";
  return <span className={`font-mono text-sm ${color}`}>{value > 0 ? "+" : ""}{value.toFixed(2)}%</span>;
}

function HorizonCard({
  label, stat,
  lblNoData, lblWinRate, lblAvgReturn, lblFilled, lblAsOf,
}: {
  label: string;
  stat: HorizonStat;
  lblNoData: string;
  lblWinRate: string;
  lblAvgReturn: string;
  lblFilled: string;
  lblAsOf: string;
}) {
  if (!stat) {
    return (
      <div className="bg-[#1a2035] rounded-xl p-5 border border-slate-700/40">
        <div className="text-slate-400 text-sm mb-1">{label}</div>
        <div className="text-slate-500 text-xs">{lblNoData}</div>
      </div>
    );
  }
  const winColor = stat.winRate != null && stat.winRate >= 55 ? "text-emerald-400" : "text-yellow-400";
  const retColor = stat.avgReturn != null && stat.avgReturn > 0 ? "text-emerald-400" : "text-red-400";
  return (
    <div className="bg-[#1a2035] rounded-xl p-5 border border-slate-700/40">
      <div className="text-slate-300 text-sm font-medium mb-3">{label}</div>
      <div className="flex gap-6">
        <div>
          <div className="text-slate-500 text-xs mb-0.5">{lblWinRate}</div>
          <div className={`text-2xl font-bold ${winColor}`}>
            {stat.winRate != null ? `${stat.winRate.toFixed(1)}%` : "—"}
          </div>
        </div>
        <div>
          <div className="text-slate-500 text-xs mb-0.5">{lblAvgReturn}</div>
          <div className={`text-2xl font-bold ${retColor}`}>
            {stat.avgReturn != null ? `${stat.avgReturn > 0 ? "+" : ""}${stat.avgReturn.toFixed(2)}%` : "—"}
          </div>
        </div>
        <div>
          <div className="text-slate-500 text-xs mb-0.5">{lblFilled}</div>
          <div className="text-2xl font-bold text-slate-200">{stat.filled}</div>
        </div>
      </div>
      <div className="mt-2 text-slate-600 text-xs">{lblAsOf} {new Date(stat.date).toLocaleDateString()}</div>
    </div>
  );
}

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
          {/* Horizon stat cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {(["7d", "30d", "90d"] as const).map((h) => (
              <HorizonCard
                key={h}
                label={t(`backtest.horizon_${h}` as "backtest.horizon_7d")}
                stat={data.horizons[h]}
                lblNoData={t("backtest.no_data")}
                lblWinRate={t("backtest.win_rate")}
                lblAvgReturn={t("backtest.avg_return")}
                lblFilled={t("backtest.filled")}
                lblAsOf={t("backtest.as_of")}
              />
            ))}
          </div>

          {/* Tab switcher */}
          <div className="flex gap-2 mb-4">
            {(["latest", "winners", "losers"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  tab === k ? "bg-blue-600 text-white" : "bg-[#1a2035] text-slate-400 hover:text-white border border-slate-700/40"
                }`}
              >
                {t(k === "latest" ? "backtest.latest_picks" : k === "winners" ? "backtest.top_winners" : "backtest.top_losers")}
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
                    <th className="px-4 py-3 text-right">{t("backtest.col_buy_price")}</th>
                    <th className="px-4 py-3 text-right">{t("backtest.col_ret7d")}</th>
                    <th className="px-4 py-3 text-right">{t("backtest.col_ret30d")}</th>
                    <th className="px-4 py-3 text-right">{t("backtest.col_ret90d")}</th>
                    <th className="px-4 py-3 text-left hidden xl:table-cell">{t("backtest.col_summary")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.latestCohort.map((row) => (
                    <tr key={row.symbol} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 text-slate-400 font-mono text-xs">{row.gptRank}</td>
                      <td className="px-4 py-3">
                        <Link href={`/stocks/${row.symbol}`} className="text-blue-400 hover:text-blue-300 font-medium">
                          {row.symbol}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-white">{row.finalScore.toFixed(1)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                          row.gptRating === "STRONG_BUY" ? "bg-emerald-900/60 text-emerald-400" :
                          row.gptRating === "BUY"        ? "bg-blue-900/60 text-blue-400" :
                          "bg-slate-700/60 text-slate-300"
                        }`}>
                          {row.gptRating ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-300 font-mono text-xs">
                        {row.buyPrice ? fmtJpy(row.buyPrice) : "—"}
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
                    <th className="px-4 py-3 text-right">{t("backtest.col_buy_price")}</th>
                    <th className="px-4 py-3 text-right">{t("backtest.col_ret30d")}</th>
                    <th className="px-4 py-3 text-right">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {(tab === "winners" ? data.topWinners : data.topLosers).map((row, i) => (
                    <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/stocks/${row.symbol}`} className="text-blue-400 hover:text-blue-300 font-medium">
                          {row.symbol}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-400 font-mono text-xs">#{row.gptRank}</td>
                      <td className="px-4 py-3 text-right text-slate-300 font-mono text-xs">
                        {row.buyPrice ? fmtJpy(row.buyPrice) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right"><ReturnBadge value={row.return30d} /></td>
                      <td className="px-4 py-3 text-right text-slate-500 text-xs">
                        {new Date(row.date).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
