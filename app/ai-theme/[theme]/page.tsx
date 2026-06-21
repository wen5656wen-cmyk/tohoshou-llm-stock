"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getRec, getRecommendationLabel, returnColorClass, fmtPct } from "@/lib/rec-config";
import { useI18n } from "@/lib/i18n";
import { getPrimaryName } from "@/lib/company-name";
import { getThemeLabel, getLayerLabel, getLayerDesc } from "@/lib/i18n/theme-labels";

type Stock = {
  symbol: string;
  name: string;
  nameZh: string | null;
  nameEn: string | null;
  latestClose: number | null;
  return5d: number | null;
  return20d: number | null;
  adaptiveScore: number | null;
  recommendationV2: string | null;
  percentileRank: number | null;
  opportunityScore: number | null;
  dividendScore: number | null;
  catalystScore: number | null;
  highRiskFlag: boolean;
  subTheme: string | null;
  role: string | null;
  supplyChainLayer: string | null;
  importanceScore: number;
  isCore: boolean;
  reason: string | null;
  riskNote: string | null;
  scored: boolean;
};

type ApiResponse = {
  theme: string;
  meta: { label: string; desc: string; color: string };
  stocks: Stock[];
  byLayer: Record<string, Stock[]>;
  layerLabels: Record<string, { zh: string; desc: string }>;
  stats: {
    total: number;
    scoredCount: number;
    coreCount: number;
    buyCount: number;
    avgScore: number;
  };
};

const PENDING_REC = { bg: "bg-slate-50", text: "text-slate-400", border: "border-slate-200" };

const LAYER_COLORS: Record<string, string> = {
  UPSTREAM:       "bg-green-50 border-green-200",
  MIDSTREAM:      "bg-blue-50 border-blue-200",
  DOWNSTREAM:     "bg-violet-50 border-violet-200",
  INFRASTRUCTURE: "bg-amber-50 border-amber-200",
  APPLICATION:    "bg-pink-50 border-pink-200",
};
const LAYER_HEADER: Record<string, string> = {
  UPSTREAM:       "text-green-700",
  MIDSTREAM:      "text-blue-700",
  DOWNSTREAM:     "text-violet-700",
  INFRASTRUCTURE: "text-amber-700",
  APPLICATION:    "text-pink-700",
};

const LAYER_ORDER = ["UPSTREAM", "MIDSTREAM", "DOWNSTREAM", "INFRASTRUCTURE", "APPLICATION"];

function ReturnBadge({ v }: { v: number | null }) {
  if (v == null) return <span className="text-slate-300 text-[11px]">—</span>;
  return (
    <span className={`text-[11px] font-medium tabular-nums ${returnColorClass(v)}`}>
      {fmtPct(v, 1)}
    </span>
  );
}

function StockRow({ s }: { s: Stock }) {
  const { lang, t } = useI18n();
  const rec = getRec(s.recommendationV2);
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-3 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {s.isCore && <span className="text-amber-400 text-[11px]">⭐</span>}
            <Link
              href={`/stocks/${encodeURIComponent(s.symbol)}`}
              className="text-[13px] font-bold text-slate-900 hover:text-blue-600"
            >
              {getPrimaryName(s, lang)}
            </Link>
            <span className="text-[10px] text-slate-400 font-mono">{s.symbol.replace(".T", "")}</span>
            {s.scored ? (
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${rec.bg} ${rec.text}`}>
                {getRecommendationLabel(s.recommendationV2, lang)}
              </span>
            ) : (
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${PENDING_REC.bg} ${PENDING_REC.text}`}>
                {t("theme.pending_score")}
              </span>
            )}
            {s.highRiskFlag && (
              <span className="text-[10px] text-red-400">⚠{t("theme.high_risk")}</span>
            )}
          </div>
          {/* Role — hide in en-US if contains non-ASCII CJK */}
          {s.role && lang !== "en-US" && (
            <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{s.role}</div>
          )}
        </div>
        <div className="text-right ml-2 shrink-0">
          {s.scored ? (
            <>
              <div className="text-lg font-bold text-slate-900">{s.adaptiveScore?.toFixed(0) ?? "—"}</div>
              {s.percentileRank != null && (
                <div className="text-[10px] text-slate-400">
                  {lang === "zh-CN" ? "前" : lang === "ja-JP" ? "上位" : "Top"} {s.percentileRank.toFixed(1)}%
                </div>
              )}
            </>
          ) : (
            <div className="text-[11px] text-slate-400">{t("theme.pending_score")}</div>
          )}
        </div>
      </div>
      {s.scored && (
        <div className="flex items-center gap-4 mt-1.5 text-[10px] text-slate-400">
          {s.opportunityScore != null && (
            <span>{t("card.opp")} <b className="text-slate-600">{s.opportunityScore.toFixed(0)}</b></span>
          )}
          {s.dividendScore != null && s.dividendScore > 0 && (
            <span>{t("theme.dividend_label")} <b className="text-emerald-600">{s.dividendScore}</b></span>
          )}
          {s.catalystScore != null && s.catalystScore > 0 && (
            <span>{t("theme.catalyst_label")} <b className="text-orange-600">{s.catalystScore.toFixed(1)}</b></span>
          )}
          <span>{t("card.5d")} <ReturnBadge v={s.return5d} /></span>
          {s.latestClose != null && (
            <span>¥{s.latestClose.toLocaleString()}</span>
          )}
        </div>
      )}
      {s.reason && lang !== "en-US" && (
        <div className="mt-1.5 text-[10px] text-slate-500 leading-relaxed line-clamp-2 bg-slate-50 rounded px-2 py-1">
          {s.reason}
        </div>
      )}
      {s.riskNote && lang !== "en-US" && (
        <div className="mt-1 text-[10px] text-red-500 line-clamp-1">
          ⚠ {s.riskNote}
        </div>
      )}
    </div>
  );
}

