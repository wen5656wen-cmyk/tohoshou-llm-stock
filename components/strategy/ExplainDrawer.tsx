"use client";
// Strategy 模块 · Explain 抽屉（P4-T3，功能/API 不变）
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n";
import type { StratType, ExplainData } from "./types";
import { fill, normalizeSymbol, DIM_ORDER, dimValue, SM, SHADOW, SFONT, STRAT_HEX, returnColor, fmtPct, fmtScore, gradeVerdict, retHex, stratShort, stratLabel } from "./utils";

export function ExplainDrawer({
  strategyType, symbol, tradeDate, onClose,
}: {
  strategyType: StratType;
  symbol: string;
  tradeDate: string | null;
  onClose: () => void;
}) {
  const { t, lang } = useI18n();
  const [data, setData] = useState<ExplainData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setData(null);
    const qs = new URLSearchParams({ strategyType, symbol });
    if (tradeDate) qs.set("tradeDate", tradeDate.slice(0, 10));
    fetch(`/api/strategy/explain?${qs.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: ExplainData) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(() => { if (!cancelled) { setError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [strategyType, symbol, tradeDate]);

  const displayName = data ? (lang === "zh-CN" ? (data.nameZh ?? data.name) : data.name) : null;

  // Summary sentence composition (traceable — no fabrication), by explanationType
  let summary = "";
  if (data) {
    if (data.explanationType === "DATA_INSUFFICIENT") summary = t("explain.data_insufficient_msg");
    else if (data.explanationType === "NOT_CANDIDATE") summary = t("explain.not_candidate_msg");
    else if (data.explanationType === "NOT_TOP10") {
      summary = fill(t("explain.summary.NOT_TOP10"), {
        strat: stratShort(strategyType, t),
        rank: data.rank ?? "—",
        gap: data.scoreGap != null ? data.scoreGap.toFixed(1) : "—",
      });
    } else {
      summary =
        strategyType === "DAY_TRADE" ? t("explain.summary.DAY")
        : strategyType === "SWING_TRADE" ? t("explain.summary.SWING")
        : t("explain.summary.LONG");
    }
  }
  const isDI = data?.explanationType === "DATA_INSUFFICIENT";
  const isNC = data?.explanationType === "NOT_CANDIDATE";

  const fitKey: MessageKey =
    strategyType === "DAY_TRADE" ? "explain.fit.DAY"
    : strategyType === "SWING_TRADE" ? "explain.fit.SWING"
    : "explain.fit.LONG";

  const conclusionColor =
    data?.conclusion === "STRONG" ? "bg-emerald-900/50 text-emerald-300 border-emerald-700/40"
    : data?.conclusion === "RECOMMEND" ? "bg-blue-900/50 text-blue-300 border-blue-700/40"
    : data?.conclusion === "WATCH" ? "bg-amber-900/50 text-amber-300 border-amber-700/40"
    : "bg-[#EEF0F4] text-[#4B5563] border-[#E8EAED]";

  // Score bars
  const bd = data?.scoreBreakdown ?? null;
  const dims = bd
    ? DIM_ORDER[strategyType]
        .map((code) => ({ code, value: dimValue(bd, code) }))
        .filter((d) => d.value != null)
    : [];
  const barMax = Math.max(1, ...dims.map((d) => Math.abs(d.value as number)));

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md h-full bg-white border-l border-[#E8EAED] shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-[#E8EAED] px-5 py-4 flex items-start justify-between z-10">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-[#1D1D1F]">{symbol}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#EEF0F4] text-[#4B5563]">
                {stratLabel(strategyType, t)}
              </span>
            </div>
            {displayName && <div className="text-xs text-[#6E6E73] mt-0.5">{displayName}</div>}
          </div>
          <button onClick={onClose} className="text-[#6E6E73] hover:text-[#1D1D1F] text-xl leading-none px-1">×</button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {loading && (
            <div className="py-10 text-center text-[#86868B] text-sm">{t("explain.loading")}</div>
          )}
          {error && (
            <div className="py-10 text-center text-red-400 text-sm">{t("explain.load_error")}</div>
          )}
          {data && !loading && !error && (
            <>
              {/* Conclusion + status */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] text-[#86868B]">{t("explain.conclusion_label")}</span>
                <span className={`text-xs px-2.5 py-1 rounded-full border font-semibold ${conclusionColor}`}>
                  {t(`explain.conclusion.${data.conclusion}` as MessageKey)}
                </span>
                <span className="text-[10px] text-[#86868B] ml-2">{t("explain.status_label")}</span>
                <span className="text-xs px-2.5 py-1 rounded-full bg-[#F4F5F7] text-[#4B5563] border border-[#E8EAED]">
                  {t(`explain.status.${data.status}` as MessageKey)}
                </span>
              </div>

              {/* Summary */}
              <p className="text-sm text-[#4B5563] leading-relaxed">{summary}</p>

              {/* Not-Top10 metrics: rank / cutoff / gap */}
              {data.explanationType === "NOT_TOP10" && (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-[#F4F5F7] rounded-lg p-2">
                    <div className="text-[10px] text-[#86868B]">{t("explain.rank")}</div>
                    <div className="text-sm font-semibold text-[#1D1D1F] tabular-nums">
                      {data.rank ?? "—"}<span className="text-[10px] text-[#86868B]"> / {data.totalCandidates}</span>
                    </div>
                  </div>
                  <div className="bg-[#F4F5F7] rounded-lg p-2">
                    <div className="text-[10px] text-[#86868B]">{t("explain.cutoff")}</div>
                    <div className="text-sm font-semibold text-[#1D1D1F] tabular-nums">
                      {data.top10CutoffScore != null ? data.top10CutoffScore.toFixed(1) : "—"}
                    </div>
                  </div>
                  <div className="bg-[#F4F5F7] rounded-lg p-2">
                    <div className="text-[10px] text-[#86868B]">{t("explain.score_gap")}</div>
                    <div className="text-sm font-semibold text-amber-400 tabular-nums">
                      {data.scoreGap != null ? `-${data.scoreGap.toFixed(1)}` : "—"}
                    </div>
                  </div>
                </div>
              )}

              {/* Not-Candidate metrics: candidate pool / overall score / rating */}
              {isNC && (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-[#F4F5F7] rounded-lg p-2">
                    <div className="text-[10px] text-[#86868B]">{t("explain.candidate_pool")}</div>
                    <div className="text-sm font-semibold text-[#1D1D1F] tabular-nums">{data.totalCandidates}</div>
                  </div>
                  <div className="bg-[#F4F5F7] rounded-lg p-2">
                    <div className="text-[10px] text-[#86868B]">{t("explain.overall_score")}</div>
                    <div className="text-sm font-semibold text-[#1D1D1F] tabular-nums">
                      {data.adaptiveScore != null ? data.adaptiveScore.toFixed(1) : "—"}
                    </div>
                  </div>
                  <div className="bg-[#F4F5F7] rounded-lg p-2">
                    <div className="text-[10px] text-[#86868B]">{t("explain.cutoff")}</div>
                    <div className="text-sm font-semibold text-[#1D1D1F] tabular-nums">
                      {data.top10CutoffScore != null ? data.top10CutoffScore.toFixed(1) : "—"}
                    </div>
                  </div>
                </div>
              )}

              {/* Score breakdown */}
              {bd && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-semibold text-[#6E6E73] uppercase tracking-wider">{t("explain.breakdown")}</h4>
                    <div className="text-right">
                      <span className="text-[10px] text-[#86868B] mr-1">{t("explain.final_score")}</span>
                      <span className="text-base font-bold text-[#1D1D1F] tabular-nums">
                        {bd.finalScore != null ? bd.finalScore.toFixed(1) : "—"}
                      </span>
                    </div>
                  </div>
                  {dims.length === 0 ? (
                    <div className="text-xs text-[#86868B]">{t("explain.no_data")}</div>
                  ) : (
                    <div className="space-y-1.5">
                      {dims.map((d) => {
                        const v = d.value as number;
                        const pct = (Math.abs(v) / barMax) * 100;
                        const neg = v < 0;
                        return (
                          <div key={d.code} className="flex items-center gap-2">
                            <span className="w-14 text-[11px] text-[#6E6E73] shrink-0">
                              {t(`explain.dim.${d.code}` as MessageKey)}
                            </span>
                            <div className="flex-1 h-3 bg-[#F4F5F7] rounded overflow-hidden">
                              <div
                                className={`h-full ${neg ? "bg-red-500/70" : "bg-blue-500/70"}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className={`w-10 text-right text-[11px] tabular-nums ${neg ? "text-red-400" : "text-[#4B5563]"}`}>
                              {v.toFixed(0)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Reasons — only for stocks in the recommendation pool */}
              {data.found && (
                <div>
                  <h4 className="text-xs font-semibold text-[#6E6E73] uppercase tracking-wider mb-2">{t("explain.reasons")}</h4>
                  {data.reasons.length === 0 ? (
                    <div className="text-xs text-[#86868B]">{t("explain.no_data")}</div>
                  ) : (
                    <ul className="space-y-1">
                      {data.reasons.map((r) => (
                        <li key={r.code} className="flex items-center justify-between text-xs">
                          <span className="text-[#4B5563]">· {t(`explain.reason.${r.code}` as MessageKey)}</span>
                          <span className="text-[#6E6E73] tabular-nums">{r.value.toFixed(1)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Main shortfalls (未入选主要短板) — NOT_TOP10 / NOT_CANDIDATE */}
              {(data.explanationType === "NOT_TOP10" || isNC) && data.shortfalls.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-[#6E6E73] uppercase tracking-wider mb-2">{t("explain.missing")}</h4>
                  <ul className="space-y-1">
                    {data.shortfalls.map((m) => (
                      <li key={m.code} className="flex items-center justify-between text-xs">
                        <span className="text-amber-300/90">· {t(`explain.short.${m.code}` as MessageKey)}</span>
                        <span className="text-[#6E6E73] tabular-nums">{m.value != null ? m.value.toFixed(0) : ""}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Improvement factors (改善建议) */}
              {data.improvementFactors.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-[#6E6E73] uppercase tracking-wider mb-2">{t("explain.improvement")}</h4>
                  <ul className="space-y-1">
                    {data.improvementFactors.map((c) => (
                      <li key={c} className="text-xs text-emerald-300/90">→ {t(`explain.imp.${c}` as MessageKey)}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Risks — hidden when there is no usable data at all */}
              {!isDI && data.risks.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-[#6E6E73] uppercase tracking-wider mb-2">{t("explain.risks")}</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {data.risks.map((r) => (
                      <span key={r.code} className="text-[11px] px-2 py-1 rounded-md bg-red-900/20 text-red-300/90 border border-red-800/30">
                        {t(`explain.risk.${r.code}` as MessageKey)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Strategy fit */}
              {!isDI && (
                <div>
                  <h4 className="text-xs font-semibold text-[#6E6E73] uppercase tracking-wider mb-2">{t("explain.fit")}</h4>
                  <p className="text-xs text-[#6E6E73] leading-relaxed">{t(fitKey)}</p>
                </div>
              )}

              {/* Footer meta */}
              <div className="pt-2 border-t border-[#E8EAED] text-[10px] text-[#86868B] flex items-center justify-between">
                <span>{t("explain.updated_at")}: {data.generatedAt.slice(0, 19).replace("T", " ")}</span>
                {data.tradeDate && <span>{data.tradeDate}</span>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

