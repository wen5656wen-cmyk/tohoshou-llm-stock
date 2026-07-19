"use client";

// ── Decision Terminal V2 + AI Portfolio Manager（P15-03 + P16-01）─────────────
// 投资闭环：AI推荐 → 加入持有 → AI每日管理 → 卖出 → History → 统计收益。
// 顶部组合摘要 + 今日决策条 + 今日行动摘要 + 当前持有(真实持仓 CRUD) + 机会/等待/观察(加入持有)
// + 右栏(风险→系统状态→市场) + 历史交易。所有股票点击 → 统一 Modal(含买/卖/编辑)。
// 纯 UI + 新增 Portfolio API；不改 Decision Engine/Runtime Ranking/评分/权重/GPT/Cron/现有 API。
import { useState, useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import { AppLoading } from "@/components/ui";
import type { Tone } from "@/lib/design-tokens";
import { fmtJpy, fmtPct, fmtScore, fmtJstClock, riskTone } from "@/lib/decision/ds";
import { actionIcon } from "@/lib/decision/verdict";
import { useDecision } from "@/lib/decision/provider";
import { useHoldings } from "@/lib/portfolio/use-holdings";
import { computePortfolioHealth } from "@/lib/decision/portfolio-health";
import { getPrimaryName } from "@/lib/company-name";
import { RiskPanel, type RiskItem } from "@/components/decision/ds/panels";
import { PortfolioHealth, AiPerformance, AiAlpha, LearningStatus } from "@/components/decision/ds/insight-panels";
import { DecisionBar, AccountSummary, HoldingsTable, OpportunityTable, SystemStatus, HistoryPanel, MarketPanel, FunnelBar,
  type HoldRow, type PickRow, type ColLabels, type HistoryRow } from "@/components/decision/ds/overview-panels";
import StockDetailModal, { type ReportTarget } from "@/components/decision/StockDetailModal";
import StockSearch from "@/components/decision/StockSearch";
import HoldingDialogs, { type HoldingDialog } from "@/components/decision/HoldingDialogs";

/* eslint-disable @typescript-eslint/no-explicit-any */
const REGIME_TONE = (r: string | null): Tone => (r === "BULL" ? "green" : r === "BEAR" ? "red" : "amber");
const pctv = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v)}%`);
const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

export default function DecisionOverviewV2() {
  const { t, lang } = useI18n();
  const { overview, loading } = useDecision();
  const { data: pf, history, refresh } = useHoldings();
  const o = overview as any;
  const [detail, setDetail] = useState<ReportTarget | null>(null);
  const [dlg, setDlg] = useState<HoldingDialog>(null);
  const [searchFocus, setSearchFocus] = useState(0);
  const [insights, setInsights] = useState<any>(null);
  const sel = detail?.symbol ?? null;

  // P17-03：单一聚合请求（changes/alpha/learning）。随持仓刷新（history 变化）重取。
  useEffect(() => {
    let alive = true;
    fetch("/api/decision/insights", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive) setInsights(j && !j.error ? j : null); }).catch(() => {});
    return () => { alive = false; };
  }, [history]);

  if (loading) return <div className="max-w-[1760px] mx-auto px-4 sm:px-6 py-8"><AppLoading label={t("dv.ov2.title")} /></div>;
  if (!o || o.ok === false || o.empty) {
    return <div className="max-w-[1760px] mx-auto px-4 sm:px-6 py-14 text-center"><div className="text-[15px] font-semibold">{t("dv.ov2.title")}</div><div className="text-[12px] mt-1" style={{ color: "#9CA3AF" }}>{t("dc.ov.noData")}</div></div>;
  }

  const gd = o.globalDecision ?? {}, fr = o.freshness ?? {}, mc = o.marketContext ?? {};
  const regime: string | null = mc.regime ?? null;
  const regimeLabel = regime && ["BULL", "SIDEWAYS", "BEAR"].includes(regime) ? t(`dc.regime.${regime}` as Parameters<typeof t>[0]) : (regime ?? "—");
  const actLabel = (a: string) => t(`dv.act.${a}` as Parameters<typeof t>[0]);
  const cols: ColLabels = { symbol: t("dv.col.symbol"), action: t("dv.col.action"), current: t("dv.col.current"), pnl: t("dv.col.pnl"), change: t("dv.col.change"), entry: t("dv.col.entry"), target: t("dv.col.target"), stop: t("dv.col.stop"), ai: t("dv.col.ai"), detail: t("dv.col.detail") };

  // 名称按 locale 解析（ja→日文原名 name，zh→nameZh）；候选名从 overview.names 映射取，回退行内名。
  const nameMap: Record<string, { name: string | null; nameZh: string | null }> = o.names ?? {};
  const dispName = (symbol: string, fallbackName?: string | null, nameZh?: string | null) =>
    getPrimaryName({ name: nameMap[symbol]?.name ?? fallbackName ?? symbol, nameZh: nameMap[symbol]?.nameZh ?? nameZh ?? null }, lang);

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
    symbol: h.symbol, name: dispName(h.symbol, h.name, h.nameZh), action: h.action, actionLabel: actLabel(h.action),
    pnl: fmtPct(h.returnPct), pnlTone: (h.returnPct ?? 0) < 0 ? "red" : "green",
    current: fmtJpy(h.currentPrice), cost: fmtJpy(h.avgCost), shares: String(h.shares), target: fmtJpy(h.target), stop: fmtJpy(h.stop), ai: h.ai ?? null,
  }));

  // ③④⑤ 候选
  const toPickRow = (d: any): PickRow => {
    const rc = d.rankChange;
    return {
      rank: (d.runtimeRank ?? d.universeRank) != null ? String(d.runtimeRank ?? d.universeRank) : "—",
      rankDelta: d.isNew ? t("dv.rt.new") : rc != null && rc > 0 ? `↑${rc}` : rc != null && rc < 0 ? `↓${Math.abs(rc)}` : undefined,
      deltaTone: d.isNew ? "amber" : rc != null && rc > 0 ? "green" : rc != null && rc < 0 ? "red" : undefined,
      symbol: d.symbol, name: dispName(d.symbol, d.name), ai: d.aiScore ?? null, action: d.action, actionLabel: actLabel(d.action),
      price: fmtJpy(d.currentPrice), changePct: fmtPct(d.changePct), changeTone: (d.changePct ?? 0) > 0 ? "green" : (d.changePct ?? 0) < 0 ? "red" : "neutral",
      entry: d.buyRangeLow != null && d.buyRangeHigh != null ? `${fmtJpy(d.buyRangeLow)}~${fmtJpy(d.buyRangeHigh)}` : "—",
      target: fmtJpy(d.targetPrice1), stop: fmtJpy(d.stopLossPrice),
    };
  };
  const exec: any[] = o.executeNow ?? [], wait: any[] = o.waitList ?? [], watch: any[] = o.backups ?? [];
  const pickMap = new Map<string, any>([...exec, ...wait, ...watch].map((d) => [d.symbol, d]));
  // 打开 AI Research Report（任意股票：持仓/推荐/搜索。数据由报告内 intelligence 拉取）
  const openDetail = (sym: string, nameHint?: string) => {
    const h = userHoldMap.get(sym); const d = pickMap.get(sym);
    setDetail({ symbol: sym, name: dispName(sym, nameHint ?? h?.name ?? d?.name, h?.nameZh), action: h?.action ?? d?.action ?? null, currentPrice: h?.currentPrice ?? d?.currentPrice ?? null, held: h ?? null });
  };

  // Portfolio 操作
  const priceOf = (sym: string) => userHoldMap.get(sym)?.currentPrice ?? pickMap.get(sym)?.currentPrice ?? null;
  const nameOf = (sym: string) => dispName(sym, userHoldMap.get(sym)?.name ?? pickMap.get(sym)?.name, userHoldMap.get(sym)?.nameZh);
  const onAdd = (sym: string) => setDlg({ mode: "buy", symbol: sym, name: detail?.symbol === sym ? detail.name : nameOf(sym), price: (detail?.symbol === sym ? detail.currentPrice : priceOf(sym)) ?? null });
  const onSell = (sym: string) => { const h = userHoldMap.get(sym); if (h) setDlg({ mode: "sell", symbol: sym, name: dispName(sym, h.name, h.nameZh), shares: h.shares, price: h.currentPrice }); };
  const onEdit = (sym: string) => { const h = userHoldMap.get(sym); if (h) setDlg({ mode: "edit", symbol: sym, name: dispName(sym, h.name, h.nameZh), avgCost: h.avgCost, shares: h.shares, note: h.note }); };
  const onDelete = async (sym: string) => { if (!window.confirm(t("dv.pf.deleteConfirm"))) return; await fetch(`/api/holdings/${encodeURIComponent(sym)}`, { method: "DELETE" }); refresh(); };
  const dlgDone = () => { setDlg(null); refresh(); };

  // ⑮ 账户概览（三层，实时聚合 user_holdings + user_trades + cash + realtime quote）
  const sum = pf?.summary;
  const closedTrades: any[] = history?.history ?? [];
  const withBench = closedTrades.filter((x) => x.returnPct != null && x.benchTopixPct != null);
  const alpha = withBench.length ? withBench.reduce((a, x) => a + (x.returnPct - x.benchTopixPct), 0) / withBench.length : null;
  const winRate = history?.summary?.winRate ?? null;
  const realizedTotal = history?.summary?.realizedTotal ?? null;
  const sJpy = (v: number | null | undefined) => (v == null ? "—" : `${v >= 0 ? "+" : "−"}${fmtJpy(Math.abs(v))}`);
  const accLayer1 = sum ? [
    { label: t("dv.acc.totalEquity"), value: fmtJpy(sum.equity) },
    { label: t("dv.acc.today"), value: sJpy(sum.todayPnl), sub: sum.todayPct != null ? fmtPct(sum.todayPct) : undefined, subTone: ((sum.todayPnl ?? 0) < 0 ? "red" : "green") as Tone },
    { label: t("dv.acc.unrealized"), value: sJpy(sum.unrealizedPnl), sub: sum.unrealizedPct != null ? fmtPct(sum.unrealizedPct) : undefined, subTone: ((sum.unrealizedPnl ?? 0) < 0 ? "red" : "green") as Tone },
  ] : [];
  const accLayer2 = sum ? [
    { label: t("dv.pf.sumHoldings"), value: String(sum.count) },
    { label: t("dv.pf.sumPosition"), value: pctv(sum.positionPct) },
    { label: t("dv.pf.sumCash"), value: pctv(sum.cashPct) },
    { label: t("dv.acc.winRate"), value: winRate != null ? `${Math.round(winRate)}%` : "—" },
    { label: t("dv.acc.realized"), value: sJpy(realizedTotal), tone: ((realizedTotal ?? 0) < 0 ? "red" : "green") as Tone },
    { label: t("dv.acc.alpha"), value: alpha != null ? fmtPct(alpha) : "—", tone: ((alpha ?? 0) < 0 ? "red" : "green") as Tone },
  ] : [];

  // 第三层 AI 动作统计（BUY/WAIT=市场机会，HOLD/REDUCE/TP/SL=我的持仓）
  const hc = (a: string) => userHoldings.filter((h) => h.action === a).length;
  const actionItems = [
    { action: "BUY", label: actLabel("BUY"), count: exec.length },
    { action: "WAIT", label: actLabel("WAIT"), count: wait.length },
    { action: "HOLD", label: actLabel("HOLD"), count: hc("HOLD") + hc("ADD") },
    { action: "REDUCE", label: actLabel("REDUCE"), count: hc("REDUCE") },
    { action: "TAKE_PROFIT", label: actLabel("TAKE_PROFIT"), count: hc("TAKE_PROFIT") },
    { action: "STOP_LOSS", label: actLabel("STOP_LOSS"), count: hc("STOP_LOSS") },
  ];
  const onActionClick = (a: string) => scrollTo(a === "BUY" ? "sec-exec" : a === "WAIT" ? "sec-wait" : "sec-holdings");

  // 右栏 · 市场概况（层级化：TOPIX/Nikkei 主 → 趋势 → USD/JPY·VIX·NASDAQ 辅）
  const mkPrimary = [
    { label: "TOPIX", value: mc.topix != null ? String(Math.round(mc.topix * 10) / 10) : "—", chg: mc.topixChange != null ? fmtPct(mc.topixChange) : undefined, chgTone: ((mc.topixChange ?? 0) < 0 ? "red" : "green") as Tone },
    { label: "Nikkei 225", value: mc.nikkei != null ? Math.round(mc.nikkei).toLocaleString() : "—", chg: mc.nikkeiChange != null ? fmtPct(mc.nikkeiChange) : undefined, chgTone: ((mc.nikkeiChange ?? 0) < 0 ? "red" : "green") as Tone },
  ];
  const mkSecondary = [
    { label: "USD/JPY", value: mc.usdjpy != null ? String(Math.round(mc.usdjpy * 100) / 100) : "—" },
    { label: "VIX", value: mc.vix != null ? String(Math.round(mc.vix * 100) / 100) : "—" },
    { label: "NASDAQ", value: mc.nasdaq != null ? Math.round(mc.nasdaq).toLocaleString() : "—" },
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
    symbol: h.symbol, name: dispName(h.symbol, h.name), sellDate: h.sellDate, returnPct: fmtPct(h.returnPct), retTone: (h.returnPct ?? 0) < 0 ? "red" : "green",
    pnl: h.realizedPnl != null ? fmtJpy(h.realizedPnl) : "—", days: h.holdingDays != null ? `${h.holdingDays}d` : "—",
    reason: h.reason ? t(`dv.pf.r.${h.reason}` as Parameters<typeof t>[0]) : "—", beatTopix: h.beatTopix, beatNikkei: h.beatNikkei,
  }));

  const s = o.top200Summary ?? {}; const turn = o.runtime?.turnover ?? s.turnover ?? {};
  const funnelSteps = [
    { label: t("dv.ov2.universe"), value: s.universe != null ? String(s.universe) : "—" }, { label: "Top200", value: String(s.top200 ?? 200) },
    { label: t("dv.ov2.candidates"), value: String(s.candidates ?? 0) }, { label: t("dv.ov2.shown"), value: String(s.shown ?? 0) }, { label: t("dv.rt.turnover"), value: String(turn.replacedToday ?? 0) },
  ];

  const marketClosed = !o.tradingDay || o.marketPhase === "NON_TRADING";
  const focusSearch = () => setSearchFocus((n) => n + 1);

  // ── P17-03 AI Decision Center V1.0 分析模块（复用已加载数据 + insights 聚合，Apple 风）──
  // ⑥ Portfolio Health
  const highRiskCount = riskItems.filter((r) => r.level === "HIGH" || r.level === "EXTREME").length;
  const health = computePortfolioHealth({ summary: sum ? { count: sum.count, marketValue: sum.marketValue, positionPct: sum.positionPct, cashPct: sum.cashPct } : null, holdings: userHoldings.map((h) => ({ symbol: h.symbol, marketValue: h.marketValue ?? null, sector: h.sector ?? null })), riskLevel: gd.riskLevel ?? null, highRiskCount });
  const healthMetrics = [
    { label: t("dv.ph.m.conc"), value: health.maxSinglePct != null ? `${health.maxSinglePct}%` : "—" },
    { label: t("dv.ph.m.sector"), value: String(health.sectorCount) },
    { label: t("dv.ph.m.cash"), value: pctv(health.cashPct) },
    { label: t("dv.ph.m.risk"), value: gd.riskLevel ?? "—" },
  ];

  // ⑦ AI Performance（来自平仓历史 closedTrades）
  const cReturns = closedTrades.map((x) => x.returnPct).filter((v): v is number => v != null);
  const cDays = closedTrades.map((x) => x.holdingDays).filter((v): v is number => v != null);
  const avgRet = cReturns.length ? cReturns.reduce((a, b) => a + b, 0) / cReturns.length : null;
  const avgDays = cDays.length ? Math.round(cDays.reduce((a, b) => a + b, 0) / cDays.length) : null;
  const wins = cReturns.filter((v) => v > 0), losses = cReturns.filter((v) => v < 0);
  const avgWin = wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : null;
  const avgLoss = losses.length ? Math.abs(losses.reduce((a, b) => a + b, 0) / losses.length) : null;
  const riskReward = avgWin != null && avgLoss != null && avgLoss > 0 ? Math.round((avgWin / avgLoss) * 100) / 100 : null;
  const perfRows = [
    { label: t("dv.perf.winRate"), value: winRate != null ? `${Math.round(winRate)}%` : "—" },
    { label: t("dv.perf.avgReturn"), value: avgRet != null ? fmtPct(avgRet) : "—", tone: (avgRet ?? 0) < 0 ? "#FF3B30" : "#34C759" },
    { label: t("dv.perf.avgDays"), value: avgDays != null ? `${avgDays}d` : "—" },
    { label: t("dv.perf.riskReward"), value: riskReward != null ? `${riskReward}` : "—" },
  ];

  // ⑧ AI Alpha / ⑨ Learning（来自 insights 聚合）
  const alphaData = insights?.alpha ?? { windows: [], sinceStart: { port: null, topix: null, nikkei: null, alpha: null } };
  const learning = insights?.learning ?? { closedTrades: 0, decisionRecords: 0, reviewRecords: 0, hit: 0, miss: 0, datasetSize: 0, readyKey: "dv.ls.collecting" };
  const readyTone = learning.readyKey === "dv.ls.ready" ? "#34C759" : learning.readyKey === "dv.ls.partial" ? "#F5A623" : "#9CA3AF";

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-3 space-y-2.5">
      {/* ④ 顶部工具栏（AI Decision Center + 搜索 + 市场状态，64–72px，无大标题） */}
      <div className="flex items-center flex-wrap gap-x-4 gap-y-2" style={{ minHeight: 60, background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, padding: "10px 16px" }}>
        <div className="min-w-0 order-1" style={{ flex: "0 0 auto" }}>
          <div style={{ fontSize: 22, fontWeight: 600, color: "#111827", letterSpacing: "-0.02em", lineHeight: 1.1 }}>AI Decision Center</div>
          <div style={{ fontSize: 12, color: "#8E8E93", marginTop: 2 }}>AI Portfolio Manager</div>
        </div>
        <div className="flex justify-center min-w-0 order-3 sm:order-2" style={{ flex: "1 1 260px" }}><StockSearch onPick={(s, n) => openDetail(s, n)} focusSignal={searchFocus} /></div>
        <div className="ml-auto order-2 sm:order-3" style={{ flex: "0 0 auto", textAlign: "right" }}>
          <div style={{ fontSize: 12.5, color: marketClosed ? "#6B7280" : "#34C759", fontWeight: 600 }}>{t(marketClosed ? "dv.ov2.marketClosed" : "dv.ov2.marketOk")}</div>
          <div className="tabular-nums" style={{ fontSize: 11, color: "#9CA3AF" }}>{fmtJstClock(fr.quoteUpdatedAt)} JST</div>
        </div>
      </div>

      {accLayer1.length > 0 && <AccountSummary layer1={accLayer1} layer2={accLayer2} layer3Label={t("dv.acc.aiActions")} actions={actionItems} onAction={onActionClick} />}
      <DecisionBar {...bar} />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-9 space-y-3 min-w-0">
          <div id="sec-holdings"><HoldingsTable title={t("dv.ov2.holdingsTitle")} emptyLabel={t("dv.pf.empty")} rows={holdRows} selected={sel} cols={{ action: cols.action, current: cols.current, cost: t("dv.pf.avgCost"), shares: t("dv.pf.shares"), pnl: cols.pnl, target: cols.target, stop: cols.stop }} labels={{ edit: t("dv.pf.btnEdit"), sell: t("dv.pf.btnSell"), del: t("dv.pf.delete") }} addLabel={t("dv.pf.btnAdd")} onAddClick={focusSearch} onDetail={openDetail} onEdit={onEdit} onSell={onSell} onDelete={onDelete} /></div>
          <div id="sec-exec"><OpportunityTable title={t("dv.ov2.recTitle")} tone="#34C759" count={exec.length} rows={exec.map(toPickRow)} selected={sel} cols={cols} addLabel={t("dv.pf.btnAdd")} emptyLabel={t("dv.rr.emptyExec")} onDetail={openDetail} onAdd={onAdd} /></div>
          <div id="sec-wait"><OpportunityTable title={t("dv.grp.waitList")} tone="#F5A623" count={wait.length} rows={wait.map(toPickRow)} selected={sel} cols={cols} addLabel={t("dv.pf.btnAdd")} onDetail={openDetail} onAdd={onAdd} collapsible defaultOpen /></div>
          <div id="sec-watch"><OpportunityTable title={t("dv.ov2.watchTitle")} tone="#9AA0A6" count={watch.length} rows={watch.map(toPickRow)} selected={sel} cols={cols} addLabel={t("dv.pf.btnAdd")} onDetail={openDetail} onAdd={onAdd} collapsible defaultOpen={false} /></div>
          {histRows.length > 0 && <HistoryPanel title={t("dv.pf.histTitle")} emptyLabel={t("dv.pf.histEmpty")} rows={histRows} cols={{ date: "", pnl: "", days: "", vs: "" }} />}
        </div>
        {/* 右栏 = 情境侧栏（风险/市场/系统，紧凑常驻） */}
        <div className="lg:col-span-3 space-y-3 min-w-0">
          <RiskPanel items={riskItems} overall={gd.riskLevel ?? "—"} overallTone={riskTone(gd.riskLevel)} />
          <MarketPanel title={t("dv.mk.title")} asOf={mc.asOf ?? "—"} primary={mkPrimary} trendLabel={t("dv.mk.trend")} trend={regimeLabel} trendTone={REGIME_TONE(regime)} secondary={mkSecondary} />
          <SystemStatus title={t("dv.pf.ss.title")} items={ssItems} />
        </div>
      </div>
      {/* 战绩条（全宽页脚，不依赖两栏高度）：组合健康度 / AI超额 / AI表现 / 学习状态 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <PortfolioHealth title={t("dv.ci.health")} health={health} metrics={healthMetrics} t={t} />
        <AiAlpha title={t("dv.ci.alpha")} windows={alphaData.windows} sinceStart={alphaData.sinceStart} labels={{ port: t("dv.alpha.port"), topix: "TOPIX", nikkei: "Nikkei", alpha: t("dv.alpha.alpha"), sinceStart: t("dv.alpha.sinceStart") }} />
        <AiPerformance title={t("dv.ci.perf")} rows={perfRows} emptyLabel={t("dv.perf.empty")} />
        <LearningStatus title={t("dv.ci.learning")} learning={learning} labels={{ closed: t("dv.ls.closed"), decisions: t("dv.ls.decisions"), reviews: t("dv.ls.reviews"), hit: t("dv.ls.hit"), miss: t("dv.ls.miss"), dataset: t("dv.ls.dataset") }} readyLabel={t(learning.readyKey as Parameters<typeof t>[0])} readyTone={readyTone} />
      </div>

      {/* Top200 Runtime 默认折叠（系统运行详情） */}
      <details style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 8 }}>
        <summary style={{ padding: "10px 14px", fontSize: 12, color: "#6B7280", cursor: "pointer", fontWeight: 600 }}>{t("dv.rr.sysDetail")}</summary>
        <div style={{ padding: "0 14px 12px" }}><FunnelBar title={t("dv.ov2.funnelTitle")} steps={funnelSteps} /></div>
      </details>

      <StockDetailModal report={detail} onBuy={onAdd} onSell={onSell} onEdit={onEdit} onClose={() => setDetail(null)} />
      <HoldingDialogs dialog={dlg} onClose={() => setDlg(null)} onDone={dlgDone} />
    </div>
  );
}
