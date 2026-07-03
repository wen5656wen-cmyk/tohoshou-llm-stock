"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PanelHeader } from "./PanelHeader";

// V3 动态评分（P3-T1，Shadow-only 展示）。不影响正式 AI 推荐。

type Row = {
  symbol: string; name: string; nameZh: string | null;
  scoreV3: number; rawScore: number; riskAdjustment: number; rank: number; percentile: number; rating: string;
  confidence: number; qualityScore: number; calibrated: boolean;
  subScores: Record<string, number | null> | null;
  contributions: Record<string, number | null> | null;
  explanation: string;
  v2AdaptiveScore: number | null; v2PercentileRank: number | null; v2Rec: string | null;
};
type Shadow = {
  date: string | null; computedAt: string | null; regime: string | null;
  weights: Record<string, number> | null; total: number;
  ratingDist: Record<string, number>; dimCoverage: Record<string, number>; rows: Row[];
};
type BtRow = { period: number; strategy: string; topN: number; holdDays: number; cumReturn: number | null; alpha: number | null; sharpe: number | null; maxDrawdown: number | null; winRate: number | null; annualizedReturn: number | null; turnover: number | null };
type Backtest = { asOfLatest: string | null; regime: string | null; v3Weights: any; fusionAlphaWeight: number; turnover: Record<string, number | null>; rows: BtRow[] };

const DIM_ZH: Record<string, string> = { technical: "技术面", fundamental: "基本面", alpha: "Alpha", news: "新闻事件", flow: "资金流动性" };
const RATING_ZH: Record<string, string> = { STRONG_BUY: "强烈买入", BUY: "买入", HOLD: "持有", WATCH: "观察", AVOID: "回避" };
const RATING_COLOR: Record<string, string> = { STRONG_BUY: "#16a34a", BUY: "#2563eb", HOLD: "#64748b", WATCH: "#d97706", AVOID: "#dc2626" };
const STRAT_ZH: Record<string, string> = { PRODUCTION: "正式评分V2", ALPHA: "影子评分", FUSION: "融合", V3: "V3动态" };
function fx(v: number | null | undefined, d = 1) { return v == null ? "—" : v.toFixed(d); }
function pctColor(v: number | null | undefined) { return v == null ? "#94a3b8" : v > 0 ? "#16a34a" : v < 0 ? "#dc2626" : "#334155"; }

