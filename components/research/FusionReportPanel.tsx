"use client";

import { useEffect, useState } from "react";
import { PanelHeader } from "./PanelHeader";

// Adaptive Fusion Report (P2-T3) — per-regime Production vs Alpha + data-searched optimal
// fusion ratio (admin, research-only). English labels.

type Stat = { cumReturn: number | null; sharpe: number | null; winRate: number | null; maxDrawdown: number | null };
type GridPt = { w: number; sharpe: number | null; cumReturn: number | null };
type RegimeRow = {
  regime: string; nDays: number;
  production: Stat; alpha: Stat; fused: Stat;
  bestAlphaWeight: number | null; ratio: string | null;
  grid: GridPt[] | null;
};
type Resp = { computedAt: string | null; asOfLatest: string | null; objective: string; note: string; regimes: RegimeRow[] };

const RCOLOR: Record<string, string> = { BULL: "#16a34a", SIDEWAYS: "#d97706", BEAR: "#dc2626" };
const RZH: Record<string, string> = { BULL: "牛市", SIDEWAYS: "震荡市", BEAR: "熊市" };
const FR_NOTE = "融合 = w·影子评分 + (1-w)·正式评分（两者截面标准化）。最优 w 由历史按市场状态搜索得出（前20 · 持有20日，最大化夏普比率）。由 DailyPrice 重建，正式推荐不受影响。";
function pct(v: number | null) { return v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`; }
function num(v: number | null, d = 2) { return v == null ? "—" : v.toFixed(d); }
function col(v: number | null) { return v == null ? "#94a3b8" : v > 0 ? "#16a34a" : v < 0 ? "#dc2626" : "#334155"; }

export function FusionReportPanel() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/fusion/report")
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then((d: Resp) => { setData(d); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, []);

  function exportCsv() {
    if (!data) return;
    const header = ["regime", "nDays", "bestAlphaWeight", "ratioProdAlpha", "prodCum", "prodSharpe", "alphaCum", "alphaSharpe", "fusedCum", "fusedSharpe"];
    const lines = [header.join(",")];
    for (const r of data.regimes) lines.push([r.regime, r.nDays, r.bestAlphaWeight ?? "", r.ratio ?? "", r.production.cumReturn ?? "", r.production.sharpe ?? "", r.alpha.cumReturn ?? "", r.alpha.sharpe ?? "", r.fused.cumReturn ?? "", r.fused.sharpe ?? ""].join(","));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "fusion-report.csv"; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 max-w-6xl">
      <PanelHeader title="AI融合策略研究" desc="寻找不同市场状态下最优评分融合比例。" phase="P2-T3"
        dataDate={data?.asOfLatest} computedAt={data?.computedAt}
        statusText="研究模式（不参与正式AI推荐）" loading={loading} error={error} />
      <div className="flex items-center justify-between mb-4">
        <span />
        <button onClick={exportCsv} disabled={!data?.regimes.length} className="text-sm px-4 py-2 rounded-lg font-medium bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40">导出CSV</button>
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">加载失败（{error}）。请运行 <code className="font-mono">npm run research-fusion</code>。</div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))" }}>
          {(loading ? [] : data!.regimes).map((r) => {
            const w = r.bestAlphaWeight ?? 0;
            const grid = r.grid ?? [];
            const maxS = Math.max(...grid.map((g) => g.sharpe ?? -1e9), 0.001);
            const minS = Math.min(...grid.map((g) => g.sharpe ?? 1e9), 0);
            return (
              <div key={r.regime} className="bg-white rounded-2xl border shadow-sm p-4" style={{ borderColor: RCOLOR[r.regime] }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-lg font-bold" style={{ color: RCOLOR[r.regime] }}>{RZH[r.regime] ?? r.regime}</span>
                  <span className="text-[11px] text-slate-400">{r.nDays} 天 · 前20 · 20日</span>
                </div>

                {/* Optimal fusion ratio */}
                <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 mb-3">
                  <div className="text-[11px] text-slate-400">最佳融合比例（正式 / 影子）</div>
                  <div className="text-xl font-bold text-slate-900">{r.ratio ?? "—"}</div>
                  <div className="text-[10px] text-slate-400">影子权重 = {num(r.bestAlphaWeight, 2)} · 历史搜索，非人工</div>
                </div>

                {/* Strategy comparison */}
                <table className="w-full text-xs mb-3">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-100">
                      <th className="text-left py-1 font-medium"></th>
                      <th className="text-right py-1 font-medium">累计收益</th>
                      <th className="text-right py-1 font-medium">夏普比率</th>
                      <th className="text-right py-1 font-medium">胜率</th>
                      <th className="text-right py-1 font-medium">最大回撤</th>
                    </tr>
                  </thead>
                  <tbody>
                    {([["正式评分", r.production], ["影子评分", r.alpha], ["最佳融合方案", r.fused]] as const).map(([label, s]) => (
                      <tr key={label} className="border-b border-slate-50">
                        <td className="py-1 text-slate-600 font-medium">{label}</td>
                        <td className="py-1 text-right tabular-nums" style={{ color: col(s.cumReturn) }}>{pct(s.cumReturn)}</td>
                        <td className="py-1 text-right tabular-nums text-slate-700">{num(s.sharpe)}</td>
                        <td className="py-1 text-right tabular-nums text-slate-500">{s.winRate == null ? "—" : `${s.winRate.toFixed(0)}%`}</td>
                        <td className="py-1 text-right tabular-nums text-red-500">{s.maxDrawdown == null ? "—" : `-${s.maxDrawdown.toFixed(1)}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Grid: Sharpe by w */}
                <div className="text-[10px] text-slate-400 mb-1">不同权重下的夏普比率（影子权重 0→1）</div>
                <div className="flex items-end gap-[2px] h-14">
                  {grid.map((g) => {
                    const h = g.sharpe == null ? 0 : Math.max(2, ((g.sharpe - minS) / (maxS - minS || 1)) * 100);
                    const isBest = Math.abs(g.w - w) < 0.001;
                    return <div key={g.w} title={`w=${g.w} sharpe=${num(g.sharpe)}`} style={{ flex: 1, height: `${h}%`, background: isBest ? RCOLOR[r.regime] : "#cbd5e1" }} className="rounded-t" />;
                  })}
                </div>
                <div className="flex justify-between text-[9px] text-slate-300 mt-0.5"><span>0</span><span>影子权重</span><span>1</span></div>
              </div>
            );
          })}
        </div>
      )}
      {data?.note ? <p className="text-[11px] text-slate-400 mt-4">{FR_NOTE}</p> : null}
    </div>
  );
}
