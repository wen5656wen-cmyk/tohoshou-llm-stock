"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n";

// ── T3 P1: Paper Broker Dashboard (AI 自动交易驾驶舱) ────────────────────────
// Display-only. All data is read from /api/portfolio/paper (read-only aggregation).
// No engine / paper / schema mutation. Insufficient-data states surfaced, never faked.

type Strat = "DAY_TRADE" | "SWING_TRADE" | "LONG_TRADE";

type Lineage = {
  dailyPrice: { latestDate: string | null; count: number };
  stockScore: { latestDate: string | null; count: number };
  strategyRecommendation: { latestDate: string | null; day: number; swing: number; long: number };
  strategyTradeResult: { latestDate: string | null; count: number };
  paperOrder: { latestDate: string | null; count: number };
  paperExecution: { latestDate: string | null; count: number };
  paperPosition: { open: number; total: number };
  paperCashLog: { count: number };
};
type PoolEx = { strategyType: Strat; pool: number; cash: number; positionsValue: number; total: number; openCount: number; cumulativeReturnPct: number; todayPnl: number; todayBuys: number; todaySells: number };
type Holding = {
  strategyType: Strat; symbol: string; name: string | null; nameZh: string | null; quantity: number;
  entryPrice: number; currentPrice: number | null; currentValue: number | null; unrealizedAmount: number | null; unrealizedPct: number | null;
  holdingDays: number | null; aiScore: number | null; action: string | null; riskLevel: string | null;
};
type TradeEx = { time: string; strategyType: Strat; symbol: string; name: string | null; nameZh: string | null; side: string; quantity: number; price: number | null; amount: number | null; status: string; rejectReason: string | null };
type ExecEx = { execDate: string; strategyType: Strat; symbol: string; name: string | null; nameZh: string | null; side: string; quantity: number; price: number; amount: number; priceBasis: string; fee: number; source: string; broker: string };
type NamedRef = { symbol: string; name: string | null; nameZh: string | null; amount: number } | null;
type PaperData = {
  initialized: boolean; mode: string; initialCapital: number;
  totals: { totalAssets: number; totalCash: number; positionsValue: number; cumulativePnl: number; cumulativePnlPct: number; todayPnl: number; realizedPnl: number; unrealizedPnl: number };
  lineage?: Lineage;
  bossSummary?: {
    today: { pnl: number; returnPct: number | null; profited: string };
    assets: { initialCapital: number; totalAssets: number; cash: number; positionsValue: number };
    cumulative: { pnl: number; returnPct: number; benchTopixPct: number | null; benchNikkeiPct: number | null; beatTopix: boolean | null; beatNikkei: boolean | null };
    accountStatus: { mode: string; synced: boolean; paperLatestDate: string | null; strategyLatestDate: string | null; healthCritical: number | null; healthStatus: string | null; pipeline: { done: number; total: number } };
    tradeSummary: { todayBuys: number; todaySells: number; currentPositions: number; totalExecutions: number };
  };
  strategyPools?: PoolEx[];
  holdingsEnhanced?: Holding[];
  todayTradesEnhanced?: TradeEx[];
  recentExecutionsEnhanced?: ExecEx[];
  navSeries?: { insufficient: boolean; points: any[] };
  performanceMetrics?: Record<string, number | null>;
  riskMetrics?: { cashRatio: number; positionRatio: number; maxSingleStock: number; top5Concentration: number; strategyAllocation: { strategyType: Strat; pct: number }[]; consecutiveWinDays: number; consecutiveLossDays: number; riskLevel: string };
  aiDailySummary?: { marketState: string; todayBuys: number; todaySells: number; currentPositions: number; todayPnl: number; cumulativePnl: number; topContributor: NamedRef; topDetractor: NamedRef; riskLevel: string; suggestion: string; running: boolean };
};

const STRAT_COLOR: Record<Strat, string> = { DAY_TRADE: "text-amber-400", SWING_TRADE: "text-blue-400", LONG_TRADE: "text-emerald-400" };
const STRAT_KEY: Record<Strat, MessageKey> = { DAY_TRADE: "strategy.DAY", SWING_TRADE: "strategy.SWING", LONG_TRADE: "strategy.long" };

