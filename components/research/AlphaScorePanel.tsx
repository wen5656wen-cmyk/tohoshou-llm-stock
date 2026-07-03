"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

// Alpha Score — Phase 2A Shadow Mode (admin). SHADOW ONLY: not connected to production
// AI Score. English/technical labels.

type Contribution = { factor: string; value: number | null; z: number | null; direction: number; weight: number; contribution: number };
type Row = {
  symbol: string; name: string; nameZh: string | null; sector: string | null;
  alphaScore: number; composite: number; rank: number; percentile: number;
  factorBreakdown: Contribution[];
  aiAdaptiveScore: number | null; aiPercentile: number | null; aiRecommendationV2: string | null;
  drGptRank: number | null; drRecommendation: string | null;
};
type Weight = { factor: string; direction: number; weight: number };
type Resp = { date: string | null; computedAt: string | null; total: number; weights: Weight[]; rows: Row[] };

const FSHORT: Record<string, string> = {
  RelativeStrength: "RS", ATR: "ATR", VolumeRatio: "量比",
  AverageTurnover: "成交额", Distance52WeekHigh: "52周高", VolumeExpansion: "放量",
};

function fx(v: number | null, d = 1) { return v == null ? "—" : v.toFixed(d); }

function topContribs(bd: Contribution[]): string {
  return [...(bd ?? [])]
    .filter((b) => b.contribution !== 0)
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 3)
    .map((b) => `${FSHORT[b.factor] ?? b.factor}${b.contribution >= 0 ? "+" : ""}${b.contribution.toFixed(2)}`)
    .join("  ") || "—";
}

export function AlphaScorePanel() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    setLoading(true);
    fetch("/api/alpha/score?limit=3000")
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then((d: Resp) => { setData(d); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    if (!q.trim()) return data.rows;
    const ql = q.trim().toLowerCase();
    return data.rows.filter((r) => r.symbol.toLowerCase().includes(ql) || (r.name ?? "").toLowerCase().includes(ql) || (r.nameZh ?? "").includes(q.trim()));
  }, [data, q]);

  function exportCsv() {
    if (!data) return;
    const header = ["rank", "symbol", "name", "alphaScore", "percentile", "composite",
      "aiAdaptiveScore", "aiRecommendationV2", "drGptRank", "drRecommendation"];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push([r.rank, r.symbol, `"${(r.name ?? "").replace(/"/g, '""')}"`, r.alphaScore, r.percentile,
        r.composite, r.aiAdaptiveScore ?? "", r.aiRecommendationV2 ?? "", r.drGptRank ?? "", r.drRecommendation ?? ""].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `alpha-score-${data.date ?? "latest"}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 max-w-[1400px]">
      <div className="mb-3">
        <h1 className="text-2xl font-bold text-slate-900">Alpha评分（影子评分）</h1>
        <p className="text-sm text-slate-500 mt-1">
          第 2A 阶段 · 分析加权复合评分 · <span className="text-amber-600 font-medium">影子评分（仅研究，不参与正式评分）</span> ·{" "}
          {loading ? "加载中…" : error ? `错误：${error}` : `日期 ${data?.date ?? "—"} · ${rows.length} 条`}
        </p>
      </div>

      {/* Weights */}
      {data?.weights?.length ? (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 mb-4 text-xs flex flex-wrap gap-x-5 gap-y-1">
          <span className="text-slate-400 font-medium">因子权重：</span>
          {data.weights.map((w) => (
            <span key={w.factor} className="tabular-nums">
              {FSHORT[w.factor] ?? w.factor}
              <span className={w.direction >= 0 ? "text-emerald-600" : "text-red-500"}>{w.direction >= 0 ? " +" : " −"}</span>
              <span className="font-semibold text-slate-700">{(w.weight * 100).toFixed(1)}%</span>
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex gap-2 mb-4">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索股票代码/名称…"
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <button onClick={exportCsv} disabled={!rows.length}
          className="bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-sm px-4 py-2 rounded-lg font-medium">导出CSV</button>
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          加载失败（{error}）。请运行 <code className="font-mono">npm run compute-alpha-score</code>。
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-auto" style={{ maxHeight: "calc(100vh - 260px)" }}>
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-50 z-10">
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="px-3 py-2 font-medium text-right">#</th>
                <th className="px-3 py-2 font-medium">股票</th>
                <th className="px-3 py-2 font-medium text-right">Alpha评分</th>
                <th className="px-3 py-2 font-medium text-right">百分位</th>
                <th className="px-3 py-2 font-medium">主要贡献因子</th>
                <th className="px-3 py-2 font-medium text-right">AI综合评分</th>
                <th className="px-3 py-2 font-medium text-center">AI评级</th>
                <th className="px-3 py-2 font-medium text-right">推荐排名</th>
                <th className="px-3 py-2 font-medium text-center">推荐等级</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="px-3 py-10 text-center text-slate-400">加载中…</td></tr>
              ) : rows.map((r) => (
                <tr key={r.symbol} className="border-b border-slate-50 hover:bg-blue-50/30">
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-400">{r.rank}</td>
                  <td className="px-3 py-1.5">
                    <Link href={`/stocks/${encodeURIComponent(r.symbol)}`} className="text-blue-600 hover:underline font-mono">{r.symbol}</Link>
                    <span className="text-slate-500 ml-1.5">{r.nameZh ?? r.name}</span>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-slate-900">{r.alphaScore.toFixed(1)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{r.percentile.toFixed(1)}</td>
                  <td className="px-3 py-1.5 font-mono text-[11px] text-slate-500">{topContribs(r.factorBreakdown)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">{fx(r.aiAdaptiveScore, 0)}</td>
                  <td className="px-3 py-1.5 text-center text-slate-500">{r.aiRecommendationV2 ?? "—"}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{r.drGptRank ?? "—"}</td>
                  <td className="px-3 py-1.5 text-center text-slate-500">{r.drRecommendation ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
