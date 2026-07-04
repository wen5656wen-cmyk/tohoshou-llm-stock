"use client";

import { useEffect, useMemo, useState } from "react";
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

const RZH: Record<string, string> = { BULL: "牛市", SIDEWAYS: "震荡市", BEAR: "熊市" };
const RHEX: Record<string, string> = { BULL: RM.green, SIDEWAYS: RM.amber, BEAR: RM.red };
const RTONE: Record<string, Tone> = { BULL: "green", SIDEWAYS: "amber", BEAR: "red" };
const FR_NOTE = "融合 = w·影子评分 + (1-w)·正式评分（两者截面标准化）。最优 w 由历史按市场状态搜索得出（前20 · 持有20日，最大化夏普比率）。由 DailyPrice 重建，正式推荐不受影响。";
function pct(v: number | null) { return v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`; }
function num(v: number | null, d = 2) { return v == null ? "—" : v.toFixed(d); }

// 决策：比较 融合方案 vs 正式评分 的历史夏普（展示层比较，非新逻辑）
function verdict(r: RegimeRow): { label: string; tone: Tone } {
  const f = r.fused.sharpe, p = r.production.sharpe;
  if (f == null || p == null) return { label: "样本不足", tone: "neutral" };
  if (f > p + 0.05) return { label: "融合占优", tone: "green" };
  if (f < p - 0.05) return { label: "正式占优", tone: "blue" };
  return { label: "基本持平", tone: "amber" };
}

export function FusionReportPanel({ onNavigate }: { onNavigate?: (tab: string) => void }) {
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
    const fusionWins = regimes.filter((r) => verdict(r).label === "融合占优").length;
    return { avgW, fusionWins };
  }, [regimes, hasData]);

  function exportCsv() {
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
        <ResearchErrorState message={error} hint={<>请运行 <code style={{ color: RM.sub }}>npm run research-fusion</code> 生成融合研究报告。</>}
          actions={<ResearchButton onClick={goOverview} disabled={!goOverview}>返回综合驾驶舱</ResearchButton>} />
      </ResearchPanelShell>
    );
  }
  if (loading) return <ResearchPanelShell>{hero}<FusionFlow /><ResearchLoadingState label="正在加载融合研究报告…" /></ResearchPanelShell>;
  if (!hasData) {
    return (
      <ResearchPanelShell>
        {hero}
        <FusionFlow />
        <ResearchEmptyState title="暂无融合研究数据" desc="融合研究报告尚未生成或 API 暂无返回。"
          actions={<><ResearchButton variant="primary" onClick={goRegime} disabled={!goRegime}>查看市场状态</ResearchButton><ResearchButton onClick={goOverview} disabled={!goOverview}>返回综合驾驶舱</ResearchButton></>} />
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
        <ResearchKpiCard label="覆盖市场状态" value={regimes.length} sub="牛 / 震荡 / 熊" tone="blue" />
        <ResearchKpiCard label="研究目标" value={<span className="text-[16px]">{data?.objective ?? "—"}</span>} sub="最优化指标" />
        <ResearchKpiCard label="融合占优状态" value={`${kpi!.fusionWins}/${regimes.length}`} sub="融合夏普 > 正式" tone={kpi!.fusionWins > 0 ? "green" : "neutral"} />
        <ResearchKpiCard label="平均影子权重" value={kpi!.avgW == null ? "暂无数据" : kpi!.avgW.toFixed(2)} sub="最优 w 均值" />
        <ResearchKpiCard label="数据基准" value={<span className="text-[15px]">{data?.asOfLatest ?? "暂无数据"}</span>} sub="asOfLatest" />
        <ResearchKpiCard label="运行模式" value={<span className="text-[15px]">研究模式</span>} sub="不参与正式推荐" tone="amber" />
      </ResearchKpiGrid>

      {/* Decision Panel */}
      <FusionDecisionPanel regimes={regimes} fusionWins={kpi!.fusionWins} />

      {/* Research Conclusion */}
      <ResearchSection title="研究结论" desc="融合方法与各市场状态发现">
        <ResearchInsightCard title="方法论" tone="blue">{FR_NOTE}</ResearchInsightCard>
        <div className="mt-3 space-y-1.5">
          {regimes.map((r) => {
            const v = verdict(r);
            return (
              <div key={r.regime} className="flex items-center gap-3 px-3 py-2.5 rounded-lg flex-wrap" style={{ background: RM.card, border: `1px solid ${RM.border}` }}>
                <span className="text-[13px] font-semibold shrink-0 w-16" style={{ color: RHEX[r.regime] }}>{RZH[r.regime] ?? r.regime}</span>
                <span className="text-[12px]" style={{ color: RM.sub }}>最优比例（正式/影子）<b style={{ color: RM.ink }}>{r.ratio ?? "—"}</b></span>
                <span className="text-[12px]" style={{ color: RM.sub }}>融合夏普 <b style={{ color: retColor(r.fused.sharpe) }}>{num(r.fused.sharpe)}</b> vs 正式 <b style={{ color: RM.ink }}>{num(r.production.sharpe)}</b></span>
                <ResearchStatusBadge tone={v.tone}>{v.label}</ResearchStatusBadge>
              </div>
            );
          })}
        </div>
      </ResearchSection>

      {/* 各市场状态明细卡 */}
      <ResearchSection title="各市场状态融合明细" desc="正式 / 影子 / 最佳融合方案 · 权重-夏普搜索曲线" right={<ResearchButton onClick={exportCsv}>导出CSV</ResearchButton>}>
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
  const statusText = loading ? "运行中" : error ? "暂无数据" : hasData ? "已就绪" : "暂无数据";
  const statusTone: Tone = loading ? "amber" : error || !hasData ? "neutral" : "green";
  return (
    <div className="rounded-2xl px-6 py-5 flex flex-col lg:flex-row lg:items-center gap-4" style={{ background: RM.panel, border: `1px solid ${RM.border}` }}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]" style={{ color: RM.ink }}>AI融合策略研究</h1>
          <span className="text-[12px] font-medium" style={{ color: RM.faint }}>Fusion Research</span>
          <ResearchStatusBadge tone={statusTone}>{statusText}</ResearchStatusBadge>
          <ResearchStatusBadge tone="amber">研究模式</ResearchStatusBadge>
        </div>
        <p className="mt-1.5 text-[13px]" style={{ color: RM.muted }}>Production · Shadow · Fusion · Research</p>
        <div className="mt-2 flex items-center gap-4 flex-wrap text-[12px]">
          <span style={{ color: RM.sub }}>研究目标 <b style={{ color: RM.ink }}>{objective ?? "—"}</b></span>
          <span style={{ color: RM.sub }}>数据基准 <b className="tabular-nums" style={{ color: RM.ink }}>{asOfLatest ?? "暂无数据"}</b></span>
          <span style={{ color: RM.faint }}>最后更新 <span className="tabular-nums" style={{ color: RM.sub }}>{computedAt ? new Date(computedAt).toLocaleString("zh-CN") : "暂无数据"}</span></span>
        </div>
      </div>
      <div className="shrink-0"><ResearchButton onClick={onRegime} disabled={!onRegime}>查看市场状态 →</ResearchButton></div>
    </div>
  );
}

// ── FusionFlow ────────────────────────────────────────────────────────────────
const FLOW = [
  { key: "Adaptive", zh: "Adaptive", sub: "正式评分" },
  { key: "Shadow", zh: "Shadow", sub: "影子评分" },
  { key: "Fusion", zh: "Fusion", sub: "融合研究" },
  { key: "Strategy", zh: "Strategy", sub: "策略" },
  { key: "Recommendation", zh: "Recommendation", sub: "建议" },
  { key: "Production", zh: "Production", sub: "正式生产" },
];
function FusionFlow() {
  return (
    <ResearchSection title="融合决策链" desc="本页研究（Fusion）在评分决策链中的位置">
      <div className="flex items-stretch gap-1.5 flex-wrap">
        {FLOW.map((n, i) => {
          const active = n.key === "Fusion";
          return (
            <div key={n.key} className="flex items-center gap-1.5">
              <div className="rounded-xl px-3.5 py-2.5 min-w-[104px]" style={{ background: active ? `${RM.blue}1f` : RM.card, border: `1px solid ${active ? RM.blue : RM.border}` }}>
                <div className="text-[13px] font-semibold" style={{ color: active ? RM.blue : RM.ink }}>{n.zh}</div>
                <div className="text-[11px] mt-0.5" style={{ color: RM.faint }}>{n.sub}</div>
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
  const overallTone: Tone = fusionWins >= 2 ? "green" : fusionWins === 1 ? "amber" : "blue";
  const overall = fusionWins >= 2 ? "多数市场状态下融合方案历史更优，研究倾向推进融合评估" : fusionWins === 1 ? "部分市场状态下融合占优，建议继续观察验证" : "融合方案未显著超越正式评分，研究倾向继续 Production";
  return (
    <ResearchSection title="决策面板" desc="基于历史夏普比较的只读研究结论（是否采纳由人工决定）">
      <div className="rounded-xl px-4 py-3.5 mb-3 flex items-center gap-3 flex-wrap" style={{ background: RM.card, border: `1px solid ${RM.border}` }}>
        <ResearchStatusBadge tone={overallTone}>{fusionWins}/{regimes.length} 状态融合占优</ResearchStatusBadge>
        <span className="text-[13px]" style={{ color: RM.sub }}>{overall}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {regimes.map((r) => {
          const v = verdict(r);
          const rec = v.label === "融合占优" ? "研究倾向：建议 Fusion" : v.label === "正式占优" ? "研究倾向：继续 Production" : v.label === "基本持平" ? "研究倾向：继续观察" : "样本不足";
          return (
            <div key={r.regime} className="rounded-xl px-4 py-3.5" style={{ background: RM.card, border: `1px solid ${RM.border}` }}>
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-semibold" style={{ color: RHEX[r.regime] }}>{RZH[r.regime] ?? r.regime}</span>
                <ResearchStatusBadge tone={v.tone}>{v.label}</ResearchStatusBadge>
              </div>
              <div className="mt-2 text-[13px] font-medium" style={{ color: RM.ink }}>{rec}</div>
              <div className="mt-1 text-[11px]" style={{ color: RM.faint }}>最优比例 正式/影子 {r.ratio ?? "—"} · {r.nDays} 天</div>
            </div>
          );
        })}
      </div>
    </ResearchSection>
  );
}

// ── RegimeCard ────────────────────────────────────────────────────────────────
function RegimeCard({ r }: { r: RegimeRow }) {
  const w = r.bestAlphaWeight ?? 0;
  const grid = r.grid ?? [];
  const maxS = Math.max(...grid.map((g) => g.sharpe ?? -1e9), 0.001);
  const minS = Math.min(...grid.map((g) => g.sharpe ?? 1e9), 0);
  return (
    <div className="rounded-xl p-4" style={{ background: RM.card, border: `1px solid ${RM.border}`, borderTop: `2px solid ${RHEX[r.regime]}` }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[15px] font-bold" style={{ color: RHEX[r.regime] }}>{RZH[r.regime] ?? r.regime}</span>
        <span className="text-[11px]" style={{ color: RM.faint }}>{r.nDays} 天 · 前20 · 20日</span>
      </div>
      <div className="rounded-lg px-3 py-2 mb-3" style={{ background: RM.panel, border: `1px solid ${RM.border}` }}>
        <div className="text-[11px]" style={{ color: RM.muted }}>最佳融合比例（正式 / 影子）</div>
        <div className="text-[20px] font-bold tabular-nums" style={{ color: RM.ink }}>{r.ratio ?? "—"}</div>
        <div className="text-[10px]" style={{ color: RM.faint }}>影子权重 = {num(r.bestAlphaWeight, 2)} · 历史搜索，非人工</div>
      </div>
      <table className="w-full text-[12px] mb-3" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ color: RM.muted }}>
            <th className="text-left py-1 font-medium"></th>
            <th className="text-right py-1 font-medium">累计收益</th>
            <th className="text-right py-1 font-medium">夏普</th>
            <th className="text-right py-1 font-medium">胜率</th>
            <th className="text-right py-1 font-medium">回撤</th>
          </tr>
        </thead>
        <tbody>
          {([["正式评分", r.production], ["影子评分", r.alpha], ["最佳融合", r.fused]] as const).map(([label, s]) => (
            <tr key={label} style={{ borderTop: `1px solid ${RM.border}` }}>
              <td className="py-1.5 font-medium" style={{ color: RM.sub }}>{label}</td>
              <td className="py-1.5 text-right tabular-nums" style={{ color: retColor(s.cumReturn) }}>{pct(s.cumReturn)}</td>
              <td className="py-1.5 text-right tabular-nums" style={{ color: RM.ink }}>{num(s.sharpe)}</td>
              <td className="py-1.5 text-right tabular-nums" style={{ color: RM.sub }}>{s.winRate == null ? "—" : `${s.winRate.toFixed(0)}%`}</td>
              <td className="py-1.5 text-right tabular-nums" style={{ color: RM.red }}>{s.maxDrawdown == null ? "—" : `-${s.maxDrawdown.toFixed(1)}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-[10px] mb-1" style={{ color: RM.faint }}>不同影子权重下的夏普（0 → 1）</div>
      <div className="flex items-end gap-[2px] h-14">
        {grid.map((g) => {
          const h = g.sharpe == null ? 0 : Math.max(3, ((g.sharpe - minS) / (maxS - minS || 1)) * 100);
          const isBest = Math.abs(g.w - w) < 0.001;
          return <div key={g.w} title={`w=${g.w} 夏普=${num(g.sharpe)}`} style={{ flex: 1, height: `${h}%`, background: isBest ? RHEX[r.regime] : "#343A44", borderRadius: "2px 2px 0 0" }} />;
        })}
      </div>
      <div className="flex justify-between text-[9px] mt-0.5" style={{ color: RM.faint }}><span>0</span><span>影子权重</span><span>1</span></div>
    </div>
  );
}
