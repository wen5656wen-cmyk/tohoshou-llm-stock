"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type ThemeKey =
  | "SEMICONDUCTOR"
  | "ELECTRONICS"
  | "SOFTWARE_AI"
  | "INDUSTRIAL_AUTO"
  | "TELECOM_DC"
  | "TECH_SERVICES";

type StockEntry = {
  symbol: string;
  name: string;
  nameZh: string | null;
  market: string | null;
  latestClose: number | null;
  return5d: number | null;
  return20d: number | null;
  totalScore: number | null;
  recommendation: string | null;
  starsLabel: string | null;
  summaryReason: string | null;
  technicalScore: number | null;
  fundamentalScore: number | null;
  moneyFlowScore: number | null;
  newsSentimentScore: number | null;
  globalTrendScore: number | null;
  theme: ThemeKey;
  scored: boolean;
};

type ThemeSummary = {
  theme: ThemeKey;
  label: string;
  desc: string;
  count: number;
  scoredCount: number;
  avgScore: number;
  buyCount: number;
  topSymbol: string | null;
  topScore: number | null;
  topName: string | null;
};

type ApiResponse = {
  stocks: StockEntry[];
  themeSummary: ThemeSummary[];
  totalCount: number;
  scoredCount: number;
  updatedAt: string | null;
};

const THEME_TABS: Array<{ key: ThemeKey | "ALL"; label: string }> = [
  { key: "ALL",            label: "全部" },
  { key: "SEMICONDUCTOR",  label: "半导体设备" },
  { key: "ELECTRONICS",    label: "电子・传感器" },
  { key: "SOFTWARE_AI",    label: "软件・AI・云" },
  { key: "INDUSTRIAL_AUTO",label: "工业自动化" },
  { key: "TELECOM_DC",     label: "通信・数据中心" },
  { key: "TECH_SERVICES",  label: "科技服务" },
];

