"use client";

import { useI18n } from "@/lib/i18n";
import { getRecommendationLabel } from "@/lib/rec-config";
import { RefreshCw } from "@/components/dashboard/icons";
import { C, Segmented, Dropdown, SearchBar } from "./ui";

const STYLE_KEYS = ["QUALITY_COMPOUNDER", "GROWTH_MOMENTUM", "CYCLICAL_EXPORTER", "VALUE_DEFENSIVE", "DOMESTIC_DEFENSIVE", "SPECULATIVE_MOMENTUM"] as const;

type Stats = { total: number; strongBuy: number; buy: number; hold: number; watch: number; avoid: number };

// ── ScreenerHeader ────────────────────────────────────────────────────────────
export function ScreenerHeader({ title, subtitle, search, onSearch, searchRef, onRefresh, refreshing, lastComputedAt }: {
  title: string; subtitle: string; search: string; onSearch: (v: string) => void;
  searchRef: React.RefObject<HTMLInputElement | null>; onRefresh: () => void; refreshing: boolean; lastComputedAt: string | null;
}) {
  const updated = lastComputedAt ? new Date(lastComputedAt) : null;
  const updatedStr = updated && !Number.isNaN(updated.getTime())
    ? new Date(updated.getTime() + 9 * 3600_000).toISOString().slice(0, 16).replace("T", " ")
    : null;
  return (
    <header className="dash-in relative z-30 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5 mb-8">
      <div>
        <h1 className="text-[32px] lg:text-[36px] font-semibold tracking-[-0.02em] leading-none" style={{ color: C.ink }}>{title}</h1>
        <p className="text-[14px] mt-2.5" style={{ color: C.sub }}>{subtitle}</p>
      </div>
      <div className="flex items-center gap-2.5">
        <SearchBar value={search} onChange={onSearch} inputRef={searchRef} placeholder="搜索代码 / 中文 / 日文 / 英文" />
        <button onClick={onRefresh} aria-label="刷新" title="刷新数据"
          className="inline-flex items-center justify-center w-11 h-11 rounded-full dash-card dash-int" style={{ color: C.sub }}>
          <span style={refreshing ? { animation: "dash-spin 0.8s linear infinite", display: "inline-flex" } : undefined}><RefreshCw size={17} /></span>
        </button>
        {updatedStr && (
          <div className="hidden xl:flex flex-col items-end leading-tight">
            <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: C.faint }}>最后更新</span>
            <span className="text-[12px] font-semibold tabular-nums" style={{ color: C.sub }}>{updatedStr} JST</span>
          </div>
        )}
      </div>
    </header>
  );
}

// ── MetricCards → compact recommendation summary (single card, clickable stats) ─
export function MetricCards({ stats, active, onFilter }: {
  stats: Stats; active: string; onFilter: (key: string) => void;
}) {
  const items = [
    { key: "BUY", value: stats.buy + stats.strongBuy, label: "Buy", color: C.green },
    { key: "HOLD", value: stats.hold, label: "Hold", color: C.sub },
    { key: "WATCH", value: stats.watch, label: "Watch", color: C.amber },
    { key: "AVOID", value: stats.avoid, label: "Avoid", color: C.red },
  ];
  return (
    <div className="dash-card p-4 mb-5 dash-in" style={{ animationDelay: "40ms" }}>
      <div className="flex items-center gap-x-6 gap-y-3 flex-wrap">
        <div className="flex items-baseline gap-2 pr-5" style={{ borderRight: `1px solid ${C.line}` }}>
          <span className="text-[24px] font-semibold tabular-nums tracking-[-0.02em] leading-none" style={{ color: C.ink }}>{stats.total.toLocaleString()}</span>
          <span className="text-[12px] font-medium" style={{ color: C.faint }}>AI 推荐 · 总股票</span>
        </div>
        {items.map((it) => {
          const on = active === it.key || (it.key === "BUY" && active === "STRONG_BUY");
          return (
            <button key={it.key} onClick={() => onFilter(on ? "ALL" : it.key)}
              className="flex items-center gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-[#F4F4F6]"
              style={on ? { background: `${it.color}12` } : undefined}>
              <span className="w-2 h-2 rounded-full" style={{ background: it.color }} />
              <span className="text-[13px] font-medium" style={{ color: C.sub }}>{it.label}</span>
              <span className="text-[16px] font-semibold tabular-nums" style={{ color: on ? it.color : C.ink }}>{it.value.toLocaleString()}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── FilterBar ─────────────────────────────────────────────────────────────────
export function FilterBar({ recFilter, setRecFilter, styleFilter, setStyleFilter, mktFilter, setMktFilter, sortKey, setSortKey, resultText }: {
  recFilter: string; setRecFilter: (v: string) => void;
  styleFilter: string; setStyleFilter: (v: string) => void;
  mktFilter: string; setMktFilter: (v: string) => void;
  sortKey: string; setSortKey: (v: string) => void;
  resultText: string;
}) {
  const { t, lang } = useI18n();

  const recOptions = [
    { value: "ALL", label: t("screener.all"), color: C.ink },
    { value: "STRONG_BUY", label: getRecommendationLabel("STRONG_BUY", lang), color: C.green },
    { value: "BUY", label: getRecommendationLabel("BUY", lang), color: C.blue },
    { value: "WATCH", label: getRecommendationLabel("WATCH", lang), color: C.amber },
    { value: "HOLD", label: getRecommendationLabel("HOLD", lang), color: C.sub },
    { value: "AVOID", label: getRecommendationLabel("AVOID", lang), color: C.red },
  ];
  const styleOptions = [
    { value: "ALL", label: t("screener.all_styles") },
    ...STYLE_KEYS.map((s) => ({ value: s, label: t(`style.short.${s}` as Parameters<typeof t>[0]) })),
  ];
  const mktOptions = [
    { value: "ALL", label: t("screener.all_markets") },
    { value: "Prime", label: t("market.prime") },
    { value: "Standard", label: t("market.standard") },
    { value: "Growth", label: t("market.growth") },
  ];
  const sortOptions = [
    { value: "finalScore", label: "综合评分" },
    { value: "adaptiveScore", label: "AI 评分" },
    { value: "opportunityScore", label: "机会分" },
    { value: "percentileRank", label: "市场百分位" },
    { value: "return20d", label: "20日涨幅" },
    { value: "rsi14", label: "RSI" },
  ];

  return (
    <div className="mb-5 dash-in" style={{ animationDelay: "80ms" }}>
      <div className="flex items-center gap-3 flex-wrap">
        <Segmented options={recOptions} value={recFilter} onChange={setRecFilter} />
        <div className="flex items-center gap-2.5 flex-wrap">
          <Dropdown value={styleFilter} options={styleOptions} onChange={setStyleFilter} width={150} icon />
          <Dropdown value={mktFilter} options={mktOptions} onChange={setMktFilter} width={130} />
          <Dropdown value={sortKey} options={sortOptions} onChange={setSortKey} width={140} />
        </div>
        <span className="text-[13px] font-medium ml-auto" style={{ color: C.faint }}>{resultText}</span>
      </div>
    </div>
  );
}
