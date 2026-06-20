import Link from "next/link";

type StockRow = {
  symbol: string;
  name: string;
  nameZh: string | null;
  sector: string | null;
  latestClose: number | null;
  return5d: number | null;
  return20d: number | null;
  adaptiveScore: number | null;
  percentileRank: number | null;
  recommendationV2: string | null;
  opportunityScore: number | null;
  dividendScore?: number | null;
  catalystScore?: number | null;
  highRiskFlag: boolean;
};

const REC_CFG: Record<string, { label: string; bg: string; text: string }> = {
  STRONG_BUY: { label: "强买", bg: "bg-red-100",    text: "text-red-700" },
  BUY:        { label: "买入", bg: "bg-orange-100", text: "text-orange-700" },
  HOLD:       { label: "持有", bg: "bg-slate-100",  text: "text-slate-500" },
  WATCH:      { label: "观察", bg: "bg-yellow-100", text: "text-yellow-700" },
  AVOID:      { label: "回避", bg: "bg-blue-100",   text: "text-blue-500" },
};

function RetBadge({ val }: { val: number | null }) {
  if (val == null) return <span className="text-slate-300">—</span>;
  const up = val >= 0;
  return (
    <span className={`font-medium tabular-nums ${up ? "text-red-600" : "text-blue-600"}`}>
      {up ? "+" : ""}{val.toFixed(1)}%
    </span>
  );
}

export default function StockMobileCard({ s, rank }: { s: StockRow; rank?: number }) {
  const rec = REC_CFG[s.recommendationV2 ?? "HOLD"] ?? REC_CFG.HOLD;

  return (
    <Link
      href={`/stocks/${encodeURIComponent(s.symbol)}`}
      className="block bg-white rounded-xl border border-slate-200 p-4 hover:shadow-sm transition-shadow active:bg-slate-50"
    >
      <div className="flex items-start gap-3">
        {rank != null && (
          <span className="text-xs text-slate-300 tabular-nums mt-0.5 w-5 shrink-0 text-right">{rank}</span>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="font-bold text-slate-900 text-sm leading-tight truncate">
                {s.nameZh || s.name}
                {s.highRiskFlag && <span className="ml-1 text-[10px] text-red-400">⚠</span>}
              </div>
              <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                {s.symbol} · {s.sector?.split("・")[0]?.slice(0, 8) ?? "—"}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className={`text-xs font-bold px-1.5 py-0.5 rounded ${rec.bg} ${rec.text}`}>
                {rec.label}
              </div>
              <div className="text-xl font-bold text-slate-900 tabular-nums mt-0.5 leading-none">
                {s.adaptiveScore?.toFixed(0) ?? "—"}
              </div>
              {s.percentileRank != null && (
                <div className="text-[10px] text-slate-400">前{s.percentileRank.toFixed(1)}%</div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5 mt-2.5 text-center text-[11px]">
            <div>
              <div className="text-slate-400 text-[10px]">现价</div>
              <div className="font-medium tabular-nums text-slate-900">
                {s.latestClose ? `¥${s.latestClose.toLocaleString()}` : "—"}
              </div>
            </div>
            <div>
              <div className="text-slate-400 text-[10px]">5日</div>
              <RetBadge val={s.return5d} />
            </div>
            <div>
              <div className="text-slate-400 text-[10px]">20日</div>
              <RetBadge val={s.return20d} />
            </div>
          </div>

          {(s.opportunityScore != null || (s.dividendScore != null && s.dividendScore > 0) || (s.catalystScore != null && s.catalystScore > 0)) && (
            <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-400">
              {s.opportunityScore != null && (
                <span>机会 <b className="text-slate-600">{s.opportunityScore.toFixed(0)}</b></span>
              )}
              {s.dividendScore != null && s.dividendScore > 0 && (
                <span>配当 <b className="text-emerald-600">{s.dividendScore}</b></span>
              )}
              {s.catalystScore != null && s.catalystScore > 0 && (
                <span>催化 <b className="text-orange-600">{s.catalystScore.toFixed(1)}</b></span>
              )}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
