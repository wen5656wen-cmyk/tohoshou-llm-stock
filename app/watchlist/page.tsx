"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n/types";
import { getPrimaryName, getSecondaryName } from "@/lib/company-name";
import { getRec, getRecommendationLabel, finalScoreColor, fmtJpy, returnColorClass, fmtPct } from "@/lib/rec-config";
import { StalenessTag } from "@/components/StalenessTag";

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
  adaptiveScore: number | null;
  percentileRank: number | null;
  recommendationV2: string | null;
  starsLabel: string | null;
  summaryReason: string | null;
  finalScore: number;
  gptScore: number | null;
  gptRank: number | null;
  gptRating: string | null;
  effectiveRating: string | null;
  volumeRatio: number | null;
  turnoverRate: number | null;
  week52Pct: number | null;
  computedAt: string | null;
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

// ── Helpers ───────────────────────────────────────────────────────────────────
function maTrendDisplay(trend: string | null): { label: string; cls: string } {
  const map: Record<string, { label: string; cls: string }> = {
    GOLDEN:  { label: "MA↑↑", cls: "text-emerald-600 font-bold" },
    BULLISH: { label: "MA↑",  cls: "text-emerald-500" },
    NEUTRAL: { label: "MA—",  cls: "text-slate-400" },
    BEARISH: { label: "MA↓",  cls: "text-red-400" },
    DEAD:    { label: "MA↓↓", cls: "text-red-600 font-bold" },
  };
  return map[trend ?? ""] ?? { label: "MA—", cls: "text-slate-300" };
}

