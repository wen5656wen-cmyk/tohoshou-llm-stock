"use client";

// ── Decision Overview（P15-02 · 专业交易终端 UI/UX）───────────────────────────
// 顺序：①今日决策 ②当前持有(动作永远第一) ③AI推荐机会 ④等待条件 ⑤观察名单 ⑥新鲜度 ⑦风险 ⑧市场。
// 删除首页新闻流；相关新闻仅在个股详情 Modal。所有股票点击 → 统一 StockDetailModal（不跳页）。
// 纯 UI：只读 useDecision().overview（P15-01B/D 契约不变），不改引擎/权重/评分/API。
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { AppLoading } from "@/components/ui";
import type { Tone } from "@/lib/design-tokens";
import { fmtJpy, fmtPct, fmtScore, fmtJstClock, riskTone } from "@/lib/decision/ds";
import { actionIcon, actionTone } from "@/lib/decision/verdict";
import { useDecision } from "@/lib/decision/provider";
import { MarketSnapshot, RiskPanel, type MktItem, type RiskItem } from "@/components/decision/ds/panels";
import { ActionHero, HoldingsPanel, StockList, FreshnessPanel, FunnelBar, actionColor,
  type HoldRow, type PickRow } from "@/components/decision/ds/overview-panels";
import StockDetailModal, { type DetailRow } from "@/components/decision/StockDetailModal";

