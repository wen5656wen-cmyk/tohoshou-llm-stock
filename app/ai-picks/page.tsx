"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type AiScore = {
  symbol: string;
  name: string;
  latestClose: number;
  latestDate: string;
  technicalScore: number;
  fundamentalScore: number;
  riskScore: number;
  totalScore: number;
  stars: number;
  starsLabel: string;
  recommendation: "STRONG_BUY" | "BUY" | "WATCH" | "HOLD" | "AVOID";
  technicalReasons: string[];
  fundamentalReasons: string[];
  riskReasons: string[];
  summaryReason: string;
  detail: {
    maTrendScore: number;
    macdScore: number;
    rsiScore: number;
    return20dScore: number;
    return60dScore: number;
    opMarginScore: number;
    roeScore: number;
    epsScore: number;
    equityRatioScore: number;
    volatilityScore: number;
    rsiSafetyScore: number;
    recentMoveScore: number;
    dataCompletenessScore: number;
  };
};

type ApiResponse = { scores: AiScore[]; updatedAt: string };

const REC_CFG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  STRONG_BUY: { label: "强烈买入", bg: "bg-red-50",    text: "text-red-700",    border: "border-red-200" },
  BUY:        { label: "买入",     bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
  WATCH:      { label: "关注",     bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-200" },
  HOLD:       { label: "持有",     bg: "bg-slate-50",  text: "text-slate-600",  border: "border-slate-200" },
  AVOID:      { label: "回避",     bg: "bg-blue-50",   text: "text-blue-600",   border: "border-blue-200" },
};

function ScoreBar({ score, max = 100, color }: { score: number; max?: number; color: string }) {
  const pct = Math.min(100, Math.round((score / max) * 100));
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-slate-600 w-8 text-right">{score}</span>
    </div>
  );
}

function ReasonList({ reasons, color }: { reasons: string[]; color: string }) {
  return (
    <ul className="space-y-1">
      {reasons.map((r, i) => (
        <li key={i} className={`text-xs flex items-start gap-1.5 ${color}`}>
          <span className="mt-0.5 shrink-0">▸</span>
          <span>{r}</span>
        </li>
      ))}
    </ul>
  );
}

