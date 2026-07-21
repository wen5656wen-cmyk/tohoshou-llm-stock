"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { fmtAsOf } from "./PanelFrame";
import {
  RM,
  SHADOW_SM,
  ResearchPanelShell,
  ResearchHero,
  ResearchButton,
  ResearchStatusBadge,
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
} from "./kit";

// 因子分析 — Factor Analysis（AI 研究中心 · 因子研究组）。
// 纯展示层：只读现有 /api/alpha/report，展示各因子对未来收益的预测能力（有效性 / 重要度）。
// 不改任何 API / 因子分析逻辑 / 评分算法。评级(rating)/IC/样本 均为 API 原值，前端只做展示聚合。

type FactorReport = {
  factor: string;
  sampleCount: number;
  meanFwdRet5: number | null;
  meanFwdRet10: number | null;
  meanFwdRet20: number | null;
  winRate: number | null;
  meanExcess: number | null;
  ic: number | null;
  rankIc: number | null;
  top20Ret: number | null;
  bottom20Ret: number | null;
  sharpe: number | null;
  rating: number;
  ratingLabel: string;
};

type Resp = {
  period: number;
  availablePeriods: number[];
  computedAt: string | null;
  asOfLatest: string | null;
  factors: FactorReport[];
};

const PERIODS = [7, 30, 90, 180];

function pct(v: number | null) { return v == null ? "—" : `${v.toFixed(2)}%`; }
function fx(v: number | null, d = 3) { return v == null ? "—" : v.toFixed(d); }
function stars(n: number) { return "★".repeat(n) + "☆".repeat(Math.max(0, 5 - n)); }
function ratingTone(n: number): "green" | "amber" | "neutral" {
  return n >= 4 ? "green" : n === 3 ? "amber" : "neutral";
}
function ratingHex(n: number) { return n >= 4 ? RM.green : n === 3 ? RM.amber : RM.faint; }

// 显示层翻译（不改 API 返回值）
const RATING_KEY: Record<string, string> = { Effective: "rp.aanal.r.eff", Moderate: "rp.aanal.r.mod", Weak: "rp.aanal.r.weak" };
const FACTOR_ZH: Record<string, string> = {
  RelativeStrength: "rp.aanal.f.rs", ATR: "rp.aanal.f.atr", VolumeRatio: "rp.aanal.f.vr",
  AverageTurnover: "rp.aanal.f.to", Distance52WeekHigh: "rp.aanal.f.d52h", VolumeExpansion: "rp.aanal.f.ved",
};
function ratingLabel(s: string, tx: (k: string) => string) { return RATING_KEY[s] ? tx(RATING_KEY[s]) : s; }
function factorLabel(s: string, tx: (k: string) => string) { return FACTOR_ZH[s] ? tx(FACTOR_ZH[s]) : s; }
const LOW_SAMPLE = 200; // 低覆盖率告警阈值（展示层判断，非新算指标）

