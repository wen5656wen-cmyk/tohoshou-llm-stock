"use client";

import { useEffect, useState } from "react";

// Fusion Paper Trading (P2-T4) — live 3-strategy comparison (admin). English labels.
// Read-only: official recommendation is not modified.

type Cell = { avg: number | null; win: number | null; n: number };
type Recent = { strategy: string; rank: number; symbol: string; ret1d: number | null; ret3d: number | null; ret5d: number | null; ret10d: number | null; ret20d: number | null; regime: string | null };
type Resp = {
  topN: number; entryDates: string[]; daysRunning: number; latestEntry: string | null; computedAt: string | null;
  horizons: string[]; aggregate: Record<string, Record<string, Cell>>; recent: Recent[]; note: string;
};

const STRATS = ["PRODUCTION", "ALPHA", "FUSION"];
const SLABEL: Record<string, string> = { PRODUCTION: "Production (official)", ALPHA: "AlphaScore", FUSION: "Regime Fusion" };
const SCOLOR: Record<string, string> = { PRODUCTION: "#475569", ALPHA: "#2563eb", FUSION: "#16a34a" };
const HLABEL: Record<string, string> = { ret1d: "1d", ret3d: "3d", ret5d: "5d", ret10d: "10d", ret20d: "20d" };
function pct(v: number | null) { return v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`; }
function col(v: number | null) { return v == null ? "#94a3b8" : v > 0 ? "#16a34a" : v < 0 ? "#dc2626" : "#334155"; }

export default function FusionPaperPage() {
  const [topN, setTopN] = useState(20);
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/fusion/paper?topN=${topN}`)
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then((d: Resp) => { setData(d); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, [topN]);

  function exportCsv() {
    if (!data) return;
    const header = ["strategy", ...data.horizons.map((h) => `${HLABEL[h]}_avg`), ...data.horizons.map((h) => `${HLABEL[h]}_win`)];
    const lines = [header.join(",")];
    for (const s of STRATS) {
      const row = [SLABEL[s], ...data.horizons.map((h) => data.aggregate[s]?.[h]?.avg ?? ""), ...data.horizons.map((h) => data.aggregate[s]?.[h]?.win ?? "")];
      lines.push(row.join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `fusion-paper-top${topN}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  const horizons = data?.horizons ?? ["ret1d", "ret3d", "ret5d", "ret10d", "ret20d"];

  return (
    <div className="p-6 max-w-6xl">
      <h1 className="text-2xl font-bold text-slate-900">Fusion Paper Trading</h1>
      <p className="text-sm text-slate-500 mt-1 mb-4">
        P2-T4 · Production vs AlphaScore vs Regime Fusion · <span className="text-amber-600 font-medium">forward paper trading — official recommendation unchanged</span> ·{" "}
        {loading ? "loading…" : error ? `error: ${error}` : `${data?.daysRunning} entry days · latest ${data?.latestEntry ?? "—"}`}
      </p>

      <div className="flex items-center gap-2 mb-4">
        {[10, 20].map((n) => (
          <button key={n} onClick={() => setTopN(n)} className={`text-sm px-3 py-1.5 rounded-lg font-medium border ${topN === n ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>Top{n}</button>
        ))}
        <button onClick={exportCsv} disabled={!data} className="ml-auto text-sm px-4 py-1.5 rounded-lg font-medium bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40">Export CSV</button>
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">Failed ({error}). Run <code className="font-mono">npm run fusion-paper-trade</code>.</div>
      ) : (
        <>
          {/* Avg forward return comparison */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-auto mb-4">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="px-4 py-2 font-medium">Strategy (Top{topN})</th>
                  {horizons.map((h) => <th key={h} className="px-4 py-2 font-medium text-right">{HLABEL[h]}</th>)}
                </tr>
              </thead>
              <tbody>
                {(loading ? [] : STRATS).map((s) => (
                  <tr key={s} className="border-b border-slate-50">
                    <td className="px-4 py-2 font-semibold" style={{ color: SCOLOR[s] }}>{SLABEL[s]}</td>
                    {horizons.map((h) => {
                      const c = data?.aggregate[s]?.[h];
                      return (
                        <td key={h} className="px-4 py-2 text-right">
                          <div className="tabular-nums font-semibold" style={{ color: col(c?.avg ?? null) }}>{pct(c?.avg ?? null)}</div>
                          <div className="text-[10px] text-slate-400 tabular-nums">win {c?.win == null ? "—" : `${c.win}%`} · n{c?.n ?? 0}</div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Latest picks */}
          {data?.recent?.length ? (
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
              {STRATS.map((s) => (
                <div key={s} className="bg-white rounded-xl border border-slate-200 p-3">
                  <div className="text-sm font-semibold mb-2" style={{ color: SCOLOR[s] }}>{SLABEL[s]} · {data.latestEntry}</div>
                  <div className="flex flex-wrap gap-1">
                    {data.recent.filter((r) => r.strategy === s).sort((a, b) => a.rank - b.rank).slice(0, topN).map((r) => (
                      <span key={r.symbol} className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600" title={`rank ${r.rank}`}>{r.symbol.replace(".T", "")}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}
      {data?.note ? <p className="text-[11px] text-slate-400 mt-4">{data.note}</p> : null}
    </div>
  );
}
