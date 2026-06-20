"use client";

import { useEffect, useState, useCallback } from "react";
import NewsCard from "@/components/NewsCard";

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

    // Client-side: filter market-only
    const filtered = source === "MARKET_ONLY"
      ? items.filter((n) => n.relatedSymbolConfidence < 70)
      : items;

    setNews(filtered);
    setLoading(false);
  }, [sentiment, category, source]);

  useEffect(() => { fetchNews(); }, [fetchNews]);

  const SENTIMENTS: { key: SentimentKey; label: string }[] = [
    { key: "ALL", label: "全部" },
    { key: "POSITIVE", label: "🟢 利好" },
    { key: "NEGATIVE", label: "🔴 利空" },
    { key: "NEUTRAL", label: "⚪ 中性" },
  ];

  const CATEGORIES: { key: CategoryKey; label: string }[] = [
    { key: "ALL", label: "全分类" },
    { key: "EARNINGS", label: "決算" },
    { key: "GUIDANCE", label: "業績修正" },
    { key: "DIVIDEND", label: "配当" },
    { key: "BUYBACK", label: "自己株" },
    { key: "IR", label: "IR開示" },
    { key: "MARKET", label: "市場" },
  ];

  const SOURCES: { key: SourceKey; label: string }[] = [
    { key: "ALL", label: "全部来源" },
    { key: "STOCK", label: "個株専属 ≥70%" },
    { key: "MARKET_ONLY", label: "市場ニュース" },
  ];

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">新闻资讯</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Yahoo Finance Japan · Kabutan · TDnet 適時開示
        </p>
      </div>

      {/* Filter row 1: sentiment + source */}
      <div className="flex flex-wrap gap-2 mb-3">
        {SENTIMENTS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSentiment(key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              sentiment === key
                ? "bg-blue-600 text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
        <div className="w-px bg-slate-200 mx-1 self-stretch" />
        {SOURCES.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSource(key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              source === key
                ? "bg-teal-600 text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Filter row 2: category */}
      <div className="flex flex-wrap gap-2 mb-5">
        {CATEGORIES.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setCategory(key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              category === key
                ? "bg-purple-600 text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm animate-pulse">加载中...</div>
        ) : news.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">暂无新闻数据</div>
        ) : (
          news.map((n) => <NewsCard key={n.id} news={n} />)
        )}
      </div>
    </div>
  );
}
