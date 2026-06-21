"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getRec, returnColorClass, fmtPct, fmtJpy } from "@/lib/rec-config";

type AiScore = {
  symbol: string;
  name: string;
  nameZh: string | null;
  latestClose: number;
  latestDate: string;
  technicalScore: number;
  fundamentalScore: number;
  moneyFlowScore: number;
  newsSentimentScore: number;
  globalTrendScore: number;
  totalScore: number;
  recommendation: string;
  summaryReason: string;
  return5d: number | null;
  return20d: number | null;
  scoreSource: string;
  // V7.7+
  adaptiveScore: number;
  stockStyle: string | null;
  highRiskFlag: boolean;
  percentileRank: number | null;
  marketRank: number | null;
  recommendationV2: string;
  recommendationReason: string | null;
  opportunityScore: number | null;
  opportunityLabel: string | null;
  // V8.3 P2: AI Action
  tradingAction: string | null;
  positionSizePct: number | null;
  actionRiskLevel: string | null;
};

type MarketStats = {
  total: number;
  strongBuy: number;
  buy: number;
  hold: number;
  watch: number;
  avoid: number;
  bullCount: number;
  bullRate: number;
  marketTemperature: "HOT" | "WARM" | "NEUTRAL" | "COLD" | "EXTREME_COLD";
};

type ApiResponse = { scores: AiScore[]; marketStats: MarketStats; updatedAt: string };

const TEMP_CFG: Record<string, { label: string; emoji: string; color: string; bg: string }> = {
  HOT:          { label: "市場過熱",   emoji: "🔥", color: "text-red-700",    bg: "bg-red-50 border-red-200" },
  WARM:         { label: "市場偏暖",   emoji: "☀️", color: "text-orange-700", bg: "bg-orange-50 border-orange-200" },
  NEUTRAL:      { label: "市場中性",   emoji: "🌤", color: "text-yellow-700", bg: "bg-yellow-50 border-yellow-200" },
  COLD:         { label: "市場偏冷",   emoji: "❄️", color: "text-blue-700",   bg: "bg-blue-50 border-blue-200" },
  EXTREME_COLD: { label: "市場極寒",   emoji: "🧊", color: "text-slate-700",  bg: "bg-slate-100 border-slate-200" },
};

const STYLE_LABEL: Record<string, string> = {
  QUALITY_COMPOUNDER:    "质优复利",
  GROWTH_MOMENTUM:       "成长动能",
  CYCLICAL_EXPORTER:     "出口周期",
  VALUE_DEFENSIVE:       "价值防御",
  DOMESTIC_DEFENSIVE:    "内需防御",
  SPECULATIVE_MOMENTUM:  "投机动能",
};

const SOURCE_BADGE: Record<string, string> = {
  REAL:     "✅ 真实数据",
  PARTIAL:  "⚠️ 部分真实",
  FALLBACK: "🔴 回测",
};

function ScoreBar({ score, max = 100, color }: { score: number; max?: number; color: string }) {
  const pct = Math.min(100, Math.round((score / max) * 100));
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-slate-600 w-12 text-right">{score}/{max}</span>
    </div>
  );
}

