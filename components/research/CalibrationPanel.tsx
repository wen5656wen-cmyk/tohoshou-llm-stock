"use client";

import { useEffect, useState } from "react";
import {
  RM,
  ResearchPanelShell,
  ResearchStatusBadge,
  ResearchButton,
  ResearchKpiGrid,
  ResearchKpiCard,
  ResearchSection,
  ResearchInsightCard,
  ResearchTimeline,
  ResearchTable,
  RTh,
  RTd,
  rowHoverClass,
  ResearchLoadingState,
  ResearchEmptyState,
  ResearchErrorState,
  type Tone,
  type TimelineStep,
} from "./kit";

// V3校准中心 — Calibration Center（AI 研究中心 · V3 组）。
// 纯展示层：只读现有 /api/scoring-v3/calibration，展示动态阈值/Confidence/Data Quality/就绪度。
// 不改任何 API / Calibration / 评分算法。就绪度建议来自 grade→文本 的既有映射。

type Cal = {
  date: string | null; regime: string | null; computedAt: string | null;
  thresholds: { cutoffs: Record<string, number>; targets: Record<string, number> } | null;
  ratingDist: Record<string, number>;
  confidenceStats: { mean: number; p25: number; median: number; p75: number; buckets: Record<string, number> };
  quality: { coverage: Record<string, number>; overall: number };
  sbSector: Record<string, number>; sbMarketCap: Record<string, number>;
  sbStats: { count: number; frac: number; avgConfidence: number; lowLiquidity: number };
  readiness: number; readinessGrade: string;
  history: { date: string; regime: string; readiness: number; grade: string; sbStats: { count?: number } | null; ratingDist: Record<string, number> }[];
};

const RATING_ZH: Record<string, string> = { STRONG_BUY: "强烈买入", BUY: "买入", HOLD: "持有", WATCH: "观察", AVOID: "回避" };
const DIM_ZH: Record<string, string> = { technical: "技术面", fundamental: "基本面", alpha: "Alpha", news: "新闻", flow: "资金" };
const GRADE_DESC: Record<string, string> = { A: "可直接替换", B: "建议继续 Shadow 一周", C: "需要调整", D: "禁止上线" };
const GRADE_TONE: Record<string, Tone> = { A: "green", B: "blue", C: "amber", D: "red" };
const GRADE_HEX: Record<string, string> = { A: RM.green, B: RM.blue, C: RM.amber, D: RM.red };
const REGIME_ZH: Record<string, string> = { BULL: "牛市", BEAR: "熊市", SIDEWAYS: "震荡市" };
function gradeRec(g: string) { return g === "A" ? "继续使用 · 可评估上线" : g === "B" ? "建议继续 Shadow 验证" : g === "C" ? "建议重新校准" : "等待更多样本 · 暂缓"; }

