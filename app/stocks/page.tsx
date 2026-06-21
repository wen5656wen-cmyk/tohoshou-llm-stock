"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useVirtualizer } from "@tanstack/react-virtual";
import { returnColorClass, fmtPct, fmtJpy } from "@/lib/rec-config";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/types";
import { getPrimaryName, getSecondaryName } from "@/lib/company-name";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";

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

const ROW_HEIGHT = 56;

function ReturnCell({ val }: { val: number | null }) {
  if (val === null) return <span className="text-slate-300">—</span>;
  return (
    <span className={`tabular-nums font-medium ${returnColorClass(val)}`}>
      {fmtPct(val)}
    </span>
  );
}

function MaBadge({ trend, t }: { trend: string; t: (k: MessageKey) => string }) {
  const cfg: Record<string, string> = {
    GOLDEN:  "bg-amber-100 text-amber-700",
    BULLISH: "bg-emerald-100 text-emerald-700",
    NEUTRAL: "bg-slate-100 text-slate-500",
    BEARISH: "bg-slate-100 text-slate-500",
    DEAD:    "bg-red-100 text-red-600",
  };
  const labelKey: Record<string, string> = {
    GOLDEN:  "trend.golden",
    BULLISH: "trend.bullish",
    NEUTRAL: "trend.neutral",
    BEARISH: "trend.bearish",
    DEAD:    "trend.dead",
  };
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${cfg[trend] ?? cfg.NEUTRAL}`}>
      {t((labelKey[trend] ?? "trend.neutral") as MessageKey)}
    </span>
  );
}

function MacdBadge({ sig, t }: { sig: string; t: (k: MessageKey) => string }) {
  const cfg: Record<string, { key: MessageKey; cls: string }> = {
    BUY:     { key: "macd.bullish", cls: "bg-emerald-100 text-emerald-700" },
    NEUTRAL: { key: "trend.neutral", cls: "bg-slate-100 text-slate-400" },
    SELL:    { key: "macd.bearish",  cls: "bg-red-100 text-red-600" },
  };
  const c = cfg[sig] ?? cfg.NEUTRAL;
  return <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${c.cls}`}>{t(c.key)}</span>;
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
  useScrollRestoration("stocks");
  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("return5d");
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  // Virtual scroll container
  const tableContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const timer = setTimeout(() => {
      setLoading(false);
      setError("timeout");
    }, 15000);
    fetch("/api/indicators")
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then((data: StockRow[]) => {
        clearTimeout(timer);
        setRows(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((e: Error) => {
        clearTimeout(timer);
        setError(e.message);
        setLoading(false);
      });
    return () => clearTimeout(timer);
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

  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

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

      {/* TOP500 description */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 mb-5 text-xs text-slate-500">
        {t("page.stocks_top500_desc")}
      </div>

      <div className="mb-5">
        <h1 className="text-[32px] font-bold text-slate-900 leading-tight">{t("top500.title")}</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {loading ? t("common.loading") : error ? t("error.fetch_failed") : `${rows.length} ${t("screener.result_count")}`}
        </p>
      </div>

      {/* Error state */}
      {!loading && error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-5 mb-5 text-center">
          <p className="text-sm text-red-700 mb-3">{t("page.loading_failed_screener")}</p>
          <Link href="/screener" className="inline-block text-xs font-medium text-white bg-blue-600 px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
            {t("page.go_screener")} →
          </Link>
        </div>
      )}

      {/* Search + controls */}
      {!error && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-5 flex gap-3">
          <input
            type="text"
            placeholder={t("stocks.search_placeholder")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <Link
            href="/screener?sort=technical"
            className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-sm px-4 py-2 rounded-lg font-medium transition-colors"
          >
            ◈ {t("stocks.view_technicals")}
          </Link>
        </div>
      )}

      {/* Virtualized table */}
      {!error && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 text-sm text-slate-500">
            {loading
              ? t("common.loading")
              : `${filtered.length} ${t("screener.result_count")}`}
          </div>

          {loading ? (
            <div className="py-16 text-center text-slate-400 text-sm">{t("common.loading")}</div>
          ) : (
            <div
              ref={tableContainerRef}
              className="overflow-auto"
              style={{ height: "calc(100vh - 380px)", minHeight: 320 }}
            >
              <table className="w-full" style={{ tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: 220 }} />
                  <col style={{ width: 90 }} />
                  <col style={{ width: 80 }} />
                  <col style={{ width: 72 }} />
                  <col style={{ width: 72 }} />
                  <col style={{ width: 72 }} />
                  <col style={{ width: 90 }} />
                  <col style={{ width: 110 }} />
                  <col style={{ width: 80 }} />
                  <col style={{ width: 60 }} />
                  <col style={{ width: 60 }} />
                </colgroup>
                <thead className="sticky top-0 z-10 bg-slate-50">
                  <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                    <th className="px-5 py-3 font-medium">{t("table.stock")}</th>
                    <th className="px-3 py-3 font-medium text-right cursor-pointer hover:text-slate-700" onClick={() => toggleSort("latestClose")}>
                      {t("table.price")}<SortIcon col="latestClose" />
                    </th>
                    <th className="px-3 py-3 font-medium text-center">{t("table.date")}</th>
                    <th className="px-3 py-3 font-medium text-right cursor-pointer hover:text-slate-700" onClick={() => toggleSort("return5d")}>
                      5D<SortIcon col="return5d" />
                    </th>
                    <th className="px-3 py-3 font-medium text-right cursor-pointer hover:text-slate-700" onClick={() => toggleSort("return20d")}>
                      20D<SortIcon col="return20d" />
                    </th>
                    <th className="px-3 py-3 font-medium text-right cursor-pointer hover:text-slate-700" onClick={() => toggleSort("return60d")}>
                      60D<SortIcon col="return60d" />
                    </th>
                    <th className="px-3 py-3 font-medium text-center">{t("table.ma_trend")}</th>
                    <th className="px-3 py-3 font-medium text-left cursor-pointer hover:text-slate-700" onClick={() => toggleSort("rsi14")}>
                      RSI(14)<SortIcon col="rsi14" />
                    </th>
                    <th className="px-3 py-3 font-medium text-center">MACD</th>
                    <th className="px-3 py-3 font-medium text-right">{t("table.financials")}</th>
                    <th className="px-3 py-3 font-medium text-right">{t("table.detail")}</th>
                  </tr>
                </thead>
                <tbody
                  style={{
                    height: `${rowVirtualizer.getTotalSize()}px`,
                    position: "relative",
                    display: "block",
                  }}
                >
                  {virtualItems.map((virtualRow) => {
                    const s = filtered[virtualRow.index];
                    return (
                      <tr
                        key={s.symbol}
                        data-index={virtualRow.index}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          height: `${ROW_HEIGHT}px`,
                          transform: `translateY(${virtualRow.start}px)`,
                          display: "flex",
                          alignItems: "center",
                          borderBottom: "1px solid #f8fafc",
                        }}
                        className="hover:bg-blue-50/30 transition-colors"
                      >
                        {/* Stock */}
                        <td style={{ width: 220, minWidth: 220, padding: "0 8px 0 20px" }}>
                          <Link href={`/stocks/${encodeURIComponent(s.symbol)}`} className="block group">
                            <div className="text-[14px] font-bold text-slate-900 group-hover:text-blue-600 leading-tight truncate">
                              {getPrimaryName(s, lang)}
                            </div>
                            {getSecondaryName(s, lang) && (
                              <div className="text-[11px] text-[#94a3b8] truncate">{getSecondaryName(s, lang)}</div>
                            )}
                            <div className="text-[11px] text-[#64748b] font-mono">{s.symbol}</div>
                          </Link>
                        </td>
                        {/* Price */}
                        <td style={{ width: 90, minWidth: 90, padding: "0 8px", textAlign: "right" }}>
                          <span className="tabular-nums font-medium text-sm text-slate-900">{fmtJpy(s.latestClose)}</span>
                        </td>
                        {/* Date */}
                        <td style={{ width: 80, minWidth: 80, padding: "0 8px", textAlign: "center" }}>
                          <span className="text-xs text-slate-500 tabular-nums">{s.latestDate}</span>
                        </td>
                        {/* 5D */}
                        <td style={{ width: 72, minWidth: 72, padding: "0 8px", textAlign: "right" }}>
                          <ReturnCell val={s.return5d} />
                        </td>
                        {/* 20D */}
                        <td style={{ width: 72, minWidth: 72, padding: "0 8px", textAlign: "right" }}>
                          <ReturnCell val={s.return20d} />
                        </td>
                        {/* 60D */}
                        <td style={{ width: 72, minWidth: 72, padding: "0 8px", textAlign: "right" }}>
                          <ReturnCell val={s.return60d} />
                        </td>
                        {/* MA Trend */}
                        <td style={{ width: 90, minWidth: 90, padding: "0 8px", textAlign: "center" }}>
                          <MaBadge trend={s.maTrend} t={t} />
                        </td>
                        {/* RSI */}
                        <td style={{ width: 110, minWidth: 110, padding: "0 8px" }}>
                          <RsiBar val={s.rsi14} />
                        </td>
                        {/* MACD */}
                        <td style={{ width: 80, minWidth: 80, padding: "0 8px", textAlign: "center" }}>
                          <MacdBadge sig={s.macdSignalLabel} t={t} />
                        </td>
                        {/* Fin */}
                        <td style={{ width: 60, minWidth: 60, padding: "0 8px", textAlign: "right" }}>
                          <span className="text-sm text-slate-600 tabular-nums">{s.finCount}</span>
                        </td>
                        {/* Detail */}
                        <td style={{ width: 60, minWidth: 60, padding: "0 8px 0 0", textAlign: "right" }}>
                          <Link href={`/stocks/${encodeURIComponent(s.symbol)}`} className="text-xs text-blue-600 hover:underline">
                            {t("table.detail")} →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