export default function AiThemeDetailPage() {
  const params = useParams();
  const themeSlug = params?.theme as string | undefined;
  const themeKey = themeSlug?.toUpperCase() ?? "";
  const { lang, t } = useI18n();

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!themeKey) return;
    fetch(`/api/ai-theme/${themeKey.toLowerCase()}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
        setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [themeKey]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="text-slate-400 text-sm animate-pulse">{t("theme.loading_detail")}</div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="p-4 md:p-6">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-red-700 text-sm">
          {t("theme.error_load")}{error ?? (lang === "zh-CN" ? "主题不存在" : lang === "ja-JP" ? "テーマが見つかりません" : "Theme not found")}
        </div>
        <Link href="/ai-theme" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
          {t("theme.back_link")}
        </Link>
      </div>
    );
  }

  const { meta, stocks, byLayer, stats } = data;
  const activeLayers = LAYER_ORDER.filter((l) => (byLayer[l] ?? []).length > 0);

  const themeDisplayLabel = getThemeLabel(themeKey, lang);
  const unitStocks = t("theme.unit_stocks");

  return (
    <div className="p-4 md:p-6">
      {/* Breadcrumb */}
      <div className="text-xs text-slate-400 mb-4">
        <Link href="/ai-theme" className="hover:text-blue-600">{t("theme.title")}</Link>
        <span className="mx-1.5">›</span>
        <span className="text-slate-600 font-medium">{themeDisplayLabel}</span>
      </div>

      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-[32px] font-bold text-slate-900 leading-tight">{themeDisplayLabel}</h1>
          <span className="text-xs font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
            {t("theme.detail_subtitle")}
          </span>
        </div>
        {lang !== "en-US" && <p className="text-sm text-slate-500">{meta.desc}</p>}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        {[
          { label: lang === "zh-CN" ? "股票总数" : lang === "ja-JP" ? "銘柄数" : "Total Stocks", value: stats.total },
          { label: t("theme.stat_core"),     value: stats.coreCount },
          { label: lang === "zh-CN" ? "已评分" : lang === "ja-JP" ? "評価済み" : "Scored",       value: stats.scoredCount },
          { label: t("theme.stat_buy"),      value: stats.buyCount },
          { label: t("theme.stat_avg_score"), value: stats.avgScore },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="text-2xl font-bold text-slate-900">{s.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Supply chain flow */}
      {activeLayers.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-bold text-slate-700 mb-3">{t("theme.chain_structure")}</h2>
          {/* Desktop: horizontal flow */}
          <div className="hidden md:flex gap-0 items-stretch">
            {activeLayers.map((lk, idx) => {
              const layerStocks = byLayer[lk] ?? [];
              return (
                <div key={lk} className="flex items-stretch flex-1 min-w-0">
                  <div className={`flex-1 rounded-2xl border p-4 ${LAYER_COLORS[lk] ?? "bg-slate-50 border-slate-200"}`}>
                    <div className={`text-xs font-bold mb-0.5 ${LAYER_HEADER[lk] ?? "text-slate-600"}`}>
                      {getLayerLabel(lk, lang)}
                      <span className="font-normal text-slate-400 ml-1">({layerStocks.length}{unitStocks})</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mb-3">{getLayerDesc(lk, lang)}</div>
                    <div className="space-y-2">
                      {layerStocks.map((s) => <StockRow key={s.symbol} s={s} />)}
                    </div>
                  </div>
                  {idx < activeLayers.length - 1 && (
                    <div className="flex items-center justify-center w-8 shrink-0 text-slate-300">
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <path d="M4 10h12M12 6l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {/* Mobile: vertical stack */}
          <div className="md:hidden space-y-2">
            {activeLayers.map((lk, idx) => {
              const layerStocks = byLayer[lk] ?? [];
              return (
                <div key={lk}>
                  <div className={`rounded-2xl border p-4 ${LAYER_COLORS[lk] ?? "bg-slate-50 border-slate-200"}`}>
                    <div className={`text-xs font-bold mb-0.5 ${LAYER_HEADER[lk] ?? "text-slate-600"}`}>
                      {getLayerLabel(lk, lang)}
                      <span className="font-normal text-slate-400 ml-1">({layerStocks.length}{unitStocks})</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mb-3">{getLayerDesc(lk, lang)}</div>
                    <div className="space-y-2">
                      {layerStocks.map((s) => <StockRow key={s.symbol} s={s} />)}
                    </div>
                  </div>
                  {idx < activeLayers.length - 1 && (
                    <div className="flex items-center justify-center h-6 text-slate-300">
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <path d="M10 4v12M6 12l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* All stocks list */}
      <div>
        <h2 className="text-sm font-bold text-slate-700 mb-3">
          {lang === "zh-CN"
            ? `全部 ${stocks.length} 只 · ${t("theme.detail_sorted")}`
            : lang === "ja-JP"
            ? `全${stocks.length}銘柄 · ${t("theme.detail_sorted")}`
            : `All ${stocks.length} stocks · ${t("theme.detail_sorted")}`}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[...stocks]
            .sort((a, b) => {
              if (a.isCore && !b.isCore) return -1;
              if (!a.isCore && b.isCore) return 1;
              return b.importanceScore - a.importanceScore;
            })
            .map((s) => (
              <StockRow key={s.symbol} s={s} />
            ))}
        </div>
      </div>

      <div className="mt-6 pt-4 border-t border-slate-200">
        <Link href="/ai-theme" className="text-sm text-blue-600 hover:underline">
          {t("theme.back_link")}
        </Link>
      </div>
    </div>
  );
}
