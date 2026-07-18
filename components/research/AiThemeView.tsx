"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import { buildStockUrl } from "@/lib/navigation/back";
import Link from "next/link";
import { getRec, getRecommendationLabel, returnColorClass, fmtPct, finalScoreColor } from "@/lib/rec-config";
import { useI18n } from "@/lib/i18n";
import { getPrimaryName } from "@/lib/company-name";
import { getThemeLabel, getLayerLabel } from "@/lib/i18n/theme-labels";

// ─── Types ────────────────────────────────────────────────────────────────────

type AiThemeStock = {
  symbol: string;
  name: string;
  nameZh: string | null;
  nameEn: string | null;
  market: string | null;
  sector: string | null;
  latestClose: number | null;
  return5d: number | null;
  return20d: number | null;
  adaptiveScore: number | null;
  finalScore: number | null;
  ruleScore: number | null;
  gptScore: number | null;
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
  top3: Array<{ symbol: string; name: string; nameZh: string | null; nameEn: string | null; score: number | null }>;
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
    topStock: { symbol: string; name: string; nameZh: string | null; nameEn: string | null; score: number | null } | null;
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

const HARDWARE_THEMES = new Set(["CHIP_DESIGN", "SEMI_EQUIPMENT", "TEST_EQUIPMENT", "CHIP_MATERIAL", "HBM_PACKAGING", "SENSOR_PRECISION"]);

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
  // P8-DATA-03 新增主题
  AI_STORAGE: "emerald", AI_COOLING: "cyan", AUTO_DRIVE: "pink",
};

const PENDING_REC = { bg: "bg-slate-50", text: "text-slate-400", border: "border-slate-200" };

// P8-DATA-03：AI 关联强度（0-3）← importanceScore（复用既有列，无 schema 改动）
const strengthOf = (importanceScore: number): 0 | 1 | 2 | 3 =>
  importanceScore >= 9 ? 3 : importanceScore >= 7 ? 2 : importanceScore >= 5 ? 1 : 0;
