"use client";

import { useEffect, useMemo, useState } from "react";
import { PanelHeader } from "./PanelHeader";

// Alpha Shadow Backtest (P2-T2) — Production vs Alpha validation (admin). English labels.
// Both scores reconstructed from DailyPrice; production recommendations are NOT affected.

type Cell = {
  strategy: string; topN: number; holdDays: number;
  cumReturn: number | null; alpha: number | null; sharpe: number | null;
  maxDrawdown: number | null; winRate: number | null; annualizedReturn: number | null; nObs: number;
};
type Resp = {
  period: number; availablePeriods: number[]; computedAt: string | null; asOfLatest: string | null;
  note: string; headline: { production: number | null; shadow: number | null; alpha: number | null };
  cells: Cell[];
};

const PERIODS = [30, 90, 180];
const TOPN = [10, 20, 50];
const HOLD = [5, 10, 20];
type View = "PRODUCTION" | "SHADOW" | "OVERLAY";
const VLABEL: Record<View, string> = { PRODUCTION: "正式评分", SHADOW: "影子评分", OVERLAY: "融合比较" };
const BT_NOTE = "两套评分均由 DailyPrice 历史重建。正式评分＝动量核心 z(20日收益)+z(60日收益)；影子评分＝分析加权 6 因子复合。重叠日采样，累计收益/回撤按非重叠 H 日再平衡计算。正式推荐不受影响。";

function pct(v: number | null) { return v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`; }
function num(v: number | null, d = 2) { return v == null ? "—" : v.toFixed(d); }
function col(v: number | null) { return v == null ? "#94a3b8" : v > 0 ? "#16a34a" : v < 0 ? "#dc2626" : "#334155"; }

export function AlphaBacktestPanel() {
  const [period, setPeriod] = useState(90);
  const [view, setView] = useState<View>("OVERLAY");
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true); setError(null);
    fetch(`/api/alpha/backtest?period=${period}`)
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then((d: Resp) => { setData(d); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, [period]);

  const cellMap = useMemo(() => {
    const m = new Map<string, Cell>();
    for (const c of data?.cells ?? []) m.set(`${c.strategy}-${c.topN}-${c.holdDays}`, c);
    return m;
  }, [data]);

  function exportCsv() {
    if (!data) return;
    const header = ["period", "strategy", "topN", "holdDays", "cumReturn", "alpha", "annualizedReturn", "sharpe", "maxDrawdown", "winRate", "nObs"];
    const lines = [header.join(",")];
    for (const c of data.cells) lines.push([data.period, c.strategy, c.topN, c.holdDays, c.cumReturn ?? "", c.alpha ?? "", c.annualizedReturn ?? "", c.sharpe ?? "", c.maxDrawdown ?? "", c.winRate ?? "", c.nObs].join(","));
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `alpha-backtest-${data.period}d.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const strategies: string[] = view === "PRODUCTION" ? ["PRODUCTION"] : view === "SHADOW" ? ["ALPHA"] : ["PRODUCTION", "ALPHA"];

  const bodyRows: Cell[] = [];
  for (const tn of TOPN) for (const h of HOLD) for (const s of strategies) {
    const c = cellMap.get(`${s}-${tn}-${h}`);
    if (c) bodyRows.push(c);
  }
  function isFirstOfConfig(i: number): boolean {
    if (i === 0) return true;
    const cur = bodyRows[i], prev = bodyRows[i - 1];
    return !(cur.topN === prev.topN && cur.holdDays === prev.holdDays);
  }

  return (
    <div className="p-6 max-w-6xl">
      <PanelHeader title="Alpha策略回测" desc="比较正式评分与影子评分历史表现。" phase="P2-T2"
        dataDate={data?.asOfLatest} computedAt={data?.computedAt}
        statusText="重建回测（正式推荐不受影响）" loading={loading} error={error} />

      {/* Headline (Top20, hold 20d) */}
      {data?.headline ? (
        <div className="grid grid-cols-3 gap-3 mb-4" style={{ maxWidth: 560 }}>
          <HeadCard label="正式评分" val={data.headline.production} sub="前20 · 20日" color="#475569" />
          <HeadCard label="影子评分(Alpha)" val={data.headline.shadow} sub="前20 · 20日" color="#2563eb" />
          <HeadCard label="Alpha(差值)" val={data.headline.alpha} sub="影子 − 正式" color={col(data.headline.alpha)} />
        </div>
      ) : null}

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {PERIODS.map((p) => (
          <button key={p} onClick={() => setPeriod(p)} className={`text-sm px-3 py-1.5 rounded-lg font-medium border ${period === p ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>{p}日</button>
        ))}
        <span className="mx-2 text-slate-300">|</span>
        {(["PRODUCTION", "SHADOW", "OVERLAY"] as View[]).map((v) => (
          <button key={v} onClick={() => setView(v)} className={`text-sm px-3 py-1.5 rounded-lg font-medium border ${view === v ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>{VLABEL[v]}</button>
        ))}
        <button onClick={exportCsv} disabled={!data?.cells.length} className="ml-auto text-sm px-4 py-1.5 rounded-lg font-medium bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40">导出CSV</button>
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">加载失败（{error}）。请运行 <code className="font-mono">npm run backtest-shadow</code>。</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50">
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="px-3 py-2 font-medium">组合配置</th>
                <th className="px-3 py-2 font-medium">策略</th>
                <th className="px-3 py-2 font-medium text-right">累计收益</th>
                <th className="px-3 py-2 font-medium text-right">Alpha年化</th>
                <th className="px-3 py-2 font-medium text-right">年化收益</th>
                <th className="px-3 py-2 font-medium text-right">夏普比率</th>
                <th className="px-3 py-2 font-medium text-right">最大回撤</th>
                <th className="px-3 py-2 font-medium text-right">胜率</th>
                <th className="px-3 py-2 font-medium text-right">样本数</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="px-3 py-10 text-center text-slate-400">加载中…</td></tr>
              ) : bodyRows.map((c, i) => (
                <tr key={`${c.topN}-${c.holdDays}-${c.strategy}`} className={`border-b border-slate-50 ${c.strategy === "ALPHA" ? "bg-blue-50/20" : ""}`}>
                  <td className="px-3 py-1.5 font-mono text-slate-500">{isFirstOfConfig(i) ? `前${c.topN} · ${c.holdDays}日` : ""}</td>
                  <td className="px-3 py-1.5 font-medium" style={{ color: c.strategy === "ALPHA" ? "#2563eb" : "#475569" }}>{c.strategy === "ALPHA" ? "影子评分" : "正式评分"}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold" style={{ color: col(c.cumReturn) }}>{pct(c.cumReturn)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: col(c.alpha) }}>{pct(c.alpha)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: col(c.annualizedReturn) }}>{pct(c.annualizedReturn)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">{num(c.sharpe)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-red-600">{c.maxDrawdown == null ? "—" : `-${c.maxDrawdown.toFixed(2)}%`}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{c.winRate == null ? "—" : `${c.winRate.toFixed(1)}%`}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-400">{c.nObs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data?.note ? <p className="text-[11px] text-slate-400 mt-3">{BT_NOTE}</p> : null}
    </div>
  );
}

function HeadCard({ label, val, sub, color }: { label: string; val: number | null; sub: string; color: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
      <div className="text-[11px] text-slate-400 mb-1">{label}</div>
      <div className="text-2xl font-bold tabular-nums" style={{ color }}>{val == null ? "—" : `${val >= 0 ? "+" : ""}${val.toFixed(1)}%`}</div>
      <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>
    </div>
  );
}
