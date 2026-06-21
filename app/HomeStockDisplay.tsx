"use client";

import { useState } from "react";
import Link from "next/link";
import { buildStockUrl } from "@/lib/navigation/back";
import { useI18n } from "@/lib/i18n";
import { getPrimaryName } from "@/lib/company-name";
import { getRec, getRecommendationLabel, returnColorClass, fmtPct, fmtJpy, finalScoreColor } from "@/lib/rec-config";

type Score = {
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

function ReturnBadge({ val }: { val: number | null | undefined }) {
  if (val == null) return <span className="text-slate-300 text-[10px]">—</span>;
  return (
    <span className={`text-[10px] font-medium tabular-nums ${returnColorClass(val)}`}>
      {fmtPct(val)}
    </span>
  );
}

export function HomeTop3({ top3 }: { top3: Score[] }) {
  const { lang, t } = useI18n();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {top3.map((s, i) => {
        const rec = getRec(s.recommendationV2 ?? s.recommendation);
        const primary = getPrimaryName(s, lang);
        const displayScore = s.finalScore ?? s.adaptiveScore ?? s.totalScore;
        const hasGpt = s.finalScore != null;
        return (
          <Link
            key={s.symbol}
            href={buildStockUrl(s.symbol, "dashboard", "/")}
            className="bg-white/10 hover:bg-white/20 transition-all duration-200 hover:-translate-y-0.5 rounded-xl p-3 block"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold text-slate-400 tabular-nums">#{i + 1}</span>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap ${rec.bg} ${rec.text}`}>
                {getRecommendationLabel(s.recommendationV2 ?? s.recommendation, lang)}
              </span>
            </div>
            <div className="text-[14px] font-bold text-white leading-tight truncate">{primary}</div>
            <div className="text-[10px] text-slate-500 font-mono mb-2">{s.symbol}</div>
            <div className="flex items-end justify-between">
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold tabular-nums text-white">
                    {typeof displayScore === "number" ? displayScore.toFixed(0) : "—"}
                  </span>
                  <span className="text-slate-400 text-[10px]">/100</span>
                </div>
                {hasGpt ? (
                  <div className="text-[9px] text-slate-400">
                    {t("score.rule")} {s.ruleScore?.toFixed(0)} · {t("score.gpt")} {s.gptScore?.toFixed(0)}
                  </div>
                ) : (
                  <div className="text-[9px] text-slate-500">{t("score.rule_only")}</div>
                )}
              </div>
              <div className="text-right">
                <div className="text-[11px] font-medium text-slate-200">{fmtJpy(s.latestClose)}</div>
                <ReturnBadge val={s.return5d} />
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export function HomeScoreGrid({ scores }: { scores: Score[] }) {
  const { lang, t } = useI18n();
  const [showAll, setShowAll] = useState(false);
  const displayScores = showAll ? scores.slice(0, 200) : scores.slice(0, 51);

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
        {displayScores.map((s, i) => {
          const rec = getRec(s.recommendationV2 ?? s.recommendation);
          const primary = getPrimaryName(s, lang);
          const displayScore = s.finalScore ?? s.adaptiveScore ?? s.totalScore;
          const hasGpt = s.finalScore != null;
          return (
            <Link
              key={s.symbol}
              href={buildStockUrl(s.symbol, "dashboard", "/")}
              className="block bg-white border border-slate-200 rounded-xl p-3 hover:border-blue-200 hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 group"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className="text-[9px] text-slate-300 tabular-nums font-mono w-5 shrink-0">#{i + 1}</span>
                    <div className="text-[13px] font-bold text-slate-900 group-hover:text-blue-600 truncate leading-tight">
                      {primary}
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono mb-1.5">{s.symbol}</div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="font-medium text-slate-700">{fmtJpy(s.latestClose)}</span>
                    <ReturnBadge val={s.return5d} />
                    <ReturnBadge val={s.return20d} />
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-xl font-bold tabular-nums ${finalScoreColor(typeof displayScore === "number" ? displayScore : null)}`}>
                    {typeof displayScore === "number" ? displayScore.toFixed(0) : "—"}
                  </div>
                  {hasGpt ? (
                    <div className="text-[9px] text-slate-400 tabular-nums">
                      R{s.ruleScore?.toFixed(0)} G{s.gptScore?.toFixed(0)}
                    </div>
                  ) : (
                    <div className="text-[9px] text-slate-400">{t("score.rule_only")}</div>
                  )}
                  <div className={`text-[10px] font-semibold px-1.5 py-0.5 rounded mt-1 whitespace-nowrap inline-block ${rec.bg} ${rec.text}`}>
                    {getRecommendationLabel(s.recommendationV2 ?? s.recommendation, lang)}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
      {!showAll && scores.length > 51 && (
        <div className="px-4 pb-4 text-center border-t border-slate-50 pt-3">
          <button
            onClick={() => setShowAll(true)}
            className="text-xs text-blue-600 hover:underline"
          >
            {t("home.view_screener")} ({scores.length}) →
          </button>
        </div>
      )}
    </div>
  );
}
