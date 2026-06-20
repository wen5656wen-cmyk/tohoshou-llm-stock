"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type StockIndicator = {
  symbol: string; name: string; nameZh: string | null; sector: string | null;
  latestDate: string; latestClose: number;
  ma5: number | null; ma20: number | null; ma60: number | null;
  rsi14: number | null; macd: number | null; macdSignal: number | null; macdHist: number | null;
  return5d: number | null; return20d: number | null; return60d: number | null;
  maTrend: string; rsiSignal: string;
  macdSignalLabel: "BUY" | "NEUTRAL" | "SELL";
  finCount: number;
};

type SortKey = "return5d" | "return20d" | "return60d" | "rsi14" | "latestClose";

function ReturnCell({ val }: { val: number | null }) {
  if (val === null) return <span className="text-slate-300 text-xs">—</span>;
  const up = val >= 0;
  return (
    <span className={`tabular-nums text-sm font-semibold ${up ? "text-[#e74c3c]" : "text-[#2980b9]"}`}>
      {up ? "▲" : "▼"}{Math.abs(val).toFixed(2)}%
    </span>
  );
}

function MaTrend({ trend }: { trend: string }) {
  const cfg: Record<string, { label: string; cls: string; icon: string }> = {
    GOLDEN:  { label: "多头趋势", cls: "bg-amber-100 text-amber-700", icon: "✦" },
    BULLISH: { label: "偏强",     cls: "bg-green-100 text-green-700", icon: "▲" },
    NEUTRAL: { label: "中性",     cls: "bg-slate-100 text-slate-500", icon: "—" },
    BEARISH: { label: "偏弱",     cls: "bg-blue-100 text-blue-600",   icon: "▼" },
    DEAD:    { label: "空头趋势", cls: "bg-red-100 text-red-600",     icon: "✕" },
  };
  const c = cfg[trend] ?? cfg.NEUTRAL;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded font-medium ${c.cls}`}>
      <span>{c.icon}</span>{c.label}
    </span>
  );
}

function RsiBar({ val }: { val: number | null }) {
  if (val === null) return <span className="text-slate-300 text-xs">—</span>;
  const color = val >= 70 ? "bg-red-400" : val >= 55 ? "bg-orange-300" : val <= 30 ? "bg-blue-400" : val <= 45 ? "bg-blue-300" : "bg-slate-300";
  const label = val >= 70 ? "超买" : val <= 30 ? "超卖" : "";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 bg-slate-100 rounded-full h-2 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${val}%` }} />
      </div>
      <span className="tabular-nums text-xs text-slate-700 w-8">{val.toFixed(0)}</span>
      {label && <span className={`text-xs font-medium ${val >= 70 ? "text-red-500" : "text-blue-500"}`}>{label}</span>}
    </div>
  );
}

