"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { getPrimaryName, getSecondaryName } from "@/lib/company-name";

type WatchScore = {
  latestClose: number | null;
  latestDate: string | null;
  return5d: number | null;
  return20d: number | null;
  return60d: number | null;
  rsi14: number | null;
  maTrend: string | null;
  macdSignalLabel: string | null;
  technicalScore: number | null;
  fundamentalScore: number | null;
  moneyFlowScore: number | null;
  newsSentimentScore: number | null;
  globalTrendScore: number | null;
  riskScore: number | null;
  totalScore: number | null;
  recommendation: string | null;
  starsLabel: string | null;
  summaryReason: string | null;
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

const REC_CFG: Record<string, { label: string; bg: string; text: string }> = {
  STRONG_BUY: { label: "强烈买入", bg: "bg-red-50",    text: "text-red-700" },
  BUY:        { label: "买入",     bg: "bg-orange-50", text: "text-orange-700" },
  WATCH:      { label: "关注",     bg: "bg-yellow-50", text: "text-yellow-700" },
  HOLD:       { label: "持有",     bg: "bg-slate-50",  text: "text-slate-600" },
  AVOID:      { label: "回避",     bg: "bg-blue-50",   text: "text-blue-600" },
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

function AddStockModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLookup = async () => {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    try {
      const code = symbol.replace(/\.T$/i, "").padEnd(4, "0").slice(0, 4);
      const sym = code + ".T";
      const res = await fetch(`/api/stocks/${encodeURIComponent(sym)}`);
      if (res.ok) {
        const data = await res.json();
        setName(data.name || "");
      } else {
        setError("未找到该股票");
      }
    } catch {
      setError("搜索失败，请重试");
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!symbol || !name) return;
    setLoading(true);
    try {
      const code = symbol.replace(/\.T$/i, "").slice(0, 4) + ".T";
      await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: code, name, note: note || null,
          targetPrice: targetPrice ? parseFloat(targetPrice) : null,
        }),
      });
      onAdded();
      onClose();
    } catch {
      setError("添加失败，请重试");
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4">
        <h3 className="text-lg font-bold text-slate-900 mb-4">添加股票到自选</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="4位代码（如：7203）"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
            />
            <button
              type="button"
              onClick={handleLookup}
              disabled={loading}
              className="px-4 py-2 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg font-medium transition-colors"
            >
              查询
            </button>
          </div>
          <input
            type="text"
            placeholder="股票名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
          />
          <input
            type="number"
            placeholder="目标价格（选填）"
            value={targetPrice}
            onChange={(e) => setTargetPrice(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
          />
          <textarea
            placeholder="备注（选填）"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-none"
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={loading || !symbol || !name}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 rounded-lg transition-colors disabled:opacity-40"
            >
              添加
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium py-2 rounded-lg transition-colors"
            >
              取消
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function WatchListPage() {
  const { t, lang } = useI18n();
  const [items, setItems] = useState<WatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/watchlist")
      .then((r) => r.json())
      .then((d) => { setItems(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (symbol: string) => {
    setDeleting(symbol);
    await fetch(`/api/watchlist?symbol=${encodeURIComponent(symbol)}`, { method: "DELETE" });
    setDeleting(null);
    load();
  };

  const buyCount   = items.filter((i) => i.score?.recommendation === "STRONG_BUY" || i.score?.recommendation === "BUY").length;
  const watchCount = items.filter((i) => i.score?.recommendation === "WATCH").length;

  return (
    <div className="p-6 max-w-6xl">
      {showAdd && <AddStockModal onClose={() => setShowAdd(false)} onAdded={load} />}

      {/* Merged notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-5 flex items-center justify-between gap-4">
        <span className="text-sm text-blue-700">{t("page.merged_portfolio")}</span>
        <Link href="/portfolio" className="shrink-0 text-xs font-medium text-blue-600 bg-white border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors">
          {t("page.go_portfolio")} →
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("watchlist.title")}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{t("common.ai_score_tab")}</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
        >
          <span>+</span> 添加股票
        </button>
      </div>

      {items.length > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: "自选股数量", value: items.length, cls: "text-slate-900" },
            { label: "买入推荐",   value: buyCount,      cls: "text-red-600" },
            { label: "值得关注",   value: watchCount,    cls: "text-yellow-600" },
            {
              label: "平均AI评分",
              value: items.filter((i) => i.score?.totalScore != null).length > 0
                ? Math.round(
                    items.reduce((sum, i) => sum + (i.score?.totalScore ?? 0), 0) /
                    items.filter((i) => i.score?.totalScore != null).length
                  )
                : "—",
              cls: "text-blue-700",
            },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <div className="text-xs text-slate-500 mb-1">{s.label}</div>
              <div className={`text-2xl font-bold tabular-nums ${s.cls}`}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="text-slate-400 text-sm animate-pulse">加载中...</div>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-16 text-center">
          <div className="text-4xl mb-3">★</div>
          <div className="text-slate-900 font-medium mb-2">{t("watchlist.empty")}</div>
          <p className="text-sm text-slate-500 mb-4">
            {t("common.ai_score_tab")}
          </p>
          <button
            onClick={() => setShowAdd(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
          >
            添加第一只股票
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const s = item.score;
            const rec = REC_CFG[s?.recommendation ?? "HOLD"] ?? REC_CFG.HOLD;
            const currentPrice = s?.latestClose;
            const targetHit =
              item.targetPrice != null && currentPrice != null
                ? currentPrice >= item.targetPrice
                : false;

            return (
              <div
                key={item.symbol}
                className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:border-blue-200 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <Link
                        href={`/stocks/${encodeURIComponent(item.symbol)}`}
                        className="text-[15px] font-bold text-slate-900 hover:text-blue-600 leading-tight"
                      >
                        {getPrimaryName(item, lang)}
                      </Link>
                      {getSecondaryName(item, lang) && (
                        <span className="text-[12px] text-[#94a3b8]">{getSecondaryName(item, lang)}</span>
                      )}
                      <span className="text-[12px] text-[#64748b] font-mono">{item.symbol}</span>
                      {s?.recommendation && (
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${rec.bg} ${rec.text}`}>
                          {t(`rating.${s.recommendation}` as Parameters<typeof t>[0])}
                        </span>
                      )}
                    </div>

                    {item.note && (
                      <p className="text-xs text-slate-500 mb-2">📝 {item.note}</p>
                    )}

                    <div className="flex items-center flex-wrap gap-4 text-xs text-slate-500">
                      {s ? (
                        <>
                          <span className="font-medium text-slate-900 text-sm tabular-nums">
                            {s.latestClose ? `¥${s.latestClose.toLocaleString()}` : "—"}
                          </span>
                          <span className="text-slate-300">|</span>
                          <span>5日: <RetBadge val={s.return5d} /></span>
                          <span>20日: <RetBadge val={s.return20d} /></span>
                          <span>RSI: <b className="text-slate-700">{s.rsi14?.toFixed(1) ?? "—"}</b></span>
                          <span>均线: <b className="text-slate-700">{s.maTrend ?? "—"}</b></span>
                        </>
                      ) : (
                        <span className="text-slate-300">暂无评分数据</span>
                      )}
                      {item.targetPrice != null && (
                        <>
                          <span className="text-slate-300">|</span>
                          <span className={targetHit ? "text-green-600 font-medium" : "text-slate-500"}>
                            目标价: ¥{item.targetPrice.toLocaleString()}
                            {targetHit && " ✓ 已达成"}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    {s?.totalScore != null && (
                      <div className="text-center">
                        <div className={`text-2xl font-bold tabular-nums ${rec.text}`}>
                          {s.totalScore}
                        </div>
                        <div className="text-[10px] text-slate-400">AI综合</div>
                      </div>
                    )}
                    {s && (
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-center">
                        {[
                          { label: "技術", val: s.technicalScore, max: 30, cls: "text-blue-600" },
                          { label: "基本", val: s.fundamentalScore, max: 25, cls: "text-emerald-600" },
                          { label: "資金", val: s.moneyFlowScore, max: 20, cls: "text-violet-600" },
                          { label: "情绪", val: s.newsSentimentScore, max: 15, cls: "text-amber-600" },
                        ].map((d) => (
                          <div key={d.label}>
                            <div className={`text-xs font-bold ${d.cls}`}>{d.val ?? "—"}</div>
                            <div className="text-[10px] text-slate-400">{d.label}/{d.max}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-col gap-2">
                      <Link
                        href={`/stocks/${encodeURIComponent(item.symbol)}`}
                        className="text-xs text-blue-600 hover:underline px-3 py-1.5 border border-blue-200 rounded-lg"
                      >
                        详情 →
                      </Link>
                      <button
                        onClick={() => handleDelete(item.symbol)}
                        disabled={deleting === item.symbol}
                        className="text-xs text-red-400 hover:text-red-600 px-3 py-1.5 border border-red-100 hover:border-red-200 rounded-lg transition-colors disabled:opacity-40"
                      >
                        {deleting === item.symbol ? "..." : "删除"}
                      </button>
                    </div>
                  </div>
                </div>

                {s?.summaryReason && (
                  <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
                    {s.summaryReason}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
