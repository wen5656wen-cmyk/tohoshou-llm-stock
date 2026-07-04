"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { usePathname } from "next/navigation";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import { buildStockUrl } from "@/lib/navigation/back";
import { useI18n } from "@/lib/i18n";
import { ScreenerHeader, MetricCards, FilterBar } from "@/components/screener/sections";
import { StockCard } from "@/components/screener/StockCard";
import { Pagination, EmptyState, LoadingState } from "@/components/screener/ui";

// ── Types (unchanged data contract) ───────────────────────────────────────────
type Score = {
  symbol: string; name: string; nameZh: string | null; nameEn: string | null; market: string | null;
  sector: string | null;
  latestDate: string | null; latestClose: number | null;
  return5d: number | null; return20d: number | null;
  rsi14: number | null; maTrend: string | null; macdSignalLabel: string | null;
  technicalScore: number | null; fundamentalScore: number | null;
  moneyFlowScore: number | null; newsSentimentScore: number | null; globalTrendScore: number | null;
  totalScore: number | null;
  recommendation: string | null;
  scoreSource: string | null;
  adaptiveScore: number | null;
  stockStyle: string | null;
  highRiskFlag: boolean;
  percentileRank: number | null;
  marketRank: number | null;
  recommendationV2: string | null;
  opportunityScore: number | null;
  opportunityLabel: string | null;
  tradingAction?: string | null;
  positionSizePct?: number | null;
  isWatchlist?: boolean;
};

type Stats = {
  total: number;
  strongBuy: number; buy: number; hold: number; watch: number; avoid: number;
  bullCount: number; bullRate: number;
  marketTemperature: string;
  lastComputedAt: string | null;
};

type ApiResponse = { stats: Stats; scores: Score[] };
type SortKey = "adaptiveScore" | "totalScore" | "opportunityScore" | "percentileRank" | "return20d" | "rsi14" | "gptScore" | "finalScore";
type GptSummary = { symbol: string; ruleScore: number; gptScore: number; finalScore: number; confidence: string; action: string; summaryZh: string; summaryJa: string; summaryEn: string; updatedAt: string };

const PAGE_SIZE = 24;

