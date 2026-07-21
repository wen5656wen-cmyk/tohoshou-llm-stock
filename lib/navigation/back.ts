export type BackSource =
  | "screener"
  | "stocks"
  | "ai-theme"
  | "sectors"
  | "portfolio"
  | "news"
  | "dashboard";

/** Build a URL to /stocks/[symbol] with returnTo + source params */
export function buildStockUrl(
  symbol: string,
  source: BackSource,
  currentPathWithSearch: string,
): string {
  const params = new URLSearchParams({
    source,
    returnTo: currentPathWithSearch,
  });
  return `/stocks/${encodeURIComponent(symbol)}?${params.toString()}`;
}

/** Get the back href from URL params — use returnTo if present, else fallback */
export function getBackHref(
  returnTo: string | null,
  source: BackSource | string | null,
  fallback = "/screener",
): string {
  if (returnTo) return returnTo;
  const sourceMap: Record<string, string> = {
    screener:  "/screener",
    stocks:    "/decision-v2?tab=recommendations", // P21-T2：/stocks 已下线，回退到股票中心
    "ai-theme": "/ai-theme",
    sectors:   "/sectors",
    portfolio: "/portfolio",
    news:      "/news",
    dashboard: "/",
  };
  return source ? (sourceMap[source] ?? fallback) : fallback;
}

/** Get the back button label for a given source and lang */
export function getBackLabel(
  source: BackSource | string | null,
  lang: string,
): string {
  const isZh = lang === "zh-CN";
  const isJa = lang === "ja-JP";

  switch (source) {
    case "screener":
      return isZh ? "返回 AI选股" : isJa ? "AI銘柄選定へ戻る" : "Back to AI Screener";
    case "stocks":
      return isZh ? "返回 TOP500" : isJa ? "TOP500へ戻る" : "Back to TOP500";
    case "ai-theme":
      return isZh ? "返回 AI产业链" : isJa ? "AI投資テーマへ戻る" : "Back to AI Value Chain";
    case "sectors":
      return isZh ? "返回行业分析" : isJa ? "業界分析へ戻る" : "Back to Sectors";
    case "portfolio":
      return isZh ? "返回我的投资" : isJa ? "マイ投資へ戻る" : "Back to My Investments";
    case "news":
      return isZh ? "返回新闻资讯" : isJa ? "ニュースへ戻る" : "Back to News";
    default:
      return isZh ? "返回上一页" : isJa ? "前のページへ戻る" : "Back";
  }
}
