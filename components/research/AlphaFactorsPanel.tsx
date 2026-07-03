"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PanelHeader, TERM_TIPS } from "./PanelHeader";

// Alpha Engine 2.0 — Phase 1 debug console (admin). Technical/English labels only;
// factor names (RS5/ATR14/…) are technical identifiers. Data layer only — this page
// never touches AI Score / recommendations.

type AlphaRow = {
  symbol: string;
  name: string;
  nameZh: string | null;
  nameEn: string | null;
  sector: string | null;
  market: string | null;
  rs5: number | null; rs20: number | null; rs60: number | null;
  atr14: number | null; atrPct: number | null;
  distanceTo52WeekHigh: number | null; distanceTo52WeekLow: number | null;
  averageTurnover20: number | null;
  volumeRatio5: number | null; volumeRatio20: number | null;
  volumeExpansionDays: number | null;
  buyback: boolean | null; dividendRaise: boolean | null;
  guidanceRaise: boolean | null; tdnetEvent: boolean | null;
};

type ApiResp = { date: string | null; computedAt: string | null; total: number; rows: AlphaRow[] };

type NumKey =
  | "rs5" | "rs20" | "rs60" | "atr14" | "atrPct"
  | "distanceTo52WeekHigh" | "distanceTo52WeekLow"
  | "averageTurnover20" | "volumeRatio5" | "volumeRatio20" | "volumeExpansionDays";

const COLS: { key: NumKey; label: string; fmt: (v: number | null) => string }[] = [
  { key: "rs5",  label: "相对强弱5日",  fmt: (v) => pct(v) },
  { key: "rs20", label: "相对强弱20日", fmt: (v) => pct(v) },
  { key: "rs60", label: "相对强弱60日", fmt: (v) => pct(v) },
  { key: "atr14", label: "ATR14", fmt: (v) => num(v) },
  { key: "atrPct", label: "波动率%", fmt: (v) => pct(v) },
  { key: "distanceTo52WeekHigh", label: "距离52周最高点", fmt: (v) => pct(v) },
  { key: "distanceTo52WeekLow",  label: "距离52周最低点", fmt: (v) => pct(v) },
  { key: "averageTurnover20", label: "20日平均成交额", fmt: (v) => turnover(v) },
  { key: "volumeRatio5",  label: "5日量比",  fmt: (v) => num(v) },
  { key: "volumeRatio20", label: "20日量比", fmt: (v) => num(v) },
  { key: "volumeExpansionDays", label: "放量天数", fmt: (v) => (v == null ? "—" : String(v)) },
];

function pct(v: number | null) { return v == null ? "—" : `${v.toFixed(2)}%`; }
function num(v: number | null) { return v == null ? "—" : v.toFixed(2); }
function turnover(v: number | null) {
  if (v == null) return "—";
  if (v >= 1e9) return `¥${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `¥${(v / 1e6).toFixed(1)}M`;
  return `¥${v.toFixed(0)}`;
}

export function AlphaFactorsPanel() {
  const [data, setData] = useState<ApiResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<NumKey>("averageTurnover20");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    setLoading(true);
    fetch("/api/alpha?limit=5000")
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then((d: ApiResp) => { setData(d); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    let r = data.rows;
    if (q.trim()) {
      const ql = q.trim().toLowerCase();
      r = r.filter((x) =>
        x.symbol.toLowerCase().includes(ql) ||
        (x.name ?? "").toLowerCase().includes(ql) ||
        (x.nameZh ?? "").includes(q.trim()) ||
        (x.nameEn ?? "").toLowerCase().includes(ql)
      );
    }
    return [...r].sort((a, b) => {
      const av = a[sortKey] ?? -Infinity;
      const bv = b[sortKey] ?? -Infinity;
      return sortDir === "desc" ? (bv as number) - (av as number) : (av as number) - (bv as number);
    });
  }, [data, q, sortKey, sortDir]);

  function toggleSort(k: NumKey) {
    if (sortKey === k) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(k); setSortDir("desc"); }
  }

  function exportCsv() {
    const header = ["symbol", "name", "sector", "market", ...COLS.map((c) => c.key),
      "buyback", "dividendRaise", "guidanceRaise", "tdnetEvent"];
    const lines = [header.join(",")];
    for (const r of rows) {
      const vals = [
        r.symbol, `"${(r.name ?? "").replace(/"/g, '""')}"`, r.sector ?? "", r.market ?? "",
        ...COLS.map((c) => r[c.key] ?? ""),
        r.buyback ?? "", r.dividendRaise ?? "", r.guidanceRaise ?? "", r.tdnetEvent ?? "",
      ];
      lines.push(vals.join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `alpha-factors-${data?.date ?? "latest"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 max-w-[1400px]">
      <PanelHeader title="Alpha因子库" desc="用于展示 Alpha 引擎计算使用的底层技术因子。" phase="P2-T1"
        dataDate={data?.date} computedAt={data?.computedAt} stockCount={rows.length}
        statusText="研究模式（不会影响正式AI推荐）" loading={loading} error={error} />

      <div className="flex gap-2 mb-4 flex-wrap">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索股票代码/名称…"
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={exportCsv}
          disabled={!rows.length}
          className="bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-sm px-4 py-2 rounded-lg font-medium"
        >
          导出CSV
        </button>
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          加载失败（{error}）。请运行 <code className="font-mono">npm run compute-alpha-factors</code> 生成数据。
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-auto" style={{ maxHeight: "calc(100vh - 220px)" }}>
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-50 z-10">
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="px-3 py-2 font-medium">股票代码</th>
                <th className="px-3 py-2 font-medium">股票名称</th>
                {COLS.map((c) => (
                  <th
                    key={c.key}
                    onClick={() => toggleSort(c.key)}
                    title={TERM_TIPS[c.label]}
                    className="px-3 py-2 font-medium text-right cursor-pointer hover:text-slate-800 whitespace-nowrap"
                  >
                    {c.label}{sortKey === c.key ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
                  </th>
                ))}
                <th className="px-3 py-2 font-medium text-center">事件</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={COLS.length + 3} className="px-3 py-10 text-center text-slate-400">加载中…</td></tr>
              ) : rows.map((r) => (
                <tr key={r.symbol} className="border-b border-slate-50 hover:bg-blue-50/30">
                  <td className="px-3 py-1.5 font-mono">
                    <Link href={`/stocks/${encodeURIComponent(r.symbol)}`} className="text-blue-600 hover:underline">{r.symbol}</Link>
                  </td>
                  <td className="px-3 py-1.5 text-slate-700 truncate max-w-[160px]">{r.nameZh ?? r.name}</td>
                  {COLS.map((c) => (
                    <td key={c.key} className="px-3 py-1.5 text-right tabular-nums text-slate-800">{c.fmt(r[c.key])}</td>
                  ))}
                  <td className="px-3 py-1.5 text-center text-slate-400">
                    {[r.buyback && "BB", r.dividendRaise && "DR", r.guidanceRaise && "GR", r.tdnetEvent && "TD"]
                      .filter(Boolean).join(" ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
