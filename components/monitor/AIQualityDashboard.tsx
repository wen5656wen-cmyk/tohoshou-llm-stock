"use client";

// ── P22-S2 · AI Quality Dashboard（AI 模型质量监控中心）─────────────────────
//
// 新增独立页面，不改任何现有页面 / IA / 导航。独立 URL /admin/ai-quality，
// AuthGate 保护。全部数据来自唯一聚合 API /api/admin/ai-quality —— 真实历史，
// 无 Mock / 无随机 / 无演示值。任何 null / 空 → 显示 "No Data"，绝不编造。
//
// 8 区域：① 今日推荐质量 ② 命中率 ③ 策略收益 ④ Alpha ⑤ 评分分布(SVG 直方图)
//        ⑥ AI 稳定性 ⑦ 最近推荐表现 ⑧ 数据完整性。图表全部纯 SVG，无第三方图库。

import { useEffect, useState, useCallback } from "react";
import { useI18n } from "@/lib/i18n";
import { AppCard, AppBadge, AppLoading, COLORS } from "@/components/ui";

/* eslint-disable @typescript-eslint/no-explicit-any */

const pct = (v: number | null | undefined, d = 1) => (v == null ? null : `${v > 0 ? "" : ""}${v.toFixed(d)}%`);
const signed = (v: number | null | undefined, d = 2) => (v == null ? null : `${v > 0 ? "+" : ""}${v.toFixed(d)}%`);
const retTone = (v: number | null | undefined) => (v == null ? COLORS.textFaint : v > 0 ? COLORS.success : v < 0 ? COLORS.danger : COLORS.textSecondary);
const fmtJst = (iso: string | null | undefined) => {
  if (!iso) return null;
  try { return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "2-digit", day: "2-digit" }).format(new Date(iso)); } catch { return null; }
};

