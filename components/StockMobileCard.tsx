import Link from "next/link";
import { getRec, returnColorClass, fmtPct, fmtJpy } from "@/lib/rec-config";

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
  tradingAction?: string | null;
  positionSizePct?: number | null;
};

export default function StockMobileCard({ s, rank }: { s: StockRow; rank?: number }) {
  const rec = getRec(s.recommendationV2);

  return (
    <Link
      href={`/stocks/${encodeURIComponent(s.symbol)}`}
      className="block bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-sm transition-shadow active:bg-slate-50"
    >
      <div className="flex items-start gap-3">
        {rank != null && (
          <span className="text-xs text-slate-300 tabular-nums mt-0.5 w-5 shrink-0 text-right">{rank}</span>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="font-bold text-slate-900 text-[15px] leading-tight truncate">
                {s.nameZh || s.name}
                {s.highRiskFlag && <span className="ml-1 text-[10px] text-red-400">⚠</span>}
              </div>
              <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                {s.symbol} · {s.sector?.split("・")[0]?.slice(0, 8) ?? "—"}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${rec.bg} ${rec.text}`}>
                {rec.label}
              </div>
              <div className="text-2xl font-bold text-slate-900 tabular-nums mt-0.5 leading-none">
                {s.adaptiveScore?.toFixed(0) ?? "—"}
              </div>
              {s.percentileRank != null && (
                <div className="text-[10px] text-slate-400">Top {s.percentileRank.toFixed(1)}%</div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5 mt-2.5 text-center text-[11px]">
            <div>
              <div className="text-slate-400 text-[10px]">Price</div>
              <div className="font-medium tabular-nums text-slate-900">{fmtJpy(s.latestClose)}</div>
            </div>
            <div>
              <div className="text-slate-400 text-[10px]">5D</div>
              <div className={`font-medium tabular-nums ${returnColorClass(s.return5d)}`}>
                {fmtPct(s.return5d)}
              </div>
            </div>
            <div>
              <div className="text-slate-400 text-[10px]">20D</div>
              <div className={`font-medium tabular-nums ${returnColorClass(s.return20d)}`}>
                {fmtPct(s.return20d)}
              </div>
            </div>
          </div>

          {s.tradingAction && (() => {
            const A: Record<string, string> = {
              BUY_NOW: "bg-emerald-100 text-emerald-700",
              WAIT_PULLBACK: "bg-amber-100 text-amber-700",
              HOLD: "bg-slate-100 text-slate-600",
              TAKE_PROFIT: "bg-orange-100 text-orange-700",
              SELL: "bg-red-100 text-red-700",
              AVOID: "bg-red-100 text-red-700",
            };
            const L: Record<string, string> = { BUY_NOW: "BUY NOW", WAIT_PULLBACK: "WAIT", HOLD: "HOLD", TAKE_PROFIT: "PROFIT", SELL: "SELL", AVOID: "AVOID" };
            return (
              <div className={`mt-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${A[s.tradingAction] ?? A.HOLD}`}>
                {L[s.tradingAction] ?? s.tradingAction}
                {s.positionSizePct != null && <span className="font-normal opacity-70">{s.positionSizePct}%</span>}
              </div>
            );
          })()}

          {(s.opportunityScore != null || (s.dividendScore != null && s.dividendScore > 0) || (s.catalystScore != null && s.catalystScore > 0)) && (
            <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-400">
              {s.opportunityScore != null && (
                <span>Opp <b className="text-slate-600">{s.opportunityScore.toFixed(0)}</b></span>
              )}
              {s.dividendScore != null && s.dividendScore > 0 && (
                <span>Div <b className="text-emerald-600">{s.dividendScore}</b></span>
              )}
              {s.catalystScore != null && s.catalystScore > 0 && (
                <span>Cat <b className="text-orange-600">{s.catalystScore.toFixed(1)}</b></span>
              )}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
