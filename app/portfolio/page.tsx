"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";
import { buildStockUrl } from "@/lib/navigation/back";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { getPrimaryName } from "@/lib/company-name";
import { getRec, finalScoreColor } from "@/lib/rec-config";

// ─── Shared score type ──────────────────────────────────────────────────────

type WatchScore = {
  latestClose: number | null;
  return5d: number | null;
  return20d: number | null;
  rsi14: number | null;
  maTrend: string | null;
  adaptiveScore: number | null;
  recommendationV2: string | null;
  summaryReason: string | null;
  finalScore: number;
  gptScore: number | null;
  gptRank: number | null;
  gptRating: string | null;
  effectiveRating: string | null;
};

type WatchItem = {
  id: number;
  symbol: string;
  name: string;
  nameZh: string | null;
  nameEn: string | null;
  sector: string | null;
  market: string | null;
  note: string | null;
  targetPrice: number | null;
  addedAt: string;
  score: WatchScore | null;
};

// ─── Realtime data type ──────────────────────────────────────────────────────

type RealtimeData = {
  symbol: string;
  price: number | null;
  changePct: number | null;
  volume: number | null;
  volumeRatio: number | null;
  turnoverRate: number | null;
  marketCap: number | null;
  rsi14: number | null;
  ma5: number | null;
  ma20: number | null;
  ma60: number | null;
  week52High: number | null;
  week52Low: number | null;
  updatedAt: string;
};

// ─── Risk alert computation ──────────────────────────────────────────────────

type RiskAlert = {
  key: string;
  level: "warn" | "danger";
  label: string;
  value?: string;
};

function computeRisks(rt: RealtimeData | undefined, score: WatchScore | null, t: (k: Parameters<ReturnType<typeof useI18n>["t"]>[0]) => string): RiskAlert[] {
  if (!rt) return [];
  const alerts: RiskAlert[] = [];

  const rsi = rt.rsi14 ?? score?.rsi14 ?? null;
  if (rsi != null) {
    if (rsi > 85)       alerts.push({ key: "rsi_extreme", level: "danger", label: t("risk.rsi_extreme"), value: rsi.toFixed(1) });
    else if (rsi > 75)  alerts.push({ key: "rsi_high",    level: "warn",   label: t("risk.rsi_high"),    value: rsi.toFixed(1) });
  }

  const price = rt.price;
  const ma20  = rt.ma20;
  if (price != null && ma20 != null && price < ma20) {
    alerts.push({ key: "below_ma20", level: "danger", label: t("risk.below_ma20") });
  }

  const w52h = rt.week52High;
  if (price != null && w52h != null && w52h > 0 && price >= w52h * 0.98) {
    alerts.push({ key: "near_52w_high", level: "warn", label: t("risk.near_52w_high") });
  }

  const vr = rt.volumeRatio;
  if (vr != null && vr > 3) {
    alerts.push({ key: "vol_spike", level: "warn", label: t("risk.vol_spike"), value: `${vr.toFixed(1)}x` });
  }

  return alerts;
}

// ─── Tokyo market open check ─────────────────────────────────────────────────

function isTokyoMarketOpen(): boolean {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 3600 * 1000);
  const dow  = jst.getUTCDay(); // 0=Sun, 6=Sat
  if (dow === 0 || dow === 6) return false;
  const mins = jst.getUTCHours() * 60 + jst.getUTCMinutes();
  return (mins >= 9 * 60 && mins < 11 * 60 + 30) || (mins >= 12 * 60 + 30 && mins < 15 * 60 + 30);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function RetBadge({ val, size = "xs" }: { val: number | null; size?: "xs" | "sm" }) {
  if (val == null) return <span className="text-slate-300 text-xs">—</span>;
  const up = val >= 0;
  const cls = size === "sm" ? "text-sm font-bold" : "text-xs font-medium";
  return (
    <span className={`tabular-nums ${cls} ${up ? "text-emerald-600" : "text-red-500"}`}>
      {up ? "▲" : "▼"}{Math.abs(val).toFixed(2)}%
    </span>
  );
}

