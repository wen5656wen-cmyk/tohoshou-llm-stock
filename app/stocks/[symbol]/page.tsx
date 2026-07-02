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
import { EXCLUDE_REASON_CODES } from "@/lib/ai-universe";
import type { MessageKey } from "@/lib/i18n/types";

// ── Types ─────────────────────────────────────────────────────────────────────

type PricePoint = { date: string; open?: number; high?: number; low?: number; close: number; volume?: number };

type StockInfo = {
  symbol: string; name: string; nameZh: string | null; nameEn: string | null;
  sector: string | null; industry: string | null; market: string | null;
  high52w: number | null; low52w: number | null;
  aiEnabled?: boolean; excludeReason?: string | null;
};

type ScoreData = {
  computedAt: string | null; latestClose: number | null; latestDate: string | null;
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

type PerfStats = {
  total: number; wins: number; losses: number;
  winRate: number; avgReturnPct: number | null; avgAlphaPct: number | null;
};

type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "EXTREME";

type IntelData = {
  stock: StockInfo;
  score: ScoreData | null;
  indicators: IndicatorData | null;
  gpt: GptData | null;
  dailyRec: DailyRecData | null;
  news: NewsItem[];
  strategy: {
    classification: {
      strategyType: string; confidence: number;
      targetReturnPct: number; stopLossPct: number; maxHoldingDays: number;
    } | null;
  };
  riskAnalysis: {
    overall: RiskLevel; technical: RiskLevel; news: RiskLevel;
    fundamental: RiskLevel; volatility: RiskLevel;
  } | null;
  historicalPerf: {
    sampleCount: number;
    overall: PerfStats | null;
    byStrategy: { DAY: PerfStats | null; SWING: PerfStats | null; POSITION: PerfStats | null };
  };
  sectorComparison: {
    sectorAvg: number; sectorRank: number | null; sectorTotal: number;
    myScore: number;
    topStocks: Array<{
      symbol: string; name: string; nameZh: string | null;
      adaptiveScore: number | null; recommendation: string | null; isCurrent: boolean;
    }>;
  } | null;
};

// ── Style constants ───────────────────────────────────────────────────────────

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

const RISK_BADGE: Record<string, { bg: string; text: string; dot: string }> = {
  LOW:     { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-400" },
  MEDIUM:  { bg: "bg-amber-50",   text: "text-amber-700",   dot: "bg-amber-400"   },
  HIGH:    { bg: "bg-red-50",     text: "text-red-700",     dot: "bg-red-500"     },
  EXTREME: { bg: "bg-red-100",    text: "text-red-800",     dot: "bg-red-600"     },
};

const STRATEGY_CFG: Record<string, { bg: string; text: string; border: string; color: string }> = {
  DAY:      { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200",   color: "#f59e0b" },
  SWING:    { bg: "bg-blue-50",    text: "text-blue-700",    border: "border-blue-200",    color: "#3b82f6" },
  POSITION: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", color: "#10b981" },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function Skel({ className = "" }: { className?: string }) {
  return <div className={`bg-slate-100 rounded animate-pulse ${className}`} />;
}

function SkelCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100"><Skel className="h-3 w-28" /></div>
      <div className="p-5 space-y-3">
        {Array.from({ length: lines }, (_, i) => (
          <Skel key={i} className={`h-3 ${i === 0 ? "w-3/4" : i === lines - 1 ? "w-1/2" : "w-full"}`} />
        ))}
      </div>
    </div>
  );
}

function SectionCard({ title, badge, children, className = "" }: {
  title: string; badge?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden ${className}`}>
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">{title}</h2>
        {badge}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function ScoreBar({ label, score, max, color, desc }: {
  label: string; score: number | null; max: number; color: string; desc?: string;
}) {
  const s = score ?? 0;
  const pct = Math.round((s / max) * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-500 w-20 shrink-0">{label}</span>
        <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
        </div>
        <span className="text-xs tabular-nums w-12 text-right shrink-0 font-medium" style={{ color }}>
          {s}/{max}
        </span>
      </div>
      {desc && <div className="text-[10px] text-slate-400 pl-[92px]">{desc}</div>}
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

function RiskBadge({ level }: { level: RiskLevel }) {
  const { t } = useI18n();
  const cfg = RISK_BADGE[level] ?? RISK_BADGE.MEDIUM;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      {t(`risk.${level}` as Parameters<typeof t>[0])}
    </span>
  );
}

function PerfCell({ stats, label }: { stats: PerfStats | null; label: string }) {
  const { t } = useI18n();
  if (!stats) return (
    <div className="text-center py-3">
      <div className="text-[10px] text-slate-400 mb-1 font-medium uppercase">{label}</div>
      <div className="text-xs text-slate-300">{t("ai_hist.collecting")}</div>
    </div>
  );
  return (
    <div className="text-center py-2 px-1">
      <div className="text-[10px] text-slate-500 mb-1.5 font-semibold uppercase tracking-wide">{label}</div>
      <div className="text-lg font-black tabular-nums text-slate-800">{stats.winRate.toFixed(1)}%</div>
      <div className="text-[10px] text-slate-400 mt-0.5">{t("ai_hist.wins")} {stats.wins} / {t("ai_hist.losses")} {stats.losses}</div>
      {stats.avgReturnPct != null && (
        <div className={`text-xs font-bold mt-1 tabular-nums ${returnColorClass(stats.avgReturnPct)}`}>
          {fmtPct(stats.avgReturnPct)}
        </div>
      )}
    </div>
  );
}

// ── AI Universe admin control (P1-T1) ──────────────────────────────────────────

function AiUniverseControl({
  symbol,
  aiEnabled,
  excludeReason,
  onUpdate,
  t,
}: {
  symbol: string;
  aiEnabled: boolean;
  excludeReason: string | null;
  onUpdate: (aiEnabled: boolean, excludeReason: string | null) => void;
  t: (k: MessageKey) => string;
}) {
  const [saving, setSaving] = useState(false);
  const [reasonSel, setReasonSel] = useState<string>(excludeReason ?? "LOW_GROWTH");

  async function submit(nextEnabled: boolean) {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/stocks/${encodeURIComponent(symbol)}/ai-universe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          nextEnabled ? { aiEnabled: true } : { aiEnabled: false, excludeReason: reasonSel }
        ),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      onUpdate(json.stock.aiEnabled, json.stock.excludeReason ?? null);
    } catch {
      // no-op; button re-enables so the operator can retry
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={`rounded-2xl border shadow-sm p-4 ${
        aiEnabled ? "bg-white border-slate-200" : "bg-amber-50 border-amber-200"
      }`}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-700">{t("universe.title")}</span>
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              aiEnabled ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
            }`}
          >
            {aiEnabled
              ? t("universe.enabled_label")
              : `${t("universe.excluded_label")} · ${t(`universe.reason.${excludeReason ?? "OTHER"}` as MessageKey)}`}
          </span>
        </div>
        {aiEnabled ? (
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={reasonSel}
              onChange={(e) => setReasonSel(e.target.value)}
              className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              {EXCLUDE_REASON_CODES.map((code) => (
                <option key={code} value={code}>
                  {t(`universe.reason.${code}` as MessageKey)}
                </option>
              ))}
            </select>
            <button
              onClick={() => submit(false)}
              disabled={saving}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors disabled:opacity-40"
            >
              {saving ? t("universe.updating") : t("universe.remove")}
            </button>
          </div>
        ) : (
          <button
            onClick={() => submit(true)}
            disabled={saving}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-emerald-300 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors disabled:opacity-40"
          >
            {saving ? t("universe.updating") : t("universe.add")}
          </button>
        )}
      </div>
    </div>
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
  const source   = searchParams.get("source");
  const backHref  = getBackHref(returnTo, source, "/screener");
  const backLabel = getBackLabel(source, lang);

  const [data,    setData]    = useState<IntelData | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const [watched, setWatched] = useState(false);
  const [watchLoading, setWatchLoading] = useState(false);

  // Collapsible sections
  const [chartVisible,      setChartVisible]      = useState(false);
  const [financialsVisible, setFinancialsVisible] = useState(false);

  // Chart data
  const [chartData,   setChartData]   = useState<PricePoint[]>([]);
  const [chartFull,   setChartFull]   = useState<PricePoint[]>([]);
  const [chartPeriod, setChartPeriod] = useState<"30" | "250">("30");

  // Financials
  const [financials, setFinancials] = useState<{
    id: number; fiscalYear: number; quarter: number | null;
    revenue: number | null; operatingProfit: number | null; netProfit: number | null;
    eps: number | null; roe: number | null; equityRatio: number | null; reportedAt: string;
  }[]>([]);

  // ── Data fetch ───────────────────────────────────────────────────────────
  useEffect(() => {
    const s = decoded;
    Promise.all([
      fetch(`/api/stocks/${encodeURIComponent(s)}/intelligence`).then(r => r.json()),
      fetch("/api/watchlist").then(r => r.json()).then((list: { symbol: string }[]) => {
        setWatched(list.some(w => w.symbol === s));
      }).catch(() => null),
    ]).then(([d]) => {
      if (d.error) { setError(d.error); return; }
      setData(d as IntelData);
    }).catch(e => setError(e.message));
  }, [decoded]);

  useEffect(() => {
    if (!chartVisible || chartFull.length > 0) return;
    fetch(`/api/stocks/${encodeURIComponent(decoded)}/indicators`)
      .then(r => r.json())
      .then(d => { if (d.series) setChartFull(d.series.all ?? []); })
      .catch(() => null);
  }, [chartVisible, decoded, chartFull.length]);

  useEffect(() => {
    if (!financialsVisible || financials.length > 0) return;
    fetch(`/api/financials/${encodeURIComponent(decoded)}`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setFinancials(d); })
      .catch(() => null);
  }, [financialsVisible, decoded, financials.length]);

  useEffect(() => {
    if (chartFull.length === 0) return;
    setChartData(chartPeriod === "30" ? chartFull.slice(-30) : chartFull.slice(-250));
  }, [chartPeriod, chartFull]);

  const toggleWatch = async () => {
    if (!data) return;
    setWatchLoading(true);
    const { stock } = data;
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

  // ── Error state ──────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-red-700">
          {t("stock.load_error")}：{error}
        </div>
      </div>
    );
  }

  // ── Skeleton state ───────────────────────────────────────────────────────
  if (!data) {
    return (
      <div className="p-4 md:p-6 max-w-5xl space-y-4">
        <div className="flex items-center justify-between">
          <Skel className="h-4 w-24" />
          <Skel className="h-8 w-20 rounded-lg" />
        </div>
        {/* Hero skeleton */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex justify-between gap-4">
            <div className="space-y-3 flex-1">
              <Skel className="h-8 w-48" />
              <Skel className="h-4 w-32" />
              <div className="flex gap-2"><Skel className="h-6 w-16 rounded-full" /><Skel className="h-6 w-20 rounded-full" /></div>
            </div>
            <div className="space-y-2 text-right"><Skel className="h-10 w-28" /><Skel className="h-12 w-20" /></div>
          </div>
        </div>
        <Skel className="h-14 w-full rounded-2xl" />
        <SkelCard lines={5} />
        <SkelCard lines={4} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SkelCard lines={5} />
          <SkelCard lines={5} />
        </div>
        <SkelCard lines={4} />
        <SkelCard lines={3} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SkelCard lines={4} />
          <SkelCard lines={4} />
        </div>
      </div>
    );
  }

  // ── Destructure ───────────────────────────────────────────────────────────
  const { stock, score, indicators: ind, gpt, dailyRec, news,
          strategy, riskAnalysis, historicalPerf, sectorComparison } = data;

  const latestClose = ind?.latestClose ?? score?.latestClose ?? 0;
  const latestDate  = ind?.latestDate  ?? score?.latestDate  ?? "";
  const recKey   = score?.recommendationV2 ?? score?.recommendation ?? "HOLD";
  const rec      = getRec(recKey);
  const recChip  = REC_CHIP[recKey] ?? REC_CHIP.HOLD;

  const aiConclusion = (() => {
    if (lang === "ja-JP" && gpt?.summaryJa) return gpt.summaryJa;
    if (lang === "en-US" && gpt?.summaryEn) return gpt.summaryEn;
    if (gpt?.summaryZh) return gpt.summaryZh;
    return score?.recommendationReason ?? score?.summaryReason ?? null;
  })();

  const topReasons = [...(score?.actionReasons ?? []), ...(gpt?.strengths ?? []).filter(s => !(score?.actionReasons ?? []).includes(s))].slice(0, 5);
  const topRisks   = [...(score?.actionWarnings ?? []), ...(gpt?.risks ?? []).filter(r => !(score?.actionWarnings ?? []).includes(r))].slice(0, 5);

  const h52 = stock.high52w; const l52 = stock.low52w;
  const w52Pct = (h52 != null && l52 != null && h52 > l52)
    ? Math.round(((latestClose - l52) / (h52 - l52)) * 100) : null;

  const volRatio = (ind?.latestVolume != null && ind?.avgVolume20d != null && ind.avgVolume20d > 0)
    ? ind.latestVolume / ind.avgVolume20d : null;

  const rrRatio = (score?.target1 != null && score?.entryHigh != null && score?.stopLoss != null && score.entryHigh > score.stopLoss)
    ? (score.target1 - score.entryHigh) / (score.entryHigh - score.stopLoss) : null;

  const rsi14 = ind?.rsi14 ?? null;
  const rsiLabel = rsi14 == null ? "—"
    : rsi14 >= 80 ? t("rsi.extreme_overbought")
    : rsi14 >= 70 ? t("rsi.overbought")
    : rsi14 >= 60 ? t("rsi.hot")
    : rsi14 <= 30 ? t("rsi.oversold")
    : t("rsi.normal");
  const rsiColor = rsi14 == null ? "text-slate-400" : rsi14 >= 70 ? "text-red-600" : rsi14 <= 30 ? "text-emerald-600" : "text-slate-700";

  const stratC = strategy.classification;
  const stratKey = (stratC?.strategyType ?? "SWING") as "DAY" | "SWING" | "POSITION";
  const stratStyle = STRATEGY_CFG[stratKey] ?? STRATEGY_CFG.SWING;

  // Score dimension descriptions
  const scoreDescs = {
    technical:   score?.technicalScore != null
      ? (score.technicalScore >= 24 ? t("ai_risk.tech.LOW") : score.technicalScore >= 16 ? t("ai_risk.tech.MEDIUM") : t("ai_risk.tech.HIGH"))
      : "",
    fundamental: score?.fundamentalScore != null
      ? (score.fundamentalScore >= 20 ? t("ai_risk.fund.LOW") : score.fundamentalScore >= 13 ? t("ai_risk.fund.MEDIUM") : t("ai_risk.fund.HIGH"))
      : "",
    moneyFlow:   score?.moneyFlowScore != null
      ? (score.moneyFlowScore >= 14 ? t("ai_risk.news.LOW") : score.moneyFlowScore >= 9 ? t("ai_risk.news.MEDIUM") : t("ai_risk.news.HIGH"))
      : "",
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl space-y-4">

      {/* ── Nav bar ───────────────────────────────────────────────────────── */}
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

      {/* ── AI Universe admin control (P1-T1) ─────────────────────────────── */}
      <AiUniverseControl
        symbol={stock.symbol}
        aiEnabled={stock.aiEnabled ?? true}
        excludeReason={stock.excludeReason ?? null}
        onUpdate={(aiEnabled, excludeReason) =>
          setData((prev) => (prev ? { ...prev, stock: { ...prev.stock, aiEnabled, excludeReason } } : prev))
        }
        t={t}
      />

      {/* ── ① Hero ───────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex-1 min-w-0">
            {(() => {
              const nameLines = getNameLines(stock, lang);
              return (
                <>
                  <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 leading-tight tracking-tight">{nameLines[0]}</h1>
                  {nameLines[1] && <p className="text-base text-slate-500 mt-0.5">{nameLines[1]}</p>}
                  {nameLines[2] && <p className="text-sm text-slate-400 mt-0.5">{nameLines[2]}</p>}
                </>
              );
            })()}
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="font-mono text-xs font-semibold bg-slate-100 text-slate-500 px-2 py-0.5 rounded">{stock.symbol}</span>
              {stock.market && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{localeMarket(stock.market, lang)}</span>}
              {stock.sector && <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">{localeSector(stock.sector, lang)}</span>}
              {stock.industry && <span className="text-xs bg-slate-50 text-slate-400 px-2 py-0.5 rounded">{stock.industry}</span>}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className={`text-sm font-bold px-3 py-1 rounded-full border ${recChip.border} ${recChip.bg} ${recChip.text}`}>{rec.label}</span>
              {stratC && (
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${stratStyle.border} ${stratStyle.bg} ${stratStyle.text}`}>
                  {t(`strategy.${stratKey}` as Parameters<typeof t>[0])}
                </span>
              )}
              {score?.highRiskFlag && (
                <span className="text-xs bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded">⚠ {t("stock.high_risk")}</span>
              )}
              {score?.computedAt && <StalenessTag date={score.computedAt} />}
            </div>
          </div>
          <div className="flex flex-row sm:flex-col sm:items-end gap-4 sm:gap-1 flex-wrap">
            <div className="text-right">
              <div className="text-3xl sm:text-4xl font-extrabold text-slate-900 tabular-nums leading-none">{fmtJpy(latestClose)}</div>
              <div className="text-xs text-slate-400 mt-1">{latestDate} {t("stock.close_label")}</div>
              {ind?.return5d != null && (
                <div className={`text-sm font-semibold mt-1 tabular-nums ${returnColorClass(ind.return5d)}`}>5D {fmtPct(ind.return5d)}</div>
              )}
            </div>
            {score?.adaptiveScore != null && (
              <div className="text-right">
                <div className="text-4xl sm:text-5xl font-black tabular-nums leading-none" style={{ color: finalScoreHex(score.adaptiveScore) }}>
                  {score.adaptiveScore.toFixed(0)}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">/100 {t("sb.adaptive_score")}</div>
                {score.percentileRank != null && (
                  <div className="text-xs text-slate-500 mt-0.5">{t("common.percentile_prefix")}{score.percentileRank.toFixed(1)}% #{score.marketRank}</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Return strip ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3">
        <div className="flex items-center justify-around gap-2 flex-wrap">
          <ReturnPill label={t("stock.5d_return")}  val={ind?.return5d  ?? null} />
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

      {/* ── ② AI 决策中心 ─────────────────────────────────────────────────── */}
      <SectionCard title={t("ad.title")}
        badge={score?.overallConfidence != null ? (
          <span className="text-xs font-bold text-slate-500 tabular-nums">
            {t("strategy.confidence")} <span className={score.overallConfidence >= 70 ? "text-emerald-600" : score.overallConfidence >= 50 ? "text-amber-600" : "text-red-600"}>
              {score.overallConfidence.toFixed(0)}%
            </span>
          </span>
        ) : undefined}
      >
        {!score ? (
          <p className="text-sm text-slate-400">{t("ad.no_data")}</p>
        ) : (
          <div className="space-y-4">
            {/* Action + Strategy + Summary row */}
            <div className="flex flex-wrap items-start gap-3">
              {score.tradingAction && (() => {
                const cfg = ACTION_CFG[score.tradingAction] ?? ACTION_CFG.HOLD;
                return (
                  <span className={`inline-flex items-center gap-1.5 text-sm font-bold px-4 py-1.5 rounded-full border shrink-0 ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                    {t(`action.${score.tradingAction}` as Parameters<typeof t>[0])}
                  </span>
                );
              })()}
              {stratC && (
                <span className={`inline-flex items-center gap-1.5 text-sm font-bold px-4 py-1.5 rounded-full border shrink-0 ${stratStyle.border} ${stratStyle.bg} ${stratStyle.text}`}>
                  {t(`strategy.${stratKey}` as Parameters<typeof t>[0])} · {stratC.confidence}%
                </span>
              )}
            </div>

            {aiConclusion && (
              <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 rounded-xl px-4 py-3">{aiConclusion}</p>
            )}

            {/* Strategy params row */}
            {stratC && (
              <div className={`rounded-xl border ${stratStyle.border} ${stratStyle.bg} px-4 py-3 flex flex-wrap gap-4`}>
                <div>
                  <div className="text-[10px] text-slate-500">{t("strategy.target_return")}</div>
                  <div className="text-sm font-bold text-emerald-600">+{stratC.targetReturnPct}%</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">{t("strategy.stop_loss")}</div>
                  <div className="text-sm font-bold text-red-600">{stratC.stopLossPct}%</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">{t("strategy.max_days")}</div>
                  <div className={`text-sm font-bold ${stratStyle.text}`}>{stratC.maxHoldingDays}{t("strategy.days_unit")}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">{t("strategy.allocation")}</div>
                  <div className={`text-sm font-bold ${stratStyle.text}`}>
                    {stratKey === "DAY" ? "30%" : stratKey === "SWING" ? "40%" : "30%"}
                  </div>
                </div>
              </div>
            )}

            {/* Reasons + Risks */}
            {(topReasons.length > 0 || topRisks.length > 0) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {topReasons.length > 0 && (
                  <div className="bg-emerald-50 rounded-xl p-3.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 mb-2">{t("ad.top_reasons")}</div>
                    <ul className="space-y-1.5">
                      {topReasons.map((r, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-slate-700">
                          <span className="text-emerald-500 shrink-0 mt-0.5">✓</span><span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {topRisks.length > 0 && (
                  <div className="bg-red-50 rounded-xl p-3.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-red-600 mb-2">{t("ad.top_risks")}</div>
                    <ul className="space-y-1.5">
                      {topRisks.map((r, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-slate-700">
                          <span className="text-amber-500 shrink-0 mt-0.5">⚠</span><span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {gpt?.timeHorizon && (
              <div className="text-xs text-slate-500 border-t border-slate-100 pt-3">
                {t("gpt.time_horizon")}: <span className="font-medium text-slate-700">{gpt.timeHorizon}</span>
              </div>
            )}
          </div>
        )}
      </SectionCard>

      {/* ── ③ 交易计划 ──────────────────────────────────────────────────────── */}
      <SectionCard title={t("tp.title")}>
        {!score?.tradingAction || (score.entryLow == null && score.entryHigh == null && score.stopLoss == null) ? (
          <p className="text-sm text-slate-400">{t("tp.no_plan")}</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
              {[
                { label: t("tp.entry_low"),  val: score.entryLow,  cls: "bg-slate-50" },
                { label: t("tp.entry_high"), val: score.entryHigh, cls: "bg-slate-50" },
                { label: t("tp.stop_loss"),  val: score.stopLoss,  cls: "bg-red-50",     textCls: "text-red-600" },
                { label: t("tp.target1"),    val: score.target1,   cls: "bg-emerald-50", textCls: "text-emerald-600" },
                { label: t("tp.target2"),    val: score.target2,   cls: "bg-emerald-50", textCls: "text-emerald-600" },
              ].filter(x => x.val != null).map(({ label, val, cls, textCls }) => (
                <div key={label} className={`${cls} rounded-xl p-3 text-center`}>
                  <div className="text-[10px] text-slate-400 mb-1">{label}</div>
                  <div className={`text-sm font-bold tabular-nums ${textCls ?? "text-slate-800"}`}>{fmtJpy(val)}</div>
                  {val != null && latestClose > 0 && (
                    <div className={`text-[10px] mt-0.5 tabular-nums ${returnColorClass(((val - latestClose) / latestClose) * 100)}`}>
                      {fmtPct(((val - latestClose) / latestClose) * 100, 1)}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-3">
              {score.positionSizePct != null && (
                <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-4 py-2.5">
                  <div className="text-[10px] text-slate-400">{t("tp.position")}</div>
                  <div className="text-xl font-extrabold tabular-nums text-slate-800">{score.positionSizePct.toFixed(0)}%</div>
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
              {stratC && (
                <div className={`flex items-center gap-2 rounded-xl px-4 py-2.5 border ${stratStyle.border} ${stratStyle.bg}`}>
                  <div className="text-[10px] text-slate-400">{t("strategy.detail_title")}</div>
                  <div className={`text-sm font-bold ${stratStyle.text}`}>
                    {t(`strategy.${stratKey}` as Parameters<typeof t>[0])} / {stratKey === "DAY" ? "30%" : stratKey === "SWING" ? "40%" : "30%"}
                  </div>
                </div>
              )}
            </div>
            <p className="text-[10px] text-slate-400">{t("ai_action.disclaimer")}</p>
          </div>
        )}
      </SectionCard>

      {/* ── ④⑧ Score Breakdown + Risk Analysis (2-col on desktop) ──────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* ④ AI Score Breakdown */}
        <SectionCard title={t("sb.title")}>
          {!score ? (
            <p className="text-sm text-slate-400">{t("stock.no_score")}</p>
          ) : (
            <div className="space-y-4">
              <div className="space-y-3">
                <ScoreBar label={t("score.technical")}   score={score.technicalScore}     max={30} color="#3b82f6" desc={scoreDescs.technical} />
                <ScoreBar label={t("score.fundamental")} score={score.fundamentalScore}   max={25} color="#10b981" desc={scoreDescs.fundamental} />
                <ScoreBar label={t("score.money_flow")}  score={score.moneyFlowScore}     max={20} color="#8b5cf6" desc={scoreDescs.moneyFlow} />
                <ScoreBar label={t("score.sentiment")}   score={score.newsSentimentScore} max={15} color="#f59e0b" />
                <ScoreBar label={t("score.trend")}       score={score.globalTrendScore}   max={10} color="#06b6d4" />
              </div>
              <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-3 text-xs text-slate-500">
                {score.stockStyle && (
                  <span>{t("stock.style_label")}：<strong className="text-slate-700">{t(`style.${score.stockStyle}` as Parameters<typeof t>[0])}</strong></span>
                )}
                {score.overallConfidence != null && (
                  <span>{t("stock.confidence")}：<strong className={score.overallConfidence >= 60 ? "text-emerald-600" : "text-amber-600"}>{score.overallConfidence.toFixed(0)}%</strong></span>
                )}
              </div>
              {score.newsSummary && (
                <div className="bg-amber-50 rounded-xl px-3.5 py-3 text-xs text-slate-700 leading-relaxed border border-amber-100">
                  <span className="font-semibold text-amber-700 mr-1">{t("score.news_sentiment")}</span>{score.newsSummary}
                </div>
              )}
            </div>
          )}
        </SectionCard>

        {/* ⑧ AI Risk Analysis */}
        <SectionCard title={t("ai_risk.title")}
          badge={riskAnalysis ? <RiskBadge level={riskAnalysis.overall} /> : undefined}
        >
          {!riskAnalysis ? (
            <p className="text-sm text-slate-400">{t("stock.no_score")}</p>
          ) : (
            <div className="space-y-3">
              {([
                { key: "technical",   label: t("ai_risk.technical"),   level: riskAnalysis.technical,   descKey: `ai_risk.tech.${riskAnalysis.technical}` as Parameters<typeof t>[0] },
                { key: "news",        label: t("ai_risk.news"),        level: riskAnalysis.news,        descKey: `ai_risk.news.${riskAnalysis.news}` as Parameters<typeof t>[0] },
                { key: "fundamental", label: t("ai_risk.fundamental"), level: riskAnalysis.fundamental, descKey: `ai_risk.fund.${riskAnalysis.fundamental}` as Parameters<typeof t>[0] },
                { key: "volatility",  label: t("ai_risk.volatility"),  level: riskAnalysis.volatility,  descKey: `ai_risk.vol.${riskAnalysis.volatility}` as Parameters<typeof t>[0] },
              ] as const).map(({ key, label, level, descKey }) => {
                const cfg = RISK_BADGE[level] ?? RISK_BADGE.MEDIUM;
                const barPct = level === "LOW" ? 25 : level === "MEDIUM" ? 55 : level === "EXTREME" ? 95 : 80;
                const barColor = level === "LOW" ? "#10b981" : level === "MEDIUM" ? "#f59e0b" : "#ef4444";
                return (
                  <div key={key} className="rounded-xl bg-slate-50 px-3.5 py-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-slate-700">{label}</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>{t(`risk.${level}` as Parameters<typeof t>[0])}</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden mb-1.5">
                      <div className="h-full rounded-full transition-all" style={{ width: `${barPct}%`, background: barColor }} />
                    </div>
                    <div className="text-[10px] text-slate-500">{t(descKey)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

      </div>

      {/* ── ⑤ K线 + 技术分析 ────────────────────────────────────────────── */}
      <SectionCard title={t("ts.title")}>
        {!ind ? (
          <p className="text-sm text-slate-400">{t("common.no_data")}</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <MaTrendBadge trend={ind.maTrend} />
              {ind.macdSignalLabel !== "NEUTRAL" && (
                <span className={`text-xs px-2 py-0.5 rounded-full border ${ind.macdSignalLabel === "BUY" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                  MACD: {ind.macdSignalLabel === "BUY" ? t("macd.bullish") : t("macd.bearish")}
                </span>
              )}
            </div>

            {/* MA grid */}
            <div className="grid grid-cols-3 gap-2">
              {[{ key: "MA5", val: ind.ma5 }, { key: "MA20", val: ind.ma20 }, { key: "MA60", val: ind.ma60 }].map(({ key, val }) => {
                const diff = val ? ((latestClose - val) / val) * 100 : null;
                return (
                  <div key={key} className="bg-slate-50 rounded-xl p-3 text-center">
                    <div className="text-[10px] text-slate-400 mb-1">{key}</div>
                    <div className="text-base font-bold text-slate-900 tabular-nums">{fmtJpy(val)}</div>
                    {diff !== null && <div className={`text-[10px] font-medium mt-0.5 tabular-nums ${returnColorClass(diff)}`}>{fmtPct(diff, 2)}</div>}
                  </div>
                );
              })}
            </div>

            {/* RSI + 52w + Volume row */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="bg-slate-50 rounded-xl p-3">
                <div className="text-[10px] text-slate-400 mb-1">RSI (14)</div>
                <div className={`text-xl font-bold tabular-nums ${rsiColor}`}>{rsi14 != null ? rsi14.toFixed(1) : "—"}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">{rsiLabel}</div>
                {rsi14 != null && (
                  <div className="mt-2 w-full bg-slate-200 rounded-full h-1.5 overflow-hidden relative">
                    <div className="absolute left-[30%] top-0 w-px h-full bg-blue-300" />
                    <div className="absolute left-[70%] top-0 w-px h-full bg-red-300" />
                    <div className={`h-full rounded-full ${rsi14 >= 70 ? "bg-red-400" : rsi14 <= 30 ? "bg-emerald-400" : "bg-slate-400"}`} style={{ width: `${rsi14}%` }} />
                  </div>
                )}
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <div className="text-[10px] text-slate-400 mb-1">{t("ts.52w_pos")}</div>
                {w52Pct != null ? (
                  <>
                    <div className="text-xl font-bold tabular-nums text-slate-800">{w52Pct}%</div>
                    <div className="mt-2 w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                      <div className={`h-full rounded-full ${w52Pct >= 80 ? "bg-red-400" : w52Pct >= 50 ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${w52Pct}%` }} />
                    </div>
                    <div className="flex justify-between text-[9px] text-slate-400 mt-0.5"><span>{t("stock.52w_low")}</span><span>{t("stock.52w_high")}</span></div>
                  </>
                ) : <div className="text-xl font-bold text-slate-300">—</div>}
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <div className="text-[10px] text-slate-400 mb-1">{t("ts.volume_ratio")}</div>
                {volRatio != null ? (
                  <>
                    <div className={`text-xl font-bold tabular-nums ${volRatio >= 2 ? "text-red-600" : volRatio >= 1.5 ? "text-amber-600" : "text-slate-700"}`}>{volRatio.toFixed(2)}x</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">vs 20D avg</div>
                  </>
                ) : <div className="text-xl font-bold text-slate-300">—</div>}
              </div>
            </div>

            {/* Expand chart */}
            <div className="border-t border-slate-100 pt-3">
              <button
                onClick={() => setChartVisible(v => !v)}
                className="text-xs text-blue-600 hover:text-blue-800 transition-colors font-medium"
              >
                {chartVisible ? `▲ ${t("detail.collapse")} ${t("detail.chart_title")}` : `▼ ${t("detail.expand")} ${t("detail.chart_title")}`}
              </button>
              {chartVisible && (
                <div className="mt-3">
                  <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-4 w-fit">
                    {(["30", "250"] as const).map(p => (
                      <button key={p} onClick={() => setChartPeriod(p)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${chartPeriod === p ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                        {p === "30" ? "30D" : "250D (~1Y)"}
                      </button>
                    ))}
                  </div>
                  {chartData.length === 0 ? (
                    <div className="h-40 flex items-center justify-center text-slate-400 text-sm animate-pulse">{t("common.loading")}</div>
                  ) : (
                    <>
                      <PriceChart data={chartData} height={300} showVolume />
                      <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-4 text-xs text-slate-500">
                        {[["MA5", ind.ma5], ["MA20", ind.ma20], ["MA60", ind.ma60]].map(([k, v]) => (
                          <span key={k as string}>{k}: <b className="text-slate-700">{v ? `¥${(v as number).toLocaleString()}` : "—"}</b></span>
                        ))}
                        <span>RSI: <b className="text-slate-700">{rsi14?.toFixed(1) ?? "—"}</b></span>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </SectionCard>

      {/* ── ⑥ 新闻分析 ─────────────────────────────────────────────────── */}
      <SectionCard title={t("ne.title")}
        badge={score?.newsSummary ? (
          <span className="text-[10px] text-slate-400 max-w-xs truncate hidden sm:block">{score.newsSummary}</span>
        ) : undefined}
      >
        {news.length === 0 ? (
          <p className="text-sm text-slate-400">{t("news.no_data")}</p>
        ) : (
          <div className="space-y-2.5">
            {news.map(item => {
              const sentimentColor = item.sentiment === "POSITIVE" ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                : item.sentiment === "NEGATIVE" ? "bg-red-50 text-red-700 border-red-100"
                : "bg-slate-50 text-slate-500 border-slate-100";
              const displayUrl = item.url.startsWith("tdnet:") ? item.url.slice(6) : item.url;
              return (
                <a key={item.id} href={displayUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 p-3 hover:bg-slate-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 leading-snug line-clamp-2">{item.title}</div>
                    <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-400">
                      <span>{item.source}</span>
                      {item.publishedAt && (<><span>·</span><span>{new Date(item.publishedAt).toLocaleDateString(lang, { month: "numeric", day: "numeric" })}</span></>)}
                    </div>
                  </div>
                  <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded border ${sentimentColor}`}>
                    {item.sentiment === "POSITIVE" ? "🟢" : item.sentiment === "NEGATIVE" ? "🔴" : "⚪"}
                  </span>
                </a>
              );
            })}
            <button onClick={() => router.push(`/news?symbol=${encodeURIComponent(stock.symbol)}`)}
              className="text-xs text-blue-600 hover:text-blue-800 transition-colors pt-1 block">
              {t("ne.more")} →
            </button>
          </div>
        )}
      </SectionCard>

      {/* ── ⑦ 基本面分析 (collapsible) ──────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <button onClick={() => setFinancialsVisible(v => !v)}
          className="w-full px-5 py-3.5 border-b border-slate-100 flex items-center justify-between hover:bg-slate-50 transition-colors">
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
                  {[...financials].sort((a, b) => b.fiscalYear - a.fiscalYear || (b.quarter ?? 99) - (a.quarter ?? 99)).map(f => (
                    <tr key={f.id} className="hover:bg-slate-50">
                      <td className="px-5 py-2.5 font-medium text-slate-900">
                        {lang === "en-US" ? `FY${f.fiscalYear}${f.quarter ? ` Q${f.quarter}` : ""}` : `${f.fiscalYear}年${f.quarter ? ` Q${f.quarter}` : t("fin.full_year")}`}
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
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{f.eps != null ? `¥${f.eps.toFixed(2)}` : "—"}</td>
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

      {/* ── ⑨⑩ Historical Performance + Sector Comparison (2-col on desktop) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* ⑨ AI 历史表现 */}
        <SectionCard title={t("ai_hist.title")}
          badge={<span className="text-[10px] text-slate-400">n={historicalPerf.sampleCount}</span>}
        >
          {historicalPerf.sampleCount === 0 ? (
            <div className="text-center py-4">
              <div className="text-2xl mb-2 text-slate-200">📊</div>
              <p className="text-sm text-slate-400">{t("ai_hist.collecting")}</p>
              <p className="text-[10px] text-slate-300 mt-1">min {10} samples required</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Overall + By Strategy grid */}
              <div className="grid grid-cols-2 gap-2 border-b border-slate-100 pb-3">
                <PerfCell stats={historicalPerf.overall} label={t("strategy.tab_overall")} />
                <PerfCell stats={historicalPerf.byStrategy[stratKey]} label={t(`strategy.${stratKey}` as Parameters<typeof t>[0])} />
              </div>
              <div className="grid grid-cols-3 gap-1">
                <PerfCell stats={historicalPerf.byStrategy.DAY}      label={t("strategy.DAY.short")} />
                <PerfCell stats={historicalPerf.byStrategy.SWING}    label={t("strategy.SWING.short")} />
                <PerfCell stats={historicalPerf.byStrategy.POSITION} label={t("strategy.POSITION.short")} />
              </div>
            </div>
          )}
        </SectionCard>

        {/* ⑩ 同行业比较 */}
        <SectionCard title={t("pc.title")}
          badge={sectorComparison ? (
            <span className="text-[10px] text-slate-400">
              #{sectorComparison.sectorRank ?? "—"} / {sectorComparison.sectorTotal}
            </span>
          ) : undefined}
        >
          {!sectorComparison ? (
            <div className="text-center py-6">
              <div className="text-2xl mb-2 text-slate-200">⊞</div>
              <p className="text-sm text-slate-400">{t("pc.phase2")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Stats row */}
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center bg-slate-50 rounded-xl py-2 px-1">
                  <div className="text-[10px] text-slate-400">{t("pc.your_rank")}</div>
                  <div className="text-lg font-black text-slate-800">#{sectorComparison.sectorRank ?? "—"}</div>
                  <div className="text-[10px] text-slate-400">/ {sectorComparison.sectorTotal}</div>
                </div>
                <div className="text-center bg-slate-50 rounded-xl py-2 px-1">
                  <div className="text-[10px] text-slate-400">{t("pc.sector_avg")}</div>
                  <div className="text-lg font-black text-slate-800">{sectorComparison.sectorAvg.toFixed(1)}</div>
                </div>
                <div className="text-center bg-slate-50 rounded-xl py-2 px-1">
                  <div className="text-[10px] text-slate-400">{t("pc.rel_strength")}</div>
                  {(() => {
                    const diff = sectorComparison.myScore - sectorComparison.sectorAvg;
                    return (
                      <div className={`text-lg font-black tabular-nums ${returnColorClass(diff)}`}>
                        {diff >= 0 ? "+" : ""}{diff.toFixed(1)}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Top stocks in sector */}
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">{t("pc.top_in_sector")}</div>
                <div className="space-y-1.5">
                  {sectorComparison.topStocks.map((s, i) => {
                    const rk = getRec(s.recommendation ?? "HOLD");
                    const chipCfg = REC_CHIP[s.recommendation ?? "HOLD"] ?? REC_CHIP.HOLD;
                    const displayName = (lang === "zh-CN" ? s.nameZh : null) ?? s.name;
                    return (
                      <div key={s.symbol}
                        className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs ${s.isCurrent ? "bg-blue-50 border border-blue-200" : "hover:bg-slate-50"} transition-colors cursor-pointer`}
                        onClick={() => router.push(`/stocks/${encodeURIComponent(s.symbol)}`)}
                      >
                        <span className="text-slate-400 w-4 tabular-nums shrink-0">{i + 1}</span>
                        <span className="font-mono text-slate-500 shrink-0 w-14">{s.symbol}</span>
                        <span className="flex-1 truncate text-slate-700 font-medium">{displayName}</span>
                        <span className="font-bold tabular-nums shrink-0" style={{ color: finalScoreHex(s.adaptiveScore ?? 0) }}>
                          {s.adaptiveScore?.toFixed(0) ?? "—"}
                        </span>
                        <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded border ${chipCfg.border} ${chipCfg.bg} ${chipCfg.text}`}>{rk.label}</span>
                        {s.isCurrent && <span className="shrink-0 text-[10px] text-blue-600 font-bold">←</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </SectionCard>

      </div>

    </div>
  );
}
