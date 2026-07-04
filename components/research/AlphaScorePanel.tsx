"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  RM,
  ResearchPanelShell,
  ResearchStatusBadge,
  ResearchButton,
  ResearchKpiGrid,
  ResearchKpiCard,
  ResearchSection,
  ResearchChip,
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

// 影子评分（Alpha）— Shadow Alpha Scoring（AI 研究中心 · Shadow·Alpha 组）。
// 纯展示层：只读现有 /api/alpha/score，对照 Alpha(影子) 与 Production(正式) 评分差异。
// 不改任何 API / Shadow 评分算法 / Alpha Score 计算。差异 = 两个已有字段的展示层相减。

type Contribution = { factor: string; value: number | null; z: number | null; direction: number; weight: number; contribution: number };
type Row = {
  symbol: string; name: string; nameZh: string | null; sector: string | null;
  alphaScore: number; composite: number; rank: number; percentile: number;
  factorBreakdown: Contribution[];
  aiAdaptiveScore: number | null; aiPercentile: number | null; aiRecommendationV2: string | null;
  drGptRank: number | null; drRecommendation: string | null;
};
type Weight = { factor: string; direction: number; weight: number };
type Resp = { date: string | null; computedAt: string | null; total: number; weights: Weight[]; rows: Row[] };

const FSHORT: Record<string, string> = {
  RelativeStrength: "相对强弱", ATR: "波动率", VolumeRatio: "量比",
  AverageTurnover: "成交额", Distance52WeekHigh: "距52周高", VolumeExpansion: "放量",
};
const REC_TONE: Record<string, Tone> = { STRONG_BUY: "green", BUY: "green", HOLD: "amber", WATCH: "amber", AVOID: "red" };
const REC_ZH: Record<string, string> = { STRONG_BUY: "强力买入", BUY: "买入", HOLD: "持有", WATCH: "观察", AVOID: "回避" };
const HIGH_DIV = 20; // 高分歧阈值（展示层分类，非新研究指标）

function fx(v: number | null, d = 1) { return v == null ? "—" : v.toFixed(d); }
function topContribs(bd: Contribution[]): string {
  return [...(bd ?? [])].filter((b) => b.contribution !== 0)
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).slice(0, 3)
    .map((b) => `${FSHORT[b.factor] ?? b.factor}${b.contribution >= 0 ? "+" : ""}${b.contribution.toFixed(2)}`).join("  ") || "—";
}
function deltaOf(r: Row): number | null { return r.aiAdaptiveScore == null ? null : r.alphaScore - r.aiAdaptiveScore; }