const yen = (v: number | null | undefined) => (v == null ? "—" : `¥${Math.round(v).toLocaleString("en-US")}`);
const pnlColor = (v: number | null | undefined) => (v == null ? "text-slate-400" : v > 0 ? "text-red-400" : v < 0 ? "text-green-400" : "text-slate-300");
const pnlStr = (v: number | null | undefined) => (v == null ? "—" : `${v > 0 ? "+" : ""}${Math.round(v).toLocaleString("en-US")}`);
const pctStr = (v: number | null | undefined) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`);
const fill = (tpl: string, vars: Record<string, string | number>) => tpl.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));

export default function PortfolioPage() {
  const { t, lang } = useI18n();
  const [data, setData] = useState<PaperData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [explain, setExplain] = useState<{ strategyType: Strat; symbol: string } | null>(null);

  useEffect(() => {
    fetch("/api/portfolio/paper")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: PaperData) => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  const nm = (h: { name: string | null; nameZh: string | null; symbol: string }) =>
    (lang === "zh-CN" ? h.nameZh ?? h.name : h.name) ?? h.symbol;
  const insuf = t("dash.insufficient");
  const mOr = (v: number | null | undefined, fmt: (n: number) => string) => (v == null ? insuf : fmt(v));

  return (
    <div className="p-4 md:p-6 bg-[#0f172a] min-h-screen">
      <div className="max-w-5xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold text-slate-200">{t("dash.title")}</h1>
            <p className="text-xs text-slate-500 mt-0.5">{t("dash.subtitle")}</p>
          </div>
          <span className="text-[10px] px-2 py-1 rounded-full bg-slate-800 text-slate-400 border border-slate-700/50 uppercase tracking-wider">Paper</span>
        </div>
        <div className="rounded-lg border border-amber-700/40 bg-amber-900/15 px-4 py-2.5 text-xs text-amber-300/90">⚠ {t("dash.risk_notice")}</div>

        {loading && <div className="py-16 text-center text-slate-500 text-sm">{t("paper.loading")}</div>}
        {error && <div className="py-16 text-center text-red-400 text-sm">{t("paper.error")}</div>}

        {data && data.bossSummary && !loading && !error && (() => {
          const b = data.bossSummary!;
          const perf = data.performanceMetrics ?? {};
          const risk = data.riskMetrics;
          const ai = data.aiDailySummary;
          return (
          <>
            {/* ── Boss KPI ─────────────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              {/* 今日赚钱了吗 */}
              <Card>
                <CardLabel>{t("dash.today_profit_q")}</CardLabel>
                <div className={`text-xl font-black ${b.today.profited === "YES" ? "text-red-400" : b.today.profited === "NO" ? "text-green-400" : "text-slate-300"}`}>
                  {b.today.profited === "FLAT" ? t("dash.flat") : b.today.profited}
                </div>
                <div className={`text-sm font-bold tabular-nums ${pnlColor(b.today.pnl)}`}>{pnlStr(b.today.pnl)}</div>
                <div className="text-[10px] text-slate-500">{t("dash.today_return")}: {pctStr(b.today.returnPct)}</div>
              </Card>
              {/* 当前资产 */}
              <Card>
                <CardLabel>{t("dash.current_assets")}</CardLabel>
                <div className="text-lg font-bold text-slate-100 tabular-nums">{yen(b.assets.totalAssets)}</div>
                <MiniRow k={t("dash.cash")} v={yen(b.assets.cash)} />
                <MiniRow k={t("dash.positions_value")} v={yen(b.assets.positionsValue)} />
                <div className="text-[10px] text-slate-600">{t("dash.initial_capital")}: {yen(b.assets.initialCapital)}</div>
              </Card>
              {/* 累计表现 */}
              <Card>
                <CardLabel>{t("dash.cumulative_perf")}</CardLabel>
                <div className={`text-lg font-bold tabular-nums ${pnlColor(b.cumulative.pnl)}`}>{pnlStr(b.cumulative.pnl)}</div>
                <div className="text-[11px] text-slate-400">{pctStr(b.cumulative.returnPct)}</div>
                <MiniRow k={t("dash.beat_topix")} v={<BeatTag ok={b.cumulative.beatTopix} t={t} />} />
                <MiniRow k={t("dash.beat_nikkei")} v={<BeatTag ok={b.cumulative.beatNikkei} t={t} />} />
              </Card>
              {/* 账户状态 */}
              <Card>
                <CardLabel>{t("dash.account_status")}</CardLabel>
                <div className="text-sm font-semibold text-slate-200">Paper Broker</div>
                <MiniRow k={t("dash.auto_status")} v={<span className={b.accountStatus.synced ? "text-emerald-400" : "text-amber-400"}>{t(b.accountStatus.synced ? "dash.synced" : "dash.syncing")}</span>} />
                <MiniRow k={t("dash.pipeline")} v={`${b.accountStatus.pipeline.done}/${b.accountStatus.pipeline.total}`} />
                <MiniRow k={t("dash.health_critical")} v={<span className={(b.accountStatus.healthCritical ?? 0) > 0 ? "text-red-400" : "text-emerald-400"}>{b.accountStatus.healthCritical ?? "—"}</span>} />
              </Card>
              {/* 交易摘要 */}
              <Card>
                <CardLabel>{t("dash.trade_summary")}</CardLabel>
                <MiniRow k={t("dash.today_buys")} v={<span className="text-red-400">{b.tradeSummary.todayBuys}</span>} />
                <MiniRow k={t("dash.today_sells")} v={<span className="text-green-400">{b.tradeSummary.todaySells}</span>} />
                <MiniRow k={t("dash.current_positions")} v={String(b.tradeSummary.currentPositions)} />
                <MiniRow k={t("dash.total_executions")} v={String(b.tradeSummary.totalExecutions)} />
              </Card>
            </div>

            {/* ── AI 今日总结 ──────────────────────────────────────── */}
            {ai && (
              <Section title={t("dash.ai_summary_title")}>
                <div className="bg-slate-900/40 rounded-lg border border-slate-700/40 p-4 text-sm text-slate-300 leading-relaxed">
                  {fill(t("dash.ai_tpl"), {
                    state: t(ai.running ? "dash.running_normal" : "dash.running_syncing"),
                    buys: ai.todayBuys, sells: ai.todaySells, positions: ai.currentPositions,
                    todayPnl: `¥${pnlStr(ai.todayPnl)}`, cumPnl: `¥${pnlStr(ai.cumulativePnl)}`,
                    contrib: ai.topContributor ? fill(t("dash.ai_contrib"), { sym: `${ai.topContributor.symbol}` }) : "",
                    detract: ai.topDetractor ? fill(t("dash.ai_detract"), { sym: `${ai.topDetractor.symbol}` }) : "",
                    risk: t(`dash.risk.${ai.riskLevel}` as MessageKey),
                    sug: t(`dash.suggestion.${ai.suggestion}` as MessageKey),
                  })}
                  <span className="block text-[10px] text-slate-600 mt-1.5">{t("dash.market")}: {t(`dash.market.${ai.marketState}` as MessageKey)}</span>
                </div>
              </Section>
            )}

            {/* ── 三策略资金池 ─────────────────────────────────────── */}
            <Section title={t("dash.pools_title")}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {(data.strategyPools ?? []).map((p) => (
                  <div key={p.strategyType} className="bg-slate-900/40 rounded-lg border border-slate-700/40 p-3">
                    <div className="flex items-center justify-between">
                      <div className={`text-sm font-semibold ${STRAT_COLOR[p.strategyType]}`}>{t(STRAT_KEY[p.strategyType])}</div>
                      <div className={`text-xs font-bold tabular-nums ${pnlColor(p.cumulativeReturnPct)}`}>{pctStr(p.cumulativeReturnPct)}</div>
                    </div>
                    <div className="mt-2 space-y-1 text-xs">
                      <Row k={t("dash.pool")} v={yen(p.pool)} />
                      <Row k={t("dash.cash")} v={yen(p.cash)} />
                      <Row k={t("dash.positions_value")} v={yen(p.positionsValue)} />
                      <Row k={t("dash.total_assets")} v={yen(p.total)} strong />
                      <div className="border-t border-slate-700/40 my-1" />
                      <Row k={t("dash.today_pnl")} v={<span className={pnlColor(p.todayPnl)}>{pnlStr(p.todayPnl)}</span>} />
                      <Row k={`${t("dash.today_buys")}/${t("dash.today_sells")}`} v={`${p.todayBuys} / ${p.todaySells}`} />
                      <Row k={t("dash.current_positions")} v={String(p.openCount)} />
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* ── 当前持仓 ─────────────────────────────────────────── */}
            <Section title={`${t("dash.holdings_title")} (${(data.holdingsEnhanced ?? []).length})`}>
              {(data.holdingsEnhanced ?? []).length === 0 ? <Empty text={t("paper.no_positions")} /> : (
                <Table
                  head={[t("dash.col_strategy"), t("common.symbol"), t("dash.col_qty"), t("dash.col_entry"), t("dash.col_current"), t("dash.col_value"), t("dash.col_upnl"), t("dash.col_hold_days"), t("dash.col_ai"), t("dash.col_action"), t("dash.col_risk"), ""]}
                  rows={(data.holdingsEnhanced ?? []).map((h) => [
                    <span key="st" className={`text-[10px] ${STRAT_COLOR[h.strategyType]}`}>{t(STRAT_KEY[h.strategyType])}</span>,
                    <span key="s" className="text-slate-200">{h.symbol}<span className="block text-[10px] text-slate-500">{nm(h)}</span></span>,
                    String(h.quantity), yen(h.entryPrice), yen(h.currentPrice), yen(h.currentValue),
                    <span key="u" className={pnlColor(h.unrealizedAmount)}>{pnlStr(h.unrealizedAmount)}<span className="block text-[10px]">{pctStr(h.unrealizedPct)}</span></span>,
                    h.holdingDays == null ? "—" : String(h.holdingDays),
                    h.aiScore == null ? "—" : h.aiScore.toFixed(0),
                    h.action ?? "—",
                    h.riskLevel ? <span key="rk" className="text-[10px]">{h.riskLevel}</span> : "—",
                    <button key="b" onClick={() => setExplain({ strategyType: h.strategyType, symbol: h.symbol })} className="text-[11px] px-2 py-0.5 rounded bg-slate-700/50 hover:bg-slate-600/60 text-slate-200 border border-slate-600/40">{t("dash.view_reason")}</button>,
                  ])}
                />
              )}
            </Section>

            {/* ── 今日交易 ─────────────────────────────────────────── */}
            <Section title={`${t("dash.today_trades_title")} (${(data.todayTradesEnhanced ?? []).length})`}>
              {(data.todayTradesEnhanced ?? []).length === 0 ? <Empty text={t("paper.no_orders")} /> : (
                <Table
                  head={[t("dash.col_time"), t("dash.col_strategy"), t("common.symbol"), t("dash.col_side"), t("dash.col_qty"), t("dash.col_price"), t("dash.col_amount"), t("dash.col_status"), ""]}
                  rows={(data.todayTradesEnhanced ?? []).map((o, i) => [
                    <span key="tm" className="text-[10px] text-slate-500">{String(o.time).slice(11, 16)}</span>,
                    <span key="st" className={`text-[10px] ${STRAT_COLOR[o.strategyType]}`}>{t(STRAT_KEY[o.strategyType])}</span>,
                    <span key="s" className="text-slate-200">{o.symbol}<span className="block text-[10px] text-slate-500">{nm(o)}</span></span>,
                    <span key="sd" className={o.side === "BUY" ? "text-red-400" : "text-green-400"}>{t(`paper.side.${o.side}` as MessageKey)}</span>,
                    String(o.quantity), yen(o.price), yen(o.amount),
                    <span key="stt" className={o.status === "REJECTED" ? "text-red-400" : "text-slate-300"}>{t(`paper.status.${o.status}` as MessageKey)}{o.rejectReason ? ` · ${safeReject(t, o.rejectReason)}` : ""}</span>,
                    <button key="b" onClick={() => setExplain({ strategyType: o.strategyType, symbol: o.symbol })} className="text-[11px] px-2 py-0.5 rounded bg-slate-700/50 hover:bg-slate-600/60 text-slate-200 border border-slate-600/40">{t("dash.view_reason")}</button>,
                  ])}
                />
              )}
            </Section>

            {/* ── 最近成交 ─────────────────────────────────────────── */}
            <Section title={t("dash.recent_exec_title")}>
              {(data.recentExecutionsEnhanced ?? []).length === 0 ? <Empty text={t("paper.no_executions")} /> : (
                <Table
                  head={[t("dash.col_date"), t("dash.col_strategy"), t("common.symbol"), t("dash.col_side"), t("dash.col_qty"), t("dash.col_price"), t("dash.col_amount"), t("dash.col_fee"), t("dash.col_broker")]}
                  rows={(data.recentExecutionsEnhanced ?? []).map((e) => [
                    String(e.execDate).slice(0, 10),
                    <span key="st" className={`text-[10px] ${STRAT_COLOR[e.strategyType]}`}>{t(STRAT_KEY[e.strategyType])}</span>,
                    <span key="s" className="text-slate-200">{e.symbol}<span className="block text-[10px] text-slate-500">{nm(e)}</span></span>,
                    <span key="sd" className={e.side === "BUY" ? "text-red-400" : "text-green-400"}>{t(`paper.side.${e.side}` as MessageKey)}</span>,
                    String(e.quantity), yen(e.price), yen(e.amount), yen(e.fee),
                    <span key="bk" className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-300">{e.broker}</span>,
                  ])}
                />
              )}
            </Section>

            {/* ── 账户净值 ─────────────────────────────────────────── */}
            <Section title={t("dash.nav_title")}>
              <div className="bg-slate-900/40 rounded-lg border border-slate-700/40 p-6 text-center text-slate-500 text-sm">
                {data.navSeries?.insufficient ? t("dash.accumulating") : t("dash.accumulating")}
              </div>
            </Section>

            {/* ── 绩效分析 ─────────────────────────────────────────── */}
            <Section title={t("dash.perf_title")}>
              <div className="bg-slate-900/40 rounded-lg border border-slate-700/40 p-4 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-xs">
                <Stat k={t("dash.cumulative_return")} v={mOr(perf.cumulativeReturnPct, (n) => pctStr(n))} />
                <Stat k={t("dash.today_return")} v={mOr(perf.todayReturnPct, (n) => pctStr(n))} />
                <Stat k={t("dash.max_drawdown")} v={mOr(perf.maxDrawdown, (n) => pctStr(n))} />
                <Stat k={t("dash.win_rate")} v={mOr(perf.winRate, (n) => `${n.toFixed(1)}%`)} />
                <Stat k={t("dash.avg_profit")} v={mOr(perf.avgProfit, (n) => yen(n))} />
                <Stat k={t("dash.avg_loss")} v={mOr(perf.avgLoss, (n) => yen(n))} />
                <Stat k={t("dash.profit_factor")} v={mOr(perf.profitFactor, (n) => n.toFixed(2))} />
                <Stat k={t("dash.avg_hold_days")} v={mOr(perf.avgHoldingDays, (n) => n.toFixed(1))} />
                <Stat k={t("dash.total_trades")} v={mOr(perf.totalTrades, (n) => String(n))} />
                <Stat k={t("dash.current_positions")} v={mOr(perf.currentPositions, (n) => String(n))} />
                <Stat k={t("dash.cash_ratio")} v={mOr(perf.cashRatio, (n) => `${n.toFixed(1)}%`)} />
                <Stat k={t("dash.position_util")} v={mOr(perf.positionUtilization, (n) => `${n.toFixed(1)}%`)} />
              </div>
            </Section>

            {/* ── 风险中心 ─────────────────────────────────────────── */}
            {risk && (
              <Section title={t("dash.risk_title")}>
                <div className="bg-slate-900/40 rounded-lg border border-slate-700/40 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs text-slate-400">{t("dash.risk_level")}:</span>
                    <span className={`text-xs px-2.5 py-1 rounded-full border font-semibold ${risk.riskLevel === "HIGH" ? "bg-red-900/40 text-red-300 border-red-700/40" : risk.riskLevel === "LOW" ? "bg-emerald-900/40 text-emerald-300 border-emerald-700/40" : "bg-amber-900/40 text-amber-300 border-amber-700/40"}`}>
                      {t(`dash.risk.${risk.riskLevel}` as MessageKey)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-xs">
                    <Stat k={t("dash.cash_ratio")} v={`${risk.cashRatio.toFixed(1)}%`} />
                    <Stat k={t("dash.position_ratio")} v={`${risk.positionRatio.toFixed(1)}%`} />
                    <Stat k={t("dash.max_single")} v={`${risk.maxSingleStock.toFixed(1)}%`} />
                    <Stat k={t("dash.top5")} v={`${risk.top5Concentration.toFixed(1)}%`} />
                    <Stat k={t("dash.consec_win")} v={String(risk.consecutiveWinDays)} />
                    <Stat k={t("dash.consec_loss")} v={String(risk.consecutiveLossDays)} />
                    {risk.strategyAllocation.map((s) => (
                      <Stat key={s.strategyType} k={t(STRAT_KEY[s.strategyType])} v={`${s.pct.toFixed(1)}%`} />
                    ))}
                  </div>
                </div>
              </Section>
            )}

            {/* ── 数据来源 + 流程（保留，折叠） ────────────────────── */}
            <details className="group">
              <summary className="cursor-pointer text-xs font-semibold text-slate-400 uppercase tracking-wider py-2 select-none">
                {t("lineage.title")} · {t("lineage.flow_title")} ▾
              </summary>
              <div className="space-y-5 mt-2">
                <LineageMap t={t} />
                {data.lineage && <FlowTimeline t={t} lin={data.lineage} />}
              </div>
            </details>
          </>
          );
        })()}
      </div>

      {explain && <ExplainDrawer strategyType={explain.strategyType} symbol={explain.symbol} onClose={() => setExplain(null)} />}
    </div>
  );
}

// ── Explain drawer (reads /api/strategy/explain — never recomputes) ──────────
function ExplainDrawer({ strategyType, symbol, onClose }: { strategyType: Strat; symbol: string; onClose: () => void }) {
  const { t } = useI18n();
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/strategy/explain?strategyType=${strategyType}&symbol=${encodeURIComponent(symbol)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((x) => { if (!cancelled) { setD(x); setLoading(false); } })
      .catch(() => { if (!cancelled) { setErr(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [strategyType, symbol]);
  const noExplain = !loading && !err && (!d || d.explanationType === "DATA_INSUFFICIENT");
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md h-full bg-slate-900 border-l border-slate-700/60 shadow-2xl overflow-y-auto">
        <div className="sticky top-0 bg-slate-900 border-b border-slate-700/50 px-5 py-4 flex items-center justify-between z-10">
          <span className="text-lg font-bold text-slate-100">{symbol}</span>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-xl px-1">×</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {loading && <div className="py-8 text-center text-slate-500 text-sm">{t("explain.loading")}</div>}
          {err && <div className="py-8 text-center text-red-400 text-sm">{t("explain.load_error")}</div>}
          {noExplain && <div className="py-8 text-center text-slate-500 text-sm">{t("dash.no_explain")}</div>}
          {d && !loading && !err && !noExplain && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-500">{t("explain.conclusion_label")}</span>
                <span className="text-xs px-2.5 py-1 rounded-full border bg-slate-800 text-slate-200 border-slate-700/50 font-semibold">{t(`explain.conclusion.${d.conclusion}` as MessageKey)}</span>
              </div>
              {d.reasons?.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase mb-1.5">{t("explain.reasons")}</h4>
                  <ul className="space-y-1">{d.reasons.map((r: any) => (
                    <li key={r.code} className="flex justify-between text-xs"><span className="text-slate-300">· {t(`explain.reason.${r.code}` as MessageKey)}</span><span className="text-slate-400 tabular-nums">{r.value?.toFixed?.(1)}</span></li>
                  ))}</ul>
                </div>
              )}
              {d.risks?.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase mb-1.5">{t("explain.risks")}</h4>
                  <div className="flex flex-wrap gap-1.5">{d.risks.map((r: any) => (
                    <span key={r.code} className="text-[11px] px-2 py-1 rounded-md bg-red-900/20 text-red-300/90 border border-red-800/30">{t(`explain.risk.${r.code}` as MessageKey)}</span>
                  ))}</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function BeatTag({ ok, t }: { ok: boolean | null; t: (k: MessageKey) => string }) {
  if (ok == null) return <span className="text-slate-500 text-[10px]">{t("dash.accumulating")}</span>;
  return <span className={ok ? "text-red-400" : "text-green-400"}>{t(ok ? "dash.beat_yes" : "dash.beat_no")}</span>;
}

// ── Data-source mapping (T2 P6, retained) ────────────────────────────────────
function LineageMap({ t }: { t: (k: MessageKey) => string }) {
  const rows: { label: string; src: string[]; note?: string }[] = [
    { label: t("paper.total_assets"), src: ["PaperAccount.cash", "+ PaperPosition.currentValue"] },
    { label: t("paper.cash"), src: ["PaperAccount.cash"] },
    { label: t("paper.positions_value"), src: ["PaperPosition.currentValue"], note: t("lineage.note_daily_market") },
    { label: t("paper.today_pnl"), src: ["PaperExecution", "+ DailyPrice.close"] },
    { label: t("paper.cumulative_pnl"), src: ["PaperCashLog", "+ PaperExecution"] },
    { label: t("paper.positions_title"), src: ["PaperPosition"] },
    { label: t("paper.today_orders_title"), src: ["PaperOrder"] },
    { label: t("paper.executions_title"), src: ["PaperExecution"] },
    { label: t("lineage.src.buy_price"), src: ["StrategyTradeResult.entryPrice", "(PaperExecution.price)"] },
    { label: t("lineage.src.sell_price"), src: ["StrategyTradeResult.exitPrice", "(PaperExecution.price)"] },
    { label: t("lineage.src.latest_price"), src: ["DailyPrice.close"] },
    { label: t("lineage.src.recommendation"), src: ["StrategyRecommendation"] },
    { label: t("lineage.src.signal"), src: ["StrategyTradeResult"] },
    { label: t("lineage.src.score"), src: ["StockScore"] },
    { label: t("lineage.src.ai_explain"), src: ["/api/strategy/explain"] },
  ];
  return (
    <Section title={t("lineage.title")}>
      <div className="bg-slate-900/40 rounded-lg border border-slate-700/40 divide-y divide-slate-800/60">
        {rows.map((r, i) => (
          <div key={i} className="flex items-start justify-between gap-4 px-3 py-2">
            <div className="text-xs text-slate-400 shrink-0">{r.label}</div>
            <div className="text-right">
              <div className="flex flex-wrap justify-end gap-x-1.5">{r.src.map((s, j) => <code key={j} className="text-[11px] font-mono text-slate-300">{s}</code>)}</div>
              {r.note && <div className="text-[10px] text-slate-600 mt-0.5">{r.note}</div>}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function FlowTimeline({ t, lin }: { t: (k: MessageKey) => string; lin: Lineage }) {
  type Stage = { name: string; tip: MessageKey; date: string | null; count: string | null };
  const stages: Stage[] = [
    { name: "J-Quants + Yahoo Finance + TDnet", tip: "lineage.tip.sources", date: null, count: null },
    { name: "DailyPrice", tip: "lineage.tip.dailyPrice", date: lin.dailyPrice.latestDate, count: `${lin.dailyPrice.count} ${t("lineage.unit_rows")}` },
    { name: "StockScore", tip: "lineage.tip.stockScore", date: lin.stockScore.latestDate, count: `${lin.stockScore.count} ${t("lineage.unit_rows")}` },
    { name: "StrategyRecommendation", tip: "lineage.tip.strategyRecommendation", date: lin.strategyRecommendation.latestDate, count: `DAY ${lin.strategyRecommendation.day} · SWING ${lin.strategyRecommendation.swing} · LONG ${lin.strategyRecommendation.long}` },
    { name: "StrategyTradeResult", tip: "lineage.tip.strategyTradeResult", date: lin.strategyTradeResult.latestDate, count: `${lin.strategyTradeResult.count} ${t("lineage.unit_rows")}` },
    { name: "Paper Broker", tip: "lineage.tip.paperBroker", date: null, count: "scripts/paper-broker.ts" },
    { name: "PaperOrder", tip: "lineage.tip.paperOrder", date: lin.paperOrder.latestDate, count: `${lin.paperOrder.count} ${t("lineage.unit_rows")}` },
    { name: "PaperExecution", tip: "lineage.tip.paperExecution", date: lin.paperExecution.latestDate, count: `${lin.paperExecution.count} ${t("lineage.unit_rows")}` },
    { name: "PaperPosition", tip: "lineage.tip.paperPosition", date: null, count: `${lin.paperPosition.open} / ${lin.paperPosition.total}` },
    { name: "PaperCashLog", tip: "lineage.tip.paperCashLog", date: null, count: `${lin.paperCashLog.count} ${t("lineage.unit_rows")}` },
    { name: "/portfolio", tip: "lineage.tip.portfolio", date: null, count: null },
  ];
  return (
    <Section title={t("lineage.flow_title")}>
      <div className="bg-slate-900/40 rounded-lg border border-slate-700/40 p-4">
        <ol className="space-y-0">
          {stages.map((s, i) => {
            const ok = !!(s.date || s.count);
            return (
              <li key={i} className="relative flex gap-3 pb-4 last:pb-0" title={t(s.tip)}>
                {i < stages.length - 1 && <span className="absolute left-[5px] top-4 bottom-0 w-px bg-slate-700/50" aria-hidden />}
                <span className={`mt-1 h-[11px] w-[11px] shrink-0 rounded-full border ${ok ? "bg-emerald-500/70 border-emerald-400/60" : "bg-slate-600 border-slate-500"}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-xs font-mono text-slate-200">{s.name}</code>
                    <span className="text-[10px] text-emerald-400">✅ {t("lineage.status_ok")}</span>
                    <span className="text-slate-600 text-[10px] cursor-help" title={t(s.tip)}>ⓘ</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5 flex flex-wrap gap-x-3">
                    {s.date && <span>{t("lineage.last_update")}: {s.date}</span>}
                    {s.count && <span className="tabular-nums">{s.count}</span>}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </Section>
  );
}

