"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { getRecommendationLabel } from "@/lib/rec-config";
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
};
const REC_TONE: Record<string, Tone> = { STRONG_BUY: "green", BUY: "green", HOLD: "amber", WATCH: "amber", AVOID: "red" };
const HIGH_DIV = 20; // 高分歧阈值（展示层分类，非新研究指标）

function fx(v: number | null, d = 1) { return v == null ? "—" : v.toFixed(d); }
function topContribs(bd: Contribution[]): string {
  return [...(bd ?? [])].filter((b) => b.contribution !== 0)
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).slice(0, 3)
    .map((b) => `${FSHORT[b.factor] ?? b.factor}${b.contribution >= 0 ? "+" : ""}${b.contribution.toFixed(2)}`).join("  ") || "—";
}
function deltaOf(r: Row): number | null { return r.aiAdaptiveScore == null ? null : r.alphaScore - r.aiAdaptiveScore; }

export function AlphaScorePanel({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const { t, lang } = useI18n();
  const tx = t as (k: string) => string;
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

  if (error) return <ResearchPanelShell>{hero}<ResearchErrorState message={error} hint={t("rp.ascore.errHint")} actions={<ResearchButton onClick={goOverview} disabled={!goOverview}>{t("rp.ascore.backFactors")}</ResearchButton>} /></ResearchPanelShell>;
  if (loading) return <ResearchPanelShell>{hero}<ResearchLoadingState /></ResearchPanelShell>;
  if (!hasData) return <ResearchPanelShell>{hero}<ResearchEmptyState title={t("rp.ascore.emptyTitle")} desc={t("rp.ascore.emptyDesc")} actions={<><ResearchButton variant="primary" onClick={goBacktest} disabled={!goBacktest}>{t("rp.ascore.toBacktest")}</ResearchButton><ResearchButton onClick={goOverview} disabled={!goOverview}>{t("rp.ascore.backFactors")}</ResearchButton></>} /></ResearchPanelShell>;

  return (
    <ResearchPanelShell>
      {hero}

      {/* KPI —— Alpha/Production 覆盖 + 分歧统计（真实字段相减的展示层聚合） */}
      <ResearchKpiGrid>
        <ResearchKpiCard label={t("rp.ascore.kpiCoverage")} value={total.toLocaleString()} sub={t("rp.ascore.kpiCoverageSub")} tone="blue" />
        <ResearchKpiCard label={t("rp.ascore.kpiProd")} value={stat.withProd.toLocaleString()} sub={t("rp.ascore.kpiProdSub")} />
        <ResearchKpiCard label={t("rp.ascore.kpiMean")} value={fx(stat.mean, 1)} sub={t("rp.ascore.kpiMeanSub")} />
        <ResearchKpiCard label={t("rp.ascore.kpiHigh")} value={stat.high.toLocaleString()} sub={`|Δ| ≥ ${HIGH_DIV}`} tone={stat.high > 0 ? "amber" : "neutral"} />
        <ResearchKpiCard label={t("rp.ascore.kpiMax")} value={fx(stat.max, 1)} sub={t("rp.ascore.kpiMaxSub")} />
        <ResearchKpiCard label={t("rp.ascore.kpiHealth")} value={<span className="text-[16px]">{t("common.no_data")}</span>} sub={t("rp.ascore.kpiHealthSub")} />
      </ResearchKpiGrid>

      {/* 因子权重 + 观察 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2">
          <ResearchSection title={t("rp.ascore.weights")} desc={t("rp.ascore.weightsDesc")}>
            <div className="flex flex-wrap gap-2">
              {(data!.weights ?? []).map((w) => (
                <ResearchChip key={w.factor} tone={w.direction >= 0 ? "green" : "red"}>
                  {FSHORT[w.factor] ?? w.factor} {w.direction >= 0 ? "+" : "−"}{(w.weight * 100).toFixed(1)}%
                </ResearchChip>
              ))}
            </div>
          </ResearchSection>
        </div>
        <ResearchInsightCard title={t("rp.ascore.insight")} tone="blue">
          {t("rp.ascore.insightBody").replace("{total}", total.toLocaleString()).replace("{mean}", String(fx(stat.mean, 1))).replace("{high}", String(stat.high))}
        </ResearchInsightCard>
      </div>

      {/* Production vs Shadow 分歧分布 */}
      <ResearchSection title={t("rp.ascore.divTitle")} desc={t("rp.ascore.divDesc")}>
        <div className="grid grid-cols-3 gap-3">
          <DivBucket label={t("rp.ascore.bucketLow")} sub="|Δ| < 10" value={stat.low} tone="green" />
          <DivBucket label={t("rp.ascore.bucketMid")} sub="10 ≤ |Δ| < 20" value={stat.mid} tone="amber" />
          <DivBucket label={t("rp.ascore.bucketHigh")} sub={`|Δ| ≥ ${HIGH_DIV}`} value={stat.high} tone="red" />
        </div>
      </ResearchSection>

      {/* Top Divergence 表 */}
      <ResearchSection
        title={t("rp.ascore.topDiv")}
        desc={t("rp.ascore.topDivDesc").replace("{n}", rows.length.toLocaleString())}
        right={
          <div className="flex items-center gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("rp.ascore.search")} className="text-[12px] rounded-lg px-3 h-9 w-52 focus:outline-none" style={{ background: RM.card, color: RM.ink, border: `1px solid ${RM.border}` }} />
            <ResearchButton onClick={exportCsv} disabled={!rows.length}>{t("rp.ascore.exportCsv")}</ResearchButton>
          </div>
        }
      >
        {rows.length === 0 ? (
          <ResearchEmptyState title={t("rp.ascore.noMatch")} desc={t("rp.ascore.noMatchDesc")} />
        ) : (
          <div style={{ maxHeight: "calc(100vh - 300px)", overflow: "auto" }}>
            <ResearchTable minWidth={860}>
              <thead>
                <tr>
                  <RTh>{t("rp.ascore.colStock")}</RTh>
                  <RTh align="right">{t("rp.ascore.colProd")}</RTh>
                  <RTh align="right">{t("rp.ascore.colAlpha")}</RTh>
                  <RTh align="right">{t("rp.ascore.colDelta")}</RTh>
                  <RTh align="center">{t("rp.ascore.colRating")}</RTh>
                  <RTh>{t("rp.ascore.colFactors")}</RTh>
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
                        {d != null && Math.abs(d) >= HIGH_DIV ? <span className="ml-1.5"><ResearchStatusBadge tone="amber">{t("rp.ascore.bucketHigh")}</ResearchStatusBadge></span> : null}
                      </RTd>
                      <RTd align="center">{r.aiRecommendationV2 ? <ResearchStatusBadge tone={REC_TONE[r.aiRecommendationV2] ?? "neutral"}>{getRecommendationLabel(r.aiRecommendationV2, lang)}</ResearchStatusBadge> : <span style={{ color: RM.faint }}>—</span>}</RTd>
                      <RTd color={RM.faint}><span className="text-[11px] font-mono">{topContribs(r.factorBreakdown)}</span></RTd>
                    </tr>
                  );
                })}
              </tbody>
            </ResearchTable>
            {rows.length > 600 && <div className="mt-2 text-[12px]" style={{ color: RM.faint }}>{t("rp.ascore.rowLimit").replace("{n}", rows.length.toLocaleString())}</div>}
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
      <div className="mt-1 text-[22px] font-semibold tabular-nums" style={{ color: c }}>{value.toLocaleString()}</div>
      <div className="text-[11px]" style={{ color: RM.faint }}>{sub}</div>
    </div>
  );
}