const STRENGTH_BADGE: Record<number, string> = {
  3: "bg-red-100 text-red-700",
  2: "bg-amber-100 text-amber-700",
  1: "bg-slate-100 text-slate-500",
  0: "bg-slate-100 text-slate-400",
};

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
  const { lang, t } = useI18n();
  const rec = getRec(stock.recommendationV2);
  const color = THEME_COLORS[stock.theme] ?? "slate";
  const colors = COLOR_MAP[color] ?? COLOR_MAP.slate;
  const layer = stock.supplyChainLayer;
  const displayScore = stock.finalScore ?? stock.adaptiveScore;
  const hasGpt = stock.finalScore != null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 hover:border-blue-200 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 p-3">
      {/* Header: name + score */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 flex-wrap mb-0.5">
            {stock.isCore && <span className="text-amber-400 text-[10px]">⭐</span>}
            <Link
              href={buildStockUrl(stock.symbol, "ai-theme", "/ai-theme")}
              className="text-[13px] font-bold text-slate-900 hover:text-blue-600 leading-tight"
            >
              {getPrimaryName(stock, lang)}
            </Link>
            <span className="text-[10px] text-slate-400 font-mono">{stock.symbol.replace(".T", "")}</span>
            {stock.highRiskFlag && <span className="text-[10px] text-red-400">⚠</span>}
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {stock.scored ? (
              <span className={`text-[10px] font-semibold px-1 py-0.5 rounded ${rec.bg} ${rec.text}`}>
                {getRecommendationLabel(stock.recommendationV2, lang)}
              </span>
            ) : (
              <span className={`text-[10px] font-semibold px-1 py-0.5 rounded ${PENDING_REC.bg} ${PENDING_REC.text}`}>
                {t("theme.pending_score")}
              </span>
            )}
            {/* P8-DATA-03：主题标签始终展示（不再仅 ALL/HARDWARE 时显示） */}
            <span className={`text-[10px] px-1 py-0.5 rounded border ${colors.chip}`}>
              {getThemeLabel(stock.theme, lang)}
            </span>
            {layer && (
              <span className={`text-[10px] px-1 py-0.5 rounded ${LAYER_BADGE[layer] ?? "bg-slate-100 text-slate-500"}`}>
                {getLayerLabel(layer, lang)}
              </span>
            )}
            {/* 细分类 */}
            {stock.subTheme && (
              <span className="text-[10px] px-1 py-0.5 rounded bg-slate-50 text-slate-500 border border-slate-200">
                {stock.subTheme}
              </span>
            )}
            {/* AI 关联强度 */}
            <span className={`text-[10px] px-1 py-0.5 rounded ${STRENGTH_BADGE[strengthOf(stock.importanceScore)]}`}>
              {t("theme.strength_label")}{strengthOf(stock.importanceScore)}
            </span>
          </div>
        </div>
        <div className="text-right shrink-0">
          {stock.scored ? (
            <>
              <div className={`text-xl font-bold tabular-nums leading-tight ${finalScoreColor(displayScore)}`}>
                {displayScore?.toFixed(0) ?? "—"}
              </div>
              {hasGpt ? (
                <div className="text-[9px] text-slate-400 tabular-nums">
                  R{stock.ruleScore?.toFixed(0)} G{stock.gptScore?.toFixed(0)}
                </div>
              ) : (
                <div className="text-[9px] text-slate-400">{t("score.rule_only")}</div>
              )}
            </>
          ) : (
            <div className="text-[11px] text-slate-400">{t("theme.pending_score")}</div>
          )}
        </div>
      </div>

      {/* Compact metrics: price + returns */}
      {stock.scored ? (
        <div className="flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-100 pt-1.5">
          <div className="flex items-center gap-2">
            {stock.latestClose != null && (
              <span className="text-slate-600 font-medium tabular-nums">¥{stock.latestClose.toLocaleString()}</span>
            )}
            <ReturnBadge v={stock.return5d} />
            <ReturnBadge v={stock.return20d} />
          </div>
          <div className="flex items-center gap-1.5">
            {stock.percentileRank != null && (
              <span>{t("common.percentile_prefix")} {stock.percentileRank.toFixed(1)}%</span>
            )}
            <ImportanceStars score={stock.importanceScore} />
          </div>
        </div>
      ) : (
        <p className="text-[10px] text-slate-400 border-t border-slate-100 pt-1.5">{t("theme.pending_calc")}</p>
      )}

      {/* P8-DATA-03：AI 关联理由（来自 ai_themes.reason，seed 源内可追溯的证据摘要） */}
      {stock.reason && (
        <p className="text-[10px] text-slate-500 mt-1.5 pt-1.5 border-t border-slate-100 line-clamp-2">
          {stock.reason}
        </p>
      )}
    </div>
  );
}