const REC_CFG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  STRONG_BUY: { label: "强烈买入", bg: "bg-red-50",    text: "text-red-700",    border: "border-red-200" },
  BUY:        { label: "买入",     bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
  WATCH:      { label: "关注",     bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-200" },
  HOLD:       { label: "持有观察", bg: "bg-slate-50",  text: "text-slate-600",  border: "border-slate-200" },
  AVOID:      { label: "回避",     bg: "bg-blue-50",   text: "text-blue-600",   border: "border-blue-200" },
  PENDING:    { label: "评分待生成", bg: "bg-slate-50", text: "text-slate-400",  border: "border-slate-200" },
};

const THEME_CHIP: Record<string, string> = {
  SEMICONDUCTOR:   "bg-blue-100 text-blue-700 border-blue-200",
  ELECTRONICS:     "bg-violet-100 text-violet-700 border-violet-200",
  SOFTWARE_AI:     "bg-purple-100 text-purple-700 border-purple-200",
  INDUSTRIAL_AUTO: "bg-emerald-100 text-emerald-700 border-emerald-200",
  TELECOM_DC:      "bg-amber-100 text-amber-700 border-amber-200",
  TECH_SERVICES:   "bg-rose-100 text-rose-700 border-rose-200",
};

const THEME_LABELS: Record<string, string> = {
  SEMICONDUCTOR:   "半导体",
  ELECTRONICS:     "电子精密",
  SOFTWARE_AI:     "AI软件",
  INDUSTRIAL_AUTO: "工业自动化",
  TELECOM_DC:      "通信DC",
  TECH_SERVICES:   "科技服务",
};

const SORT_OPTIONS = [
  { key: "score",    label: "综合评分" },
  { key: "return5d", label: "5日涨跌" },
  { key: "return20d",label: "20日涨跌" },
];

function ScoreBar({ score, max, color }: { score: number | null; max: number; color: string }) {
  const pct = score != null ? Math.min(100, Math.round((score / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] tabular-nums text-slate-500 w-7 text-right">
        {score ?? "—"}
      </span>
    </div>
  );
}

function ReturnBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-slate-300 text-xs">—</span>;
  const pos = value >= 0;
  return (
    <span className={`text-xs font-medium tabular-nums ${pos ? "text-red-600" : "text-blue-600"}`}>
      {pos ? "+" : ""}{value.toFixed(1)}%
    </span>
  );
}

function StockCard({ stock, showTheme }: { stock: StockEntry; showTheme: boolean }) {
  const recKey = stock.scored ? (stock.recommendation ?? "HOLD") : "PENDING";
  const rec = REC_CFG[recKey] ?? REC_CFG.HOLD;

  return (
    <div className={`rounded-xl border ${rec.border} ${rec.bg} p-4`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <Link
              href={`/stocks/${encodeURIComponent(stock.symbol)}`}
              className="text-[14px] font-bold text-slate-900 hover:text-blue-600 leading-tight"
            >
              {stock.nameZh || stock.name}
            </Link>
            <span className="text-[11px] text-slate-400 font-mono">{stock.symbol}</span>
            {showTheme && (
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${THEME_CHIP[stock.theme]}`}>
                {THEME_LABELS[stock.theme]}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded border ${rec.border} ${rec.text} ${rec.bg}`}>
              {rec.label}
            </span>
            {stock.scored && stock.starsLabel && (
              <span className="text-[11px] text-slate-400">{stock.starsLabel}</span>
            )}
          </div>
        </div>
        <div className="text-right ml-3 shrink-0">
          {stock.scored ? (
            <>
              <div className="text-xl font-bold text-slate-900 tabular-nums">
                {stock.totalScore}
                <span className="text-[11px] text-slate-400 font-normal"> pt</span>
              </div>
              {stock.latestClose != null && (
                <div className="text-[12px] text-slate-500 tabular-nums">
                  ¥{stock.latestClose.toLocaleString()}
                </div>
              )}
            </>
          ) : (
            <div className="text-[12px] text-slate-400">评分待生成</div>
          )}
        </div>
      </div>

      {stock.scored ? (
        <>
          <div className="grid grid-cols-2 gap-x-5 gap-y-1.5 mb-3">
            <div>
              <div className="text-[10px] text-slate-400 mb-0.5">技術面 /30</div>
              <ScoreBar score={stock.technicalScore} max={30} color="bg-blue-400" />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 mb-0.5">基本面 /25</div>
              <ScoreBar score={stock.fundamentalScore} max={25} color="bg-emerald-400" />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 mb-0.5">資金面 /20</div>
              <ScoreBar score={stock.moneyFlowScore} max={20} color="bg-violet-400" />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 mb-0.5">情绪面 /15</div>
              <ScoreBar score={stock.newsSentimentScore} max={15} color="bg-amber-400" />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 mb-0.5">全球 /10</div>
              <ScoreBar score={stock.globalTrendScore} max={10} color="bg-cyan-400" />
            </div>
            <div className="flex items-center gap-4 pt-0.5">
              <div className="text-center">
                <div className="text-[10px] text-slate-400">5日</div>
                <ReturnBadge value={stock.return5d} />
              </div>
              <div className="text-center">
                <div className="text-[10px] text-slate-400">20日</div>
                <ReturnBadge value={stock.return20d} />
              </div>
            </div>
          </div>
          {stock.summaryReason && (
            <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2">
              {stock.summaryReason}
            </p>
          )}
        </>
      ) : (
        <p className="text-[11px] text-slate-400">
          暂无价格数据，下次 AI 评分计算后自动更新。
        </p>
      )}
    </div>
  );
}

export default function AiThemePage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ThemeKey | "ALL">("ALL");
  const [sortKey, setSortKey] = useState<string>("score");

  useEffect(() => {
    fetch("/api/ai-theme")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="text-slate-400 text-sm animate-pulse">加载科技股数据...</div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-red-700 text-sm">
          加载失败：{error}
        </div>
      </div>
    );
  }

  const { stocks, themeSummary, totalCount, scoredCount, updatedAt } = data;

  const filtered = activeTab === "ALL" ? stocks : stocks.filter((s) => s.theme === activeTab);
  const sorted = [...filtered].sort((a, b) => {
    // Unscored always last
    if (!a.scored && b.scored) return 1;
    if (a.scored && !b.scored) return -1;
    if (!a.scored && !b.scored) return 0;
    if (sortKey === "score") return (b.totalScore ?? 0) - (a.totalScore ?? 0);
    if (sortKey === "return5d") return (b.return5d ?? -99) - (a.return5d ?? -99);
    if (sortKey === "return20d") return (b.return20d ?? -99) - (a.return20d ?? -99);
    return 0;
  });

  const scoredStocks = stocks.filter((s) => s.scored);
  const totalBuy = scoredStocks.filter(
    (s) => s.recommendation === "STRONG_BUY" || s.recommendation === "BUY"
  ).length;
  const avgScore = scoredStocks.length
    ? Math.round(scoredStocks.reduce((acc, s) => acc + (s.totalScore ?? 0), 0) / scoredStocks.length)
    : 0;
  const topStock = [...scoredStocks].sort((a, b) => (b.totalScore ?? 0) - (a.totalScore ?? 0))[0];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-2xl">⚡</span>
          <h1 className="text-xl font-bold text-slate-900">日本科技股・AI产业链</h1>
          <span className="text-sm font-medium bg-blue-600 text-white px-2.5 py-0.5 rounded-full">
            科技主题
          </span>
        </div>
        <p className="text-sm text-slate-500">
          日本核心科技股 AI 综合评分 · {totalCount} 只追踪
          {updatedAt && (
            <span className="ml-2 text-slate-400">
              评分更新于{" "}
              {new Date(updatedAt).toLocaleString("zh-CN", {
                timeZone: "Asia/Tokyo",
                hour12: false,
                month: "numeric",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })} JST
            </span>
          )}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-2xl font-bold text-slate-900">{totalCount}</div>
          <div className="text-xs text-slate-500 mt-0.5">科技股总数</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-2xl font-bold text-slate-700">{scoredCount}</div>
          <div className="text-xs text-slate-500 mt-0.5">
            已评分{totalCount - scoredCount > 0 && (
              <span className="ml-1 text-slate-400">({totalCount - scoredCount} 待生成)</span>
            )}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-2xl font-bold text-slate-700">{avgScore}</div>
          <div className="text-xs text-slate-500 mt-0.5">平均评分</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-2xl font-bold text-orange-600">{totalBuy}</div>
          <div className="text-xs text-slate-500 mt-0.5">BUY 以上</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-sm font-bold text-slate-900 truncate leading-tight">
            {topStock?.nameZh ?? topStock?.name ?? "—"}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            最高分 <span className="font-semibold text-slate-700">{topStock?.totalScore ?? "—"} pt</span>
          </div>
        </div>
      </div>

      {/* Theme summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {themeSummary.map((t) => (
          <button
            key={t.theme}
            onClick={() => setActiveTab(t.theme)}
            className={`text-left rounded-xl border p-3.5 transition-all ${
              activeTab === t.theme
                ? "border-blue-400 bg-blue-50 shadow-sm"
                : "border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/30"
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className={`text-xs font-bold px-2 py-0.5 rounded border ${THEME_CHIP[t.theme]}`}>
                {t.label}
              </span>
              <span className="text-[11px] text-slate-400">{t.count} 只</span>
            </div>
            <div className="text-[11px] text-slate-400 mb-2 leading-tight">{t.desc}</div>
            <div className="flex items-end justify-between">
              <div>
                <span className="text-xl font-bold text-slate-800">{t.avgScore}</span>
                <span className="text-xs text-slate-400 ml-1">均分</span>
              </div>
              <div className="text-right">
                {t.scoredCount < t.count && (
                  <div className="text-[10px] text-slate-400">{t.scoredCount}/{t.count} 已评</div>
                )}
                <div className="text-[11px] text-orange-600">BUY {t.buyCount}</div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Tab bar + sort */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1 flex-wrap">
          {THEME_TABS.map(({ key, label }) => {
            const count =
              key === "ALL"
                ? stocks.length
                : stocks.filter((s) => s.theme === key).length;
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`px-3 py-1.5 text-sm rounded-md transition-all font-medium whitespace-nowrap ${
                  activeTab === key
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {label}
                <span className="ml-1 text-[11px] text-slate-400">({count})</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">排序：</span>
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setSortKey(opt.key)}
              className={`text-xs px-2.5 py-1 rounded-md border transition-all ${
                sortKey === opt.key
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stock cards grid */}
      {sorted.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">
          暂无数据，请运行：
          <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs ml-1">
            npx tsx scripts/seed-ai-themes.ts
          </code>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {sorted.map((stock) => (
            <StockCard key={stock.symbol} stock={stock} showTheme={activeTab === "ALL"} />
          ))}
        </div>
      )}

      {/* Footer */}
      {sorted.length > 0 && (
        <div className="mt-6 pt-4 border-t border-slate-200 flex items-center gap-6 text-xs text-slate-400">
          <span>显示 {sorted.length} 只</span>
          <span>已评分 {scoredCount} · 待生成 {totalCount - scoredCount}</span>
          <span>BUY以上 {totalBuy} · 均分 {avgScore} pt</span>
        </div>
      )}
    </div>
  );
}
