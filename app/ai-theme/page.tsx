"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getRec, returnColorClass, fmtPct } from "@/lib/rec-config";
import { useI18n } from "@/lib/i18n";

// ─── Types ────────────────────────────────────────────────────────────────────

type AiThemeStock = {
  symbol: string;
  name: string;
  nameZh: string | null;
  market: string | null;
  sector: string | null;
  latestClose: number | null;
  return5d: number | null;
  return20d: number | null;
  adaptiveScore: number | null;
  totalScore: number | null;
  recommendationV2: string | null;
  starsLabel: string | null;
  summaryReason: string | null;
  percentileRank: number | null;
  marketRank: number | null;
  opportunityScore: number | null;
  opportunityLabel: string | null;
  technicalScore: number | null;
  fundamentalScore: number | null;
  moneyFlowScore: number | null;
  newsSentimentScore: number | null;
  dividendScore: number | null;
  catalystScore: number | null;
  highRiskFlag: boolean;
  scoreSource: string | null;
  // theme metadata
  theme: string;
  subTheme: string | null;
  role: string | null;
  supplyChainLayer: string | null;
  importanceScore: number;
  isCore: boolean;
  reason: string | null;
  riskNote: string | null;
  scored: boolean;
};

type ThemeSummary = {
  theme: string;
  label: string;
  desc: string;
  color: string;
  count: number;
  scoredCount: number;
  coreCount: number;
  avgScore: number;
  buyCount: number;
  top3: Array<{ symbol: string; nameZh: string | null; score: number | null }>;
  layers: Array<string | null>;
};

type LayerSummary = {
  layer: string;
  label: string;
  symbolCount: number;
  avgScore: number;
  buyCount: number;
};

type ApiResponse = {
  stocks: AiThemeStock[];
  themes: ThemeSummary[];
  layers: LayerSummary[];
  summary: {
    totalStocks: number;
    uniqueSymbols: number;
    scoredCount: number;
    coreStocks: number;
    buyCount: number;
    avgScore: number;
    topStock: { symbol: string; nameZh: string | null; score: number | null } | null;
    updatedAt: string | null;
  };
};

// ─── Constants ────────────────────────────────────────────────────────────────

const THEME_ORDER = [
  "CHIP_DESIGN", "SEMI_EQUIPMENT", "TEST_EQUIPMENT", "CHIP_MATERIAL",
  "HBM_PACKAGING", "SENSOR_PRECISION", "SERVER_DC", "NETWORK",
  "ROBOT_AUTO", "SOFTWARE_CLOUD", "INTERNET_PLATFORM", "MEDICAL_LIFE",
  "SECURITY_VISION", "POWER_INFRA",
];

const THEME_LABELS: Record<string, string> = {
  CHIP_DESIGN: "AI芯片设计", SEMI_EQUIPMENT: "半导体设备",
  TEST_EQUIPMENT: "测试设备", CHIP_MATERIAL: "芯片材料",
  HBM_PACKAGING: "HBM封装", SENSOR_PRECISION: "传感器",
  SERVER_DC: "服务器・DC", NETWORK: "网络通信",
  ROBOT_AUTO: "机器人", SOFTWARE_CLOUD: "软件・云",
  INTERNET_PLATFORM: "互联网平台", MEDICAL_LIFE: "医疗AI",
  SECURITY_VISION: "安防・视觉", POWER_INFRA: "能源基础设施",
};

// Tab groups: "ALL" | "HARDWARE" | individual themes | layer filters
const TABS = [
  { key: "ALL",              label: "全部" },
  { key: "HARDWARE",        label: "AI硬件" },
  { key: "SEMI_EQUIPMENT",  label: "半导体设备" },
  { key: "TEST_EQUIPMENT",  label: "测试设备" },
  { key: "CHIP_MATERIAL",   label: "芯片材料" },
  { key: "HBM_PACKAGING",   label: "HBM封装" },
  { key: "SERVER_DC",       label: "数据中心" },
  { key: "ROBOT_AUTO",      label: "机器人" },
  { key: "SOFTWARE_CLOUD",  label: "软件云" },
  { key: "MEDICAL_LIFE",    label: "医疗AI" },
  { key: "POWER_INFRA",     label: "能源基础设施" },
];

const HARDWARE_THEMES = new Set(["CHIP_DESIGN", "SEMI_EQUIPMENT", "TEST_EQUIPMENT", "CHIP_MATERIAL", "HBM_PACKAGING", "SENSOR_PRECISION"]);

