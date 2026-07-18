"use client";

// ── Decision Terminal V2 + AI Portfolio Manager（P15-03 + P16-01）─────────────
// 投资闭环：AI推荐 → 加入持有 → AI每日管理 → 卖出 → History → 统计收益。
// 顶部组合摘要 + 今日决策条 + 今日行动摘要 + 当前持有(真实持仓 CRUD) + 机会/等待/观察(加入持有)
// + 右栏(风险→系统状态→市场) + 历史交易。所有股票点击 → 统一 Modal(含买/卖/编辑)。
// 纯 UI + 新增 Portfolio API；不改 Decision Engine/Runtime Ranking/评分/权重/GPT/Cron/现有 API。
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { AppLoading } from "@/components/ui";
import type { Tone } from "@/lib/design-tokens";
import { fmtJpy, fmtPct, fmtScore, fmtJstClock, riskTone } from "@/lib/decision/ds";
import { actionIcon } from "@/lib/decision/verdict";
import { actionColor } from "@/lib/decision/terminal";
import { useDecision } from "@/lib/decision/provider";
import { useHoldings } from "@/lib/portfolio/use-holdings";
import { MarketSnapshot, RiskPanel, type MktItem, type RiskItem } from "@/components/decision/ds/panels";
import { DecisionBar, PortfolioSummaryBar, ActionSummary, HoldingsTable, OpportunityTable, SystemStatus, HistoryPanel, FunnelBar,
  type HoldRow, type PickRow, type ColLabels, type HistoryRow } from "@/components/decision/ds/overview-panels";
import StockDetailModal, { type DetailRow } from "@/components/decision/StockDetailModal";
import HoldingDialogs, { type HoldingDialog } from "@/components/decision/HoldingDialogs";