function MacdBadge({ sig, hist }: { sig: string; hist: number | null }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    BUY:     { label: "买入", cls: "bg-red-100 text-red-600 border border-red-200" },
    NEUTRAL: { label: "中性", cls: "bg-slate-100 text-slate-400" },
    SELL:    { label: "卖出", cls: "bg-blue-100 text-blue-600 border border-blue-200" },
  };
  const c = cfg[sig] ?? cfg.NEUTRAL;
  return (
    <div className="flex items-center gap-1.5">
      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${c.cls}`}>{c.label}</span>
      {hist !== null && (
        <span className={`text-xs tabular-nums ${hist >= 0 ? "text-[#e74c3c]" : "text-[#2980b9]"}`}>
          {hist >= 0 ? "+" : ""}{hist.toFixed(2)}
        </span>
      )}
    </div>
  );
}

export default function IndicatorsPage() {
  const [data, setData] = useState<StockIndicator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("return20d");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [activeView, setActiveView] = useState<"ranking" | "heatmap">("ranking");

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch("/api/indicators")
      .then((r) => {
        if (!r.ok) throw new Error(`API错误 ${r.status}`);
        return r.json();
      })
      .then((d: StockIndicator[]) => { setData(Array.isArray(d) ? d : []); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, []);

  const sorted = [...data].sort((a, b) => {
    const av = a[sort] ?? -Infinity;
    const bv = b[sort] ?? -Infinity;
    return order === "desc" ? (bv as number) - (av as number) : (av as number) - (bv as number);
  });

  const toggleSort = (col: SortKey) => {
    if (sort === col) setOrder(order === "desc" ? "asc" : "desc");
    else { setSort(col); setOrder("desc"); }
  };

  const SortIcon = ({ col }: { col: SortKey }) =>
    sort === col ? (
      <span className="text-blue-500">{order === "desc" ? " ↓" : " ↑"}</span>
    ) : (
      <span className="text-slate-300"> ↕</span>
    );

  const buyCount    = data.filter((d) => d.macdSignalLabel === "BUY").length;
  const sellCount   = data.filter((d) => d.macdSignalLabel === "SELL").length;
  const goldenCount = data.filter((d) => d.maTrend === "GOLDEN" || d.maTrend === "BULLISH").length;
  const overbought  = data.filter((d) => (d.rsi14 ?? 50) >= 70).length;
  const oversold    = data.filter((d) => (d.rsi14 ?? 50) <= 30).length;

  return (
    <div className="p-6 max-w-7xl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">技术指标排行</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {loading ? "加载中..." : error ? <span className="text-red-500">加载失败：{error}</span> : `StockScore TOP ${data.length}只 · RSI(14)・MACD`}
        </p>
      </div>

      {!loading && (
        <div className="grid grid-cols-5 gap-3 mb-6">
          {[
            { label: "MACD 买入",    value: buyCount,    total: data.length, color: "text-red-600",    bg: "bg-red-50 border-red-200" },
            { label: "MACD 卖出",    value: sellCount,   total: data.length, color: "text-blue-600",   bg: "bg-blue-50 border-blue-200" },
            { label: "上涨趋势",     value: goldenCount, total: data.length, color: "text-green-600",  bg: "bg-green-50 border-green-200" },
            { label: "RSI超买(≥70)", value: overbought,  total: data.length, color: "text-orange-600", bg: "bg-orange-50 border-orange-200" },
            { label: "RSI超卖(≤30)", value: oversold,    total: data.length, color: "text-indigo-600", bg: "bg-indigo-50 border-indigo-200" },
          ].map((s) => (
            <div key={s.label} className={`rounded-xl border shadow-sm p-4 ${s.bg}`}>
              <div className="text-xs text-slate-500 mb-1">{s.label}</div>
              <div className={`text-2xl font-bold ${s.color}`}>
                {s.value}
                <span className="text-sm font-normal text-slate-400 ml-1">/ {s.total}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 mb-4">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {(["ranking", "heatmap"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setActiveView(v)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                activeView === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {v === "ranking" ? "排行榜" : "热力图"}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-400">基准日：{data[0]?.latestDate ?? "—"}</span>
      </div>

      {/* Ranking Table */}
      {activeView === "ranking" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-100 bg-slate-50">
                  <th className="px-5 py-3 font-medium">股票</th>
                  <th className="px-3 py-3 font-medium text-right cursor-pointer hover:text-slate-700" onClick={() => toggleSort("latestClose")}>
                    最新股价<SortIcon col="latestClose" />
                  </th>
                  <th className="px-3 py-3 font-medium text-right cursor-pointer hover:text-slate-700" onClick={() => toggleSort("return5d")}>
                    5日<SortIcon col="return5d" />
                  </th>
                  <th className="px-3 py-3 font-medium text-right cursor-pointer hover:text-slate-700" onClick={() => toggleSort("return20d")}>
                    20日<SortIcon col="return20d" />
                  </th>
                  <th className="px-3 py-3 font-medium text-right cursor-pointer hover:text-slate-700" onClick={() => toggleSort("return60d")}>
                    60日<SortIcon col="return60d" />
                  </th>
                  <th className="px-3 py-3 font-medium">均线趋势</th>
                  <th className="px-3 py-3 font-medium cursor-pointer hover:text-slate-700" onClick={() => toggleSort("rsi14")}>
                    RSI(14)<SortIcon col="rsi14" />
                  </th>
                  <th className="px-3 py-3 font-medium">MACD</th>
                  <th className="px-3 py-3 font-medium text-right">财务条数</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-5 py-12 text-center text-slate-400 text-sm animate-pulse">
                      加载中...
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={9} className="px-5 py-12 text-center text-red-500 text-sm">
                      数据加载失败：{error}
                    </td>
                  </tr>
                ) : sorted.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-5 py-12 text-center text-slate-400 text-sm">
                      暂无指标数据，请先运行评分计算
                    </td>
                  </tr>
                ) : sorted.map((s, idx) => (
                  <tr key={s.symbol} className="hover:bg-blue-50/30 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-300 w-4 tabular-nums">{idx + 1}</span>
                        <Link href={`/stocks/${encodeURIComponent(s.symbol)}`} className="block group">
                          <div className="text-[15px] font-bold text-slate-900 group-hover:text-blue-600 leading-tight">
                            {s.nameZh || s.name}
                          </div>
                          {s.nameZh && s.nameZh !== s.name && (
                            <div className="text-[12px] text-[#94a3b8] truncate mt-0.5">{s.name}</div>
                          )}
                          <div className="text-[12px] text-[#64748b] font-mono mt-0.5">{s.symbol}</div>
                        </Link>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums font-medium text-sm text-slate-900">
                      ¥{s.latestClose.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-right"><ReturnCell val={s.return5d} /></td>
                    <td className="px-3 py-3 text-right"><ReturnCell val={s.return20d} /></td>
                    <td className="px-3 py-3 text-right"><ReturnCell val={s.return60d} /></td>
                    <td className="px-3 py-3"><MaTrend trend={s.maTrend} /></td>
                    <td className="px-3 py-3"><RsiBar val={s.rsi14} /></td>
                    <td className="px-3 py-3"><MacdBadge sig={s.macdSignalLabel} hist={s.macdHist} /></td>
                    <td className="px-3 py-3 text-right text-xs text-slate-500">{s.finCount}条</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Heatmap view */}
      {activeView === "heatmap" && !loading && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">20日涨跌热力图</h3>
            <div className="grid grid-cols-5 gap-3">
              {[...data].sort((a, b) => (b.return20d ?? 0) - (a.return20d ?? 0)).map((s) => {
                const v = s.return20d ?? 0;
                const intensity = Math.min(1, Math.abs(v) / 10);
                const bg = v >= 0
                  ? `rgba(231, 76, 60, ${0.08 + intensity * 0.4})`
                  : `rgba(41, 128, 185, ${0.08 + intensity * 0.4})`;
                const textColor = v >= 0 ? "#c0392b" : "#1a6090";
                return (
                  <Link key={s.symbol} href={`/stocks/${encodeURIComponent(s.symbol)}`}
                    className="rounded-xl p-4 hover:opacity-90 transition-opacity" style={{ backgroundColor: bg }}>
                    <div className="text-xs font-mono text-slate-500 mb-1">{s.symbol}</div>
                    <div className="text-sm font-semibold text-slate-800 truncate mb-2">{s.nameZh || s.name}</div>
                    <div className="text-xl font-bold tabular-nums" style={{ color: textColor }}>
                      {v >= 0 ? "▲" : "▼"}{Math.abs(v).toFixed(2)}%
                    </div>
                    <div className="text-xs text-slate-500 mt-1">20日</div>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">RSI(14) 热力图</h3>
            <div className="grid grid-cols-5 gap-3">
              {[...data].sort((a, b) => (b.rsi14 ?? 50) - (a.rsi14 ?? 50)).map((s) => {
                const v = s.rsi14 ?? 50;
                const excess  = v >= 50 ? (v - 50) / 50 : 0;
                const deficit = v <  50 ? (50 - v) / 50 : 0;
                const bg = v >= 50
                  ? `rgba(231, 76, 60, ${0.05 + excess * 0.4})`
                  : `rgba(41, 128, 185, ${0.05 + deficit * 0.4})`;
                const textColor = v >= 70 ? "#c0392b" : v <= 30 ? "#1a6090" : "#475569";
                return (
                  <Link key={s.symbol} href={`/stocks/${encodeURIComponent(s.symbol)}`}
                    className="rounded-xl p-4 hover:opacity-90 transition-opacity" style={{ backgroundColor: bg }}>
                    <div className="text-xs font-mono text-slate-500 mb-1">{s.symbol}</div>
                    <div className="text-sm font-semibold text-slate-800 truncate mb-2">{s.nameZh || s.name}</div>
                    <div className="text-xl font-bold tabular-nums" style={{ color: textColor }}>{v.toFixed(1)}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      {v >= 70 ? "超买" : v <= 30 ? "超卖" : "中性"}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">均线趋势一览</h3>
            <div className="grid grid-cols-5 gap-3">
              {data.map((s) => {
                const trendCfg: Record<string, string> = {
                  GOLDEN:  "bg-amber-50 border-amber-200",
                  BULLISH: "bg-green-50 border-green-200",
                  NEUTRAL: "bg-slate-50 border-slate-200",
                  BEARISH: "bg-blue-50 border-blue-200",
                  DEAD:    "bg-red-50 border-red-200",
                };
                const cls = trendCfg[s.maTrend] ?? trendCfg.NEUTRAL;
                return (
                  <Link key={s.symbol} href={`/stocks/${encodeURIComponent(s.symbol)}`}
                    className={`rounded-xl border p-4 hover:opacity-90 transition-opacity ${cls}`}>
                    <div className="text-xs font-mono text-slate-500 mb-1">{s.symbol}</div>
                    <div className="text-sm font-semibold text-slate-800 truncate mb-2">{s.nameZh || s.name}</div>
                    <div className="text-xs space-y-1">
                      {[["MA5", s.ma5], ["MA20", s.ma20], ["MA60", s.ma60]].map(([k, v]) => (
                        <div key={k as string} className="flex justify-between">
                          <span className="text-slate-500">{k}</span>
                          <span className="tabular-nums text-slate-700">{v ? `¥${(v as number).toLocaleString()}` : "—"}</span>
                        </div>
                      ))}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
