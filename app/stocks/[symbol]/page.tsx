"use client";

import { useEffect, useState, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PriceChart from "@/components/PriceChart";
import { StalenessTag } from "@/components/StalenessTag";
import { getRec, returnColorClass, fmtPct, fmtJpy, finalScoreHex } from "@/lib/rec-config";
import { useI18n } from "@/lib/i18n";
import { getNameLines } from "@/lib/i18n/stock-name";
import { localeSector, localeMarket } from "@/lib/i18n/market-labels";
import { getBackHref, getBackLabel } from "@/lib/navigation/back";

// ── Types ─────────────────────────────────────────────────────────────────────

type PricePoint = { date: string; open?: number; high?: number; low?: number; close: number; volume?: number };

type StockInfo = {
  symbol: string; name: string; nameZh: string | null; nameEn: string | null;
  sector: string | null; industry: string | null; market: string | null;
  high52w: number | null; low52w: number | null;
};

type ScoreData = {
  computedAt: string | null;
  latestClose: number | null; latestDate: string | null;
  adaptiveScore: number | null; totalScore: number | null;
  technicalScore: number | null; fundamentalScore: number | null;
  moneyFlowScore: number | null; newsSentimentScore: number | null; globalTrendScore: number | null;
  recommendation: string | null; recommendationV2: string | null;
  recommendationReason: string | null; summaryReason: string | null; newsSummary: string | null;
  scoreSource: string | null; stockStyle: string | null; highRiskFlag: boolean;
  percentileRank: number | null; marketRank: number | null;
  opportunityScore: number | null; opportunityLabel: string | null;
  riskLevel: string;
  tradingAction: string | null; positionSizePct: number | null;
  entryLow: number | null; entryHigh: number | null;
  stopLoss: number | null; target1: number | null; target2: number | null;
  actionRiskLevel: string | null; actionReasons: string[]; actionWarnings: string[];
  overallConfidence: number | null; riskOverride: string | null;
};

type IndicatorData = {
  latestDate: string; latestClose: number;
  ma5: number | null; ma20: number | null; ma60: number | null;
  rsi14: number | null; maTrend: string; rsiSignal: string; macdSignalLabel: string;
  return5d: number | null; return20d: number | null; return60d: number | null;
  latestVolume: number | null; avgVolume20d: number | null;
};

type GptData = {
  strengths: string[]; risks: string[]; timeHorizon: string | null;
  summaryZh: string | null; summaryJa: string | null; summaryEn: string | null;
  action: string | null; confidence: string | null;
  finalScore: number | null; gptScore: number | null; updatedAt: string | null;
};

type DailyRecData = {
  date: string | null; gptRank: number; finalScore: number;
  summaryZh: string | null; recommendation: string | null;
};

type NewsItem = {
  id: number; title: string; url: string; source: string;
  publishedAt: string | null; sentiment: string | null;
  summary: string | null; category: string | null;
};

type AiDecisionData = {
  stock: StockInfo;
  score: ScoreData | null;
  indicators: IndicatorData | null;
  gpt: GptData | null;
  dailyRec: DailyRecData | null;
  news: NewsItem[];
};

type StrategyData = {
  classification: {
    strategyType: string;
    confidence: number;
    targetReturnPct: number;
    stopLossPct: number;
    maxHoldingDays: number;
  } | null;
  backtestStats: {
    winRate: number | null;
    avgReturnPct: number | null;
    sampleCount: number;
  } | null;
  sampleCount: number;
} | null;

// ── Small helpers ─────────────────────────────────────────────────────────────

const REC_CHIP: Record<string, { bg: string; text: string; border: string }> = {
  STRONG_BUY: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-300" },
  BUY:        { bg: "bg-blue-50",    text: "text-blue-700",    border: "border-blue-300"    },
  HOLD:       { bg: "bg-slate-100",  text: "text-slate-700",   border: "border-slate-300"   },
  WATCH:      { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-300"   },
  AVOID:      { bg: "bg-red-50",     text: "text-red-700",     border: "border-red-300"     },
};

const ACTION_CFG: Record<string, { bg: string; text: string; border: string }> = {
  BUY_NOW:       { bg: "bg-emerald-50",  text: "text-emerald-700", border: "border-emerald-200" },
  WAIT_PULLBACK: { bg: "bg-amber-50",    text: "text-amber-700",   border: "border-amber-200"   },
  HOLD:          { bg: "bg-slate-50",    text: "text-slate-700",   border: "border-slate-200"   },
  TAKE_PROFIT:   { bg: "bg-orange-50",   text: "text-orange-700",  border: "border-orange-200"  },
  SELL:          { bg: "bg-red-50",      text: "text-red-700",     border: "border-red-200"     },
  AVOID:         { bg: "bg-red-50",      text: "text-red-700",     border: "border-red-200"     },
};

const RISK_COLOR: Record<string, string> = {
  LOW:     "text-emerald-600", MEDIUM: "text-amber-600",
  HIGH:    "text-orange-600",  EXTREME: "text-red-600",
};

function SectionCard({ title, children, className = "" }: {
  title: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden ${className}`}>
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function ScoreBar({ label, score, max, color }: { label: string; score: number | null; max: number; color: string }) {
  const s = score ?? 0;
  const pct = Math.round((s / max) * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-500 w-20 shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs tabular-nums w-12 text-right shrink-0" style={{ color }}>
        {s}/{max}
      </span>
    </div>
  );
}

function ReturnPill({ label, val }: { label: string; val: number | null }) {
  if (val === null) return (
    <div className="text-center">
      <div className="text-[10px] text-slate-400 mb-0.5">{label}</div>
      <div className="text-sm font-bold text-slate-300">—</div>
    </div>
  );
  return (
    <div className="text-center">
      <div className="text-[10px] text-slate-400 mb-0.5">{label}</div>
      <div className={`text-sm font-bold tabular-nums ${returnColorClass(val)}`}>{fmtPct(val)}</div>
    </div>
  );
}

function MaTrendBadge({ trend }: { trend: string }) {
  const { t } = useI18n();
  const cfg: Record<string, { key: string; detail: string; cls: string }> = {
    GOLDEN:  { key: "trend.golden",  detail: "MA5>MA20>MA60", cls: "bg-amber-100 text-amber-700 border border-amber-200" },
    BULLISH: { key: "trend.bullish", detail: "MA5>MA20",      cls: "bg-emerald-100 text-emerald-700 border border-emerald-200" },
    NEUTRAL: { key: "trend.neutral", detail: "",               cls: "bg-slate-100 text-slate-600 border border-slate-200" },
    BEARISH: { key: "trend.bearish", detail: "MA5<MA20",      cls: "bg-slate-100 text-slate-500 border border-slate-200" },
    DEAD:    { key: "trend.dead",    detail: "MA5<MA20<MA60", cls: "bg-red-100 text-red-600 border border-red-200" },
  };
  const c = cfg[trend] ?? cfg.NEUTRAL;
  return (
    <span className={`inline-flex items-center text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${c.cls}`}>
      {t(c.key as Parameters<typeof t>[0])}{c.detail ? ` · ${c.detail}` : ""}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function StockDetailPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = use(params);
  const decoded = decodeURIComponent(symbol);
  const { t, lang } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const source = searchParams.get("source");
  const backHref = getBackHref(returnTo, source, "/screener");
  const backLabel = getBackLabel(source, lang);

  const [data, setData] = useState<AiDecisionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [watched, setWatched] = useState(false);
  const [watchLoading, setWatchLoading] = useState(false);
  const [strategyData, setStrategyData] = useState<StrategyData>(null);
  const [chartVisible, setChartVisible] = useState(false);
  const [financialsVisible, setFinancialsVisible] = useState(false);
  const [chartData, setChartData] = useState<PricePoint[]>([]);
  const [financials, setFinancials] = useState<{
    id: number; fiscalYear: number; quarter: number | null;
    revenue: number | null; operatingProfit: number | null; netProfit: number | null;
    eps: number | null; roe: number | null; equityRatio: number | null; reportedAt: string;
  }[]>([]);
  const [chartPeriod, setChartPeriod] = useState<"30" | "250">("30");
  const [chartFull, setChartFull] = useState<PricePoint[]>([]);

  useEffect(() => {
    const s = decoded;
    Promise.all([
      fetch(`/api/stocks/${encodeURIComponent(s)}/ai-decision`).then((r) => r.json()),
      fetch("/api/watchlist").then((r) => r.json()).then((list: { symbol: string }[]) => {
        setWatched(list.some((w) => w.symbol === s));
      }).catch(() => null),
    ]).then(([d]) => {
      if (d.error) { setError(d.error); setLoading(false); return; }
      setData(d as AiDecisionData);
      setLoading(false);
    }).catch((e) => { setError(e.message); setLoading(false); });
    // Strategy classification (non-blocking)
    fetch(`/api/stocks/${encodeURIComponent(s)}/strategy`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setStrategyData(d); })
      .catch(() => null);
  }, [decoded]);

  // Lazy load chart + financials when expanded
  useEffect(() => {
    if (!chartVisible || chartFull.length > 0) return;
    fetch(`/api/stocks/${encodeURIComponent(decoded)}/indicators`)
      .then((r) => r.json())
      .then((d) => {
        if (d.series) {
          setChartFull(d.series.all ?? []);
        }
      })
      .catch(() => null);
  }, [chartVisible, decoded, chartFull.length]);

  useEffect(() => {
    if (!financialsVisible || financials.length > 0) return;
    fetch(`/api/financials/${encodeURIComponent(decoded)}`)
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setFinancials(d); })
      .catch(() => null);
  }, [financialsVisible, decoded, financials.length]);

  useEffect(() => {
    if (chartFull.length === 0) return;
    setChartData(chartPeriod === "30" ? chartFull.slice(-30) : chartFull.slice(-250));
  }, [chartPeriod, chartFull]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="text-slate-400 text-sm animate-pulse">{t("common.loading")}</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-red-700">
          {t("stock.load_error")}：{error}
        </div>
      </div>
    );
  }

  const { stock, score, indicators: ind, gpt, dailyRec, news } = data;
  const latestClose = ind?.latestClose ?? score?.latestClose ?? 0;
  const latestDate = ind?.latestDate ?? score?.latestDate ?? "";
  const recKey = score?.recommendationV2 ?? score?.recommendation ?? "HOLD";
  const rec = getRec(recKey);
  const recChip = REC_CHIP[recKey] ?? REC_CHIP.HOLD;

  const toggleWatch = async () => {
    setWatchLoading(true);
    if (watched) {
      await fetch(`/api/watchlist?symbol=${encodeURIComponent(stock.symbol)}`, { method: "DELETE" });
      setWatched(false);
    } else {
      await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: stock.symbol, name: stock.name, sector: stock.sector, market: stock.market }),
      });
      setWatched(true);
    }
    setWatchLoading(false);
  };

  // Derive AI summary text
  const aiConclusion = (() => {
    if (lang === "ja-JP" && gpt?.summaryJa) return gpt.summaryJa;
    if (lang === "en-US" && gpt?.summaryEn) return gpt.summaryEn;
    if (gpt?.summaryZh) return gpt.summaryZh;
    return score?.recommendationReason ?? score?.summaryReason ?? null;
  })();

  // top 5 reasons + risks
  const actionReasons = score?.actionReasons ?? [];
  const actionWarnings = score?.actionWarnings ?? [];
  const gptStrengths = gpt?.strengths ?? [];
  const gptRisks = gpt?.risks ?? [];

  // Merge: prefer actionReasons first, then gpt strengths; same for risks
  const topReasons = [...actionReasons, ...gptStrengths.filter((s) => !actionReasons.includes(s))].slice(0, 5);
  const topRisks   = [...actionWarnings, ...gptRisks.filter((r) => !actionWarnings.includes(r))].slice(0, 5);

  // 52w position (0-100%)
  const h52 = stock.high52w;
  const l52 = stock.low52w;
  const w52Pct = (h52 != null && l52 != null && h52 > l52)
    ? Math.round(((latestClose - l52) / (h52 - l52)) * 100)
    : null;

  // Volume ratio
  const volRatio = (ind?.latestVolume != null && ind?.avgVolume20d != null && ind.avgVolume20d > 0)
    ? ind.latestVolume / ind.avgVolume20d
    : null;

  // Risk/reward ratio
  const rrRatio = (score?.target1 != null && score?.entryHigh != null && score?.stopLoss != null &&
    score.entryHigh > score.stopLoss)
    ? ((score.target1 - score.entryHigh) / (score.entryHigh - score.stopLoss))
    : null;

  // RSI label
  const rsi14 = ind?.rsi14 ?? null;
  const rsiLabel = rsi14 == null ? "—"
    : rsi14 >= 80 ? t("rsi.extreme_overbought")
    : rsi14 >= 70 ? t("rsi.overbought")
    : rsi14 >= 60 ? t("rsi.hot")
    : rsi14 <= 30 ? t("rsi.oversold")
    : t("rsi.normal");

  const rsiColor = rsi14 == null ? "text-slate-400"
    : rsi14 >= 70 ? "text-red-600"
    : rsi14 <= 30 ? "text-emerald-600"
    : "text-slate-700";

  return (
    <div className="p-4 md:p-6 max-w-4xl space-y-4">

      {/* ── Back + Watchlist ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => {
            if (returnTo) router.push(returnTo);
            else if (typeof window !== "undefined" && window.history.length > 1) router.back();
            else router.push("/screener");
          }}
          className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
        >
          ← {backLabel}
        </button>
        <button
          onClick={toggleWatch}
          disabled={watchLoading}
          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all disabled:opacity-40 ${
            watched
              ? "bg-yellow-50 border-yellow-200 text-yellow-700 hover:bg-yellow-100"
              : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
          }`}
        >
          {watched ? `★ ${t("nav.watchlist")}` : `☆ ${t("nav.watchlist")}`}
        </button>
      </div>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          {/* Left: name + badges */}
          <div className="flex-1 min-w-0">
            {(() => {
              const nameLines = getNameLines(stock, lang);
              return (
                <>
                  <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 leading-tight tracking-tight">
                    {nameLines[0]}
                  </h1>
                  {nameLines[1] && <p className="text-base text-slate-500 mt-0.5">{nameLines[1]}</p>}
                  {nameLines[2] && <p className="text-sm text-slate-400 mt-0.5">{nameLines[2]}</p>}
                </>
              );
            })()}
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="font-mono text-xs font-semibold bg-slate-100 text-slate-500 px-2 py-0.5 rounded">
                {stock.symbol}
              </span>
              {stock.market && (
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                  {localeMarket(stock.market, lang)}
                </span>
              )}
              {stock.sector && (
                <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">
                  {localeSector(stock.sector, lang)}
                </span>
              )}
            </div>
            {/* AI rating chips */}
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className={`text-sm font-bold px-3 py-1 rounded-full border ${recChip.border} ${recChip.bg} ${recChip.text}`}>
                {rec.label}
              </span>
              {score?.riskLevel && (
                <span className={`text-xs font-semibold ${RISK_COLOR[score.riskLevel] ?? RISK_COLOR.MEDIUM}`}>
                  {t(`risk.${score.riskLevel}` as Parameters<typeof t>[0])}
                </span>
              )}
              {score?.highRiskFlag && (
                <span className="text-xs bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded">
                  ⚠ {t("stock.high_risk")}
                </span>
              )}
              {score?.computedAt && <StalenessTag date={score.computedAt} />}
            </div>
          </div>

          {/* Right: price + adaptive score */}
          <div className="flex flex-row sm:flex-col sm:items-end gap-4 sm:gap-1 flex-wrap">
            <div className="text-right">
              <div className="text-3xl sm:text-4xl font-extrabold text-slate-900 tabular-nums leading-none">
                {fmtJpy(latestClose)}
              </div>
              <div className="text-xs text-slate-400 mt-1">{latestDate} {t("stock.close_label")}</div>
              {ind?.return5d != null && (
                <div className={`text-sm font-semibold mt-1 tabular-nums ${returnColorClass(ind.return5d)}`}>
                  5D {fmtPct(ind.return5d)}
                </div>
              )}
            </div>
            {score?.adaptiveScore != null && (
              <div className="text-right">
                <div
                  className="text-4xl sm:text-5xl font-black tabular-nums leading-none"
                  style={{ color: finalScoreHex(score.adaptiveScore) }}
                >
                  {score.adaptiveScore.toFixed(0)}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">/100 {t("sb.adaptive_score")}</div>
                {score.percentileRank != null && (
                  <div className="text-xs text-slate-500 mt-0.5">
                    {t("common.percentile_prefix")}{score.percentileRank.toFixed(1)}% #{score.marketRank}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Return strip ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3">
        <div className="flex items-center justify-around gap-2 flex-wrap">
          <ReturnPill label={t("stock.5d_return")}  val={ind?.return5d ?? null}  />
          <div className="w-px h-7 bg-slate-100 hidden sm:block" />
          <ReturnPill label={t("stock.20d_return")} val={ind?.return20d ?? null} />
          <div className="w-px h-7 bg-slate-100 hidden sm:block" />
          <ReturnPill label={t("stock.60d_return")} val={ind?.return60d ?? null} />
          <div className="w-px h-7 bg-slate-100 hidden sm:block" />
          <div className="text-center">
            <div className="text-[10px] text-slate-400 mb-0.5">{t("stock.52w_high")}</div>
            <div className="text-sm font-bold text-slate-900 tabular-nums">{fmtJpy(stock.high52w)}</div>
          </div>
          <div className="w-px h-7 bg-slate-100 hidden sm:block" />
          <div className="text-center">
            <div className="text-[10px] text-slate-400 mb-0.5">{t("stock.52w_low")}</div>
            <div className="text-sm font-bold text-slate-900 tabular-nums">{fmtJpy(stock.low52w)}</div>
          </div>
        </div>
      </div>

      {/* ── Section 1: AI Decision Summary ───────────────────────────────── */}
      <SectionCard title={t("ad.title")}>
        {!score ? (
          <p className="text-sm text-slate-400">{t("ad.no_data")}</p>
        ) : (
          <div className="space-y-4">
            {/* Action chip + conclusion */}
            <div className="flex flex-col sm:flex-row sm:items-start gap-3">
              {score.tradingAction && (() => {
                const cfg = ACTION_CFG[score.tradingAction] ?? ACTION_CFG.HOLD;
                return (
                  <span className={`inline-flex items-center gap-1.5 text-sm font-bold px-4 py-1.5 rounded-full border shrink-0 ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                    {t(`action.${score.tradingAction}` as Parameters<typeof t>[0])}
                  </span>
                );
              })()}
              {aiConclusion && (
                <p className="text-sm text-slate-700 leading-relaxed">{aiConclusion}</p>
              )}
            </div>

            {/* Reasons + Risks grid */}
            {(topReasons.length > 0 || topRisks.length > 0) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {topReasons.length > 0 && (
                  <div className="bg-emerald-50 rounded-xl p-3.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 mb-2">
                      {t("ad.top_reasons")}
                    </div>
                    <ul className="space-y-1.5">
                      {topReasons.map((r, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-slate-700">
                          <span className="text-emerald-500 shrink-0 mt-0.5">▸</span>
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {topRisks.length > 0 && (
                  <div className="bg-red-50 rounded-xl p-3.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-red-600 mb-2">
                      {t("ad.top_risks")}
                    </div>
                    <ul className="space-y-1.5">
                      {topRisks.map((r, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-slate-700">
                          <span className="text-red-400 shrink-0 mt-0.5">▸</span>
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* GPT time horizon */}
            {gpt?.timeHorizon && (
              <div className="text-xs text-slate-500 border-t border-slate-100 pt-3">
                {t("gpt.time_horizon")}: <span className="font-medium text-slate-700">{gpt.timeHorizon}</span>
              </div>
            )}
          </div>
        )}
      </SectionCard>

      {/* ── Strategy Recommendation (v15.0) ──────────────────────────────── */}
      {strategyData?.classification && (() => {
        const c = strategyData.classification;
        const stype = c.strategyType as "DAY" | "SWING" | "POSITION";
        const stratColor = stype === "DAY" ? "#f59e0b" : stype === "SWING" ? "#3b82f6" : "#10b981";
        const stratBg    = stype === "DAY" ? "bg-amber-50"   : stype === "SWING" ? "bg-blue-50"   : "bg-emerald-50";
        const stratText  = stype === "DAY" ? "text-amber-700" : stype === "SWING" ? "text-blue-700" : "text-emerald-700";
        const stratBorder = stype === "DAY" ? "border-amber-200" : stype === "SWING" ? "border-blue-200" : "border-emerald-200";
        const bs = strategyData.backtestStats;
        return (
          <div className={`rounded-2xl border ${stratBorder} ${stratBg} p-4 flex flex-col sm:flex-row sm:items-center gap-3`}>
            <div className="flex items-center gap-3 flex-1">
              <span className={`text-sm font-bold px-3 py-1 rounded-full border ${stratBorder} bg-white ${stratText} shrink-0`}
                style={{ borderColor: stratColor }}>
                {t(`strategy.${stype}` as Parameters<typeof t>[0])}
              </span>
              <div className="min-w-0">
                <div className={`text-xs font-medium ${stratText}`}>{t("strategy.detail_title")}</div>
                <div className="text-xs text-slate-500 mt-0.5">{t(`strategy.${stype}.desc` as Parameters<typeof t>[0])}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 text-xs shrink-0">
              <div className="text-center">
                <div className="text-slate-400">{t("strategy.confidence")}</div>
                <div className={`font-bold ${stratText}`}>{c.confidence}%</div>
              </div>
              <div className="text-center">
                <div className="text-slate-400">{t("strategy.target_return")}</div>
                <div className="font-bold text-emerald-600">+{c.targetReturnPct}%</div>
              </div>
              <div className="text-center">
                <div className="text-slate-400">{t("strategy.stop_loss")}</div>
                <div className="font-bold text-red-600">{c.stopLossPct}%</div>
              </div>
              <div className="text-center">
                <div className="text-slate-400">{t("strategy.max_days")}</div>
                <div className="font-bold text-slate-700">{c.maxHoldingDays}{t("strategy.days_unit")}</div>
              </div>
              {bs && bs.sampleCount >= 10 && (
                <div className="text-center">
                  <div className="text-slate-400">{t("strategy.win_rate")}</div>
                  <div className={`font-bold ${bs.winRate != null && bs.winRate >= 55 ? "text-emerald-600" : "text-amber-600"}`}>
                    {bs.winRate != null ? `${bs.winRate.toFixed(1)}%` : "—"}
                  </div>
                  <div className="text-slate-400 text-[10px]">n={bs.sampleCount}</div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Section 2: Trading Plan ───────────────────────────────────────── */}
      <SectionCard title={t("tp.title")}>
        {!score?.tradingAction || (score.entryLow == null && score.entryHigh == null && score.stopLoss == null) ? (
          <p className="text-sm text-slate-400">{t("tp.no_plan")}</p>
        ) : (
          <div className="space-y-4">
            {/* Price grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
              {score.entryLow != null && (
                <div className="bg-slate-50 rounded-xl p-3 text-center">
                  <div className="text-[10px] text-slate-400 mb-1">{t("tp.entry_low")}</div>
                  <div className="text-sm font-bold text-slate-800 tabular-nums">{fmtJpy(score.entryLow)}</div>
                </div>
              )}
              {score.entryHigh != null && (
                <div className="bg-slate-50 rounded-xl p-3 text-center">
                  <div className="text-[10px] text-slate-400 mb-1">{t("tp.entry_high")}</div>
                  <div className="text-sm font-bold text-slate-800 tabular-nums">{fmtJpy(score.entryHigh)}</div>
                </div>
              )}
              {score.stopLoss != null && (
                <div className="bg-red-50 rounded-xl p-3 text-center">
                  <div className="text-[10px] text-red-400 mb-1">{t("tp.stop_loss")}</div>
                  <div className="text-sm font-bold text-red-600 tabular-nums">{fmtJpy(score.stopLoss)}</div>
                </div>
              )}
              {score.target1 != null && (
                <div className="bg-emerald-50 rounded-xl p-3 text-center">
                  <div className="text-[10px] text-emerald-500 mb-1">{t("tp.target1")}</div>
                  <div className="text-sm font-bold text-emerald-600 tabular-nums">{fmtJpy(score.target1)}</div>
                </div>
              )}
              {score.target2 != null && (
                <div className="bg-emerald-50 rounded-xl p-3 text-center">
                  <div className="text-[10px] text-emerald-500 mb-1">{t("tp.target2")}</div>
                  <div className="text-sm font-bold text-emerald-600 tabular-nums">{fmtJpy(score.target2)}</div>
                </div>
              )}
            </div>

            {/* Position + R/R */}
            <div className="flex flex-wrap gap-4">
              {score.positionSizePct != null && (
                <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-4 py-2.5">
                  <div className="text-[10px] text-slate-400">{t("tp.position")}</div>
                  <div className="text-xl font-extrabold tabular-nums text-slate-800">
                    {score.positionSizePct.toFixed(0)}%
                  </div>
                </div>
              )}
              {rrRatio != null && (
                <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-4 py-2.5">
                  <div className="text-[10px] text-slate-400">{t("tp.rr_ratio")}</div>
                  <div className={`text-xl font-extrabold tabular-nums ${rrRatio >= 2 ? "text-emerald-600" : rrRatio >= 1 ? "text-amber-600" : "text-red-600"}`}>
                    {rrRatio.toFixed(1)}x
                  </div>
                </div>
              )}
            </div>

            <p className="text-[10px] text-slate-400">{t("ai_action.disclaimer")}</p>
          </div>
        )}
      </SectionCard>

      {/* ── Section 3: Score Breakdown ────────────────────────────────────── */}
      <SectionCard title={t("sb.title")}>
        {!score ? (
          <p className="text-sm text-slate-400">{t("stock.no_score")}</p>
        ) : (
          <div className="space-y-3">
            {/* Dimension bars */}
            <div className="space-y-2.5">
              <ScoreBar label={t("score.technical")}    score={score.technicalScore}     max={30} color="#3b82f6" />
              <ScoreBar label={t("score.fundamental")}  score={score.fundamentalScore}   max={25} color="#10b981" />
              <ScoreBar label={t("score.money_flow")}   score={score.moneyFlowScore}     max={20} color="#8b5cf6" />
              <ScoreBar label={t("score.sentiment")}    score={score.newsSentimentScore} max={15} color="#f59e0b" />
              <ScoreBar label={t("score.trend")}        score={score.globalTrendScore}   max={10} color="#06b6d4" />
            </div>

            {/* Meta row */}
            <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-4 text-xs text-slate-500">
              {score.stockStyle && (
                <span>{t("stock.style_label")}：
                  <strong className="text-slate-700">{t(`style.${score.stockStyle}` as Parameters<typeof t>[0])}</strong>
                </span>
              )}
              {score.percentileRank != null && (
                <span>{t("sb.market_rank")}：
                  <strong className="text-slate-700">#{score.marketRank}</strong>
                  <span className="text-slate-400"> ({t("common.percentile_prefix")}{score.percentileRank.toFixed(1)}%)</span>
                </span>
              )}
              {score.overallConfidence != null && (
                <span>{t("stock.confidence")}：
                  <strong className={score.overallConfidence >= 60 ? "text-emerald-600" : "text-amber-600"}>
                    {score.overallConfidence.toFixed(0)}%
                  </strong>
                </span>
              )}
            </div>

            {/* News summary */}
            {score.newsSummary && (
              <div className="bg-amber-50 rounded-xl px-3.5 py-3 text-xs text-slate-700 leading-relaxed border border-amber-100">
                <span className="font-semibold text-amber-700 mr-1">{t("score.news_sentiment")}</span>
                {score.newsSummary}
              </div>
            )}
          </div>
        )}
      </SectionCard>

      {/* ── Section 4: Technical Status ───────────────────────────────────── */}
      <SectionCard title={t("ts.title")}>
        {!ind ? (
          <p className="text-sm text-slate-400">{t("common.no_data")}</p>
        ) : (
          <div className="space-y-4">
            {/* maTrend badge */}
            <div className="flex items-center gap-3 flex-wrap">
              <MaTrendBadge trend={ind.maTrend} />
              {ind.macdSignalLabel !== "NEUTRAL" && (
                <span className={`text-xs px-2 py-0.5 rounded-full border ${
                  ind.macdSignalLabel === "BUY"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-red-50 text-red-700 border-red-200"
                }`}>
                  MACD: {ind.macdSignalLabel === "BUY" ? t("macd.bullish") : t("macd.bearish")}
                </span>
              )}
            </div>

            {/* MA grid */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: "MA5",  val: ind.ma5  },
                { key: "MA20", val: ind.ma20 },
                { key: "MA60", val: ind.ma60 },
              ].map(({ key, val }) => {
                const diff = val ? ((latestClose - val) / val) * 100 : null;
                return (
                  <div key={key} className="bg-slate-50 rounded-xl p-3 text-center">
                    <div className="text-[10px] text-slate-400 mb-1">{key}</div>
                    <div className="text-base font-bold text-slate-900 tabular-nums">{fmtJpy(val)}</div>
                    {diff !== null && (
                      <div className={`text-[10px] font-medium mt-0.5 tabular-nums ${returnColorClass(diff)}`}>
                        {fmtPct(diff, 2)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* RSI + 52w + volume row */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {/* RSI */}
              <div className="bg-slate-50 rounded-xl p-3">
                <div className="text-[10px] text-slate-400 mb-1">RSI (14)</div>
                <div className={`text-xl font-bold tabular-nums ${rsiColor}`}>
                  {rsi14 != null ? rsi14.toFixed(1) : "—"}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">{rsiLabel}</div>
                {rsi14 != null && (
                  <div className="mt-2 w-full bg-slate-200 rounded-full h-1.5 overflow-hidden relative">
                    <div className="absolute left-[30%] top-0 w-px h-full bg-blue-300" />
                    <div className="absolute left-[70%] top-0 w-px h-full bg-red-300" />
                    <div
                      className={`h-full rounded-full ${rsi14 >= 70 ? "bg-red-400" : rsi14 <= 30 ? "bg-emerald-400" : "bg-slate-400"}`}
                      style={{ width: `${rsi14}%` }}
                    />
                  </div>
                )}
              </div>

              {/* 52W position */}
              <div className="bg-slate-50 rounded-xl p-3">
                <div className="text-[10px] text-slate-400 mb-1">{t("ts.52w_pos")}</div>
                {w52Pct != null ? (
                  <>
                    <div className="text-xl font-bold tabular-nums text-slate-800">{w52Pct}%</div>
                    <div className="mt-2 w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${w52Pct >= 80 ? "bg-red-400" : w52Pct >= 50 ? "bg-amber-400" : "bg-emerald-400"}`}
                        style={{ width: `${w52Pct}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[9px] text-slate-400 mt-0.5">
                      <span>{t("stock.52w_low")}</span><span>{t("stock.52w_high")}</span>
                    </div>
                  </>
                ) : (
                  <div className="text-xl font-bold text-slate-300">—</div>
                )}
              </div>

              {/* Volume ratio */}
              <div className="bg-slate-50 rounded-xl p-3">
                <div className="text-[10px] text-slate-400 mb-1">{t("ts.volume_ratio")}</div>
                {volRatio != null ? (
                  <>
                    <div className={`text-xl font-bold tabular-nums ${volRatio >= 2 ? "text-red-600" : volRatio >= 1.5 ? "text-amber-600" : "text-slate-700"}`}>
                      {volRatio.toFixed(2)}x
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">vs 20D avg</div>
                  </>
                ) : (
                  <div className="text-xl font-bold text-slate-300">—</div>
                )}
              </div>
            </div>
          </div>
        )}
      </SectionCard>

      {/* ── Section 5: News & Events ──────────────────────────────────────── */}
      <SectionCard title={t("ne.title")}>
        {news.length === 0 ? (
          <p className="text-sm text-slate-400">{t("news.no_data")}</p>
        ) : (
          <div className="space-y-2.5">
            {news.map((item) => {
              const sentimentColor =
                item.sentiment === "POSITIVE" ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                : item.sentiment === "NEGATIVE" ? "bg-red-50 text-red-700 border-red-100"
                : "bg-slate-50 text-slate-500 border-slate-100";
              const sentimentEmoji =
                item.sentiment === "POSITIVE" ? "🟢" : item.sentiment === "NEGATIVE" ? "🔴" : "⚪";
              const displayUrl = item.url.startsWith("tdnet:") ? item.url.slice(6) : item.url;
              return (
                <a
                  key={item.id}
                  href={displayUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 p-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 leading-snug line-clamp-2">{item.title}</div>
                    <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-400">
                      <span>{item.source}</span>
                      {item.publishedAt && (
                        <>
                          <span>·</span>
                          <span>{new Date(item.publishedAt).toLocaleDateString(lang, { month: "numeric", day: "numeric" })}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded border ${sentimentColor}`}>
                    {sentimentEmoji}
                  </span>
                </a>
              );
            })}
            <div className="pt-1">
              <button
                onClick={() => router.push(`/news?symbol=${encodeURIComponent(stock.symbol)}`)}
                className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
              >
                {t("ne.more")} →
              </button>
            </div>
          </div>
        )}
      </SectionCard>

      {/* ── Section 6: Peer Comparison (Phase 2 placeholder) ─────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">{t("pc.title")}</h2>
          <span className="text-[10px] bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full">
            {t("pc.phase2")}
          </span>
        </div>
        <div className="p-5 text-center py-8">
          <div className="text-slate-300 text-3xl mb-2">⊞</div>
          <p className="text-sm text-slate-400">{t("pc.phase2")}</p>
        </div>
      </div>

      {/* ── Collapsible: Price Chart ──────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <button
          onClick={() => setChartVisible((v) => !v)}
          className="w-full px-5 py-3.5 border-b border-slate-100 flex items-center justify-between hover:bg-slate-50 transition-colors"
        >
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">{t("detail.chart_title")}</h2>
          <span className="text-xs text-slate-400">{chartVisible ? t("detail.collapse") : t("detail.expand")}</span>
        </button>
        {chartVisible && (
          <div className="p-5">
            <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-4 w-fit">
              {(["30", "250"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setChartPeriod(p)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                    chartPeriod === p ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {p === "30" ? "30D" : "250D (~1Y)"}
                </button>
              ))}
            </div>
            {chartData.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-slate-400 text-sm animate-pulse">
                {t("common.loading")}
              </div>
            ) : (
              <>
                <PriceChart data={chartData} height={300} showVolume />
                <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-4 text-xs text-slate-500">
                  {[["MA5", ind?.ma5], ["MA20", ind?.ma20], ["MA60", ind?.ma60]].map(([k, v]) => (
                    <span key={k as string}>{k}: <b className="text-slate-700">{v ? `¥${(v as number).toLocaleString()}` : "—"}</b></span>
                  ))}
                  <span>RSI: <b className="text-slate-700">{rsi14?.toFixed(1) ?? "—"}</b></span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Collapsible: Financials ───────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <button
          onClick={() => setFinancialsVisible((v) => !v)}
          className="w-full px-5 py-3.5 border-b border-slate-100 flex items-center justify-between hover:bg-slate-50 transition-colors"
        >
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">{t("detail.financials_title")}</h2>
          <span className="text-xs text-slate-400">{financialsVisible ? t("detail.collapse") : t("detail.expand")}</span>
        </button>
        {financialsVisible && (
          <div className="overflow-x-auto">
            {financials.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">{t("stock.no_financials")}</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 border-b border-slate-100 bg-slate-50">
                    <th className="px-5 py-2.5 font-medium">{t("fin.period")}</th>
                    <th className="px-3 py-2.5 font-medium text-right">{t("fin.revenue")}</th>
                    <th className="px-3 py-2.5 font-medium text-right">{t("fin.op_profit")}</th>
                    <th className="px-3 py-2.5 font-medium text-right">{t("fin.net_profit")}</th>
                    <th className="px-3 py-2.5 font-medium text-right">EPS</th>
                    <th className="px-3 py-2.5 font-medium text-right">ROE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {[...financials]
                    .sort((a, b) => b.fiscalYear - a.fiscalYear || (b.quarter ?? 99) - (a.quarter ?? 99))
                    .map((f) => (
                      <tr key={f.id} className="hover:bg-slate-50">
                        <td className="px-5 py-2.5 font-medium text-slate-900">
                          {lang === "ja-JP"
                            ? `${f.fiscalYear}年${f.quarter ? `Q${f.quarter}` : t("fin.full_year")}`
                            : lang === "en-US"
                            ? `FY${f.fiscalYear}${f.quarter ? ` Q${f.quarter}` : ""}`
                            : `${f.fiscalYear}年${f.quarter ? ` Q${f.quarter}` : t("fin.full_year")}`}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                          {f.revenue != null ? (Math.abs(f.revenue) >= 1e8 ? `${(f.revenue / 1e8).toFixed(1)}億` : f.revenue.toLocaleString()) : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                          {f.operatingProfit != null ? (Math.abs(f.operatingProfit) >= 1e8 ? `${(f.operatingProfit / 1e8).toFixed(1)}億` : f.operatingProfit.toLocaleString()) : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                          {f.netProfit != null ? (Math.abs(f.netProfit) >= 1e8 ? `${(f.netProfit / 1e8).toFixed(1)}億` : f.netProfit.toLocaleString()) : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                          {f.eps != null ? `¥${f.eps.toFixed(2)}` : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                          {f.roe != null ? `${(f.roe < 1.5 ? f.roe * 100 : f.roe).toFixed(1)}%` : "—"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
