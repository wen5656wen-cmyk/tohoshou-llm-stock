"use client";

// ── Paper Portfolio V2（P14-DEV-05 · /decision-v2?tab=portfolio）───────────────────
// 回答：「若完全按 TOHOSHOU AI 推荐交易，当前组合表现如何」。
// 这是 AI 模拟组合（¥10M Paper Broker，镜像三策略池），非真实券商账户——页面多处明示。
// 数据 SSOT = GET /api/decision/portfolio（后端统一计算，前端零指标计算；走势图仅做显示 rebase）。
// 缺真实来源的字段（Sharpe/Sortino/Calmar/Treynor/InfoRatio/TrackingError、独立调仓表）显「—」，不伪造。
import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { AppCard, AppBadge, AppLoading } from "@/components/ui";
import type { Tone } from "@/lib/design-tokens";
import { COLORS, fmtJpy, fmtPct, fmtScore, upDownColor, riskTone } from "@/lib/decision/ds";

type Holding = { symbol: string; name: string; strategyType: string; entryDate: string | null; holdingDays: number | null; entryPrice: number | null; currentPrice: number | null; returnPct: number | null; returnAmount: number | null; target1: number | null; stopLoss: number | null; aiScore: number | null; sector: string | null; riskLevel: string | null; statusKey: string; statusTone: string };
type NavPt = { date: string; nav: number; topix: number | null; nikkei: number | null };
type Pf = {
  empty?: boolean; initialCapital: number;
  summary: { totalAssets: number; totalCash: number; positionsValue: number; cumulativePnl: number; cumulativePnlPct: number | null; todayPnl: number; realizedPnl: number; unrealizedPnl: number; positionCount: number };
  performance: { todayReturnPct: number | null; cumulativeReturnPct: number | null; alpha: number | null; maxDrawdown: number | null; winRate: number | null; cashRatio: number | null; benchTopixPct: number | null; benchNikkeiPct: number | null; beatTopix: boolean | null };
  holdings: Holding[];
  nav: { insufficient: boolean; points: NavPt[]; note: string };
  risk: { riskLevel: string; maxSingleStock: number | null; top5Concentration: number | null; cashRatio: number | null; strategyAllocation: { strategyType: string; pct: number | null }[] };
  cash: { totalCash: number; cashRatio: number | null; pools: { strategyType: string; cash: number; poolCapital: number; positionsValue: number; openCount: number }[] };
  sectorAlloc: { sector: string; value: number; pct: number | null }[];
  rebalance: { date: string | null; symbol: string; name: string; side: string; quantity: number; price: number | null; amount: number | null; strategyType: string }[];
  rebalanceNote?: string;
  aiSuggestion: { suggestionKey: string; riskLevel: string; todayPnl: number; topContributor: { symbol: string; name: string; amount: number | null } | null; topDetractor: { symbol: string; name: string; amount: number | null } | null };
  asOf: string | null;
};

const RANGES = [{ k: "1W", d: 7 }, { k: "1M", d: 30 }, { k: "3M", d: 90 }, { k: "6M", d: 180 }, { k: "YTD", d: -1 }, { k: "ALL", d: 0 }];
const SEC_COLORS = ["#2563EB", "#7C3AED", "#0891B2", "#EA580C", "#059669", "#DB2777", "#CA8A04", "#64748B"];