export function ScoreV3Panel() {
  const [data, setData] = useState<Shadow | null>(null);
  const [bt, setBt] = useState<Backtest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/scoring-v3/shadow?limit=800").then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); }).then(setData).catch((e) => setError(String(e)));
    fetch("/api/scoring-v3/backtest").then((r) => r.json()).then(setBt).catch(() => {});
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    if (!q.trim()) return data.rows;
    const ql = q.trim().toLowerCase();
    return data.rows.filter((r) => r.symbol.toLowerCase().includes(ql) || (r.name ?? "").toLowerCase().includes(ql) || (r.nameZh ?? "").includes(q.trim()));
  }, [data, q]);

  function exportCsv() {
    if (!data) return;
    const head = ["rank", "symbol", "name", "scoreV3", "rating", "percentile", "riskAdjustment", "v2AdaptiveScore", "v2Rec"];
    const lines = [head.join(",")];
    for (const r of data.rows) lines.push([r.rank, r.symbol, `"${(r.name ?? "").replace(/"/g, '""')}"`, r.scoreV3, r.rating, r.percentile, r.riskAdjustment, r.v2AdaptiveScore ?? "", r.v2Rec ?? ""].join(","));
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `score-v3-${data.date ?? "latest"}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  const btHead = useMemo(() => {
    if (!bt?.rows?.length) return [];
    return [30, 90, 180].map((p) => {
      const g = (s: string) => bt.rows.find((r) => r.period === p && r.strategy === s && r.topN === 20 && r.holdDays === 20);
      return { period: p, PRODUCTION: g("PRODUCTION"), ALPHA: g("ALPHA"), FUSION: g("FUSION"), V3: g("V3") };
    });
  }, [bt]);

  return (
    <div className="p-6 max-w-[1400px]">
      <PanelHeader title="V3动态评分" desc="Adaptive Score V3 Pro：动态权重 + 风险层 + 市场状态门控（Shadow 影子，不影响正式AI推荐）。" phase="P3-T1"
        dataDate={data?.date} computedAt={data?.computedAt} stockCount={data?.total}
        statusText="影子评分（不参与正式AI推荐）" error={error} loading={!data && !error} />

      {data?.weights ? (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 mb-4">
          <div className="text-[11px] text-slate-400 font-medium mb-2">今日动态权重 · 市场状态 {data.regime === "BULL" ? "🟢牛市" : data.regime === "BEAR" ? "🔴熊市" : "🟡震荡市"}（自动按因子质量/覆盖率/RankIC调整，全球维度已移除、资金改用个股级数据）</div>
          <div className="flex flex-wrap gap-2">
            {(["technical", "fundamental", "alpha", "news", "flow"] as const).map((d) => (
              <div key={d} className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5">
                <span className="text-xs text-slate-500">{DIM_ZH[d]}</span>
                <span className="text-sm font-bold text-slate-900 tabular-nums">{((data.weights![d] ?? 0) * 100).toFixed(1)}%</span>
                <span className="text-[10px] text-slate-400">覆盖{fx(data.dimCoverage?.[d])}%</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {btHead.length ? (
        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
          <div className="text-[11px] text-slate-400 font-medium mb-2">回测对比（Top20 · 持有20日 · 累计收益%）· 数据日期 {bt?.asOfLatest ?? "—"} · V3为价格核心重建（基本面/新闻无历史）</div>
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-slate-400 border-b border-slate-100">
                <th className="text-left py-1 font-medium">周期</th>
                {(["PRODUCTION", "ALPHA", "FUSION", "V3"] as const).map((s) => <th key={s} className="text-right py-1 font-medium">{STRAT_ZH[s]}</th>)}
              </tr></thead>
              <tbody>
                {btHead.map((r) => (
                  <tr key={r.period} className="border-b border-slate-50">
                    <td className="py-1 text-slate-600 font-medium">{r.period}日</td>
                    {(["PRODUCTION", "ALPHA", "FUSION", "V3"] as const).map((s) => (
                      <td key={s} className={`py-1 text-right tabular-nums font-semibold ${s === "V3" ? "bg-blue-50/40" : ""}`} style={{ color: pctColor((r as any)[s]?.cumReturn) }}>{fx((r as any)[s]?.cumReturn, 2)}%</td>
                    ))}
                  </tr>
                ))}
                <tr className="text-[11px] text-slate-400">
                  <td className="py-1">换手率</td>
                  {(["PRODUCTION", "ALPHA", "FUSION", "V3"] as const).map((s) => <td key={s} className="py-1 text-right tabular-nums">{fx(bt?.turnover?.[s])}%</td>)}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索股票代码/名称…" className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        {data ? <span className="text-xs text-slate-400">评级：{["STRONG_BUY", "BUY", "HOLD", "WATCH", "AVOID"].map((k) => `${RATING_ZH[k]} ${data.ratingDist[k] ?? 0}`).join(" · ")}</span> : null}
        <button onClick={exportCsv} disabled={!data?.rows.length} className="ml-auto bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-sm px-4 py-2 rounded-lg font-medium">导出CSV</button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-auto" style={{ maxHeight: "calc(100vh - 420px)" }}>
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-50 z-10">
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="px-3 py-2 font-medium text-right">#</th>
              <th className="px-3 py-2 font-medium">股票</th>
              <th className="px-3 py-2 font-medium text-right">V3评分</th>
              <th className="px-3 py-2 font-medium text-center">评级</th>
              <th className="px-3 py-2 font-medium text-right">百分位</th>
              <th className="px-3 py-2 font-medium text-right" title="可信度：分数背后的数据支撑度（覆盖/风险/维度完整）">Confidence</th>
              <th className="px-3 py-2 font-medium text-right" title="负向风险扣分（波动/流动性/财报/数据）">风险扣分</th>
              <th className="px-3 py-2 font-medium text-right">V2评分</th>
              <th className="px-3 py-2 font-medium text-center">V2评级</th>
              <th className="px-3 py-2 font-medium text-center">解释</th>
            </tr>
          </thead>
          <tbody>
            {!data ? (
              <tr><td colSpan={10} className="px-3 py-10 text-center text-slate-400">加载中…</td></tr>
            ) : rows.map((r) => (
              <Fragment key={r.symbol}>
                <tr className="border-b border-slate-50 hover:bg-blue-50/30">
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-400">{r.rank}</td>
                  <td className="px-3 py-1.5"><Link href={`/stocks/${encodeURIComponent(r.symbol)}`} className="text-blue-600 hover:underline font-mono">{r.symbol}</Link><span className="text-slate-500 ml-1.5">{r.nameZh ?? r.name}</span></td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-bold text-slate-900">{r.scoreV3.toFixed(1)}</td>
                  <td className="px-3 py-1.5 text-center"><span className="px-2 py-0.5 rounded font-medium text-white text-[11px]" style={{ background: RATING_COLOR[r.rating] }}>{RATING_ZH[r.rating] ?? r.rating}</span></td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{r.percentile.toFixed(1)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-medium" style={{ color: r.confidence >= 80 ? "#16a34a" : r.confidence >= 60 ? "#d97706" : "#dc2626" }}>{r.confidence.toFixed(0)}%</td>
                  <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: r.riskAdjustment < 0 ? "#dc2626" : "#94a3b8" }}>{r.riskAdjustment.toFixed(1)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{fx(r.v2AdaptiveScore, 0)}</td>
                  <td className="px-3 py-1.5 text-center text-slate-500">{r.v2Rec ?? "—"}</td>
                  <td className="px-3 py-1.5 text-center"><button onClick={() => setExpanded(expanded === r.symbol ? null : r.symbol)} className="text-blue-600 hover:underline">{expanded === r.symbol ? "收起" : "查看"}</button></td>
                </tr>
                {expanded === r.symbol ? (
                  <tr className="bg-slate-50">
                    <td colSpan={10} className="px-4 py-3">
                      <pre className="text-[11px] text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">{r.explanation}</pre>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