export function AlphaAnalyticsPanel({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const { t } = useI18n();
  const tx = t as (k: string) => string;
  const [period, setPeriod] = useState(30);
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/alpha/report?period=${period}`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: Resp) => { setData(d); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, [period]);

  const factors = useMemo(() => data?.factors ?? [], [data]);
  const hasData = factors.length > 0;

  // 展示层聚合（均基于 API 原始 rating / sampleCount 字段）
  const kpi = useMemo(() => {
    if (!hasData) return null;
    const avgRating = factors.reduce((s, f) => s + f.rating, 0) / factors.length;
    const stable = factors.filter((f) => f.rating >= 4).length;
    const weak = factors.filter((f) => f.rating <= 2).length;
    const samples = factors.reduce((s, f) => s + (f.sampleCount ?? 0), 0);
    return { avgRating, stable, weak, samples };
  }, [factors, hasData]);

  const ranked = useMemo(() => [...factors].sort((a, b) => (b.rating - a.rating) || ((b.ic ?? -9) - (a.ic ?? -9))), [factors]);
  const topFactors = ranked.slice(0, Math.min(5, ranked.length));
  const weakFactors = [...ranked].reverse().slice(0, Math.min(5, ranked.length));

  function exportCsv() {
    if (!data) return;
    const cols = ["factor", "rating", "ratingLabel", "sampleCount", "ic", "rankIc",
      "winRate", "meanFwdRet5", "meanFwdRet10", "meanFwdRet20", "meanExcess",
      "top20Ret", "bottom20Ret", "sharpe"];
    const lines = [cols.join(",")];
    for (const f of data.factors) {
      lines.push(cols.map((c) => (f as Record<string, unknown>)[c] ?? "").join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `alpha-report-${period}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const goFactors = onNavigate ? () => onNavigate("factors") : undefined;
  const goOverview = onNavigate ? () => onNavigate("overview") : undefined;

  const periodSelector = (
    <div className="inline-flex p-1 rounded-lg" style={{ background: RM.track, border: `1px solid ${RM.border}` }}>
      {PERIODS.map((p) => {
        const on = period === p;
        return (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className="text-[12px] font-semibold px-3 h-7 rounded-md transition-all"
            style={on ? { background: RM.panel, color: RM.ink, boxShadow: SHADOW_SM } : { color: RM.sub }}
          >
            {p}d
          </button>
        );
      })}
    </div>
  );

  const hero = (
    <ResearchHero
      title={tx("rw.a.analytics")}
      titleEn="Factor Analysis"
      subtitle={tx("rp.aanal.subtitle")}
      statusText={loading ? tx("common.loading") : hasData && !error ? tx("rp.aanal.ready") : tx("common.no_data")}
      statusTone={loading ? "amber" : error || !hasData ? "neutral" : "green"}
      metaLabel={tx("common.asOf.data")}
      metaValue={data?.asOfLatest ?? fmtAsOf(data?.computedAt) ?? tx("common.no_data")}
      action={<ResearchButton onClick={goFactors} disabled={!goFactors}>{tx("rp.aanal.toLib")} →</ResearchButton>}
    />
  );

  if (error) {
    return (
      <ResearchPanelShell>
        {hero}
        <div className="flex items-center gap-2">{periodSelector}</div>
        <ResearchErrorState
          message={error}
          hint={tx("rp.aanal.errHint")}
          actions={<ResearchButton onClick={goOverview} disabled={!goOverview}>{tx("rp.aanal.backFactors")}</ResearchButton>}
        />
      </ResearchPanelShell>
    );
  }

  if (loading) {
    return (
      <ResearchPanelShell>
        {hero}
        <div className="flex items-center gap-2">{periodSelector}</div>
        <ResearchLoadingState />
      </ResearchPanelShell>
    );
  }

  if (!hasData) {
    return (
      <ResearchPanelShell>
        {hero}
        <div className="flex items-center gap-2">{periodSelector}</div>
        <ResearchEmptyState
          title={`${period}d · ${tx("common.no_data")}`}
          desc={tx("rp.aanal.emptyDesc")}
          actions={
            <>
              <ResearchButton variant="primary" onClick={goFactors} disabled={!goFactors}>{tx("rp.aanal.toLib")}</ResearchButton>
              <ResearchButton onClick={goOverview} disabled={!goOverview}>{tx("rp.aanal.backFactors")}</ResearchButton>
            </>
          }
        />
      </ResearchPanelShell>
    );
  }

  const best = topFactors[0];
  const worst = weakFactors[0];

  return (
    <ResearchPanelShell>
      {hero}

      <div className="flex items-center gap-3 flex-wrap">
        {periodSelector}
        <span className="text-[12px]" style={{ color: RM.faint }}>{tx("rp.aanal.window").replace("{n}", String(period))}</span>
        <div className="ml-auto"><ResearchButton onClick={exportCsv}>{tx("rp.aanal.exportCsv")}</ResearchButton></div>
      </div>

      {/* KPI —— 全部基于 API 原始字段的展示聚合，缺字段显示暂无数据 */}
      <ResearchKpiGrid>
        <ResearchKpiCard label={tx("rp.aanal.kCount")} value={factors.length} sub={`${period}d`} tone="blue" />
        <ResearchKpiCard label={tx("rp.aanal.kAvg")} value={`${kpi!.avgRating.toFixed(1)}`} sub={tx("rp.aanal.kAvgSub")} />
        <ResearchKpiCard label={tx("rp.aanal.kStable")} value={kpi!.stable} sub={tx("rp.aanal.kStableSub")} tone="green" />
        <ResearchKpiCard label={tx("rp.aanal.kWeak")} value={kpi!.weak} sub={tx("rp.aanal.kWeakSub")} tone={kpi!.weak > 0 ? "amber" : "neutral"} />
        <ResearchKpiCard label={tx("rp.aanal.kSamples")} value={kpi!.samples.toLocaleString()} sub={tx("rp.aanal.kSamplesSub")} />
        <ResearchKpiCard label={tx("common.asOf.data")} value={<span className="text-[15px]">{data?.asOfLatest ?? tx("common.no_data")}</span>} sub={tx("rp.aanal.kDateSub")} />
      </ResearchKpiGrid>

      {/* 研究洞察 —— 真实最优/最弱因子 + 平均重要度 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <ResearchInsightCard title={tx("rp.aanal.best")} tone="green">
          {best ? <><span style={{ color: RM.ink, fontWeight: 600 }}>{factorLabel(best.factor, tx)}</span> · {ratingLabel(best.ratingLabel, tx)}（{stars(best.rating)}）· IC {fx(best.ic)}</> : tx("common.no_data")}
        </ResearchInsightCard>
        <ResearchInsightCard title={tx("rp.aanal.worst")} tone="red">
          {worst ? <><span style={{ color: RM.ink, fontWeight: 600 }}>{factorLabel(worst.factor, tx)}</span> · {ratingLabel(worst.ratingLabel, tx)}（{stars(worst.rating)}）· IC {fx(worst.ic)}</> : tx("common.no_data")}
        </ResearchInsightCard>
        <ResearchInsightCard title={tx("rp.aanal.overall")} tone="blue">
          {tx("rp.aanal.overallBody").replace("{n}", String(factors.length)).replace("{avg}", kpi!.avgRating.toFixed(1)).replace("{s}", String(kpi!.stable)).replace("{w}", String(kpi!.weak))}
        </ResearchInsightCard>
      </div>

      {/* Top / Weak Factors 双列 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ResearchSection title={tx("rp.aanal.topFactors")} desc={tx("rp.aanal.topDesc")}>
          <FactorMiniList list={topFactors} />
        </ResearchSection>
        <ResearchSection title={tx("rp.aanal.weakFactors")} desc={tx("rp.aanal.weakDesc")}>
          <FactorMiniList list={weakFactors} />
        </ResearchSection>
      </div>

      {/* 相关性 / 稳定性 —— API 无对应字段，如实标注暂无，不伪造 */}
      <ResearchSection title={tx("rp.aanal.corrTitle")} desc={tx("rp.aanal.corrDesc")}>
        <ResearchEmptyState
          title={tx("common.no_data")}
          desc={tx("rp.aanal.noCorr")}
        />
      </ResearchSection>

      {/* 完整因子分析表 */}
      <ResearchSection title={tx("rp.aanal.tableTitle")} desc={tx("rp.aanal.tableDesc").replace("{n}", String(period))}>
        <div style={{ maxHeight: "calc(100vh - 320px)", overflow: "auto" }}>
          <ResearchTable minWidth={1080}>
            <thead>
              <tr>
                <RTh>{tx("rp.aanal.colFactor")}</RTh>
                <RTh align="center">{tx("rp.aanal.colRating")}</RTh>
                <RTh align="right">IC</RTh>
                <RTh align="right">RankIC</RTh>
                <RTh align="right">{tx("rp.aanal.colWin")}</RTh>
                <RTh align="right">{tx("rp.aanal.colExcess")}</RTh>
                <RTh align="right">{tx("rp.aanal.colF5")}</RTh>
                <RTh align="right">{tx("rp.aanal.colF10")}</RTh>
                <RTh align="right">{tx("rp.aanal.colF20")}</RTh>
                <RTh align="right">{tx("rp.aanal.colTop")}</RTh>
                <RTh align="right">{tx("rp.aanal.colBottom")}</RTh>
                <RTh align="right">Sharpe</RTh>
                <RTh align="right">{tx("rp.aanal.colSample")}</RTh>
              </tr>
            </thead>
            <tbody>
              {ranked.map((f) => (
                <tr key={f.factor} className={rowHoverClass}>
                  <RTd><span style={{ color: RM.ink, fontWeight: 600 }}>{factorLabel(f.factor, tx)}</span></RTd>
                  <RTd align="center" color={ratingHex(f.rating)}>
                    <span title={ratingLabel(f.ratingLabel, tx)}>{stars(f.rating)}</span>
                  </RTd>
                  <RTd align="right" mono color={retColor(f.ic)}>{fx(f.ic)}</RTd>
                  <RTd align="right" mono color={retColor(f.rankIc)}>{fx(f.rankIc)}</RTd>
                  <RTd align="right" mono>{pct(f.winRate)}</RTd>
                  <RTd align="right" mono color={retColor(f.meanExcess)}>{pct(f.meanExcess)}</RTd>
                  <RTd align="right" mono color={retColor(f.meanFwdRet5)}>{pct(f.meanFwdRet5)}</RTd>
                  <RTd align="right" mono color={retColor(f.meanFwdRet10)}>{pct(f.meanFwdRet10)}</RTd>
                  <RTd align="right" mono color={retColor(f.meanFwdRet20)}>{pct(f.meanFwdRet20)}</RTd>
                  <RTd align="right" mono color={RM.green}>{pct(f.top20Ret)}</RTd>
                  <RTd align="right" mono color={RM.red}>{pct(f.bottom20Ret)}</RTd>
                  <RTd align="right" mono>{fx(f.sharpe, 2)}</RTd>
                  <RTd align="right" mono>
                    {f.sampleCount < LOW_SAMPLE ? (
                      <span className="inline-flex items-center gap-1">
                        <ResearchStatusBadge tone="amber">{tx("rp.aanal.lowCov")}</ResearchStatusBadge>
                        {f.sampleCount.toLocaleString()}
                      </span>
                    ) : (
                      f.sampleCount.toLocaleString()
                    )}
                  </RTd>
                </tr>
              ))}
            </tbody>
          </ResearchTable>
        </div>
      </ResearchSection>
    </ResearchPanelShell>
  );
}

function FactorMiniList({ list }: { list: FactorReport[] }) {
  const { t } = useI18n();
  const tx = t as (k: string) => string;
  if (!list.length) return <ResearchEmptyState title={tx("common.no_data")} />;
  return (
    <div className="space-y-1.5">
      {list.map((f) => (
        <div
          key={f.factor}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
          style={{ background: RM.card, border: `1px solid ${RM.border}` }}
        >
          <span className="text-[13px] font-semibold truncate flex-1" style={{ color: RM.ink }}>{factorLabel(f.factor, tx)}</span>
          <span className="text-[13px] tabular-nums shrink-0" style={{ color: ratingHex(f.rating) }} title={ratingLabel(f.ratingLabel, tx)}>{stars(f.rating)}</span>
          <span className="text-[11px] tabular-nums shrink-0 w-16 text-right" style={{ color: retColor(f.ic) }}>IC {fx(f.ic)}</span>
          <span className="text-[11px] tabular-nums shrink-0 w-20 text-right" style={{ color: RM.faint }}>{f.sampleCount.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}
