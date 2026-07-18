"use client";

import { useEffect, useState } from "react";
import { buildStockUrl } from "@/lib/navigation/back";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { localeSector } from "@/lib/i18n/market-labels";
import { getPrimaryName } from "@/lib/company-name";
import { getRec, getRecommendationLabel, returnColorClass } from "@/lib/rec-config";

type SectorStat = {
  sector: string;
  count: number;
  avgAdaptiveScore: number | null;
  avgTechnicalScore: number | null;
  avgFundamentalScore: number | null;
  avgRiskScore: number | null;
  avgReturn5d: number | null;
  avgReturn20d: number | null;
  avgReturn60d: number | null;
  buyCount: number;
  watchCount: number;
  avoidCount: number;
  buyRate: number;
  top3: { symbol: string; name: string; nameZh: string | null; nameEn: string | null; adaptiveScore: number | null; recommendationV2: string | null }[];
};

type ApiResponse = {
  totalScored: number;
  sectors: SectorStat[];
  computedAt: string;
};

type SortKey = "avgAdaptiveScore" | "avgReturn20d" | "buyRate" | "count";

function RetBadge({ val }: { val: number | null }) {
  if (val == null) return <span className="text-slate-300 text-xs">—</span>;
  const up = val >= 0;
  return (
    <span className={`text-xs font-medium tabular-nums ${returnColorClass(val)}`}>
      {up ? "▲" : "▼"}{Math.abs(val).toFixed(1)}%
    </span>
  );
}

function ScoreHeat({ score }: { score: number | null }) {
  if (score == null) return <span className="text-slate-300">—</span>;
  const color =
    score >= 80 ? "text-red-600 font-bold"
    : score >= 70 ? "text-orange-600 font-semibold"
    : score >= 60 ? "text-yellow-600"
    : score >= 50 ? "text-slate-600"
    : "text-blue-500";
  return <span className={`tabular-nums text-sm ${color}`}>{score}</span>;
}