const SORT_OPTIONS = [
  { key: "adaptiveScore", label: "AI评分" },
  { key: "opportunityScore", label: "机会分" },
  { key: "importanceScore", label: "重要度" },
  { key: "percentileRank", label: "排名" },
  { key: "dividendScore", label: "股息分" },
  { key: "catalystScore", label: "催化分" },
];

const LAYER_OPTIONS = [
  { key: "", label: "所有层级" },
  { key: "UPSTREAM", label: "上游" },
  { key: "MIDSTREAM", label: "中游" },
  { key: "DOWNSTREAM", label: "下游" },
  { key: "INFRASTRUCTURE", label: "基础设施" },
  { key: "APPLICATION", label: "应用层" },
];

const LAYER_LABELS: Record<string, string> = {
  UPSTREAM: "上游", MIDSTREAM: "中游", DOWNSTREAM: "下游",
  INFRASTRUCTURE: "基础设施", APPLICATION: "应用层",
};

const COLOR_MAP: Record<string, { chip: string; border: string; bg: string }> = {
  indigo:  { chip: "bg-indigo-100 text-indigo-700 border-indigo-200",  border: "border-indigo-200",  bg: "bg-indigo-50" },
  blue:    { chip: "bg-blue-100 text-blue-700 border-blue-200",        border: "border-blue-200",    bg: "bg-blue-50" },
  cyan:    { chip: "bg-cyan-100 text-cyan-700 border-cyan-200",        border: "border-cyan-200",    bg: "bg-cyan-50" },
  teal:    { chip: "bg-teal-100 text-teal-700 border-teal-200",        border: "border-teal-200",    bg: "bg-teal-50" },
  violet:  { chip: "bg-violet-100 text-violet-700 border-violet-200",  border: "border-violet-200",  bg: "bg-violet-50" },
  purple:  { chip: "bg-purple-100 text-purple-700 border-purple-200",  border: "border-purple-200",  bg: "bg-purple-50" },
  amber:   { chip: "bg-amber-100 text-amber-700 border-amber-200",     border: "border-amber-200",   bg: "bg-amber-50" },
  orange:  { chip: "bg-orange-100 text-orange-700 border-orange-200",  border: "border-orange-200",  bg: "bg-orange-50" },
  emerald: { chip: "bg-emerald-100 text-emerald-700 border-emerald-200", border: "border-emerald-200", bg: "bg-emerald-50" },
  sky:     { chip: "bg-sky-100 text-sky-700 border-sky-200",           border: "border-sky-200",     bg: "bg-sky-50" },
  pink:    { chip: "bg-pink-100 text-pink-700 border-pink-200",        border: "border-pink-200",    bg: "bg-pink-50" },
  rose:    { chip: "bg-rose-100 text-rose-700 border-rose-200",        border: "border-rose-200",    bg: "bg-rose-50" },
  red:     { chip: "bg-red-100 text-red-700 border-red-200",           border: "border-red-200",     bg: "bg-red-50" },
  yellow:  { chip: "bg-yellow-100 text-yellow-700 border-yellow-200",  border: "border-yellow-200",  bg: "bg-yellow-50" },
  slate:   { chip: "bg-slate-100 text-slate-600 border-slate-200",     border: "border-slate-200",   bg: "bg-slate-50" },
};

const THEME_COLORS: Record<string, string> = {
  CHIP_DESIGN: "indigo", SEMI_EQUIPMENT: "blue", TEST_EQUIPMENT: "cyan",
  CHIP_MATERIAL: "teal", HBM_PACKAGING: "violet", SENSOR_PRECISION: "purple",
  SERVER_DC: "amber", NETWORK: "orange", ROBOT_AUTO: "emerald",
  SOFTWARE_CLOUD: "sky", INTERNET_PLATFORM: "pink", MEDICAL_LIFE: "rose",
  SECURITY_VISION: "red", POWER_INFRA: "yellow",
};

const PENDING_REC = { label: "Pending", bg: "bg-slate-50", text: "text-slate-400", border: "border-slate-200" };

