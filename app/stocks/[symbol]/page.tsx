"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import PriceChart from "@/components/PriceChart";

type PricePoint = { date: string; open?: number; high?: number; low?: number; close: number; volume?: number };

type NewsItem = {
  id: number;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  sentiment: string | null;
  summary: string | null;
  category: string | null;
  importance: number;
  relatedSymbolConfidence: number;
};

type Indicators = {
  symbol: string; latestDate: string; latestClose: number;
  ma5: number | null; ma20: number | null; ma60: number | null;
  rsi14: number | null; macd: number | null; macdSignal: number | null; macdHist: number | null;
  return5d: number | null; return20d: number | null; return60d: number | null;
  maTrend: string; rsiSignal: string; macdSignalLabel: string;
};

type Financial = {
  id: number; fiscalYear: number; quarter: number | null;
  revenue: number | null; operatingProfit: number | null; netProfit: number | null;
  eps: number | null; bps: number | null; roe: number | null; equityRatio: number | null;
  reportedAt: string;
};

type V2Score = {
  totalScore: number;
  technicalScore: number;
  fundamentalScore: number;
  moneyFlowScore: number;
  newsSentimentScore: number;
  globalTrendScore: number;
  riskScore: number;
  stars: number;
  starsLabel: string;
  recommendation: "STRONG_BUY" | "BUY" | "HOLD" | "WATCH" | "AVOID";
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  summaryReason: string;
  newsSummary: string;
  technicalReasons: string[];
  fundamentalReasons: string[];
  moneyFlowReasons: string[];
  detail: Record<string, number>;
  // V7.7 pre-computed
  adaptiveScore: number | null;
  stockStyle: string | null;
  scoreSource: string;
  highRiskFlag: boolean;
  percentileRank: number | null;
  marketRank: number | null;
  recommendationV2: string | null;
  recommendationReason: string | null;
  opportunityScore: number | null;
  opportunityRank: number | null;
  opportunityLabel: string | null;
  // V7.8 dividend & short selling
  dividendScore: number | null;
  dividendYield: number | null;
  payoutRatio: number | null;
  dividendAnn: number | null;
  shortSellingRatio: number | null;
  shortSellingDate: string | null;
  shortSellingSource: string | null;
};

type StockData = {
  stock: {
    symbol: string; name: string; nameZh: string | null; nameEn: string | null;
    sector: string | null; industry: string | null; market: string | null;
    price: number; high52w: number | null; low52w: number | null;
  };
  indicators: Indicators;
  series: { last30: PricePoint[]; last250: PricePoint[] };
  financials: Financial[];
  aiScore: V2Score | null;
};

// ── Radar Chart (5-dimension pentagon SVG) ────────────────────────────────

