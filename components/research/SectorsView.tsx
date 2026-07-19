"use client";

// ── 行业分析 = Sector Decision Center（P17-05）─────────────────────────────────
// 只回答两问：①今天哪些行业值得关注 ②这个行业买哪些股票（点行业→股票中心筛选）。
// 全站设计系统统一（AppCard / AppBadge / COLORS / 排版 / 圆角 / 阴影），无原生 Tailwind 语义色。
// 数据源 /api/sectors 不变；热度纯前端派生；不承担股票详情（交给股票中心）。
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { localeSector } from "@/lib/i18n/market-labels";
import { getRecommendationLabel } from "@/lib/rec-config";
import type { Tone } from "@/lib/design-tokens";
import { AppCard, AppBadge, AppLoading } from "@/components/ui";
import { COLORS, fmtPct } from "@/lib/decision/ds";

type SectorStat = {
  sector: string; count: number;
  avgAdaptiveScore: number | null; avgTechnicalScore: number | null; avgFundamentalScore: number | null; avgRiskScore: number | null;
  avgReturn5d: number | null; avgReturn20d: number | null; avgReturn60d: number | null;
  buyCount: number; watchCount: number; avoidCount: number; buyRate: number;
  top3: { symbol: string; name: string; nameZh: string | null; nameEn: string | null; adaptiveScore: number | null; recommendationV2: string | null }[];
};
type ApiResponse = { totalScored: number; sectors: SectorStat[]; computedAt: string };
type SortKey = "heat" | "avgAdaptiveScore" | "avgReturn20d" | "buyRate" | "count";