// ── Add Stock Modal ───────────────────────────────────────────────────────────
function AddStockModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [symbol, setSymbol]           = useState("");
  const [name, setName]               = useState("");
  const [note, setNote]               = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);

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
      setError("查询失败");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!symbol || !name) return;
    setLoading(true);
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: symbol.toUpperCase().includes(".T") ? symbol.toUpperCase() : symbol.toUpperCase() + ".T",
          name, note: note || null,
          targetPrice: targetPrice ? parseFloat(targetPrice) : null,
        }),
      });
      if (!res.ok) throw new Error("添加失败");
      onAdded();
      onClose();
    } catch {
      setError("添加失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-3">
        <h2 className="text-lg font-bold text-slate-900">添加自选股</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text" placeholder="代码，如 4431" value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
            />
            <button type="button" onClick={handleLookup} disabled={loading}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm rounded-lg transition-colors disabled:opacity-40">
              查询
            </button>
          </div>
          <input
            type="text" placeholder="股票名称" value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
          />
          <input
            type="number" placeholder="目标价格（选填）" value={targetPrice}
            onChange={(e) => setTargetPrice(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
          />
          <textarea
            placeholder="备注（选填）" value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-none"
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={loading || !symbol || !name}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 rounded-lg transition-colors disabled:opacity-40">
              添加
            </button>
            <button type="button" onClick={onClose}
              className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium py-2 rounded-lg transition-colors">
              取消
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Compact stock card ────────────────────────────────────────────────────────
function StockCard({
  item, deleting, onDelete, lang,
}: {
  item: WatchItem;
  deleting: string | null;
  onDelete: (sym: string) => void;
  lang: Lang;
}) {
  const s   = item.score;
  const rec = getRec(s?.effectiveRating);
  const ma  = maTrendDisplay(s?.maTrend ?? null);

  const targetHit =
    item.targetPrice != null && s?.latestClose != null
      ? s.latestClose >= item.targetPrice
      : false;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 hover:border-blue-200 hover:shadow-md transition-all duration-200 relative group">
      {/* Action buttons — top right */}
      <div className="absolute top-2 right-2 flex gap-0.5">
        <Link
          href={`/stocks/${encodeURIComponent(item.symbol)}`}
          className="w-7 h-7 flex items-center justify-center text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors text-[14px]"
          title="详情"
        >
          📈
        </Link>
        <button
          onClick={() => onDelete(item.symbol)}
          disabled={deleting === item.symbol}
          className="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-colors text-[14px] disabled:opacity-30"
          title="删除"
        >
          🗑
        </button>
      </div>

      {/* Name + code — one line */}
      <div className="pr-16 mb-1.5">
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className="text-[13px] font-bold text-slate-900 truncate leading-snug">
            {getPrimaryName(item, lang)}
          </span>
          <span className="text-[10px] text-slate-400 font-mono shrink-0">{item.symbol}</span>
        </div>
        {getSecondaryName(item, lang) && (
          <div className="text-[10px] text-slate-400 truncate mt-0.5">{getSecondaryName(item, lang)}</div>
        )}
      </div>

      {/* Score + badge */}
      {s ? (
        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
          <span className={`text-[13px] font-bold tabular-nums ${finalScoreColor(s.finalScore)}`}>
            Score {Math.round(s.finalScore)}
          </span>
          {s.gptRank != null && (
            <span className="text-[9px] text-indigo-500 font-mono">G#{s.gptRank}</span>
          )}
          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${rec.bg} ${rec.text}`}>
            {getRecommendationLabel(s.effectiveRating, lang)}
          </span>
        </div>
      ) : (
        <div className="text-[10px] text-slate-300 mb-1.5">暂无评分</div>
      )}

      {/* Price + 20d change — one line */}
      {s && (
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[13px] font-semibold text-slate-800 tabular-nums">
            {fmtJpy(s.latestClose)}
          </span>
          <span className={`text-[11px] tabular-nums font-medium ${returnColorClass(s.return20d)}`}>
            {fmtPct(s.return20d)}
          </span>
        </div>
      )}

      {/* Indicators — one line */}
      {s && (
        <div className="flex items-center gap-1 text-[11px] mb-1.5 font-mono flex-wrap">
          <span className={s.rsi14 == null ? "text-slate-300" : s.rsi14 >= 70 ? "text-red-500" : s.rsi14 <= 30 ? "text-emerald-500" : "text-slate-600"}>
            RSI {s.rsi14?.toFixed(1) ?? "—"}
          </span>
          <span className="text-slate-200">·</span>
          <span className={ma.cls}>{ma.label}</span>
          <span className="text-slate-200">·</span>
          <span className={
            s.week52Pct == null ? "text-slate-300"
            : s.week52Pct >= 80 ? "text-red-400"
            : s.week52Pct <= 20 ? "text-emerald-500"
            : "text-slate-500"
          }>
            52W {s.week52Pct != null ? `${s.week52Pct}%` : "—"}
          </span>
        </div>
      )}

      {/* Volume footer — gray */}
      {s && (
        <div className="text-[10px] text-slate-300 flex gap-1.5 flex-wrap">
          <span>量比 {s.volumeRatio != null ? `${s.volumeRatio.toFixed(1)}x` : "—"}</span>
          <span>·</span>
          <span>成交占比 {s.turnoverRate != null ? `${s.turnoverRate.toFixed(2)}%` : "—"}</span>
        </div>
      )}

      {/* Target price */}
      {item.targetPrice != null && (
        <div className={`text-[10px] mt-1 ${targetHit ? "text-emerald-600 font-medium" : "text-slate-400"}`}>
          目标价 ¥{item.targetPrice.toLocaleString()}{targetHit && " ✓"}
        </div>
      )}

      {/* Note */}
      {item.note && (
        <div className="text-[10px] text-slate-400 mt-1 truncate">📝 {item.note}</div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function WatchListPage() {
  const { t, lang } = useI18n();
  const [items, setItems]   = useState<WatchItem[]>([]);
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

  const buyCount   = items.filter((i) => ["STRONG_BUY", "BUY"].includes(i.score?.effectiveRating ?? "")).length;
  const watchCount = items.filter((i) => i.score?.effectiveRating === "WATCH").length;
  const scoredItems = items.filter((i) => i.score != null);
  const avgFinalScore = scoredItems.length > 0
    ? Math.round(scoredItems.reduce((sum, i) => sum + (i.score!.finalScore ?? 0), 0) / scoredItems.length)
    : null;

  return (
    <div className="p-6 max-w-7xl">
      {showAdd && <AddStockModal onClose={() => setShowAdd(false)} onAdded={load} />}

      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("watchlist.title")}</h1>
          <p className="text-sm text-slate-500 mt-0.5 flex items-center gap-1.5">
            {t("common.ai_score_tab")}
            {items.length > 0 && items[0].score?.computedAt && (
              <StalenessTag date={items[0].score.computedAt} />
            )}
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
        >
          <span>+</span> 添加股票
        </button>
      </div>

      {/* Stats summary */}
      {items.length > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-5">
          {[
            { label: "自选股数量",   value: items.length,       cls: "text-slate-900" },
            { label: "买入推荐",     value: buyCount,           cls: "text-emerald-700" },
            { label: "值得关注",     value: watchCount,         cls: "text-amber-600" },
            { label: "平均AI综合分", value: avgFinalScore ?? "—", cls: "text-blue-700" },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <div className="text-xs text-slate-500 mb-1">{stat.label}</div>
              <div className={`text-2xl font-bold tabular-nums ${stat.cls}`}>{stat.value}</div>
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
          <p className="text-sm text-slate-500 mb-4">{t("common.ai_score_tab")}</p>
          <button
            onClick={() => setShowAdd(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
          >
            添加第一只股票
          </button>
        </div>
      ) : (
        /* 4-column compact grid */
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          {items.map((item) => (
            <StockCard
              key={item.symbol}
              item={item}
              deleting={deleting}
              onDelete={handleDelete}
              lang={lang}
            />
          ))}
        </div>
      )}
    </div>
  );
}