export function AlphaScorePanel({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    setLoading(true);
    fetch("/api/alpha/score?limit=3000")
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: Resp) => { setData(d); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, []);

  // 分歧统计（真实字段相减的展示层聚合）
  const stat = useMemo(() => {
    const rows = data?.rows ?? [];
    const withProd = rows.filter((r) => r.aiAdaptiveScore != null);
    const deltas = withProd.map((r) => Math.abs(r.alphaScore - (r.aiAdaptiveScore ?? 0)));
    const mean = deltas.length ? deltas.reduce((s, x) => s + x, 0) / deltas.length : null;
    const max = deltas.length ? Math.max(...deltas) : null;
    const high = deltas.filter((x) => x >= HIGH_DIV).length;
    const mid = deltas.filter((x) => x >= 10 && x < HIGH_DIV).length;
    const low = deltas.filter((x) => x < 10).length;
    return { withProd: withProd.length, mean, max, high, mid, low };
  }, [data]);

  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    const filtered = !q.trim() ? all : all.filter((r) => r.symbol.toLowerCase().includes(q.trim().toLowerCase()) || (r.name ?? "").toLowerCase().includes(q.trim().toLowerCase()) || (r.nameZh ?? "").includes(q.trim()));
    // 默认按分歧幅度降序（Top Divergence）
    return [...filtered].sort((a, b) => {
      const da = deltaOf(a), db = deltaOf(b);
      return (db == null ? -1 : Math.abs(db)) - (da == null ? -1 : Math.abs(da));
    });
  }, [data, q]);

  function exportCsv() {
    if (!data) return;
    const header = ["rank", "symbol", "name", "alphaScore", "productionScore", "delta", "aiRecommendationV2", "topContribs"];
    const lines = [header.join(",")];
    for (const r of rows) lines.push([r.rank, r.symbol, `"${(r.name ?? "").replace(/"/g, '""')}"`, r.alphaScore, r.aiAdaptiveScore ?? "", deltaOf(r)?.toFixed(2) ?? "", r.aiRecommendationV2 ?? "", `"${topContribs(r.factorBreakdown)}"`].join(","));
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `alpha-score-${data.date ?? "latest"}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  const total = data?.total ?? 0;
  const hasData = !!data && total > 0;
  const goBacktest = onNavigate ? () => onNavigate("backtest") : undefined;
  const goOverview = onNavigate ? () => onNavigate("overview") : undefined;
  const hero = <ShadowAlphaHero computedAt={data?.computedAt ?? null} date={data?.date ?? null} loading={loading} error={!!error} hasData={hasData} onBacktest={goBacktest} />;

  if (error) return <ResearchPanelShell>{hero}<ResearchErrorState message={error} hint={<>请运行 <code style={{ color: RM.sub }}>npm run compute-alpha-score</code> 生成影子评分。</>} actions={<ResearchButton onClick={goOverview} disabled={!goOverview}>返回综合驾驶舱</ResearchButton>} /></ResearchPanelShell>;
  if (loading) return <ResearchPanelShell>{hero}<ResearchLoadingState label="正在加载影子评分…" /></ResearchPanelShell>;
  if (!hasData) return <ResearchPanelShell>{hero}<ResearchEmptyState title="暂无影子评分数据" desc="Alpha 影子评分尚未生成或 API 暂无返回。" actions={<><ResearchButton variant="primary" onClick={goBacktest} disabled={!goBacktest}>查看 Alpha策略回测</ResearchButton><ResearchButton onClick={goOverview} disabled={!goOverview}>返回综合驾驶舱</ResearchButton></>} /></ResearchPanelShell>;

  return (
    <ResearchPanelShell>
      {hero}

      {/* KPI —— Alpha/Production 覆盖 + 分歧统计（真实字段相减的展示层聚合） */}
      <ResearchKpiGrid>
        <ResearchKpiCard label="Alpha评分覆盖" value={total.toLocaleString()} sub="影子评分股票数" tone="blue" />
        <ResearchKpiCard label="Production覆盖" value={stat.withProd.toLocaleString()} sub="有正式评分对照" />
        <ResearchKpiCard label="平均分差" value={fx(stat.mean, 1)} sub="|Alpha − 正式| 均值" />
        <ResearchKpiCard label="高分歧数" value={stat.high.toLocaleString()} sub={`|分差| ≥ ${HIGH_DIV}`} tone={stat.high > 0 ? "amber" : "neutral"} />
        <ResearchKpiCard label="最大分差" value={fx(stat.max, 1)} sub="单只最大分歧" />
        <ResearchKpiCard label="影子健康度" value={<span className="text-[16px]">暂无数据</span>} sub="API 无健康度字段" />
      </ResearchKpiGrid>

      {/* 因子权重 + 观察 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2">
          <ResearchSection title="Alpha 因子权重" desc="影子评分的 6 因子方向与权重（API 原值）">
            <div className="flex flex-wrap gap-2">
              {(data!.weights ?? []).map((w) => (
                <ResearchChip key={w.factor} tone={w.direction >= 0 ? "green" : "red"}>
                  {FSHORT[w.factor] ?? w.factor} {w.direction >= 0 ? "+" : "−"}{(w.weight * 100).toFixed(1)}%
                </ResearchChip>
              ))}
            </div>
          </ResearchSection>
        </div>
        <ResearchInsightCard title="影子评分观察" tone="blue">
          覆盖 <b style={{ color: RM.ink }}>{total.toLocaleString()}</b> 只，与正式评分平均分差 <b style={{ color: RM.ink }}>{fx(stat.mean, 1)}</b>，高分歧 <b style={{ color: RM.ink }}>{stat.high}</b> 只。是否融合见 <button onClick={goBacktest} disabled={!goBacktest} className="font-semibold disabled:opacity-40" style={{ color: RM.blue }}>Alpha策略回测</button>。
        </ResearchInsightCard>
      </div>

      {/* Production vs Shadow 分歧分布 */}
      <ResearchSection title="Production vs Shadow 分歧分布" desc="按 |Alpha − 正式| 分档统计（一致 / 分歧 / 高分歧）">
        <div className="grid grid-cols-3 gap-3">
          <DivBucket label="一致" sub="|分差| < 10" value={stat.low} tone="green" />
          <DivBucket label="分歧" sub="10 ≤ |分差| < 20" value={stat.mid} tone="amber" />
          <DivBucket label="高分歧" sub={`|分差| ≥ ${HIGH_DIV}`} value={stat.high} tone="red" />
        </div>
      </ResearchSection>

      {/* Top Divergence 表 */}
      <ResearchSection
        title="Top Divergence · 分歧最大股票"
        desc={`按 |Alpha − 正式| 降序 · 共 ${rows.length.toLocaleString()} 行`}
        right={
          <div className="flex items-center gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索代码 / 名称…" className="text-[12px] rounded-lg px-3 h-9 w-52 focus:outline-none" style={{ background: RM.card, color: RM.ink, border: `1px solid ${RM.border}` }} />
            <ResearchButton onClick={exportCsv} disabled={!rows.length}>导出CSV</ResearchButton>
          </div>
        }
      >
        {rows.length === 0 ? (
          <ResearchEmptyState title="无匹配股票" desc="尝试更换搜索关键词，或清空搜索框。" />
        ) : (
          <div style={{ maxHeight: "calc(100vh - 300px)", overflow: "auto" }}>
            <ResearchTable minWidth={860}>
              <thead>
                <tr>
                  <RTh>股票</RTh>
                  <RTh align="right">正式评分</RTh>
                  <RTh align="right">Alpha评分</RTh>
                  <RTh align="right">差异</RTh>
                  <RTh align="center">AI评级</RTh>
                  <RTh>主要贡献因子</RTh>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 600).map((r) => {
                  const d = deltaOf(r);
                  return (
                    <tr key={r.symbol} className={rowHoverClass}>
                      <RTd>
                        <Link href={`/stocks/${encodeURIComponent(r.symbol)}`} style={{ color: RM.blue }} className="hover:underline font-mono">{r.symbol}</Link>
                        <span className="ml-1.5 truncate inline-block max-w-[130px] align-bottom" style={{ color: RM.sub }}>{r.nameZh ?? r.name}</span>
                      </RTd>
                      <RTd align="right" mono color={RM.sub}>{fx(r.aiAdaptiveScore, 0)}</RTd>
                      <RTd align="right" mono color={RM.ink}>{r.alphaScore.toFixed(1)}</RTd>
                      <RTd align="right" mono color={retColor(d)}>
                        {d == null ? "—" : `${d >= 0 ? "+" : ""}${d.toFixed(1)}`}
                        {d != null && Math.abs(d) >= HIGH_DIV ? <span className="ml-1.5"><ResearchStatusBadge tone="amber">高分歧</ResearchStatusBadge></span> : null}
                      </RTd>
                      <RTd align="center">{r.aiRecommendationV2 ? <ResearchStatusBadge tone={REC_TONE[r.aiRecommendationV2] ?? "neutral"}>{REC_ZH[r.aiRecommendationV2] ?? r.aiRecommendationV2}</ResearchStatusBadge> : <span style={{ color: RM.faint }}>—</span>}</RTd>
                      <RTd color={RM.faint}><span className="text-[11px] font-mono">{topContribs(r.factorBreakdown)}</span></RTd>
                    </tr>
                  );
                })}
              </tbody>
            </ResearchTable>
            {rows.length > 600 && <div className="mt-2 text-[12px]" style={{ color: RM.faint }}>为保证渲染性能，仅展示前 600 行（共 {rows.length.toLocaleString()} 行）。完整数据请「导出CSV」。</div>}
          </div>
        )}
      </ResearchSection>
    </ResearchPanelShell>
  );
}

function DivBucket({ label, sub, value, tone }: { label: string; sub: string; value: number; tone: Tone }) {
  const c = tone === "green" ? RM.green : tone === "amber" ? RM.amber : RM.red;
  return (
    <div className="rounded-xl px-4 py-3" style={{ background: RM.card, border: `1px solid ${RM.border}` }}>
      <div className="text-[11px]" style={{ color: RM.muted }}>{label}</div>
      <div className="mt-1 text-[22px] font-semibold tabular-nums" style={{ color: c }}>{value.toLocaleString()}<span className="text-[12px] ml-1" style={{ color: RM.faint }}>只</span></div>
      <div className="text-[11px]" style={{ color: RM.faint }}>{sub}</div>
    </div>
  );
}

// ── ShadowAlphaHero ───────────────────────────────────────────────────────────
function ShadowAlphaHero({ computedAt, date, loading, error, hasData, onBacktest }: {
  computedAt: string | null; date: string | null; loading: boolean; error: boolean; hasData: boolean; onBacktest?: () => void;
}) {
  const statusText = loading ? "运行中" : error ? "暂无数据" : hasData ? "已启用" : "暂无数据";
  const statusTone: Tone = loading ? "amber" : error || !hasData ? "neutral" : "green";
  return (
    <div className="rounded-2xl px-6 py-5 flex flex-col lg:flex-row lg:items-center gap-4" style={{ background: RM.panel, border: `1px solid ${RM.border}` }}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]" style={{ color: RM.ink }}>影子评分</h1>
          <span className="text-[12px] font-medium" style={{ color: RM.faint }}>Shadow Alpha Scoring</span>
          <ResearchStatusBadge tone={statusTone}>{statusText}</ResearchStatusBadge>
          <ResearchStatusBadge tone="amber">影子模式</ResearchStatusBadge>
        </div>
        <p className="mt-1.5 text-[13px]" style={{ color: RM.muted }}>Alpha评分对照 · Production差异 · Shadow验证</p>
        <div className="mt-2 flex items-center gap-4 flex-wrap text-[12px]">
          <span style={{ color: RM.sub }}>当前模式 <b style={{ color: RM.ink }}>影子（Shadow）</b></span>
          <span style={{ color: RM.faint }}>数据日期 <b className="tabular-nums" style={{ color: RM.sub }}>{date ?? "暂无数据"}</b></span>
          <span style={{ color: RM.faint }}>最近计算 <span className="tabular-nums" style={{ color: RM.sub }}>{computedAt ? new Date(computedAt).toLocaleString("zh-CN") : "暂无数据"}</span></span>
        </div>
      </div>
      <div className="shrink-0"><ResearchButton onClick={onBacktest} disabled={!onBacktest}>查看 Alpha策略回测 →</ResearchButton></div>
    </div>
  );
}
