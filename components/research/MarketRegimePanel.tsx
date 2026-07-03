"use client";

import { useEffect, useState } from "react";
import { PanelHeader, TERM_TIPS } from "./PanelHeader";

// Market Regime (P2-T3) — Bull/Sideways/Bear timeline (admin). English labels. Research-only.

type Row = {
  date: string; regime: string; regimeScore: number | null; trendScore: number | null;
  breadth: number | null; volatility: number | null; topixClose: number | null;
  ma20: number | null; ma60: number | null; ma120: number | null;
};
type Resp = {
  current: { date: string; regime: string; regimeScore: number | null; trendScore: number | null; breadth: number | null; volatility: number | null } | null;
  distribution: { BULL: number; SIDEWAYS: number; BEAR: number };
  computedAt: string | null;
  timeline: Row[];
};

const RCOLOR: Record<string, string> = { BULL: "#16a34a", SIDEWAYS: "#d97706", BEAR: "#dc2626" };
const RBG: Record<string, string> = { BULL: "#dcfce7", SIDEWAYS: "#fef3c7", BEAR: "#fee2e2" };
const RZH: Record<string, string> = { BULL: "牛市", SIDEWAYS: "震荡市", BEAR: "熊市" };
function rzh(s: string) { return RZH[s] ?? s; }
function fx(v: number | null, d = 1) { return v == null ? "—" : v.toFixed(d); }

export function MarketRegimePanel() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/regime?limit=200")
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then((d: Resp) => { setData(d); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, []);

  function exportCsv() {
    if (!data) return;
    const header = ["date", "regime", "regimeScore", "trendScore", "breadth", "volatility", "topixClose", "ma20", "ma60", "ma120"];
    const lines = [header.join(",")];
    for (const r of data.timeline) lines.push([r.date, r.regime, r.regimeScore ?? "", r.trendScore ?? "", r.breadth ?? "", r.volatility ?? "", r.topixClose ?? "", r.ma20 ?? "", r.ma60 ?? "", r.ma120 ?? ""].join(","));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "market-regime.csv"; a.click(); URL.revokeObjectURL(url);
  }

  const dist = data?.distribution ?? { BULL: 0, SIDEWAYS: 0, BEAR: 0 };
  const total = dist.BULL + dist.SIDEWAYS + dist.BEAR || 1;

  return (
    <div className="p-6 max-w-5xl">
      <PanelHeader title="市场状态" desc="识别当前牛市、震荡市或熊市。" phase="P2-T3"
        dataDate={data?.current?.date} computedAt={data?.computedAt}
        statusText="仅研究（不影响正式AI推荐）" loading={loading} error={error} />

      {data?.current ? (
        <div className="flex flex-wrap gap-3 mb-5">
          <div className="rounded-2xl border shadow-sm p-4 min-w-[180px]" style={{ background: RBG[data.current.regime], borderColor: RCOLOR[data.current.regime] }}>
            <div className="text-[11px] text-slate-500">当前市场状态 · {data.current.date}</div>
            <div className="text-2xl font-bold" style={{ color: RCOLOR[data.current.regime] }}>{rzh(data.current.regime)}</div>
            <div className="text-[11px] text-slate-500 mt-1">评分 {fx(data.current.regimeScore, 2)} · 趋势 {fx(data.current.trendScore, 2)} · 市场宽度 {fx(data.current.breadth)}% · 波动率 {fx(data.current.volatility)}%</div>
          </div>
          {(["BULL", "SIDEWAYS", "BEAR"] as const).map((r) => (
            <div key={r} className="rounded-2xl border border-slate-200 shadow-sm p-4 min-w-[120px] bg-white">
              <div className="text-[11px] text-slate-400">{rzh(r)}</div>
              <div className="text-2xl font-bold" style={{ color: RCOLOR[r] }}>{dist[r]}</div>
              <div className="text-[11px] text-slate-400">{((dist[r] / total) * 100).toFixed(0)}% 天数占比</div>
            </div>
          ))}
          <button onClick={exportCsv} className="ml-auto self-start text-sm px-4 py-2 rounded-lg font-medium bg-slate-900 text-white hover:bg-slate-800">导出CSV</button>
        </div>
      ) : null}

      {/* Regime band (recent → old, left to right reversed to old→recent) */}
      {data?.timeline.length ? (
        <div className="bg-white rounded-xl border border-slate-200 p-3 mb-4">
          <div className="text-[11px] text-slate-400 mb-2">市场状态时间轴（旧 → 新）</div>
          <div className="flex gap-[1px] h-8 rounded overflow-hidden">
            {[...data.timeline].reverse().map((r) => (
              <div key={r.date} title={`${r.date} · ${r.regime} · score ${fx(r.regimeScore, 2)}`} style={{ background: RCOLOR[r.regime], flex: 1 }} />
            ))}
          </div>
        </div>
      ) : null}

      <div className="bg-white rounded-xl border border-slate-200 overflow-auto" style={{ maxHeight: "calc(100vh - 380px)" }}>
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-50">
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="px-3 py-2 font-medium">日期</th>
              <th className="px-3 py-2 font-medium">状态</th>
              <th className="px-3 py-2 font-medium text-right">评分</th>
              <th className="px-3 py-2 font-medium text-right" title={TERM_TIPS["趋势"]}>趋势</th>
              <th className="px-3 py-2 font-medium text-right" title={TERM_TIPS["市场宽度"]}>市场宽度</th>
              <th className="px-3 py-2 font-medium text-right" title={TERM_TIPS["波动率"]}>波动率</th>
              <th className="px-3 py-2 font-medium text-right">TOPIX</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-3 py-10 text-center text-slate-400">加载中…</td></tr>
            ) : (data?.timeline ?? []).map((r) => (
              <tr key={r.date} className="border-b border-slate-50">
                <td className="px-3 py-1.5 font-mono text-slate-500">{r.date}</td>
                <td className="px-3 py-1.5"><span className="px-2 py-0.5 rounded font-medium" style={{ background: RBG[r.regime], color: RCOLOR[r.regime] }}>{rzh(r.regime)}</span></td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fx(r.regimeScore, 2)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fx(r.trendScore, 2)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fx(r.breadth)}%</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fx(r.volatility)}%</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{r.topixClose == null ? "—" : r.topixClose.toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
