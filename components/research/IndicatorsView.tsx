"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { getTradingActionLabel } from "@/lib/trading-action";

type StockIndicator = {
  symbol: string; name: string; nameZh: string | null; sector: string | null;
  latestDate: string; latestClose: number;
  ma5: number | null; ma20: number | null; ma60: number | null;
  rsi14: number | null; macd: number | null; macdSignal: number | null; macdHist: number | null;
  return5d: number | null; return20d: number | null; return60d: number | null;
  maTrend: string; rsiSignal: string;
  macdSignalLabel: "BUY" | "NEUTRAL" | "SELL";
  tradingAction: string | null;
  positionSizePct: number | null;
  actionRiskLevel: string | null;
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

import type { MessageKey } from "@/lib/i18n/types";
type TFn = (key: MessageKey) => string;

function MaTrend({ trend, t }: { trend: string; t: TFn }) {
  const cfg: Record<string, { labelKey: string; cls: string; icon: string }> = {
    GOLDEN:  { labelKey: "macd.bullish", cls: "bg-amber-100 text-amber-700", icon: "✦" },
    BULLISH: { labelKey: "macd.bullish", cls: "bg-green-100 text-green-700", icon: "▲" },
    NEUTRAL: { labelKey: "macd.neutral", cls: "bg-slate-100 text-slate-500", icon: "—" },
    BEARISH: { labelKey: "macd.bearish", cls: "bg-blue-100 text-blue-600",   icon: "▼" },
    DEAD:    { labelKey: "macd.bearish", cls: "bg-red-100 text-red-600",     icon: "✕" },
  };
  const c = cfg[trend] ?? cfg.NEUTRAL;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded font-medium ${c.cls}`}>
      <span>{c.icon}</span>{t(c.labelKey as MessageKey)}
    </span>
  );
}

// ── RSI 5-level display ───────────────────────────────────────────────────
function rsiLevel(val: number): { labelKey: string; color: string; barColor: string } {
  if (val >= 90) return { labelKey: "rsi.extreme_overbought", color: "text-red-600",    barColor: "bg-red-500" };
  if (val >= 80) return { labelKey: "rsi.overbought",         color: "text-orange-600", barColor: "bg-orange-400" };
  if (val >= 70) return { labelKey: "rsi.hot",                color: "text-yellow-600", barColor: "bg-yellow-400" };
  if (val <= 30) return { labelKey: "rsi.oversold",           color: "text-blue-600",   barColor: "bg-blue-400" };
  return           { labelKey: "rsi.normal",               color: "text-green-600",  barColor: "bg-slate-300" };
}

function RsiBar({ val, t }: { val: number | null; t: TFn }) {
  if (val === null) return <span className="text-slate-300 text-xs">—</span>;
  const { labelKey, color, barColor } = rsiLevel(val);
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 bg-slate-100 rounded-full h-2 overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(100, val)}%` }} />
      </div>
      <span className="tabular-nums text-xs text-slate-700 w-7">{val.toFixed(0)}</span>
      <span className={`text-xs font-semibold ${color}`}>{t(labelKey as MessageKey)}</span>
    </div>
  );
}

// ── MACD → trend signal (bullish/bearish/neutral) ──────────────────────────
function MacdTrendBadge({ sig, hist, t }: { sig: string; hist: number | null; t: TFn }) {
  const cfg: Record<string, { labelKey: string; cls: string }> = {
    BUY:     { labelKey: "macd.bullish", cls: "bg-emerald-100 text-emerald-700 border border-emerald-200" },
    NEUTRAL: { labelKey: "macd.neutral", cls: "bg-slate-100 text-slate-400 border border-slate-200" },
    SELL:    { labelKey: "macd.bearish", cls: "bg-red-100 text-red-600 border border-red-200" },
  };
  const c = cfg[sig] ?? cfg.NEUTRAL;
  return (
    <div className="flex items-center gap-1.5">
      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${c.cls}`}>{t(c.labelKey as MessageKey)}</span>
      {hist !== null && (
        <span className={`text-xs tabular-nums ${hist >= 0 ? "text-emerald-600" : "text-red-500"}`}>
          {hist >= 0 ? "+" : ""}{hist.toFixed(2)}
        </span>
      )}
    </div>
  );
}

// ── AI Action badge ────────────────────────────────────────────────────────
const ACTION_COLOR: Record<string, string> = {
  BUY_NOW:       "bg-emerald-100 text-emerald-700 border-emerald-200",
  WAIT_PULLBACK: "bg-amber-100 text-amber-700 border-amber-200",
  HOLD:          "bg-slate-100 text-slate-600 border-slate-200",
  TAKE_PROFIT:   "bg-orange-100 text-orange-700 border-orange-200",
  SELL:          "bg-red-100 text-red-600 border-red-200",
  AVOID:         "bg-slate-100 text-slate-400 border-slate-200",
};

function AiActionBadge({ action, pct, lang }: { action: string | null; pct: number | null; lang: string }) {
  if (!action) return <span className="text-slate-300 text-xs">—</span>;
  const cls = ACTION_COLOR[action] ?? ACTION_COLOR.HOLD;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border font-semibold ${cls}`}>
      {getTradingActionLabel(action, lang as "zh-CN" | "ja-JP" | "en-US")}
      {pct != null && pct > 0 && (
        <span className="font-normal opacity-60">{pct}%</span>
      )}
    </span>
  );
}