function RadarChart({ tech, fund, money, news, global: glob }: {
  tech: number; fund: number; money: number; news: number; global: number;
}) {
  const cx = 130, cy = 130, r = 90;
  const maxes = [30, 25, 20, 15, 10];
  const scores = [tech, fund, money, news, glob];
  const labels = [
    { text: "技術面", sub: "/30" },
    { text: "基本面", sub: "/25" },
    { text: "資金面", sub: "/20" },
    { text: "情绪",   sub: "/15" },
    { text: "趋势",   sub: "/10" },
  ];
  const n = 5;
  const angle = (i: number) => (2 * Math.PI * i / n) - Math.PI / 2;

  const gridPts = (scale: number) =>
    Array.from({ length: n }, (_, i) => {
      const a = angle(i);
      return `${cx + r * scale * Math.cos(a)},${cy + r * scale * Math.sin(a)}`;
    }).join(" ");

  const dataPts = scores.map((v, i) => {
    const norm = Math.min(1, v / maxes[i]);
    const a = angle(i);
    return `${cx + r * norm * Math.cos(a)},${cy + r * norm * Math.sin(a)}`;
  }).join(" ");

  return (
    <svg width={260} height={260} viewBox="0 0 260 260">
      {/* Grid rings */}
      {[0.25, 0.5, 0.75, 1].map((s, i) => (
        <polygon key={i} points={gridPts(s)} fill="none" stroke="#1e293b" strokeWidth={i === 3 ? 1.5 : 1} />
      ))}
      {/* Axis lines */}
      {Array.from({ length: n }, (_, i) => {
        const a = angle(i);
        return (
          <line key={i} x1={cx} y1={cy}
            x2={cx + r * Math.cos(a)} y2={cy + r * Math.sin(a)}
            stroke="#1e293b" strokeWidth="1"
          />
        );
      })}
      {/* Data polygon */}
      <polygon points={dataPts} fill="rgba(59,130,246,0.2)" stroke="#3b82f6" strokeWidth="2" />
      {/* Data dots */}
      {scores.map((v, i) => {
        const norm = Math.min(1, v / maxes[i]);
        const a = angle(i);
        return (
          <circle key={i}
            cx={cx + r * norm * Math.cos(a)}
            cy={cy + r * norm * Math.sin(a)}
            r={3.5} fill="#3b82f6"
          />
        );
      })}
      {/* Labels */}
      {labels.map((lbl, i) => {
        const a = angle(i);
        const lx = cx + (r + 26) * Math.cos(a);
        const ly = cy + (r + 26) * Math.sin(a);
        return (
          <g key={i}>
            <text x={lx} y={ly - 5} textAnchor="middle" fill="#94a3b8" fontSize="11" fontWeight="600">
              {lbl.text}
            </text>
            <text x={lx} y={ly + 8} textAnchor="middle" fill="#475569" fontSize="9">
              {scores[i]}{lbl.sub}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Score Bar ─────────────────────────────────────────────────────────────

function ScoreBar({ label, score, max, color }: { label: string; score: number; max: number; color: string }) {
  const pct = Math.round((score / max) * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-400 w-16 shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "#1e293b" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs tabular-nums w-10 text-right shrink-0" style={{ color }}>
        {score}/{max}
      </span>
    </div>
  );
}

function ReturnBadge({ label, val }: { label: string; val: number | null }) {
  if (val === null) return null;
  const up = val >= 0;
  return (
    <div className="text-center">
      <div className="text-xs text-slate-500 mb-0.5">{label}</div>
      <div className={`text-sm font-bold tabular-nums ${up ? "text-[#e74c3c]" : "text-[#2980b9]"}`}>
        {up ? "▲" : "▼"}{Math.abs(val).toFixed(2)}%
      </div>
    </div>
  );
}

function MaTrendBadge({ trend }: { trend: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    GOLDEN:  { label: "多头趋势 (MA5>MA20>MA60)", cls: "bg-amber-100 text-amber-700 border border-amber-200" },
    BULLISH: { label: "偏强趋势 (MA5>MA20)",       cls: "bg-green-100 text-green-700 border border-green-200" },
    NEUTRAL: { label: "中性整理",                  cls: "bg-slate-100 text-slate-600 border border-slate-200" },
    BEARISH: { label: "偏弱趋势 (MA5<MA20)",        cls: "bg-blue-100 text-blue-700 border border-blue-200" },
    DEAD:    { label: "空头趋势 (MA5<MA20<MA60)",   cls: "bg-red-100 text-red-600 border border-red-200" },
  };
  const c = cfg[trend] ?? cfg.NEUTRAL;
  return <span className={`text-xs px-2 py-0.5 rounded font-medium ${c.cls}`}>{c.label}</span>;
}

function fmtBillion(v: number | null): string {
  if (v === null) return "—";
  if (Math.abs(v) >= 1e12) return (v / 1e12).toFixed(1) + "兆";
  if (Math.abs(v) >= 1e8)  return (v / 1e8).toFixed(1) + "亿";
  return v.toLocaleString();
}

const REC_CFG: Record<string, { label: string; color: string; glow: string }> = {
  STRONG_BUY: { label: "强烈买入", color: "#10b981", glow: "rgba(16,185,129,0.15)" },
  BUY:        { label: "买入",     color: "#3b82f6", glow: "rgba(59,130,246,0.15)" },
  HOLD:       { label: "持有观察", color: "#f59e0b", glow: "rgba(245,158,11,0.15)" },
  WATCH:      { label: "关注等待", color: "#f59e0b", glow: "rgba(245,158,11,0.10)" },
  AVOID:      { label: "回避",     color: "#ef4444", glow: "rgba(239,68,68,0.15)" },
};

export default function StockDetailPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = use(params);
  const decoded = decodeURIComponent(symbol);

  const [data, setData] = useState<StockData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartPeriod, setChartPeriod] = useState<"30" | "250">("30");
  const [activeTab, setActiveTab] = useState<"overview" | "chart" | "financials" | "indicators" | "ai" | "news">("overview");
  const [watched, setWatched] = useState(false);
  const [watchLoading, setWatchLoading] = useState(false);
  const [newsItems, setNewsItems] = useState<NewsItem[] | null>(null);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsIsGeneral, setNewsIsGeneral] = useState(false);

  useEffect(() => {
    const s = decoded;
    Promise.all([
      fetch(`/api/stocks/${encodeURIComponent(s)}`).then((r) => r.json()),
      fetch(`/api/stocks/${encodeURIComponent(s)}/indicators`).then((r) => r.json()),
      fetch(`/api/financials/${encodeURIComponent(s)}`).then((r) => r.json()),
      fetch(`/api/stocks/${encodeURIComponent(s)}/ai-score`).then((r) => r.json()).catch(() => null),
      fetch("/api/watchlist").then((r) => r.json()).then((list: { symbol: string }[]) => {
        setWatched(list.some((w) => w.symbol === s));
      }).catch(() => null),
    ])
      .then(([stock, indData, fins, aiScoreData]) => {
        if (indData.error) { setError(indData.error); setLoading(false); return; }
        setData({
          stock: {
            symbol: stock.symbol, name: stock.name,
            nameZh: stock.nameZh ?? null, nameEn: stock.nameEn ?? null,
            sector: stock.sector, industry: stock.industry, market: stock.market,
            price: stock.price, high52w: stock.high52w, low52w: stock.low52w,
          },
          indicators: indData.indicators,
          series: indData.series,
          financials: Array.isArray(fins) ? fins : [],
          aiScore: aiScoreData?.totalScore != null ? aiScoreData : null,
        });
        setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [decoded]);

  useEffect(() => {
    if (activeTab !== "news" || newsItems !== null) return;
    setNewsLoading(true);
    fetch(`/api/news?symbol=${encodeURIComponent(decoded)}&limit=20`)
      .then((r) => r.json())
      .then((items: NewsItem[]) => {
        if (Array.isArray(items) && items.length > 0) { setNewsItems(items); return null; }
        setNewsIsGeneral(true);
        return fetch("/api/news?limit=15").then((r) => r.json());
      })
      .then((items: NewsItem[] | null) => {
        if (items) setNewsItems(Array.isArray(items) ? items : []);
      })
      .catch(() => { setNewsItems([]); })
      .finally(() => setNewsLoading(false));
  }, [activeTab, decoded, newsItems]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="text-slate-400 text-sm animate-pulse">加载中...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-red-700">
          数据加载失败：{error}
        </div>
      </div>
    );
  }

  const { stock, indicators: ind, series, financials, aiScore } = data;
  const chartData = chartPeriod === "30" ? series.last30 : series.last250;
  const isUp = (ind.return5d ?? 0) >= 0;

  const toggleWatch = async () => {
    setWatchLoading(true);
    if (watched) {
      await fetch(`/api/watchlist?symbol=${encodeURIComponent(stock.symbol)}`, { method: "DELETE" });
      setWatched(false);
    } else {
      await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: stock.symbol, name: stock.name, sector: stock.sector, market: stock.market }),
      });
      setWatched(true);
    }
    setWatchLoading(false);
  };

  const tabs = [
    { key: "overview",   label: "概览" },
    { key: "chart",      label: "价格图表" },
    { key: "financials", label: `财务 (${financials.length}条)` },
    { key: "indicators", label: "技术指标" },
    { key: "ai",         label: aiScore ? `AI评分 ${aiScore.adaptiveScore?.toFixed(0) ?? aiScore.totalScore}分` : "AI评分" },
    { key: "news",       label: "最新新闻" },
  ] as const;

  return (
    <div className="p-4 md:p-6 max-w-5xl">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <Link href="/stocks" className="text-xs text-slate-400 hover:text-slate-600">← 股票列表</Link>
          <button
            onClick={toggleWatch}
            disabled={watchLoading}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ${
              watched
                ? "bg-yellow-50 border-yellow-200 text-yellow-700 hover:bg-yellow-100"
                : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
            } disabled:opacity-40`}
          >
            <span>{watched ? "★" : "☆"}</span>
            {watched ? "已加自选" : "加入自选"}
          </button>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 style={{ fontSize: 32, fontWeight: 700, color: "#111827", lineHeight: 1.2, letterSpacing: "-0.02em" }}>
              {stock.nameZh || stock.name}
            </h1>
            {stock.nameZh && stock.nameZh !== stock.name && (
              <p style={{ fontSize: 18, fontWeight: 500, color: "#64748b", marginTop: 2 }}>{stock.name}</p>
            )}
            {stock.nameEn && (
              <p style={{ fontSize: 16, fontWeight: 400, color: "#94a3b8", marginTop: 2 }}>{stock.nameEn}</p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <span className="font-mono text-sm font-semibold bg-slate-100 text-slate-500 px-2.5 py-1 rounded-lg tracking-wide">
                {stock.symbol}
              </span>
              {stock.market && (
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{stock.market}</span>
              )}
              {stock.sector && (
                <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">{stock.sector}</span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-slate-900 tabular-nums">
              ¥{ind.latestClose.toLocaleString()}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">{ind.latestDate} 收盘价</div>
            <div className={`text-sm font-medium mt-1 tabular-nums ${isUp ? "text-[#e74c3c]" : "text-[#2980b9]"}`}>
              5日 {isUp ? "▲" : "▼"}{Math.abs(ind.return5d ?? 0).toFixed(2)}%
            </div>
          </div>
        </div>
      </div>

      {/* Large-move notice — shown when 60d adj-return exceeds ±50% */}
      {Math.abs(ind.return60d ?? 0) > 50 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 mb-4 flex items-start gap-2 text-sm text-amber-800">
          <span className="text-lg leading-none mt-0.5">⚠️</span>
          <div>
            <span className="font-semibold">数据提醒</span>
            <span className="ml-1">该股票近期存在大幅价格波动（60日涨跌幅 {(ind.return60d ?? 0).toFixed(1)}%），AI评分已使用复权价格处理，仅供参考。</span>
          </div>
        </div>
      )}

      {/* Return Strip */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-5">
        <div className="flex items-center justify-around">
          <ReturnBadge label="5日涨跌"  val={ind.return5d}  />
          <div className="w-px h-8 bg-slate-100" />
          <ReturnBadge label="20日涨跌" val={ind.return20d} />
          <div className="w-px h-8 bg-slate-100" />
          <ReturnBadge label="60日涨跌" val={ind.return60d} />
          <div className="w-px h-8 bg-slate-100" />
          <div className="text-center">
            <div className="text-xs text-slate-500 mb-0.5">52周最高</div>
            <div className="text-sm font-bold text-slate-900 tabular-nums">
              {stock.high52w ? `¥${stock.high52w.toLocaleString()}` : "—"}
            </div>
          </div>
          <div className="w-px h-8 bg-slate-100" />
          <div className="text-center">
            <div className="text-xs text-slate-500 mb-0.5">52周最低</div>
            <div className="text-sm font-bold text-slate-900 tabular-nums">
              {stock.low52w ? `¥${stock.low52w.toLocaleString()}` : "—"}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-slate-100 rounded-lg p-1 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-3 md:px-4 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Overview ─────────────────────────────────────────────────── */}
      {activeTab === "overview" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">移动均线</h3>
              <div className="space-y-3">
                {[
                  { label: "MA5",  val: ind.ma5 },
                  { label: "MA20", val: ind.ma20 },
                  { label: "MA60", val: ind.ma60 },
                ].map(({ label, val }) => {
                  const diff = val ? ((ind.latestClose - val) / val) * 100 : null;
                  return (
                    <div key={label} className="flex items-center justify-between">
                      <span className="text-xs text-slate-500 w-10">{label}</span>
                      <span className="text-sm tabular-nums font-medium text-slate-800">
                        {val ? `¥${val.toLocaleString()}` : "—"}
                      </span>
                      {diff !== null && (
                        <span className={`text-xs tabular-nums ${diff >= 0 ? "text-[#e74c3c]" : "text-[#2980b9]"}`}>
                          {diff >= 0 ? "▲" : "▼"}{Math.abs(diff).toFixed(1)}%
                        </span>
                      )}
                    </div>
                  );
                })}
                <div className="pt-2 border-t border-slate-100">
                  <MaTrendBadge trend={ind.maTrend} />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">震荡指标</h3>
              <div className="space-y-4">
                <div>
                  <div className="text-xs text-slate-500 mb-1.5">RSI (14日)</div>
                  <div className="flex items-center gap-3">
                    <div className="relative w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`absolute left-0 top-0 h-full rounded-full ${
                          (ind.rsi14 ?? 50) >= 70 ? "bg-red-400" : (ind.rsi14 ?? 50) <= 30 ? "bg-blue-400" : "bg-slate-400"
                        }`}
                        style={{ width: `${Math.min(100, ind.rsi14 ?? 0)}%` }}
                      />
                    </div>
                    <span className="text-sm font-bold tabular-nums text-slate-700">{ind.rsi14?.toFixed(1) ?? "—"}</span>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1.5">MACD</div>
                  <div className="flex items-center gap-2 text-xs tabular-nums text-slate-700">
                    <span>MACD: <b>{ind.macd?.toFixed(2) ?? "—"}</b></span>
                    <span className="text-slate-300">|</span>
                    <span>柱状: <b className={ind.macdHist !== null && ind.macdHist >= 0 ? "text-[#e74c3c]" : "text-[#2980b9]"}>
                      {ind.macdHist?.toFixed(2) ?? "—"}
                    </b></span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-700">价格走势（30日）</h3>
              <button onClick={() => setActiveTab("chart")} className="text-xs text-blue-600 hover:underline">
                完整图表 →
              </button>
            </div>
            <PriceChart data={series.last30} height={160} />
          </div>
        </div>
      )}

      {/* ── Tab: Chart ───────────────────────────────────────────────────── */}
      {activeTab === "chart" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-700">价格图表</h3>
            <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
              {(["30", "250"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setChartPeriod(p)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                    chartPeriod === p ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {p === "30" ? "30日" : "250日（约1年）"}
                </button>
              ))}
            </div>
          </div>
          <PriceChart data={chartData} height={320} showVolume />
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-6 text-xs text-slate-500">
            <span>MA5: <b className="text-slate-700">{ind.ma5 ? `¥${ind.ma5.toLocaleString()}` : "—"}</b></span>
            <span>MA20: <b className="text-slate-700">{ind.ma20 ? `¥${ind.ma20.toLocaleString()}` : "—"}</b></span>
            <span>MA60: <b className="text-slate-700">{ind.ma60 ? `¥${ind.ma60.toLocaleString()}` : "—"}</b></span>
            <span>RSI: <b className="text-slate-700">{ind.rsi14?.toFixed(1) ?? "—"}</b></span>
          </div>
        </div>
      )}

      {/* ── Tab: Financials ──────────────────────────────────────────────── */}
      {activeTab === "financials" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700">财务数据（J-Quants）</h3>
          </div>
          {financials.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">暂无财务数据</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs text-slate-400 border-b border-slate-100 bg-slate-50">
                    <th className="px-5 py-2.5 font-medium">期间</th>
                    <th className="px-3 py-2.5 font-medium text-right">营业收入</th>
                    <th className="px-3 py-2.5 font-medium text-right">营业利润</th>
                    <th className="px-3 py-2.5 font-medium text-right">净利润</th>
                    <th className="px-3 py-2.5 font-medium text-right">EPS</th>
                    <th className="px-3 py-2.5 font-medium text-right">ROE</th>
                    <th className="px-3 py-2.5 font-medium text-right">自有资本比率</th>
                    <th className="px-3 py-2.5 font-medium text-right">发布日</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {[...financials]
                    .sort((a, b) => b.fiscalYear - a.fiscalYear || (b.quarter ?? 99) - (a.quarter ?? 99))
                    .map((f) => (
                      <tr key={f.id} className="hover:bg-slate-50">
                        <td className="px-5 py-2.5 text-sm font-medium text-slate-900">
                          {f.fiscalYear}年{f.quarter ? ` Q${f.quarter}` : " 全年"}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-sm text-slate-700">{fmtBillion(f.revenue)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-sm text-slate-700">{fmtBillion(f.operatingProfit)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-sm text-slate-700">{fmtBillion(f.netProfit)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-sm text-slate-700">
                          {f.eps != null ? `¥${f.eps.toFixed(2)}` : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-sm text-slate-700">
                          {f.roe != null ? `${(f.roe * 100).toFixed(1)}%` : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-sm text-slate-700">
                          {f.equityRatio != null ? `${(f.equityRatio * 100).toFixed(1)}%` : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right text-xs text-slate-400 tabular-nums">
                          {f.reportedAt ? new Date(f.reportedAt).toLocaleDateString("zh-CN") : "—"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Indicators ──────────────────────────────────────────────── */}
      {activeTab === "indicators" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">移动均线</h3>
            <div className="grid grid-cols-3 gap-4 mb-4">
              {[
                { key: "MA5",  val: ind.ma5,  days: 5 },
                { key: "MA20", val: ind.ma20, days: 20 },
                { key: "MA60", val: ind.ma60, days: 60 },
              ].map(({ key, val, days }) => {
                const diff = val ? ((ind.latestClose - val) / val) * 100 : null;
                const up = diff !== null && diff >= 0;
                return (
                  <div key={key} className="bg-slate-50 rounded-lg p-4">
                    <div className="text-xs text-slate-500 mb-1">{key}（{days}日）</div>
                    <div className="text-lg font-bold text-slate-900 tabular-nums">
                      {val ? `¥${val.toLocaleString()}` : "—"}
                    </div>
                    {diff !== null && (
                      <div className={`text-xs font-medium mt-1 tabular-nums ${up ? "text-[#e74c3c]" : "text-[#2980b9]"}`}>
                        vs现价 {up ? "▲" : "▼"}{Math.abs(diff).toFixed(2)}%
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <MaTrendBadge trend={ind.maTrend} />
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">RSI（14日）</h3>
            <div className="flex items-center gap-4">
              <div className="text-3xl font-bold text-slate-900 tabular-nums">
                {ind.rsi14 !== null ? ind.rsi14.toFixed(1) : "—"}
              </div>
              {ind.rsi14 !== null && (
                <div className="flex-1">
                  <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden relative">
                    <div className="absolute left-[30%] top-0 w-0.5 h-full bg-blue-300 opacity-80" />
                    <div className="absolute left-[70%] top-0 w-0.5 h-full bg-red-300 opacity-80" />
                    <div
                      className={`h-full rounded-full ${ind.rsi14 >= 70 ? "bg-red-400" : ind.rsi14 <= 30 ? "bg-blue-400" : "bg-slate-400"}`}
                      style={{ width: `${ind.rsi14}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-slate-400 mt-0.5">
                    <span>0</span><span>30</span><span>50</span><span>70</span><span>100</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">MACD (12-26-9)</h3>
            <div className="grid grid-cols-3 gap-4 mb-3">
              {[
                { label: "MACD线",  val: ind.macd },
                { label: "信号线",  val: ind.macdSignal },
                { label: "柱状图",  val: ind.macdHist },
              ].map(({ label, val }) => {
                const up = val !== null && val >= 0;
                return (
                  <div key={label} className="bg-slate-50 rounded-lg p-3">
                    <div className="text-xs text-slate-500 mb-1">{label}</div>
                    <div className={`text-lg font-bold tabular-nums ${val !== null ? (up ? "text-[#e74c3c]" : "text-[#2980b9]") : "text-slate-300"}`}>
                      {val !== null ? `${val >= 0 ? "+" : ""}${val.toFixed(3)}` : "—"}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="text-xs text-slate-500">
              信号：
              {ind.macdSignalLabel === "BUY"     && <span className="text-red-500 font-medium ml-1">买入信号（MACD &gt; Signal）</span>}
              {ind.macdSignalLabel === "SELL"    && <span className="text-blue-500 font-medium ml-1">卖出信号（MACD &lt; Signal）</span>}
              {ind.macdSignalLabel === "NEUTRAL" && <span className="text-slate-400 ml-1">中性</span>}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">区间涨跌幅</h3>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "5日涨跌",  val: ind.return5d },
                { label: "20日涨跌", val: ind.return20d },
                { label: "60日涨跌", val: ind.return60d },
              ].map(({ label, val }) => {
                const up = val !== null && val >= 0;
                return (
                  <div key={label} className="bg-slate-50 rounded-lg p-4 text-center">
                    <div className="text-xs text-slate-500 mb-1">{label}</div>
                    <div className={`text-2xl font-bold tabular-nums ${val !== null ? (up ? "text-[#e74c3c]" : "text-[#2980b9]") : "text-slate-300"}`}>
                      {val !== null ? `${up ? "▲" : "▼"}${Math.abs(val).toFixed(2)}%` : "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: AI Score V2 — Dark Bloomberg Style ──────────────────────── */}
      {activeTab === "ai" && (
        <div className="space-y-4">
          {!aiScore ? (
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">
              暂无AI评分数据
            </div>
          ) : (() => {
            const rv2 = aiScore.recommendationV2 ?? aiScore.recommendation;
            const rec = REC_CFG[rv2] ?? REC_CFG.HOLD;
            const riskColors = { LOW: "#10b981", MEDIUM: "#f59e0b", HIGH: "#ef4444" };
            const riskLabels = { LOW: "低风险", MEDIUM: "中风险", HIGH: "高风险" };
            const STYLE_LABEL: Record<string, string> = {
              QUALITY_COMPOUNDER: "质优复利", GROWTH_MOMENTUM: "成长动能",
              CYCLICAL_EXPORTER: "出口周期", VALUE_DEFENSIVE: "价值防御",
              DOMESTIC_DEFENSIVE: "内需防御", SPECULATIVE_MOMENTUM: "投机动能",
            };
            const SOURCE_LABEL: Record<string, string> = {
              REAL: "✅ J-Quants 真实数据", PARTIAL: "⚠️ 部分真实", FALLBACK: "🔴 回测估算",
            };

            return (
              <>
                {/* Main Score Card — Dark Bloomberg */}
                <div style={{ background: "#0f172a", borderRadius: 16, padding: "20px 20px", border: "1px solid #1e293b" }}>
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 md:gap-6">
                    {/* Left: Score + V7.7 label */}
                    <div className="shrink-0">
                      <div className="text-xs font-semibold tracking-widest mb-1" style={{ color: "#475569" }}>
                        TOHOSHOU AI V7.7
                      </div>
                      <div style={{ fontSize: 10, color: "#334155", marginBottom: 12 }}>
                        {SOURCE_LABEL[aiScore.scoreSource] ?? aiScore.scoreSource}
                      </div>
                      {/* adaptiveScore (primary) */}
                      <div className="flex items-baseline gap-3 mb-2">
                        <span style={{ fontSize: 72, fontWeight: 900, lineHeight: 1, color: rec.color, fontVariantNumeric: "tabular-nums" }}>
                          {aiScore.adaptiveScore != null ? aiScore.adaptiveScore.toFixed(0) : aiScore.totalScore}
                        </span>
                        <span style={{ fontSize: 24, color: "#475569", fontWeight: 400 }}>/100</span>
                      </div>
                      {/* V7.7 primary rating */}
                      <div className="flex items-center gap-3 mb-3">
                        <span style={{
                          fontSize: 18, fontWeight: 700, color: rec.color,
                          background: rec.glow, padding: "4px 12px", borderRadius: 8,
                          border: `1px solid ${rec.color}40`,
                        }}>
                          {rec.label}
                        </span>
                        {aiScore.highRiskFlag && (
                          <span style={{ fontSize: 11, color: "#ef4444", background: "#ef444420", padding: "2px 8px", borderRadius: 6, border: "1px solid #ef444440" }}>⚠ 高风险</span>
                        )}
                      </div>
                      {/* Rank row */}
                      <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
                        {aiScore.percentileRank != null && (
                          <span style={{ fontSize: 11, color: "#94a3b8" }}>
                            市场排名：前 <strong style={{ color: "#f8fafc" }}>{aiScore.percentileRank.toFixed(1)}%</strong>（第 {aiScore.marketRank} 位）
                          </span>
                        )}
                        {aiScore.opportunityScore != null && (
                          <span style={{ fontSize: 11, color: "#94a3b8" }}>
                            机会分：<strong style={{ color: "#f8fafc" }}>{aiScore.opportunityScore.toFixed(1)}</strong>
                            {aiScore.opportunityLabel && <span style={{ color: "#64748b" }}> · {aiScore.opportunityLabel === "STEADY" ? "稳健" : "高风险"}</span>}
                          </span>
                        )}
                      </div>
                      {aiScore.stockStyle && (
                        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>
                          风格：{STYLE_LABEL[aiScore.stockStyle] ?? aiScore.stockStyle}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <span style={{
                          fontSize: 11, fontWeight: 600, color: riskColors[aiScore.riskLevel],
                          background: `${riskColors[aiScore.riskLevel]}20`,
                          padding: "2px 8px", borderRadius: 6,
                          border: `1px solid ${riskColors[aiScore.riskLevel]}40`,
                        }}>
                          {riskLabels[aiScore.riskLevel]}
                        </span>
                      </div>
                      <p style={{ color: "#64748b", fontSize: 12, marginTop: 12, lineHeight: 1.6, maxWidth: 280 }}>
                        {aiScore.recommendationReason ?? aiScore.summaryReason}
                      </p>
                    </div>

                    {/* Center: Radar — hidden on mobile */}
                    <div className="hidden md:flex flex-1 justify-center">
                      <RadarChart
                        tech={aiScore.technicalScore}
                        fund={aiScore.fundamentalScore}
                        money={aiScore.moneyFlowScore}
                        news={aiScore.newsSentimentScore}
                        global={aiScore.globalTrendScore}
                      />
                    </div>

                    {/* Right: 5 bars */}
                    <div className="md:shrink-0 md:w-56 space-y-3 md:space-y-4 pt-0 md:pt-2">
                      <ScoreBar label="技術面" score={aiScore.technicalScore}     max={30} color="#3b82f6" />
                      <ScoreBar label="基本面" score={aiScore.fundamentalScore}   max={25} color="#10b981" />
                      <ScoreBar label="資金面" score={aiScore.moneyFlowScore}     max={20} color="#8b5cf6" />
                      <ScoreBar label="情绪"   score={aiScore.newsSentimentScore} max={15} color="#f59e0b" />
                      <ScoreBar label="趋势"   score={aiScore.globalTrendScore}   max={10} color="#06b6d4" />
                    </div>
                  </div>
                </div>

                {/* Dimension Analysis Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
                  {[
                    { title: "技術面分析", reasons: aiScore.technicalReasons,    color: "#3b82f6", bg: "bg-blue-50/50",    border: "border-blue-100" },
                    { title: "基本面分析", reasons: aiScore.fundamentalReasons,  color: "#10b981", bg: "bg-emerald-50/50", border: "border-emerald-100" },
                    { title: "资金面分析", reasons: aiScore.moneyFlowReasons,    color: "#8b5cf6", bg: "bg-violet-50/50",  border: "border-violet-100" },
                  ].map((sec) => (
                    <div key={sec.title} className={`rounded-xl border ${sec.border} ${sec.bg} p-4`}>
                      <div className="text-xs font-bold mb-3" style={{ color: sec.color }}>{sec.title}</div>
                      <ul className="space-y-2">
                        {sec.reasons.map((r, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-xs text-slate-600">
                            <span className="shrink-0 mt-0.5" style={{ color: sec.color }}>▸</span>
                            <span>{r}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>

                {/* News Sentiment */}
                {aiScore.newsSummary && (
                  <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4">
                    <div className="text-xs font-bold text-amber-700 mb-2">新闻情绪分析</div>
                    <p className="text-xs text-slate-600">{aiScore.newsSummary}</p>
                  </div>
                )}

                {/* V7.8: Dividend & Short Selling */}
                {(aiScore.dividendYield != null || aiScore.shortSellingRatio != null) && (
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                    <h3 className="text-sm font-semibold text-slate-700 mb-4">配当 · 空売り</h3>
                    <div className="grid grid-cols-2 gap-4">
                      {aiScore.dividendYield != null && (
                        <div className="bg-teal-50 rounded-lg p-3">
                          <div className="text-xs text-teal-600 mb-1">配当利回り</div>
                          <div className="text-xl font-bold text-teal-700">{aiScore.dividendYield.toFixed(2)}%</div>
                          {aiScore.dividendAnn != null && (
                            <div className="text-xs text-teal-500 mt-1">年間 ¥{aiScore.dividendAnn.toFixed(0)}</div>
                          )}
                          {aiScore.payoutRatio != null && (
                            <div className="text-xs text-teal-500">
                              配当性向 {(aiScore.payoutRatio < 1.5 ? aiScore.payoutRatio * 100 : aiScore.payoutRatio).toFixed(0)}%
                            </div>
                          )}
                          {aiScore.dividendScore != null && (
                            <div className="text-xs text-teal-600 mt-1 font-medium">配当スコア {aiScore.dividendScore}/10</div>
                          )}
                        </div>
                      )}
                      {aiScore.shortSellingRatio != null && (
                        <div className="bg-red-50 rounded-lg p-3">
                          <div className="text-xs text-red-600 mb-1">市場空売り比率</div>
                          <div className="text-xl font-bold text-red-700">{aiScore.shortSellingRatio.toFixed(1)}%</div>
                          <div className="text-xs text-red-500 mt-1">
                            {aiScore.shortSellingDate ? `${aiScore.shortSellingDate} JPX` : "JPX日次"}
                          </div>
                          <div className="text-xs text-red-400 mt-1">
                            {aiScore.shortSellingSource === "jpx_real" ? "✓ 実データ" : "⚠ fallback"}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Sub-score Detail Bars */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                  <h3 className="text-sm font-semibold text-slate-700 mb-5">评分细项详情</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                    {[
                      { label: "均线趋势",   key: "maTrendScore",       max: 12, color: "bg-blue-400" },
                      { label: "MACD信号",   key: "macdScore",           max: 8,  color: "bg-blue-400" },
                      { label: "RSI位置",    key: "rsiScore",            max: 6,  color: "bg-blue-400" },
                      { label: "价格动能",   key: "momentumScore",       max: 4,  color: "bg-blue-400" },
                      { label: "营业利润率", key: "opMarginScore",       max: 8,  color: "bg-emerald-400" },
                      { label: "ROE",        key: "roeScore",            max: 7,  color: "bg-emerald-400" },
                      { label: "EPS",        key: "epsScore",            max: 5,  color: "bg-emerald-400" },
                      { label: "自有资本率", key: "equityRatioScore",    max: 5,  color: "bg-emerald-400" },
                      { label: "资金流入",   key: "inflowScore",         max: 8,  color: "bg-violet-400" },
                      { label: "趋势稳定",   key: "stabilityScore",      max: 7,  color: "bg-violet-400" },
                      { label: "空方压力",   key: "shortPressureScore",  max: 5,  color: "bg-violet-400" },
                    ].map((item) => {
                      const score = (aiScore.detail as Record<string, number>)[item.key] ?? 0;
                      const pct = Math.round((score / item.max) * 100);
                      return (
                        <div key={item.key} className="flex items-center gap-3">
                          <span className="text-xs text-slate-500 w-24 shrink-0">{item.label}</span>
                          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${item.color}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs tabular-nums text-slate-600 w-12 text-right shrink-0">
                            {score}/{item.max}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* ── Tab: News ─────────────────────────────────────────────────────── */}
      {activeTab === "news" && (
        <div className="space-y-3">
          {newsLoading && (
            <div className="text-center py-12 text-slate-400 text-sm animate-pulse">新闻加载中...</div>
          )}
          {newsIsGeneral && newsItems && newsItems.length > 0 && (
            <div className="text-xs text-slate-400 bg-slate-50 rounded-lg px-3 py-2 mb-1">
              暂无该股专属新闻，显示最新市场动态
            </div>
          )}
          {!newsLoading && newsItems !== null && newsItems.length === 0 && (
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-8 text-center">
              <div className="text-slate-400 text-sm">暂无新闻数据</div>
            </div>
          )}
          {!newsLoading && newsItems && newsItems.map((item) => {
            const sentimentColor =
              item.sentiment === "POSITIVE" ? "text-green-700 bg-green-50 border-green-100"
              : item.sentiment === "NEGATIVE" ? "text-red-700 bg-red-50 border-red-100"
              : "text-slate-500 bg-slate-50 border-slate-100";
            const sentimentEmoji =
              item.sentiment === "POSITIVE" ? "🟢" : item.sentiment === "NEGATIVE" ? "🔴" : "⚪";

            const categoryLabel: Record<string, string> = {
              EARNINGS: "決算", GUIDANCE: "業績修正", DIVIDEND: "配当",
              BUYBACK: "自己株", IR: "IR開示", MARKET: "市場", OTHER: "",
            };
            const categoryColor: Record<string, string> = {
              EARNINGS: "bg-purple-50 text-purple-700 border-purple-100",
              GUIDANCE: "bg-amber-50 text-amber-700 border-amber-100",
              DIVIDEND: "bg-teal-50 text-teal-700 border-teal-100",
              BUYBACK: "bg-blue-50 text-blue-700 border-blue-100",
              IR: "bg-slate-100 text-slate-600 border-slate-200",
              MARKET: "bg-slate-50 text-slate-400 border-slate-100",
              OTHER: "",
            };

            const cat = item.category ?? "OTHER";
            const catLabel = categoryLabel[cat] ?? "";
            const catColor = categoryColor[cat] ?? "";
            const imp = item.importance ?? 0;
            const impLevel = imp >= 7 ? "HIGH" : imp >= 4 ? "MEDIUM" : "LOW";
            const impDot = impLevel === "HIGH" ? "bg-red-400" : impLevel === "MEDIUM" ? "bg-amber-400" : "bg-slate-300";
            const displayUrl = item.url.startsWith("tdnet:") ? item.url.slice(6) : item.url;

            return (
              <a
                key={item.id}
                href={displayUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-white rounded-xl border border-slate-200 shadow-sm p-4 hover:border-slate-300 hover:shadow transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      {catLabel && (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${catColor}`}>
                          {catLabel}
                        </span>
                      )}
                      {impLevel !== "LOW" && (
                        <span className={`w-1.5 h-1.5 rounded-full ${impDot}`} />
                      )}
                      {item.relatedSymbolConfidence >= 70 && (
                        <span className="text-[10px] text-teal-600 bg-teal-50 border border-teal-100 px-1.5 py-0.5 rounded">個株</span>
                      )}
                    </div>
                    <div className="text-sm font-medium text-slate-900 leading-snug line-clamp-2 mb-2">{item.title}</div>
                    {item.summary && (
                      <div className="text-xs text-slate-500 line-clamp-2 mb-2">{item.summary}</div>
                    )}
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span>{item.source}</span>
                      <span>·</span>
                      <span>{new Date(item.publishedAt).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  </div>
                  <div className={`shrink-0 flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg border ${sentimentColor}`}>
                    <span>{sentimentEmoji}</span>
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