/* eslint-disable @typescript-eslint/no-explicit-any */
const REGIME_TONE = (r: string | null): Tone => (r === "BULL" ? "green" : r === "BEAR" ? "red" : "amber");
const pct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v)}%`);

export default function DecisionOverviewV2() {
  const { t } = useI18n();
  const { overview, loading } = useDecision();
  const o = overview as any;
  const [detail, setDetail] = useState<DetailRow | null>(null);

  if (loading) return <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8"><AppLoading label={t("dv.ov2.title")} /></div>;
  if (!o || o.ok === false || o.empty) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-14 text-center">
        <div className="text-[15px] font-semibold">{t("dv.ov2.title")}</div>
        <div className="text-[12px] mt-1" style={{ color: "#9CA3AF" }}>{t("dc.ov.noData")} · {t("dv.fresh.next")} {o?.freshness?.nextDecisionAt ?? "—"}</div>
      </div>
    );
  }

  const gd = o.globalDecision ?? {}, fr = o.freshness ?? {}, mc = o.marketContext ?? {};
  const regime: string | null = mc.regime ?? null;
  const regimeLabel = regime && ["BULL", "SIDEWAYS", "BEAR"].includes(regime) ? t(`dc.regime.${regime}` as Parameters<typeof t>[0]) : (regime ?? "—");
  const actLabel = (a: string) => t(`dv.act.${a}` as Parameters<typeof t>[0]);

  // ── ① 今日决策 ──
  const freshBits = [
    `${t("dv.fresh.decision")} ${fmtJstClock(fr.decisionUpdatedAt)}`,
    `${t("dv.fresh.validUntil")} ${fr.validUntil ?? "—"}`,
    `${t("dv.fresh.next")} ${fr.nextDecisionAt ?? "—"}`,
  ];
  if (fr.quoteSource === "EOD") freshBits.push(t("dv.ov2.refPrice"));
  const hero = {
    title: t("dv.ov2.actionTitle"), icon: actionIcon(gd.action), actionLabel: gd.headlineKey ? t(gd.headlineKey as Parameters<typeof t>[0]) : "—",
    tone: actionTone(gd.action) as Tone, instruction: gd.instructionKey ? t(gd.instructionKey as Parameters<typeof t>[0]) : "",
    totalPosLabel: t("dv.ov2.totalPos"), totalPos: pct(gd.targetTotalPositionPct), addPosLabel: t("dv.ov2.addPos"), addPos: pct(gd.additionalPositionPct),
    maxSingleLabel: t("dv.ov2.maxSingle"), maxSingle: pct(gd.maxSingleStockPct),
    riskLabel: t("db.riskLevel"), risk: gd.riskLevel ?? "—", riskTone: riskTone(gd.riskLevel),
    confLabel: t("dv.ctx.confidence"), confidence: fmtScore(gd.confidence),
    phaseLabel: t("dv.ov2.phaseLabel"), phase: o.marketPhase ? t(`dv.phase.${o.marketPhase}` as Parameters<typeof t>[0]) : "—",
    executable: !!gd.isExecutable, execLabel: t(gd.isExecutable ? "dv.ov2.executable" : "dv.ov2.notExec"),
    blockedLabel: gd.blockedReasonKey ? t(gd.blockedReasonKey as Parameters<typeof t>[0]) : null, freshLine: freshBits.join(" · "),
  };

  // ── ② 当前持有 ──
  const holdings: any[] = o.holdingsActions ?? [];
  const holdRows: HoldRow[] = holdings.map((h) => ({
    symbol: h.symbol, name: h.name, action: h.action, actionLabel: actLabel(h.action),
    returnPct: fmtPct(h.returnPct), returnTone: (h.returnPct ?? 0) < 0 ? "red" : "green",
    sellPct: h.sellPct > 0 ? `${h.sellPct}%` : "", cost: fmtJpy(h.entryPrice), price: fmtJpy(h.currentPrice),
    reason: t(h.reasonKey as Parameters<typeof t>[0]),
  }));
  const holdDetail = new Map<string, DetailRow>(holdings.map((h) => [h.symbol, {
    symbol: h.symbol, name: h.name, action: h.action, actionLabel: actLabel(h.action), actionColor: actionColor(h.action),
    currentPrice: h.currentPrice, returnPct: h.returnPct, target1: h.targetPrice, stopLoss: h.stopLossPrice,
    aiScore: null, runtimeRank: null, riskLevel: null, isHolding: true,
  }]));

  // ── ③④⑤ 候选（星级 + 详情）──
  const starsFor = (grp: "exec" | "wait" | "watch", ai: number | null): [number, string] => {
    if (grp === "exec") return ai != null && ai >= 75 ? [5, t("dv.rate.strongBuy")] : [4, t("dv.rate.buy")];
    if (grp === "wait") return [3, t("dv.rate.wait")];
    return [2, t("dv.rate.watch")];
  };
  const toPickRow = (grp: "exec" | "wait" | "watch") => (d: any): PickRow => {
    const rc = d.rankChange; const [st, sl] = starsFor(grp, d.aiScore);
    return {
      rank: (d.runtimeRank ?? d.universeRank) != null ? String(d.runtimeRank ?? d.universeRank) : "—",
      rankDelta: d.isNew ? t("dv.rt.new") : rc != null && rc > 0 ? `↑${rc}` : rc != null && rc < 0 ? `↓${Math.abs(rc)}` : undefined,
      deltaTone: d.isNew ? "amber" : rc != null && rc > 0 ? "green" : rc != null && rc < 0 ? "red" : undefined,
      symbol: d.symbol, name: d.name, stars: st, starLabel: sl,
      price: fmtJpy(d.currentPrice), changePct: fmtPct(d.changePct), changeTone: (d.changePct ?? 0) > 0 ? "green" : (d.changePct ?? 0) < 0 ? "red" : "neutral",
      action: d.action, actionLabel: actLabel(d.action), tone: actionTone(d.action) as Tone,
      entry: d.buyRangeLow != null && d.buyRangeHigh != null ? `${fmtJpy(d.buyRangeLow)}~${fmtJpy(d.buyRangeHigh)}` : "—",
      target: fmtJpy(d.targetPrice1), stop: fmtJpy(d.stopLossPrice), score: fmtScore(d.aiScore),
      trigger: t((d.triggerConditionKey ?? d.actionReasonKey ?? "dv.trig.waitQuote") as Parameters<typeof t>[0]),
      replaceReason: d.replaceReasonKey ? t(d.replaceReasonKey as Parameters<typeof t>[0]) : undefined,
    };
  };
  const exec: any[] = o.executeNow ?? [], wait: any[] = o.waitList ?? [], watch: any[] = o.backups ?? [];
  const pickDetail = new Map<string, DetailRow>([...exec, ...wait, ...watch].map((d) => [d.symbol, {
    symbol: d.symbol, name: d.name, action: d.action, actionLabel: actLabel(d.action), actionColor: actionColor(d.action),
    currentPrice: d.currentPrice, changePct: d.changePct, entryLow: d.buyRangeLow, entryHigh: d.buyRangeHigh,
    target1: d.targetPrice1, target2: d.targetPrice2, stopLoss: d.stopLossPrice, aiScore: d.aiScore,
    runtimeRank: d.runtimeRank, riskLevel: d.riskLevel, isHolding: false,
  }]));
  const openPick = (s: string) => setDetail(pickDetail.get(s) ?? null);
  const openHold = (s: string) => setDetail(holdDetail.get(s) ?? null);
  const pickLabels = { buy: t("dv.stk.buy"), target: t("dv.stk.target"), stop: t("dv.stk.stop"), why: t("dv.dm.why"), detail: t("dv.dm.detail") };

  // ── ⑦⑧ 底部依据 ──
  const mkItems: MktItem[] = [
    { label: "Nikkei 225", value: mc.nikkei != null ? Math.round(mc.nikkei).toLocaleString() : "—", change: mc.nikkeiChange ?? null, pct: mc.nikkeiChange ?? null },
    { label: "TOPIX", value: mc.topix != null ? String(Math.round(mc.topix * 10) / 10) : "—", change: mc.topixChange ?? null, pct: mc.topixChange ?? null },
    { label: "USD/JPY", value: mc.usdjpy != null ? String(Math.round(mc.usdjpy * 100) / 100) : "—", change: null, pct: null },
    { label: "VIX", value: mc.vix != null ? String(Math.round(mc.vix * 100) / 100) : "—", change: null, pct: null },
    { label: "NASDAQ", value: mc.nasdaq != null ? Math.round(mc.nasdaq).toLocaleString() : "—", change: mc.nasdaqChange ?? null, pct: mc.nasdaqChange ?? null },
  ];
  const riskItems: RiskItem[] = (o.risks ?? []).map((r: any) => ({ labelKey: r.key, level: r.level, tone: riskTone(r.level), note: r.note ?? undefined }));
  const freshItems = [
    { label: t("dv.fresh.quote"), value: fr.quoteSource === "realtime" ? `${fmtJstClock(fr.quoteUpdatedAt)} · ${t("dv.fresh.realtime")}` : t("dv.fresh.eod"), tone: (fr.stale ? "red" : undefined) as Tone | undefined },
    { label: t("dv.fresh.ranking"), value: fmtJstClock(fr.rankingUpdatedAt) },
    { label: t("dv.fresh.decision"), value: fmtJstClock(fr.decisionUpdatedAt) },
    { label: t("dv.fresh.holdings"), value: fmtJstClock(fr.holdingsUpdatedAt) },
    { label: t("dv.fresh.validUntil"), value: fr.validUntil ?? "—" },
    { label: t("dv.fresh.next"), value: fr.nextDecisionAt ?? "—" },
  ];
  const s = o.top200Summary ?? {}; const turn = o.runtime?.turnover ?? s.turnover ?? {};
  const funnelSteps = [
    { label: t("dv.ov2.universe"), value: s.universe != null ? String(s.universe) : "—" },
    { label: "Top200", value: String(s.top200 ?? 200) },
    { label: t("dv.ov2.candidates"), value: String(s.candidates ?? 0) },
    { label: t("dv.ov2.shown"), value: String(s.shown ?? 0) },
    { label: t("dv.rt.turnover"), value: String(turn.replacedToday ?? 0) },
  ];

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-3 space-y-2.5">
      <ActionHero {...hero} />
      <HoldingsPanel title={t("dv.ov2.holdingsTitle")} emptyLabel={t("dv.ov2.holdEmpty")} rows={holdRows} detailLabel={t("dv.dm.detail")} onDetail={openHold} />
      <StockList title={t("dv.ov2.recTitle")} tone="#34C759" count={exec.length} rows={exec.map(toPickRow("exec"))} labels={pickLabels} onDetail={openPick} />
      <StockList title={t("dv.grp.waitList")} tone="#FF9F0A" count={wait.length} rows={wait.map(toPickRow("wait"))} labels={pickLabels} onDetail={openPick} />
      <StockList title={t("dv.ov2.watchTitle")} tone="#9CA3AF" count={watch.length} rows={watch.map(toPickRow("watch"))} labels={pickLabels} onDetail={openPick} />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
        <FreshnessPanel title={t("dv.fresh.title")} items={freshItems} />
        <RiskPanel items={riskItems} overall={gd.riskLevel ?? "—"} overallTone={riskTone(gd.riskLevel)} />
        <MarketSnapshot items={mkItems} trend={mc.trendScore != null ? String(Math.round(mc.trendScore * 10) / 10) : "—"} breadth={mc.breadth != null ? `${Math.round(mc.breadth)}%` : "—"} vol={mc.volatility != null ? String(Math.round(mc.volatility * 10) / 10) : "—"} regimeLabel={regimeLabel} regimeTone={REGIME_TONE(regime)} asOf={mc.asOf ?? "—"} />
      </div>
      <FunnelBar title={t("dv.ov2.funnelTitle")} steps={funnelSteps} />
      <StockDetailModal row={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