export default function IndicatorsPage() {
  const { lang, t } = useI18n();
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

  // Stats
  const macdBullCount  = data.filter((d) => d.macdSignalLabel === "BUY").length;
  const macdBearCount  = data.filter((d) => d.macdSignalLabel === "SELL").length;
  const goldenCount    = data.filter((d) => d.maTrend === "GOLDEN" || d.maTrend === "BULLISH").length;
  const extremeOB      = data.filter((d) => (d.rsi14 ?? 50) >= 90).length;
  const overbought     = data.filter((d) => (d.rsi14 ?? 50) >= 70 && (d.rsi14 ?? 50) < 90).length;
  const oversold       = data.filter((d) => (d.rsi14 ?? 50) <= 30).length;
  const buyNowCount    = data.filter((d) => d.tradingAction === "BUY_NOW").length;

  return (
    <div className="p-6 max-w-7xl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">{t("ind.title")}</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {loading ? t("common.loading") : error
            ? <span className="text-red-500">{t("common.load_error")}: {error}</span>
            : `StockScore TOP ${data.length} · RSI(14) · MACD · ${t("ind.col_ai_action")}`
          }
        </p>
      </div>

      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 mb-6">
          {[
            { label: t("ind.macd_bullish_count"), value: macdBullCount,  total: data.length, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" },
            { label: t("ind.macd_bearish_count"), value: macdBearCount,  total: data.length, color: "text-red-600",     bg: "bg-red-50 border-red-200" },
            { label: t("ind.ma_up"),              value: goldenCount,    total: data.length, color: "text-green-600",   bg: "bg-green-50 border-green-200" },
            { label: t("ind.extreme_overbought"), value: extremeOB,      total: data.length, color: "text-red-700",     bg: "bg-red-50 border-red-300" },
            { label: t("ind.overbought_range"),   value: overbought,     total: data.length, color: "text-orange-600",  bg: "bg-orange-50 border-orange-200" },
            { label: t("ind.oversold"),           value: oversold,       total: data.length, color: "text-indigo-600",  bg: "bg-indigo-50 border-indigo-200" },
            { label: t("ind.ai_buy_now"),         value: buyNowCount,    total: data.length, color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-300" },
          ].map((s) => (
            <div key={s.label} className={`rounded-xl border shadow-sm p-3 ${s.bg}`}>
              <div className="text-xs text-slate-500 mb-1 leading-tight">{s.label}</div>
              <div className={`text-xl font-bold ${s.color}`}>
                {s.value}
                <span className="text-xs font-normal text-slate-400 ml-1">/ {s.total}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* RSI explanation banner */}
      {!loading && (
        <div className="flex items-center gap-3 flex-wrap mb-4 text-xs text-slate-500 bg-slate-50 rounded-xl px-4 py-2 border border-slate-200">
          <span className="font-medium text-slate-600">{t("ind.rsi_legend")}：</span>
          <span className="text-blue-600 font-semibold">{t("rsi.oversold")} ≤30</span>
          <span className="text-slate-300">|</span>
          <span className="text-green-600 font-semibold">{t("rsi.normal")} 30-70</span>
          <span className="text-slate-300">|</span>
          <span className="text-yellow-600 font-semibold">{t("rsi.hot")} 70-80</span>
          <span className="text-slate-300">|</span>
          <span className="text-orange-600 font-semibold">{t("rsi.overbought")} 80-90</span>
          <span className="text-slate-300">|</span>
          <span className="text-red-600 font-semibold">{t("rsi.extreme_overbought")} ≥90</span>
          <span className="ml-3 text-slate-400">· {t("ind.macd_note")}</span>
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
              {v === "ranking" ? t("ind.ranking") : t("ind.heatmap")}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-400">{t("ind.base_date")}：{data[0]?.latestDate ?? "—"}</span>
      </div>

      {/* Ranking Table */}
      {activeView === "ranking" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-100 bg-slate-50">
                  <th className="px-5 py-3 font-medium">{t("screener.col_stock")}</th>
                  <th className="px-3 py-3 font-medium text-right cursor-pointer hover:text-slate-700" onClick={() => toggleSort("latestClose")}>
                    {t("screener.col_price")}<SortIcon col="latestClose" />
                  </th>
                  <th className="px-3 py-3 font-medium text-right cursor-pointer hover:text-slate-700" onClick={() => toggleSort("return5d")}>
                    {t("stock.5d_return")}<SortIcon col="return5d" />
                  </th>
                  <th className="px-3 py-3 font-medium text-right cursor-pointer hover:text-slate-700" onClick={() => toggleSort("return20d")}>
                    {t("screener.col_20d")}<SortIcon col="return20d" />
                  </th>
                  <th className="px-3 py-3 font-medium text-right cursor-pointer hover:text-slate-700" onClick={() => toggleSort("return60d")}>
                    {t("stock.60d_return")}<SortIcon col="return60d" />
                  </th>
                  <th className="px-3 py-3 font-medium">{t("ind.col_ma_trend")}</th>
                  <th className="px-3 py-3 font-medium cursor-pointer hover:text-slate-700" onClick={() => toggleSort("rsi14")}>
                    {t("ind.col_rsi")}<SortIcon col="rsi14" />
                  </th>
                  <th className="px-3 py-3 font-medium">
                    <span className="text-slate-600">{t("ind.col_trend_signal")}</span>
                    <span className="block text-[10px] text-slate-400 font-normal">MACD</span>
                  </th>
                  <th className="px-3 py-3 font-medium">
                    <span className="text-slate-600">{t("ind.col_ai_action")}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-5 py-12 text-center text-slate-400 text-sm animate-pulse">
                      {t("common.loading")}
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={9} className="px-5 py-12 text-center text-red-500 text-sm">
                      {t("common.load_error")}: {error}
                    </td>
                  </tr>
                ) : sorted.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-5 py-12 text-center text-slate-400 text-sm">
                      {t("common.no_data")}
                    </td>
                  </tr>
                ) : sorted.map((s, idx) => (
                  <tr key={s.symbol} className={`hover:bg-blue-50/30 transition-colors ${
                    s.rsi14 != null && s.rsi14 >= 90 ? "bg-red-50/20" : ""
                  }`}>
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
                    <td className="px-3 py-3"><MaTrend trend={s.maTrend} t={t} /></td>
                    <td className="px-3 py-3"><RsiBar val={s.rsi14} t={t} /></td>
                    <td className="px-3 py-3"><MacdTrendBadge sig={s.macdSignalLabel} hist={s.macdHist} t={t} /></td>
                    <td className="px-3 py-3">
                      <AiActionBadge action={s.tradingAction} pct={s.positionSizePct} lang={lang} />
                    </td>
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
                const { labelKey, color } = rsiLevel(v);
                return (
                  <Link key={s.symbol} href={`/stocks/${encodeURIComponent(s.symbol)}`}
                    className="rounded-xl p-4 hover:opacity-90 transition-opacity" style={{ backgroundColor: bg }}>
                    <div className="text-xs font-mono text-slate-500 mb-1">{s.symbol}</div>
                    <div className="text-sm font-semibold text-slate-800 truncate mb-2">{s.nameZh || s.name}</div>
                    <div className={`text-xl font-bold tabular-nums ${color}`}>
                      {v.toFixed(1)}
                    </div>
                    <div className={`text-xs font-semibold mt-1 ${color}`}>{t(labelKey as MessageKey)}</div>
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
