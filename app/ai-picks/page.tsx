"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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
  // V7.7
  adaptiveScore: number;
  stockStyle: string | null;
  highRiskFlag: boolean;
  percentileRank: number | null;
  marketRank: number | null;
  recommendationV2: string;
  recommendationReason: string | null;
  opportunityScore: number | null;
  opportunityLabel: string | null;
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

const REC_CFG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  STRONG_BUY: { label: "强烈买入", bg: "bg-red-50",    text: "text-red-700",    border: "border-red-200" },
  BUY:        { label: "买入",     bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
  HOLD:       { label: "持有",     bg: "bg-slate-50",  text: "text-slate-600",  border: "border-slate-200" },
  WATCH:      { label: "观察",     bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-200" },
  AVOID:      { label: "回避",     bg: "bg-blue-50",   text: "text-blue-600",   border: "border-blue-200" },
};

const TEMP_CFG: Record<string, { label: string; emoji: string; color: string; bg: string }> = {
  HOT:          { label: "市场过热",   emoji: "🔥", color: "text-red-700",    bg: "bg-red-50 border-red-200" },
  WARM:         { label: "市场偏暖",   emoji: "☀️", color: "text-orange-700", bg: "bg-orange-50 border-orange-200" },
  NEUTRAL:      { label: "市场中性",   emoji: "🌤", color: "text-yellow-700", bg: "bg-yellow-50 border-yellow-200" },
  COLD:         { label: "市场偏冷",   emoji: "❄️", color: "text-blue-700",   bg: "bg-blue-50 border-blue-200" },
  EXTREME_COLD: { label: "市场极寒",   emoji: "🧊", color: "text-slate-700",  bg: "bg-slate-100 border-slate-200" },
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

function pctColor(v: number | null) {
  if (v == null) return "text-slate-400";
  return v > 0 ? "text-emerald-600" : v < 0 ? "text-red-500" : "text-slate-400";
}
function pctText(v: number | null) {
  if (v == null) return "—";
  return (v > 0 ? "+" : "") + v.toFixed(1) + "%";
}

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
  const rec = REC_CFG[score.recommendationV2] ?? REC_CFG.HOLD;

  return (
    <div className={`rounded-xl border ${rec.border} ${rec.bg} overflow-hidden`}>
      <div className="px-5 py-4 cursor-pointer" onClick={() => setOpen((v) => !v)}>
        <div className="flex items-start justify-between gap-4">
          {/* Left: score + name */}
          <div className="flex items-start gap-4 min-w-0">
            <div className="text-center min-w-[3rem] shrink-0">
              <div className={`text-xl font-bold tabular-nums ${rec.text}`}>{score.adaptiveScore.toFixed(0)}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">动态分</div>
              {score.percentileRank != null && (
                <div className="text-[10px] text-slate-400">前{score.percentileRank.toFixed(1)}%</div>
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
                <span className="text-[12px] text-slate-500 font-mono">{score.symbol}</span>
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${rec.border} ${rec.text} ${rec.bg}`}>
                  {rec.label}
                </span>
                {score.highRiskFlag && (
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 border border-red-200">⚠ 高风险</span>
                )}
                {score.stockStyle && (
                  <span className="text-[10px] px-1 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
                    {STYLE_LABEL[score.stockStyle] ?? score.stockStyle}
                  </span>
                )}
              </div>
              {score.nameZh && score.nameZh !== score.name && (
                <div className="text-[12px] text-slate-400">{score.name}</div>
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
                { label: "技術", val: score.technicalScore,     cls: "text-blue-700" },
                { label: "基本", val: score.fundamentalScore,   cls: "text-emerald-700" },
                { label: "資金", val: score.moneyFlowScore,     cls: "text-violet-700" },
                { label: "情绪", val: score.newsSentimentScore, cls: "text-amber-700" },
                { label: "全球", val: score.globalTrendScore,   cls: "text-cyan-700" },
              ].map((d) => (
                <div key={d.label} className="text-center w-10">
                  <div className={`text-sm font-bold tabular-nums ${d.cls}`}>{d.val}</div>
                  <div className="text-[10px] text-slate-400">{d.label}</div>
                </div>
              ))}
            </div>
            <div className="text-right w-28">
              <div className="text-sm font-bold text-slate-900 tabular-nums">¥{score.latestClose.toLocaleString()}</div>
              <div className={`text-xs font-semibold tabular-nums ${pctColor(score.return5d)}`}>{pctText(score.return5d)} <span className="text-slate-400 font-normal">5日</span></div>
              <div className="text-[10px] text-slate-400">{score.latestDate}</div>
            </div>
            <span className="text-slate-300 text-xs">{open ? "▲" : "▼"}</span>
          </div>
        </div>

        {/* 5-dim bars (compact) */}
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "技術面 (30)",   score: score.technicalScore,    max: 30, color: "bg-blue-400" },
            { label: "基本面 (25)",   score: score.fundamentalScore,  max: 25, color: "bg-emerald-400" },
            { label: "資金面 (20)",   score: score.moneyFlowScore,    max: 20, color: "bg-violet-400" },
            { label: "情绪面 (15)",   score: score.newsSentimentScore,max: 15, color: "bg-amber-400" },
            { label: "全球趋势 (10)", score: score.globalTrendScore,  max: 10, color: "bg-cyan-400" },
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
              <div className="text-xs font-semibold text-slate-700 mb-3">评级详情</div>
              <div className="space-y-2 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span className="text-slate-400">V7.7 评级</span>
                  <span className={`font-bold ${(REC_CFG[score.recommendationV2] ?? REC_CFG.HOLD).text}`}>{(REC_CFG[score.recommendationV2] ?? REC_CFG.HOLD).label}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">动态评分</span>
                  <span className="font-bold tabular-nums">{score.adaptiveScore.toFixed(1)}</span>
                </div>
                {score.percentileRank != null && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">市场排名</span>
                    <span className="font-bold tabular-nums">前 {score.percentileRank.toFixed(1)}%（第 {score.marketRank} 位）</span>
                  </div>
                )}
                {score.opportunityScore != null && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">机会分</span>
                    <span className="font-bold tabular-nums">{score.opportunityScore.toFixed(1)}{score.opportunityLabel ? ` · ${score.opportunityLabel === "STEADY" ? "稳健" : "高风险"}` : ""}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-400">风格</span>
                  <span>{score.stockStyle ? (STYLE_LABEL[score.stockStyle] ?? score.stockStyle) : "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">20日涨跌</span>
                  <span className={`font-semibold ${pctColor(score.return20d)}`}>{pctText(score.return20d)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">数据源</span>
                  <span>{SOURCE_BADGE[score.scoreSource] ?? score.scoreSource}</span>
                </div>
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-700 mb-3">AI分析</div>
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
    <div className={`rounded-xl border p-4 mb-6 ${t.bg}`}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{t.emoji}</span>
          <div>
            <div className={`font-bold text-base ${t.color}`}>{t.label}</div>
            <div className="text-xs text-slate-500 mt-0.5">
              买入合计 {stats.bullCount} 只（{stats.bullRate}%）· 共 {stats.total} 只评估标的
            </div>
          </div>
        </div>
        <div className="flex gap-4 text-center">
          {[
            { label: "强买", value: stats.strongBuy, cls: "text-red-600" },
            { label: "买入", value: stats.buy,       cls: "text-orange-600" },
            { label: "持有", value: stats.hold,      cls: "text-slate-500" },
            { label: "观察", value: stats.watch,     cls: "text-yellow-600" },
            { label: "回避", value: stats.avoid,     cls: "text-blue-500" },
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
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-red-700 text-sm">
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
        <h1 className="text-2xl font-bold text-slate-900">AI推荐排行</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          J-Quants真实数据　V7.7双门槛评级（adaptiveScore + 百分位排名）
          　更新：{new Date(data.updatedAt).toLocaleString("zh-CN")}
        </p>
      </div>

      {/* Market Temperature Banner */}
      <MarketTemperatureBanner stats={marketStats} />

      {/* Mode tabs */}
      <div className="flex gap-1 mb-4 bg-slate-100 rounded-lg p-1 overflow-x-auto max-w-full">
        {([
          { key: "top",         label: "综合评分" },
          { key: "opportunity", label: "稳健机会" },
          { key: "high_risk",   label: "高风险动能" },
        ] as const).map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              mode === m.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* TOP 3 */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-yellow-400">✦</span>
          <h2 className="font-semibold text-white">AI推荐 TOP 3</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {top3.map((s, i) => {
            const rec = REC_CFG[s.recommendationV2] ?? REC_CFG.HOLD;
            return (
              <Link
                key={s.symbol}
                href={`/stocks/${encodeURIComponent(s.symbol)}`}
                className="bg-white/10 hover:bg-white/20 transition-colors rounded-xl p-4 block"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-lg">{["🥇","🥈","🥉"][i]}</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${rec.bg} ${rec.text}`}>{rec.label}</span>
                </div>
                <div className="text-[15px] font-bold text-white leading-tight">{s.nameZh || s.name}</div>
                {s.nameZh && s.nameZh !== s.name && (
                  <div className="text-[12px] text-slate-400 truncate">{s.name}</div>
                )}
                <div className="text-[12px] text-slate-500 font-mono mt-0.5 mb-2">{s.symbol}</div>
                <div className="text-2xl font-bold text-white tabular-nums">{s.adaptiveScore.toFixed(0)}分</div>
                {s.percentileRank != null && (
                  <div className="text-slate-300 text-xs mt-0.5">前 {s.percentileRank.toFixed(1)}% · 第 {s.marketRank} 位</div>
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
      <div className="flex gap-1 mb-4 bg-slate-100 rounded-lg p-1 overflow-x-auto max-w-full">
        {(["ALL", "BUY", "WATCH", "AVOID"] as const).map((f) => {
          const labels: Record<typeof f, string> = {
            ALL:   `全部 (${scores.length})`,
            BUY:   `买入 (${buyCount})`,
            WATCH: `观察 (${watchCount})`,
            AVOID: `持有/回避 (${avoidCount})`,
          };
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
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
