"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type Score = {
  symbol: string; name: string; nameZh: string | null; market: string | null;
  sector: string | null; industry: string | null; scaleCategory: string | null;
  latestDate: string | null; latestClose: number | null; priceCount: number;
  return5d: number | null; return20d: number | null; return60d: number | null;
  rsi14: number | null; macd: number | null; macdHist: number | null;
  maTrend: string | null; macdSignalLabel: string | null;
  technicalScore: number | null; fundamentalScore: number | null;
  riskScore: number | null; totalScore: number | null;
  recommendation: string | null; starsLabel: string | null;
  summaryReason: string | null;
};

type Stats = {
  totalStocks: number; scoredStocks: number;
  buyRecommended: number; watchCount: number;
  lastComputedAt: string | null;
  byMarket: { prime: number; standard: number; growth: number };
};

type ApiResponse = { stats: Stats; scores: Score[] };

const REC_CFG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  STRONG_BUY: { label: "强烈买入", bg: "bg-red-50",    text: "text-red-700",    dot: "bg-red-500" },
  BUY:        { label: "买入",     bg: "bg-orange-50", text: "text-orange-700", dot: "bg-orange-400" },
  WATCH:      { label: "关注",     bg: "bg-yellow-50", text: "text-yellow-700", dot: "bg-yellow-400" },
  HOLD:       { label: "持有",     bg: "bg-slate-50",  text: "text-slate-500",  dot: "bg-slate-300" },
  AVOID:      { label: "回避",     bg: "bg-blue-50",   text: "text-blue-500",   dot: "bg-blue-300" },
};

function RetBadge({ val, label }: { val: number | null; label?: string }) {
  if (val === null) return <span className="text-slate-300 text-xs">—</span>;
  const up = val >= 0;
  return (
    <span className={`text-xs font-medium tabular-nums ${up ? "text-[#e74c3c]" : "text-[#2980b9]"}`}>
      {label && <span className="text-slate-400 mr-0.5">{label}</span>}
      {up ? "▲" : "▼"}{Math.abs(val).toFixed(1)}%
    </span>
  );
}

function MktChip({ mkt }: { mkt: string | null }) {
  if (!mkt) return null;
  const label = mkt.includes("プライム") ? "P" : mkt.includes("スタンダード") ? "S" : mkt.includes("グロース") ? "G" : "?";
  const cls = label === "P" ? "bg-violet-100 text-violet-700"
    : label === "S" ? "bg-blue-100 text-blue-700"
    : "bg-emerald-100 text-emerald-700";
  return <span className={`text-[10px] font-bold px-1 py-0.5 rounded ${cls}`}>{label}</span>;
}

type SortKey = "totalScore" | "technicalScore" | "fundamentalScore" | "riskScore" | "return20d" | "return60d" | "rsi14";

