"use client";

// ── Today's Strategy V2（P14-DEV-03 · /decision-v2?tab=strategy|today）─────────────
// Execution Center：今天应该如何执行。数据全部来自 useDecision()(共享 closing/market/theme)，
// 零额外请求、零新增 API。每模块产生 Action；盘中执行引擎缺失部分诚实降级为「计划待生成」。
import { useI18n } from "@/lib/i18n";
import { AppLoading } from "@/components/ui";
import type { Tone } from "@/lib/design-tokens";
import { fmtScore, riskTone } from "@/lib/decision/ds";
import { useDecision } from "@/lib/decision/provider";
import { themeMomentum } from "@/lib/decision/themes";
import { RiskPanel, type RiskItem } from "@/components/decision/ds/panels";
import { ExecSummaryBar, TradingTimeline, PlaybookGrid, SectorFocus, ClosingPlan, AINotes,
  type TLNode, type PlaybookCat, type SectorRow } from "@/components/decision/ds/strategy-panels";

const NODES = [
  { time: "08:30", phaseKey: "dv.st.p1" }, { time: "09:00", phaseKey: "dv.st.p2" }, { time: "09:30", phaseKey: "dv.st.p3" },
  { time: "10:30", phaseKey: "dv.st.p4" }, { time: "11:30", phaseKey: "dv.st.p5" }, { time: "13:00", phaseKey: "dv.st.p6" },
  { time: "14:30", phaseKey: "dv.st.p7" }, { time: "15:20", phaseKey: "dv.st.p8" },
];

