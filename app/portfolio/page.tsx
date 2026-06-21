"use client";

import { useEffect, useState, useCallback } from "react";
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

// ─── Watchlist Tab ──────────────────────────────────────────────────────────

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

function RetBadge({ val }: { val: number | null }) {
  if (val == null) return <span className="text-slate-300 text-xs">—</span>;
  const up = val >= 0;
  return (
    <span className={`text-xs font-medium tabular-nums ${up ? "text-[#e74c3c]" : "text-[#2980b9]"}`}>
      {up ? "▲" : "▼"}{Math.abs(val).toFixed(2)}%
    </span>
  );
}

function WatchlistTab() {
  const { t, lang } = useI18n();
  const pathname = usePathname();
  const [items, setItems] = useState<WatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addSymbol, setAddSymbol] = useState("");
  const [addName, setAddName] = useState("");
  const [addNote, setAddNote] = useState("");
  const [addTarget, setAddTarget] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/watchlist")
      .then((r) => r.json())
      .then((d) => { setItems(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

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

  return (
    <div>
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

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="text-slate-400 text-sm animate-pulse">{t("common.loading")}</div>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="text-4xl mb-3">★</div>
          <div className="text-slate-700 font-medium mb-1">{t("watchlist.empty")}</div>
          <Link href="/screener" className="text-sm text-blue-600 hover:underline">{t("page.go_screener")} →</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((item) => {
            const s = item.score;
            const rec = getRec(s?.effectiveRating);
            const currentPrice = s?.latestClose;
            const targetHit = item.targetPrice != null && currentPrice != null ? currentPrice >= item.targetPrice : false;

            return (
              <div key={item.symbol} className="bg-white rounded-xl border border-slate-200 p-3 hover:border-blue-200 hover:shadow-sm hover:-translate-y-0.5 transition-all duration-200">
                {/* Header row */}
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
                {/* Price + score */}
                <div className="flex items-end justify-between">
                  <div>
                    {s ? (
                      <>
                        <div className="flex items-center gap-2 text-[11px] mb-0.5">
                          <span className="font-medium text-slate-900 text-[13px]">{s.latestClose ? `¥${s.latestClose.toLocaleString()}` : "—"}</span>
                          <RetBadge val={s.return5d} />
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400">
                          <span>20D: <RetBadge val={s.return20d} /></span>
                          <span>RSI: <b className="text-slate-600">{s.rsi14?.toFixed(1) ?? "—"}</b></span>
                        </div>
                      </>
                    ) : <span className="text-slate-300 text-xs">{t("common.no_data")}</span>}
                    {item.targetPrice != null && (
                      <div className={`text-[10px] mt-0.5 ${targetHit ? "text-emerald-600 font-medium" : "text-slate-400"}`}>
                        → ¥{item.targetPrice.toLocaleString()}{targetHit && " ✓"}
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
                {/* Note + buttons */}
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-50">
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
            { label: "評価損益",   value: `${data.totalPnl >= 0 ? "+" : ""}¥${Math.round(data.totalPnl).toLocaleString()}`, cls: data.totalPnl >= 0 ? "text-[#e74c3c]" : "text-[#2980b9]" },
            { label: "損益率",     value: `${totalPnlRate >= 0 ? "+" : ""}${totalPnlRate.toFixed(2)}%`, cls: totalPnlRate >= 0 ? "text-[#e74c3c]" : "text-[#2980b9]" },
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
              const pnlCls = pnlUp ? "text-[#e74c3c]" : "text-[#2980b9]";
              const rec = getRec(item.score?.effectiveRating);
              return (
                <div key={item.id} className="bg-white rounded-xl border border-slate-200 p-3 hover:border-blue-200 hover:shadow-sm hover:-translate-y-0.5 transition-all duration-200">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <Link href={buildStockUrl(item.symbol, "portfolio", pathname)} className="block group">
                        <div className="text-[14px] font-bold text-slate-900 group-hover:text-blue-600 truncate">
                          {item.stock?.nameZh || item.name}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">{item.symbol}</div>
                      </Link>
                    </div>
                    {/* finalScore + rating badge + G# */}
                    {item.score && (
                      <div className="text-right shrink-0 ml-1">
                        <div className={`text-[15px] font-bold tabular-nums ${finalScoreColor(item.score.finalScore)}`}>
                          {Math.round(item.score.finalScore)}
                        </div>
                        <div className={`text-[9px] font-bold ${rec.text}`}>
                          {rec.label}
                        </div>
                        {item.score.gptRank != null && (
                          <div className="text-[9px] font-mono text-indigo-500">G#{item.score.gptRank}</div>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Price row */}
                  <div className="flex items-end justify-between mb-2">
                    <div>
                      <div className="text-[13px] font-bold text-slate-900 tabular-nums">
                        ¥{item.currentPrice.toLocaleString()}
                        {item.stock?.changeRate != null && (
                          <span className={`ml-1.5 text-[10px] ${item.stock.changeRate >= 0 ? "text-[#e74c3c]" : "text-[#2980b9]"}`}>
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
                  {/* Footer: value + delete */}
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

      {/* Tab bar */}
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
