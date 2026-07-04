"use client";

// ── News Intelligence (AI News Center) ────────────────────────────────────────
// Display-only. Reads /api/news (read-only). No sync / write / logic mutation.

import { useEffect, useState, useCallback, useMemo } from "react";
import { useI18n } from "@/lib/i18n";
import {
  NC, type NewsItem, type SentimentKey, type CategoryKey, type SourceKey,
  NewsHeader, NewsSummaryCards, NewsFilters, NewsRow, NewsEmptyState,
} from "@/components/news/parts";

export default function NewsPage() {
  const { t } = useI18n();
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState("");
  const [query, setQuery] = useState("");
  const [sentiment, setSentiment] = useState<SentimentKey>("ALL");
  const [category, setCategory] = useState<CategoryKey>("ALL");
  const [source, setSource] = useState<SourceKey>("ALL");

  const fetchNews = useCallback(async () => {
    setRefreshing(true);
    const params = new URLSearchParams({ limit: "100" });
    if (sentiment !== "ALL") params.set("sentiment", sentiment);
    if (category !== "ALL") params.set("category", category);
    if (source === "STOCK") params.set("minConfidence", "70");
    try {
      const res = await fetch(`/api/news?${params}`);
      const data = await res.json();
      const items: NewsItem[] = Array.isArray(data) ? data : [];
      setNews(source === "MARKET_ONLY" ? items.filter((n) => n.relatedSymbolConfidence < 70) : items);
      setUpdatedAt(new Date().toISOString().slice(11, 16) + " UTC");
    } catch { setNews([]); }
    finally { setLoading(false); setRefreshing(false); }
  }, [sentiment, category, source]);

  useEffect(() => { fetchNews(); }, [fetchNews]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? news.filter((n) => n.title.toLowerCase().includes(q) || n.stock?.symbol.toLowerCase().includes(q)) : news;
  }, [news, query]);

  const clearFilters = () => { setSentiment("ALL"); setCategory("ALL"); setSource("ALL"); setQuery(""); };

  return (
    <div className="min-h-screen dash-font" style={{ background: NC.bg }}>
      <div className="mx-auto max-w-[1600px] px-6 lg:px-10 py-8 dash-in">
        <NewsHeader t={t} query={query} onQuery={setQuery} onRefresh={fetchNews} refreshing={refreshing} updatedAt={updatedAt} />
        <NewsSummaryCards t={t} news={news} />
        <NewsFilters t={t} sentiment={sentiment} setSentiment={setSentiment} source={source} setSource={setSource} category={category} setCategory={setCategory} />
        <div className="dash-card overflow-hidden">
          {loading ? (
            <div className="py-16 text-center text-[13px]" style={{ color: NC.faint }}><span className="animate-pulse">{t("common.loading")}</span></div>
          ) : visible.length === 0 ? (
            <NewsEmptyState t={t} onClear={clearFilters} />
          ) : (
            visible.map((n, i) => <NewsRow key={n.id} t={t} n={n} top={i === 0} />)
          )}
        </div>
      </div>
    </div>
  );
}
