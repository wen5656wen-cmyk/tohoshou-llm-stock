"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
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
  ResearchStackBar,
  ResearchTable,
  RTh,
  RTd,
  rowHoverClass,
  ResearchLoadingState,
  ResearchEmptyState,
  ResearchErrorState,
  type Tone,
} from "./kit";

// V3动态评分 — Adaptive V3 Intelligence（AI 研究中心 · V3 组）。
// 纯展示层：只读现有 /api/scoring-v3/shadow，展示 Adaptive Score V3（Shadow 影子，不影响正式推荐）。
// 不改任何 API / Adaptive-v3 / Scoring / 评分算法。评分均值为已有字段的展示层聚合。

type Row = {
  symbol: string; name: string; nameZh: string | null;
  scoreV3: number; rawScore: number; riskAdjustment: number; rank: number; percentile: number; rating: string;
  confidence: number; qualityScore: number; calibrated: boolean;
  subScores: Record<string, number | null> | null; contributions: Record<string, number | null> | null;
  explanation: string;
  v2AdaptiveScore: number | null; v2PercentileRank: number | null; v2Rec: string | null;
};
type Shadow = {
  date: string | null; computedAt: string | null; regime: string | null;
  weights: Record<string, number> | null; total: number;
  ratingDist: Record<string, number>; dimCoverage: Record<string, number>; rows: Row[];
};

const DIM_KEY: Record<string, string> = { technical: "rp.v3cal.dim.technical", fundamental: "rp.v3cal.dim.fundamental", alpha: "rp.v3cal.dim.alpha", news: "rp.v3cal.dim.news", flow: "rp.v3cal.dim.flow" };

const RATING_TONE: Record<string, Tone> = { STRONG_BUY: "green", BUY: "green", HOLD: "neutral", WATCH: "amber", AVOID: "red" };
const RATING_HEX: Record<string, string> = { STRONG_BUY: RM.green, BUY: "#30B0C7", HOLD: RM.faint, WATCH: RM.amber, AVOID: RM.red };
const REGIME_KEY: Record<string, string> = { BULL: "dc.regime.BULL", BEAR: "dc.regime.BEAR", SIDEWAYS: "dc.regime.SIDEWAYS" };
function fx(v: number | null | undefined, d = 1) { return v == null ? "—" : v.toFixed(d); }

