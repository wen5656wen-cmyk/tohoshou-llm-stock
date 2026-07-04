"use client";

import Link from "next/link";
import dayjs from "dayjs";
import type { MessageKey } from "@/lib/i18n";

export type NewsItem = {
  id: number; title: string; source: string; publishedAt: string;
  sentiment: string | null; importance: number; category: string | null;
  relatedSymbolConfidence: number; url: string; summary: string | null;
  stock: { symbol: string; name: string } | null;
};
type T = (k: MessageKey) => string;

export const NC = {
  bg: "#FAFAFA", card: "#FFFFFF", line: "#ECECEC", cardSub: "#F7F7F9",
  ink: "#1D1D1F", sub: "#6E6E73", faint: "#86868B",
  blue: "#007AFF", green: "#34C759", amber: "#FF9F0A", red: "#FF3B30", purple: "#5856D6",
};
const sentHex = (s: string | null) => s === "POSITIVE" ? NC.green : s === "NEGATIVE" ? NC.red : NC.faint;
const catKey: Record<string, MessageKey> = { EARNINGS: "news.earnings", GUIDANCE: "news.guidance", DIVIDEND: "news.dividend", BUYBACK: "news.buyback", IR: "news.ir", MARKET: "news.market_cat" };
const realUrl = (u: string) => u.replace(/^tdnet:/, "").replace(/^kabutan:/, "");

// ── Header ────────────────────────────────────────────────────────────────────
export function NewsHeader({ t, query, onQuery, onRefresh, refreshing, updatedAt }: { t: T; query: string; onQuery: (v: string) => void; onRefresh: () => void; refreshing: boolean; updatedAt: string }) {
  return (
    <header className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-8">
      <div>
        <h1 className="text-[28px] font-semibold tracking-[-0.02em]" style={{ color: NC.ink }}>{t("news.title")}</h1>
        <p className="text-[13px] mt-1" style={{ color: NC.faint }}>Yahoo Finance Japan · Kabutan · TDnet</p>
      </div>
      <div className="flex items-center gap-2.5">
        <div className="relative">
          <input value={query} onChange={(e) => onQuery(e.target.value)} placeholder={t("news.search")} className="h-10 w-52 pl-9 pr-3 rounded-full text-[13px] outline-none" style={{ background: NC.card, border: `1px solid ${NC.line}`, color: NC.ink }} />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px]" style={{ color: NC.faint }}>⌕</span>
        </div>
        <button onClick={onRefresh} disabled={refreshing} className="inline-flex items-center justify-center w-10 h-10 rounded-full dash-card dash-int" style={{ color: NC.ink }}>
          <span style={{ display: "inline-block", animation: refreshing ? "dash-spin .8s linear infinite" : "none" }}>↻</span>
        </button>
        {updatedAt && <span className="text-[12px] tabular-nums hidden xl:inline" style={{ color: NC.faint }}>{updatedAt}</span>}
      </div>
    </header>
  );
}

