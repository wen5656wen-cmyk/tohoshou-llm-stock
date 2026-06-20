import dayjs from "dayjs";

type Disclosure = {
  id: number;
  symbol: string;
  title: string;
  publishedAt: string | Date;
  category: string;
  sentiment?: string | null;
  importance?: number;
  url: string;
  stock?: { symbol: string; name: string } | null;
};

const categoryConfig: Record<string, { label: string; color: string }> = {
  EARNINGS: { label: "決算", color: "bg-blue-100 text-blue-800" },
  FORECAST_REVISION: { label: "業績修正", color: "bg-purple-100 text-purple-800" },
  BUYBACK: { label: "自己株買", color: "bg-teal-100 text-teal-800" },
  DIVIDEND: { label: "配当", color: "bg-green-100 text-green-800" },
  EQUITY: { label: "株式", color: "bg-orange-100 text-orange-800" },
  MATERIAL: { label: "重要事項", color: "bg-red-100 text-red-800" },
  OTHER: { label: "その他", color: "bg-slate-100 text-slate-600" },
};

const sentimentColor: Record<string, string> = {
  POSITIVE: "text-emerald-600",
  NEGATIVE: "text-red-600",
  NEUTRAL: "text-slate-400",
};

const sentimentIcon: Record<string, string> = {
  POSITIVE: "▲",
  NEGATIVE: "▼",
  NEUTRAL: "—",
};

export default function DisclosureCard({
  disclosure,
}: {
  disclosure: Disclosure;
}) {
  const cat = categoryConfig[disclosure.category] ?? categoryConfig.OTHER;
  const sent = disclosure.sentiment || "NEUTRAL";

  return (
    <div className="p-4 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {disclosure.stock && (
              <span className="text-xs font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                {disclosure.stock.symbol}
              </span>
            )}
            <span
              className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${cat.color}`}
            >
              {cat.label}
            </span>
            <span
              className={`text-[11px] font-bold ${sentimentColor[sent] || "text-slate-400"}`}
            >
              {sentimentIcon[sent] || "—"}
            </span>
            <span className="text-xs text-slate-400">
              {dayjs(disclosure.publishedAt).format("YYYY/M/D")}
            </span>
          </div>
          <a
            href={disclosure.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-slate-800 hover:text-blue-600 line-clamp-2 leading-snug"
          >
            {disclosure.title}
          </a>
        </div>
        {disclosure.importance && disclosure.importance >= 8 && (
          <span className="flex-none text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded mt-0.5">
            重要
          </span>
        )}
      </div>
    </div>
  );
}
