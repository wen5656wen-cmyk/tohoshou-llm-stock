"use client";

import { useEffect, useMemo, useState } from "react";
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
const VLABEL: Record<View, string> = { PRODUCTION: "正式评分", SHADOW: "影子评分", OVERLAY: "融合比较" };
const BT_NOTE = "两套评分均由 DailyPrice 历史重建。正式评分＝动量核心 z(20日收益)+z(60日收益)；影子评分＝分析加权 6 因子复合。重叠日采样，累计收益/回撤按非重叠 H 日再平衡计算。正式推荐不受影响。Alpha回测按「组合规模 × 持有周期」维度（非单日 horizon）。";

function pct(v: number | null) { return v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`; }
function num(v: number | null, d = 2) { return v == null ? "—" : v.toFixed(d); }
function stratZh(s: string) { return s === "ALPHA" ? "影子评分" : "正式评分"; }

export function AlphaBacktestPanel({ onNavigate }: { onNavigate?: (tab: string) => void }) {
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
          return <button key={p} onClick={() => setPeriod(p)} className="text-[12px] font-semibold px-3 h-7 rounded-md transition-all" style={on ? { background: RM.panel, color: RM.ink, boxShadow: SHADOW_SM } : { color: RM.sub }}>{p}日</button>;
        })}
      </div>
      <div className="inline-flex p-1 rounded-lg" style={{ background: RM.track, border: `1px solid ${RM.border}` }}>
        {(["PRODUCTION", "SHADOW", "OVERLAY"] as View[]).map((v) => {
          const on = view === v;
          return <button key={v} onClick={() => setView(v)} className="text-[12px] font-semibold px-3 h-7 rounded-md transition-all" style={on ? { background: RM.panel, color: RM.ink, boxShadow: SHADOW_SM } : { color: RM.sub }}>{VLABEL[v]}</button>;
        })}
      </div>
      <div className="ml-auto"><ResearchButton onClick={exportCsv} disabled={!data?.cells.length}>导出CSV</ResearchButton></div>
    </div>
  );

  if (error) return <ResearchPanelShell>{hero}{controls}<ResearchErrorState message={error} hint={<>请运行 <code style={{ color: RM.sub }}>npm run backtest-shadow</code> 生成 Alpha 回测。</>} actions={<ResearchButton onClick={goOverview} disabled={!goOverview}>返回综合驾驶舱</ResearchButton>} /></ResearchPanelShell>;
  if (loading) return <ResearchPanelShell>{hero}{controls}<ResearchLoadingState label="正在加载 Alpha 策略回测…" /></ResearchPanelShell>;
  if (!hasData) return <ResearchPanelShell>{hero}{controls}<ResearchEmptyState title="暂无 Alpha 策略回测数据" desc="当前 Alpha 策略尚未生成足够成熟样本。可切换其它周期查看。" actions={<><ResearchButton variant="primary" onClick={goScore} disabled={!goScore}>查看影子评分</ResearchButton><ResearchButton onClick={goOverview} disabled={!goOverview}>返回综合驾驶舱</ResearchButton></>} /></ResearchPanelShell>;

  return (
    <ResearchPanelShell>
      {hero}
      {controls}

      {/* KPI —— headline + 代表配置（影子 前20·20日），均为 API 原值 */}
      <ResearchKpiGrid>
        <ResearchKpiCard label="影子收益" value={pct(data!.headline.shadow)} sub="前20 · 20日 累计" />
        <ResearchKpiCard label="正式收益" value={pct(data!.headline.production)} sub="前20 · 20日 累计" />
        <ResearchKpiCard label="Alpha 超额" value={pct(headAlpha)} sub="影子 − 正式" tone={headAlpha == null ? "neutral" : headAlpha > 0 ? "green" : "red"} />
        <ResearchKpiCard label="影子胜率" value={repAlpha?.winRate == null ? "暂无数据" : `${repAlpha.winRate.toFixed(1)}%`} sub="前20 · 20日" />
        <ResearchKpiCard label="影子夏普" value={num(repAlpha?.sharpe ?? null)} sub="前20 · 20日" />
        <ResearchKpiCard label="数据基准" value={<span className="text-[15px]">{data?.asOfLatest ?? "暂无数据"}</span>} sub={`回测窗口 ${period} 日`} tone="blue" />
      </ResearchKpiGrid>

      {/* Alpha 是否跑赢正式 —— 结论卡 */}
      <ResearchInsightCard title="Alpha 是否跑赢正式评分" tone={headAlpha == null ? "neutral" : headAlpha > 0 ? "green" : "red"}>
        {headAlpha == null ? "暂无对照数据。" : headAlpha > 0
          ? <>在 {period} 日窗口 前20·20日 配置下，影子(Alpha)评分累计收益 <b style={{ color: RM.ink }}>{pct(data!.headline.shadow)}</b> <b style={{ color: RM.green }}>跑赢</b>正式评分 <b style={{ color: RM.ink }}>{pct(data!.headline.production)}</b>（超额 {pct(headAlpha)}）。</>
          : <>在 {period} 日窗口 前20·20日 配置下，影子(Alpha)评分累计收益 <b style={{ color: RM.ink }}>{pct(data!.headline.shadow)}</b> <b style={{ color: RM.red }}>未跑赢</b>正式评分 <b style={{ color: RM.ink }}>{pct(data!.headline.production)}</b>（超额 {pct(headAlpha)}）。可切换周期 / 配置进一步观察。</>}
      </ResearchInsightCard>

      {/* 持有周期卡（影子评分 · 前20，按 holdDays 维度） */}
      <ResearchSection title="持有周期表现" desc="影子评分 · 前20 组合 · 不同持有周期（本 API 的周期维度为持有天数）">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {HOLD.map((h) => {
            const c = cellMap.get(`ALPHA-20-${h}`);
            return <AlphaHorizonCard key={h} holdDays={h} c={c ?? null} />;
          })}
        </div>
      </ResearchSection>

      {/* 回测矩阵 */}
      <ResearchSection title="回测矩阵" desc={`${period} 日窗口 · ${VLABEL[view]} · 组合规模 × 持有周期`}>
        <div style={{ maxHeight: "calc(100vh - 320px)", overflow: "auto" }}>
          <ResearchTable minWidth={860}>
            <thead>
              <tr>
                <RTh>组合配置</RTh><RTh>策略</RTh><RTh align="right">累计收益</RTh><RTh align="right">Alpha年化</RTh>
                <RTh align="right">年化收益</RTh><RTh align="right">夏普</RTh><RTh align="right">最大回撤</RTh><RTh align="right">胜率</RTh><RTh align="right">样本</RTh>
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((c, i) => (
                <tr key={`${c.topN}-${c.holdDays}-${c.strategy}`} className={rowHoverClass} style={c.strategy === "ALPHA" ? { background: `${RM.blue}0f` } : undefined}>
                  <RTd mono color={RM.sub}>{isFirstOfConfig(i) ? `前${c.topN} · ${c.holdDays}日` : ""}</RTd>
                  <RTd color={c.strategy === "ALPHA" ? RM.blue : RM.sub}><span className="font-medium">{stratZh(c.strategy)}</span></RTd>
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
        <p className="text-[11px] mt-3" style={{ color: RM.faint }}>{BT_NOTE}</p>
      </ResearchSection>
    </ResearchPanelShell>
  );
}

// ── AlphaBacktestHero ─────────────────────────────────────────────────────────
function AlphaBacktestHero({ asOf, computedAt, period, totalObs, repAlpha, loading, error, hasData, onScore }: {
  asOf: string | null; computedAt: string | null; period: number; totalObs: number; repAlpha: Cell | null; loading: boolean; error: boolean; hasData: boolean; onScore?: () => void;
}) {
  const statusText = loading ? "运行中" : error ? "暂无数据" : hasData ? "已就绪" : "暂无数据";
  const statusTone: Tone = loading ? "amber" : error || !hasData ? "neutral" : "green";
  return (
    <div className="rounded-2xl px-6 py-5 flex flex-col lg:flex-row lg:items-center gap-4" style={{ background: RM.panel, border: `1px solid ${RM.border}` }}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]" style={{ color: RM.ink }}>Alpha策略回测</h1>
          <span className="text-[12px] font-medium" style={{ color: RM.faint }}>Alpha Strategy Backtest</span>
          <ResearchStatusBadge tone={statusTone}>{statusText}</ResearchStatusBadge>
        </div>
        <p className="mt-1.5 text-[13px]" style={{ color: RM.muted }}>Shadow策略表现 · Alpha收益验证 · 基准对比</p>
        <div className="mt-2 flex items-center gap-4 flex-wrap text-[12px]">
          <span style={{ color: RM.sub }}>累计样本 <b className="tabular-nums" style={{ color: RM.ink }}>{totalObs.toLocaleString()}</b></span>
          <span style={{ color: RM.sub }}>成熟周期 <b style={{ color: RM.ink }}>30 / 90 / 180 日</b></span>
          <span style={{ color: RM.faint }}>数据基准 <b className="tabular-nums" style={{ color: RM.sub }}>{asOf ?? "暂无数据"}</b></span>
          <span style={{ color: RM.faint }}>最近更新 <span className="tabular-nums" style={{ color: RM.sub }}>{computedAt ? new Date(computedAt).toLocaleString("zh-CN") : "暂无数据"}</span></span>
        </div>
      </div>
      <div className="shrink-0"><ResearchButton onClick={onScore} disabled={!onScore}>查看影子评分 →</ResearchButton></div>
    </div>
  );
}

// ── AlphaHorizonCard ──────────────────────────────────────────────────────────
function AlphaHorizonCard({ holdDays, c }: { holdDays: number; c: Cell | null }) {
  if (!c) {
    return (
      <div className="rounded-xl px-4 py-4" style={{ background: RM.card, border: `1px solid ${RM.border}` }}>
        <div className="flex items-center justify-between"><span className="text-[14px] font-semibold" style={{ color: RM.ink }}>{holdDays}日持有</span><ResearchStatusBadge tone="neutral">暂无数据</ResearchStatusBadge></div>
        <div className="mt-3 text-[13px]" style={{ color: RM.faint }}>该配置暂无回测样本。</div>
      </div>
    );
  }
  return (
    <div className="rounded-xl px-4 py-4" style={{ background: RM.card, border: `1px solid ${RM.border}`, borderTop: `2px solid ${RM.blue}` }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[14px] font-semibold" style={{ color: RM.ink }}>{holdDays}日持有</span>
        <ResearchStatusBadge tone="green">已就绪</ResearchStatusBadge>
      </div>
      <div className="text-[26px] font-semibold leading-none tabular-nums" style={{ color: retColor(c.cumReturn) }}>{pct(c.cumReturn)}</div>
      <div className="text-[11px] mt-1" style={{ color: RM.faint }}>累计收益 · 影子 前20</div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
        <Stat label="Alpha年化" val={pct(c.alpha)} color={retColor(c.alpha)} />
        <Stat label="夏普" val={num(c.sharpe)} />
        <Stat label="胜率" val={c.winRate == null ? "—" : `${c.winRate.toFixed(1)}%`} />
        <Stat label="样本" val={String(c.nObs)} />
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