export function ScoreV3Panel({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const { lang } = useI18n();
  const { t } = useI18n();
  const tx = t as (k: string) => string;
  const [data, setData] = useState<Shadow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/scoring-v3/shadow?limit=3000")
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: Shadow) => setData(d)).catch((e) => setError(String(e)));
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    if (!q.trim()) return data.rows;
    const ql = q.trim().toLowerCase();
    return data.rows.filter((r) => r.symbol.toLowerCase().includes(ql) || (r.name ?? "").toLowerCase().includes(ql) || (r.nameZh ?? "").includes(q.trim()));
  }, [data, q]);

  const avgScore = useMemo(() => {
    const rs = data?.rows ?? []; if (!rs.length) return null;
    return rs.reduce((s, r) => s + r.scoreV3, 0) / rs.length;
  }, [data]);

  function exportCsv() {
    if (!data) return;
    const head = ["rank", "symbol", "name", "scoreV3", "rating", "percentile", "confidence", "riskAdjustment", "v2AdaptiveScore", "v2Rec"];
    const lines = [head.join(",")];
    for (const r of data.rows) lines.push([r.rank, r.symbol, `"${(r.name ?? "").replace(/"/g, '""')}"`, r.scoreV3, r.rating, r.percentile, r.confidence, r.riskAdjustment, r.v2AdaptiveScore ?? "", r.v2Rec ?? ""].join(","));
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `score-v3-${data.date ?? "latest"}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  const total = data?.total ?? 0;
  const hasData = !!data && (data.rows?.length ?? 0) > 0;
  const goCalib = onNavigate ? () => onNavigate("calibration") : undefined;
  const goOverview = onNavigate ? () => onNavigate("overview") : undefined;
  const dist = data?.ratingDist ?? {};
  const topRow = data?.rows?.[0];

  const hero = (
    <AdaptiveScoreHero date={data?.date ?? null} computedAt={data?.computedAt ?? null} regime={data?.regime ?? null}
      total={total} loading={!data && !error} error={!!error} hasData={hasData} topRating={topRow?.rating ?? null} onCalib={goCalib} />
  );

  if (error) return <ResearchPanelShell>{hero}<ResearchErrorState message={error} hint={tx("rp.v3s.errHint")} actions={<ResearchButton onClick={goOverview} disabled={!goOverview}>{tx("rp.v3s.backFactors")}</ResearchButton>} /></ResearchPanelShell>;
  if (!data) return <ResearchPanelShell>{hero}<ResearchLoadingState /></ResearchPanelShell>;
  if (!hasData) return <ResearchPanelShell>{hero}<ResearchEmptyState title={tx("common.no_data")} desc={tx("rp.v3s.emptyDesc")} actions={<><ResearchButton variant="primary" onClick={goCalib} disabled={!goCalib}>{tx("rw.v.calibration")}</ResearchButton><ResearchButton onClick={goOverview} disabled={!goOverview}>{tx("rp.v3s.backFactors")}</ResearchButton></>} /></ResearchPanelShell>;

  const dims = ["technical", "fundamental", "alpha", "news", "flow"] as const;

  return (
    <ResearchPanelShell>
      {hero}

      {/* KPI —— 今日评分数 + 评分均值 + 5 评级桶（真实字段） */}
      <ResearchKpiGrid>
        <ResearchKpiCard label={tx("rp.v3s.kToday")} value={total.toLocaleString()} sub={tx("rp.v3s.kTodaySub")} tone="blue" />
        <ResearchKpiCard label={tx("rp.v3s.kAvg")} value={fx(avgScore, 1)} sub={tx("rp.v3s.kAvgSub")} />
        <ResearchKpiCard label={tx("rp.v3cal.cut.sb")} value={dist.STRONG_BUY ?? 0} sub="STRONG_BUY" tone="green" />
        <ResearchKpiCard label={tx("rp.v3cal.cut.buy")} value={dist.BUY ?? 0} sub="BUY" tone="green" />
        <ResearchKpiCard label={tx("rp.v3s.kHoldWatch")} value={`${dist.HOLD ?? 0} / ${dist.WATCH ?? 0}`} sub="HOLD / WATCH" />
        <ResearchKpiCard label={tx("rp.v3s.kAvoid")} value={dist.AVOID ?? 0} sub="AVOID" tone="red" />
      </ResearchKpiGrid>

      {/* Distribution + 权重/覆盖 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2">
          <ResearchSection title={tx("rp.v3s.distTitle")} desc={tx("rp.v3s.distDesc")}>
            <ResearchStackBar segments={["STRONG_BUY", "BUY", "HOLD", "WATCH", "AVOID"].map((k) => ({ label: getRecommendationLabel(k, lang), value: dist[k] ?? 0, color: RATING_HEX[k] }))} />
          </ResearchSection>
        </div>
        <ResearchInsightCard title={tx("rp.v3s.insight")} tone="blue">
          {tx("rp.v3s.insightBody").replace("{regime}", REGIME_KEY[data.regime ?? ""] ? tx(REGIME_KEY[data.regime ?? ""]) : "—").replace("{n}", total.toLocaleString()).replace("{avg}", String(fx(avgScore, 1))).replace("{bull}", String((dist.STRONG_BUY ?? 0) + (dist.BUY ?? 0)))}
        </ResearchInsightCard>
      </div>

      {/* 动态权重 + 维度覆盖 */}
      {data.weights ? (
        <ResearchSection title={tx("rp.v3s.weightsTitle")} desc={REGIME_KEY[data.regime ?? ""] ? tx(REGIME_KEY[data.regime ?? ""]) : "—"}>
          <div className="flex flex-wrap gap-2">
            {dims.map((dm) => (
              <ResearchChip key={dm}>{tx(DIM_KEY[dm])} <b style={{ color: RM.ink }} className="mx-1">{((data.weights![dm] ?? 0) * 100).toFixed(1)}%</b><span style={{ color: RM.faint }}>{fx(data.dimCoverage?.[dm])}%</span></ResearchChip>
            ))}
          </div>
        </ResearchSection>
      ) : null}

      {/* 评分明细表 */}
      <ResearchSection title={tx("rp.v3s.detailTitle")} desc={tx("rp.v3s.detailDesc").replace("{n}", rows.length.toLocaleString())} right={
        <div className="flex items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tx("rp.ascore.search")} className="text-[12px] rounded-lg px-3 h-9 w-52 focus:outline-none" style={{ background: RM.card, color: RM.ink, border: `1px solid ${RM.border}` }} />
          <ResearchButton onClick={exportCsv} disabled={!rows.length}>{tx("rp.ascore.exportCsv")}</ResearchButton>
        </div>
      }>
        {rows.length === 0 ? <ResearchEmptyState title={tx("rp.ascore.noMatch")} desc={tx("rp.ascore.noMatchDesc")} /> : (
          <div style={{ maxHeight: "calc(100vh - 320px)", overflow: "auto" }}>
            <ResearchTable minWidth={920}>
              <thead>
                <tr>
                  <RTh align="right">#</RTh><RTh>{tx("rp.ascore.colStock")}</RTh><RTh align="right">{tx("rp.v3s.colScore")}</RTh><RTh align="center">{tx("rp.ascore.colRating")}</RTh>
                  <RTh align="right">{tx("rp.v3s.colPct")}</RTh><RTh align="right">Confidence</RTh><RTh align="right">{tx("rp.v3s.colRisk")}</RTh>
                  <RTh align="right">{tx("rp.v3s.colV2")}</RTh><RTh align="center">{tx("rp.v3s.colExplain")}</RTh>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 600).map((r) => (
                  <Fragment key={r.symbol}>
                    <tr className={rowHoverClass}>
                      <RTd align="right" mono color={RM.faint}>{r.rank}</RTd>
                      <RTd>
                        <Link href={`/stocks/${encodeURIComponent(r.symbol)}`} style={{ color: RM.blue }} className="hover:underline font-mono">{r.symbol}</Link>
                        <span className="ml-1.5 truncate inline-block max-w-[130px] align-bottom" style={{ color: RM.sub }}>{r.nameZh ?? r.name}</span>
                      </RTd>
                      <RTd align="right" mono color={RM.ink}>{r.scoreV3.toFixed(1)}</RTd>
                      <RTd align="center"><ResearchStatusBadge tone={RATING_TONE[r.rating] ?? "neutral"}>{getRecommendationLabel(r.rating, lang)}</ResearchStatusBadge></RTd>
                      <RTd align="right" mono color={RM.sub}>{r.percentile.toFixed(1)}</RTd>
                      <RTd align="right" mono color={r.confidence >= 80 ? RM.green : r.confidence >= 60 ? RM.amber : RM.red}>{r.confidence.toFixed(0)}%</RTd>
                      <RTd align="right" mono color={r.riskAdjustment < 0 ? RM.red : RM.faint}>{r.riskAdjustment.toFixed(1)}</RTd>
                      <RTd align="right" mono color={RM.sub}>{fx(r.v2AdaptiveScore, 0)}</RTd>
                      <RTd align="center"><button onClick={() => setExpanded(expanded === r.symbol ? null : r.symbol)} style={{ color: RM.blue }} className="hover:underline">{expanded === r.symbol ? tx("rp.v3s.collapse") : tx("rp.v3s.expand")}</button></RTd>
                    </tr>
                    {expanded === r.symbol ? (
                      <tr><td colSpan={9} style={{ background: RM.card, borderBottom: `1px solid ${RM.border}` }}><pre className="text-[11px] whitespace-pre-wrap font-sans leading-relaxed px-4 py-3" style={{ color: RM.sub }}>{r.explanation}</pre></td></tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </ResearchTable>
            {rows.length > 600 && <div className="mt-2 text-[12px]" style={{ color: RM.faint }}>{tx("rp.ascore.rowLimit").replace("{n}", rows.length.toLocaleString())}</div>}
          </div>
        )}
      </ResearchSection>
    </ResearchPanelShell>
  );
}

// ── AdaptiveScoreHero ─────────────────────────────────────────────────────────
function AdaptiveScoreHero({ date, computedAt, regime, total, loading, error, hasData, topRating, onCalib }: {
  date: string | null; computedAt: string | null; regime: string | null; total: number; loading: boolean; error: boolean; hasData: boolean; topRating: string | null; onCalib?: () => void;
}) {
  const { t, lang } = useI18n();
  const tx = t as (k: string) => string;
  void lang;
  const statusText = loading ? tx("common.loading") : hasData && !error ? tx("rp.v3s.done") : tx("common.no_data");
  const statusTone: Tone = loading ? "amber" : error || !hasData ? "neutral" : "green";
  return (
    <div className="rounded-2xl px-6 py-5 flex flex-col lg:flex-row lg:items-center gap-4" style={{ background: RM.panel, border: `1px solid ${RM.border}` }}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]" style={{ color: RM.ink }}>{tx("rw.v.shadow")}</h1>
          <span className="text-[12px] font-medium" style={{ color: RM.faint }}>Adaptive V3 Intelligence</span>
          <ResearchStatusBadge tone={statusTone}>{statusText}</ResearchStatusBadge>
          <ResearchStatusBadge tone="blue">adaptive-v3</ResearchStatusBadge>
          <ResearchStatusBadge tone="amber">{tx("rw.v.shadow")}</ResearchStatusBadge>
        </div>
        <p className="mt-1.5 text-[13px]" style={{ color: RM.muted }}>{tx("rp.v3s.subtitle")}</p>
        <div className="mt-2 flex items-center gap-4 flex-wrap text-[12px]">
          <span style={{ color: RM.sub }}>{tx("rp.v3s.kToday")} <b className="tabular-nums" style={{ color: RM.ink }}>{total.toLocaleString()}</b></span>
          <span style={{ color: RM.sub }}>{tx("rw.a.regime")} <b style={{ color: RM.ink }}>{REGIME_KEY[regime ?? ""] ? tx(REGIME_KEY[regime ?? ""]) : "—"}</b></span>
          <span style={{ color: RM.faint }}>{tx("common.asOf.data")} <b className="tabular-nums" style={{ color: RM.sub }}>{date ?? tx("common.no_data")}</b></span>
          
        </div>
      </div>
      <div className="shrink-0 flex items-center gap-2">
        {topRating && <div className="text-right hidden xl:block"><div className="text-[11px]" style={{ color: RM.faint }}>{tx("rp.v3s.topPick")}</div><div className="text-[14px] font-semibold" style={{ color: RATING_HEX[topRating] ?? RM.ink }}>{getRecommendationLabel(topRating, lang)}</div></div>}
        <ResearchButton onClick={onCalib} disabled={!onCalib}>{tx("rw.v.calibration")} →</ResearchButton>
      </div>
    </div>
  );
}