// ── Summary cards ─────────────────────────────────────────────────────────────
export function NewsSummaryCards({ t, news }: { t: T; news: NewsItem[] }) {
  const cnt = (f: (n: NewsItem) => boolean) => news.filter(f).length;
  const cells = [
    { label: t("news.loaded_total"), value: news.length, color: NC.ink },
    { label: t("news.important"), value: cnt((n) => n.importance >= 7), color: NC.amber },
    { label: t("news.positive"), value: cnt((n) => n.sentiment === "POSITIVE"), color: NC.green },
    { label: t("news.negative"), value: cnt((n) => n.sentiment === "NEGATIVE"), color: NC.red },
    { label: "TDnet", value: cnt((n) => n.source === "TDnet"), color: NC.purple },
    { label: "Kabutan", value: cnt((n) => n.source === "Kabutan"), color: NC.blue },
    { label: "Yahoo", value: cnt((n) => /yahoo/i.test(n.source)), color: NC.faint },
  ];
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-4 mb-8">
      {cells.map((c) => (
        <div key={c.label} className="dash-card dash-int p-5">
          <div className="text-[26px] font-semibold tabular-nums tracking-[-0.02em] leading-none" style={{ color: c.color }}>{c.value}</div>
          <div className="text-[12px] font-medium mt-2" style={{ color: NC.sub }}>{c.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Filters (segmented + chips) ───────────────────────────────────────────────
function ChipRow<K extends string>({ items, active, onPick, color }: { items: { key: K; label: string }[]; active: K; onPick: (k: K) => void; color: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => {
        const on = it.key === active;
        return <button key={it.key} onClick={() => onPick(it.key)} className="h-8 px-3.5 rounded-full text-[13px] font-semibold transition-all" style={on ? { background: color, color: "#fff" } : { background: NC.card, border: `1px solid ${NC.line}`, color: NC.sub }}>{it.label}</button>;
      })}
    </div>
  );
}
export type SentimentKey = "ALL" | "POSITIVE" | "NEGATIVE" | "NEUTRAL";
export type CategoryKey = "ALL" | "EARNINGS" | "GUIDANCE" | "DIVIDEND" | "BUYBACK" | "IR" | "MARKET";
export type SourceKey = "ALL" | "STOCK" | "MARKET_ONLY";
export function NewsFilters({ t, sentiment, setSentiment, source, setSource, category, setCategory }: {
  t: T; sentiment: SentimentKey; setSentiment: (k: SentimentKey) => void; source: SourceKey; setSource: (k: SourceKey) => void; category: CategoryKey; setCategory: (k: CategoryKey) => void;
}) {
  return (
    <div className="space-y-3 mb-6">
      <ChipRow color={NC.blue} active={sentiment} onPick={setSentiment} items={[
        { key: "ALL", label: t("news.all") }, { key: "POSITIVE", label: t("news.positive") }, { key: "NEGATIVE", label: t("news.negative") }, { key: "NEUTRAL", label: t("news.neutral") },
      ]} />
      <ChipRow color={NC.green} active={source} onPick={setSource} items={[
        { key: "ALL", label: t("news.all_sources") }, { key: "STOCK", label: t("news.stock_specific") }, { key: "MARKET_ONLY", label: t("news.market_only") },
      ]} />
      <ChipRow color={NC.purple} active={category} onPick={setCategory} items={[
        { key: "ALL", label: t("news.all_categories") }, { key: "EARNINGS", label: t("news.earnings") }, { key: "GUIDANCE", label: t("news.guidance") }, { key: "DIVIDEND", label: t("news.dividend") }, { key: "BUYBACK", label: t("news.buyback") }, { key: "IR", label: t("news.ir") }, { key: "MARKET", label: t("news.market_cat") },
      ]} />
    </div>
  );
}

// ── News row (Apple card) ─────────────────────────────────────────────────────
export function NewsRow({ t, n, top }: { t: T; n: NewsItem; top: boolean }) {
  const sc = sentHex(n.sentiment);
  const important = n.importance >= 7;
  return (
    <div className="group flex items-start gap-4 px-5 py-4 transition-colors hover:bg-[#F7F7F9]" style={top ? undefined : { borderTop: `1px solid ${NC.line}` }}>
      <span className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ background: sc }} />
      <div className="flex-1 min-w-0">
        <a href={realUrl(n.url)} target="_blank" rel="noopener noreferrer" className="text-[15px] font-semibold leading-snug hover:underline block" style={{ color: NC.ink }}>{n.title}</a>
        <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[12px]" style={{ color: NC.faint }}>
          {n.stock && <Link href={`/stocks/${encodeURIComponent(n.stock.symbol)}?source=news`} className="font-semibold hover:underline" style={{ color: NC.blue }}>{n.stock.symbol}</Link>}
          {n.stock?.name && <span className="truncate max-w-[160px]">{n.stock.name}</span>}
          <span>{n.source}</span>
          <span className="tabular-nums">{dayjs(n.publishedAt).format("M/D HH:mm")}</span>
          {n.category && catKey[n.category] && <span className="px-1.5 py-0.5 rounded" style={{ background: `${NC.purple}12`, color: NC.purple }}>{t(catKey[n.category])}</span>}
          {n.relatedSymbolConfidence >= 70 && <span style={{ color: NC.faint }}>· conf {n.relatedSymbolConfidence}</span>}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        {important && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: NC.amber, background: `${NC.amber}14` }}>{t("news.important")}</span>}
        <span className="text-[11px] font-semibold" style={{ color: sc }}>{n.sentiment === "POSITIVE" ? t("news.positive") : n.sentiment === "NEGATIVE" ? t("news.negative") : t("news.neutral")}</span>
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
export function NewsEmptyState({ t, onClear }: { t: T; onClear: () => void }) {
  return (
    <div className="py-16 text-center">
      <div className="text-[14px] mb-4" style={{ color: NC.faint }}>{t("news.no_data")}</div>
      <button onClick={onClear} className="h-9 px-5 rounded-full text-[13px] font-semibold text-white" style={{ background: NC.blue }}>{t("news.clear_filter")}</button>
    </div>
  );
}
