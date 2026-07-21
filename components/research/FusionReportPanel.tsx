"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { fmtAsOf } from "./PanelFrame";
import {
  RM,
  ResearchPanelShell,
  ResearchStatusBadge,
  ResearchButton,
  ResearchKpiGrid,
  ResearchKpiCard,
  ResearchSection,
  ResearchInsightCard,
  ResearchLoadingState,
  ResearchEmptyState,
  ResearchErrorState,
  retColor,
  type Tone,
} from "./kit";

// AI融合策略研究 — Fusion Research（AI 研究中心 · 市场与融合组）。
// 纯展示层：只读现有 /api/fusion/report，展示各市场状态下最优评分融合比例的历史研究结论。
// 不改任何 API / Fusion 算法 / Adaptive / Shadow / 评分。决策为 fused vs 正式 夏普的展示层比较。

type Stat = { cumReturn: number | null; sharpe: number | null; winRate: number | null; maxDrawdown: number | null };
type GridPt = { w: number; sharpe: number | null; cumReturn: number | null };
type RegimeRow = {
  regime: string; nDays: number;
  production: Stat; alpha: Stat; fused: Stat;
  bestAlphaWeight: number | null; ratio: string | null; grid: GridPt[] | null;
};
type Resp = { computedAt: string | null; asOfLatest: string | null; objective: string; note: string; regimes: RegimeRow[] };

const RKEY: Record<string, string> = { BULL: "dc.regime.BULL", SIDEWAYS: "dc.regime.SIDEWAYS", BEAR: "dc.regime.BEAR" };
const RHEX: Record<string, string> = { BULL: RM.green, SIDEWAYS: RM.amber, BEAR: RM.red };
const RTONE: Record<string, Tone> = { BULL: "green", SIDEWAYS: "amber", BEAR: "red" };