export default function DecisionPortfolioV2() {
  const { t } = useI18n();
  const [data, setData] = useState<Pf | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState("ALL");

  useEffect(() => {
    let alive = true;
    fetch("/api/decision/portfolio", { cache: "no-store" }).then((r) => r.json()).then((j) => { if (alive) { setData(j); setLoading(false); } }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const stratLabel = (s: string) => t((s === "DAY_TRADE" ? "dv.pf.strat.DAY" : s === "SWING_TRADE" ? "dv.pf.strat.SWING" : "dv.pf.strat.LONG") as Parameters<typeof t>[0]);

  // 走势图：按 range 切片 + rebase 到区间首点（纯显示，不改后端指标）
  const chart = useMemo(() => {
    const pts = data?.nav.points ?? [];
    if (pts.length < 2) return null;
    const last = pts[pts.length - 1].date;
    const r = RANGES.find((x) => x.k === range)!;
    let cut: string | null = null;
    if (r.d > 0) cut = new Date(new Date(last).getTime() - r.d * 86_400_000).toISOString().slice(0, 10);
    else if (r.d === -1) cut = `${last.slice(0, 4)}-01-01`;
    const vis = cut ? pts.filter((p) => p.date >= cut!) : pts;
    if (vis.length < 2) return null;
    const base = { nav: vis.find((p) => p.nav != null)?.nav ?? null, topix: vis.find((p) => p.topix != null)?.topix ?? null, nikkei: vis.find((p) => p.nikkei != null)?.nikkei ?? null };
    const series = (key: "nav" | "topix" | "nikkei") => {
      const b = base[key]; if (b == null || b === 0) return [];
      return vis.map((p) => ({ date: p.date, v: p[key] == null ? null : ((p[key] as number) / b - 1) * 100 }));
    };
    const pf = series("nav"), tx = series("topix"), nk = series("nikkei");
    const all = [...pf, ...tx, ...nk].map((x) => x.v).filter((v): v is number => v != null);
    const min = Math.min(0, ...all), max = Math.max(0, ...all);
    return { vis, pf, tx, nk, min, max, first: vis[0].date, last };
  }, [data, range]);

  if (loading) return <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-10"><AppLoading label={t("dv.nav.portfolio")} /></div>;
  if (!data || data.empty) return <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-16 text-center text-[13px]" style={{ color: COLORS.textFaint }}>{t("dc.ov.noData")}</div>;

  const { summary: sm, performance: pf, risk, cash } = data;
  const Stat = ({ k, v, tone }: { k: ReactNode; v: string; tone?: string }) => (
    <div className="rounded-lg px-2.5 py-2" style={{ background: COLORS.tile }}><div className="text-[10px]" style={{ color: COLORS.textFaint }}>{k}</div><div className="text-[15px] font-bold tabular-nums" style={{ color: tone ?? COLORS.text }}>{v}</div></div>
  );
  const K = ({ k, v, tone }: { k: ReactNode; v: ReactNode; tone?: string }) => (
    <div className="flex items-center justify-between py-0.5" style={{ borderBottom: `1px solid ${COLORS.borderSoft}` }}>
      <span className="text-[11px]" style={{ color: COLORS.textFaint }}>{k}</span><span className="text-[12px] font-semibold tabular-nums" style={{ color: tone ?? COLORS.text }}>{v}</span>
    </div>
  );
  const Bar = ({ pct, color }: { pct: number | null; color: string }) => (
    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: COLORS.borderSoft }}><div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct ?? 0))}%`, background: color }} /></div>
  );

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 space-y-3">
      {/* ① Summary（明示 AI 模拟组合） */}
      <AppCard header={
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2"><span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("dv.pf.summaryTitle")}</span><AppBadge tone="amber">{t("dv.pf.paperBadge")}</AppBadge></div>
          <span className="text-[10px]" style={{ color: COLORS.textFaint }}>{t("dv.pf.initialCapital")} {fmtJpy(data.initialCapital)} · {data.asOf}</span>
        </div>}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <Stat k={t("dv.pf.totalAssets")} v={fmtJpy(sm.totalAssets)} />
          <Stat k={t("dv.pf.cumulativePct")} v={fmtPct(sm.cumulativePnlPct)} tone={upDownColor(sm.cumulativePnlPct)} />
          <Stat k={t("dv.pf.cumulativePnl")} v={fmtJpy(sm.cumulativePnl)} tone={upDownColor(sm.cumulativePnl)} />
          <Stat k={t("dv.pf.todayPnl")} v={fmtJpy(sm.todayPnl)} tone={upDownColor(sm.todayPnl)} />
          <Stat k={t("dv.pf.positionsValue")} v={fmtJpy(sm.positionsValue)} />
          <Stat k={t("dv.pf.cash")} v={fmtJpy(sm.totalCash)} />
        </div>
        <div className="text-[10px] mt-2 flex items-center gap-1" style={{ color: COLORS.textFaint }}>⚠ {t("dv.pf.disclaimer")}</div>
      </AppCard>

      {/* ③ Performance strip */}
      <AppCard header={<span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("dv.pf.perfTitle")}</span>}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <Stat k={t("dv.pf.today")} v={fmtPct(pf.todayReturnPct)} tone={upDownColor(pf.todayReturnPct)} />
          <Stat k={t("dv.pf.cumulative")} v={fmtPct(pf.cumulativeReturnPct)} tone={upDownColor(pf.cumulativeReturnPct)} />
          <Stat k={t("dv.pf.alpha")} v={fmtPct(pf.alpha)} tone={upDownColor(pf.alpha)} />
          <Stat k={t("dv.pf.maxDrawdown")} v={fmtPct(pf.maxDrawdown)} tone={pf.maxDrawdown != null ? COLORS.danger : undefined} />
          <Stat k={t("dv.pf.winRate")} v={pf.winRate != null ? `${Math.round(pf.winRate)}%` : "—"} />
          <Stat k={t("dv.pf.cashRatio")} v={pf.cashRatio != null ? `${Math.round(pf.cashRatio)}%` : "—"} />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2.5 pt-2.5 text-[11px]" style={{ borderTop: `1px solid ${COLORS.borderSoft}`, color: COLORS.textSecondary }}>
          <span>{t("dv.pf.vsTopix")} <b style={{ color: upDownColor(pf.benchTopixPct) }}>{fmtPct(pf.benchTopixPct)}</b></span>
          <span>{t("dv.pf.vsNikkei")} <b style={{ color: upDownColor(pf.benchNikkeiPct) }}>{fmtPct(pf.benchNikkeiPct)}</b></span>
          {pf.beatTopix != null && <AppBadge tone={pf.beatTopix ? "green" : "red"}>{pf.beatTopix ? t("dv.pf.beatYes") : t("dv.pf.beatNo")} TOPIX</AppBadge>}
          <span className="ml-auto text-[10px]" style={{ color: COLORS.textFaint }}>{t("dv.pf.ratios")}: Sharpe / Sortino / Calmar / Treynor / Info Ratio / Tracking Error — {t("dv.pf.ratiosNote")}</span>
        </div>
      </AppCard>

      <div className="grid grid-cols-1 lg:grid-cols-[7fr_3fr] gap-3">
        {/* 左：走势图 + 持仓 + 调仓 */}
        <div className="space-y-3 min-w-0">
          {/* 走势图 */}
          <AppCard header={
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("dv.pf.trendTitle")}</span>
              <div className="flex items-center gap-1">{RANGES.map((r) => (
                <button key={r.k} onClick={() => setRange(r.k)} className="h-6 px-2 rounded-full text-[11px]" style={{ background: range === r.k ? COLORS.text : COLORS.tile, color: range === r.k ? "#fff" : COLORS.textSecondary }}>{r.k === "ALL" ? t("dv.pf.range.all") : r.k}</button>
              ))}</div>
            </div>}>
            {chart ? (
              <>
                <div className="flex items-center gap-4 text-[11px] mb-1" style={{ color: COLORS.textSecondary }}>
                  <span className="flex items-center gap-1"><i className="inline-block w-3 h-0.5" style={{ background: COLORS.primary }} />{t("dv.pf.legendPf")}</span>
                  <span className="flex items-center gap-1"><i className="inline-block w-3 h-0.5" style={{ background: COLORS.textFaint }} />TOPIX</span>
                  <span className="flex items-center gap-1"><i className="inline-block w-3 h-0.5" style={{ background: COLORS.warning }} />{t("dv.pf.legendNikkei")}</span>
                </div>
                <TrendSvg chart={chart} />
                <div className="flex justify-between text-[10px] mt-0.5" style={{ color: COLORS.textFaint }}><span>{chart.first}</span><span>{data.nav.note}</span><span>{chart.last}</span></div>
              </>
            ) : <div className="text-[12px] py-8 text-center" style={{ color: COLORS.textFaint }}>{t("dv.pf.navInsufficient")}</div>}
          </AppCard>

          {/* ② Holdings */}
          <AppCard header={<div className="flex items-center justify-between"><span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("dv.pf.holdingsTitle")}</span><span className="text-[10px]" style={{ color: COLORS.textFaint }}>{sm.positionCount}</span></div>}>
            {data.holdings.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
                  <thead><tr className="text-[10px]" style={{ color: COLORS.textFaint }}>
                    {[t("wl.col.stock"), t("dv.pf.col.entryDate"), t("dv.pf.col.entryPrice"), t("dv.pf.col.current"), t("dv.pf.col.retPct"), t("dv.pf.col.retAmt"), t("dv.pf.col.target"), t("dv.pf.col.stop"), "AI", t("wl.col.status")].map((h, i) => (
                      <th key={i} className={`py-1.5 font-medium ${i === 0 ? "text-left pr-2 sticky left-0 bg-white" : "text-right px-2"}`} style={i === 0 ? { background: COLORS.card } : undefined}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {data.holdings.map((h, i) => (
                      <tr key={`${h.symbol}-${h.strategyType}-${i}`} style={{ borderTop: `1px solid ${COLORS.borderSoft}` }}>
                        <td className="py-1.5 pr-2 sticky left-0" style={{ background: COLORS.card }}>
                          <Link href={`/stocks/${encodeURIComponent(h.symbol)}`} className="hover:underline" style={{ color: COLORS.text }}>{h.name}</Link>
                          <span className="ml-1 text-[10px] font-mono" style={{ color: COLORS.textFaint }}>{h.symbol}</span>
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums" style={{ color: COLORS.textSecondary }}>{h.entryDate ?? "—"}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums" style={{ color: COLORS.textSecondary }}>{fmtJpy(h.entryPrice)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums" style={{ color: COLORS.text }}>{fmtJpy(h.currentPrice)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums font-semibold" style={{ color: upDownColor(h.returnPct) }}>{fmtPct(h.returnPct)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums" style={{ color: upDownColor(h.returnAmount) }}>{fmtJpy(h.returnAmount)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums" style={{ color: COLORS.success }}>{fmtJpy(h.target1)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums" style={{ color: COLORS.danger }}>{fmtJpy(h.stopLoss)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums" style={{ color: COLORS.text }}>{fmtScore(h.aiScore)}</td>
                        <td className="py-1.5 px-2 text-right"><AppBadge tone={h.statusTone as Tone}>{t(h.statusKey as Parameters<typeof t>[0])}</AppBadge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="text-[10px] mt-1.5" style={{ color: COLORS.textFaint }}>SSOT: AI Paper Broker · {t("dv.pf.paperBadge")}</div>
              </div>
            ) : <div className="text-[12px]" style={{ color: COLORS.textFaint }}>{t("dv.pf.emptyHoldings")}</div>}
          </AppCard>

          {/* ④ Rebalance History */}
          <AppCard header={<div className="flex items-center justify-between"><span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("dv.pf.rebalTitle")}</span><span className="text-[10px]" style={{ color: COLORS.textFaint }}>{data.rebalanceNote ?? t("dv.pf.rebalNote")}</span></div>}>
            {data.rebalance.length ? (
              <div className="overflow-x-auto"><table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
                <tbody>
                  {data.rebalance.map((r, i) => (
                    <tr key={i} style={{ borderTop: i ? `1px solid ${COLORS.borderSoft}` : undefined }}>
                      <td className="py-1.5 pr-2 tabular-nums" style={{ color: COLORS.textFaint }}>{r.date ?? "—"}</td>
                      <td className="py-1.5 pr-2"><AppBadge tone={r.side === "BUY" ? "green" : "red"}>{t((r.side === "BUY" ? "dv.pf.side.BUY" : "dv.pf.side.SELL") as Parameters<typeof t>[0])}</AppBadge></td>
                      <td className="py-1.5 pr-2 truncate" style={{ color: COLORS.text }}>{r.name}<span className="ml-1 text-[10px] font-mono" style={{ color: COLORS.textFaint }}>{r.symbol}</span></td>
                      <td className="py-1.5 px-2 text-right tabular-nums" style={{ color: COLORS.textSecondary }}>{r.quantity}</td>
                      <td className="py-1.5 pl-2 text-right tabular-nums" style={{ color: COLORS.text }}>{fmtJpy(r.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            ) : <div className="text-[12px]" style={{ color: COLORS.textFaint }}>{t("dv.pf.emptyRebal")}</div>}
          </AppCard>
        </div>

        {/* 右：AI建议 + 风险 + 现金 + 板块 */}
        <div className="space-y-3 min-w-0">
          {/* ⑧ AI Rebalance Suggestion */}
          <AppCard header={<span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("dv.pf.sugTitle")}</span>}>
            <div className="rounded-lg px-3 py-2 mb-2" style={{ background: `${data.aiSuggestion.riskLevel === "HIGH" ? COLORS.danger : data.aiSuggestion.riskLevel === "LOW" ? COLORS.success : COLORS.warning}12` }}>
              <div className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t(data.aiSuggestion.suggestionKey as Parameters<typeof t>[0])}</div>
            </div>
            <K k={t("dv.pf.riskOverall")} v={<AppBadge tone={riskTone(data.aiSuggestion.riskLevel)}>{data.aiSuggestion.riskLevel}</AppBadge>} />
            <K k={t("dv.pf.topContrib")} v={data.aiSuggestion.topContributor ? `${data.aiSuggestion.topContributor.name} ${fmtJpy(data.aiSuggestion.topContributor.amount)}` : "—"} tone={COLORS.success} />
            <K k={t("dv.pf.topDetract")} v={data.aiSuggestion.topDetractor ? `${data.aiSuggestion.topDetractor.name} ${fmtJpy(data.aiSuggestion.topDetractor.amount)}` : "—"} tone={COLORS.danger} />
          </AppCard>

          {/* ⑥ Risk Analysis */}
          <AppCard header={<div className="flex items-center justify-between"><span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("dv.pf.riskTitle")}</span><AppBadge tone={riskTone(risk.riskLevel)}>{t("dv.pf.riskOverall")} {risk.riskLevel}</AppBadge></div>}>
            <K k={t("dv.pf.maxSingle")} v={risk.maxSingleStock != null ? `${Math.round(risk.maxSingleStock)}%` : "—"} />
            <K k={t("dv.pf.top5")} v={risk.top5Concentration != null ? `${Math.round(risk.top5Concentration)}%` : "—"} />
            <K k={t("dv.pf.cashRatio")} v={risk.cashRatio != null ? `${Math.round(risk.cashRatio)}%` : "—"} />
            <div className="mt-2 space-y-1.5">
              <div className="text-[10px]" style={{ color: COLORS.textFaint }}>{t("dv.pf.stratAlloc")}</div>
              {risk.strategyAllocation.map((s) => (
                <div key={s.strategyType}>
                  <div className="flex justify-between text-[11px]" style={{ color: COLORS.textSecondary }}><span>{stratLabel(s.strategyType)}</span><span className="tabular-nums">{s.pct != null ? `${Math.round(s.pct)}%` : "—"}</span></div>
                  <Bar pct={s.pct} color={COLORS.primary} />
                </div>
              ))}
            </div>
          </AppCard>

          {/* ⑦ Cash Allocation */}
          <AppCard header={<div className="flex items-center justify-between"><span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("dv.pf.cashTitle")}</span><span className="text-[12px] font-semibold tabular-nums" style={{ color: COLORS.text }}>{cash.cashRatio != null ? `${Math.round(cash.cashRatio)}%` : "—"}</span></div>}>
            <div className="space-y-1">
              {cash.pools.map((pl) => (
                <div key={pl.strategyType} className="flex items-center justify-between text-[12px] py-0.5" style={{ borderBottom: `1px solid ${COLORS.borderSoft}` }}>
                  <span style={{ color: COLORS.textSecondary }}>{stratLabel(pl.strategyType)} <span className="text-[10px]" style={{ color: COLORS.textFaint }}>({pl.openCount})</span></span>
                  <span className="tabular-nums" style={{ color: COLORS.text }}>{fmtJpy(pl.cash)} <span className="text-[10px]" style={{ color: COLORS.textFaint }}>/ {fmtJpy(pl.poolCapital)}</span></span>
                </div>
              ))}
            </div>
          </AppCard>

          {/* ⑤ Sector Allocation */}
          <AppCard header={<span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("dv.pf.sectorTitle")}</span>}>
            {data.sectorAlloc.length ? (
              <div className="space-y-1.5">
                {data.sectorAlloc.map((s, i) => (
                  <div key={s.sector}>
                    <div className="flex justify-between text-[11px]" style={{ color: COLORS.textSecondary }}><span className="truncate">{s.sector}</span><span className="tabular-nums">{s.pct != null ? `${Math.round(s.pct)}%` : "—"}</span></div>
                    <Bar pct={s.pct} color={SEC_COLORS[i % SEC_COLORS.length]} />
                  </div>
                ))}
              </div>
            ) : <div className="text-[12px]" style={{ color: COLORS.textFaint }}>{t("dv.pf.emptySector")}</div>}
          </AppCard>
        </div>
      </div>
    </div>
  );
}

// ── 自绘 SVG 多线走势（组合/TOPIX/日经，rebase 到区间首点，纯显示） ────────────────
function TrendSvg({ chart }: { chart: { vis: NavPt[]; pf: { v: number | null }[]; tx: { v: number | null }[]; nk: { v: number | null }[]; min: number; max: number } }) {
  const W = 600, H = 160, PAD = 4;
  const n = chart.vis.length;
  const span = Math.max(1e-6, chart.max - chart.min);
  const x = (i: number) => PAD + (i / Math.max(1, n - 1)) * (W - 2 * PAD);
  const y = (v: number) => PAD + (1 - (v - chart.min) / span) * (H - 2 * PAD);
  const path = (arr: { v: number | null }[]) => {
    let d = "", pen = false;
    arr.forEach((p, i) => { if (p.v == null) { pen = false; return; } d += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${y(p.v).toFixed(1)} `; pen = true; });
    return d.trim();
  };
  const zeroY = y(0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 170, display: "block" }}>
      <line x1={PAD} y1={zeroY} x2={W - PAD} y2={zeroY} stroke={COLORS.border} strokeWidth={0.8} strokeDasharray="3 3" />
      <path d={path(chart.nk)} fill="none" stroke={COLORS.warning} strokeWidth={1.4} strokeLinejoin="round" />
      <path d={path(chart.tx)} fill="none" stroke={COLORS.textFaint} strokeWidth={1.4} strokeLinejoin="round" />
      <path d={path(chart.pf)} fill="none" stroke={COLORS.primary} strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}
