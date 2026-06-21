"use client";

import { useEffect, useState, useCallback } from "react";
import NewsCard from "@/components/NewsCard";
import { useI18n } from "@/lib/i18n";

type NewsItem = {
  id: number;
  title: string;
  source: string;
  publishedAt: string;
  sentiment: string | null;
  importance: number;
  category: string | null;
  relatedSymbolConfidence: number;
  url: string;
  summary: string | null;
  stock: { symbol: string; name: string } | null;
};

type SentimentKey = "ALL" | "POSITIVE" | "NEGATIVE" | "NEUTRAL";
type CategoryKey = "ALL" | "EARNINGS" | "GUIDANCE" | "DIVIDEND" | "BUYBACK" | "IR" | "MARKET";
type SourceKey = "ALL" | "STOCK" | "MARKET_ONLY";

export default function NewsPage() {
  const { t } = useI18n();
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sentiment, setSentiment] = useState<SentimentKey>("ALL");
  const [category, setCategory] = useState<CategoryKey>("ALL");
  const [source, setSource] = useState<SourceKey>("ALL");

  const fetchNews = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "50" });
    if (sentiment !== "ALL") params.set("sentiment", sentiment);
    if (category !== "ALL") params.set("category", category);
    if (source === "STOCK") params.set("minConfidence", "70");

    const res = await fetch(`/api/news?${params}`);
    const data = await res.json();
    const items: NewsItem[] = Array.isArray(data) ? data : [];

    const filtered = source === "MARKET_ONLY"
      ? items.filter((n) => n.relatedSymbolConfidence < 70)
      : items;

    setNews(filtered);
    setLoading(false);
  }, [sentiment, category, source]);

  useEffect(() => { fetchNews(); }, [fetchNews]);

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">{t("news.title")}</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Yahoo Finance Japan · Kabutan · TDnet
        </p>
      </div>

      {/* Filter row 1: sentiment + source */}
      <div className="flex flex-wrap gap-2 mb-3">
        {(["ALL", "POSITIVE", "NEGATIVE", "NEUTRAL"] as SentimentKey[]).map((key) => (
          <button
            key={key}
            onClick={() => setSentiment(key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              sentiment === key
                ? "bg-blue-600 text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {key === "ALL" ? t("news.all") : key === "POSITIVE" ? t("news.positive") : key === "NEGATIVE" ? t("news.negative") : t("news.neutral")}
          </button>
        ))}
        <div className="w-px bg-slate-200 mx-1 self-stretch" />
        {(["ALL", "STOCK", "MARKET_ONLY"] as SourceKey[]).map((key) => (
          <button
            key={key}
            onClick={() => setSource(key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              source === key
                ? "bg-teal-600 text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {key === "ALL" ? t("news.all_sources") : key === "STOCK" ? t("news.stock_specific") : t("news.market_only")}
          </button>
        ))}
      </div>

      {/* Filter row 2: category */}
      <div className="flex flex-wrap gap-2 mb-5">
        {(["ALL", "EARNINGS", "GUIDANCE", "DIVIDEND", "BUYBACK", "IR", "MARKET"] as CategoryKey[]).map((key) => (
          <button
            key={key}
            onClick={() => setCategory(key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              category === key
                ? "bg-purple-600 text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {key === "ALL" ? t("news.all_categories") :
             key === "EARNINGS" ? t("news.earnings") :
             key === "GUIDANCE" ? t("news.guidance") :
             key === "DIVIDEND" ? t("news.dividend") :
             key === "BUYBACK" ? t("news.buyback") :
             key === "IR" ? t("news.ir") : t("news.market_cat")}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm animate-pulse">{t("common.loading")}</div>
        ) : news.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">{t("news.no_data")}</div>
        ) : (
          news.map((n) => <NewsCard key={n.id} news={n} />)
        )}
      </div>
    </div>
  );
}