export function CalibrationPanel({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [d, setD] = useState<Cal | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { fetch("/api/scoring-v3/calibration").then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }).then(setD).catch((e) => setErr(String(e))); }, []);

  function exportCsv() {
    if (!d) return;
    const lines = ["date,regime,readiness,grade,STRONG_BUY,BUY,HOLD,WATCH,AVOID"];
    for (const h of d.history) lines.push([h.date, h.regime, h.readiness, h.grade, h.ratingDist?.STRONG_BUY ?? 0, h.ratingDist?.BUY ?? 0, h.ratingDist?.HOLD ?? 0, h.ratingDist?.WATCH ?? 0, h.ratingDist?.AVOID ?? 0].join(","));
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `v3-calibration-${d.date ?? "latest"}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  const goScore = onNavigate ? () => onNavigate("v3") : undefined;
  const goFreeze = onNavigate ? () => onNavigate("freeze") : undefined;
  const goOverview = onNavigate ? () => onNavigate("overview") : undefined;
  const hero = <CalibrationHero d={d} loading={!d && !err} error={!!err} onFreeze={goFreeze} />;

  if (err) return <ResearchPanelShell>{hero}<ResearchErrorState message={err} hint={<>请运行 <code style={{ color: RM.sub }}>npm run compute-scores</code> 生成 V3 校准。</>} actions={<ResearchButton onClick={goOverview} disabled={!goOverview}>返回综合驾驶舱</ResearchButton>} /></ResearchPanelShell>;
  if (!d) return <ResearchPanelShell>{hero}<ResearchLoadingState label="正在加载 V3 校准…" /></ResearchPanelShell>;

  const grade = d.readinessGrade;
  const cov = d.quality?.coverage ?? {};
  const cs = d.confidenceStats;

  const timelineSteps: TimelineStep[] = (d.history ?? []).map((h, i) => ({
    label: `${h.date} · ${REGIME_ZH[h.regime] ?? h.regime}`,
    sub: <>就绪度 <b style={{ color: RM.ink }}>{h.readiness.toFixed(1)}</b> · Grade {h.grade} · STRONG_BUY {h.ratingDist?.STRONG_BUY ?? h.sbStats?.count ?? "—"}</>,
    right: <ResearchStatusBadge tone={GRADE_TONE[h.grade] ?? "neutral"}>Grade {h.grade}</ResearchStatusBadge>,
    state: i === 0 ? "current" : "done",
  }));

  return (
    <ResearchPanelShell>
      {hero}

      {/* KPI */}
      <ResearchKpiGrid>
        <ResearchKpiCard label="Confidence 均值" value={`${cs.mean.toFixed(1)}%`} sub={`P25/中位/P75 ${cs.p25}/${cs.median}/${cs.p75}`} tone="blue" />
        <ResearchKpiCard label="Data Quality" value={`${d.quality.overall}%`} sub="维度覆盖综合" tone="green" />
        <ResearchKpiCard label="就绪度" value={d.readiness.toFixed(1)} sub="Readiness / 100" tone={GRADE_TONE[grade]} />
        <ResearchKpiCard label="校准等级" value={`Grade ${grade}`} sub={GRADE_DESC[grade]} tone={GRADE_TONE[grade]} />
        <ResearchKpiCard label="最新校准" value={<span className="text-[15px]">{d.date ?? "暂无数据"}</span>} sub="Last Update" />
        <ResearchKpiCard label="版本" value={<span className="text-[15px]">adaptive-v3</span>} sub="Adaptive Version" />
      </ResearchKpiGrid>

      {/* Recommendation 结论 */}
      <ResearchInsightCard title="校准建议 · Recommendation" tone={GRADE_TONE[grade]}>
        当前就绪度 <b style={{ color: GRADE_HEX[grade] }}>{d.readiness.toFixed(1)}/100（Grade {grade}）</b>，Confidence 均值 <b style={{ color: RM.ink }}>{cs.mean.toFixed(1)}%</b>、数据质量 <b style={{ color: RM.ink }}>{d.quality.overall}%</b>。研究建议：<b style={{ color: GRADE_HEX[grade] }}>{gradeRec(grade)}</b>。{d.readiness >= 90 ? "已达 90 门槛，可评估上线。" : "未达 90 门槛，暂缓上线。冻结验证见 "}{d.readiness < 90 && <button onClick={goFreeze} disabled={!goFreeze} className="font-semibold disabled:opacity-40" style={{ color: RM.blue }}>V3 Freeze Monitor</button>}{d.readiness < 90 && "。"}
      </ResearchInsightCard>

      {/* 阈值 / Confidence / Data Quality / SB */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ResearchSection title="今日动态阈值" desc={`scoreV3 切点 · 目标分位 · ${REGIME_ZH[d.regime ?? ""] ?? "—"}`}>
          <div className="space-y-1.5">
            {(["sb", "buy", "hold", "watch"] as const).map((k) => (
              <div key={k} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: RM.card, border: `1px solid ${RM.border}` }}>
                <span className="text-[13px]" style={{ color: RM.sub }}>{{ sb: "强烈买入", buy: "买入", hold: "持有", watch: "观察" }[k]}</span>
                <span className="text-[13px] tabular-nums"><b style={{ color: RM.ink }}>≥{d.thresholds?.cutoffs[k]?.toFixed(1) ?? "—"}</b> <span style={{ color: RM.faint }}>前{((d.thresholds?.targets[k] ?? 0) * 100).toFixed(1)}%</span></span>
              </div>
            ))}
          </div>
        </ResearchSection>

        <ResearchSection title="Confidence 分布" desc={`可信度分档 · 均值 ${cs.mean.toFixed(1)}%`}>
          <div className="grid grid-cols-3 gap-3">
            {[["高", cs.buckets["高"] ?? 0, RM.green], ["中", cs.buckets["中"] ?? 0, RM.amber], ["低", cs.buckets["低"] ?? 0, RM.red]].map(([label, v, c]) => (
              <div key={label as string} className="rounded-xl px-3 py-3 text-center" style={{ background: RM.card, border: `1px solid ${RM.border}` }}>
                <div className="text-[22px] font-semibold tabular-nums" style={{ color: c as string }}>{(v as number).toLocaleString()}</div>
                <div className="text-[11px] mt-0.5" style={{ color: RM.muted }}>{label as string}可信度</div>
              </div>
            ))}
          </div>
          <div className="mt-2 text-[12px]" style={{ color: RM.faint }}>P25 / 中位 / P75：{cs.p25} / {cs.median} / {cs.p75}</div>
        </ResearchSection>

        <ResearchSection title="Data Quality · 维度覆盖" desc={`综合 ${d.quality.overall}%`}>
          <div className="space-y-2">
            {(["technical", "fundamental", "alpha", "news", "flow"] as const).map((k) => {
              const v = cov[k] ?? 0;
              const c = v >= 60 ? RM.green : v >= 20 ? RM.amber : RM.red;
              return (
                <div key={k} className="flex items-center gap-3">
                  <span className="text-[12px] w-16 shrink-0" style={{ color: RM.sub }}>{DIM_ZH[k]}</span>
                  <div className="flex-1 h-2 rounded overflow-hidden" style={{ background: RM.card }}><div className="h-full rounded" style={{ width: `${v}%`, background: c }} /></div>
                  <span className="text-[12px] tabular-nums w-12 text-right" style={{ color: RM.sub }}>{v.toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        </ResearchSection>

        <ResearchSection title="STRONG_BUY 统计" desc="强烈买入信号质量">
          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="数量 / 占比" value={`${d.sbStats.count}`} sub={`${d.sbStats.frac}%`} />
            <MiniStat label="平均 Confidence" value={`${d.sbStats.avgConfidence}%`} />
            <MiniStat label="低流动性（<1億）" value={String(d.sbStats.lowLiquidity)} tone={d.sbStats.lowLiquidity > 0 ? "amber" : "green"} />
            <MiniStat label="市值分布" value={Object.entries(d.sbMarketCap).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—"} sub={`${Object.keys(d.sbMarketCap).length} 档`} />
          </div>
        </ResearchSection>
      </div>

      {/* Calibration History */}
      <ResearchSection title="Calibration History · 校准历史" desc="历次就绪度与 STRONG_BUY 变化" right={<ResearchButton onClick={exportCsv} disabled={!d.history.length}>导出CSV</ResearchButton>}>
        {timelineSteps.length === 0 ? (
          <ResearchEmptyState title="暂无校准历史" desc="校准历史记录尚未累计。" />
        ) : (
          <>
            <ResearchTimeline steps={timelineSteps} />
            <div className="mt-2" style={{ maxHeight: 320, overflow: "auto" }}>
              <ResearchTable minWidth={520}>
                <thead><tr><RTh>日期</RTh><RTh>市场</RTh><RTh align="right">就绪度</RTh><RTh align="center">Grade</RTh><RTh align="right">STRONG_BUY</RTh></tr></thead>
                <tbody>
                  {d.history.map((h) => (
                    <tr key={h.date} className={rowHoverClass}>
                      <RTd mono color={RM.sub}>{h.date}</RTd>
                      <RTd color={RM.sub}>{REGIME_ZH[h.regime] ?? h.regime}</RTd>
                      <RTd align="right" mono>{h.readiness.toFixed(1)}</RTd>
                      <RTd align="center" color={GRADE_HEX[h.grade]}><b>{h.grade}</b></RTd>
                      <RTd align="right" mono color={RM.sub}>{h.ratingDist?.STRONG_BUY ?? h.sbStats?.count ?? "—"}</RTd>
                    </tr>
                  ))}
                </tbody>
              </ResearchTable>
            </div>
          </>
        )}
      </ResearchSection>
    </ResearchPanelShell>
  );
}

function MiniStat({ label, value, sub, tone = "neutral" }: { label: string; value: string; sub?: string; tone?: Tone }) {
  const c = tone === "green" ? RM.green : tone === "amber" ? RM.amber : tone === "red" ? RM.red : RM.ink;
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: RM.card, border: `1px solid ${RM.border}` }}>
      <div className="text-[11px]" style={{ color: RM.muted }}>{label}</div>
      <div className="text-[16px] font-semibold tabular-nums mt-0.5" style={{ color: c }}>{value}{sub && <span className="text-[12px] ml-1" style={{ color: RM.faint }}>{sub}</span>}</div>
    </div>
  );
}

// ── CalibrationHero ───────────────────────────────────────────────────────────
function CalibrationHero({ d, loading, error, onFreeze }: { d: Cal | null; loading: boolean; error: boolean; onFreeze?: () => void }) {
  const grade = d?.readinessGrade ?? "";
  const statusText = loading ? "运行中" : error ? "暂无数据" : d ? "正常" : "暂无数据";
  const statusTone: Tone = loading ? "amber" : error || !d ? "neutral" : (GRADE_TONE[grade] ?? "green");
  return (
    <div className="rounded-2xl px-6 py-5 flex flex-col lg:flex-row lg:items-center gap-4" style={{ background: RM.panel, border: `1px solid ${RM.border}` }}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]" style={{ color: RM.ink }}>V3校准中心</h1>
          <span className="text-[12px] font-medium" style={{ color: RM.faint }}>Calibration Center</span>
          <ResearchStatusBadge tone={statusTone}>{statusText}</ResearchStatusBadge>
          {d && <ResearchStatusBadge tone={GRADE_TONE[grade] ?? "neutral"}>Grade {grade}</ResearchStatusBadge>}
        </div>
        <p className="mt-1.5 text-[13px]" style={{ color: RM.muted }}>Adaptive Calibration · Confidence Monitor</p>
        {d && (
          <div className="mt-3 flex items-center gap-4 flex-wrap">
            <div className="flex items-baseline gap-2"><span className="text-[32px] font-bold leading-none tabular-nums" style={{ color: GRADE_HEX[grade] }}>{d.readiness.toFixed(1)}</span><span className="text-[13px]" style={{ color: RM.faint }}>/ 100 就绪度</span></div>
            <span className="h-6 w-px" style={{ background: RM.border }} />
            <span className="text-[12px]" style={{ color: RM.sub }}>Confidence <b style={{ color: RM.ink }}>{d.confidenceStats.mean.toFixed(1)}%</b></span>
            <span className="text-[12px]" style={{ color: RM.sub }}>数据质量 <b style={{ color: RM.ink }}>{d.quality.overall}%</b></span>
            <span className="text-[12px]" style={{ color: RM.faint }}>最新校准 <span className="tabular-nums" style={{ color: RM.sub }}>{d.computedAt ? new Date(d.computedAt).toLocaleString("zh-CN") : d.date}</span></span>
          </div>
        )}
      </div>
      <div className="shrink-0"><ResearchButton onClick={onFreeze} disabled={!onFreeze}>查看 V3 Freeze Monitor →</ResearchButton></div>
    </div>
  );
}