// SVG sparkline（评分趋势）
function Spark({ values, color, height = 36 }: { values: number[]; color: string; height?: number }) {
  if (values.length < 2) return null;
  const w = 200, h = height, min = Math.min(...values), max = Math.max(...values), rng = max - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - ((v - min) / rng) * (h - 4) - 2).toFixed(1)}`).join(" ");
  return <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"><polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" /></svg>;
}

// SVG 直方图（评分分布）
function Histogram({ data, noDataLabel }: { data: { bucket: string; count: number }[]; noDataLabel: string }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  if (data.every((d) => d.count === 0)) return <div className="text-[13px]" style={{ color: COLORS.textFaint }}>{noDataLabel}</div>;
  return (
    <div className="flex items-end gap-2 h-[140px] pt-2">
      {data.map((d) => (
        <div key={d.bucket} className="flex-1 flex flex-col items-center justify-end gap-1.5 h-full">
          <span className="text-[11px] tabular-nums" style={{ color: COLORS.textSecondary }}>{d.count}</span>
          <div className="w-full rounded-t" style={{ height: `${Math.max((d.count / max) * 100, 1)}%`, background: d.bucket === "95+" || d.bucket === "90-94" ? COLORS.success : d.bucket === "<75" ? COLORS.textFaint : COLORS.primary, minHeight: 2 }} />
          <span className="text-[10px]" style={{ color: COLORS.textFaint }}>{d.bucket}</span>
        </div>
      ))}
    </div>
  );
}

function KV({ k, v, tone, nd }: { k: string; v: React.ReactNode; tone?: string; nd?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-[12px]" style={{ color: COLORS.textFaint }}>{k}</span>
      <span className="text-[13px] font-medium tabular-nums" style={{ color: v == null ? COLORS.textFaint : (tone ?? COLORS.text) }}>{v ?? nd}</span>
    </div>
  );
}

export default function AIQualityDashboard() {
  const { t } = useI18n();
  const tx = t as (k: string) => string;
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const ND = tx("quality.noData");

  const load = useCallback(() => {
    setLoading(true); setErr(null);
    fetch("/api/admin/ai-quality", { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setD).catch((e) => setErr(String(e.message ?? e))).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading && !d) return <div className="dash-font" style={{ background: COLORS.background, minHeight: "100vh" }}><div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8"><AppLoading label={tx("quality.title")} /></div></div>;
  if (err && !d) return <div className="dash-font" style={{ background: COLORS.background, minHeight: "100vh" }}><div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-14 text-center"><div className="text-[15px] font-semibold">{tx("quality.title")}</div><div className="text-[12px] mt-1.5" style={{ color: COLORS.danger }}>{tx("quality.loadError")}: {err}</div></div></div>;

  const rq = d.recQuality;
  const stratLabel = (t: string) => tx(t === "DAY_TRADE" ? "quality.day" : t === "SWING_TRADE" ? "quality.swing" : "quality.long");

  return (
    <div className="dash-font" style={{ background: COLORS.background, minHeight: "100vh" }}>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[19px] font-bold tracking-tight" style={{ color: COLORS.text }}>{tx("quality.title")}</div>
            <div className="text-[11px] mt-0.5" style={{ color: COLORS.textFaint }}>{tx("quality.subtitle")} · {tx("quality.asOf")} {fmtJst(d.generatedAt)} JST</div>
          </div>
          <button onClick={load} className="h-8 px-3 rounded-lg text-[12px] font-semibold" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.text }}>{tx("quality.refresh")}</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {/* ① 今日推荐质量 */}
          <AppCard header={<span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>① {tx("quality.s1")}</span>}>
            <div className="flex flex-wrap gap-1.5 mb-2">
              <AppBadge tone="green">STRONG_BUY {rq.strongBuy}</AppBadge>
              <AppBadge tone="blue">BUY {rq.buy}</AppBadge>
              <AppBadge tone="neutral">HOLD {rq.hold}</AppBadge>
              <AppBadge tone="amber">WATCH {rq.watch}</AppBadge>
              <AppBadge tone="red">AVOID {rq.avoid}</AppBadge>
            </div>
            <KV k={tx("quality.rated")} v={rq.total} />
            <KV k={tx("quality.avgScore")} v={rq.avgScore != null ? rq.avgScore.toFixed(1) : null} nd={ND} />
            <KV k={tx("quality.maxScore")} v={rq.maxScore} nd={ND} tone={COLORS.success} />
            <KV k={tx("quality.minScore")} v={rq.minScore} nd={ND} />
          </AppCard>

          {/* ② 推荐命中率 */}
          <AppCard header={<span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>② {tx("quality.s2")}</span>}>
            {d.hitRate.map((h: any) => (
              <div key={h.horizon} className="flex items-center justify-between gap-2 py-1 border-b" style={{ borderColor: COLORS.borderSoft }}>
                <span className="text-[12px] font-medium" style={{ color: COLORS.textSecondary }}>{h.horizon}</span>
                {h.winRate == null ? <span className="text-[12px]" style={{ color: COLORS.textFaint }}>{ND}</span> : (
                  <span className="text-[12px] tabular-nums flex gap-2">
                    <span style={{ color: retTone(h.winRate - 50) }}>{tx("quality.hitRate")} {h.winRate}%</span>
                    <span style={{ color: retTone(h.avgReturn) }}>{signed(h.avgReturn)}</span>
                    <span style={{ color: COLORS.textFaint }}>n{h.filled}</span>
                  </span>
                )}
              </div>
            ))}
            {d.todayMovement && d.todayMovement.valid > 0 ? (
              <div className="text-[11px] mt-2 flex gap-3" style={{ color: COLORS.textFaint }}>
                <span style={{ color: COLORS.success }}>↑{d.todayMovement.up}</span>
                <span style={{ color: COLORS.danger }}>↓{d.todayMovement.down}</span>
                <span>={d.todayMovement.flat}</span>
                <span>{tx("quality.todayMove")}</span>
              </div>
            ) : <div className="text-[11px] mt-2" style={{ color: COLORS.textFaint }}>{tx("quality.todayMove")}: {ND}</div>}
          </AppCard>

          {/* ④ Alpha */}
          <AppCard header={<span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>④ {tx("quality.s4")}</span>}>
            <KV k="Alpha" v={d.alpha.alpha != null ? d.alpha.alpha.toFixed(2) : null} nd={ND} />
            <KV k="Beta" v={d.alpha.beta != null ? d.alpha.beta.toFixed(2) : null} nd={ND} />
            <div className="mt-1.5 pt-1.5 border-t" style={{ borderColor: COLORS.borderSoft }}>
              <div className="text-[11px] mb-1" style={{ color: COLORS.textFaint }}>{tx("quality.excessRet")}</div>
              {d.alpha.excessReturnByHorizon.map((e: any) => (
                <KV key={e.horizon} k={e.horizon} v={signed(e.avgReturn)} nd={ND} tone={retTone(e.avgReturn)} />
              ))}
            </div>
          </AppCard>
        </div>

        {/* ③ 策略收益 */}
        <AppCard header={<span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>③ {tx("quality.s3")}</span>}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {d.strategies.map((s: any) => (
              <div key={s.type} className="rounded-xl p-3" style={{ background: COLORS.tile }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{stratLabel(s.type)}</span>
                  {s.asOfDate ? <span className="text-[10px]" style={{ color: COLORS.textFaint }}>n{s.sampleCount} · {fmtJst(s.asOfDate)}</span> : <span className="text-[10px]" style={{ color: COLORS.textFaint }}>{ND}</span>}
                </div>
                <KV k={tx("quality.winRate")} v={s.winRate != null ? `${s.winRate.toFixed(0)}%` : null} nd={ND} tone={s.winRate != null ? retTone(s.winRate - 50) : undefined} />
                <KV k={tx("quality.avgRet")} v={signed(s.avgReturn)} nd={ND} tone={retTone(s.avgReturn)} />
                <KV k={tx("quality.maxDD")} v={s.maxDrawdown != null ? `${s.maxDrawdown.toFixed(1)}%` : null} nd={ND} tone={COLORS.danger} />
                <KV k="Sharpe" v={s.sharpe != null ? s.sharpe.toFixed(2) : null} nd={ND} tone={s.sharpe != null ? retTone(s.sharpe) : undefined} />
              </div>
            ))}
          </div>
        </AppCard>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* ⑤ 评分分布 */}
          <AppCard header={<span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>⑤ {tx("quality.s5")}</span>}>
            <Histogram data={d.scoreDistribution} noDataLabel={ND} />
          </AppCard>

          {/* ⑥ AI 稳定性 */}
          <AppCard header={<span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>⑥ {tx("quality.s6")}</span>}>
            <KV k={tx("quality.scoreVol")} v={d.stability.scoreStddev != null ? `σ ${d.stability.scoreStddev.toFixed(2)} (${d.stability.scoreDays}d)` : null} nd={ND} />
            <KV k={tx("quality.decisionVol")} v={`${d.stability.decisionChanges} / ${d.stability.decisionDays}d`} />
            <KV k={tx("quality.recVol")} v={d.stability.recommendationWinRateStddev != null ? `σ ${d.stability.recommendationWinRateStddev.toFixed(1)} (${d.stability.recommendationDays}d)` : null} nd={ND} />
            <div className="mt-2">
              <div className="text-[11px] mb-1" style={{ color: COLORS.textFaint }}>{tx("quality.scoreTrend")}</div>
              <Spark values={d.stability.scoreTrend.map((s: any) => s.avgAiScore).filter((x: any) => x != null)} color={COLORS.primary} />
            </div>
          </AppCard>
        </div>

        {/* ⑦ 最近推荐表现 */}
        <AppCard header={<span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>⑦ {tx("quality.s7")}</span>}>
          {d.recentPerf.length === 0 ? <div className="text-[13px]" style={{ color: COLORS.textFaint }}>{ND}</div> : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead><tr style={{ color: COLORS.textFaint }}>
                  {["quality.col.symbol", "quality.col.type", "quality.col.entry", "quality.col.exit", "quality.col.ret", "quality.col.date"].map((k) => (
                    <th key={k} className="text-left font-medium py-1.5 px-2 whitespace-nowrap">{tx(k)}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {d.recentPerf.map((r: any, i: number) => (
                    <tr key={i} style={{ borderTop: `1px solid ${COLORS.borderSoft}` }}>
                      <td className="py-1.5 px-2 font-mono">{r.symbol}</td>
                      <td className="py-1.5 px-2" style={{ color: COLORS.textFaint }}>{stratLabel(r.type)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{r.entryPrice != null ? `¥${Math.round(r.entryPrice).toLocaleString()}` : ND}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{r.exitPrice != null ? `¥${Math.round(r.exitPrice).toLocaleString()}` : ND}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums font-medium" style={{ color: retTone(r.returnPct) }}>{signed(r.returnPct)}</td>
                      <td className="py-1.5 px-2 whitespace-nowrap" style={{ color: COLORS.textFaint }}>{fmtJst(r.tradeDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AppCard>

        {/* ⑧ 数据完整性 */}
        <AppCard header={<span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>⑧ {tx("quality.s8")}</span>}>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <KV k={tx("quality.coverage")} v={d.integrity.coveragePct != null ? `${d.integrity.coveragePct}%` : null} nd={ND} tone={d.integrity.coveragePct != null && d.integrity.coveragePct < 80 ? COLORS.danger : COLORS.success} />
            <KV k={tx("quality.scoreNull")} v={d.integrity.scoreNull} tone={d.integrity.scoreNull > 0 ? COLORS.danger : COLORS.success} />
            <KV k={tx("quality.decisionToday")} v={d.integrity.decisionToday ? "✓" : "—"} tone={d.integrity.decisionToday ? COLORS.success : COLORS.textFaint} />
            <KV k={tx("quality.newsToday")} v={d.integrity.newsToday} tone={d.integrity.newsToday > 0 ? COLORS.success : COLORS.warning} />
            <KV k={tx("quality.pipeline")} v={`${d.integrity.pipelinePhases - d.integrity.pipelineFailed}/${d.integrity.pipelinePhases}`} tone={d.integrity.pipelineFailed > 0 ? COLORS.danger : COLORS.success} />
          </div>
        </AppCard>

        <div className="text-[10px] text-center pb-4" style={{ color: COLORS.textFaint }}>{tx("quality.footer")}</div>
      </div>
    </div>
  );
}