export default function ScreenerPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recFilter, setRecFilter] = useState("ALL");
  const [mktFilter, setMktFilter] = useState("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("totalScore");
  const [search, setSearch] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/screener?limit=200")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="p-6 flex flex-col items-center justify-center h-64 gap-3">
        <div className="text-slate-400 text-sm animate-pulse">筛选器加载中...</div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-red-700 text-sm">{error}</div>
      </div>
    );
  }

  const { stats, scores } = data;

  let filtered = scores.filter((s) => {
    if (recFilter !== "ALL" && s.recommendation !== recFilter) return false;
    if (mktFilter === "Prime"    && !s.market?.includes("プライム")) return false;
    if (mktFilter === "Standard" && !s.market?.includes("スタンダード")) return false;
    if (mktFilter === "Growth"   && !s.market?.includes("グロース")) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!s.name?.toLowerCase().includes(q) && !(s.nameZh ?? "").includes(q) && !s.symbol?.toLowerCase().includes(q) && !s.sector?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  filtered = [...filtered].sort((a, b) => {
    const av = (a[sortKey] ?? -999) as number;
    const bv = (b[sortKey] ?? -999) as number;
    return bv - av;
  });

  const buyCount   = filtered.filter((s) => s.recommendation === "STRONG_BUY" || s.recommendation === "BUY").length;
  const watchCount = filtered.filter((s) => s.recommendation === "WATCH").length;
  const noScores = stats.scoredStocks === 0;

  return (
    <div className="p-6 max-w-[1400px]">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">全市场筛选</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          J-Quants 全市场上市股票　技術/30 + 基本面/25 + 資金面/20 + 情绪/15 + 全球/10
          {stats.lastComputedAt &&
            `　最近评分时间：${new Date(stats.lastComputedAt).toLocaleString("zh-CN")}`
          }
        </p>
      </div>

      <div className="grid grid-cols-6 gap-3 mb-5">
        {[
          { label: "数据库股票",   value: stats.totalStocks.toLocaleString(),  cls: "text-slate-900" },
          { label: "已计算评分",   value: stats.scoredStocks.toLocaleString(), cls: "text-blue-700" },
          { label: "Prime",        value: stats.byMarket.prime.toLocaleString(),    cls: "text-violet-700" },
          { label: "Standard",     value: stats.byMarket.standard.toLocaleString(), cls: "text-blue-600" },
          { label: "Growth",       value: stats.byMarket.growth.toLocaleString(),   cls: "text-emerald-600" },
          { label: "买入推荐",     value: stats.buyRecommended.toLocaleString(),    cls: "text-red-600" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="text-[10px] text-slate-400 mb-1">{s.label}</div>
            <div className={`text-2xl font-bold tabular-nums ${s.cls}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {noScores && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-5 text-sm text-amber-700">
          <strong>暂无评分数据</strong>，请按以下步骤生成：<br />
          <code className="bg-amber-100 px-1 rounded text-xs mt-1 inline-block">
            npm run sync-meta &amp;&amp; npm run sync-prices-recent --limit=100 &amp;&amp; npm run compute-scores
          </code>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {["ALL", "STRONG_BUY", "BUY", "WATCH", "HOLD", "AVOID"].map((r) => {
            const cfg = REC_CFG[r];
            return (
              <button
                key={r}
                onClick={() => setRecFilter(r)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  recFilter === r ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {r === "ALL" ? `全部(${scores.length})` : `${cfg?.label ?? r}(${scores.filter((s) => s.recommendation === r).length})`}
              </button>
            );
          })}
        </div>

        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {[
            { k: "ALL", label: "全市场" },
            { k: "Prime", label: "Prime" },
            { k: "Standard", label: "Standard" },
            { k: "Growth", label: "Growth" },
          ].map(({ k, label }) => (
            <button
              key={k}
              onClick={() => setMktFilter(k)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                mktFilter === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="名称・代码・行业搜索..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:border-blue-400 w-52"
        />

        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 focus:outline-none"
        >
          <option value="totalScore">AI综合评分</option>
          <option value="technicalScore">技术指标</option>
          <option value="fundamentalScore">基本面</option>
          <option value="riskScore">資金面</option>
          <option value="return20d">20日涨跌</option>
          <option value="return60d">60日涨跌</option>
          <option value="rsi14">RSI</option>
        </select>

        <span className="text-xs text-slate-400 ml-auto">
          显示: {filtered.length}只（买入 {buyCount} 关注 {watchCount}）
        </span>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-left text-xs text-slate-400">
                <th className="px-4 py-2.5 font-medium w-8 text-right">#</th>
                <th className="px-3 py-2.5 font-medium">股票</th>
                <th className="px-2 py-2.5 font-medium">市场</th>
                <th className="px-2 py-2.5 font-medium">行业</th>
                <th className="px-3 py-2.5 font-medium text-right">最新股价</th>
                <th className="px-2 py-2.5 font-medium text-right">20日</th>
                <th className="px-2 py-2.5 font-medium text-right">60日</th>
                <th className="px-2 py-2.5 font-medium text-right">RSI</th>
                <th className="px-2 py-2.5 font-medium text-center">MACD</th>
                <th className="px-2 py-2.5 font-medium text-center">均线</th>
                <th className="px-2 py-2.5 font-medium text-right">技术</th>
                <th className="px-2 py-2.5 font-medium text-right">基本面</th>
                <th className="px-2 py-2.5 font-medium text-right">安全</th>
                <th className="px-3 py-2.5 font-medium text-right">AI综合</th>
                <th className="px-2 py-2.5 font-medium text-center">推荐</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.slice(0, 200).map((s, idx) => {
                const rec = REC_CFG[s.recommendation ?? "HOLD"] ?? REC_CFG.HOLD;
                const rsiColor =
                  s.rsi14 === null ? "text-slate-400"
                  : s.rsi14 >= 70 ? "text-red-500"
                  : s.rsi14 <= 30 ? "text-blue-500"
                  : "text-slate-700";
                const maTrendLabel: Record<string, string> = {
                  GOLDEN:"多头趋势", BULLISH:"偏强", NEUTRAL:"中性", BEARISH:"偏弱", DEAD:"空头趋势"
                };
                const maTrendColor: Record<string, string> = {
                  GOLDEN:"text-amber-600 font-semibold", BULLISH:"text-green-600",
                  NEUTRAL:"text-slate-400", BEARISH:"text-blue-600", DEAD:"text-red-500 font-semibold"
                };
                const macdLabel = s.macdSignalLabel === "BUY" ? "买入↑" : s.macdSignalLabel === "SELL" ? "卖出↓" : "—";
                const macdColor = s.macdSignalLabel === "BUY" ? "text-red-500" : s.macdSignalLabel === "SELL" ? "text-blue-500" : "text-slate-400";

                return (
                  <tr key={s.symbol} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-2 text-right text-xs text-slate-300 tabular-nums">{idx + 1}</td>
                    <td className="px-3 py-2">
                      <Link href={`/stocks/${encodeURIComponent(s.symbol)}`} className="block group">
                        <div className="text-[15px] font-bold text-slate-900 group-hover:text-blue-600 leading-tight">
                          {s.nameZh || s.name}
                        </div>
                        {s.nameZh && s.nameZh !== s.name && (
                          <div className="text-[12px] text-[#94a3b8] truncate mt-0.5">{s.name}</div>
                        )}
                        <div className="text-[12px] text-[#64748b] font-mono mt-0.5">{s.symbol}</div>
                      </Link>
                    </td>
                    <td className="px-2 py-2"><MktChip mkt={s.market} /></td>
                    <td className="px-2 py-2 text-xs text-slate-500 max-w-[80px] truncate">{s.sector ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-900 text-sm">
                      {s.latestClose ? `¥${s.latestClose.toLocaleString()}` : "—"}
                    </td>
                    <td className="px-2 py-2 text-right"><RetBadge val={s.return20d} /></td>
                    <td className="px-2 py-2 text-right"><RetBadge val={s.return60d} /></td>
                    <td className={`px-2 py-2 text-right tabular-nums text-xs ${rsiColor}`}>
                      {s.rsi14 !== null ? s.rsi14.toFixed(1) : "—"}
                    </td>
                    <td className={`px-2 py-2 text-center text-xs font-medium ${macdColor}`}>
                      {macdLabel}
                    </td>
                    <td className={`px-2 py-2 text-center text-xs ${maTrendColor[s.maTrend ?? ""] ?? "text-slate-400"}`}>
                      {maTrendLabel[s.maTrend ?? ""] ?? "—"}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-xs text-blue-600 font-medium">
                      {s.technicalScore ?? "—"}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-xs text-emerald-600 font-medium">
                      {s.fundamentalScore ?? "—"}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-xs text-violet-600 font-medium">
                      {s.riskScore ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className={`text-sm font-bold tabular-nums ${rec.text}`}>
                        {s.totalScore ?? "—"}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${rec.bg} ${rec.text}`}>
                        {rec.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="py-12 text-center text-slate-400 text-sm">
            {noScores ? "请先计算评分（npm run compute-scores）" : "没有符合条件的股票"}
          </div>
        )}
      </div>

      <div className="mt-3 text-xs text-slate-400 text-center">
        最多显示200条，请通过筛选条件缩小范围。
        更新数据：<code className="bg-slate-100 px-1 rounded ml-1">npm run compute-scores</code>
      </div>
    </div>
  );
}