function pct(v: number | null) { return v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`; }
function num(v: number | null, d = 2) { return v == null ? "—" : v.toFixed(d); }

// 决策：比较 融合方案 vs 正式评分 的历史夏普（展示层比较，非新逻辑）
function verdict(r: RegimeRow): { label: string; tone: Tone } {
  const f = r.fused.sharpe, p = r.production.sharpe;
  if (f == null || p == null) return { label: "rp.afus.v.insuf", tone: "neutral" };
  if (f > p + 0.05) return { label: "rp.afus.v.fusion", tone: "green" };
  if (f < p - 0.05) return { label: "rp.afus.v.prod", tone: "blue" };
  return { label: "rp.afus.v.tie", tone: "amber" };
}

export function FusionReportPanel({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const { t } = useI18n();
  const tx = t as (k: string) => string;
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/fusion/report")
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: Resp) => { setData(d); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, []);

  const regimes = useMemo(() => data?.regimes ?? [], [data]);
  const hasData = regimes.length > 0;

  const kpi = useMemo(() => {
    if (!hasData) return null;
    const withW = regimes.filter((r) => r.bestAlphaWeight != null);
    const avgW = withW.length ? withW.reduce((s, r) => s + (r.bestAlphaWeight ?? 0), 0) / withW.length : null;
    const fusionWins = regimes.filter((r) => verdict(r).label === "rp.afus.v.fusion").length;
    return { avgW, fusionWins };
  }, [regimes, hasData]);

  function exportCsv() {
  const { t } = useI18n();
  const tx = t as (k: string) => string;
    if (!data) return;
    const header = ["regime", "nDays", "bestAlphaWeight", "ratioProdAlpha", "prodCum", "prodSharpe", "alphaCum", "alphaSharpe", "fusedCum", "fusedSharpe"];
    const lines = [header.join(",")];
    for (const r of data.regimes) lines.push([r.regime, r.nDays, r.bestAlphaWeight ?? "", r.ratio ?? "", r.production.cumReturn ?? "", r.production.sharpe ?? "", r.alpha.cumReturn ?? "", r.alpha.sharpe ?? "", r.fused.cumReturn ?? "", r.fused.sharpe ?? ""].join(","));
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "fusion-report.csv"; a.click(); URL.revokeObjectURL(url);
  }

  const goRegime = onNavigate ? () => onNavigate("regime") : undefined;
  const goOverview = onNavigate ? () => onNavigate("overview") : undefined;
  const hero = <FusionHero asOfLatest={data?.asOfLatest ?? null} computedAt={data?.computedAt ?? null} objective={data?.objective ?? null} loading={loading} error={!!error} hasData={hasData} onRegime={goRegime} />;

  if (error) {
    return (
      <ResearchPanelShell>
        {hero}
        <ResearchErrorState message={error} hint={tx("rp.afus.errHint")}
          actions={<ResearchButton onClick={goOverview} disabled={!goOverview}>{tx("rp.afus.backFactors")}</ResearchButton>} />
      </ResearchPanelShell>
    );
  }
  if (loading) return <ResearchPanelShell>{hero}<FusionFlow /><ResearchLoadingState /></ResearchPanelShell>;
  if (!hasData) {
    return (
      <ResearchPanelShell>
        {hero}
        <FusionFlow />
        <ResearchEmptyState title={tx("common.no_data")} desc={tx("rp.afus.emptyDesc")}
          actions={<><ResearchButton variant="primary" onClick={goRegime} disabled={!goRegime}>{tx("rp.afus.toRegime")}</ResearchButton><ResearchButton onClick={goOverview} disabled={!goOverview}>{tx("rp.afus.backFactors")}</ResearchButton></>} />
      </ResearchPanelShell>
    );
  }

  return (
    <ResearchPanelShell>
      {hero}

      {/* Fusion Flow */}
      <FusionFlow />

      {/* Fusion KPI —— 来自报告的真实字段/展示聚合 */}
      <ResearchKpiGrid>
        <ResearchKpiCard label={tx("rp.afus.kRegimes")} value={regimes.length} sub={tx("rp.afus.kRegimesSub")} tone="blue" />
        <ResearchKpiCard label={tx("rp.afus.kObjective")} value={<span className="text-[16px]">{data?.objective ?? "—"}</span>} sub={tx("rp.afus.kObjectiveSub")} />
        <ResearchKpiCard label={tx("rp.afus.kWins")} value={`${kpi!.fusionWins}/${regimes.length}`} sub={tx("rp.afus.kWinsSub")} tone={kpi!.fusionWins > 0 ? "green" : "neutral"} />
        <ResearchKpiCard label={tx("rp.afus.kAvgW")} value={kpi!.avgW == null ? tx("common.no_data") : kpi!.avgW.toFixed(2)} sub={tx("rp.afus.kAvgWSub")} />
        <ResearchKpiCard label={tx("common.asOf.data")} value={<span className="text-[15px]">{data?.asOfLatest ?? tx("common.no_data")}</span>}  />
        <ResearchKpiCard label={tx("rp.afus.kMode")} value={<span className="text-[15px]">{tx("rp.afus.kModeVal")}</span>} sub={tx("rp.afus.kModeSub")} tone="amber" />
      </ResearchKpiGrid>

      {/* Decision Panel */}
      <FusionDecisionPanel regimes={regimes} fusionWins={kpi!.fusionWins} />

      {/* Research Conclusion */}
      <ResearchSection title={tx("rp.afus.concTitle")} desc={tx("rp.afus.concDesc")}>
        <ResearchInsightCard title={tx("rp.afus.method")} tone="blue">{tx("rp.afus.methodBody")}</ResearchInsightCard>
        <div className="mt-3 space-y-1.5">
          {regimes.map((r) => {
            const v = verdict(r);
            return (
              <div key={r.regime} className="flex items-center gap-3 px-3 py-2.5 rounded-lg flex-wrap" style={{ background: RM.card, border: `1px solid ${RM.border}` }}>
                <span className="text-[13px] font-semibold shrink-0 w-16" style={{ color: RHEX[r.regime] }}>{RKEY[r.regime] ? tx(RKEY[r.regime]) : r.regime}</span>
                <span className="text-[12px]" style={{ color: RM.sub }}>{tx("rp.afus.ratio")}<b style={{ color: RM.ink }}>{r.ratio ?? "—"}</b></span>
                <span className="text-[12px]" style={{ color: RM.sub }}>{tx("rp.afus.fusedSharpe")} <b style={{ color: retColor(r.fused.sharpe) }}>{num(r.fused.sharpe)}</b> vs {tx("rp.afus.prodSharpe")} <b style={{ color: RM.ink }}>{num(r.production.sharpe)}</b></span>
                <ResearchStatusBadge tone={v.tone}>{tx(v.label)}</ResearchStatusBadge>
              </div>
            );
          })}
        </div>
      </ResearchSection>

      {/* 各市场状态明细卡 */}
      <ResearchSection title={tx("rp.afus.detailTitle")} desc={tx("rp.afus.detailDesc")} right={<ResearchButton onClick={exportCsv}>{tx("rp.afus.exportCsv")}</ResearchButton>}>
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
          {regimes.map((r) => <RegimeCard key={r.regime} r={r} />)}
        </div>
      </ResearchSection>
    </ResearchPanelShell>
  );
}

// ── FusionHero ────────────────────────────────────────────────────────────────
function FusionHero({ asOfLatest, computedAt, objective, loading, error, hasData, onRegime }: {
  asOfLatest: string | null; computedAt: string | null; objective: string | null; loading: boolean; error: boolean; hasData: boolean; onRegime?: () => void;
}) {
  const { t } = useI18n();
  const tx = t as (k: string) => string;
  const statusText = loading ? tx("common.loading") : hasData && !error ? tx("rp.afus.ready") : tx("common.no_data");
  const statusTone: Tone = loading ? "amber" : error || !hasData ? "neutral" : "green";
  return (
    <div className="rounded-2xl px-6 py-5 flex flex-col lg:flex-row lg:items-center gap-4" style={{ background: RM.panel, border: `1px solid ${RM.border}` }}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]" style={{ color: RM.ink }}>{tx("rw.a.fusion")}</h1>
          <span className="text-[12px] font-medium" style={{ color: RM.faint }}>Fusion Research</span>
          <ResearchStatusBadge tone={statusTone}>{statusText}</ResearchStatusBadge>
          <ResearchStatusBadge tone="amber">{tx("rp.afus.kModeVal")}</ResearchStatusBadge>
        </div>
        <p className="mt-1.5 text-[13px]" style={{ color: RM.muted }}>Production · Shadow · Fusion · Research</p>
        <div className="mt-2 flex items-center gap-4 flex-wrap text-[12px]">
          <span style={{ color: RM.sub }}>{tx("rp.afus.kObjective")} <b style={{ color: RM.ink }}>{objective ?? "—"}</b></span>
          <span style={{ color: RM.sub }}>{tx("common.asOf.data")} <b className="tabular-nums" style={{ color: RM.ink }}>{asOfLatest ?? tx("common.no_data")}</b></span>
          <span style={{ color: RM.faint }}>{tx("common.asOf.updated")} <span className="tabular-nums" style={{ color: RM.sub }}>{fmtAsOf(computedAt) ?? tx("common.no_data")}</span></span>
        </div>
      </div>
      <div className="shrink-0"><ResearchButton onClick={onRegime} disabled={!onRegime}>{tx("rp.afus.toRegime")} →</ResearchButton></div>
    </div>
  );
}

// ── FusionFlow ────────────────────────────────────────────────────────────────
const FLOW = [
  { key: "Adaptive", zh: "Adaptive", sub: "rp.afus.fl.prod" },
  { key: "Shadow", zh: "Shadow", sub: "rp.afus.fl.shadow" },
  { key: "Fusion", zh: "Fusion", sub: "rp.afus.fl.fusion" },
  { key: "Strategy", zh: "Strategy", sub: "rp.afus.fl.strategy" },
  { key: "Recommendation", zh: "Recommendation", sub: "rp.afus.fl.reco" },
  { key: "Production", zh: "Production", sub: "rp.afus.fl.production" },
];
function FusionFlow() {
  const { t } = useI18n();
  const tx = t as (k: string) => string;
  return (
    <ResearchSection title={tx("rp.afus.chainTitle")} desc={tx("rp.afus.chainDesc")}>
      <div className="flex items-stretch gap-1.5 flex-wrap">
        {FLOW.map((n, i) => {
          const active = n.key === "Fusion";
          return (
            <div key={n.key} className="flex items-center gap-1.5">
              <div className="rounded-xl px-3.5 py-2.5 min-w-[104px]" style={{ background: active ? `${RM.blue}1f` : RM.card, border: `1px solid ${active ? RM.blue : RM.border}` }}>
                <div className="text-[13px] font-semibold" style={{ color: active ? RM.blue : RM.ink }}>{n.zh}</div>
                <div className="text-[11px] mt-0.5" style={{ color: RM.faint }}>{tx(n.sub)}</div>
              </div>
              {i < FLOW.length - 1 && <span className="text-[13px]" style={{ color: RM.faint }}>→</span>}
            </div>
          );
        })}
      </div>
    </ResearchSection>
  );
}

// ── FusionDecisionPanel ───────────────────────────────────────────────────────
function FusionDecisionPanel({ regimes, fusionWins }: { regimes: RegimeRow[]; fusionWins: number }) {
  const { t } = useI18n();
  const tx = t as (k: string) => string;
  const overallTone: Tone = fusionWins >= 2 ? "green" : fusionWins === 1 ? "amber" : "blue";
  const overall = fusionWins >= 2 ? tx("rp.afus.o.strong") : fusionWins === 1 ? tx("rp.afus.o.mixed") : tx("rp.afus.o.weak");
  return (
    <ResearchSection title={tx("rp.afus.panelTitle")} desc={tx("rp.afus.panelDesc")}>
      <div className="rounded-xl px-4 py-3.5 mb-3 flex items-center gap-3 flex-wrap" style={{ background: RM.card, border: `1px solid ${RM.border}` }}>
        <ResearchStatusBadge tone={overallTone}>{fusionWins}/{regimes.length}</ResearchStatusBadge>
        <span className="text-[13px]" style={{ color: RM.sub }}>{overall}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {regimes.map((r) => {
          const v = verdict(r);
          const rec = v.label === "rp.afus.v.fusion" ? tx("rp.afus.rec.fusion") : v.label === "rp.afus.v.prod" ? tx("rp.afus.rec.prod") : v.label === "rp.afus.v.tie" ? tx("rp.afus.rec.watch") : tx("rp.afus.v.insuf");
          return (
            <div key={r.regime} className="rounded-xl px-4 py-3.5" style={{ background: RM.card, border: `1px solid ${RM.border}` }}>
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-semibold" style={{ color: RHEX[r.regime] }}>{RKEY[r.regime] ? tx(RKEY[r.regime]) : r.regime}</span>
                <ResearchStatusBadge tone={v.tone}>{tx(v.label)}</ResearchStatusBadge>
              </div>
              <div className="mt-2 text-[13px] font-medium" style={{ color: RM.ink }}>{rec}</div>
              <div className="mt-1 text-[11px]" style={{ color: RM.faint }}>{tx("rp.afus.ratio")} {r.ratio ?? "—"} · {r.nDays}d</div>
            </div>
          );
        })}
      </div>
    </ResearchSection>
  );
}

// ── RegimeCard ────────────────────────────────────────────────────────────────
function RegimeCard({ r }: { r: RegimeRow }) {
  const { t } = useI18n();
  const tx = t as (k: string) => string;
  const w = r.bestAlphaWeight ?? 0;
  const grid = r.grid ?? [];
  const maxS = Math.max(...grid.map((g) => g.sharpe ?? -1e9), 0.001);
  const minS = Math.min(...grid.map((g) => g.sharpe ?? 1e9), 0);
  return (
    <div className="rounded-xl p-4" style={{ background: RM.card, border: `1px solid ${RM.border}`, borderTop: `2px solid ${RHEX[r.regime]}` }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[15px] font-bold" style={{ color: RHEX[r.regime] }}>{RKEY[r.regime] ? tx(RKEY[r.regime]) : r.regime}</span>
        <span className="text-[11px]" style={{ color: RM.faint }}>{r.nDays}d · Top20 · 20d</span>
      </div>
      <div className="rounded-lg px-3 py-2 mb-3" style={{ background: RM.panel, border: `1px solid ${RM.border}` }}>
        <div className="text-[11px]" style={{ color: RM.muted }}>{tx("rp.afus.bestRatio")}</div>
        <div className="text-[20px] font-bold tabular-nums" style={{ color: RM.ink }}>{r.ratio ?? "—"}</div>
        <div className="text-[10px]" style={{ color: RM.faint }}>{tx("rp.afus.shadowW")} = {num(r.bestAlphaWeight, 2)}</div>
      </div>
      <table className="w-full text-[12px] mb-3" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ color: RM.muted }}>
            <th className="text-left py-1 font-medium"></th>
            <th className="text-right py-1 font-medium">{tx("rp.afus.cumRet")}</th>
            <th className="text-right py-1 font-medium">Sharpe</th>
            <th className="text-right py-1 font-medium">{tx("rp.afus.winRate")}</th>
            <th className="text-right py-1 font-medium">{tx("rp.afus.drawdown")}</th>
          </tr>
        </thead>
        <tbody>
          {([["rp.afus.rowProd", r.production], ["rp.afus.rowShadow", r.alpha], ["rp.afus.rowFused", r.fused]] as const).map(([label, s]) => (
            <tr key={label} style={{ borderTop: `1px solid ${RM.border}` }}>
              <td className="py-1.5 font-medium" style={{ color: RM.sub }}>{tx(label)}</td>
              <td className="py-1.5 text-right tabular-nums" style={{ color: retColor(s.cumReturn) }}>{pct(s.cumReturn)}</td>
              <td className="py-1.5 text-right tabular-nums" style={{ color: RM.ink }}>{num(s.sharpe)}</td>
              <td className="py-1.5 text-right tabular-nums" style={{ color: RM.sub }}>{s.winRate == null ? "—" : `${s.winRate.toFixed(0)}%`}</td>
              <td className="py-1.5 text-right tabular-nums" style={{ color: RM.red }}>{s.maxDrawdown == null ? "—" : `-${s.maxDrawdown.toFixed(1)}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-[10px] mb-1" style={{ color: RM.faint }}>{tx("rp.afus.curveNote")}</div>
      <div className="flex items-end gap-[2px] h-14">
        {grid.map((g) => {
          const h = g.sharpe == null ? 0 : Math.max(3, ((g.sharpe - minS) / (maxS - minS || 1)) * 100);
          const isBest = Math.abs(g.w - w) < 0.001;
          return <div key={g.w} title={`w=${g.w} Sharpe=${num(g.sharpe)}`} style={{ flex: 1, height: `${h}%`, background: isBest ? RHEX[r.regime] : "#D2D5DB", borderRadius: "2px 2px 0 0" }} />;
        })}
      </div>
      <div className="flex justify-between text-[9px] mt-0.5" style={{ color: RM.faint }}><span>0</span><span>{tx("rp.afus.shadowW")}</span><span>1</span></div>
    </div>
  );
}
