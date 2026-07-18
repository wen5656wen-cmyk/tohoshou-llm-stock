"use client";

// ── Decision History V2（P14-DEV-06 · /decision-v2?tab=history）─────────────────────
// Decision Review Center：复盘/统计/学习/验证「AI 过去的决策表现如何」——非日志、非推荐记录。
// 数据 SSOT = GET /api/decision/history（后端统一计算，前端零指标计算）。
// ⑦ AI Learning 硬降级：项目无真实 AI 学习产物 → 显「暂无」+ 确定性就绪度评级，绝不伪造总结。
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { AppCard, AppBadge, AppLoading } from "@/components/ui";
import type { Tone } from "@/lib/design-tokens";
import { COLORS, fmtJpy, fmtPct, fmtScore, upDownColor } from "@/lib/decision/ds";
import { verdictIcon, verdictTone } from "@/lib/decision/verdict";

type Sum = { totalRecommendations: number; cumulativeReturn: number | null; hitRate: number | null; avgReturn: number | null; alpha: number | null; bestReturn: number | null; bestSymbol: string | null; worstReturn: number | null; worstSymbol: string | null; maxDrawdown: number | null; winRate: number | null; cohortDays: number; horizon: string };
type TL = { date: string | null; verdict: string | null; verdictReason: string | null; regime: string | null; avgAiScore: number | null; summary: string | null; finalReturn: number | null; topPicks: string[] };
type Rec = { date: string | null; symbol: string; name: string; buyPrice: number | null; currentPrice: number | null; target1: number | null; stopLoss: number | null; finalReturn: number | null; aiScore: number | null; recommendation: string | null; reason: string | null; statusKey: string; statusTone: string };
type Cat = { categoryKey: string; count: number; avgReturn: number | null; hitRate: number | null };
type Reason = { categoryKey: string; count: number; pct: number | null; avgReturn: number | null };
type Hist = { empty?: boolean; summary: Sum; timeline: TL[]; records: Rec[]; strategyAnalysis: Cat[]; successReasons: Reason[]; failureReasons: Reason[]; analysis: { settledCount: number; stopHits: number; totalWins: number; totalLoss: number }; aiLearning: { available: boolean; note: string; readiness: { strategyType: string; reportDate: string | null; grade: string | null; integrityScore: number | null; recommendation: string | null }[] }; asOf: string | null };

const REGIME_KEY: Record<string, string> = { BULL: "dv.dh.regime.BULL", BEAR: "dv.dh.regime.BEAR", SIDEWAYS: "dv.dh.regime.SIDEWAYS" };