function ThemeCard({
  theme, isActive, onClick,
}: {
  theme: ThemeSummary; isActive: boolean; onClick: () => void;
}) {
  const { lang, t } = useI18n();
  const color = theme.color ?? "slate";
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
          {getThemeLabel(theme.theme, lang)}
        </span>
        <Link
          href={`/ai-theme/${theme.theme.toLowerCase()}`}
          onClick={(e) => e.stopPropagation()}
          className="text-[10px] text-slate-400 hover:text-blue-600 underline-offset-2 hover:underline"
        >
          {t("theme.detail_link")}
        </Link>
      </div>
      <div className="text-[10px] text-slate-400 leading-tight mb-1.5 line-clamp-1">{theme.desc}</div>
      <div className="flex items-end justify-between">
        <div>
          <span className="text-lg font-bold text-slate-800">{theme.avgScore}</span>
          <span className="text-[10px] text-slate-400 ml-1">{t("theme.avg_score_label")}</span>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-orange-600 font-medium">
            {getRecommendationLabel("BUY", lang)} {theme.buyCount}
          </div>
          <div className="text-[10px] text-slate-400">
            {theme.count}{t("theme.unit_stocks")} / ⭐{theme.coreCount}
          </div>
        </div>
      </div>
      {theme.top3.length > 0 && (
        <div className="mt-1.5 pt-1.5 border-t border-slate-100">
          {theme.top3.map((s) => (
            <div key={s.symbol} className="flex items-center justify-between text-[10px]">
              <span className="text-slate-500 truncate max-w-[100px]">{getPrimaryName({ ...s, name: s.name }, lang)}</span>
              <span className="text-slate-400 tabular-nums ml-1">{s.score?.toFixed(0) ?? "—"}</span>
            </div>
          ))}
        </div>
      )}
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

// P8-UI-03：主题研究收敛为 3 子 Tab（主题概览 / 概念股票 / 产业链）。
//   · AI分析 → 并入「主题概览」的 AI Summary 区块（同 /api/ai-theme 派生，零重算）。
//   · 龙头股票 → 并入「概念股票」，复用已有「仅看核心龙头」core 过滤开关。
//   · 相关新闻 → 删除（曾直接复用全局 NewsView，无 theme 过滤 = 100% 重复），待真正 Theme News 再设计。
// 纯展示层重组，未改任何 API / 数据 / 评分 / 过滤逻辑。
// initialSubTab：旧 ?tab=industry-chain/leaders/ai-analysis 深链落到对应子 Tab。
export default function AiThemePage({ initialSubTab }: { initialSubTab?: string } = {}) {
  const { t, lang } = useI18n();
  useScrollRestoration("ai-theme");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<string>(initialSubTab ?? "overview");
  const [activeTab, setActiveTab] = useState<string>("ALL");
  const [sortKey, setSortKey] = useState<string>("finalScore");
  const [layerFilter, setLayerFilter] = useState<string>("");
  const [searchQ, setSearchQ] = useState<string>("");
  const [coreOnly, setCoreOnly] = useState(false);
  const [recFilter, setRecFilter] = useState<string>("");
  // P8-DATA-03：新增「分类(subTheme)」与「AI关联强度」两个过滤维度
  const [subThemeFilter, setSubThemeFilter] = useState<string>("");
  const [strengthFilter, setStrengthFilter] = useState<string>("");

  // 3 子 Tab（在组件内计算以取得 t()）。
  const SUB_TABS = useMemo(() => [
    { key: "overview", label: t("theme.sub.overview") },
    { key: "concept",  label: t("theme.sub.concept") },
    { key: "chain",    label: t("theme.sub.chain") },
  ], [t]);

  // Locale-aware tabs (computed inside component so t() is available)
  const TABS = useMemo(() => [
    { key: "ALL",              label: t("theme.tab_all") },
    { key: "HARDWARE",        label: t("theme.tab_hardware") },
    { key: "SEMI_EQUIPMENT",  label: t("theme.tab_semi_eq") },
    { key: "TEST_EQUIPMENT",  label: t("theme.tab_test_eq") },
    { key: "CHIP_MATERIAL",   label: t("theme.tab_chip_mat") },
    { key: "HBM_PACKAGING",   label: t("theme.tab_hbm") },
    { key: "SERVER_DC",       label: t("theme.tab_server_dc") },
    { key: "ROBOT_AUTO",      label: t("theme.tab_robot") },
    { key: "SOFTWARE_CLOUD",  label: t("theme.tab_sw_cloud") },
    { key: "MEDICAL_LIFE",    label: t("theme.tab_medical") },
    { key: "POWER_INFRA",     label: t("theme.tab_energy") },
  ], [t]);

  const LAYER_OPTIONS = useMemo(() => [
    { key: "", label: t("theme.layer_all") },
    { key: "UPSTREAM",       label: getLayerLabel("UPSTREAM", lang) },
    { key: "MIDSTREAM",      label: getLayerLabel("MIDSTREAM", lang) },
    { key: "DOWNSTREAM",     label: getLayerLabel("DOWNSTREAM", lang) },
    { key: "INFRASTRUCTURE", label: getLayerLabel("INFRASTRUCTURE", lang) },
    { key: "APPLICATION",    label: getLayerLabel("APPLICATION", lang) },
  ], [t, lang]);

  const SORT_OPTIONS = useMemo(() => [
    { key: "finalScore",       label: t("score.final") },
    { key: "adaptiveScore",    label: t("theme.sort_ai_score") },
    { key: "opportunityScore", label: t("theme.sort_opportunity") },
    { key: "importanceScore",  label: t("theme.sort_importance") },
    { key: "percentileRank",   label: t("theme.sort_rank") },
    { key: "dividendScore",    label: t("theme.sort_dividend") },
    { key: "catalystScore",    label: t("theme.sort_catalyst") },
  ], [t]);

  useEffect(() => {
    fetch("/api/ai-theme")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    let stocks = data.stocks;

    if (activeTab === "HARDWARE") {
      stocks = stocks.filter((s) => HARDWARE_THEMES.has(s.theme));
    } else if (activeTab !== "ALL") {
      stocks = stocks.filter((s) => s.theme === activeTab);
    }

    if (layerFilter) stocks = stocks.filter((s) => s.supplyChainLayer === layerFilter);
    if (subThemeFilter) stocks = stocks.filter((s) => s.subTheme === subThemeFilter);
    if (strengthFilter) stocks = stocks.filter((s) => String(strengthOf(s.importanceScore)) === strengthFilter);
    // 概念股票的「仅看核心龙头」= 复用此 core 过滤（原龙头 Tab 已并入）。
    if (coreOnly) stocks = stocks.filter((s) => s.isCore);
    if (recFilter) stocks = stocks.filter((s) => s.recommendationV2 === recFilter || (!s.scored && recFilter === "PENDING"));

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

    if (activeTab === "ALL" || activeTab === "HARDWARE") {
      const best = new Map<string, AiThemeStock>();
      for (const s of stocks) {
        const existing = best.get(s.symbol);
        if (!existing || s.importanceScore > existing.importanceScore) best.set(s.symbol, s);
      }
      stocks = [...best.values()];
    }

    return [...stocks].sort((a, b) => {
      if (!a.scored && b.scored) return 1;
      if (a.scored && !b.scored) return -1;
      switch (sortKey) {
        case "finalScore":       return (b.finalScore ?? b.adaptiveScore ?? 0) - (a.finalScore ?? a.adaptiveScore ?? 0);
        case "adaptiveScore":   return (b.adaptiveScore ?? 0) - (a.adaptiveScore ?? 0);
        case "opportunityScore":return (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0);
        case "importanceScore": return b.importanceScore - a.importanceScore;
        case "percentileRank":  return (a.percentileRank ?? 999) - (b.percentileRank ?? 999);
        case "dividendScore":   return (b.dividendScore ?? 0) - (a.dividendScore ?? 0);
        case "catalystScore":   return (b.catalystScore ?? 0) - (a.catalystScore ?? 0);
        default: return 0;
      }
    });
  }, [data, activeTab, sortKey, layerFilter, coreOnly, recFilter, searchQ, subThemeFilter, strengthFilter]);

  // ── Chrome：头部 + 子 Tab 栏（始终渲染，含加载中/新闻子 Tab）───────────────
  const summary = data?.summary;
  const subtitleDate = summary?.updatedAt
    ? new Date(summary.updatedAt).toLocaleString(
        lang === "zh-CN" ? "zh-CN" : "ja-JP",
        { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }
      )
    : null;
  // 分类数改为动态（随 THEME_ORDER 增减，不再硬编码 14）。
  const themeCount = data?.themes?.length ?? 0;
  const subtitle = summary
    ? lang === "zh-CN"
      ? `${themeCount}个分类 · ${summary.uniqueSymbols}只追踪 · ${summary.coreStocks}个核心标的`
      : lang === "ja-JP"
      ? `${themeCount}分類・${summary.uniqueSymbols}銘柄を追跡・${summary.coreStocks}銘柄が中核`
      : `${themeCount} categories · ${summary.uniqueSymbols} tracked stocks · ${summary.coreStocks} core stocks`
    : "";

  const chrome = (
    <>
      <div className="mb-4">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-2xl">🗾</span>
          <h1 className="text-[28px] md:text-[32px] font-bold text-slate-900 leading-tight">{t("theme.title")}</h1>
          <span className="text-xs font-bold bg-blue-600 text-white px-2.5 py-0.5 rounded-full">v8.0</span>
        </div>
        {subtitle && (
          <p className="text-sm text-slate-500">
            {subtitle}
            {subtitleDate && (
              <span className="ml-2 text-slate-400 text-xs">{t("theme.scored_prefix")} {subtitleDate} JST</span>
            )}
          </p>
        )}
      </div>
      {/* 6 子 Tab 栏 */}
      <div className="flex gap-1.5 overflow-x-auto mb-5 pb-0.5">
        {SUB_TABS.map(({ key, label }) => {
          const on = subTab === key;
          return (
            <button
              key={key}
              onClick={() => setSubTab(key)}
              className={`px-3.5 py-2 rounded-xl text-[13px] whitespace-nowrap transition-colors border ${
                on
                  ? "bg-slate-900 text-white border-slate-900 font-semibold"
                  : "bg-white text-slate-500 border-slate-200 hover:border-slate-300 font-medium"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </>
  );

  const wrap = (inner: ReactNode) => <div className="p-4 md:p-6">{chrome}{inner}</div>;

  if (loading) {
    return wrap(
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400 text-sm animate-pulse">{t("theme.loading")}</div>
      </div>
    );
  }
  if (error || !data || !summary) {
    return wrap(
      <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-red-700 text-sm">
        {t("theme.error_load")}{error ?? "—"}
      </div>
    );
  }

  const { themes, layers } = data;

  // P8-DATA-03：分类(subTheme) 选项随当前主题/层级动态派生（不硬编码）
  const subThemeOptions = [...new Set(
    data.stocks
      .filter((s) => (activeTab === "ALL" || activeTab === "HARDWARE" ? true : s.theme === activeTab))
      .filter((s) => (layerFilter ? s.supplyChainLayer === layerFilter : true))
      .map((s) => s.subTheme)
      .filter((x): x is string => !!x),
  )].sort();

  const tabCounts: Record<string, number> = { ALL: summary.uniqueSymbols };
  let hardwareCount = 0;
  for (const th of themes) {
    tabCounts[th.theme] = th.count;
    if (HARDWARE_THEMES.has(th.theme)) hardwareCount += th.count;
  }
  tabCounts["HARDWARE"] = hardwareCount;

  const showCount =
    lang === "zh-CN"
      ? `显示 ${filtered.length} 只`
      : lang === "ja-JP"
      ? `${filtered.length}銘柄を表示`
      : `Showing ${filtered.length} stocks`;

  const unitStocks = t("theme.unit_stocks");

  // ── ①主题概览：统计 + 产业链层 + 主题卡 ───────────────────────────────────
  const statsRow = (
    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 md:gap-2.5 mb-5">
      <StatCard label={t("theme.stat_tracked")} value={summary.uniqueSymbols} sub={unitStocks} />
      <StatCard label={t("theme.stat_core")} value={summary.coreStocks} sub="⭐ isCore" />
      <StatCard label={t("theme.stat_buy")} value={summary.buyCount} sub="recommendationV2" />
      <StatCard label={t("theme.stat_avg_score")} value={summary.avgScore} sub="adaptiveScore" />
      <StatCard label={t("theme.stat_categories")} value={themes.length} sub={`${themes.length} ${t("theme.sub_categories")}`} />
      <StatCard label={t("theme.stat_layers")} value={layers.filter((l) => l.symbolCount > 0).length} sub={t("theme.active_layers")} />
      <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3">
        <div className="text-sm font-bold text-slate-900 truncate leading-tight">
          {summary.topStock ? getPrimaryName(summary.topStock, lang) : "—"}
        </div>
        <div className="text-xs text-slate-500 mt-0.5">
          {t("theme.stat_top_score")} <span className="font-semibold text-blue-700">{summary.topStock?.score?.toFixed(0) ?? "—"}</span>
        </div>
      </div>
    </div>
  );

  // ④产业链：供应链层级导航（可点击过滤 → 驱动个股网格），产业链功能完整保留于此。
  const layerVisual = (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 mb-5">
      <div className="text-[10px] text-slate-400 font-medium mb-2">{t("theme.chain_title")}</div>
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
              <span className="font-bold">{getLayerLabel(l.layer, lang)}</span>
              <span className="opacity-70">{l.symbolCount}{unitStocks}</span>
            </button>
            {i < layers.length - 1 && <span className="text-slate-300 text-sm">→</span>}
          </div>
        ))}
        {layerFilter && (
          <button onClick={() => setLayerFilter("")} className="text-[10px] text-blue-600 hover:underline ml-1">
            ✕ {t("common.clear_filter")}
          </button>
        )}
      </div>
    </div>
  );

  const themeCardsBlock = (
    <div className="mb-5">
      <div className="text-sm font-semibold text-slate-700 mb-3">{t("theme.categories_overview")}</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-7 gap-2 md:gap-2.5">
        {themes.map((th) => (
          <ThemeCard
            key={th.theme}
            theme={th}
            isActive={activeTab === th.theme}
            onClick={() => { setActiveTab(th.theme); setSubTab("concept"); }}
          />
        ))}
      </div>
    </div>
  );

  // ②龙头 / ③概念 / ④产业链 共用：过滤/排序控制条 + 个股网格。
  const controlsBlock = (
    <div className="space-y-2.5 mb-4">
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 overflow-x-auto">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-3 py-1.5 text-xs rounded-md transition-all font-medium whitespace-nowrap ${
              activeTab === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {label}
            <span className="ml-1 text-[10px] text-slate-400">({tabCounts[key] ?? 0})</span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          placeholder={t("theme.search_placeholder")}
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs w-60 focus:outline-none focus:border-blue-400"
        />
        <select
          value={layerFilter}
          onChange={(e) => setLayerFilter(e.target.value)}
          className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-400"
        >
          {LAYER_OPTIONS.map((o) => (<option key={o.key} value={o.key}>{o.label}</option>))}
        </select>
        {/* P8-DATA-03：分类(subTheme) 过滤 —— 选项随当前主题/层级动态派生 */}
        <select
          value={subThemeFilter}
          onChange={(e) => setSubThemeFilter(e.target.value)}
          className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-400 max-w-[150px]"
        >
          <option value="">{t("theme.subtheme_all")}</option>
          {subThemeOptions.map((o) => (<option key={o} value={o}>{o}</option>))}
        </select>
        {/* P8-DATA-03：AI 关联强度 过滤 */}
        <select
          value={strengthFilter}
          onChange={(e) => setStrengthFilter(e.target.value)}
          className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-400"
        >
          <option value="">{t("theme.strength_all")}</option>
          <option value="3">{t("theme.strength_3")}</option>
          <option value="2">{t("theme.strength_2")}</option>
          <option value="1">{t("theme.strength_1")}</option>
        </select>
        <select
          value={recFilter}
          onChange={(e) => setRecFilter(e.target.value)}
          className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-400"
        >
          <option value="">{t("theme.rec_all")}</option>
          <option value="STRONG_BUY">{getRecommendationLabel("STRONG_BUY", lang)}</option>
          <option value="BUY">{getRecommendationLabel("BUY", lang)}</option>
          <option value="HOLD">{getRecommendationLabel("HOLD", lang)}</option>
          <option value="WATCH">{getRecommendationLabel("WATCH", lang)}</option>
          <option value="AVOID">{getRecommendationLabel("AVOID", lang)}</option>
        </select>
        <button
          onClick={() => setCoreOnly((v) => !v)}
          className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all ${
            coreOnly ? "bg-amber-400 text-white border-amber-400" : "bg-white text-slate-600 border-slate-200 hover:border-amber-300"
          }`}
        >
          ⭐ {t("theme.core_toggle")}
        </button>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-[11px] text-slate-400">{t("theme.sort_label")}</span>
          {SORT_OPTIONS.map((o) => (
            <button
              key={o.key}
              onClick={() => setSortKey(o.key)}
              className={`text-[11px] px-2 py-1 rounded border transition-all ${
                sortKey === o.key ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-500 border-slate-200 hover:border-blue-300"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const gridBlock = (
    <>
      <div className="text-xs text-slate-400 mb-3">
        {showCount}
        {searchQ && <span className="ml-1">（{t("theme.search_label")}{searchQ}）</span>}
        {coreOnly && <span className="ml-1">· {t("theme.core_only_label")}</span>}
        {layerFilter && <span className="ml-1">· {getLayerLabel(layerFilter, lang)}</span>}
      </div>
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">
          {/* 真·无主题数据 → 面向老板的友好提示（不暴露终端命令）；否则=筛选无匹配。 */}
          {data.stocks.length === 0 ? (
            <>
              {t("theme.empty_no_data")}
              {/* seed 命令仅在开发/管理环境显示；生产构建 NODE_ENV=production → 隐藏。 */}
              {process.env.NODE_ENV !== "production" && (
                <div className="mt-2 text-xs text-slate-300">
                  {t("theme.run_cmd")}
                  <code className="bg-slate-100 px-2 py-0.5 rounded text-xs ml-1">npx tsx scripts/seed-ai-themes.ts</code>
                </div>
              )}
            </>
          ) : (
            t("theme.empty_filtered")
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {filtered.map((s) => (
            <StockCard key={`${s.symbol}-${s.theme}`} stock={s} showTheme={activeTab === "ALL" || activeTab === "HARDWARE"} />
          ))}
        </div>
      )}
      {filtered.length > 0 && (
        <div className="mt-6 pt-4 border-t border-slate-200 flex items-center gap-6 text-xs text-slate-400 flex-wrap">
          <span>{showCount}</span>
          <span>{lang === "zh-CN" ? `总记录 ${summary.totalStocks} · 唯一 ${summary.uniqueSymbols}` : lang === "ja-JP" ? `総数 ${summary.totalStocks} · ユニーク ${summary.uniqueSymbols}` : `Total ${summary.totalStocks} · Unique ${summary.uniqueSymbols}`}</span>
          <span>{getRecommendationLabel("BUY", lang)}+ {summary.buyCount} · {t("theme.avg_score_label")} {summary.avgScore}</span>
          <span>{t("theme.stat_core")} {summary.coreStocks}</span>
        </div>
      )}
    </>
  );

  // AI Summary（原「AI分析」子 Tab 并入「主题概览」）：主题级摘要，纯派生自现有
  // /api/ai-theme 字段（推荐理由 / AI评分 / 风险 / 机会 / 一句话总结），零重算、不改 API。
  const aiThemesSorted = [...themes].sort((a, b) => b.avgScore - a.avgScore);
  const aiSummaryBlock = (
    <div className="mb-5">
      <div className="text-sm font-semibold text-slate-700 mb-1">{t("theme.ai.title")}</div>
      <p className="text-xs text-slate-400 mb-4">{t("theme.ai.subtitle")}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {aiThemesSorted.map((th) => {
          const top = data.stocks
            .filter((s) => s.theme === th.theme && s.scored)
            .sort((a, b) => (b.finalScore ?? b.adaptiveScore ?? 0) - (a.finalScore ?? a.adaptiveScore ?? 0))
            .slice(0, 3);
          const colors = COLOR_MAP[th.color] ?? COLOR_MAP.slate;
          return (
            <div key={th.theme} className={`rounded-2xl border ${colors.border} bg-white p-3`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded border ${colors.chip}`}>
                  {getThemeLabel(th.theme, lang)}
                </span>
                <span className="text-[11px] text-slate-400">
                  {t("theme.avg_score_label")} <span className="font-semibold text-slate-700">{th.avgScore}</span>
                  <span className="mx-1">·</span>
                  {getRecommendationLabel("BUY", lang)} <span className="font-semibold text-orange-600">{th.buyCount}</span>
                </span>
              </div>
              {top.length === 0 ? (
                <div className="text-[11px] text-slate-400 py-2">{t("theme.ai.noReason")}</div>
              ) : (
                <div className="space-y-2">
                  {top.map((s) => (
                    <div key={s.symbol} className="border-t border-slate-100 pt-2 first:border-0 first:pt-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {s.isCore && <span className="text-amber-400 text-[10px]">⭐</span>}
                          <Link href={buildStockUrl(s.symbol, "ai-theme", "/ai-theme")} className="text-[12px] font-semibold text-slate-800 hover:text-blue-600 truncate">
                            {getPrimaryName(s, lang)}
                          </Link>
                          <span className="text-[10px] text-slate-400 font-mono">{s.symbol.replace(".T", "")}</span>
                          {s.highRiskFlag && <span className="text-[10px] text-red-400">⚠</span>}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {s.opportunityLabel && <span className="text-[10px] text-violet-600">{s.opportunityLabel}</span>}
                          <span className={`text-sm font-bold tabular-nums ${finalScoreColor(s.finalScore ?? s.adaptiveScore)}`}>
                            {(s.finalScore ?? s.adaptiveScore)?.toFixed(0) ?? "—"}
                          </span>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                        {s.summaryReason ?? s.reason ?? t("theme.ai.noReason")}
                      </p>
                      {s.riskNote && (
                        <p className="text-[10px] text-red-500 mt-0.5 line-clamp-1">⚠ {s.riskNote}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── 按 3 子 Tab 组合内容 ────────────────────────────────────────────────────
  // 概览 = 统计 + 产业链层 + 主题卡 + AI 摘要（含原 AI分析）；概念 = 控制条 + 网格
  //（含「仅看核心龙头」core 开关，原龙头 Tab 并入）；产业链 = 层级可视化 + 网格。
  let body: ReactNode;
  if (subTab === "overview") body = <>{statsRow}{layerVisual}{themeCardsBlock}{aiSummaryBlock}</>;
  else if (subTab === "chain") body = <>{layerVisual}{controlsBlock}{gridBlock}</>;
  else body = <>{controlsBlock}{gridBlock}</>; // concept

  return wrap(body);
}