function DetailCard({ score }: { score: AiScore }) {
  const [open, setOpen] = useState(false);
  const rec = REC_CFG[score.recommendation] ?? REC_CFG.HOLD;

  return (
    <div className={`rounded-xl border ${rec.border} ${rec.bg} overflow-hidden`}>
      <div className="px-5 py-4 cursor-pointer" onClick={() => setOpen((v) => !v)}>
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="text-center min-w-[2.5rem]">
              <div className={`text-lg font-bold tabular-nums ${rec.text}`}>{score.totalScore}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">综合</div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <Link
                  href={`/stocks/${encodeURIComponent(score.symbol)}`}
                  className="font-semibold text-slate-900 hover:text-blue-600 text-sm"
                  onClick={(e) => e.stopPropagation()}
                >
                  {score.name}
                </Link>
                <span className="text-xs text-slate-400 font-mono">{score.symbol}</span>
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${rec.border} ${rec.text} ${rec.bg}`}>
                  {rec.label}
                </span>
              </div>
              <div className="text-[11px] text-slate-500">{score.starsLabel}</div>
              <div className="text-[11px] text-slate-500 mt-0.5 max-w-lg">{score.summaryReason}</div>
            </div>
          </div>

          <div className="flex items-center gap-5 shrink-0 ml-4">
            <div className="text-center w-12">
              <div className="text-sm font-bold text-blue-700 tabular-nums">{score.technicalScore}</div>
              <div className="text-[10px] text-slate-400">技术</div>
            </div>
            <div className="text-center w-12">
              <div className="text-sm font-bold text-emerald-700 tabular-nums">{score.fundamentalScore}</div>
              <div className="text-[10px] text-slate-400">基本面</div>
            </div>
            <div className="text-center w-12">
              <div className="text-sm font-bold text-violet-700 tabular-nums">{score.riskScore}</div>
              <div className="text-[10px] text-slate-400">安全性</div>
            </div>
            <div className="text-right w-24">
              <div className="text-sm font-bold text-slate-900 tabular-nums">¥{score.latestClose.toLocaleString()}</div>
              <div className="text-[10px] text-slate-400">{score.latestDate}</div>
            </div>
            <span className="text-slate-300 text-xs">{open ? "▲" : "▼"}</span>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-4">
          <div>
            <div className="text-[10px] text-slate-400 mb-1">技术指标 (40%)</div>
            <ScoreBar score={score.technicalScore} color="bg-blue-400" />
          </div>
          <div>
            <div className="text-[10px] text-slate-400 mb-1">基本面 (40%)</div>
            <ScoreBar score={score.fundamentalScore} color="bg-emerald-400" />
          </div>
          <div>
            <div className="text-[10px] text-slate-400 mb-1">安全性 (20%)</div>
            <ScoreBar score={score.riskScore} color="bg-violet-400" />
          </div>
        </div>
      </div>

      {open && (
        <div className="px-5 pb-5 border-t border-slate-200/60 pt-4">
          <div className="grid grid-cols-3 gap-5">
            <div>
              <div className="text-xs font-semibold text-blue-700 mb-2">技术面依据</div>
              <ReasonList reasons={score.technicalReasons} color="text-slate-600" />
              <div className="mt-3 space-y-1.5">
                {[
                  { label: "均线趋势", s: score.detail.maTrendScore,   m: 25 },
                  { label: "MACD",     s: score.detail.macdScore,       m: 20 },
                  { label: "RSI",      s: score.detail.rsiScore,        m: 25 },
                  { label: "20日涨跌", s: score.detail.return20dScore,  m: 15 },
                  { label: "60日涨跌", s: score.detail.return60dScore,  m: 15 },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                      <span>{item.label}</span><span>{item.s}/{item.m}</span>
                    </div>
                    <ScoreBar score={item.s} max={item.m} color="bg-blue-300" />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-emerald-700 mb-2">基本面依据</div>
              <ReasonList reasons={score.fundamentalReasons} color="text-slate-600" />
              <div className="mt-3 space-y-1.5">
                {[
                  { label: "营业利润率", s: score.detail.opMarginScore,   m: 25 },
                  { label: "ROE",        s: score.detail.roeScore,         m: 25 },
                  { label: "EPS",        s: score.detail.epsScore,         m: 25 },
                  { label: "自有资本比率",s: score.detail.equityRatioScore, m: 25 },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                      <span>{item.label}</span><span>{item.s}/{item.m}</span>
                    </div>
                    <ScoreBar score={item.s} max={item.m} color="bg-emerald-300" />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-violet-700 mb-2">风险评估依据</div>
              <ReasonList reasons={score.riskReasons} color="text-slate-600" />
              <div className="mt-3 space-y-1.5">
                {[
                  { label: "60日波动幅度", s: score.detail.volatilityScore,       m: 30 },
                  { label: "RSI安全度",    s: score.detail.rsiSafetyScore,        m: 25 },
                  { label: "近期急变动",   s: score.detail.recentMoveScore,       m: 25 },
                  { label: "数据完备度",   s: score.detail.dataCompletenessScore, m: 20 },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                      <span>{item.label}</span><span>{item.s}/{item.m}</span>
                    </div>
                    <ScoreBar score={item.s} max={item.m} color="bg-violet-300" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AiPicksPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"ALL" | "BUY" | "WATCH" | "AVOID">("ALL");

  useEffect(() => {
    fetch("/api/ai-scores")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="text-slate-400 text-sm animate-pulse">AI评分计算中，请稍候...</div>
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

  const { scores } = data;
  const buyCount   = scores.filter((s) => s.recommendation === "STRONG_BUY" || s.recommendation === "BUY").length;
  const watchCount = scores.filter((s) => s.recommendation === "WATCH").length;
  const avoidCount = scores.filter((s) => s.recommendation === "AVOID" || s.recommendation === "HOLD").length;

  const filtered =
    filter === "ALL"   ? scores
    : filter === "BUY"   ? scores.filter((s) => s.recommendation === "STRONG_BUY" || s.recommendation === "BUY")
    : filter === "WATCH" ? scores.filter((s) => s.recommendation === "WATCH")
    :                      scores.filter((s) => s.recommendation === "HOLD" || s.recommendation === "AVOID");

  const top3 = scores.slice(0, 3);

  return (
    <div className="p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">AI推荐排行</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          J-Quants实盘数据　技术40% + 基本面40% + 安全性20%
          　计算时间：{new Date(data.updatedAt).toLocaleString("zh-CN")}
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: "评估股票",   value: scores.length, cls: "text-slate-900" },
          { label: "买入推荐",   value: buyCount,       cls: "text-red-600" },
          { label: "值得关注",   value: watchCount,     cls: "text-yellow-600" },
          { label: "持有/回避",  value: avoidCount,     cls: "text-slate-400" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="text-xs text-slate-500 mb-1">{s.label}</div>
            <div className={`text-3xl font-bold tabular-nums ${s.cls}`}>
              {s.value}<span className="text-sm font-normal text-slate-400 ml-1">只</span>
            </div>
          </div>
        ))}
      </div>

      {/* TOP 3 */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-yellow-400">✦</span>
          <h2 className="font-semibold text-white">AI推荐 TOP 3</h2>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {top3.map((s, i) => {
            const rec = REC_CFG[s.recommendation] ?? REC_CFG.HOLD;
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
                <div className="font-semibold text-white text-sm mb-0.5">{s.name}</div>
                <div className="text-slate-400 text-xs mb-2">{s.symbol}</div>
                <div className="text-2xl font-bold text-white tabular-nums">{s.totalScore}分</div>
                <div className="text-slate-300 text-xs mt-1">{s.starsLabel}</div>
                <div className="mt-2 text-slate-400 text-[11px] line-clamp-2">{s.summaryReason}</div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-1 mb-4 bg-slate-100 rounded-lg p-1 w-fit">
        {(["ALL", "BUY", "WATCH", "AVOID"] as const).map((f) => {
          const labels: Record<typeof f, string> = {
            ALL:   `全部 (${scores.length})`,
            BUY:   `买入 (${buyCount})`,
            WATCH: `关注 (${watchCount})`,
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