export default function DecisionHistoryV2() {
  const { t } = useI18n();
  const [data, setData] = useState<Hist | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/decision/history", { cache: "no-store" }).then((r) => r.json()).then((j) => { if (alive) { setData(j); setLoading(false); } }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (loading) return <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-10"><AppLoading label={t("dv.nav.history")} /></div>;
  if (!data || data.empty) return <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-16 text-center text-[13px]" style={{ color: COLORS.textFaint }}>{t("dv.dh.empty")}</div>;

  const sm = data.summary;
  const stratLabel = (s: string) => t((s === "DAY_TRADE" ? "dv.pf.strat.DAY" : s === "SWING_TRADE" ? "dv.pf.strat.SWING" : "dv.pf.strat.LONG") as Parameters<typeof t>[0]);
  const Stat = ({ k, v, tone, sub }: { k: ReactNode; v: string; tone?: string; sub?: string }) => (
    <div className="rounded-lg px-2.5 py-2" style={{ background: COLORS.tile }}><div className="text-[10px]" style={{ color: COLORS.textFaint }}>{k}</div><div className="text-[15px] font-bold tabular-nums" style={{ color: tone ?? COLORS.text }}>{v}</div>{sub && <div className="text-[9px] truncate" style={{ color: COLORS.textFaint }}>{sub}</div>}</div>
  );
  const ReasonList = ({ rows, empty }: { rows: Reason[]; empty: boolean }) => (
    empty || !rows.length ? <div className="text-[12px]" style={{ color: COLORS.textFaint }}>{t("dv.dh.emptyAnalysis")}</div> : (
      <div className="space-y-1.5">{rows.map((r) => (
        <div key={r.categoryKey}>
          <div className="flex justify-between text-[11px]" style={{ color: COLORS.textSecondary }}>
            <span>{t(r.categoryKey as Parameters<typeof t>[0])} <span className="text-[10px]" style={{ color: COLORS.textFaint }}>×{r.count}</span></span>
            <span className="tabular-nums" style={{ color: upDownColor(r.avgReturn) }}>{fmtPct(r.avgReturn)}</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: COLORS.borderSoft }}><div className="h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, r.pct ?? 0))}%`, background: COLORS.primary }} /></div>
        </div>))}
      </div>
    )
  );

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 space-y-3">
      {/* ① Performance Summary */}
      <AppCard header={
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2"><span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("dv.dh.perfTitle")}</span><AppBadge tone="blue">{t("dv.dh.reviewCenter")}</AppBadge></div>
          <span className="text-[10px]" style={{ color: COLORS.textFaint }}>{t("dv.dh.question")} · {data.asOf}</span>
        </div>}>
        <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-9 gap-2">
          <Stat k={t("dv.dh.totalRecs")} v={String(sm.totalRecommendations)} />
          <Stat k={t("dv.dh.cumReturn")} v={fmtPct(sm.cumulativeReturn)} tone={upDownColor(sm.cumulativeReturn)} />
          <Stat k={t("dv.dh.hitRate")} v={sm.hitRate != null ? `${Math.round(sm.hitRate)}%` : "—"} />
          <Stat k={t("dv.dh.avgReturn")} v={fmtPct(sm.avgReturn)} tone={upDownColor(sm.avgReturn)} />
          <Stat k={t("dv.dh.alpha")} v={fmtPct(sm.alpha)} tone={upDownColor(sm.alpha)} />
          <Stat k={t("dv.dh.bestReturn")} v={fmtPct(sm.bestReturn)} tone={COLORS.success} sub={sm.bestSymbol ?? undefined} />
          <Stat k={t("dv.dh.worstReturn")} v={fmtPct(sm.worstReturn)} tone={COLORS.danger} sub={sm.worstSymbol ?? undefined} />
          <Stat k={t("dv.dh.maxDrawdown")} v={fmtPct(sm.maxDrawdown)} tone={sm.maxDrawdown != null ? COLORS.danger : undefined} />
          <Stat k={t("dv.dh.winRate")} v={sm.winRate != null ? `${Math.round(sm.winRate)}%` : "—"} />
        </div>
        <div className="text-[10px] mt-2" style={{ color: COLORS.textFaint }}>{t("dv.dh.cohortNote").replace("{n}", String(sm.cohortDays))}</div>
      </AppCard>

      <div className="grid grid-cols-1 lg:grid-cols-[7fr_3fr] gap-3">
        {/* 左：② Timeline + ③ Records */}
        <div className="space-y-3 min-w-0">
          {/* ② Decision Timeline */}
          <AppCard header={<span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("dv.dh.timelineTitle")}</span>}>
            {data.timeline.length ? (
              <div className="space-y-1">
                {data.timeline.map((d) => {
                  const isOpen = open === d.date;
                  return (
                    <div key={d.date} className="rounded-lg" style={{ background: isOpen ? COLORS.tile : undefined }}>
                      <button onClick={() => setOpen(isOpen ? null : d.date)} className="w-full flex items-center gap-2 py-1.5 px-2 text-left">
                        <span className="text-[11px] tabular-nums shrink-0" style={{ color: COLORS.textFaint, width: 74 }}>{d.date}</span>
                        <span className="text-base leading-none">{verdictIcon(d.verdict)}</span>
                        <AppBadge tone={verdictTone(d.verdict)}>{d.verdict ? t(`dc.verdict.${d.verdict}` as Parameters<typeof t>[0]) : "—"}</AppBadge>
                        {d.regime && <span className="text-[10px]" style={{ color: COLORS.textFaint }}>{t((REGIME_KEY[d.regime] ?? "dv.dh.regime.SIDEWAYS") as Parameters<typeof t>[0])}</span>}
                        <span className="ml-auto text-[12px] font-semibold tabular-nums" style={{ color: upDownColor(d.finalReturn) }}>{fmtPct(d.finalReturn)}</span>
                        <span className="text-[10px]" style={{ color: COLORS.textFaint }}>{isOpen ? "▲" : "▼"}</span>
                      </button>
                      {isOpen && (
                        <div className="px-2 pb-2 text-[11px] space-y-1" style={{ color: COLORS.textSecondary }}>
                          {d.summary && <p className="leading-relaxed">{d.summary}</p>}
                          {d.verdictReason && <p style={{ color: COLORS.textFaint }}>{d.verdictReason}</p>}
                          {d.topPicks.length > 0 && <div className="flex items-center gap-1 flex-wrap"><span style={{ color: COLORS.textFaint }}>{t("dv.dh.topPicks")}:</span>{d.topPicks.map((n, i) => <AppBadge key={i} tone="neutral">{n}</AppBadge>)}</div>}
                          <div style={{ color: COLORS.textFaint }}>AI {fmtScore(d.avgAiScore)}</div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {data.timeline.every((d) => d.finalReturn == null) && <div className="text-[10px] mt-1.5" style={{ color: COLORS.textFaint }}>{t("dv.dh.pendingNote")}</div>}
              </div>
            ) : <div className="text-[12px]" style={{ color: COLORS.textFaint }}>{t("dv.dh.empty")}</div>}
          </AppCard>

          {/* ③ Decision Records */}
          <AppCard header={<div className="flex items-center justify-between"><span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("dv.dh.recordsTitle")}</span><span className="text-[10px]" style={{ color: COLORS.textFaint }}>{data.records.length}</span></div>}>
            {data.records.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
                  <thead><tr className="text-[10px]" style={{ color: COLORS.textFaint }}>
                    {[t("dv.dh.date"), t("wl.col.stock"), t("dv.dh.recPrice"), t("dv.pf.col.current"), t("dc.ov.target"), t("dc.ov.stopLossP"), t("dv.dh.finalReturn"), "AI", t("wl.col.status")].map((h, i) => (
                      <th key={i} className={`py-1.5 font-medium ${i === 1 ? "text-left pr-2 sticky left-0 bg-white" : i === 0 ? "text-left pr-2" : "text-right px-2"}`} style={i === 1 ? { background: COLORS.card } : undefined}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {data.records.map((r, i) => (
                      <tr key={`${r.symbol}-${r.date}-${i}`} style={{ borderTop: `1px solid ${COLORS.borderSoft}` }} title={r.reason ?? undefined}>
                        <td className="py-1.5 pr-2 tabular-nums" style={{ color: COLORS.textFaint }}>{r.date}</td>
                        <td className="py-1.5 pr-2 sticky left-0" style={{ background: COLORS.card }}>
                          <Link href={`/stocks/${encodeURIComponent(r.symbol)}`} className="hover:underline" style={{ color: COLORS.text }}>{r.name}</Link>
                          <span className="ml-1 text-[10px] font-mono" style={{ color: COLORS.textFaint }}>{r.symbol}</span>
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums" style={{ color: COLORS.textSecondary }}>{fmtJpy(r.buyPrice)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums" style={{ color: COLORS.text }}>{fmtJpy(r.currentPrice)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums" style={{ color: COLORS.success }}>{fmtJpy(r.target1)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums" style={{ color: COLORS.danger }}>{fmtJpy(r.stopLoss)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums font-semibold" style={{ color: upDownColor(r.finalReturn) }}>{fmtPct(r.finalReturn)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums" style={{ color: COLORS.text }}>{fmtScore(r.aiScore)}</td>
                        <td className="py-1.5 px-2 text-right"><AppBadge tone={r.statusTone as Tone}>{t(r.statusKey as Parameters<typeof t>[0])}</AppBadge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="text-[10px] mt-1.5" style={{ color: COLORS.textFaint }}>SSOT: DailyRecommendation · {t("dv.dh.recPrice")}={t("dv.dh.recPriceNote")}</div>
              </div>
            ) : <div className="text-[12px]" style={{ color: COLORS.textFaint }}>{t("dv.dh.empty")}</div>}
          </AppCard>
        </div>

        {/* 右：④ Strategy + ⑤ Success + ⑥ Failure + ⑦ AI Learning */}
        <div className="space-y-3 min-w-0">
          {/* ④ Strategy Analysis */}
          <AppCard header={<span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("dv.dh.strategyTitle")}</span>}>
            <table className="w-full text-[12px]">
              <thead><tr className="text-[10px]" style={{ color: COLORS.textFaint }}>
                <th className="text-left font-medium py-1">{t("dv.dh.category")}</th>
                <th className="text-right font-medium py-1">{t("dv.dh.avgReturn")}</th>
                <th className="text-right font-medium py-1">{t("dv.dh.hitRate")}</th>
                <th className="text-right font-medium py-1">{t("dv.dh.uses")}</th>
              </tr></thead>
              <tbody>
                {data.strategyAnalysis.map((c) => (
                  <tr key={c.categoryKey} style={{ borderTop: `1px solid ${COLORS.borderSoft}` }}>
                    <td className="py-1.5" style={{ color: COLORS.textSecondary }}>{t(c.categoryKey as Parameters<typeof t>[0])}</td>
                    <td className="py-1.5 text-right tabular-nums" style={{ color: upDownColor(c.avgReturn) }}>{fmtPct(c.avgReturn)}</td>
                    <td className="py-1.5 text-right tabular-nums" style={{ color: COLORS.text }}>{c.hitRate != null ? `${Math.round(c.hitRate)}%` : "—"}</td>
                    <td className="py-1.5 text-right tabular-nums" style={{ color: COLORS.textFaint }}>{c.count || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-[10px] mt-1.5" style={{ color: COLORS.textFaint }}>{t("dv.dh.catNote")}</div>
          </AppCard>

          {/* ⑤ Success Analysis */}
          <AppCard header={<div className="flex items-center justify-between"><span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("dv.dh.successTitle")}</span><span className="text-[10px]" style={{ color: COLORS.success }}>×{data.analysis.totalWins}</span></div>}>
            <ReasonList rows={data.successReasons} empty={data.analysis.settledCount === 0} />
          </AppCard>

          {/* ⑥ Failure Analysis */}
          <AppCard header={<div className="flex items-center justify-between"><span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("dv.dh.failureTitle")}</span><span className="text-[10px]" style={{ color: COLORS.danger }}>×{data.analysis.totalLoss}</span></div>}>
            <ReasonList rows={data.failureReasons} empty={data.analysis.settledCount === 0} />
            {data.analysis.stopHits > 0 && <div className="text-[10px] mt-2" style={{ color: COLORS.textFaint }}>{t("dv.dh.stopHits")}: {data.analysis.stopHits}</div>}
          </AppCard>

          {/* ⑦ AI Learning（硬降级：无 AI 总结） */}
          <AppCard header={<span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("dv.dh.learningTitle")}</span>}>
            <div className="rounded-lg px-3 py-2 mb-2" style={{ background: `${COLORS.textFaint}12` }}>
              <div className="text-[12px] font-semibold" style={{ color: COLORS.textSecondary }}>{t("dv.dh.learningNA")}</div>
              <div className="text-[10px] mt-0.5" style={{ color: COLORS.textFaint }}>{data.aiLearning.note}</div>
            </div>
            {data.aiLearning.readiness.length > 0 && (
              <>
                <div className="text-[10px] mb-1" style={{ color: COLORS.textFaint }}>{t("dv.dh.readinessTitle")} · {t("dv.dh.readinessNote")}</div>
                <div className="space-y-1">
                  {data.aiLearning.readiness.map((r) => (
                    <div key={r.strategyType} className="flex items-center justify-between text-[12px] py-0.5" style={{ borderBottom: `1px solid ${COLORS.borderSoft}` }}>
                      <span style={{ color: COLORS.textSecondary }}>{stratLabel(r.strategyType)}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-[10px] tabular-nums" style={{ color: COLORS.textFaint }}>{t("dv.dh.integrity")} {fmtScore(r.integrityScore)}</span>
                        <AppBadge tone={r.recommendation === "READY" ? "green" : r.recommendation === "PARTIAL" ? "amber" : "neutral"}>{r.grade ?? "—"}</AppBadge>
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </AppCard>
        </div>
      </div>
    </div>
  );
}
