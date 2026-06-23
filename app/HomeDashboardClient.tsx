"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { HomeTop3, HomeScoreGrid } from "./HomeStockDisplay";
import { StalenessTag } from "@/components/StalenessTag";

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
  finalScore: number | null;
  ruleScore: number | null;
  gptScore: number | null;
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
  computedAt: string | null;
  top3: DashboardScore[];
  scores: DashboardScore[];
};

export function HomeDashboardClient({
  stockCount, scoreCount, priceCount, buyCount, watchCount,
  latestDateStr, computedAt, top3, scores,
}: Props) {
  const { t, lang } = useI18n();

  const statCards = [
    { label: t("home.db_stocks"),          value: stockCount.toLocaleString(),  unit: t("home.unit_stocks"), cls: "text-slate-900" },
    { label: t("home.scored_count"),       value: scoreCount.toLocaleString(),  unit: t("home.unit_stocks"), cls: "text-blue-700" },
    { label: t("home.buy_recommendation"), value: buyCount.toLocaleString(),    unit: t("home.unit_stocks"), cls: "text-emerald-600" },
    { label: t("home.price_records"),      value: priceCount.toLocaleString(),  unit: t("home.unit_records"), cls: "text-slate-700" },
    { label: t("home.last_sync"),          value: latestDateStr,                unit: "",                     cls: "text-slate-600" },
  ];

  const dataLine =
    lang === "zh-CN" ? `J-Quants 实时数据 · ${t("home.last_sync")}：${latestDateStr}` :
    lang === "ja-JP" ? `J-Quants リアルタイム · ${t("home.last_sync")}：${latestDateStr}` :
    `J-Quants Live · ${t("home.last_sync")}: ${latestDateStr}`;

  return (
    <div className="p-4 md:p-6 max-w-7xl">
      <div className="mb-4">
        <h1 className="text-[28px] font-bold text-slate-900 leading-tight">{t("nav.dashboard")}</h1>
        <p className="text-xs font-medium text-slate-500 mt-0.5 flex items-center gap-1.5">
          {dataLine}
          {computedAt && <StalenessTag date={computedAt} />}
        </p>
      </div>

      {/* Stats Cards — compact 5-col desktop, 2-col mobile */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        {statCards.map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 shadow-sm px-3 py-2.5 flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-slate-500 leading-tight">{s.label}</span>
            <div className={`text-[22px] font-bold tabular-nums shrink-0 ${s.cls}`}>
              {s.value}
              {s.unit && (
                <span className="text-[11px] font-normal text-slate-400 ml-0.5">{s.unit}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* AI TOP3 */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl p-4 mb-4 border border-slate-700">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-yellow-400 text-base">✦</span>
            <h2 className="font-bold text-[14px] text-white">{t("home.ai_top3")}</h2>
          </div>
          <Link href="/ai-picks" className="text-xs text-slate-400 hover:text-white transition-colors">
            {t("home.view_all")} →
          </Link>
        </div>
        {top3.length === 0 ? (
          <div className="bg-slate-700/40 rounded-xl p-4 text-center text-slate-400 text-sm">
            {t("home.no_score_hint")}
            <code className="text-xs bg-slate-700 px-1 rounded ml-1">npm run compute-scores</code>
          </div>
        ) : (
          <HomeTop3 top3={top3} />
        )}
      </div>

      {/* 3 mini stat cards: buy / watch / scored */}
      {scores.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Link href="/ai-picks?filter=BUY" className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 hover:border-emerald-300 transition-colors flex items-center justify-between">
            <div className="text-xs font-medium text-emerald-600">{t("home.buy_picks")}</div>
            <div className="text-2xl font-bold text-emerald-700 tabular-nums">{buyCount}</div>
          </Link>
          <Link href="/ai-picks?filter=WATCH" className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 hover:border-amber-300 transition-colors flex items-center justify-between">
            <div className="text-xs font-medium text-amber-600">{t("home.watch_label")}</div>
            <div className="text-2xl font-bold text-amber-600 tabular-nums">{watchCount}</div>
          </Link>
          <Link href="/screener" className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 hover:border-slate-300 transition-colors flex items-center justify-between">
            <div className="text-xs font-medium text-slate-500">{t("home.scored_count")}</div>
            <div className="text-2xl font-bold text-slate-700 tabular-nums">{scoreCount}</div>
          </Link>
        </div>
      )}

      {/* Score Grid */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-[14px] text-slate-900">
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
          <HomeScoreGrid scores={scores} />
        )}
      </div>
    </div>
  );
}