function fmtPrice(v: number | null): string {
  if (v == null) return "—";
  return `¥${v.toLocaleString()}`;
}

function fmtNum(v: number | null, decimals = 1): string {
  if (v == null) return "—";
  return v.toFixed(decimals);
}

// ─── Watchlist Tab ──────────────────────────────────────────────────────────

function WatchlistTab() {
  const { t, lang } = useI18n();
  const pathname = usePathname();
  const [items, setItems] = useState<WatchItem[]>([]);
  const [rtMap, setRtMap] = useState<Map<string, RealtimeData>>(new Map());
  const [loading, setLoading] = useState(true);
  const [rtLoading, setRtLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addSymbol, setAddSymbol] = useState("");
  const [addName, setAddName] = useState("");
  const [addNote, setAddNote] = useState("");
  const [addTarget, setAddTarget] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const symbolsRef = useRef<string[]>([]);

  const loadRealtime = useCallback(async (symbols: string[]) => {
    if (symbols.length === 0) return;
    setRtLoading(true);
    try {
      const res = await fetch(`/api/realtime-market?symbols=${encodeURIComponent(symbols.join(","))}`);
      if (!res.ok) throw new Error("fetch failed");
      const data: RealtimeData[] = await res.json();
      const map = new Map<string, RealtimeData>();
      data.forEach((d) => { if (!("error" in d)) map.set(d.symbol, d); });
      setRtMap(map);
      setLastUpdated(new Date());
    } catch {
      // realtime fetch failed — still show static data
    } finally {
      setRtLoading(false);
    }
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/watchlist")
      .then((r) => r.json())
      .then((d: WatchItem[]) => {
        setItems(d);
        setLoading(false);
        const syms = d.map((i) => i.symbol);
        symbolsRef.current = syms;
        loadRealtime(syms);
      })
      .catch(() => setLoading(false));
  }, [loadRealtime]);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = () => loadRealtime(symbolsRef.current);

  const handleLookup = async () => {
    if (!addSymbol) return;
    const code = addSymbol.replace(/\.T$/i, "").padEnd(4, "0").slice(0, 4) + ".T";
    const res = await fetch(`/api/stocks/${encodeURIComponent(code)}`);
    if (res.ok) { const d = await res.json(); setAddName(d.name || ""); }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addSymbol || !addName) return;
    setAddLoading(true);
    const code = addSymbol.replace(/\.T$/i, "").slice(0, 4) + ".T";
    await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: code, name: addName, note: addNote || null, targetPrice: addTarget ? parseFloat(addTarget) : null }),
    });
    setAddLoading(false);
    setShowAdd(false);
    setAddSymbol(""); setAddName(""); setAddNote(""); setAddTarget("");
    load();
  };

  const handleDelete = async (symbol: string) => {
    setDeleting(symbol);
    await fetch(`/api/watchlist?symbol=${encodeURIComponent(symbol)}`, { method: "DELETE" });
    setDeleting(null);
    load();
  };

  // ─── Dashboard stats ────────────────────────────────────────────────────────

  const rtList = items.map((i) => rtMap.get(i.symbol)).filter(Boolean) as RealtimeData[];
  const upCount   = rtList.filter((r) => (r.changePct ?? 0) > 0).length;
  const downCount = rtList.filter((r) => (r.changePct ?? 0) < 0).length;
  const validChanges = rtList.map((r) => r.changePct).filter((v): v is number => v != null);
  const avgChange = validChanges.length > 0
    ? validChanges.reduce((a, b) => a + b, 0) / validChanges.length
    : null;
  const marketOpen = isTokyoMarketOpen();

  // ─── Risk alerts ─────────────────────────────────────────────────────────────

  const allRisks = items.flatMap((item) => {
    const rt = rtMap.get(item.symbol);
    const risks = computeRisks(rt, item.score, t);
    return risks.map((r) => ({ ...r, symbol: item.symbol, name: getPrimaryName(item, lang) }));
  });

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="text-slate-400 text-sm animate-pulse">{t("common.loading")}</div>
      </div>
    );
  }

  return (
    <div>
      {/* ── Dashboard header ── */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-4 mb-5 text-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xl font-bold">
                {lang === "zh-CN" ? `共 ${items.length} 只` : lang === "ja-JP" ? `${items.length}銘柄` : `${items.length} Stocks`}
              </span>
              {rtList.length > 0 && (
                <>
                  <span className="text-emerald-400 text-sm font-medium">↑ {upCount} {t("dashboard.up")}</span>
                  <span className="text-red-400 text-sm font-medium">↓ {downCount} {t("dashboard.down")}</span>
                  {avgChange != null && (
                    <span className={`text-sm font-medium ${avgChange >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                      {t("dashboard.avg_change")}: {avgChange >= 0 ? "+" : ""}{avgChange.toFixed(2)}%
                    </span>
                  )}
                </>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
              <span className={marketOpen ? "text-emerald-400" : "text-slate-400"}>
                {marketOpen ? t("dashboard.market_open") : t("dashboard.market_closed")}
              </span>
              {lastUpdated && (
                <span>{t("dashboard.last_updated")}: {lastUpdated.toLocaleTimeString(lang === "en-US" ? "en-US" : lang === "ja-JP" ? "ja-JP" : "zh-CN", { hour: "2-digit", minute: "2-digit" })}</span>
              )}
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={rtLoading}
            className="text-xs bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg transition-colors shrink-0 flex items-center gap-1.5"
          >
            {rtLoading ? (
              <span className="animate-spin inline-block w-3 h-3 border border-white border-t-transparent rounded-full" />
            ) : "↻"}
            {t("dashboard.refresh")}
          </button>
        </div>
      </div>

      {/* ── Risk alerts panel ── */}
      {allRisks.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-amber-600 text-sm font-semibold">⚠ {t("dashboard.risk_section")} ({allRisks.length})</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {allRisks.slice(0, 8).map((r, i) => (
              <div
                key={i}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                  r.level === "danger"
                    ? "bg-red-50 border border-red-200 text-red-700"
                    : "bg-amber-50 border border-amber-200 text-amber-700"
                }`}
              >
                {r.level === "danger" ? "⛔" : "⚠"} {r.name} · {r.label}{r.value ? ` (${r.value})` : ""}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Add button + form ── */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-slate-500">{items.length} {t("screener.result_count")}</div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + {t("stock.add_watchlist")}
        </button>
      </div>

      {showAdd && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-5">
          <h3 className="font-semibold text-slate-900 mb-3 text-sm">{t("stock.add_watchlist")}</h3>
          <form onSubmit={handleAdd} className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="4桁コード (例: 7203)"
                value={addSymbol}
                onChange={(e) => setAddSymbol(e.target.value)}
                className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
              />
              <button type="button" onClick={handleLookup} className="px-4 py-2 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg font-medium">
                {t("common.search")}
              </button>
            </div>
            <input
              type="text"
              placeholder={t("common.name")}
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
            />
            <div className="flex gap-3">
              <button type="submit" disabled={addLoading || !addSymbol || !addName}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 rounded-lg disabled:opacity-40">
                {t("stock.add_watchlist")}
              </button>
              <button type="button" onClick={() => setShowAdd(false)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium py-2 rounded-lg">
                {t("common.close")}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Empty state ── */}
      {items.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="text-4xl mb-3">★</div>
          <div className="text-slate-700 font-medium mb-1">{t("watchlist.empty")}</div>
          <Link href="/screener" className="text-sm text-blue-600 hover:underline">{t("page.go_screener")} →</Link>
        </div>
      ) : (
        /* ── Stock cards grid ── */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((item) => {
            const s  = item.score;
            const rt = rtMap.get(item.symbol);
            const rec = getRec(s?.effectiveRating);

            // Price display: prefer realtime, fallback to StockScore
            const displayPrice = rt?.price ?? s?.latestClose ?? null;
            const displayChange = rt?.changePct ?? null;

            // MA20 status
            const ma20Status: "above" | "below" | null =
              rt?.price != null && rt?.ma20 != null
                ? rt.price >= rt.ma20 ? "above" : "below"
                : null;

            // 52w position %
            const w52pos =
              rt?.price != null && rt?.week52High != null && rt?.week52Low != null && rt.week52High > rt.week52Low
                ? ((rt.price - rt.week52Low) / (rt.week52High - rt.week52Low)) * 100
                : null;

            const rsi = rt?.rsi14 ?? s?.rsi14 ?? null;

            // Inline risk badges for the card
            const risks = computeRisks(rt, s, t);
            const targetHit = item.targetPrice != null && displayPrice != null ? displayPrice >= item.targetPrice : false;

            return (
              <div
                key={item.symbol}
                className={`bg-white rounded-xl border p-3 hover:shadow-sm hover:-translate-y-0.5 transition-all duration-200 ${
                  risks.some((r) => r.level === "danger")
                    ? "border-red-200 hover:border-red-300"
                    : risks.length > 0
                    ? "border-amber-200 hover:border-amber-300"
                    : "border-slate-200 hover:border-blue-200"
                }`}
              >
                {/* ── Header row ── */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <Link href={buildStockUrl(item.symbol, "portfolio", pathname)}
                      className="text-[14px] font-bold text-slate-900 hover:text-blue-600 leading-tight truncate block">
                      {getPrimaryName(item, lang)}
                    </Link>
                    <div className="text-[10px] text-slate-400 font-mono">{item.symbol}</div>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 shrink-0">
                    {s?.effectiveRating && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${rec.bg} ${rec.text}`}>
                        {t(`rating.${s.effectiveRating}` as Parameters<typeof t>[0])}
                      </span>
                    )}
                    {s?.gptRank != null && (
                      <span className="text-[10px] font-mono text-indigo-500">G#{s.gptRank}</span>
                    )}
                  </div>
                </div>

                {/* ── Price row ── */}
                <div className="flex items-end justify-between mb-2">
                  <div>
                    <div className="flex items-baseline gap-2 mb-0.5">
                      <span className="font-bold text-slate-900 text-[15px] tabular-nums">{fmtPrice(displayPrice)}</span>
                      {rt && <span className={`text-[10px] font-medium px-1 py-0.5 rounded ${displayChange != null && displayChange >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
                        <RetBadge val={displayChange} />
                      </span>}
                    </div>
                    {!rt && s && (
                      <div className="text-[10px] text-slate-400">
                        5D: <RetBadge val={s.return5d} /> 20D: <RetBadge val={s.return20d} />
                      </div>
                    )}
                  </div>
                  {s && (
                    <div className="text-right shrink-0 ml-2">
                      <div className={`text-xl font-bold tabular-nums ${finalScoreColor(s.finalScore)}`}>
                        {Math.round(s.finalScore)}
                      </div>
                      <div className="text-[9px] text-slate-400">{t("score.final")}</div>
                    </div>
                  )}
                </div>

                {/* ── Realtime indicators row ── */}
                {rt && (
                  <div className="grid grid-cols-3 gap-1 mb-2 text-[10px]">
                    <div className="bg-slate-50 rounded px-1.5 py-1">
                      <span className="text-slate-400 block">RSI</span>
                      <span className={`font-semibold tabular-nums ${rsi != null && rsi > 75 ? "text-amber-600" : rsi != null && rsi > 85 ? "text-red-600" : "text-slate-700"}`}>
                        {rsi != null ? rsi.toFixed(1) : "—"}
                      </span>
                    </div>
                    <div className="bg-slate-50 rounded px-1.5 py-1">
                      <span className="text-slate-400 block">MA20</span>
                      <span className={`font-semibold ${ma20Status === "above" ? "text-emerald-600" : ma20Status === "below" ? "text-red-600" : "text-slate-400"}`}>
                        {ma20Status === "above" ? t("field.ma20_above") : ma20Status === "below" ? t("field.ma20_below") : "—"}
                      </span>
                    </div>
                    <div className="bg-slate-50 rounded px-1.5 py-1">
                      <span className="text-slate-400 block">{t("field.52w_pos")}</span>
                      <span className="font-semibold text-slate-700 tabular-nums">
                        {w52pos != null ? `${w52pos.toFixed(0)}%` : "—"}
                      </span>
                    </div>
                  </div>
                )}

                {/* ── Volume row ── */}
                {rt && (rt.volumeRatio != null || rt.turnoverRate != null) && (
                  <div className="flex gap-3 text-[10px] mb-2 text-slate-500">
                    {rt.volumeRatio != null && (
                      <span>{t("field.vol_ratio")}: <b className={`text-slate-700 ${rt.volumeRatio > 3 ? "text-amber-600" : ""}`}>{fmtNum(rt.volumeRatio)}x</b></span>
                    )}
                    {rt.turnoverRate != null && (
                      <span>{t("field.turnover")}: <b className="text-slate-700">{fmtNum(rt.turnoverRate)}%</b></span>
                    )}
                  </div>
                )}

                {/* ── Risk badges inline ── */}
                {risks.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {risks.slice(0, 3).map((r) => (
                      <span
                        key={r.key}
                        className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${
                          r.level === "danger"
                            ? "bg-red-100 text-red-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {r.level === "danger" ? "⛔" : "⚠"} {r.label}
                        {r.value ? ` ${r.value}` : ""}
                      </span>
                    ))}
                  </div>
                )}

                {/* ── Target price ── */}
                {item.targetPrice != null && (
                  <div className={`text-[10px] mb-1 ${targetHit ? "text-emerald-600 font-medium" : "text-slate-400"}`}>
                    → {fmtPrice(item.targetPrice)}{targetHit && " ✓"}
                  </div>
                )}

                {/* ── Footer ── */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                  {item.note && <p className="text-[10px] text-slate-400 truncate flex-1 mr-2">📝 {item.note}</p>}
                  <div className="flex gap-1 ml-auto">
                    <Link href={buildStockUrl(item.symbol, "portfolio", pathname)}
                      className="text-xs text-blue-600 hover:text-blue-700 px-2 py-1 border border-blue-200 hover:border-blue-300 rounded-lg transition-colors">
                      →
                    </Link>
                    <button onClick={() => handleDelete(item.symbol)} disabled={deleting === item.symbol}
                      className="text-xs text-red-400 hover:text-red-600 px-2 py-1 border border-red-100 hover:border-red-200 rounded-lg transition-colors disabled:opacity-40">
                      {deleting === item.symbol ? "…" : "🗑"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Portfolio Tab ──────────────────────────────────────────────────────────

type PortfolioScore = {
  adaptiveScore: number | null;
  finalScore: number;
  gptScore: number | null;
  gptRank: number | null;
  gptRating: string | null;
  effectiveRating: string;
  recommendationV2: string | null;
  latestClose: number | null;
  return5d: number | null;
  return20d: number | null;
};

type PortfolioItem = {
  id: number;
  symbol: string;
  name: string;
  shares: number;
  avgPrice: number;
  note: string | null;
  currentPrice: number;
  value: number;
  pnl: number;
  pnlRate: number;
  stock: { price: number; changeRate: number | null; nameZh: string | null } | null;
  score: PortfolioScore | null;
};

type PortfolioData = { items: PortfolioItem[]; totalValue: number; totalCost: number; totalPnl: number };

function PortfolioTab() {
  const { t, lang } = useI18n();
  const pathname = usePathname();
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ symbol: "", name: "", shares: "", avgPrice: "", note: "" });
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/portfolio");
    setData(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/portfolio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaving(false);
    setShowForm(false);
    setForm({ symbol: "", name: "", shares: "", avgPrice: "", note: "" });
    fetchData();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("確認して削除しますか？")) return;
    await fetch(`/api/portfolio/${id}`, { method: "DELETE" });
    fetchData();
  };

  const totalPnlRate = data && data.totalCost > 0 ? (data.totalPnl / data.totalCost) * 100 : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-slate-500">{data?.items.length ?? 0} {t("screener.result_count")}</div>
        <button onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg font-medium transition-colors">
          + {t("portfolio.title")}
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-5">
          <h3 className="font-semibold text-slate-900 mb-3 text-sm">{t("portfolio.title")}</h3>
          <form onSubmit={handleAdd} className="grid grid-cols-2 gap-3">
            {[
              { key: "symbol", label: t("common.symbol"), placeholder: "7203.T" },
              { key: "name",   label: t("common.name"),   placeholder: "トヨタ自動車" },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="text-xs text-slate-500 mb-1 block">{label} *</label>
                <input value={form[key as keyof typeof form]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  placeholder={placeholder} required
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            ))}
            {[
              { key: "shares", label: "株数", placeholder: "100", type: "number" },
              { key: "avgPrice", label: "取得単価 (¥)", placeholder: "2650", type: "number" },
            ].map(({ key, label, placeholder, type }) => (
              <div key={key}>
                <label className="text-xs text-slate-500 mb-1 block">{label} *</label>
                <input type={type} value={form[key as keyof typeof form]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  placeholder={placeholder} required min="0"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            ))}
            <div className="col-span-2 flex gap-2 justify-end">
              <button type="button" onClick={() => setShowForm(false)}
                className="text-sm px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
                {t("common.close")}
              </button>
              <button type="submit" disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm px-4 py-2 rounded-lg font-medium">
                {saving ? t("sync.syncing") : t("stock.add_watchlist")}
              </button>
            </div>
          </form>
        </div>
      )}

      {data && (
        <div className="grid grid-cols-4 gap-3 mb-5">
          {[
            { label: "総評価額",   value: `¥${Math.round(data.totalValue).toLocaleString()}`,   cls: "text-slate-900" },
            { label: "取得コスト", value: `¥${Math.round(data.totalCost).toLocaleString()}`,    cls: "text-slate-900" },
            { label: "評価損益",   value: `${data.totalPnl >= 0 ? "+" : ""}¥${Math.round(data.totalPnl).toLocaleString()}`, cls: data.totalPnl >= 0 ? "text-emerald-600" : "text-red-500" },
            { label: "損益率",     value: `${totalPnlRate >= 0 ? "+" : ""}${totalPnlRate.toFixed(2)}%`, cls: totalPnlRate >= 0 ? "text-emerald-600" : "text-red-500" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="text-xs text-slate-500 mb-1">{s.label}</div>
              <div className={`text-xl font-bold tabular-nums ${s.cls}`}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm animate-pulse">{t("common.loading")}</div>
        ) : data?.items.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">{t("portfolio.empty")}</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {data?.items.map((item) => {
              const pnlUp = item.pnl >= 0;
              const pnlCls = pnlUp ? "text-emerald-600" : "text-red-500";
              const rec = getRec(item.score?.effectiveRating);
              return (
                <div key={item.id} className="bg-white rounded-xl border border-slate-200 p-3 hover:border-blue-200 hover:shadow-sm hover:-translate-y-0.5 transition-all duration-200">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <Link href={buildStockUrl(item.symbol, "portfolio", pathname)} className="block group">
                        <div className="text-[14px] font-bold text-slate-900 group-hover:text-blue-600 truncate">
                          {item.stock?.nameZh || item.name}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">{item.symbol}</div>
                      </Link>
                    </div>
                    {item.score && (
                      <div className="text-right shrink-0 ml-1">
                        <div className={`text-[15px] font-bold tabular-nums ${finalScoreColor(item.score.finalScore)}`}>
                          {Math.round(item.score.finalScore)}
                        </div>
                        <div className={`text-[9px] font-bold ${rec.text}`}>{rec.label}</div>
                        {item.score.gptRank != null && (
                          <div className="text-[9px] font-mono text-indigo-500">G#{item.score.gptRank}</div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-end justify-between mb-2">
                    <div>
                      <div className="text-[13px] font-bold text-slate-900 tabular-nums">
                        ¥{item.currentPrice.toLocaleString()}
                        {item.stock?.changeRate != null && (
                          <span className={`ml-1.5 text-[10px] ${item.stock.changeRate >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                            {item.stock.changeRate >= 0 ? "▲" : "▼"}{Math.abs(item.stock.changeRate).toFixed(2)}%
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 tabular-nums">
                        {item.shares.toLocaleString()}株 @ ¥{item.avgPrice.toLocaleString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-[13px] font-bold tabular-nums ${pnlCls}`}>
                        {pnlUp ? "+" : ""}¥{Math.round(item.pnl).toLocaleString()}
                      </div>
                      <div className={`text-[10px] tabular-nums ${pnlCls}`}>
                        {pnlUp ? "+" : ""}{item.pnlRate.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                    <div className="text-[10px] text-slate-400 tabular-nums">
                      {lang === "zh-CN" ? "评估额" : lang === "ja-JP" ? "評価額" : "Value"} ¥{Math.round(item.value).toLocaleString()}
                    </div>
                    <div className="flex gap-1">
                      <Link href={buildStockUrl(item.symbol, "portfolio", pathname)}
                        className="text-xs text-blue-600 hover:text-blue-700 px-2 py-1 border border-blue-200 hover:border-blue-300 rounded-lg transition-colors">
                        →
                      </Link>
                      <button onClick={() => handleDelete(item.id)}
                        className="text-xs text-red-400 hover:text-red-600 px-2 py-1 border border-red-100 hover:border-red-200 rounded-lg transition-colors">
                        🗑
                      </button>
                    </div>
                  </div>
                  {item.note && <div className="text-[10px] text-slate-400 mt-1.5 truncate">📝 {item.note}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Price Alerts Tab ───────────────────────────────────────────────────────

function PriceAlertsTab() {
  const { t } = useI18n();
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
      <div className="text-4xl mb-3">🔔</div>
      <div className="text-slate-700 font-medium mb-2">{t("tabs.priceAlerts")}</div>
      <p className="text-sm text-slate-500 max-w-xs mx-auto">
        {t("empty.retry")}
      </p>
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────

type Tab = "watchlist" | "portfolio" | "priceAlerts";

export default function MyInvestmentsPage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<Tab>("watchlist");

  const tabs: { key: Tab; label: string }[] = [
    { key: "watchlist",   label: t("tabs.watchlist") },
    { key: "portfolio",   label: t("tabs.portfolio") },
    { key: "priceAlerts", label: t("tabs.priceAlerts") },
  ];

  return (
    <div className="p-4 md:p-6 max-w-5xl">
      <div className="mb-5">
        <h1 className="text-[28px] font-bold text-slate-900 leading-tight">{t("nav.myInvestments")}</h1>
        <p className="text-sm text-slate-500 mt-0.5">{t("tabs.watchlist")} · {t("tabs.portfolio")} · {t("tabs.priceAlerts")}</p>
      </div>

      <div className="flex gap-0 bg-slate-100 rounded-xl p-1 mb-6 w-fit">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === key
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "watchlist"   && <WatchlistTab />}
      {activeTab === "portfolio"   && <PortfolioTab />}
      {activeTab === "priceAlerts" && <PriceAlertsTab />}
    </div>
  );
}
