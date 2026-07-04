"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { getRec, getRecommendationLabel, fmtPct, fmtJpy } from "@/lib/rec-config";
import { getPrimaryName } from "@/lib/company-name";
import { ArrowRight, Bookmark, Star, AlertTriangle } from "@/components/dashboard/icons";
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
  const { t, lang } = useI18n();
  const rec = getRec(s.recommendationV2);
  const rsiColor = s.rsi14 == null ? C.faint : s.rsi14 >= 70 ? C.red : s.rsi14 <= 30 ? C.green : C.sub;
  const ma = maTrend(s.maTrend);

  return (
    <div className="dash-card dash-int p-5 flex flex-col group" style={{ minHeight: 232 }}>
      {/* Top: rank + favorite */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-semibold tabular-nums px-2 py-0.5 rounded-md" style={{ color: C.faint, background: "#F4F4F6" }}>#{rank}</span>
        <button
          type="button"
          onClick={() => onToggleFav(s.symbol)}
          aria-label={favorited ? "取消收藏" : "收藏"}
          title={favorited ? "取消收藏" : "收藏"}
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg transition-colors hover:bg-[#F4F4F6]"
          style={{ color: favorited ? C.blue : C.faint }}
        >
          <Bookmark size={17} {...(favorited ? { fill: C.blue } : {})} />
        </button>
      </div>

      {/* Name + code */}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          {s.isWatchlist && <span style={{ color: C.amber }} title={t("universe.rule.MANUAL_INCLUDE_WATCHLIST")}><Star size={13} fill={C.amber} /></span>}
          {s.highRiskFlag && <span style={{ color: C.red }} title="高风险"><AlertTriangle size={13} /></span>}
          <Link href={href} className="text-[18px] font-semibold tracking-[-0.01em] truncate transition-colors group-hover:text-[#007AFF]" style={{ color: C.ink }}>
            {getPrimaryName(s as never, lang)}
          </Link>
          {/* watchlist tooltip uses a valid message key */}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap mt-1">
          <span className="text-[12px] font-medium tabular-nums" style={{ color: C.sub }}>{s.symbol}</span>
          <MktBadge mkt={s.market} />
          {s.stockStyle && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md" style={{ color: C.faint, background: "#F4F4F6" }}>
              {t(`style.short.${s.stockStyle}` as Parameters<typeof t>[0])}
            </span>
          )}
        </div>
      </div>

      {/* Score ring + rating + price */}
      <div className="flex items-center gap-4 mt-4">
        <ScoreRing score={displayScore} size={66} />
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

      {/* Indicators */}
      <div className="flex items-center gap-2 mt-4 flex-wrap">
        <Chip label="RSI" value={s.rsi14?.toFixed(0) ?? "—"} color={rsiColor} />
        <div className="flex items-center px-2.5 h-7 rounded-lg" style={{ background: "#F7F7F9" }}>
          <span className="text-[12px] font-semibold" style={{ color: ma.color }}>{ma.label}</span>
        </div>
        <Chip label="5D" value={fmtPct(s.return5d)} color={s.return5d == null ? C.faint : s.return5d >= 0 ? C.green : C.red} />
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
