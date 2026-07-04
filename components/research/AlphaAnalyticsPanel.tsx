"use client";

import { useEffect, useMemo, useState } from "react";
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
const RATING_ZH: Record<string, string> = { Effective: "有效", Moderate: "一般", Weak: "较弱" };
const FACTOR_ZH: Record<string, string> = {
  RelativeStrength: "相对强弱 · RS", ATR: "波动率 · ATR", VolumeRatio: "量比 · VR",
  AverageTurnover: "平均成交额 · TO", Distance52WeekHigh: "距52周高 · 52WH", VolumeExpansion: "放量天数 · VED",
};
function ratingZh(s: string) { return RATING_ZH[s] ?? s; }
function factorZh(s: string) { return FACTOR_ZH[s] ?? s; }
const LOW_SAMPLE = 200; // 低覆盖率告警阈值（展示层判断，非新算指标）

export function AlphaAnalyticsPanel({ onNavigate }: { onNavigate?: (tab: string) => void }) {
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
            {p}日
          </button>
        );
      })}
    </div>
  );

  const hero = (
    <ResearchHero
      title="因子分析"
      titleEn="Factor Analysis"
      subtitle="因子表现 · 稳定性 · 相关性 · 贡献度"
      statusText={loading ? "运行中" : error ? "暂无数据" : hasData ? "已就绪" : "暂无数据"}
      statusTone={loading ? "amber" : error || !hasData ? "neutral" : "green"}
      metaLabel="最近分析"
      metaValue={data?.asOfLatest ?? (data?.computedAt ? new Date(data.computedAt).toLocaleDateString("zh-CN") : "暂无数据")}
      action={<ResearchButton onClick={goFactors} disabled={!goFactors}>查看因子库 →</ResearchButton>}
    />
  );

  if (error) {
    return (
      <ResearchPanelShell>
        {hero}
        <div className="flex items-center gap-2">{periodSelector}</div>
        <ResearchErrorState
          message={error}
          hint={<>请运行 <code style={{ color: RM.sub }}>npm run compute-alpha-analytics</code> 生成因子分析报告。</>}
          actions={<ResearchButton onClick={goOverview} disabled={!goOverview}>返回综合驾驶舱</ResearchButton>}
        />
      </ResearchPanelShell>
    );
  }

  if (loading) {
    return (
      <ResearchPanelShell>
        {hero}
        <div className="flex items-center gap-2">{periodSelector}</div>
        <ResearchLoadingState label="正在加载因子分析报告…" />
      </ResearchPanelShell>
    );
  }

  if (!hasData) {
    return (
      <ResearchPanelShell>
        {hero}
        <div className="flex items-center gap-2">{periodSelector}</div>
        <ResearchEmptyState
          title={`${period}日 暂无因子分析报告`}
          desc="该周期分析数据尚未生成或 API 暂无返回。可切换其它周期查看。"
          actions={
            <>
              <ResearchButton variant="primary" onClick={goFactors} disabled={!goFactors}>查看因子库</ResearchButton>
              <ResearchButton onClick={goOverview} disabled={!goOverview}>返回综合驾驶舱</ResearchButton>
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
        <span className="text-[12px]" style={{ color: RM.faint }}>预测窗口：未来 {period} 个交易日</span>
        <div className="ml-auto"><ResearchButton onClick={exportCsv}>导出CSV</ResearchButton></div>
      </div>

      {/* KPI —— 全部基于 API 原始字段的展示聚合，缺字段显示暂无数据 */}
      <ResearchKpiGrid>
        <ResearchKpiCard label="分析因子数" value={factors.length} sub={`${period}日周期`} tone="blue" />
        <ResearchKpiCard label="平均重要度" value={`${kpi!.avgRating.toFixed(1)}`} sub="满分 5 · 评级均值" />
        <ResearchKpiCard label="稳定因子数" value={kpi!.stable} sub="评级 ≥ 4（有效）" tone="green" />
        <ResearchKpiCard label="待观察因子" value={kpi!.weak} sub="评级 ≤ 2（较弱）" tone={kpi!.weak > 0 ? "amber" : "neutral"} />
        <ResearchKpiCard label="累计样本" value={kpi!.samples.toLocaleString()} sub="覆盖股票数暂无字段" />
        <ResearchKpiCard label="最近分析" value={<span className="text-[15px]">{data?.asOfLatest ?? "暂无数据"}</span>} sub="报告基准日" />
      </ResearchKpiGrid>

      {/* 研究洞察 —— 真实最优/最弱因子 + 平均重要度 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <ResearchInsightCard title="表现最佳因子" tone="green">
          {best ? <><span style={{ color: RM.ink, fontWeight: 600 }}>{factorZh(best.factor)}</span> · {ratingZh(best.ratingLabel)}（{stars(best.rating)}）· IC {fx(best.ic)}</> : "暂无数据"}
        </ResearchInsightCard>
        <ResearchInsightCard title="表现最弱因子" tone="red">
          {worst ? <><span style={{ color: RM.ink, fontWeight: 600 }}>{factorZh(worst.factor)}</span> · {ratingZh(worst.ratingLabel)}（{stars(worst.rating)}）· IC {fx(worst.ic)}</> : "暂无数据"}
        </ResearchInsightCard>
        <ResearchInsightCard title="整体重要度" tone="blue">
          {factors.length} 个因子平均评级 <span style={{ color: RM.ink, fontWeight: 600 }}>{kpi!.avgRating.toFixed(1)}/5</span>，其中有效 {kpi!.stable} 个、较弱 {kpi!.weak} 个。
        </ResearchInsightCard>
      </div>

      {/* Top / Weak Factors 双列 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ResearchSection title="Top Factors" desc="按评级 / IC 排序 · 表现最佳">
          <FactorMiniList list={topFactors} />
        </ResearchSection>
        <ResearchSection title="Weak Factors" desc="按评级 / IC 排序 · 表现最弱">
          <FactorMiniList list={weakFactors} />
        </ResearchSection>
      </div>

      {/* 相关性 / 稳定性 —— API 无对应字段，如实标注暂无，不伪造 */}
      <ResearchSection title="相关性 · 稳定性" desc="因子相关性 / 稳定性 / 方差 / 趋势">
        <ResearchEmptyState
          title="暂无相关性数据"
          desc="当前分析 API 不返回因子相关性 / 稳定性 / 方差 / 时序趋势字段。可参考下方各因子的 IC / RankIC / 夏普比率评估预测一致性。"
        />
      </ResearchSection>

      {/* 完整因子分析表 */}
      <ResearchSection title="因子分析表" desc={`各因子对未来 ${period} 日收益的预测能力`}>
        <div style={{ maxHeight: "calc(100vh - 320px)", overflow: "auto" }}>
          <ResearchTable minWidth={1080}>
            <thead>
              <tr>
                <RTh>因子</RTh>
                <RTh align="center">评级</RTh>
                <RTh align="right">IC</RTh>
                <RTh align="right">RankIC</RTh>
                <RTh align="right">胜率</RTh>
                <RTh align="right">平均超额</RTh>
                <RTh align="right">未来5日</RTh>
                <RTh align="right">未来10日</RTh>
                <RTh align="right">未来20日</RTh>
                <RTh align="right">前20%</RTh>
                <RTh align="right">后20%</RTh>
                <RTh align="right">夏普</RTh>
                <RTh align="right">样本</RTh>
              </tr>
            </thead>
            <tbody>
              {ranked.map((f) => (
                <tr key={f.factor} className={rowHoverClass}>
                  <RTd><span style={{ color: RM.ink, fontWeight: 600 }}>{factorZh(f.factor)}</span></RTd>
                  <RTd align="center" color={ratingHex(f.rating)}>
                    <span title={ratingZh(f.ratingLabel)}>{stars(f.rating)}</span>
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
                        <ResearchStatusBadge tone="amber">低覆盖</ResearchStatusBadge>
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
  if (!list.length) return <ResearchEmptyState title="暂无因子数据" />;
  return (
    <div className="space-y-1.5">
      {list.map((f) => (
        <div
          key={f.factor}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
          style={{ background: RM.card, border: `1px solid ${RM.border}` }}
        >
          <span className="text-[13px] font-semibold truncate flex-1" style={{ color: RM.ink }}>{factorZh(f.factor)}</span>
          <span className="text-[13px] tabular-nums shrink-0" style={{ color: ratingHex(f.rating) }} title={ratingZh(f.ratingLabel)}>{stars(f.rating)}</span>
          <span className="text-[11px] tabular-nums shrink-0 w-16 text-right" style={{ color: retColor(f.ic) }}>IC {fx(f.ic)}</span>
          <span className="text-[11px] tabular-nums shrink-0 w-20 text-right" style={{ color: RM.faint }}>{f.sampleCount.toLocaleString()} 样本</span>
        </div>
      ))}
    </div>
  );
}
