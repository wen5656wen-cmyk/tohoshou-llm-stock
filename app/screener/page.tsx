"use client";

import { useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import { buildStockUrl } from "@/lib/navigation/back";
import Link from "next/link";
import StockMobileCard from "@/components/StockMobileCard";
import { getRec, getRecommendationLabel, returnColorClass, fmtPct, fmtJpy } from "@/lib/rec-config";
import { useI18n } from "@/lib/i18n";
import { getPrimaryName } from "@/lib/company-name";

type Score = {
  symbol: string; name: string; nameZh: string | null; nameEn: string | null; market: string | null;
  sector: string | null;
  latestDate: string | null; latestClose: number | null;
  return5d: number | null; return20d: number | null;
  rsi14: number | null; maTrend: string | null; macdSignalLabel: string | null;
  technicalScore: number | null; fundamentalScore: number | null;
  moneyFlowScore: number | null; newsSentimentScore: number | null; globalTrendScore: number | null;
  totalScore: number | null;
  recommendation: string | null;
  scoreSource: string | null;
  adaptiveScore: number | null;
  stockStyle: string | null;
  highRiskFlag: boolean;
  percentileRank: number | null;
  marketRank: number | null;
  recommendationV2: string | null;
  opportunityScore: number | null;
  opportunityLabel: string | null;
  tradingAction?: string | null;
  positionSizePct?: number | null;
};

type Stats = {
  total: number;
  strongBuy: number; buy: number; hold: number; watch: number; avoid: number;
  bullCount: number; bullRate: number;
  marketTemperature: string;
  lastComputedAt: string | null;
};

type ApiResponse = { stats: Stats; scores: Score[] };

const STYLE_KEYS = ["QUALITY_COMPOUNDER", "GROWTH_MOMENTUM", "CYCLICAL_EXPORTER", "VALUE_DEFENSIVE", "DOMESTIC_DEFENSIVE", "SPECULATIVE_MOMENTUM"] as const;

function MktChip({ mkt }: { mkt: string | null }) {
  if (!mkt) return null;
  const label = mkt.includes("プライム") ? "P" : mkt.includes("スタンダード") ? "S" : mkt.includes("グロース") ? "G" : "?";
  const cls = label === "P" ? "bg-violet-100 text-violet-700"
    : label === "S" ? "bg-blue-100 text-blue-700"
    : "bg-emerald-100 text-emerald-700";
  return <span className={`text-[10px] font-bold px-1 py-0.5 rounded ${cls}`}>{label}</span>;
}

type SortKey = "adaptiveScore" | "totalScore" | "opportunityScore" | "percentileRank" | "return20d" | "rsi14" | "gptScore" | "finalScore";

type GptSummary = {
  symbol: string;
  gptScore: number;
  finalScore: number;
  confidence: string;
  action: string;
  summaryZh: string;
  summaryJa: string;
  summaryEn: string;
  updatedAt: string;
};

export default function ScreenerPage() {
  const { t, lang } = useI18n();
  useScrollRestoration("screener");
  const pathname = usePathname();
  const [data, setData] = useState<ApiResponse | null>(null);
  const [searchData, setSearchData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gptMap, setGptMap] = useState<Map<string, GptSummary>>(new Map());
  const [recFilter, setRecFilter] = useState("ALL");
  const [styleFilter, setStyleFilter] = useState("ALL");
  const [mktFilter, setMktFilter] = useState("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("adaptiveScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "200", sort: "adaptiveScore" });
    fetch(`/api/screener?${params}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch("/api/gpt-score")
      .then((r) => r.json())
      .then((rows: GptSummary[]) => {
        if (Array.isArray(rows)) {
          setGptMap(new Map(rows.map((r) => [r.symbol, r])));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!search.trim()) {
      setSearchData(null);
      return;
    }
    setSearchLoading(true);
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q: search.trim(), sort: sortKey });
      fetch(`/api/screener?${params}`)
        .then((r) => r.json())
        .then((d) => { setSearchData(d); setSearchLoading(false); })
        .catch(() => setSearchLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [search, sortKey]);

  if (loading) return (
    <div className="p-6 flex items-center justify-center h-64">
      <div className="text-slate-400 text-sm animate-pulse">{t("common.loading")}</div>
    </div>
  );
  if (error || !data) return (
    <div className="p-6">
      <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-red-700 text-sm">{error}</div>
    </div>
  );

  const activeData = (search.trim() && searchData) ? searchData : data;
  const { stats, scores } = activeData;

  let filtered = scores.filter((s) => {
    const rv2 = s.recommendationV2 ?? "HOLD";
    if (recFilter !== "ALL" && rv2 !== recFilter) return false;
    if (styleFilter !== "ALL" && s.stockStyle !== styleFilter) return false;
    if (mktFilter === "Prime"    && !s.market?.includes("プライム")) return false;
    if (mktFilter === "Standard" && !s.market?.includes("スタンダード")) return false;
    if (mktFilter === "Growth"   && !s.market?.includes("グロース")) return false;
    return true;
  });

  filtered = [...filtered].sort((a, b) => {
    let av: number, bv: number;
    if (sortKey === "percentileRank") {
      av = a.percentileRank ?? 999;
      bv = b.percentileRank ?? 999;
      return sortDir === "asc" ? av - bv : bv - av;
    }
    if (sortKey === "gptScore") {
      av = gptMap.get(a.symbol)?.gptScore ?? -999;
      bv = gptMap.get(b.symbol)?.gptScore ?? -999;
      return sortDir === "desc" ? bv - av : av - bv;
    }
    if (sortKey === "finalScore") {
      av = gptMap.get(a.symbol)?.finalScore ?? -999;
      bv = gptMap.get(b.symbol)?.finalScore ?? -999;
      return sortDir === "desc" ? bv - av : av - bv;
    }
    av = (a[sortKey] as number | null) ?? -999;
    bv = (b[sortKey] as number | null) ?? -999;
    return sortDir === "desc" ? bv - av : av - bv;
  });

  const buyCount = filtered.filter((s) => s.recommendationV2 === "STRONG_BUY" || s.recommendationV2 === "BUY").length;

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir(key === "percentileRank" ? "asc" : "desc"); }
  }

  const hasGptScores = gptMap.size > 0;

  function ThBtn({ col, label }: { col: SortKey; label: string }) {
    const active = sortKey === col;
    return (
      <th
        className={`px-2 py-2.5 font-medium text-right cursor-pointer select-none whitespace-nowrap hover:text-slate-700 ${active ? "text-blue-600" : ""}`}
        onClick={() => toggleSort(col)}
      >
        {label}{active ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
      </th>
    );
  }

  const DIST = [
    { key: "STRONG_BUY", val: stats.strongBuy },
    { key: "BUY",        val: stats.buy },
    { key: "HOLD",       val: stats.hold },
    { key: "WATCH",      val: stats.watch },
    { key: "AVOID",      val: stats.avoid },
  ];

  return (
    <div className="p-4 md:p-6 max-w-[1500px]">
      <div className="mb-4">
        <h1 className="text-[32px] font-bold text-slate-900 leading-tight">{t("screener.title")}</h1>
        <p className="text-xs text-blue-600 font-medium mt-0.5 mb-1">{t("screener.combined_description")}</p>
        <p className="text-sm font-medium text-slate-500 mt-1">
          {t(`temp.${stats.marketTemperature}` as Parameters<typeof t>[0]) ?? stats.marketTemperature}
          　{t("screener.bull_count")} {stats.bullCount} ({stats.bullRate}%)　{stats.total} {t("screener.result_count")}
          {stats.lastComputedAt && `　${t("screener.updated")}: ${new Date(stats.lastComputedAt).toLocaleString()}`}
        </p>
      </div>

      {/* Distribution chips */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {DIST.map((d) => {
          const rec = getRec(d.key);
          const active = recFilter === d.key;
          return (
            <div
              key={d.key}
              className={`bg-white rounded-2xl border shadow-sm p-3 text-center cursor-pointer transition-colors min-w-[80px] ${
                active ? `${rec.border} ${rec.bg}` : "border-slate-200 hover:border-slate-300"
              }`}
              onClick={() => setRecFilter(recFilter === d.key ? "ALL" : d.key)}
            >
              <div className={`text-xl font-bold tabular-nums ${rec.text}`}>{d.val}</div>
              <div className={`text-[10px] mt-0.5 font-semibold whitespace-nowrap ${rec.text}`}>{getRecommendationLabel(d.key, lang)}</div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto md:flex-wrap pb-1">
        {/* rec filter */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {(["ALL", "STRONG_BUY", "BUY", "WATCH", "HOLD", "AVOID"] as const).map((r) => {
            const rec = getRec(r);
            return (
              <button key={r} onClick={() => setRecFilter(r)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${recFilter === r ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                {r === "ALL" ? t("screener.all") : getRecommendationLabel(r, lang)}
              </button>
            );
          })}
        </div>

        {/* style filter */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {(["ALL", ...STYLE_KEYS] as const).map((s) => (
            <button key={s} onClick={() => setStyleFilter(s)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${styleFilter === s ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              {s === "ALL" ? t("screener.all_styles") : t(`style.short.${s}` as Parameters<typeof t>[0])}
            </button>
          ))}
        </div>

        {/* market filter */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {[{ k: "ALL", l: t("screener.all_markets") }, { k: "Prime", l: t("market.prime") }, { k: "Standard", l: t("market.standard") }, { k: "Growth", l: t("market.growth") }].map(({ k, l }) => (
            <button key={k} onClick={() => setMktFilter(k)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${mktFilter === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              {l}
            </button>
          ))}
        </div>

        <div className="relative">
          <input
            type="text"
            placeholder={t("screener.search_placeholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:border-blue-400 w-52"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 text-xs"
            >✕</button>
          )}
        </div>

        <span className="text-xs text-slate-400 ml-auto">
          {searchLoading ? (
            <span className="animate-pulse">{t("screener.searching")}</span>
          ) : search.trim() ? (
            `"${search}" → ${filtered.length} ${t("screener.result_count")}`
          ) : (
            `${filtered.length} ${t("screener.result_count")} · ${t("screener.bull_count")} ${buyCount}`
          )}
        </span>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden space-y-2 mb-4">
        {filtered.slice(0, 200).map((s, idx) => (
          <StockMobileCard key={s.symbol} s={s} rank={idx + 1} href={buildStockUrl(s.symbol, "screener", pathname)} />
        ))}
        {filtered.length === 0 && (
          <div className="py-12 text-center text-slate-400 text-sm">
            {searchLoading ? t("screener.searching") : t("screener.no_results")}
          </div>
        )}
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-left text-xs text-slate-400">
                <th className="px-3 py-2.5 font-medium w-6 text-right">#</th>
                <th className="px-3 py-2.5 font-medium">{t("screener.col_stock")}</th>
                <th className="px-2 py-2.5 font-medium">{t("screener.col_market")}</th>
                <th className="px-2 py-2.5 font-medium">{t("screener.col_style")}</th>
                <th className="px-3 py-2.5 font-medium text-right">{t("screener.col_price")}</th>
                <ThBtn col="return20d"        label={t("screener.col_20d")} />
                <ThBtn col="adaptiveScore"    label={t("screener.col_adaptive")} />
                <ThBtn col="percentileRank"   label={t("screener.col_percentile")} />
                <ThBtn col="opportunityScore" label={t("screener.col_opportunity")} />
                {hasGptScores && <ThBtn col="gptScore" label={t("screener.col_gpt_score")} />}
                {hasGptScores && <ThBtn col="finalScore" label={t("screener.col_final_score")} />}
                {hasGptScores && <th className="px-2 py-2.5 font-medium text-right">{t("screener.col_confidence")}</th>}
                <th className="px-2 py-2.5 font-medium text-right">{t("screener.col_tech")}</th>
                <th className="px-2 py-2.5 font-medium text-right">{t("screener.col_fund")}</th>
                <th className="px-2 py-2.5 font-medium text-right">{t("screener.col_flow")}</th>
                <th className="px-2 py-2.5 font-medium text-right">{t("screener.col_news")}</th>
                <ThBtn col="rsi14" label="RSI" />
                <th className="px-2 py-2.5 font-medium text-center">{t("screener.col_rating")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.slice(0, 200).map((s, idx) => {
                const rec = getRec(s.recommendationV2);
                const rsiColor = s.rsi14 == null ? "text-slate-400" : s.rsi14 >= 70 ? "text-red-500" : s.rsi14 <= 30 ? "text-emerald-500" : "text-slate-700";
                const pctRankLabel = s.percentileRank != null ? `${t("common.percentile_prefix")} ${s.percentileRank.toFixed(1)}%` : "—";

                return (
                  <tr key={s.symbol} className={`hover:bg-slate-50 transition-colors ${s.highRiskFlag ? "bg-red-50/30" : ""}`}>
                    <td className="px-3 py-2 text-right text-xs text-slate-300 tabular-nums">{idx + 1}</td>
                    <td className="px-3 py-2 min-w-[160px]">
                      <Link href={buildStockUrl(s.symbol, "screener", pathname)} className="block group">
                        <div className="text-[14px] font-bold text-slate-900 group-hover:text-blue-600 leading-tight">
                          {getPrimaryName(s, lang)}
                          {s.highRiskFlag && <span className="ml-1 text-[10px] text-red-400">⚠</span>}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">{s.symbol}</div>
                      </Link>
                    </td>
                    <td className="px-2 py-2"><MktChip mkt={s.market} /></td>
                    <td className="px-2 py-2">
                      {s.stockStyle ? (
                        <span className="text-[10px] px-1 py-0.5 rounded bg-slate-100 text-slate-500">{t(`style.short.${s.stockStyle}` as Parameters<typeof t>[0])}</span>
                      ) : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-sm font-medium text-slate-900">
                      {fmtJpy(s.latestClose)}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <span className={`text-xs font-medium tabular-nums ${returnColorClass(s.return20d)}`}>
                        {fmtPct(s.return20d)}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <span className={`text-sm font-bold tabular-nums ${rec.text}`}>
                        {s.adaptiveScore?.toFixed(0) ?? "—"}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right text-xs text-slate-500 tabular-nums">{pctRankLabel}</td>
                    <td className="px-2 py-2 text-right text-xs text-slate-500 tabular-nums">
                      {s.opportunityScore?.toFixed(1) ?? "—"}
                    </td>
                    {hasGptScores && (() => {
                      const gpt = gptMap.get(s.symbol);
                      const confColor = gpt?.confidence === "HIGH" ? "text-emerald-600" : gpt?.confidence === "MEDIUM" ? "text-amber-600" : "text-slate-400";
                      return (
                        <>
                          <td className="px-2 py-2 text-right text-xs tabular-nums">
                            {gpt ? <span className="font-semibold text-violet-600">{gpt.gptScore}</span> : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-2 py-2 text-right text-xs tabular-nums">
                            {gpt ? <span className="font-semibold text-blue-600">{gpt.finalScore.toFixed(1)}</span> : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-2 py-2 text-right text-xs tabular-nums">
                            {gpt ? (
                              <span className={`font-medium ${confColor}`}>
                                {t(`gpt.confidence.${gpt.confidence}` as Parameters<typeof t>[0])}
                              </span>
                            ) : <span className="text-slate-300">—</span>}
                          </td>
                        </>
                      );
                    })()}
                    <td className="px-2 py-2 text-right text-xs text-blue-600 tabular-nums">{s.technicalScore ?? "—"}</td>
                    <td className="px-2 py-2 text-right text-xs text-emerald-600 tabular-nums">{s.fundamentalScore ?? "—"}</td>
                    <td className="px-2 py-2 text-right text-xs text-violet-600 tabular-nums">{s.moneyFlowScore ?? "—"}</td>
                    <td className="px-2 py-2 text-right text-xs text-amber-600 tabular-nums">{s.newsSentimentScore ?? "—"}</td>
                    <td className={`px-2 py-2 text-right text-xs tabular-nums ${rsiColor}`}>
                      {s.rsi14 != null ? s.rsi14.toFixed(1) : "—"}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap ${rec.bg} ${rec.text}`}>
                        {getRecommendationLabel(s.recommendationV2, lang)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="py-12 text-center text-slate-400 text-sm">
            {searchLoading ? t("screener.searching") : t("screener.no_results")}
          </div>
        )}
      </div>
      <div className="mt-3 text-xs text-slate-400 text-center">
        {t("screener.hint")}
      </div>
    </div>
  );
}