export function ScreenerBody({ embedded = false }: { embedded?: boolean }) {
  const { t } = useI18n();
  useScrollRestoration("screener");
  const pathname = usePathname();
  const searchRef = useRef<HTMLInputElement>(null);

  // ── State (identical data logic to previous version) ─────────────────────────
  const [data, setData] = useState<ApiResponse | null>(null);
  const [searchData, setSearchData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gptMap, setGptMap] = useState<Map<string, GptSummary>>(new Map());
  const [recFilter, setRecFilter] = useState("ALL");
  const [styleFilter, setStyleFilter] = useState("ALL");
  const [mktFilter, setMktFilter] = useState("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("finalScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [favs, setFavs] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "200", sort: "adaptiveScore" });
    fetch(`/api/screener?${params}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch("/api/gpt-score")
      .then((r) => r.json())
      .then((rows: GptSummary[]) => { if (Array.isArray(rows)) setGptMap(new Map(rows.map((r) => [r.symbol, r]))); })
      .catch(() => {});
  }, []);

  // Debounced search (identical endpoint / behavior)
  useEffect(() => {
    if (!search.trim()) { setSearchData(null); return; }
    setSearchLoading(true);
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q: search.trim(), sort: sortKey });
      fetch(`/api/screener?${params}`)
        .then((r) => r.json())
        .then((d) => { setSearchData(d); setSearchLoading(false); })
        .catch(() => setSearchLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [search, sortKey]);

  // Favorites — display-only, localStorage (no backend / no schema / no business logic)
  useEffect(() => {
    try { const raw = localStorage.getItem("screener_favs"); if (raw) setFavs(new Set(JSON.parse(raw))); } catch {}
  }, []);
  const toggleFav = useCallback((sym: string) => {
    setFavs((prev) => {
      const n = new Set(prev);
      if (n.has(sym)) n.delete(sym); else n.add(sym);
      try { localStorage.setItem("screener_favs", JSON.stringify([...n])); } catch {}
      return n;
    });
  }, []);

  // ⌘K / Ctrl+K focuses search
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); searchRef.current?.focus(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Reset to page 1 when the visible set changes
  useEffect(() => { setPage(1); }, [recFilter, styleFilter, mktFilter, sortKey, sortDir, search]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    const params = new URLSearchParams({ limit: "200", sort: "adaptiveScore" });
    Promise.all([
      fetch(`/api/screener?${params}`).then((r) => r.json()).then((d) => setData(d)),
      fetch("/api/gpt-score").then((r) => r.json()).then((rows: GptSummary[]) => { if (Array.isArray(rows)) setGptMap(new Map(rows.map((r) => [r.symbol, r]))); }).catch(() => {}),
    ]).catch(() => {}).finally(() => setRefreshing(false));
  }, []);

  const setSort = useCallback((key: string) => {
    const k = key as SortKey;
    setSortKey(k);
    setSortDir(k === "percentileRank" ? "asc" : "desc");
  }, []);

  const activeData = (search.trim() && searchData) ? searchData : data;

  // ── Filter + sort (identical algorithm) ──────────────────────────────────────
  const filtered = useMemo(() => {
    if (!activeData) return [] as Score[];
    let f = activeData.scores.filter((s) => {
      const rv2 = s.recommendationV2 ?? "HOLD";
      if (recFilter !== "ALL" && rv2 !== recFilter) return false;
      if (styleFilter !== "ALL" && s.stockStyle !== styleFilter) return false;
      if (mktFilter === "Prime" && !s.market?.includes("プライム")) return false;
      if (mktFilter === "Standard" && !s.market?.includes("スタンダード")) return false;
      if (mktFilter === "Growth" && !s.market?.includes("グロース")) return false;
      return true;
    });
    f = [...f].sort((a, b) => {
      let av: number, bv: number;
      if (sortKey === "percentileRank") {
        av = a.percentileRank ?? 999; bv = b.percentileRank ?? 999;
        return sortDir === "asc" ? av - bv : bv - av;
      }
      if (sortKey === "gptScore") {
        av = gptMap.get(a.symbol)?.gptScore ?? -999; bv = gptMap.get(b.symbol)?.gptScore ?? -999;
        return sortDir === "desc" ? bv - av : av - bv;
      }
      if (sortKey === "finalScore") {
        av = gptMap.get(a.symbol)?.finalScore ?? a.adaptiveScore ?? -999;
        bv = gptMap.get(b.symbol)?.finalScore ?? b.adaptiveScore ?? -999;
        return sortDir === "desc" ? bv - av : av - bv;
      }
      av = (a[sortKey] as number | null) ?? -999;
      bv = (b[sortKey] as number | null) ?? -999;
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return f;
  }, [activeData, recFilter, styleFilter, mktFilter, sortKey, sortDir, gptMap]);

  const buyCount = filtered.filter((s) => s.recommendationV2 === "STRONG_BUY" || s.recommendationV2 === "BUY").length;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const resultText = search.trim()
    ? (searchLoading ? t("screener.searching") : `"${search.trim()}" · ${filtered.length} ${t("screener.result_count")}`)
    : `${filtered.length} ${t("screener.result_count")} · ${t("screener.bull_count")} ${buyCount}`;

  const stats = activeData?.stats;

  const body = (
      <>
        <ScreenerHeader
          title={t("screener.title")}
          subtitle={t("screener.combined_description")}
          search={search}
          onSearch={setSearch}
          searchRef={searchRef}
          onRefresh={refresh}
          refreshing={refreshing}
          lastComputedAt={stats?.lastComputedAt ?? null}
        />

        {error ? (
          <div className="dash-card p-6 text-[14px]" style={{ color: "#FF3B30" }}>{error}</div>
        ) : loading || !stats ? (
          <LoadingState />
        ) : (
          <>
            <MetricCards stats={stats} active={recFilter} onFilter={setRecFilter} />
            <FilterBar
              recFilter={recFilter} setRecFilter={setRecFilter}
              styleFilter={styleFilter} setStyleFilter={setStyleFilter}
              mktFilter={mktFilter} setMktFilter={setMktFilter}
              sortKey={sortKey} setSortKey={setSort}
              resultText={resultText}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-5 dash-in" style={{ animationDelay: "120ms" }}>
              {pageItems.map((s, i) => {
                const gpt = gptMap.get(s.symbol);
                const displayScore = gpt?.finalScore ?? s.adaptiveScore;
                return (
                  <StockCard
                    key={s.symbol}
                    s={s}
                    rank={(page - 1) * PAGE_SIZE + i + 1}
                    displayScore={displayScore}
                    href={buildStockUrl(s.symbol, "screener", pathname)}
                    favorited={favs.has(s.symbol)}
                    onToggleFav={toggleFav}
                  />
                );
              })}
              {filtered.length === 0 && <EmptyState text={searchLoading ? t("screener.searching") : t("screener.no_results")} />}
            </div>

            <Pagination page={page} totalPages={totalPages} onChange={setPage} />

            <div className="mt-8 text-center text-[12px]" style={{ color: "#86868B" }}>{t("screener.hint")}</div>
          </>
        )}
      </>
  );
  if (embedded) return <div className="flex flex-col gap-3">{body}</div>;
  return (
    <div className="min-h-screen dash-font" style={{ background: "#FAFAFA" }}>
      <div className="mx-auto max-w-[1600px] px-6 lg:px-10 xl:px-14 py-8 lg:py-10">{body}</div>
    </div>
  );
}
