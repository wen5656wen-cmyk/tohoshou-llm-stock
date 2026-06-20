import dayjs from "dayjs";

type News = {
  id: number;
  title: string;
  source: string;
  publishedAt: string | Date;
  sentiment?: string | null;
  importance?: number;
  category?: string | null;
  relatedSymbolConfidence?: number;
  stock?: { symbol: string; name: string } | null;
  summary?: string | null;
  url: string;
};

type Props = { news: News; compact?: boolean };

const sentimentColor: Record<string, string> = {
  POSITIVE: "text-emerald-600 bg-emerald-50",
  NEGATIVE: "text-red-600 bg-red-50",
  NEUTRAL:  "text-slate-500 bg-slate-50",
};

const sentimentEmoji: Record<string, string> = {
  POSITIVE: "🟢", NEGATIVE: "🔴", NEUTRAL: "⚪",
};

const categoryLabel: Record<string, string> = {
  EARNINGS: "決算", GUIDANCE: "業績修正", DIVIDEND: "配当",
  BUYBACK: "自己株", IR: "IR", MARKET: "市場",
};

const categoryColor: Record<string, string> = {
  EARNINGS: "bg-purple-50 text-purple-700",
  GUIDANCE: "bg-amber-50 text-amber-700",
  DIVIDEND: "bg-teal-50 text-teal-700",
  BUYBACK:  "bg-blue-50 text-blue-700",
  IR:       "bg-slate-100 text-slate-600",
  MARKET:   "bg-slate-50 text-slate-400",
};

export default function NewsCard({ news, compact }: Props) {
  const imp = news.importance ?? 0;
  const isHigh = imp >= 7;
  const isMedium = imp >= 4 && imp < 7;
  const cat = news.category ?? "";
  const conf = news.relatedSymbolConfidence ?? 0;

  // Strip "tdnet:" prefix
  const displayUrl = news.url.startsWith("tdnet:") ? news.url.slice(6) : news.url;

  return (
    <div className="group p-4 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
            {news.stock && (
              <span className="text-xs font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                {news.stock.symbol}
              </span>
            )}
            {cat && categoryLabel[cat] && (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${categoryColor[cat] ?? ""}`}>
                {categoryLabel[cat]}
              </span>
            )}
            {news.sentiment && (
              <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${sentimentColor[news.sentiment] || sentimentColor.NEUTRAL}`}>
                {sentimentEmoji[news.sentiment] ?? ""}
              </span>
            )}
            {conf >= 70 && (
              <span className="text-[10px] text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded">個株</span>
            )}
            <span className="text-xs text-slate-400">{news.source}</span>
            <span className="text-xs text-slate-400">{dayjs(news.publishedAt).format("M/D HH:mm")}</span>
          </div>
          <a
            href={displayUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-slate-800 hover:text-blue-600 line-clamp-2 leading-snug"
          >
            {news.title}
          </a>
          {!compact && news.summary && (
            <p className="mt-1.5 text-xs text-slate-500 line-clamp-2">{news.summary}</p>
          )}
        </div>
        {isHigh && (
          <span className="flex-none text-[10px] font-bold text-red-700 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded mt-0.5">
            重要
          </span>
        )}
        {isMedium && !isHigh && (
          <span className="flex-none text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded mt-0.5">
            注目
          </span>
        )}
      </div>
    </div>
  );
}