export default function SectorsPage() {
  const { t, lang } = useI18n();
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("avgAdaptiveScore");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/sectors")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="text-slate-400 text-sm animate-pulse">{t("common.loading")}</div>
      </div>
    );
  }
  if (!data) {
    return <div className="p-6 text-red-500">{t("common.load_error")}</div>;
  }

  const { sectors } = data;

  const sorted = [...sectors].sort((a, b) => {
    const av = (a[sortKey] ?? -999) as number;
    const bv = (b[sortKey] ?? -999) as number;
    return bv - av;
  });

  // Top/bottom performers
  const top = sorted.slice(0, 5);
  const bottom = [...sorted].reverse().slice(0, 3);

  return (
    <div className="p-6 max-w-[1400px]">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{t("sectors.title")}</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {sectors.length}{t("sectors.unit_sector")}　{data.totalScored.toLocaleString()}{t("sectors.unit_stock_suffix")}
          　{new Date(data.computedAt).toLocaleString(lang === "ja-JP" ? "ja-JP" : "zh-CN")}
        </p>
      </div>

      {/* Summary cards – top sectors */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-700">{t("sectors.hot")} TOP5</h2>
          <Link href="/screener" className="text-xs text-blue-600 hover:underline">
            {t("sectors.screener_link")}
          </Link>
        </div>
        <div className="grid grid-cols-5 gap-3">
          {top.map((sec, i) => (
            <div
              key={sec.sector}
              className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 cursor-pointer hover:border-blue-300 transition-colors"
              onClick={() => setExpanded(expanded === sec.sector ? null : sec.sector)}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-slate-400 text-xs font-mono">#{i + 1}</span>
                <span className="text-xs text-slate-500 truncate">{localeSector(sec.sector, lang)}</span>
              </div>
              <div className="text-2xl font-bold tabular-nums text-slate-900">
                {sec.avgAdaptiveScore ?? "—"}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">{t("sectors.avg_score")}</div>
              <div className="mt-2 flex gap-1 text-[10px]">
                <span className="bg-red-50 text-red-600 px-1 rounded">{t("sectors.buy_count")} {sec.buyCount}</span>
                <span className="bg-yellow-50 text-yellow-600 px-1 rounded">{getRecommendationLabel("WATCH", lang)} {sec.watchCount}</span>
                <span className="bg-slate-100 text-slate-500 px-1 rounded">{sec.count}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom performers */}
      {bottom.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">{t("sectors.weak")}</h2>
          <div className="grid grid-cols-3 gap-3">
            {bottom.map((sec) => (
              <div key={sec.sector} className="bg-blue-50 rounded-xl border border-blue-100 p-4">
                <div className="text-xs text-blue-600 font-medium mb-1">{localeSector(sec.sector, lang)}</div>
                <div className="text-xl font-bold tabular-nums text-blue-700">
                  {sec.avgAdaptiveScore ?? "—"}
                </div>
                <div className="text-[10px] text-blue-500 mt-0.5">{t("sectors.avg_score")}</div>
                <div className="mt-1 text-xs text-blue-500">
                  {t("sectors.avg_20d")}: <RetBadge val={sec.avgReturn20d} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sort controls */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs text-slate-500">{t("common.filter")}：</span>
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {[
            { k: "avgAdaptiveScore" as const, label: t("sectors.avg_score") },
            { k: "avgReturn20d" as const, label: t("sectors.avg_20d") },
            { k: "buyRate" as const, label: t("sectors.buy_rate") },
            { k: "count" as const, label: t("sectors.stock_count") },
          ].map(({ k, label }) => (
            <button
              key={k}
              onClick={() => setSortKey(k)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                sortKey === k
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Full Sector Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100 text-left text-xs text-slate-400">
              <th className="px-4 py-3 font-medium w-6 text-center">#</th>
              <th className="px-4 py-3 font-medium">{t("common.sector")}</th>
              <th className="px-3 py-3 font-medium text-center">{t("sectors.stock_count")}</th>
              <th className="px-3 py-3 font-medium text-right">{t("sectors.avg_score")}</th>
              <th className="px-3 py-3 font-medium text-right">{t("dim.technical")}</th>
              <th className="px-3 py-3 font-medium text-right">{t("dim.fundamental")}</th>
              <th className="px-3 py-3 font-medium text-right">{t("dim.money_flow")}</th>
              <th className="px-3 py-3 font-medium text-right">{t("stock.20d_return")}</th>
              <th className="px-3 py-3 font-medium text-right">{t("stock.60d_return")}</th>
              <th className="px-3 py-3 font-medium text-center">{t("sectors.buy_count")}</th>
              <th className="px-3 py-3 font-medium text-center">{t("sectors.buy_rate")}</th>
              <th className="px-3 py-3 font-medium">{t("sectors.top_stocks")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {sorted.map((sec, idx) => {
              const isExp = expanded === sec.sector;
              return (
                <>
                  <tr
                    key={sec.sector}
                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                    onClick={() => setExpanded(isExp ? null : sec.sector)}
                  >
                    <td className="px-4 py-2.5 text-center text-xs text-slate-300 tabular-nums">{idx + 1}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-900">{localeSector(sec.sector, lang)}</td>
                    <td className="px-3 py-2.5 text-center text-xs text-slate-500 tabular-nums">{sec.count}</td>
                    <td className="px-3 py-2.5 text-right">
                      <ScoreHeat score={sec.avgAdaptiveScore} />
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs text-blue-600 font-medium tabular-nums">
                      {sec.avgTechnicalScore ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs text-emerald-600 font-medium tabular-nums">
                      {sec.avgFundamentalScore ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs text-violet-600 font-medium tabular-nums">
                      {sec.avgRiskScore ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <RetBadge val={sec.avgReturn20d} />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <RetBadge val={sec.avgReturn60d} />
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs tabular-nums">
                      <span className="text-red-500 font-medium">{sec.buyCount}</span>
                      <span className="text-slate-300 mx-1">/</span>
                      <span className="text-slate-400">{sec.count}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <div className="flex items-center gap-1.5 justify-center">
                        <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-red-400"
                            style={{ width: `${sec.buyRate}%` }}
                          />
                        </div>
                        <span className="text-xs tabular-nums text-slate-600">{sec.buyRate}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1 flex-wrap">
                        {sec.top3.map((tk) => {
                          const rc = getRec(tk.recommendationV2 ?? "");
                          return (
                            <Link
                              key={tk.symbol}
                              href={buildStockUrl(tk.symbol, "sectors", "/sectors")}
                              onClick={(e) => e.stopPropagation()}
                              className={`text-[10px] hover:underline ${rc.text}`}
                              title={tk.name}
                            >
                              {tk.symbol.replace(".T", "")}
                              {tk.adaptiveScore != null && <span className="text-slate-400">({tk.adaptiveScore})</span>}
                            </Link>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                  {isExp && (
                    <tr key={`${sec.sector}-detail`}>
                      <td colSpan={12} className="px-6 py-3 bg-slate-50 border-b border-slate-100">
                        <div className="text-xs text-slate-500 mb-1 font-medium">
                          {localeSector(sec.sector, lang)} — {t("sectors.top_stocks")}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {sec.top3.map((topStock) => {
                            const rc = getRec(topStock.recommendationV2 ?? "");
                            return (
                              <Link
                                key={topStock.symbol}
                                href={buildStockUrl(topStock.symbol, "sectors", "/sectors")}
                                className={`text-xs px-2 py-1 rounded border border-slate-200 bg-white hover:border-blue-300 ${rc.text}`}
                              >
                                {getPrimaryName(topStock, lang)}（{topStock.adaptiveScore}）
                              </Link>
                            );
                          })}
                          <Link
                            href={`/screener?sector=${encodeURIComponent(sec.sector)}`}
                            className="text-xs px-2 py-1 rounded border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100"
                          >
                            {t("home.view_all")} →
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
