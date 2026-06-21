"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { HomeTop3, HomeScoreTable } from "./HomeStockDisplay";

export type DashboardScore = {
  symbol: string;
  name: string;
  nameZh: string | null;
  nameEn?: string | null;
  latestClose: number | null;
  return5d: number | null;
  return20d: number | null;
  rsi14: number | null;
  maTrend: string | null;
  technicalScore: number | null;
  fundamentalScore: number | null;
  moneyFlowScore: number | null;
  riskScore: number | null;
  totalScore: number | null;
  adaptiveScore: number | null;
  recommendation: string | null;
  recommendationV2: string | null;
  percentileRank: number | null;
};

type Props = {
  stockCount: number;
  scoreCount: number;
  priceCount: number;
  buyCount: number;
  watchCount: number;
  latestDateStr: string;
  top3: DashboardScore[];
  scores: DashboardScore[];
};

export function HomeDashboardClient({
  stockCount, scoreCount, priceCount, buyCount, watchCount,
  latestDateStr, top3, scores,
}: Props) {
  const { t, lang } = useI18n();

  const statCards = [
    { label: t("home.db_stocks"),          value: stockCount.toLocaleString(),  unit: t("home.unit_stocks"), icon: "◉", cls: "text-slate-900" },
    { label: t("home.scored_count"),       value: scoreCount.toLocaleString(),  unit: t("home.unit_stocks"), icon: "✦", cls: "text-blue-700" },
    { label: t("home.buy_recommendation"), value: buyCount.toLocaleString(),    unit: t("home.unit_stocks"), icon: "▲", cls: "text-emerald-600" },
    { label: t("home.price_records"),      value: priceCount.toLocaleString(),  unit: t("home.unit_records"), icon: "◈", cls: "text-slate-700" },
    { label: t("home.last_sync"),          value: latestDateStr,                unit: "",                     icon: "⟳", cls: "text-slate-600" },
  ];

  const dataLine =
    lang === "zh-CN" ? `J-Quants 实时数据 · ${t("home.last_sync")}：${latestDateStr}` :
    lang === "ja-JP" ? `J-Quants リアルタイム · ${t("home.last_sync")}：${latestDateStr}` :
    `J-Quants Live · ${t("home.last_sync")}: ${latestDateStr}`;

  return (
    <div className="p-4 md:p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-[32px] font-bold text-slate-900 leading-tight">{t("nav.dashboard")}</h1>
        <p className="text-sm font-medium text-slate-500 mt-1">{dataLine}</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        {statCards.map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-slate-400 text-sm">{s.icon}</span>
              <span className="text-xs font-medium text-slate-500">{s.label}</span>
            </div>
            <div className={`text-2xl font-bold tabular-nums ${s.cls}`}>
              {s.value}
              {s.unit && (
                <span className="text-sm font-normal text-slate-400 ml-1">{s.unit}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* AI TOP3 */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl p-5 mb-6 border border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-yellow-400 text-lg">✦</span>
            <h2 className="font-bold text-[15px] text-white">{t("home.ai_top3")}</h2>
          </div>
          <Link href="/ai-picks" className="text-xs text-slate-400 hover:text-white transition-colors">
            {t("home.view_all")} →
          </Link>
        </div>
        {top3.length === 0 ? (
          <div className="bg-slate-700/40 rounded-2xl p-6 text-center text-slate-400 text-sm">
            {t("home.no_score_hint")}
            <code className="text-xs bg-slate-700 px-1 rounded ml-1">npm run compute-scores</code>
          </div>
        ) : (
          <HomeTop3 top3={top3} />
        )}
      </div>

      {/* Score distribution */}
      {scores.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Link href="/ai-picks?filter=BUY" className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 hover:border-emerald-300 transition-colors">
            <div className="text-xs font-medium text-emerald-600 mb-1">{t("home.buy_picks")}</div>
            <div className="text-3xl font-bold text-emerald-700 tabular-nums">{buyCount}</div>
            <div className="text-xs text-emerald-500 mt-1">{t("home.strong_buy_plus_buy")}</div>
          </Link>
          <Link href="/ai-picks?filter=WATCH" className="bg-amber-50 border border-amber-100 rounded-2xl p-4 hover:border-amber-300 transition-colors">
            <div className="text-xs font-medium text-amber-600 mb-1">{t("home.watch_label")}</div>
            <div className="text-3xl font-bold text-amber-600 tabular-nums">{watchCount}</div>
            <div className="text-xs text-amber-500 mt-1">{t("home.watch_monitoring")}</div>
          </Link>
          <Link href="/screener" className="bg-slate-50 border border-slate-200 rounded-2xl p-4 hover:border-slate-300 transition-colors">
            <div className="text-xs font-medium text-slate-500 mb-1">{t("home.screener_count")}</div>
            <div className="text-3xl font-bold text-slate-700 tabular-nums">{scoreCount}</div>
            <div className="text-xs text-slate-400 mt-1">{t("home.ai_scored")}</div>
          </Link>
        </div>
      )}

      {/* Scored Stocks Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-[15px] text-slate-900">
            {t("home.ranking_title")}
            <span className="text-sm font-normal text-slate-400 ml-2">
              ({scores.length}{t("home.unit_stocks") ? `${t("home.unit_stocks")}` : ""})
            </span>
          </h2>
          <Link href="/screener" className="text-xs text-blue-600 hover:underline">
            {t("home.screener_link")}
          </Link>
        </div>
        {scores.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-sm">
            {t("home.no_score_hint")}
            <code className="bg-slate-100 px-1 rounded text-xs ml-1">npm run compute-scores</code>
          </div>
        ) : (
          <HomeScoreTable scores={scores} />
        )}
        {scores.length > 100 && (
          <div className="px-5 py-3 border-t border-slate-100 text-xs text-slate-400 text-center">
            {t("home.show_top100")}
            <Link href="/screener" className="text-blue-600 hover:underline ml-1">
              {t("home.view_screener")}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
