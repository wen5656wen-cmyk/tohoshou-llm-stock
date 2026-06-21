"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { getPrimaryName } from "@/lib/company-name";
import { getRec, returnColorClass, fmtPct, fmtJpy } from "@/lib/rec-config";

type Score = {
  symbol: string;
  name: string;
  nameZh: string | null;
  nameEn?: string | null;
  latestClose: number | null;
  return5d: number | null;
  return20d: number | null;
  rsi14: number | null;
  maTrend: string | null;
  technicalScore: number | null;
  fundamentalScore: number | null;
  moneyFlowScore: number | null;
  riskScore: number | null;
  totalScore: number | null;
  adaptiveScore: number | null;
  recommendation: string | null;
  recommendationV2: string | null;
  percentileRank: number | null;
};

function ReturnBadge({ val }: { val: number | null | undefined }) {
  if (val == null) return <span className="text-slate-300 text-xs">—</span>;
  return (
    <span className={`text-xs font-medium tabular-nums ${returnColorClass(val)}`}>
      {fmtPct(val)}
    </span>
  );
}

function MaTrendBadge({ trend }: { trend: string | null }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    GOLDEN:  { label: "Bullish",  cls: "bg-amber-100 text-amber-700" },
    BULLISH: { label: "Strong",   cls: "bg-emerald-100 text-emerald-700" },
    NEUTRAL: { label: "Neutral",  cls: "bg-slate-100 text-slate-500" },
    BEARISH: { label: "Weak",     cls: "bg-slate-100 text-slate-500" },
    DEAD:    { label: "Bearish",  cls: "bg-red-100 text-red-600" },
  };
  const c = cfg[trend ?? ""] ?? cfg.NEUTRAL;
  return (
    <span className={`text-[11px] px-1.5 py-0.5 rounded font-semibold ${c.cls}`}>{c.label}</span>
  );
}

export function HomeTop3({ top3 }: { top3: Score[] }) {
  const { lang } = useI18n();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {top3.map((s, i) => {
        const rec = getRec(s.recommendationV2 ?? s.recommendation);
        const primary = getPrimaryName(s, lang);
        const secondary = s.name !== primary ? s.name : null;
        return (
          <Link
            key={s.symbol}
            href={`/stocks/${encodeURIComponent(s.symbol)}`}
            className="bg-white/10 hover:bg-white/20 transition-colors rounded-2xl p-4 block"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-400 tabular-nums">#{i + 1}</span>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${rec.bg} ${rec.text}`}>
                {rec.label}
              </span>
            </div>
            <div className="text-[15px] font-bold text-white leading-tight truncate">{primary}</div>
            {secondary && (
              <div className="text-[11px] text-slate-400 truncate">{secondary}</div>
            )}
            <div className="text-[11px] text-slate-500 font-mono mt-0.5 mb-2">{s.symbol}</div>
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-bold text-white tabular-nums">
                {s.adaptiveScore?.toFixed(0) ?? s.totalScore}
              </div>
              <div className="text-slate-300 text-xs">
                / 100{s.percentileRank != null ? ` · Top ${s.percentileRank.toFixed(1)}%` : ""}
              </div>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1 text-[10px]">
              <div className="text-center">
                <div className="text-blue-300 font-bold">{s.technicalScore}</div>
                <div className="text-slate-500">Tech</div>
              </div>
              <div className="text-center">
                <div className="text-emerald-300 font-bold">{s.fundamentalScore}</div>
                <div className="text-slate-500">Fund</div>
              </div>
              <div className="text-center">
                <div className="text-violet-300 font-bold">{s.moneyFlowScore ?? s.riskScore}</div>
                <div className="text-slate-500">Flow</div>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export function HomeScoreTable({ scores }: { scores: Score[] }) {
  const { lang } = useI18n();
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="text-left text-xs text-slate-400 border-b border-slate-100 bg-slate-50">
            <th className="px-4 py-3 font-medium w-6 text-center">#</th>
            <th className="px-4 py-3 font-medium">Stock</th>
            <th className="px-3 py-3 font-medium text-right">Price</th>
            <th className="px-3 py-3 font-medium text-right">5D</th>
            <th className="px-3 py-3 font-medium text-right">20D</th>
            <th className="px-3 py-3 font-medium text-right">RSI</th>
            <th className="px-3 py-3 font-medium">Trend</th>
            <th className="px-3 py-3 font-medium text-right">Tech</th>
            <th className="px-3 py-3 font-medium text-right">Fund</th>
            <th className="px-3 py-3 font-medium text-right">Adaptive</th>
            <th className="px-3 py-3 font-medium text-center">Rating</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {scores.slice(0, 100).map((s, i) => {
            const rec = getRec(s.recommendationV2 ?? s.recommendation);
            const primary = getPrimaryName(s, lang);
            const secondary = s.name !== primary ? s.name : null;
            const rsiColor =
              s.rsi14 == null ? "text-slate-400"
              : s.rsi14 >= 70 ? "text-red-500"
              : s.rsi14 <= 30 ? "text-emerald-500"
              : "text-slate-700";
            return (
              <tr key={s.symbol} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-2 text-center text-xs text-slate-300 tabular-nums">{i + 1}</td>
                <td className="px-4 py-2">
                  <Link href={`/stocks/${encodeURIComponent(s.symbol)}`} className="block group">
                    <div className="text-[15px] font-bold text-slate-900 group-hover:text-blue-600 leading-tight">
                      {primary}
                    </div>
                    {secondary && (
                      <div className="text-[11px] text-slate-400 truncate mt-0.5">{secondary}</div>
                    )}
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5">{s.symbol}</div>
                  </Link>
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-medium text-sm text-slate-900">
                  {fmtJpy(s.latestClose)}
                </td>
                <td className="px-3 py-2 text-right">
                  <ReturnBadge val={s.return5d} />
                </td>
                <td className="px-3 py-2 text-right">
                  <ReturnBadge val={s.return20d} />
                </td>
                <td className={`px-3 py-2 text-right tabular-nums text-xs ${rsiColor}`}>
                  {s.rsi14 != null ? s.rsi14.toFixed(1) : "—"}
                </td>
                <td className="px-3 py-2">
                  <MaTrendBadge trend={s.maTrend} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-xs text-blue-600 font-medium">
                  {s.technicalScore ?? "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-xs text-emerald-600 font-medium">
                  {s.fundamentalScore ?? "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  <span className={`text-sm font-bold tabular-nums ${rec.text}`}>
                    {s.adaptiveScore?.toFixed(0) ?? s.totalScore ?? "—"}
                  </span>
                </td>
                <td className="px-3 py-2 text-center">
                  <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${rec.bg} ${rec.text}`}>
                    {rec.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
