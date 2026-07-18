"use client";

// ── Decision Overview V1（P15-01B · /decision-v2?tab=overview）─────────────────
// 行动优先：全局 9 态实时决策 → 需处理的持仓 → 三组候选 → 市场/风险/新闻/新鲜度依据。
// 唯一数据入口 = DecisionProvider.overview（/api/admin/decision-overview 聚合，规则引擎派生）。
// Decision 随实时价变化，Score 不变；缺字段一律 — / 诚实降级，禁伪造。
import { useI18n } from "@/lib/i18n";
import { AppLoading } from "@/components/ui";
import type { Tone } from "@/lib/design-tokens";
import { fmtJpy, fmtPct, fmtScore, fmtJstClock, riskTone } from "@/lib/decision/ds";
import { actionIcon, actionTone } from "@/lib/decision/verdict";
import { useDecision } from "@/lib/decision/provider";
import { MarketSnapshot, RiskPanel, NewsCatalystPanel,
  type MktItem, type RiskItem, type NewsItem, type CatItem } from "@/components/decision/ds/panels";
import { ActionHero, HoldingsActionPanel, PickGroup, FreshnessPanel, FunnelBar,
  type HoldRow, type PickRow } from "@/components/decision/ds/overview-panels";

/* eslint-disable @typescript-eslint/no-explicit-any */
const REGIME_TONE = (r: string | null): Tone => (r === "BULL" ? "green" : r === "BEAR" ? "red" : "amber");
const pct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v)}%`);

export default function DecisionOverviewV2() {
  const { t, lang } = useI18n();
  const { overview, loading } = useDecision();
  const o = overview as any;

  if (loading) return <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-10"><AppLoading label={t("dv.ov2.title")} /></div>;

  if (!o || o.ok === false || o.empty) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-16 text-center">
        <div className="text-[15px] font-semibold">{t("dv.ov2.title")}</div>
        <div className="text-[12px] mt-1" style={{ color: "#9CA3AF" }}>{t("dc.ov.noData")} · {t("dv.fresh.next")} {o?.freshness?.nextDecisionAt ?? "—"}</div>
      </div>
    );
  }

  const gd = o.globalDecision ?? {};
  const fr = o.freshness ?? {};
  const mc = o.marketContext ?? {};
  const actionKey = String(gd.action ?? "");
  const regime: string | null = mc.regime ?? null;
  const regimeLabel = regime && ["BULL", "SIDEWAYS", "BEAR"].includes(regime) ? t(`dc.regime.${regime}` as Parameters<typeof t>[0]) : (regime ?? "—");

  // ── 全局决策卡 ──
  const freshBits = [
    `${t("dv.fresh.decision")} ${fmtJstClock(fr.decisionUpdatedAt)}${fr.decidedAtJst ? ` (${fr.decidedAtJst})` : ""}`,
    `${t("dv.fresh.validUntil")} ${fr.validUntil ?? "—"}`,
    `${t("dv.fresh.next")} ${fr.nextDecisionAt ?? "—"}`,
  ];
  if (fr.quoteSource === "EOD") freshBits.push(t("dv.ov2.refPrice"));
  const hero = {
    title: t("dv.ov2.actionTitle"),
    icon: actionIcon(actionKey),
    actionLabel: gd.headlineKey ? t(gd.headlineKey as Parameters<typeof t>[0]) : "—",
    tone: actionTone(actionKey) as Tone,
    instruction: gd.instructionKey ? t(gd.instructionKey as Parameters<typeof t>[0]) : "",
    totalPosLabel: t("dv.ov2.totalPos"), totalPos: pct(gd.targetTotalPositionPct),
    addPosLabel: t("dv.ov2.addPos"), addPos: pct(gd.additionalPositionPct),
    maxSingleLabel: t("dv.ov2.maxSingle"), maxSingle: pct(gd.maxSingleStockPct),
    riskLabel: t("db.riskLevel"), risk: gd.riskLevel ?? "—", riskTone: riskTone(gd.riskLevel),
    confLabel: t("dv.ctx.confidence"), confidence: fmtScore(gd.confidence),
    phaseLabel: t("dv.ov2.phaseLabel"), phase: o.marketPhase ? t(`dv.phase.${o.marketPhase}` as Parameters<typeof t>[0]) : "—",
    executable: !!gd.isExecutable, execLabel: t(gd.isExecutable ? "dv.ov2.executable" : "dv.ov2.notExec"),
    blockedLabel: gd.blockedReasonKey ? t(gd.blockedReasonKey as Parameters<typeof t>[0]) : null,
    freshLine: freshBits.join(" · "),
  };

  // ── 持仓动作 ──
  const holdRows: HoldRow[] = (o.holdingsActions ?? []).map((h: any) => ({
    symbol: h.symbol, name: h.name,
    actionLabel: t(`dv.act.${h.action}` as Parameters<typeof t>[0]), tone: actionTone(h.action) as Tone,
    sellPctLabel: h.sellPct > 0 ? `${t("dv.ov2.sellPct")} ${h.sellPct}%` : "",
    returnPct: fmtPct(h.returnPct), returnTone: (h.returnPct ?? 0) < 0 ? "red" : "green",
    costLabel: fmtJpy(h.entryPrice), priceLabel: fmtJpy(h.currentPrice),
    reason: t(h.reasonKey as Parameters<typeof t>[0]),
  }));

  // ── 三组候选 ──
  const toPickRow = (d: any): PickRow => ({
    rank: d.universeRank != null ? String(d.universeRank) : "—",
    symbol: d.symbol, name: d.name,
    price: fmtJpy(d.currentPrice), changePct: fmtPct(d.changePct),
    changeTone: (d.changePct ?? 0) > 0 ? "green" : (d.changePct ?? 0) < 0 ? "red" : "neutral",
    actionLabel: t(`dv.act.${d.action}` as Parameters<typeof t>[0]), tone: actionTone(d.action) as Tone,
    entry: d.buyRangeLow != null && d.buyRangeHigh != null ? `${fmtJpy(d.buyRangeLow)}~${fmtJpy(d.buyRangeHigh)}` : "—",
    target: fmtJpy(d.targetPrice1), stop: fmtJpy(d.stopLossPrice),
    pos: `${t("dv.stk.pos")} ${d.suggestedPositionPct != null ? d.suggestedPositionPct + "%" : "—"}`,
    trigger: t((d.triggerConditionKey ?? d.actionReasonKey ?? "dv.trig.waitQuote") as Parameters<typeof t>[0]),
    score: fmtScore(d.aiScore),
  });
  const pickLabels = { buy: t("dv.stk.buy"), target: t("dv.stk.target"), stop: t("dv.stk.stop"), validUntil: t("dv.stk.validUntil"), validValue: fr.validUntil ?? "—" };

  // ── 市场依据（第二层）──
  const mkItems: MktItem[] = [
    { label: "Nikkei 225", value: mc.nikkei != null ? Math.round(mc.nikkei).toLocaleString() : "—", change: mc.nikkeiChange ?? null, pct: mc.nikkeiChange ?? null },
    { label: "TOPIX", value: mc.topix != null ? String(Math.round(mc.topix * 10) / 10) : "—", change: mc.topixChange ?? null, pct: mc.topixChange ?? null },
    { label: "USD/JPY", value: mc.usdjpy != null ? String(Math.round(mc.usdjpy * 100) / 100) : "—", change: null, pct: null },
    { label: "VIX", value: mc.vix != null ? String(Math.round(mc.vix * 100) / 100) : "—", change: null, pct: null },
    { label: "NASDAQ", value: mc.nasdaq != null ? Math.round(mc.nasdaq).toLocaleString() : "—", change: mc.nasdaqChange ?? null, pct: mc.nasdaqChange ?? null },
  ];
  const riskItems: RiskItem[] = (o.risks ?? []).map((r: any) => ({ labelKey: r.key, level: r.level, tone: riskTone(r.level), note: r.note ?? undefined }));
  const news: NewsItem[] = (o.news ?? []).map((n: any) => ({ id: n.id, title: n.title, time: fmtJstClock(n.publishedAt), symbol: n.symbol, sentiment: n.sentiment, source: n.source }));
  const cats: CatItem[] = (o.catalysts ?? []).map((c: any) => ({ id: c.id, category: c.category, catLabel: c.category, time: fmtJstClock(c.publishedAt), target: c.target, sentiment: c.sentiment }));

  // ── 新鲜度面板 ──
  const freshItems = [
    { label: t("dv.fresh.quote"), value: fr.quoteSource === "realtime" ? `${fmtJstClock(fr.quoteUpdatedAt)} · ${t("dv.fresh.realtime")}` : t("dv.fresh.eod"), tone: (fr.stale ? "red" : undefined) as Tone | undefined },
    { label: t("dv.fresh.ranking"), value: fmtJstClock(fr.rankingUpdatedAt) },
    { label: t("dv.fresh.decision"), value: fmtJstClock(fr.decisionUpdatedAt) },
    { label: t("dv.fresh.holdings"), value: fmtJstClock(fr.holdingsUpdatedAt) },
    { label: t("dv.fresh.validUntil"), value: fr.validUntil ?? "—" },
    { label: t("dv.fresh.next"), value: fr.nextDecisionAt ?? "—" },
  ];

  const s = o.top200Summary ?? {};
  const funnelSteps = [
    { label: t("dv.ov2.universe"), value: s.universe != null ? String(s.universe) : "—" },
    { label: "Top200", value: String(s.top200 ?? 200) },
    { label: t("dv.ov2.candidates"), value: String(s.candidates ?? 0) },
    { label: t("dv.ov2.shown"), value: String(s.shown ?? 0) },
  ];

  void lang;
  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 space-y-3">
      {/* ① 全宽全局决策 */}
      <ActionHero {...hero} />

      {/* ② 需立即处理的持仓 */}
      <HoldingsActionPanel title={t("dv.ov2.holdTitle")} emptyLabel={t("dv.ov2.holdEmpty")} rows={holdRows} />

      {/* ③ 左：三组候选 · 右：依据 */}
      <div className="grid grid-cols-1 lg:grid-cols-[7fr_3fr] gap-3">
        <div className="space-y-3 min-w-0">
          <PickGroup title={t("dv.grp.executeNow")} tone="green" count={(o.executeNow ?? []).length} rows={(o.executeNow ?? []).map(toPickRow)} labels={pickLabels} />
          <PickGroup title={t("dv.grp.waitList")} tone="amber" count={(o.waitList ?? []).length} rows={(o.waitList ?? []).map(toPickRow)} labels={pickLabels} />
          <PickGroup title={t("dv.grp.backups")} tone="neutral" count={(o.backups ?? []).length} rows={(o.backups ?? []).map(toPickRow)} labels={pickLabels} />
        </div>
        <div className="space-y-3 min-w-0">
          <MarketSnapshot items={mkItems} trend={mc.trendScore != null ? String(Math.round(mc.trendScore * 10) / 10) : "—"} breadth={mc.breadth != null ? `${Math.round(mc.breadth)}%` : "—"} vol={mc.volatility != null ? String(Math.round(mc.volatility * 10) / 10) : "—"} regimeLabel={regimeLabel} regimeTone={REGIME_TONE(regime)} asOf={mc.asOf ?? "—"} />
          <RiskPanel items={riskItems} overall={gd.riskLevel ?? "—"} overallTone={riskTone(gd.riskLevel)} />
          <FreshnessPanel title={t("dv.fresh.title")} items={freshItems} />
          <NewsCatalystPanel news={news} catalysts={cats} />
        </div>
      </div>

      {/* ④ Top200 漏斗 */}
      <FunnelBar title={t("dv.ov2.funnelTitle")} steps={funnelSteps} />
    </div>
  );
}