const LAYER_BADGE: Record<string, string> = {
  UPSTREAM:       "bg-green-100 text-green-700",
  MIDSTREAM:      "bg-blue-100 text-blue-700",
  DOWNSTREAM:     "bg-violet-100 text-violet-700",
  INFRASTRUCTURE: "bg-amber-100 text-amber-700",
  APPLICATION:    "bg-pink-100 text-pink-700",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3">
      <div className="text-xl font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
      {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function ReturnBadge({ v }: { v: number | null }) {
  if (v == null) return <span className="text-slate-300 text-[11px]">—</span>;
  return (
    <span className={`text-[11px] font-medium tabular-nums ${returnColorClass(v)}`}>
      {fmtPct(v, 1)}
    </span>
  );
}

function MiniBar({ val, max, color }: { val: number | null; max: number; color: string }) {
  const pct = val != null ? Math.min(100, Math.round((val / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-1">
      <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden shrink-0">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] tabular-nums text-slate-400 w-4 text-right">{val ?? "—"}</span>
    </div>
  );
}

function ImportanceStars({ score }: { score: number }) {
  const stars = Math.round(score / 2);
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < stars ? "bg-amber-400" : "bg-slate-200"}`} />
      ))}
    </div>
  );
}

function StockCard({ stock, showTheme }: { stock: AiThemeStock; showTheme: boolean }) {
  const rec = stock.scored ? getRec(stock.recommendationV2) : PENDING_REC;
  const color = THEME_COLORS[stock.theme] ?? "slate";
  const colors = COLOR_MAP[color] ?? COLOR_MAP.slate;
  const layer = stock.supplyChainLayer;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all p-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-2.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            {stock.isCore && (
              <span className="text-amber-400 text-[11px]">⭐</span>
            )}
            <Link
              href={`/stocks/${encodeURIComponent(stock.symbol)}`}
              className="text-[14px] font-bold text-slate-900 hover:text-blue-600 leading-tight"
            >
              {stock.nameZh ?? stock.name}
            </Link>
            <span className="text-[11px] text-slate-400 font-mono">{stock.symbol.replace(".T", "")}</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${rec.border} ${rec.text} ${rec.bg}`}>
              {rec.label}
            </span>
            {showTheme && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${colors.chip}`}>
                {THEME_LABELS[stock.theme]}
              </span>
            )}
            {layer && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${LAYER_BADGE[layer] ?? "bg-slate-100 text-slate-500"}`}>
                {LAYER_LABELS[layer]}
              </span>
            )}
            {stock.highRiskFlag && (
              <span className="text-[10px] text-red-500">⚠</span>
            )}
          </div>
        </div>
        <div className="text-right ml-2 shrink-0">
          {stock.scored ? (
            <>
              <div className="text-xl font-bold text-slate-900 tabular-nums leading-tight">
                {stock.adaptiveScore?.toFixed(0) ?? "—"}
              </div>
              <div className="text-[10px] text-slate-400">
                {stock.percentileRank != null ? `前${stock.percentileRank.toFixed(1)}%` : ""}
              </div>
            </>
          ) : (
            <div className="text-[12px] text-slate-400">待评分</div>
          )}
        </div>
      </div>

      {/* Role */}
      {stock.role && (
        <div className="text-[11px] text-slate-500 mb-2 leading-tight line-clamp-1 italic">
          {stock.role}
        </div>
      )}

      {stock.scored ? (
        <>
          {/* Score bars */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 mb-2.5">
            <div>
              <div className="text-[9px] text-slate-400 mb-0.5">技術/30</div>
              <MiniBar val={stock.technicalScore} max={30} color="bg-blue-400" />
            </div>
            <div>
              <div className="text-[9px] text-slate-400 mb-0.5">基本/25</div>
              <MiniBar val={stock.fundamentalScore} max={25} color="bg-emerald-400" />
            </div>
            <div>
              <div className="text-[9px] text-slate-400 mb-0.5">資金/20</div>
              <MiniBar val={stock.moneyFlowScore} max={20} color="bg-violet-400" />
            </div>
            <div>
              <div className="text-[9px] text-slate-400 mb-0.5">感情/15</div>
              <MiniBar val={stock.newsSentimentScore} max={15} color="bg-amber-400" />
            </div>
          </div>

          {/* Metrics row */}
          <div className="flex items-center justify-between text-[10px] text-slate-500 border-t border-slate-100 pt-2">
            <div className="flex items-center gap-3">
              <div>
                <span className="text-slate-400">机会</span>
                <span className="ml-1 font-medium text-slate-700">
                  {stock.opportunityScore?.toFixed(0) ?? "—"}
                </span>
              </div>
              {stock.dividendScore != null && stock.dividendScore > 0 && (
                <div>
                  <span className="text-slate-400">配当</span>
                  <span className="ml-1 font-medium text-emerald-600">{stock.dividendScore}</span>
                </div>
              )}
              {stock.catalystScore != null && stock.catalystScore > 0 && (
                <div>
                  <span className="text-slate-400">催化</span>
                  <span className="ml-1 font-medium text-orange-600">{stock.catalystScore.toFixed(1)}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400">5日</span>
              <ReturnBadge v={stock.return5d} />
              <span className="text-slate-400">20日</span>
              <ReturnBadge v={stock.return20d} />
            </div>
          </div>

          {/* Importance + source */}
          <div className="flex items-center justify-between mt-1.5">
            <ImportanceStars score={stock.importanceScore} />
            {stock.latestClose != null && (
              <span className="text-[11px] text-slate-400 tabular-nums">
                ¥{stock.latestClose.toLocaleString()}
              </span>
            )}
          </div>
        </>
      ) : (
        <p className="text-[11px] text-slate-400 mt-1">
          待 AI 评分计算，下次运行后自动更新。
        </p>
      )}
    </div>
  );
}

function ThemeCard({
  t, isActive, onClick,
}: {
  t: ThemeSummary; isActive: boolean; onClick: () => void;
}) {
  const color = t.color ?? "slate";
  const colors = COLOR_MAP[color] ?? COLOR_MAP.slate;
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-2xl border p-3 transition-all ${
        isActive ? `${colors.border} ${colors.bg} shadow-sm` : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${colors.chip}`}>
          {t.label}
        </span>
        <Link
          href={`/ai-theme/${t.theme.toLowerCase()}`}
          onClick={(e) => e.stopPropagation()}
          className="text-[10px] text-slate-400 hover:text-blue-600 underline-offset-2 hover:underline"
        >
          详情→
        </Link>
      </div>
      <div className="text-[10px] text-slate-400 leading-tight mb-1.5 line-clamp-1">{t.desc}</div>
      <div className="flex items-end justify-between">
        <div>
          <span className="text-lg font-bold text-slate-800">{t.avgScore}</span>
          <span className="text-[10px] text-slate-400 ml-1">均分</span>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-orange-600 font-medium">BUY {t.buyCount}</div>
          <div className="text-[10px] text-slate-400">{t.count}只 / ⭐{t.coreCount}</div>
        </div>
      </div>
      {t.top3.length > 0 && (
        <div className="mt-1.5 pt-1.5 border-t border-slate-100">
          {t.top3.map((s) => (
            <div key={s.symbol} className="flex items-center justify-between text-[10px]">
              <span className="text-slate-500 truncate max-w-[100px]">{s.nameZh ?? s.symbol}</span>
              <span className="text-slate-400 tabular-nums ml-1">{s.score?.toFixed(0) ?? "—"}</span>
            </div>
          ))}
        </div>
      )}
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AiThemePage() {
  const { t } = useI18n();
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("ALL");
  const [sortKey, setSortKey] = useState<string>("adaptiveScore");
  const [layerFilter, setLayerFilter] = useState<string>("");
  const [searchQ, setSearchQ] = useState<string>("");
  const [coreOnly, setCoreOnly] = useState(false);
  const [recFilter, setRecFilter] = useState<string>("");
  const [showThemeCards, setShowThemeCards] = useState(false);

  useEffect(() => {
    fetch("/api/ai-theme")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    let stocks = data.stocks;

    // Tab filter
    if (activeTab === "HARDWARE") {
      stocks = stocks.filter((s) => HARDWARE_THEMES.has(s.theme));
    } else if (activeTab !== "ALL") {
      stocks = stocks.filter((s) => s.theme === activeTab);
    }

    // Layer filter
    if (layerFilter) {
      stocks = stocks.filter((s) => s.supplyChainLayer === layerFilter);
    }

    // Core filter
    if (coreOnly) stocks = stocks.filter((s) => s.isCore);

    // Rec filter
    if (recFilter) stocks = stocks.filter((s) => s.recommendationV2 === recFilter || (!s.scored && recFilter === "PENDING"));

    // Search
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      stocks = stocks.filter((s) =>
        s.symbol.toLowerCase().includes(q) ||
        (s.nameZh ?? "").toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        (s.role ?? "").toLowerCase().includes(q) ||
        (s.subTheme ?? "").toLowerCase().includes(q) ||
        (s.theme ?? "").toLowerCase().includes(q)
      );
    }

    // Dedup: in ALL tab, keep only the highest-importanceScore entry per symbol
    if (activeTab === "ALL" || activeTab === "HARDWARE") {
      const best = new Map<string, AiThemeStock>();
      for (const s of stocks) {
        const existing = best.get(s.symbol);
        if (!existing || s.importanceScore > existing.importanceScore) {
          best.set(s.symbol, s);
        }
      }
      stocks = [...best.values()];
    }

    // Sort
    return [...stocks].sort((a, b) => {
      if (!a.scored && b.scored) return 1;
      if (a.scored && !b.scored) return -1;
      switch (sortKey) {
        case "adaptiveScore":   return (b.adaptiveScore ?? 0) - (a.adaptiveScore ?? 0);
        case "opportunityScore":return (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0);
        case "importanceScore": return b.importanceScore - a.importanceScore;
        case "percentileRank":  return (a.percentileRank ?? 999) - (b.percentileRank ?? 999);
        case "dividendScore":   return (b.dividendScore ?? 0) - (a.dividendScore ?? 0);
        case "catalystScore":   return (b.catalystScore ?? 0) - (a.catalystScore ?? 0);
        default: return 0;
      }
    });
  }, [data, activeTab, sortKey, layerFilter, coreOnly, recFilter, searchQ]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="text-slate-400 text-sm animate-pulse">加载AI产业链地图...</div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-red-700 text-sm">
          加载失败：{error ?? "未知错误"}
        </div>
      </div>
    );
  }

  const { summary, themes, layers } = data;

  const tabCounts: Record<string, number> = { ALL: summary.uniqueSymbols };
  let hardwareCount = 0;
  for (const t of themes) {
    tabCounts[t.theme] = t.count;
    if (HARDWARE_THEMES.has(t.theme)) hardwareCount += t.count;
  }
  tabCounts["HARDWARE"] = hardwareCount;

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-2xl">🗾</span>
          <h1 className="text-[32px] font-bold text-slate-900 leading-tight">{t("theme.title")}</h1>
          <span className="text-xs font-bold bg-blue-600 text-white px-2.5 py-0.5 rounded-full">v8.0</span>
        </div>
        <p className="text-sm text-slate-500">
          14细分主题 · {summary.uniqueSymbols}只追踪 · {summary.coreStocks}个核心标的
          {summary.updatedAt && (
            <span className="ml-2 text-slate-400 text-xs">
              评分：{new Date(summary.updatedAt).toLocaleString("zh-CN", {
                timeZone: "Asia/Tokyo", month: "numeric", day: "numeric",
                hour: "2-digit", minute: "2-digit",
              })} JST
            </span>
          )}
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 md:gap-2.5 mb-5">
        <StatCard label="追踪总数" value={summary.uniqueSymbols} sub="只股票" />
        <StatCard label="核心标的" value={summary.coreStocks} sub="⭐ isCore" />
        <StatCard label="BUY以上" value={summary.buyCount} sub="recommendationV2" />
        <StatCard label="平均评分" value={summary.avgScore} sub="adaptiveScore" />
        <StatCard label="产业链分类" value={14} sub="14细分主题" />
        <StatCard label="供应链层" value={layers.filter((l) => l.symbolCount > 0).length} sub="活跃层级" />
        <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3">
          <div className="text-sm font-bold text-slate-900 truncate leading-tight">
            {summary.topStock?.nameZh ?? summary.topStock?.symbol ?? "—"}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            最高分 <span className="font-semibold text-blue-700">{summary.topStock?.score?.toFixed(0) ?? "—"}</span>
          </div>
        </div>
      </div>

      {/* Supply chain layer visual */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 mb-5">
        <div className="text-[10px] text-slate-400 font-medium mb-2">AI产业链结构</div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {layers.map((l, i) => (
            <div key={l.layer} className="flex items-center gap-1.5">
              <button
                onClick={() => setLayerFilter(layerFilter === l.layer ? "" : l.layer)}
                className={`flex flex-col items-center px-3 py-1.5 rounded-lg border text-[10px] transition-all ${
                  layerFilter === l.layer
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white border-slate-200 text-slate-600 hover:border-blue-300"
                }`}
              >
                <span className="font-bold">{l.label}</span>
                <span className="opacity-70">{l.symbolCount}只</span>
              </button>
              {i < layers.length - 1 && (
                <span className="text-slate-300 text-sm">→</span>
              )}
            </div>
          ))}
          {layerFilter && (
            <button
              onClick={() => setLayerFilter("")}
              className="text-[10px] text-blue-600 hover:underline ml-1"
            >
              ✕ 清除
            </button>
          )}
        </div>
      </div>

      {/* Theme summary cards */}
      <div className="mb-5">
        <button
          onClick={() => setShowThemeCards((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 mb-3 hover:text-blue-600"
        >
          <span>{showThemeCards ? "▾" : "▸"}</span>
          14分类概览
        </button>
        {showThemeCards && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-7 gap-2 md:gap-2.5">
            {themes.map((t) => (
              <ThemeCard
                key={t.theme}
                t={t}
                isActive={activeTab === t.theme}
                onClick={() => setActiveTab(activeTab === t.theme ? "ALL" : t.theme)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Controls: tabs + filters + search */}
      <div className="space-y-2.5 mb-4">
        {/* Tab bar */}
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1 overflow-x-auto">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setActiveTab(key); }}
              className={`px-3 py-1.5 text-xs rounded-md transition-all font-medium whitespace-nowrap ${
                activeTab === key
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {label}
              <span className="ml-1 text-[10px] text-slate-400">({tabCounts[key] ?? 0})</span>
            </button>
          ))}
        </div>

        {/* Filter + sort row */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <input
            type="text"
            placeholder="搜索股票名/symbol/角色/HBM/封装/测试…"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs w-60 focus:outline-none focus:border-blue-400"
          />

          {/* Layer dropdown */}
          <select
            value={layerFilter}
            onChange={(e) => setLayerFilter(e.target.value)}
            className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-400"
          >
            {LAYER_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>

          {/* Rec filter */}
          <select
            value={recFilter}
            onChange={(e) => setRecFilter(e.target.value)}
            className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-400"
          >
            <option value="">所有评级</option>
            <option value="STRONG_BUY">强烈买入</option>
            <option value="BUY">买入</option>
            <option value="HOLD">持有</option>
            <option value="WATCH">关注</option>
            <option value="AVOID">回避</option>
          </select>

          {/* Core only toggle */}
          <button
            onClick={() => setCoreOnly((v) => !v)}
            className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all ${
              coreOnly
                ? "bg-amber-400 text-white border-amber-400"
                : "bg-white text-slate-600 border-slate-200 hover:border-amber-300"
            }`}
          >
            ⭐ 核心标的
          </button>

          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-[11px] text-slate-400">排序：</span>
            {SORT_OPTIONS.map((o) => (
              <button
                key={o.key}
                onClick={() => setSortKey(o.key)}
                className={`text-[11px] px-2 py-1 rounded border transition-all ${
                  sortKey === o.key
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-500 border-slate-200 hover:border-blue-300"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Result count */}
      <div className="text-xs text-slate-400 mb-3">
        显示 <span className="font-semibold text-slate-600">{filtered.length}</span> 只
        {searchQ && <span className="ml-1">（搜索：{searchQ}）</span>}
        {coreOnly && <span className="ml-1">· 仅核心</span>}
        {layerFilter && <span className="ml-1">· {LAYER_LABELS[layerFilter]}</span>}
      </div>

      {/* Stock grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">
          暂无数据。请运行：
          <code className="bg-slate-100 px-2 py-0.5 rounded text-xs ml-1">
            npx tsx scripts/seed-ai-themes.ts
          </code>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {filtered.map((s) => (
            <StockCard key={`${s.symbol}-${s.theme}`} stock={s} showTheme={activeTab === "ALL" || activeTab === "HARDWARE"} />
          ))}
        </div>
      )}

      {/* Footer */}
      {filtered.length > 0 && (
        <div className="mt-6 pt-4 border-t border-slate-200 flex items-center gap-6 text-xs text-slate-400 flex-wrap">
          <span>显示 {filtered.length} 只</span>
          <span>总记录 {summary.totalStocks} · 唯一 {summary.uniqueSymbols}</span>
          <span>BUY以上 {summary.buyCount} · 均分 {summary.avgScore}</span>
          <span>核心标的 {summary.coreStocks}</span>
        </div>
      )}
    </div>
  );
}