const SCORE_COLOR = (a: number | null): string => (a == null ? COLORS.textMuted : a >= 90 ? "#1E8E3E" : a >= 80 ? COLORS.success : a >= 70 ? COLORS.warning : a >= 60 ? "#EAB308" : COLORS.textMuted);
const retColor = (v: number | null): string => (v == null ? COLORS.textFaint : v > 0 ? COLORS.success : v < 0 ? COLORS.danger : COLORS.textMuted);
// 行业热度（纯前端派生）= 综合评分 0.5 + 买入率 0.3 + 近20日表现 0.2
const heatOf = (s: SectorStat): number => {
  const score = s.avgAdaptiveScore ?? 0, buy = s.buyRate ?? 0, r20 = s.avgReturn20d ?? 0;
  const rn = Math.max(0, Math.min(100, 50 + r20 * 5));
  return Math.round(0.5 * score + 0.3 * buy + 0.2 * rn);
};
const starsOf = (h: number): string => { const n = h >= 80 ? 5 : h >= 65 ? 4 : h >= 50 ? 3 : h >= 35 ? 2 : 1; return "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(0, 5 - n); };

export default function SectorsPage() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("heat");

  useEffect(() => {
    fetch("/api/sectors").then((r) => r.json()).then((d) => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  // 行业 → 股票中心（全市场按该行业筛选）
  const go = (sector: string) => router.push(`/decision-v2?tab=picks&view=all&sector=${encodeURIComponent(sector)}`);

  // AI 判断：动作 + 一句话
  const verdict = (s: SectorStat): { tone: Tone; label: string; sentence: string } => {
    const score = s.avgAdaptiveScore ?? 0, buy = s.buyRate ?? 0, r20 = s.avgReturn20d ?? 0;
    const action = score >= 65 && buy >= 45 ? "BUY" : score >= 55 || buy >= 30 ? "WATCH" : "AVOID";
    const tone: Tone = action === "BUY" ? "red" : action === "WATCH" ? "blue" : "neutral";
    const sentence = buy >= 45 && r20 > 0 ? t("sectors.jInflow") : buy < 25 && r20 < 0 ? t("sectors.jWeak") : t("sectors.jNeutral");
    return { tone, label: getRecommendationLabel(action, lang), sentence };
  };

  if (loading) return <div className="max-w-[1400px] mx-auto px-6 py-10"><AppLoading label={t("sectors.title")} /></div>;
  if (!data) return <div className="max-w-[1400px] mx-auto px-6 py-10 text-[13px]" style={{ color: COLORS.textFaint }}>{t("common.load_error")}</div>;

  const withHeat = data.sectors.map((s) => ({ s, heat: heatOf(s) }));
  const sorted = [...withHeat].sort((a, b) => (sortKey === "heat" ? b.heat - a.heat : ((b.s[sortKey] ?? -999) as number) - ((a.s[sortKey] ?? -999) as number)));
  const top = sorted.slice(0, 5);

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 space-y-4" style={{ color: COLORS.text }}>
      {/* 标题 */}
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-[19px] font-bold" style={{ letterSpacing: "-0.02em" }}>{t("sectors.title")}</h1>
          <p className="text-[12px] mt-0.5" style={{ color: COLORS.textMuted }}>{t("sectors.subtitle")}</p>
        </div>
        <span className="text-[11px]" style={{ color: COLORS.textFaint }}>{data.sectors.length}{t("sectors.unit_sector")} · {data.totalScored.toLocaleString()}{t("sectors.unit_stock_suffix")}</span>
      </div>

      {/* 今日行业排行 TOP5 */}
      <div>
        <div className="text-[12px] font-semibold mb-2" style={{ color: COLORS.textSecondary }}>{t("sectors.todayRank")} · TOP5</div>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(212px, 1fr))" }}>
          {top.map(({ s, heat }, i) => {
            const v = verdict(s);
            return (
              <button key={s.sector} onClick={() => go(s.sector)} className="text-left block">
                <AppCard>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] tabular-nums" style={{ color: COLORS.textFaint }}>#{i + 1}</span>
                    <AppBadge tone={v.tone}>{v.label}</AppBadge>
                  </div>
                  <div className="text-[15px] font-bold mt-1 truncate">{localeSector(s.sector, lang)}</div>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-[24px] font-extrabold tabular-nums leading-none" style={{ color: SCORE_COLOR(s.avgAdaptiveScore) }}>{s.avgAdaptiveScore ?? "—"}</span>
                    <span className="text-[11px]" style={{ color: COLORS.textMuted }}>{t("sectors.avg_score")}</span>
                    <span className="ml-auto text-[12px]" style={{ color: COLORS.warning, letterSpacing: "1px" }} title={`${t("sectors.heat")} ${heat}`}>{starsOf(heat)}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 mt-2 text-[11px]">
                    <div><div style={{ color: COLORS.textFaint }}>{t("sectors.avg_5d")}</div><div className="tabular-nums font-semibold" style={{ color: retColor(s.avgReturn5d) }}>{fmtPct(s.avgReturn5d)}</div></div>
                    <div><div style={{ color: COLORS.textFaint }}>{t("sectors.avg_20d")}</div><div className="tabular-nums font-semibold" style={{ color: retColor(s.avgReturn20d) }}>{fmtPct(s.avgReturn20d)}</div></div>
                    <div><div style={{ color: COLORS.textFaint }}>{t("sectors.buy_rate")}</div><div className="tabular-nums font-semibold">{s.buyRate}%</div></div>
                  </div>
                  <div className="text-[11px] mt-2 pt-2 flex items-center justify-between" style={{ color: COLORS.textSecondary, borderTop: `1px solid ${COLORS.borderSoft}` }}>
                    <span className="truncate">{v.sentence}</span><span style={{ color: COLORS.primary }} className="whitespace-nowrap ml-1">{t("sectors.goStock")} →</span>
                  </div>
                </AppCard>
              </button>
            );
          })}
        </div>
      </div>

      {/* 排序 */}
      <div className="flex items-center gap-2 flex-wrap text-[11px]">
        <span style={{ color: COLORS.textFaint }}>{t("common.filter")}</span>
        <div className="inline-flex p-1 rounded-lg gap-0.5" style={{ background: COLORS.track }}>
          {(([["heat", "sectors.heat"], ["avgAdaptiveScore", "sectors.avg_score"], ["avgReturn20d", "sectors.avg_20d"], ["buyRate", "sectors.buy_rate"], ["count", "sectors.stock_count"]]) as [SortKey, string][]).map(([k, lk]) => (
            <button key={k} onClick={() => setSortKey(k)} className="px-3 py-1.5 rounded-md text-[12px] font-semibold" style={{ background: sortKey === k ? COLORS.card : "transparent", color: sortKey === k ? COLORS.text : COLORS.textSecondary, boxShadow: sortKey === k ? "0 1px 2px rgba(0,0,0,0.08)" : undefined }}>{t(lk as Parameters<typeof t>[0])}</button>
          ))}
        </div>
      </div>

      {/* 全行业表（点行业 → 股票中心；无展开、无重复 Top3、无旧路由） */}
      <AppCard>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
            <thead><tr className="text-[10px]" style={{ color: COLORS.textFaint }}>
              <th className="py-2 px-2 text-left">#</th>
              <th className="py-2 px-2 text-left">{t("common.sector")}</th>
              <th className="py-2 px-2 text-right">{t("sectors.heat")}</th>
              <th className="py-2 px-2 text-right">{t("sectors.avg_score")}</th>
              <th className="py-2 px-2 text-right">{t("dim.technical")}</th>
              <th className="py-2 px-2 text-right">{t("dim.fundamental")}</th>
              <th className="py-2 px-2 text-right">{t("sectors.risk")}</th>
              <th className="py-2 px-2 text-right">{t("sectors.avg_5d")}</th>
              <th className="py-2 px-2 text-right">{t("sectors.avg_20d")}</th>
              <th className="py-2 px-2 text-right">{t("sectors.buy_rate")}</th>
              <th className="py-2 px-2 text-left">{t("sectors.top_stocks")}</th>
              <th className="py-2 px-2 text-right"></th>
            </tr></thead>
            <tbody>
              {sorted.map(({ s, heat }, idx) => (
                <tr key={s.sector} onClick={() => go(s.sector)} className="cursor-pointer" style={{ borderTop: `1px solid ${COLORS.borderSoft}` }}>
                  <td className="py-2 px-2 text-left tabular-nums" style={{ color: COLORS.textFaint }}>{idx + 1}</td>
                  <td className="py-2 px-2 text-left font-medium">{localeSector(s.sector, lang)}</td>
                  <td className="py-2 px-2 text-right tabular-nums font-bold" style={{ color: SCORE_COLOR(heat) }}>{heat}</td>
                  <td className="py-2 px-2 text-right tabular-nums font-semibold" style={{ color: SCORE_COLOR(s.avgAdaptiveScore) }}>{s.avgAdaptiveScore ?? "—"}</td>
                  <td className="py-2 px-2 text-right tabular-nums" style={{ color: COLORS.primary }}>{s.avgTechnicalScore ?? "—"}</td>
                  <td className="py-2 px-2 text-right tabular-nums" style={{ color: COLORS.success }}>{s.avgFundamentalScore ?? "—"}</td>
                  <td className="py-2 px-2 text-right tabular-nums" style={{ color: COLORS.purple }}>{s.avgRiskScore ?? "—"}</td>
                  <td className="py-2 px-2 text-right tabular-nums" style={{ color: retColor(s.avgReturn5d) }}>{fmtPct(s.avgReturn5d)}</td>
                  <td className="py-2 px-2 text-right tabular-nums" style={{ color: retColor(s.avgReturn20d) }}>{fmtPct(s.avgReturn20d)}</td>
                  <td className="py-2 px-2 text-right tabular-nums" style={{ color: COLORS.textSecondary }}>{s.buyRate}%</td>
                  <td className="py-2 px-2 text-left"><div className="flex gap-1.5 flex-wrap">{s.top3.map((tk) => (<span key={tk.symbol} className="text-[10px] tabular-nums" style={{ color: COLORS.textSecondary }}>{tk.symbol.replace(".T", "")}<span style={{ color: COLORS.textFaint }}>({tk.adaptiveScore})</span></span>))}</div></td>
                  <td className="py-2 px-2 text-right" style={{ color: COLORS.primary }}>→</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AppCard>
    </div>
  );
}
