"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import {
  RM,
  SHADOW_SM,
  ResearchPanelShell,
  ResearchStatusBadge,
  ResearchButton,
  ResearchKpiGrid,
  ResearchKpiCard,
  ResearchSection,
  ResearchInsightCard,
  ResearchTable,
  RTh,
  RTd,
  rowHoverClass,
  ResearchLoadingState,
  ResearchEmptyState,
  ResearchErrorState,
  retColor,
  type Tone,
} from "./kit";

// Alpha策略回测 — Alpha Strategy Backtest（AI 研究中心 · Shadow·Alpha 组）。
// 纯展示层：只读现有 /api/alpha/backtest，比较正式评分与影子(Alpha)评分的历史组合表现。
// 不改任何 API / Alpha 策略回测算法 / Backtest Engine。所有数字为 API 原值。

type Cell = {
  strategy: string; topN: number; holdDays: number;
  cumReturn: number | null; alpha: number | null; sharpe: number | null;
  maxDrawdown: number | null; winRate: number | null; annualizedReturn: number | null; nObs: number;
};
type Resp = {
  period: number; availablePeriods: number[]; computedAt: string | null; asOfLatest: string | null;
  note: string; headline: { production: number | null; shadow: number | null; alpha: number | null };
  cells: Cell[];
};

const PERIODS = [30, 90, 180];
const TOPN = [10, 20, 50];
const HOLD = [5, 10, 20];
type View = "PRODUCTION" | "SHADOW" | "OVERLAY";
const VLABEL: Record<View, string> = { PRODUCTION: "rp.abt.v.prod", SHADOW: "rp.abt.v.shadow", OVERLAY: "rp.abt.v.overlay" };