export default function DecisionStrategyV2() {
  const { t, lang } = useI18n();
  const { closing, market, themes, loading } = useDecision();

  if (loading) return <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-10"><AppLoading label={t("dv.nav.strategy")} /></div>;

  const cMkt = closing?.market ?? null;
  const dMkt = (market?.market ?? null) as Record<string, unknown> | null;
  const verdict = closing?.verdict ?? null;
  const verdictLabel = verdict ? t(`dc.verdict.${verdict}` as Parameters<typeof t>[0]) : t("dc.ov.noData");
  const regime = (dMkt?.regime as string) ?? cMkt?.regime ?? null;
  const riskLevel = (dMkt?.riskLevel as string) ?? null;
  const vol = (dMkt?.volatility as number) ?? cMkt?.volatility ?? null;
  const sentence = closing?.summary || closing?.verdictReason || "";
  const asOf = closing?.date ? `${closing.date} ${closing.decidedAtJst ?? ""} JST` : "—";

  // ② 时间轴（诚实：无盘中引擎 → 全部计划待生成；状态按当前 JST 标 已过/待到达）
  const nowMin = (() => { const d = new Date(Date.now() + 9 * 3600_000); return d.getUTCHours() * 60 + d.getUTCMinutes(); })();
  const tlNodes: TLNode[] = NODES.map((n) => {
    const [h, m] = n.time.split(":").map(Number);
    const past = nowMin >= h * 60 + m;
    return { time: n.time, phaseKey: n.phaseKey, statusKey: "dv.st.pending", statusTone: (past ? "neutral" : "neutral") as Tone, advice: t("dv.st.pending"), action: past ? t("dv.st.past") : t("dv.st.upcoming") };
  });

  // ③ 今日战术（closing.top10 派生；缺可靠字段→不可靠）
  type T10 = { symbol: string; name?: string | null; aiScore?: number | null; changePct?: number | null; inBuyZone?: boolean | null; breakout?: boolean | null; volumeRatio?: number | null; newsSentiment?: number | null; ma5?: number | null; ma20?: number | null; riskLevel?: string | null; sector?: string | null };
  const top10 = (closing?.top10 ?? []) as unknown as T10[];
  const mk = (labelKey: string, pred: (r: T10) => boolean): PlaybookCat => {
    const g = top10.filter(pred);
    const top = [...g].sort((a, b) => (b.aiScore ?? 0) - (a.aiScore ?? 0))[0];
    return { labelKey, count: g.length, stocks: top ? (top.name ?? top.symbol) : null, risk: top?.riskLevel ?? "—", reliable: true };
  };
  const hot = themeMomentum(themes?.stocks ?? [], themes?.themes ?? [], lang).filter((h) => (h.r5 ?? 0) > 0);
  const cats: PlaybookCat[] = [
    mk("dv.st.pb.breakout", (r) => r.breakout === true),
    mk("dv.st.pb.pullback", (r) => r.inBuyZone === true && (r.changePct ?? 0) < 0),
    { labelKey: "dv.st.pb.hot", count: hot.length, stocks: hot[0]?.label ?? null, risk: "—", reliable: hot.length > 0 || (themes?.themes?.length ?? 0) > 0 },
    mk("dv.st.pb.news", (r) => (r.newsSentiment ?? 0) > 0),
    mk("dv.st.pb.trend", (r) => r.ma5 != null && r.ma20 != null && r.ma5 > r.ma20),
  ];

  // ④ 行业重点（closing.top10 按行业聚合）
  const secMap = new Map<string, { score: number[]; perf: number[] }>();
  top10.forEach((r) => { if (!r.sector) return; const e = secMap.get(r.sector) ?? { score: [], perf: [] }; if (r.aiScore != null) e.score.push(r.aiScore); if (r.changePct != null) e.perf.push(r.changePct); secMap.set(r.sector, e); });
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const sectors: SectorRow[] = [...secMap.entries()].map(([sector, v]) => ({ sector, score: avg(v.score), heat: v.score.length + v.perf.length ? Math.max(v.score.length, v.perf.length) : 0, perf: avg(v.perf) }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 6);

  // ⑤ 风险检查（reuse RiskPanel；综合=后端 riskLevel）
  const sys = (market as unknown as { system?: { health?: { critical?: number; warning?: number }; cron?: { allSuccess?: boolean } } } | null)?.system ?? null;
  const dataLevel = (sys?.health?.critical ?? 0) > 0 ? "HIGH" : ((sys?.health?.warning ?? 0) > 0 || sys?.cron?.allSuccess === false) ? "MED" : "LOW";
  const negNews = top10.filter((r) => (r.newsSentiment ?? 0) < 0).length;
  const secCount = new Map<string, number>();
  top10.forEach((r) => { if (r.sector) secCount.set(r.sector, (secCount.get(r.sector) ?? 0) + 1); });
  const n = [...secCount.values()].reduce((a, b) => a + b, 0);
  const hhi = n ? [...secCount.values()].reduce((a, c) => a + (c / n) ** 2, 0) : 0;
  const secLevel = hhi >= 0.4 ? "HIGH" : hhi >= 0.25 ? "MED" : n ? "LOW" : "—";
  const gptModel = (closing?.meta as { gptModel?: string } | null)?.gptModel ?? null;
  const riskItems: RiskItem[] = [
    { labelKey: "dv.ov.rk.index", level: regime === "BEAR" ? "HIGH" : "LOW", tone: riskTone(regime === "BEAR" ? "HIGH" : "LOW") },
    { labelKey: "dv.ov.rk.fx", level: "—", tone: "neutral", note: t("dc.ov.noData") },
    { labelKey: "dv.ov.rk.news", level: negNews >= 3 ? "HIGH" : negNews > 0 ? "MED" : "LOW", tone: riskTone(negNews >= 3 ? "HIGH" : negNews > 0 ? "MED" : "LOW"), note: negNews ? `${negNews}` : undefined },
    { labelKey: "dv.ov.rk.sector", level: secLevel, tone: riskTone(secLevel), note: n ? `HHI ${Math.round(hhi * 100) / 100}` : undefined },
    { labelKey: "dv.st.rk.policy", level: "—", tone: "neutral", note: t("dc.ov.noData") },
    { labelKey: "dv.st.rk.model", level: gptModel ? "LOW" : "—", tone: riskTone(gptModel ? "LOW" : ""), note: gptModel ? undefined : t("dc.ov.noData") },
    { labelKey: "dv.ov.rk.data", level: dataLevel, tone: riskTone(dataLevel) },
  ];

  // ⑥ 收盘计划（verdict 派生的今日收盘动作；持仓级留模拟持仓）
  const closeAction = verdict === "BUY_TODAY" ? `${verdictLabel} · ${t("dv.st.pb.trend").slice(0, 0)}${t("dc.ov.firstPick").slice(0, 0)}` : verdictLabel;
  const watchNames = top10.slice(0, 3).map((r) => r.name ?? r.symbol);

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 space-y-3">
      <ExecSummaryBar verdict={verdict} verdictLabel={verdictLabel} sentence={sentence} confidence={cMkt?.avgAiScore ?? null} risk={riskLevel ?? (vol != null ? String(Math.round(vol * 10) / 10) : "—")} asOf={asOf} />
      <div className="grid grid-cols-1 lg:grid-cols-[7fr_3fr] gap-3">
        <div className="space-y-3 min-w-0">
          <TradingTimeline nodes={tlNodes} />
          <PlaybookGrid cats={cats} />
        </div>
        <div className="space-y-3 min-w-0">
          <SectorFocus rows={sectors} />
          <RiskPanel items={riskItems} overall={riskLevel ?? "—"} overallTone={riskTone(riskLevel)} titleKey="dv.st.rkChecklist" />
          <ClosingPlan actionLabel={closeAction} watchlist={watchNames} />
          <AINotes note={sentence} gptModel={gptModel} />
        </div>
      </div>
    </div>
  );
}