/* eslint-disable @typescript-eslint/no-explicit-any */
const REGIME_TONE = (r: string | null): Tone => (r === "BULL" ? "green" : r === "BEAR" ? "red" : "amber");
const pctv = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v)}%`);
const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

export default function DecisionOverviewV2() {
  const { t } = useI18n();
  const { overview, loading } = useDecision();
  const { data: pf, history, refresh } = useHoldings();
  const o = overview as any;
  const [detail, setDetail] = useState<DetailRow | null>(null);
  const [dlg, setDlg] = useState<HoldingDialog>(null);
  const sel = detail?.symbol ?? null;

  if (loading) return <div className="max-w-[1760px] mx-auto px-4 sm:px-6 py-8"><AppLoading label={t("dv.ov2.title")} /></div>;
  if (!o || o.ok === false || o.empty) {
    return <div className="max-w-[1760px] mx-auto px-4 sm:px-6 py-14 text-center"><div className="text-[15px] font-semibold">{t("dv.ov2.title")}</div><div className="text-[12px] mt-1" style={{ color: "#9CA3AF" }}>{t("dc.ov.noData")}</div></div>;
  }

  const gd = o.globalDecision ?? {}, fr = o.freshness ?? {}, mc = o.marketContext ?? {};
  const regime: string | null = mc.regime ?? null;
  const regimeLabel = regime && ["BULL", "SIDEWAYS", "BEAR"].includes(regime) ? t(`dc.regime.${regime}` as Parameters<typeof t>[0]) : (regime ?? "—");
  const actLabel = (a: string) => t(`dv.act.${a}` as Parameters<typeof t>[0]);
  const cols: ColLabels = { symbol: t("dv.col.symbol"), action: t("dv.col.action"), current: t("dv.col.current"), pnl: t("dv.col.pnl"), change: t("dv.col.change"), entry: t("dv.col.entry"), target: t("dv.col.target"), stop: t("dv.col.stop"), ai: t("dv.col.ai"), detail: t("dv.col.detail") };

  // ① 今日决策条
  const bar = {
    icon: actionIcon(gd.action), actionLabel: gd.headlineKey ? t(gd.headlineKey as Parameters<typeof t>[0]) : "—",
    instruction: gd.instructionKey ? t(gd.instructionKey as Parameters<typeof t>[0]) : "",
    totalPosLabel: t("dv.ov2.totalPos"), totalPos: pctv(gd.targetTotalPositionPct), addPosLabel: t("dv.ov2.addPos"), addPos: pctv(gd.additionalPositionPct),
    maxSingleLabel: t("dv.ov2.maxSingle"), maxSingle: pctv(gd.maxSingleStockPct),
    riskLabel: t("db.riskLevel"), risk: gd.riskLevel ?? "—", riskTone: riskTone(gd.riskLevel),
    confLabel: t("dv.ctx.confidence"), confidence: fmtScore(gd.confidence),
    phaseLabel: t("dv.ov2.phaseLabel"), phase: o.marketPhase ? t(`dv.phase.${o.marketPhase}` as Parameters<typeof t>[0]) : "—",
    executable: !!gd.isExecutable, execLabel: t(gd.isExecutable ? "dv.ov2.executable" : "dv.ov2.notExec"),
    blockedLabel: gd.blockedReasonKey ? t(gd.blockedReasonKey as Parameters<typeof t>[0]) : null,
    freshLine: `${t("dv.fresh.next")} ${fr.nextDecisionAt ?? "—"}`,
  };

  // ② 当前持有（真实用户持仓）
  const userHoldings: any[] = pf?.holdings ?? [];
  const userHoldMap = new Map<string, any>(userHoldings.map((h) => [h.symbol, h]));
  const holdRows: HoldRow[] = userHoldings.map((h) => ({
    symbol: h.symbol, name: h.name, action: h.action, actionLabel: actLabel(h.action),
    pnl: fmtPct(h.returnPct), pnlTone: (h.returnPct ?? 0) < 0 ? "red" : "green",
    current: fmtJpy(h.currentPrice), target: fmtJpy(h.target), stop: fmtJpy(h.stop), ai: h.ai ?? null,
  }));

  // ③④⑤ 候选
  const toPickRow = (d: any): PickRow => {
    const rc = d.rankChange;
    return {
      rank: (d.runtimeRank ?? d.universeRank) != null ? String(d.runtimeRank ?? d.universeRank) : "—",
      rankDelta: d.isNew ? t("dv.rt.new") : rc != null && rc > 0 ? `↑${rc}` : rc != null && rc < 0 ? `↓${Math.abs(rc)}` : undefined,
      deltaTone: d.isNew ? "amber" : rc != null && rc > 0 ? "green" : rc != null && rc < 0 ? "red" : undefined,
      symbol: d.symbol, name: d.name, ai: d.aiScore ?? null, action: d.action, actionLabel: actLabel(d.action),
      price: fmtJpy(d.currentPrice), changePct: fmtPct(d.changePct), changeTone: (d.changePct ?? 0) > 0 ? "green" : (d.changePct ?? 0) < 0 ? "red" : "neutral",
      entry: d.buyRangeLow != null && d.buyRangeHigh != null ? `${fmtJpy(d.buyRangeLow)}~${fmtJpy(d.buyRangeHigh)}` : "—",
      target: fmtJpy(d.targetPrice1), stop: fmtJpy(d.stopLossPrice),
    };
  };
  const exec: any[] = o.executeNow ?? [], wait: any[] = o.waitList ?? [], watch: any[] = o.backups ?? [];
  const pickMap = new Map<string, any>([...exec, ...wait, ...watch].map((d) => [d.symbol, d]));
  const detailFor = (sym: string): DetailRow | null => {
    const h = userHoldMap.get(sym);
    if (h) return { symbol: sym, name: h.name, action: h.action, actionLabel: actLabel(h.action), actionColor: actionColor(h.action), currentPrice: h.currentPrice, returnPct: h.returnPct, target1: h.target, stopLoss: h.stop, aiScore: h.ai, isHolding: true };
    const d = pickMap.get(sym);
    if (d) return { symbol: sym, name: d.name, action: d.action, actionLabel: actLabel(d.action), actionColor: actionColor(d.action), currentPrice: d.currentPrice, changePct: d.changePct, entryLow: d.buyRangeLow, entryHigh: d.buyRangeHigh, target1: d.targetPrice1, target2: d.targetPrice2, stopLoss: d.stopLossPrice, aiScore: d.aiScore, runtimeRank: d.runtimeRank, riskLevel: d.riskLevel, isHolding: false };
    return null;
  };
  const openDetail = (sym: string) => setDetail(detailFor(sym));

  // Portfolio 操作
  const heldSet = new Set<string>(userHoldings.map((h) => h.symbol));
  const priceOf = (sym: string) => userHoldMap.get(sym)?.currentPrice ?? pickMap.get(sym)?.currentPrice ?? null;
  const nameOf = (sym: string) => userHoldMap.get(sym)?.name ?? pickMap.get(sym)?.name ?? sym;
  const onAdd = (sym: string) => setDlg({ mode: "buy", symbol: sym, name: nameOf(sym), price: priceOf(sym) });
  const onSell = (sym: string) => { const h = userHoldMap.get(sym); if (h) setDlg({ mode: "sell", symbol: sym, name: h.name, shares: h.shares, price: h.currentPrice }); };
  const onEdit = (sym: string) => { const h = userHoldMap.get(sym); if (h) setDlg({ mode: "edit", symbol: sym, name: h.name, avgCost: h.avgCost, shares: h.shares, note: h.note }); };
  const onDelete = async (sym: string) => { if (!window.confirm(t("dv.pf.deleteConfirm"))) return; await fetch(`/api/holdings/${encodeURIComponent(sym)}`, { method: "DELETE" }); refresh(); };
  const dlgDone = () => { setDlg(null); refresh(); };

  // ⑮ 组合摘要
  const sum = pf?.summary;
  const summaryItems = sum ? [
    { label: t("dv.pf.sumHoldings"), value: String(sum.count) },
    { label: t("dv.pf.sumUnrealized"), value: sum.unrealizedPct != null ? fmtPct(sum.unrealizedPct) : "—", tone: (sum.unrealizedPnl ?? 0) < 0 ? "red" as Tone : "green" as Tone },
    { label: t("dv.pf.sumToday"), value: sum.todayPct != null ? fmtPct(sum.todayPct) : "—", tone: (sum.todayPnl ?? 0) < 0 ? "red" as Tone : "green" as Tone },
    { label: t("dv.pf.sumPosition"), value: pctv(sum.positionPct) },
    { label: t("dv.pf.sumCash"), value: pctv(sum.cashPct) },
  ] : [];

  // ⑪ 今日行动摘要
  const hc = (a: string) => userHoldings.filter((h) => h.action === a).length;
  const actionItems = [
    { action: "BUY", label: t("dv.rate.buy"), count: exec.length },
    { action: "WAIT", label: t("dv.rate.wait"), count: wait.length },
    { action: "HOLD", label: t("dv.rate.watch"), count: watch.length },
    { action: "STOP_LOSS", label: actLabel("STOP_LOSS"), count: hc("STOP_LOSS") },
    { action: "REDUCE", label: actLabel("REDUCE"), count: hc("REDUCE") },
    { action: "TAKE_PROFIT", label: actLabel("TAKE_PROFIT"), count: hc("TAKE_PROFIT") },
  ];
  const onActionClick = (a: string) => scrollTo(a === "BUY" ? "sec-exec" : a === "WAIT" ? "sec-wait" : a === "HOLD" ? "sec-watch" : "sec-holdings");

  // 右栏
  const mkItems: MktItem[] = [
    { label: "Nikkei 225", value: mc.nikkei != null ? Math.round(mc.nikkei).toLocaleString() : "—", change: mc.nikkeiChange ?? null, pct: mc.nikkeiChange ?? null },
    { label: "TOPIX", value: mc.topix != null ? String(Math.round(mc.topix * 10) / 10) : "—", change: mc.topixChange ?? null, pct: mc.topixChange ?? null },
    { label: "USD/JPY", value: mc.usdjpy != null ? String(Math.round(mc.usdjpy * 100) / 100) : "—", change: null, pct: null },
    { label: "VIX", value: mc.vix != null ? String(Math.round(mc.vix * 100) / 100) : "—", change: null, pct: null },
    { label: "NASDAQ", value: mc.nasdaq != null ? Math.round(mc.nasdaq).toLocaleString() : "—", change: mc.nasdaqChange ?? null, pct: mc.nasdaqChange ?? null },
  ];
  const riskItems: RiskItem[] = (o.risks ?? []).map((r: any) => ({ labelKey: r.key, level: r.level, tone: riskTone(r.level), note: r.note ?? undefined }));
  const dot = (ok: boolean) => (ok ? "#34C759" : "#9CA3AF");
  const ssItems = [
    { label: t("dv.pf.ss.quote"), status: fr.quoteSource === "realtime" ? t("dv.pf.ss.realtime") : t("dv.fresh.eod"), value: fmtJstClock(fr.quoteUpdatedAt), dot: dot(fr.quoteSource === "realtime" && !fr.stale) },
    { label: t("dv.pf.ss.decision"), status: t("dv.pf.ss.latest"), value: fmtJstClock(fr.decisionUpdatedAt), dot: dot(!!fr.decisionUpdatedAt) },
    { label: t("dv.pf.ss.runtime"), status: t("dv.pf.ss.latest"), value: fmtJstClock(fr.rankingUpdatedAt), dot: dot(!!fr.rankingUpdatedAt) },
    { label: t("dv.pf.ss.holdings"), status: t("dv.pf.ss.synced"), value: String(userHoldings.length), dot: dot(true) },
    { label: t("dv.pf.ss.next"), status: "", value: fr.nextDecisionAt ?? "—", dot: "#9CA3AF" },
  ];

  // ⑧ 历史
  const histRows: HistoryRow[] = (history?.history ?? []).map((h: any) => ({
    symbol: h.symbol, name: h.name, sellDate: h.sellDate, returnPct: fmtPct(h.returnPct), retTone: (h.returnPct ?? 0) < 0 ? "red" : "green",
    pnl: h.realizedPnl != null ? fmtJpy(h.realizedPnl) : "—", days: h.holdingDays != null ? `${h.holdingDays}d` : "—",
    reason: h.reason ? t(`dv.pf.r.${h.reason}` as Parameters<typeof t>[0]) : "—", beatTopix: h.beatTopix, beatNikkei: h.beatNikkei,
  }));

  const s = o.top200Summary ?? {}; const turn = o.runtime?.turnover ?? s.turnover ?? {};
  const funnelSteps = [
    { label: t("dv.ov2.universe"), value: s.universe != null ? String(s.universe) : "—" }, { label: "Top200", value: String(s.top200 ?? 200) },
    { label: t("dv.ov2.candidates"), value: String(s.candidates ?? 0) }, { label: t("dv.ov2.shown"), value: String(s.shown ?? 0) }, { label: t("dv.rt.turnover"), value: String(turn.replacedToday ?? 0) },
  ];

  return (
    <div className="max-w-[1760px] mx-auto px-4 sm:px-6 py-3 space-y-2.5">
      {summaryItems.length > 0 && <PortfolioSummaryBar items={summaryItems} />}
      <DecisionBar {...bar} />
      <ActionSummary title={t("dv.pf.actionSummary")} items={actionItems} onClick={onActionClick} />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-9 space-y-3 min-w-0">
          <div id="sec-holdings"><HoldingsTable title={t("dv.ov2.holdingsTitle")} emptyLabel={t("dv.pf.empty")} rows={holdRows} selected={sel} cols={cols} labels={{ edit: t("dv.pf.btnEdit"), sell: t("dv.pf.btnSell"), del: t("dv.pf.delete") }} onDetail={openDetail} onEdit={onEdit} onSell={onSell} onDelete={onDelete} /></div>
          <div id="sec-exec"><OpportunityTable title={t("dv.ov2.recTitle")} tone="#34C759" count={exec.length} rows={exec.map(toPickRow)} selected={sel} cols={cols} addLabel={t("dv.pf.btnAdd")} onDetail={openDetail} onAdd={onAdd} /></div>
          <div id="sec-wait"><OpportunityTable title={t("dv.grp.waitList")} tone="#F5A623" count={wait.length} rows={wait.map(toPickRow)} selected={sel} cols={cols} addLabel={t("dv.pf.btnAdd")} onDetail={openDetail} onAdd={onAdd} /></div>
          <div id="sec-watch"><OpportunityTable title={t("dv.ov2.watchTitle")} tone="#9AA0A6" count={watch.length} rows={watch.map(toPickRow)} selected={sel} cols={cols} addLabel={t("dv.pf.btnAdd")} onDetail={openDetail} onAdd={onAdd} /></div>
          {histRows.length > 0 && <HistoryPanel title={t("dv.pf.histTitle")} emptyLabel={t("dv.pf.histEmpty")} rows={histRows} cols={{ date: "", pnl: "", days: "", vs: "" }} />}
        </div>
        <div className="lg:col-span-3 space-y-3 min-w-0">
          <div className="lg:sticky lg:top-16 space-y-3">
            <RiskPanel items={riskItems} overall={gd.riskLevel ?? "—"} overallTone={riskTone(gd.riskLevel)} />
            <SystemStatus title={t("dv.pf.ss.title")} items={ssItems} />
            <MarketSnapshot items={mkItems} trend={mc.trendScore != null ? String(Math.round(mc.trendScore * 10) / 10) : "—"} breadth={mc.breadth != null ? `${Math.round(mc.breadth)}%` : "—"} vol={mc.volatility != null ? String(Math.round(mc.volatility * 10) / 10) : "—"} regimeLabel={regimeLabel} regimeTone={REGIME_TONE(regime)} asOf={mc.asOf ?? "—"} />
          </div>
        </div>
      </div>
      <FunnelBar title={t("dv.ov2.funnelTitle")} steps={funnelSteps} />
      <StockDetailModal row={detail} heldSet={heldSet} onBuy={onAdd} onSell={onSell} onEdit={onEdit} onClose={() => setDetail(null)} />
      <HoldingDialogs dialog={dlg} onClose={() => setDlg(null)} onDone={dlgDone} />
    </div>
  );
}
