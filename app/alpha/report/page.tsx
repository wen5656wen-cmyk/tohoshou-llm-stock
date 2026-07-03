"use client";

import { useEffect, useState } from "react";

// Alpha Analytics — factor effectiveness report (admin). English/technical labels only.

type FactorReport = {
  factor: string;
  sampleCount: number;
  meanFwdRet5: number | null;
  meanFwdRet10: number | null;
  meanFwdRet20: number | null;
  winRate: number | null;
  meanExcess: number | null;
  ic: number | null;
  rankIc: number | null;
  top20Ret: number | null;
  bottom20Ret: number | null;
  sharpe: number | null;
  rating: number;
  ratingLabel: string;
};

type Resp = {
  period: number;
  availablePeriods: number[];
  computedAt: string | null;
  asOfLatest: string | null;
  factors: FactorReport[];
};

const PERIODS = [7, 30, 90, 180];

function pct(v: number | null) { return v == null ? "—" : `${v.toFixed(2)}%`; }
function fx(v: number | null, d = 3) { return v == null ? "—" : v.toFixed(d); }
function stars(n: number) { return "★".repeat(n) + "☆".repeat(5 - n); }
function ratingColor(n: number) {
  return n >= 4 ? "#16a34a" : n === 3 ? "#d97706" : "#94a3b8";
}

export default function AlphaReportPage() {
  const [period, setPeriod] = useState(30);
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/alpha/report?period=${period}`)
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then((d: Resp) => { setData(d); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, [period]);

  function exportCsv() {
    if (!data) return;
    const cols = ["factor", "rating", "ratingLabel", "sampleCount", "ic", "rankIc",
      "winRate", "meanFwdRet5", "meanFwdRet10", "meanFwdRet20", "meanExcess",
      "top20Ret", "bottom20Ret", "sharpe"];
    const lines = [cols.join(",")];
    for (const f of data.factors) {
      lines.push(cols.map((c) => (f as Record<string, unknown>)[c] ?? "").join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `alpha-report-${period}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 max-w-6xl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-900">Alpha Analytics — Factor Effectiveness</h1>
        <p className="text-sm text-slate-500 mt-1">
          Phase 1.5 · IC / win-rate / forward returns / quantile spread (admin) ·{" "}
          {loading ? "loading…" : error ? `error: ${error}` :
            `period ${data?.period}d · as-of ${data?.asOfLatest ?? "—"} · computed ${data?.computedAt?.slice(0, 16).replace("T", " ") ?? "—"}`}
        </p>
      </div>

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {PERIODS.map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`text-sm px-3 py-1.5 rounded-lg font-medium border transition-colors ${
              period === p ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            {p}d
          </button>
        ))}
        <button
          onClick={exportCsv}
          disabled={!data?.factors.length}
          className="ml-auto text-sm px-4 py-1.5 rounded-lg font-medium bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40"
        >
          Export CSV
        </button>
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          Failed to load ({error}). Run <code className="font-mono">npm run compute-alpha-analytics</code> to populate.
        </div>
      ) : !loading && !data?.factors.length ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
          No report for {period}d yet. Run <code className="font-mono">npm run compute-alpha-analytics</code>.
        </div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))" }}>
          {(loading ? [] : data!.factors).map((f) => (
            <div key={f.factor} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[15px] font-bold text-slate-900">{f.factor}</span>
                <span className="text-lg tabular-nums" style={{ color: ratingColor(f.rating) }} title={f.ratingLabel}>
                  {stars(f.rating)}
                </span>
              </div>
              <div className="text-[11px] font-medium mb-3" style={{ color: ratingColor(f.rating) }}>
                {f.ratingLabel} · n={f.sampleCount.toLocaleString()}
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <Metric label="IC" val={fx(f.ic)} />
                <Metric label="Rank IC" val={fx(f.rankIc)} />
                <Metric label="Win Rate" val={pct(f.winRate)} />
                <Metric label="Mean Excess" val={pct(f.meanExcess)} />
                <Metric label="Fwd 5d" val={pct(f.meanFwdRet5)} />
                <Metric label="Fwd 10d" val={pct(f.meanFwdRet10)} />
                <Metric label="Fwd 20d" val={pct(f.meanFwdRet20)} />
                <Metric label="Sharpe" val={fx(f.sharpe, 2)} />
                <Metric label="Top 20%" val={pct(f.top20Ret)} accent="#16a34a" />
                <Metric label="Bottom 20%" val={pct(f.bottom20Ret)} accent="#dc2626" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ label, val, accent }: { label: string; val: string; accent?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-400">{label}</span>
      <span className="font-semibold tabular-nums" style={{ color: accent ?? "#334155" }}>{val}</span>
    </div>
  );
}
