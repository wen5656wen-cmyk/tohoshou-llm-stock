"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { getRec, getRecommendationLabel, fmtPct, fmtJpy } from "@/lib/rec-config";
import { getPrimaryName } from "@/lib/company-name";
import { ArrowRight, AlertTriangle } from "@/components/dashboard/icons";
import { C, ScoreRing, MktBadge } from "./ui";

type ScoreLike = {
  symbol: string; name: string; nameZh: string | null; nameEn?: string | null; market: string | null;
  latestClose: number | null; return5d: number | null; return20d: number | null;
  rsi14: number | null; maTrend: string | null;
  adaptiveScore: number | null; stockStyle: string | null; highRiskFlag: boolean;
  recommendationV2: string | null; isWatchlist?: boolean;
};

function maTrend(trend: string | null): { label: string; color: string } {
  const m: Record<string, { label: string; color: string }> = {
    GOLDEN: { label: "均线 ↑↑", color: C.green },
    BULLISH: { label: "均线 ↑", color: C.green },
    NEUTRAL: { label: "均线 —", color: C.faint },
    BEARISH: { label: "均线 ↓", color: C.red },
    DEAD: { label: "均线 ↓↓", color: C.red },
  };
  return m[trend ?? ""] ?? { label: "均线 —", color: C.faint };
}

function Chip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg" style={{ background: "#F7F7F9" }}>
      <span className="text-[10px] font-medium" style={{ color: C.faint }}>{label}</span>
      <span className="text-[12px] font-semibold tabular-nums" style={{ color }}>{value}</span>
    </div>
  );
}

export function StockCard({ s, rank, displayScore, href, favorited, onToggleFav }: {
  s: ScoreLike; rank: number; displayScore: number | null; href: string;
  favorited: boolean; onToggleFav: (symbol: string) => void;
}) {
  const { lang } = useI18n();
  const rec = getRec(s.recommendationV2);
  const rsiColor = s.rsi14 == null ? C.faint : s.rsi14 >= 70 ? C.red : s.rsi14 <= 30 ? C.green : C.sub;
  const ma = maTrend(s.maTrend);

  return (
    <div className="dash-card dash-int p-5 flex flex-col group" style={{ minHeight: 196 }}>
      {/* Name + code (rank inline) */}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[11px] font-semibold tabular-nums shrink-0" style={{ color: C.faint }}>#{rank}</span>
          {s.highRiskFlag && <span style={{ color: C.red }} title="高风险"><AlertTriangle size={13} /></span>}
          <Link href={href} className="text-[18px] font-semibold tracking-[-0.01em] truncate transition-colors group-hover:text-[#007AFF]" style={{ color: C.ink }}>
            {getPrimaryName(s as never, lang)}
          </Link>
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-[12px] font-medium tabular-nums" style={{ color: C.sub }}>{s.symbol}</span>
          <MktBadge mkt={s.market} />
        </div>
      </div>

      {/* Score ring + rating + price */}
      <div className="flex items-center gap-4 mt-4">
        <ScoreRing score={displayScore} size={62} />
        <div className="min-w-0 flex-1">
          <span className="inline-flex items-center text-[12px] font-semibold px-2 py-0.5 rounded-full" style={{ color: rec.color, background: `${rec.color}14` }}>
            {getRecommendationLabel(s.recommendationV2, lang)}
          </span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-[19px] font-semibold tabular-nums tracking-[-0.01em]" style={{ color: C.ink }}>{fmtJpy(s.latestClose)}</span>
            <span className="text-[13px] font-semibold tabular-nums" style={{ color: s.return20d == null ? C.faint : s.return20d >= 0 ? C.green : C.red }}>
              {fmtPct(s.return20d)}
            </span>
          </div>
        </div>
      </div>

      {/* Indicators: RSI + MA only */}
      <div className="flex items-center gap-2 mt-3.5">
        <Chip label="RSI" value={s.rsi14?.toFixed(0) ?? "—"} color={rsiColor} />
        <div className="flex items-center px-2.5 h-7 rounded-lg" style={{ background: "#F7F7F9" }}>
          <span className="text-[12px] font-semibold" style={{ color: ma.color }}>{ma.label}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-auto pt-4">
        <Link href={href}
          className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-full text-[13px] font-semibold text-white dash-int"
          style={{ background: C.blue }}>
          查看分析 <ArrowRight size={15} />
        </Link>
        <button
          type="button"
          onClick={() => onToggleFav(s.symbol)}
          className="inline-flex items-center justify-center h-10 px-4 rounded-full text-[13px] font-semibold dash-card dash-int"
          style={{ color: favorited ? C.blue : C.sub }}>
          {favorited ? "已收藏" : "收藏"}
        </button>
      </div>
    </div>
  );
}