function safeReject(t: (k: MessageKey) => string, reason: string): string {
  const key = `paper.reject.${reason}` as MessageKey;
  const v = t(key);
  return v === key ? reason : v;
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-slate-900/40 rounded-lg border border-slate-700/40 p-3 space-y-1">{children}</div>;
}
function CardLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] text-slate-500 uppercase tracking-wide">{children}</div>;
}
function MiniRow({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex items-center justify-between text-[11px]"><span className="text-slate-500">{k}</span><span className="tabular-nums text-slate-300">{v}</span></div>;
}
function Stat({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex items-center justify-between border-b border-slate-800/50 pb-1"><span className="text-slate-500">{k}</span><span className="tabular-nums text-slate-200 font-medium">{v}</span></div>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{title}</h2>{children}</div>;
}
function Row({ k, v, strong }: { k: string; v: React.ReactNode; strong?: boolean }) {
  return <div className="flex items-center justify-between"><span className="text-slate-500">{k}</span><span className={`tabular-nums ${strong ? "text-slate-200 font-semibold" : "text-slate-300"}`}>{v}</span></div>;
}
function Empty({ text }: { text: string }) {
  return <div className="bg-slate-900/40 rounded-lg border border-slate-700/40 p-6 text-center text-slate-500 text-sm">{text}</div>;
}
function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="bg-slate-900/40 rounded-lg border border-slate-700/40 overflow-x-auto">
      <table className="w-full text-xs">
        <thead><tr className="border-b border-slate-700/40 text-slate-500">{head.map((h, i) => <th key={i} className={`px-3 py-2 ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, ri) => (
          <tr key={ri} className="border-b border-slate-700/20">{r.map((c, ci) => <td key={ci} className={`px-3 py-2 tabular-nums ${ci === 0 ? "text-left" : "text-right text-slate-300"}`}>{c}</td>)}</tr>
        ))}</tbody>
      </table>
    </div>
  );
}
