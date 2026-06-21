"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { returnColorClass, fmtPct, fmtJpy } from "@/lib/rec-config";
import { useI18n } from "@/lib/i18n";
import { getPrimaryName, getSecondaryName } from "@/lib/company-name";

type StockRow = {
  symbol: string;
  name: string;
  nameZh: string | null;
  nameEn: string | null;
  sector: string | null;
  market: string | null;
  latestDate: string;
  latestClose: number;
  return5d: number | null;
  return20d: number | null;
  return60d: number | null;
  ma5: number | null;
  ma20: number | null;
  rsi14: number | null;
  macd: number | null;
  macdSignalLabel: "BUY" | "NEUTRAL" | "SELL";
  maTrend: "GOLDEN" | "DEAD" | "BULLISH" | "NEUTRAL" | "BEARISH";
  rsiSignal: string;
  finCount: number;
};

type SortKey = "latestClose" | "return5d" | "return20d" | "return60d" | "rsi14";

function ReturnCell({ val }: { val: number | null }) {
  if (val === null) return <span className="text-slate-300">—</span>;
  return (
    <span className={`tabular-nums font-medium ${returnColorClass(val)}`}>
      {fmtPct(val)}
    </span>
  );
}

function MaBadge({ trend }: { trend: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    GOLDEN:  { label: "Bullish",  cls: "bg-amber-100 text-amber-700" },
    BULLISH: { label: "Strong",   cls: "bg-emerald-100 text-emerald-700" },
    NEUTRAL: { label: "Neutral",  cls: "bg-slate-100 text-slate-500" },
    BEARISH: { label: "Weak",     cls: "bg-slate-100 text-slate-500" },
    DEAD:    { label: "Bearish",  cls: "bg-red-100 text-red-600" },
  };
  const c = cfg[trend] ?? cfg.NEUTRAL;
  return <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${c.cls}`}>{c.label}</span>;
}

function MacdBadge({ sig }: { sig: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    BUY:     { label: "BUY",     cls: "bg-emerald-100 text-emerald-700" },
    NEUTRAL: { label: "Neutral", cls: "bg-slate-100 text-slate-400" },
    SELL:    { label: "SELL",    cls: "bg-red-100 text-red-600" },
  };
  const c = cfg[sig] ?? cfg.NEUTRAL;
  return <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${c.cls}`}>{c.label}</span>;
}