function DetailCard({ score }: { score: AiScore }) {
  const [open, setOpen] = useState(false);
  const rec = getRec(score.recommendationV2);

  return (
    <div className={`rounded-2xl border ${rec.border} ${rec.bg} overflow-hidden`}>
      <div className="px-5 py-4 cursor-pointer" onClick={() => setOpen((v) => !v)}>
        <div className="flex items-start justify-between gap-4">
          {/* Left: score + name */}
          <div className="flex items-start gap-4 min-w-0">
            <div className="text-center min-w-[3rem] shrink-0">
              <div className={`text-xl font-bold tabular-nums ${rec.text}`}>{score.adaptiveScore.toFixed(0)}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Adaptive</div>
              {score.percentileRank != null && (
                <div className="text-[10px] text-slate-400">Top {score.percentileRank.toFixed(1)}%</div>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-0.5">
                <Link
                  href={`/stocks/${encodeURIComponent(score.symbol)}`}
                  className="text-[15px] font-bold text-slate-900 hover:text-blue-600 leading-tight"
                  onClick={(e) => e.stopPropagation()}
                >
                  {score.nameZh || score.name}
                </Link>
                <span className="text-[11px] text-slate-500 font-mono">{score.symbol}</span>
                <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded border ${rec.border} ${rec.text} ${rec.bg}`}>
                  {rec.label}
                </span>
                {score.highRiskFlag && (
                  <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-700 border border-red-200">⚠ High Risk</span>
                )}
                {score.tradingAction && (() => {
                  const A: Record<string, string> = {
                    BUY_NOW: "bg-emerald-100 text-emerald-700 border-emerald-200",
                    WAIT_PULLBACK: "bg-amber-100 text-amber-700 border-amber-200",
                    HOLD: "bg-slate-100 text-slate-600 border-slate-200",
                    TAKE_PROFIT: "bg-orange-100 text-orange-700 border-orange-200",
                    SELL: "bg-red-100 text-red-700 border-red-200",
                    AVOID: "bg-red-100 text-red-700 border-red-200",
                  };
                  const L: Record<string, string> = { BUY_NOW: "BUY NOW", WAIT_PULLBACK: "WAIT", HOLD: "HOLD", TAKE_PROFIT: "PROFIT", SELL: "SELL", AVOID: "AVOID" };
                  return (
                    <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded border ${A[score.tradingAction] ?? A.HOLD}`}>
                      {L[score.tradingAction] ?? score.tradingAction}
                      {score.positionSizePct != null && <span className="ml-1 font-normal opacity-70">{score.positionSizePct}%</span>}
                    </span>
                  );
                })()}
                {score.stockStyle && (
                  <span className="text-[10px] px-1 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
                    {STYLE_LABEL[score.stockStyle] ?? score.stockStyle}
                  </span>
                )}
              </div>
              {score.nameZh && score.nameZh !== score.name && (
                <div className="text-[11px] text-slate-400">{score.name}</div>
              )}
              {score.recommendationReason && (
                <div className="text-[11px] text-slate-500 mt-0.5 max-w-lg">{score.recommendationReason}</div>
              )}
            </div>
          </div>

          {/* Right: 5 dims + price */}
          <div className="hidden sm:flex items-center gap-4 shrink-0">
            <div className="grid grid-cols-5 gap-3">
              {[
                { label: "Tech",  val: score.technicalScore,     cls: "text-blue-700" },
                { label: "Fund",  val: score.fundamentalScore,   cls: "text-emerald-700" },
                { label: "Flow",  val: score.moneyFlowScore,     cls: "text-violet-700" },
                { label: "News",  val: score.newsSentimentScore, cls: "text-amber-700" },
                { label: "Global",val: score.globalTrendScore,   cls: "text-cyan-700" },
              ].map((d) => (
                <div key={d.label} className="text-center w-10">
                  <div className={`text-sm font-bold tabular-nums ${d.cls}`}>{d.val}</div>
                  <div className="text-[10px] text-slate-400">{d.label}</div>
                </div>
              ))}
            </div>
            <div className="text-right w-28">
              <div className="text-sm font-bold text-slate-900 tabular-nums">{fmtJpy(score.latestClose)}</div>
              <div className={`text-xs font-semibold tabular-nums ${returnColorClass(score.return5d)}`}>
                {fmtPct(score.return5d)} <span className="text-slate-400 font-normal">5D</span>
              </div>
              <div className="text-[10px] text-slate-400">{score.latestDate}</div>
            </div>
            <span className="text-slate-300 text-xs">{open ? "▲" : "▼"}</span>
          </div>
        </div>

        {/* 5-dim bars (compact) */}
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "Technical (30)",   score: score.technicalScore,    max: 30, color: "bg-blue-400" },
            { label: "Fundamental (25)", score: score.fundamentalScore,  max: 25, color: "bg-emerald-400" },
            { label: "Money Flow (20)",  score: score.moneyFlowScore,    max: 20, color: "bg-violet-400" },
            { label: "Sentiment (15)",   score: score.newsSentimentScore,max: 15, color: "bg-amber-400" },
            { label: "Global (10)",      score: score.globalTrendScore,  max: 10, color: "bg-cyan-400" },
          ].map((d) => (
            <div key={d.label}>
              <div className="text-[10px] text-slate-400 mb-1">{d.label}</div>
              <ScoreBar score={d.score} max={d.max} color={d.color} />
            </div>
          ))}
        </div>
      </div>

      {open && (
        <div className="px-5 pb-5 border-t border-slate-200/60 pt-4">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="text-xs font-semibold text-slate-700 mb-3">Rating Detail</div>
              <div className="space-y-2 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span className="text-slate-400">Rating</span>
                  <span className={`font-bold ${rec.text}`}>{rec.label}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Adaptive</span>
                  <span className="font-bold tabular-nums">{score.adaptiveScore.toFixed(1)}</span>
                </div>
                {score.percentileRank != null && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Percentile</span>
                    <span className="font-bold tabular-nums">Top {score.percentileRank.toFixed(1)}% (#{score.marketRank})</span>
                  </div>
                )}
                {score.opportunityScore != null && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Opportunity</span>
                    <span className="font-bold tabular-nums">{score.opportunityScore.toFixed(1)}{score.opportunityLabel ? ` · ${score.opportunityLabel === "STEADY" ? "稳健" : "高风险"}` : ""}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-400">Style</span>
                  <span>{score.stockStyle ? (STYLE_LABEL[score.stockStyle] ?? score.stockStyle) : "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">20D</span>
                  <span className={`font-semibold ${returnColorClass(score.return20d)}`}>{fmtPct(score.return20d)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Source</span>
                  <span>{SOURCE_BADGE[score.scoreSource] ?? score.scoreSource}</span>
                </div>
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-700 mb-3">AI Analysis</div>
              {score.recommendationReason && (
                <p className="text-xs text-slate-500 leading-relaxed mb-2">{score.recommendationReason}</p>
              )}
              {score.summaryReason && (
                <p className="text-xs text-slate-500 leading-relaxed">{score.summaryReason}</p>
              )}
              {!score.recommendationReason && !score.summaryReason && (
                <p className="text-xs text-slate-300">暂无AI分析摘要</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MarketTemperatureBanner({ stats }: { stats: MarketStats }) {
  const t = TEMP_CFG[stats.marketTemperature] ?? TEMP_CFG.NEUTRAL;
  return (
    <div className={`rounded-2xl border p-4 mb-6 ${t.bg}`}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{t.emoji}</span>
          <div>
            <div className={`font-bold text-base ${t.color}`}>{t.label}</div>
            <div className="text-xs text-slate-500 mt-0.5">
              BUY合计 {stats.bullCount}只（{stats.bullRate}%）· 共 {stats.total}只评估标的
            </div>
          </div>
        </div>
        <div className="flex gap-4 text-center">
          {[
            { label: "STRONG BUY", value: stats.strongBuy, cls: "text-emerald-600" },
            { label: "BUY",        value: stats.buy,       cls: "text-blue-600" },
            { label: "HOLD",       value: stats.hold,      cls: "text-slate-500" },
            { label: "WATCH",      value: stats.watch,     cls: "text-amber-600" },
            { label: "AVOID",      value: stats.avoid,     cls: "text-red-500" },
          ].map((s) => (
            <div key={s.label}>
              <div className={`text-xl font-bold tabular-nums ${s.cls}`}>{s.value}</div>
              <div className="text-[10px] text-slate-400">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AiPicksPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"ALL" | "BUY" | "WATCH" | "AVOID">("ALL");
  const [mode, setMode] = useState<"top" | "opportunity" | "high_risk">("top");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/ai-scores?mode=${mode}&limit=100`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [mode]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="text-slate-400 text-sm animate-pulse">AI评分加载中...</div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-red-700 text-sm">
          加载失败：{error}
        </div>
      </div>
    );
  }

  const { scores, marketStats } = data;
  const buyCount   = scores.filter((s) => s.recommendationV2 === "STRONG_BUY" || s.recommendationV2 === "BUY").length;
  const watchCount = scores.filter((s) => s.recommendationV2 === "WATCH").length;
  const avoidCount = scores.filter((s) => s.recommendationV2 === "HOLD" || s.recommendationV2 === "AVOID").length;

  const filtered =
    filter === "BUY"   ? scores.filter((s) => s.recommendationV2 === "STRONG_BUY" || s.recommendationV2 === "BUY")
    : filter === "WATCH" ? scores.filter((s) => s.recommendationV2 === "WATCH")
    : filter === "AVOID" ? scores.filter((s) => s.recommendationV2 === "HOLD" || s.recommendationV2 === "AVOID")
    :                      scores;

  const top3 = scores.slice(0, 3);

  return (
    <div className="p-4 md:p-6 max-w-6xl">
      <div className="mb-4">
        <h1 className="text-[32px] font-bold text-slate-900 leading-tight">AI Picks</h1>
        <p className="text-sm font-medium text-slate-500 mt-1">
          双门槛评级（Adaptive + Percentile）· 更新：{new Date(data.updatedAt).toLocaleString("zh-CN")}
        </p>
      </div>

      {/* Market Temperature Banner */}
      <MarketTemperatureBanner stats={marketStats} />

      {/* Mode tabs */}
      <div className="flex gap-1 mb-4 bg-slate-100 rounded-xl p-1 overflow-x-auto max-w-full">
        {([
          { key: "top",         label: "综合评分" },
          { key: "opportunity", label: "稳健机会" },
          { key: "high_risk",   label: "高风险动能" },
        ] as const).map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              mode === m.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* TOP 3 */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-yellow-400">✦</span>
          <h2 className="font-bold text-[15px] text-white">TOP 3</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {top3.map((s, i) => {
            const rec = getRec(s.recommendationV2);
            return (
              <Link
                key={s.symbol}
                href={`/stocks/${encodeURIComponent(s.symbol)}`}
                className="bg-white/10 hover:bg-white/20 transition-colors rounded-2xl p-4 block"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-400">#{i + 1}</span>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${rec.bg} ${rec.text}`}>{rec.label}</span>
                </div>
                <div className="text-[15px] font-bold text-white leading-tight">{s.nameZh || s.name}</div>
                {s.nameZh && s.nameZh !== s.name && (
                  <div className="text-[11px] text-slate-400 truncate">{s.name}</div>
                )}
                <div className="text-[11px] text-slate-500 font-mono mt-0.5 mb-2">{s.symbol}</div>
                <div className="text-2xl font-bold text-white tabular-nums">{s.adaptiveScore.toFixed(0)}</div>
                {s.percentileRank != null && (
                  <div className="text-slate-300 text-xs mt-0.5">Top {s.percentileRank.toFixed(1)}% · #{s.marketRank}</div>
                )}
                {s.stockStyle && (
                  <div className="mt-1 text-[10px] text-slate-400">{STYLE_LABEL[s.stockStyle] ?? s.stockStyle}</div>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 bg-slate-100 rounded-xl p-1 overflow-x-auto max-w-full">
        {(["ALL", "BUY", "WATCH", "AVOID"] as const).map((f) => {
          const labels: Record<typeof f, string> = {
            ALL:   `全部 (${scores.length})`,
            BUY:   `BUY (${buyCount})`,
            WATCH: `WATCH (${watchCount})`,
            AVOID: `HOLD/AVOID (${avoidCount})`,
          };
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                filter === f ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {labels[f]}
            </button>
          );
        })}
      </div>

      {/* Cards */}
      <div className="space-y-3">
        {filtered.map((score) => <DetailCard key={score.symbol} score={score} />)}
      </div>
    </div>
  );
}