// ── ShadowAlphaHero ───────────────────────────────────────────────────────────
function ShadowAlphaHero({ computedAt, date, loading, error, hasData, onBacktest }: {
  computedAt: string | null; date: string | null; loading: boolean; error: boolean; hasData: boolean; onBacktest?: () => void;
}) {
  const { t } = useI18n();
  const tx = t as (k: string) => string;
  const statusText = loading ? tx("common.loading") : hasData && !error ? tx("rp.ascore.statusOn") : tx("common.no_data");
  const statusTone: Tone = loading ? "amber" : error || !hasData ? "neutral" : "green";
  return (
    <div className="rounded-2xl px-6 py-5 flex flex-col lg:flex-row lg:items-center gap-4" style={{ background: RM.panel, border: `1px solid ${RM.border}` }}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]" style={{ color: RM.ink }}>{tx("rw.a.score")}</h1>
          <span className="text-[12px] font-medium" style={{ color: RM.faint }}>Shadow Alpha Scoring</span>
          <ResearchStatusBadge tone={statusTone}>{statusText}</ResearchStatusBadge>
          <ResearchStatusBadge tone="amber">{tx("rw.v.shadow")}</ResearchStatusBadge>
        </div>
        <p className="mt-1.5 text-[13px]" style={{ color: RM.muted }}>{tx("rp.ascore.subtitle")}</p>
        <div className="mt-2 flex items-center gap-4 flex-wrap text-[12px]">
          
          <span style={{ color: RM.faint }}>{tx("common.asOf.data")} <b className="tabular-nums" style={{ color: RM.sub }}>{date ?? tx("common.no_data")}</b></span>
          
        </div>
      </div>
      <div className="shrink-0"><ResearchButton onClick={onBacktest} disabled={!onBacktest}>{tx("rp.ascore.toBacktest")} →</ResearchButton></div>
    </div>
  );
}