function RsiBar({ val }: { val: number | null }) {
  if (val === null) return <span className="text-slate-300 text-xs">—</span>;
  const color =
    val >= 70 ? "bg-red-400" : val >= 55 ? "bg-orange-400" : val <= 30 ? "bg-emerald-400" : "bg-slate-300";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-12 bg-slate-100 rounded-full h-1.5 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${val}%` }} />
      </div>
      <span className="tabular-nums text-xs text-slate-600 w-8">{val.toFixed(0)}</span>
    </div>
  );
}

export default function StocksPage() {
  const { t, lang } = useI18n();
  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("return5d");
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch("/api/indicators")
      .then((r) => {
        if (!r.ok) throw new Error(`API错误 ${r.status}`);
        return r.json();
      })
      .then((data: StockRow[]) => { setRows(Array.isArray(data) ? data : []); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, []);

  const filtered = rows
    .filter((r) => {
      if (!q) return true;
      const ql = q.toLowerCase();
      return (
        r.symbol.toLowerCase().includes(ql) ||
        r.name.includes(q) ||
        (r.nameZh ?? "").includes(q) ||
        r.symbol.replace(".T", "").includes(q)
      );
    })
    .sort((a, b) => {
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

  return (
    <div className="p-6 max-w-7xl">
      {/* Merged notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-5 flex items-center justify-between gap-4">
        <span className="text-sm text-blue-700">{t("page.merged_screener")}</span>
        <Link href="/screener" className="shrink-0 text-xs font-medium text-blue-600 bg-white border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors">
          {t("page.go_screener")} →
        </Link>
      </div>
      <div className="mb-5">
        <h1 className="text-[32px] font-bold text-slate-900 leading-tight">{t("top500.title")}</h1>
        <p className="text-sm text-slate-500 mt-0.5">{loading ? t("common.loading") : error ? t("error.fetch_failed") : `${rows.length} ${t("screener.result_count")}`}</p>
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-5 flex gap-3">
        <input
          type="text"
          placeholder={t("stocks.search_placeholder")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <Link
          href="/indicators"
          className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-sm px-4 py-2 rounded-lg font-medium transition-colors"
        >
          ◈ {t("nav.indicators")}
        </Link>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 text-sm text-slate-500">
          {loading ? t("common.loading") : error ? <span className="text-red-500">{t("error.fetch_failed")}: {error}</span> : `${filtered.length} ${t("screener.result_count")}`}
        </div>
        {error && (
          <div className="px-5 py-8 text-center text-red-500 text-sm">{t("error.fetch_failed")}: {error}</div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-slate-100 bg-slate-50">
                <th className="px-5 py-3 font-medium">Stock</th>
                <th className="px-3 py-3 font-medium text-right cursor-pointer hover:text-slate-700" onClick={() => toggleSort("latestClose")}>
                  Price<SortIcon col="latestClose" />
                </th>
                <th className="px-3 py-3 font-medium text-center">Date</th>
                <th className="px-3 py-3 font-medium text-right cursor-pointer hover:text-slate-700" onClick={() => toggleSort("return5d")}>
                  5D<SortIcon col="return5d" />
                </th>
                <th className="px-3 py-3 font-medium text-right cursor-pointer hover:text-slate-700" onClick={() => toggleSort("return20d")}>
                  20D<SortIcon col="return20d" />
                </th>
                <th className="px-3 py-3 font-medium text-right cursor-pointer hover:text-slate-700" onClick={() => toggleSort("return60d")}>
                  60D<SortIcon col="return60d" />
                </th>
                <th className="px-3 py-3 font-medium text-center">MA Trend</th>
                <th className="px-3 py-3 font-medium text-left cursor-pointer hover:text-slate-700" onClick={() => toggleSort("rsi14")}>
                  RSI(14)<SortIcon col="rsi14" />
                </th>
                <th className="px-3 py-3 font-medium text-center">MACD</th>
                <th className="px-3 py-3 font-medium text-right">Fin.</th>
                <th className="px-3 py-3 font-medium text-right">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan={11} className="px-5 py-12 text-center text-slate-400 text-sm">
                    {t("common.loading")}
                  </td>
                </tr>
              ) : filtered.map((s) => (
                <tr key={s.symbol} className="hover:bg-blue-50/30 transition-colors">
                  <td className="px-5 py-3">
                    <Link href={`/stocks/${encodeURIComponent(s.symbol)}`} className="block group">
                      <div className="text-[15px] font-bold text-slate-900 group-hover:text-blue-600 leading-tight">
                        {getPrimaryName(s, lang)}
                      </div>
                      {getSecondaryName(s, lang) && (
                        <div className="text-[12px] text-[#94a3b8] truncate mt-0.5">{getSecondaryName(s, lang)}</div>
                      )}
                      <div className="text-[12px] text-[#64748b] font-mono mt-0.5">{s.symbol}</div>
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums font-medium text-sm text-slate-900">
                    {fmtJpy(s.latestClose)}
                  </td>
                  <td className="px-3 py-3 text-center text-xs text-slate-500 tabular-nums">{s.latestDate}</td>
                  <td className="px-3 py-3 text-right text-sm"><ReturnCell val={s.return5d} /></td>
                  <td className="px-3 py-3 text-right text-sm"><ReturnCell val={s.return20d} /></td>
                  <td className="px-3 py-3 text-right text-sm"><ReturnCell val={s.return60d} /></td>
                  <td className="px-3 py-3 text-center"><MaBadge trend={s.maTrend} /></td>
                  <td className="px-3 py-3"><RsiBar val={s.rsi14} /></td>
                  <td className="px-3 py-3 text-center"><MacdBadge sig={s.macdSignalLabel} /></td>
                  <td className="px-3 py-3 text-right text-sm text-slate-600 tabular-nums">{s.finCount}</td>
                  <td className="px-3 py-3 text-right">
                    <Link href={`/stocks/${encodeURIComponent(s.symbol)}`} className="text-xs text-blue-600 hover:underline">
                      详情 →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