function pct(v: number | null) { return v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`; }
function num(v: number | null, d = 2) { return v == null ? "—" : v.toFixed(d); }
function stratLabelKey(s: string) { return s === "ALPHA" ? "rp.abt.v.shadow" : "rp.abt.v.prod"; }

export function AlphaBacktestPanel({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const { t } = useI18n();
  const tx = t as (k: string) => string;
  const [period, setPeriod] = useState(90);
  const [view, setView] = useState<View>("OVERLAY");
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true); setError(null);
    fetch(`/api/alpha/backtest?period=${period}`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: Resp) => { setData(d); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, [period]);

  const cellMap = useMemo(() => {
    const m = new Map<string, Cell>();
    for (const c of data?.cells ?? []) m.set(`${c.strategy}-${c.topN}-${c.holdDays}`, c);
    return m;
  }, [data]);

  // 代表性配置：影子 前20·20日（Headline 口径）
  const repAlpha = cellMap.get("ALPHA-20-20") ?? null;
  const totalObs = useMemo(() => (data?.cells ?? []).reduce((s, c) => s + (c.nObs ?? 0), 0), [data]);

  const strategies: string[] = view === "PRODUCTION" ? ["PRODUCTION"] : view === "SHADOW" ? ["ALPHA"] : ["PRODUCTION", "ALPHA"];
  const bodyRows: Cell[] = [];
  for (const tn of TOPN) for (const h of HOLD) for (const s of strategies) { const c = cellMap.get(`${s}-${tn}-${h}`); if (c) bodyRows.push(c); }
  const isFirstOfConfig = (i: number) => i === 0 || !(bodyRows[i].topN === bodyRows[i - 1].topN && bodyRows[i].holdDays === bodyRows[i - 1].holdDays);

  function exportCsv() {
    if (!data) return;
    const header = ["period", "strategy", "topN", "holdDays", "cumReturn", "alpha", "annualizedReturn", "sharpe", "maxDrawdown", "winRate", "nObs"];
    const lines = [header.join(",")];
    for (const c of data.cells) lines.push([data.period, c.strategy, c.topN, c.holdDays, c.cumReturn ?? "", c.alpha ?? "", c.annualizedReturn ?? "", c.sharpe ?? "", c.maxDrawdown ?? "", c.winRate ?? "", c.nObs].join(","));
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `alpha-backtest-${data.period}d.csv`; a.click(); URL.revokeObjectURL(url);
  }

  const hasData = !!data && data.cells.length > 0;
  const goScore = onNavigate ? () => onNavigate("score") : undefined;
  const goOverview = onNavigate ? () => onNavigate("overview") : undefined;
  const headAlpha = data?.headline?.alpha ?? null;

  const hero = (
    <AlphaBacktestHero asOf={data?.asOfLatest ?? null} computedAt={data?.computedAt ?? null} period={period}
      totalObs={totalObs} repAlpha={repAlpha} loading={loading} error={!!error} hasData={hasData} onScore={goScore} />
  );

  const controls = (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="inline-flex p-1 rounded-lg" style={{ background: RM.track, border: `1px solid ${RM.border}` }}>
        {PERIODS.map((p) => {
          const on = period === p;
          return <button key={p} onClick={() => setPeriod(p)} className="text-[12px] font-semibold px-3 h-7 rounded-md transition-all" style={on ? { background: RM.panel, color: RM.ink, boxShadow: SHADOW_SM } : { color: RM.sub }}>{p}d</button>;
        })}
      </div>
      <div className="inline-flex p-1 rounded-lg" style={{ background: RM.track, border: `1px solid ${RM.border}` }}>
        {(["PRODUCTION", "SHADOW", "OVERLAY"] as View[]).map((v) => {
          const on = view === v;
          return <button key={v} onClick={() => setView(v)} className="text-[12px] font-semibold px-3 h-7 rounded-md transition-all" style={on ? { background: RM.panel, color: RM.ink, boxShadow: SHADOW_SM } : { color: RM.sub }}>{tx(VLABEL[v])}</button>;
        })}
      </div>
      <div className="ml-auto"><ResearchButton onClick={exportCsv} disabled={!data?.cells.length}>{tx("rp.abt.exportCsv")}</ResearchButton></div>
    </div>
  );

  if (error) return <ResearchPanelShell>{hero}{controls}<ResearchErrorState message={error} hint={tx("rp.abt.errHint")} actions={<ResearchButton onClick={goOverview} disabled={!goOverview}>{tx("rp.abt.backFactors")}</ResearchButton>} /></ResearchPanelShell>;
  if (loading) return <ResearchPanelShell>{hero}{controls}<ResearchLoadingState /></ResearchPanelShell>;
  if (!hasData) return <ResearchPanelShell>{hero}{controls}<ResearchEmptyState title={tx("common.no_data")} desc={tx("rp.abt.emptyDesc")} actions={<><ResearchButton variant="primary" onClick={goScore} disabled={!goScore}>{tx("rw.a.score")}</ResearchButton><ResearchButton onClick={goOverview} disabled={!goOverview}>{tx("rp.abt.backFactors")}</ResearchButton></>} /></ResearchPanelShell>;

  return (
    <ResearchPanelShell>
      {hero}
      {controls}

      {/* KPI —— headline + 代表配置（影子 前20·20日），均为 API 原值 */}
      <ResearchKpiGrid>
        <ResearchKpiCard label={tx("rp.abt.kShadowRet")} value={pct(data!.headline.shadow)} sub="Top20 · 20d" />
        <ResearchKpiCard label={tx("rp.abt.kProdRet")} value={pct(data!.headline.production)} sub="Top20 · 20d" />
        <ResearchKpiCard label={tx("rp.abt.kAlpha")} value={pct(headAlpha)} sub={tx("rp.abt.kAlphaSub")} tone={headAlpha == null ? "neutral" : headAlpha > 0 ? "green" : "red"} />
        <ResearchKpiCard label={tx("rp.abt.kWin")} value={repAlpha?.winRate == null ? tx("common.no_data") : `${repAlpha.winRate.toFixed(1)}%`} sub="Top20 · 20d" />
        <ResearchKpiCard label={tx("rp.abt.kSharpe")} value={num(repAlpha?.sharpe ?? null)} sub="Top20 · 20d" />
        <ResearchKpiCard label={tx("common.asOf.data")} value={<span className="text-[15px]">{data?.asOfLatest ?? tx("common.no_data")}</span>} sub={`${period}d`} tone="blue" />
      </ResearchKpiGrid>

      {/* Alpha 是否跑赢正式 —— 结论卡 */}
      <ResearchInsightCard title={tx("rp.abt.insight")} tone={headAlpha == null ? "neutral" : headAlpha > 0 ? "green" : "red"}>
        {headAlpha == null ? tx("common.no_data") : tx(headAlpha > 0 ? "rp.abt.insightWin" : "rp.abt.insightLose").replace("{p}", String(period)).replace("{s}", String(pct(data!.headline.shadow))).replace("{pr}", String(pct(data!.headline.production))).replace("{a}", String(pct(headAlpha)))}
      </ResearchInsightCard>

      {/* 持有周期卡（影子评分 · 前20，按 holdDays 维度） */}
      <ResearchSection title={tx("rp.abt.holdTitle")} desc={tx("rp.abt.holdDesc")}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {HOLD.map((h) => {
            const c = cellMap.get(`ALPHA-20-${h}`);
            return <AlphaHorizonCard key={h} holdDays={h} c={c ?? null} />;
          })}
        </div>
      </ResearchSection>

      {/* 回测矩阵 */}
      <ResearchSection title={tx("rp.abt.matrixTitle")} desc={`${period}d · ${tx(VLABEL[view])}`}>
        <div style={{ maxHeight: "calc(100vh - 320px)", overflow: "auto" }}>
          <ResearchTable minWidth={860}>
            <thead>
              <tr>
                <RTh>{tx("rp.abt.colConfig")}</RTh><RTh>{tx("rp.abt.colStrategy")}</RTh><RTh align="right">{tx("rp.afus.cumRet")}</RTh><RTh align="right">{tx("rp.abt.colAlphaAnn")}</RTh>
                <RTh align="right">{tx("rp.abt.colAnn")}</RTh><RTh align="right">Sharpe</RTh><RTh align="right">{tx("rp.abt.colMdd")}</RTh><RTh align="right">{tx("rp.afus.winRate")}</RTh><RTh align="right">{tx("rp.aanal.colSample")}</RTh>
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((c, i) => (
                <tr key={`${c.topN}-${c.holdDays}-${c.strategy}`} className={rowHoverClass} style={c.strategy === "ALPHA" ? { background: `${RM.blue}0f` } : undefined}>
                  <RTd mono color={RM.sub}>{isFirstOfConfig(i) ? `Top${c.topN} · ${c.holdDays}d` : ""}</RTd>
                  <RTd color={c.strategy === "ALPHA" ? RM.blue : RM.sub}><span className="font-medium">{tx(stratLabelKey(c.strategy))}</span></RTd>
                  <RTd align="right" mono color={retColor(c.cumReturn)}>{pct(c.cumReturn)}</RTd>
                  <RTd align="right" mono color={retColor(c.alpha)}>{pct(c.alpha)}</RTd>
                  <RTd align="right" mono color={retColor(c.annualizedReturn)}>{pct(c.annualizedReturn)}</RTd>
                  <RTd align="right" mono>{num(c.sharpe)}</RTd>
                  <RTd align="right" mono color={RM.red}>{c.maxDrawdown == null ? "—" : `-${c.maxDrawdown.toFixed(2)}%`}</RTd>
                  <RTd align="right" mono color={RM.sub}>{c.winRate == null ? "—" : `${c.winRate.toFixed(1)}%`}</RTd>
                  <RTd align="right" mono color={RM.faint}>{c.nObs}</RTd>
                </tr>
              ))}
            </tbody>
          </ResearchTable>
        </div>
        <p className="text-[11px] mt-3" style={{ color: RM.faint }}>{tx("rp.abt.note")}</p>
      </ResearchSection>
    </ResearchPanelShell>
  );
}

// ── AlphaBacktestHero ─────────────────────────────────────────────────────────
function AlphaBacktestHero({ asOf, computedAt, period, totalObs, repAlpha, loading, error, hasData, onScore }: {
  asOf: string | null; computedAt: string | null; period: number; totalObs: number; repAlpha: Cell | null; loading: boolean; error: boolean; hasData: boolean; onScore?: () => void;
}) {
  const { t } = useI18n();
  const tx = t as (k: string) => string;
  const statusText = loading ? tx("common.loading") : hasData && !error ? tx("rp.aanal.ready") : tx("common.no_data");
  const statusTone: Tone = loading ? "amber" : error || !hasData ? "neutral" : "green";
  return (
    <div className="rounded-2xl px-6 py-5 flex flex-col lg:flex-row lg:items-center gap-4" style={{ background: RM.panel, border: `1px solid ${RM.border}` }}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]" style={{ color: RM.ink }}>{tx("rw.b.alpha")}</h1>
          <span className="text-[12px] font-medium" style={{ color: RM.faint }}>Alpha Strategy Backtest</span>
          <ResearchStatusBadge tone={statusTone}>{statusText}</ResearchStatusBadge>
        </div>
        <p className="mt-1.5 text-[13px]" style={{ color: RM.muted }}>{tx("rp.abt.subtitle")}</p>
        <div className="mt-2 flex items-center gap-4 flex-wrap text-[12px]">
          <span style={{ color: RM.sub }}>{tx("rp.aanal.kSamples")} <b className="tabular-nums" style={{ color: RM.ink }}>{totalObs.toLocaleString()}</b></span>
          
          <span style={{ color: RM.faint }}>{tx("common.asOf.data")} <b className="tabular-nums" style={{ color: RM.sub }}>{asOf ?? tx("common.no_data")}</b></span>
          
        </div>
      </div>
      <div className="shrink-0"><ResearchButton onClick={onScore} disabled={!onScore}>{tx("rw.a.score")} →</ResearchButton></div>
    </div>
  );
}

// ── AlphaHorizonCard ──────────────────────────────────────────────────────────
function AlphaHorizonCard({ holdDays, c }: { holdDays: number; c: Cell | null }) {
  const { t } = useI18n();
  const tx = t as (k: string) => string;
  if (!c) {
    return (
      <div className="rounded-xl px-4 py-4" style={{ background: RM.card, border: `1px solid ${RM.border}` }}>
        <div className="flex items-center justify-between"><span className="text-[14px] font-semibold" style={{ color: RM.ink }}>{holdDays}d</span><ResearchStatusBadge tone="neutral">{tx("common.no_data")}</ResearchStatusBadge></div>
        <div className="mt-3 text-[13px]" style={{ color: RM.faint }}>{tx("rp.abt.noSample")}</div>
      </div>
    );
  }
  return (
    <div className="rounded-xl px-4 py-4" style={{ background: RM.card, border: `1px solid ${RM.border}`, borderTop: `2px solid ${RM.blue}` }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[14px] font-semibold" style={{ color: RM.ink }}>{holdDays}d</span>
        <ResearchStatusBadge tone="green">{tx("rp.aanal.ready")}</ResearchStatusBadge>
      </div>
      <div className="text-[26px] font-semibold leading-none tabular-nums" style={{ color: retColor(c.cumReturn) }}>{pct(c.cumReturn)}</div>
      <div className="text-[11px] mt-1" style={{ color: RM.faint }}>{tx("rp.afus.cumRet")} · Top20</div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
        <Stat label={tx("rp.abt.colAlphaAnn")} val={pct(c.alpha)} color={retColor(c.alpha)} />
        <Stat label="Sharpe" val={num(c.sharpe)} />
        <Stat label={tx("rp.afus.winRate")} val={c.winRate == null ? "—" : `${c.winRate.toFixed(1)}%`} />
        <Stat label={tx("rp.aanal.colSample")} val={String(c.nObs)} />
      </div>
    </div>
  );
}
function Stat({ label, val, color }: { label: string; val: string; color?: string }) {
  return (
    <div className="flex justify-between">
      <span style={{ color: RM.muted }}>{label}</span>
      <span className="font-semibold tabular-nums" style={{ color: color ?? RM.ink }}>{val}</span>
    </div>
  );
}
