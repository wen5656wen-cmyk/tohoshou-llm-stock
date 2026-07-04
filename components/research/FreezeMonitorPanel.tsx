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
  ResearchChip,
  ResearchTimeline,
  ResearchTable,
  RTh,
  RTd,
  rowHoverClass,
  ResearchLoadingState,
  ResearchEmptyState,
  ResearchErrorState,
  retColor,
  type Tone,
  type TimelineStep,
} from "./kit";

// V3冻结监控 — Freeze Monitor（AI 研究中心 · V3 组）。
// 纯展示层：只读现有 /api/scoring-v3/freeze，展示 Shadow 冻结验证期进度与前向证据。
// 不改任何 API / Freeze / 评分算法。冻结期内一切算法禁改（本页仅呈现）。

type Freeze = {
  freeze: { version: string; commit: string; startDate: string; endDate: string; targetReadiness: number };
  day: number; totalDays: number; over: boolean; shadowDays: number;
  readiness: number; grade: string; gateReady: boolean;
  regime: string | null; weights: Record<string, number> | null; latestCalibDate: string | null;
  replay: { asOfRange: string[]; days: number; verdict: { v3Win: number; v3Lose: number; cells: number; v3Better: boolean }; forward: { h: number; v2: number | null; v3: number | null; spread: number | null }[] } | null;
  history: { date: string; regime: string; readiness: number; grade: string; sb: number | null }[];
};

const DIM_ZH: Record<string, string> = { technical: "技术面", fundamental: "基本面", alpha: "Alpha", news: "新闻", flow: "资金" };
const GRADE_TONE: Record<string, Tone> = { A: "green", B: "blue", C: "amber", D: "red" };
const GRADE_HEX: Record<string, string> = { A: RM.green, B: RM.blue, C: RM.amber, D: RM.red };
const REGIME_ZH: Record<string, string> = { BULL: "牛市", BEAR: "熊市", SIDEWAYS: "震荡市" };
const fx = (v: number | null | undefined, dp = 2) => (v == null ? "—" : v.toFixed(dp));
function addDays(iso: string, n: number): string { const dt = new Date(iso + "T00:00:00Z"); dt.setUTCDate(dt.getUTCDate() + n); return dt.toISOString().slice(0, 10); }

export function FreezeMonitorPanel({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [d, setD] = useState<Freeze | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { fetch("/api/scoring-v3/freeze").then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }).then(setD).catch((e) => setErr(String(e))); }, []);

  const goCalib = onNavigate ? () => onNavigate("calibration") : undefined;
  const goScore = onNavigate ? () => onNavigate("v3") : undefined;
  const goOverview = onNavigate ? () => onNavigate("overview") : undefined;
  const hero = <FreezeHero d={d} loading={!d && !err} error={!!err} onScore={goScore} />;

  if (err) return <ResearchPanelShell>{hero}<ResearchErrorState message={err} hint={<>请运行 <code style={{ color: RM.sub }}>npm run compute-scores</code> 累计冻结验证。</>} actions={<ResearchButton onClick={goOverview} disabled={!goOverview}>返回综合驾驶舱</ResearchButton>} /></ResearchPanelShell>;
  if (!d) return <ResearchPanelShell>{hero}<ResearchLoadingState label="正在加载 V3 冻结监控…" /></ResearchPanelShell>;

  const remaining = Math.max(0, d.totalDays - d.day);
  const histByDate = new Map((d.history ?? []).map((h) => [h.date, h]));

  // 验证时间轴：Day1 … totalDays
  const steps: TimelineStep[] = Array.from({ length: d.totalDays }, (_, i) => {
    const dayNum = i + 1;
    const date = addDays(d.freeze.startDate, i);
    const h = histByDate.get(date);
    const state: TimelineStep["state"] = dayNum < d.day ? "done" : dayNum === d.day ? "current" : "waiting";
    return {
      label: `Day ${dayNum} · ${date}`,
      sub: h ? <>就绪度 <b style={{ color: RM.ink }}>{h.readiness.toFixed(1)}</b> · Grade {h.grade}{h.sb != null ? ` · STRONG_BUY ${h.sb}` : ""}</> : state === "waiting" ? "等待中" : "已累计",
      right: h ? <ResearchStatusBadge tone={GRADE_TONE[h.grade] ?? "neutral"}>Grade {h.grade}</ResearchStatusBadge> : state === "current" ? <ResearchStatusBadge tone="blue">今天</ResearchStatusBadge> : state === "waiting" ? <ResearchStatusBadge tone="neutral">等待中</ResearchStatusBadge> : <ResearchStatusBadge tone="green">已完成</ResearchStatusBadge>,
      state,
    };
  });

  const rp = d.replay;
  const recTone: Tone = d.gateReady ? "green" : d.over ? "red" : "amber";
  const recText = d.gateReady ? "已达标，可评估上线" : d.over ? "已到期但未达标，需人工评审" : `继续冻结验证至 ${d.freeze.endDate}（未达就绪度 ${d.freeze.targetReadiness}）`;

  return (
    <ResearchPanelShell>
      {hero}

      {/* KPI */}
      <ResearchKpiGrid>
        <ResearchKpiCard label="Freeze 版本" value={<span className="text-[14px]">{d.freeze.version}</span>} sub="Shadow Freeze" tone="blue" />
        <ResearchKpiCard label="Commit" value={<span className="text-[15px] font-mono">{d.freeze.commit}</span>} sub="冻结基线" />
        <ResearchKpiCard label="验证进度" value={`${d.day} / ${d.totalDays}`} sub="Current / Total Day" tone="blue" />
        <ResearchKpiCard label="就绪度" value={`${d.readiness.toFixed(1)}`} sub={`目标 ${d.freeze.targetReadiness} · Grade ${d.grade}`} tone={GRADE_TONE[d.grade]} />
        <ResearchKpiCard label="剩余天数" value={remaining} sub={d.over ? "已到期" : `至 ${d.freeze.endDate}`} tone={d.over ? "green" : "amber"} />
        <ResearchKpiCard label="是否通过" value={<span className="text-[16px]">{d.gateReady ? "已达标" : "未达标"}</span>} sub="Gate Ready" tone={d.gateReady ? "green" : "amber"} />
      </ResearchKpiGrid>

      {/* 冻结进度条 + 建议 */}
      <ResearchSection title="冻结进度" desc={`${d.freeze.startDate} → ${d.freeze.endDate} · Shadow 累计 ${d.shadowDays} 日`}>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-[13px] font-semibold tabular-nums shrink-0" style={{ color: RM.ink }}>第 {d.day} / {d.totalDays} 天</span>
          <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: RM.card }}><div className="h-full rounded-full" style={{ width: `${Math.min(100, (d.day / d.totalDays) * 100)}%`, background: RM.blue }} /></div>
          <span className="text-[12px] shrink-0" style={{ color: RM.faint }}>{d.over ? "已到期" : `剩 ${remaining} 天`}</span>
        </div>
        <ResearchInsightCard title="冻结结论 · Recommendation" tone={recTone}>
          就绪度 <b style={{ color: GRADE_HEX[d.grade] }}>{d.readiness.toFixed(1)}/{d.freeze.targetReadiness}（Grade {d.grade}）</b>。研究建议：<b style={{ color: recTone === "green" ? RM.green : recTone === "red" ? RM.red : RM.amber }}>{recText}</b>。校准明细见 <button onClick={goCalib} disabled={!goCalib} className="font-semibold disabled:opacity-40" style={{ color: RM.blue }}>V3 Calibration</button>。
        </ResearchInsightCard>
      </ResearchSection>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Validation Timeline */}
        <ResearchSection title="Validation Timeline · 验证时间轴" desc={`${d.totalDays} 日冻结验证进度`}>
          {steps.length === 0 ? <ResearchEmptyState title="暂无验证数据" desc="冻结验证尚未开始累计。" /> : <ResearchTimeline steps={steps} />}
        </ResearchSection>

        {/* Freeze Result（前向证据 V2 vs V3） */}
        <ResearchSection title="Freeze Result · 前向验证" desc={rp ? `Replay Top20 · ${rp.days} 日 · V3 胜 ${rp.verdict.v3Win}/${rp.verdict.cells} 格` : "前向收益证据"}>
          {!rp ? (
            <ResearchEmptyState title="暂无验证数据" desc="等待每日 Replay 累计前向收益。" />
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <MiniRes label="V3 优于 V2" value={`${rp.verdict.v3Win} / ${rp.verdict.cells}`} tone="green" />
                <MiniRes label="V3 劣于 V2" value={String(rp.verdict.v3Lose)} tone={rp.verdict.v3Lose > 0 ? "amber" : "green"} />
                <MiniRes label="总体结论" value={rp.verdict.v3Better ? "V3 更优" : "V2 更优"} tone={rp.verdict.v3Better ? "green" : "red"} />
              </div>
              <ResearchTable minWidth={360}>
                <thead><tr><RTh>横期</RTh><RTh align="right">V2</RTh><RTh align="right">V3</RTh><RTh align="right">V3 − V2</RTh></tr></thead>
                <tbody>
                  {rp.forward.map((f) => (
                    <tr key={f.h} className={rowHoverClass}>
                      <RTd color={RM.sub}>T+{f.h}</RTd>
                      <RTd align="right" mono color={retColor(f.v2)}>{fx(f.v2)}%</RTd>
                      <RTd align="right" mono color={retColor(f.v3)}>{fx(f.v3)}%</RTd>
                      <RTd align="right" mono color={retColor(f.spread)}>{f.spread != null && f.spread >= 0 ? "+" : ""}{fx(f.spread)}</RTd>
                    </tr>
                  ))}
                </tbody>
              </ResearchTable>
            </>
          )}
        </ResearchSection>
      </div>

      {/* 冻结权重（锁定） */}
      {d.weights ? (
        <ResearchSection title="冻结权重（锁定）" desc={`冻结期内不变 · 市场状态 ${REGIME_ZH[d.regime ?? ""] ?? "—"}`}>
          <div className="flex flex-wrap gap-2">
            {(["technical", "fundamental", "alpha", "news", "flow"] as const).map((k) => (
              <ResearchChip key={k}>{DIM_ZH[k]} <b style={{ color: RM.ink }} className="ml-1">{((d.weights![k] ?? 0) * 100).toFixed(1)}%</b></ResearchChip>
            ))}
          </div>
          <div className="mt-3 rounded-lg px-3 py-2.5 text-[12px]" style={{ background: `${RM.amber}12`, border: `1px solid ${RM.amber}33`, color: RM.amber }}>
            🔒 冻结期内禁止修改：动态权重 / Calibration / 阈值 / 风险层 / Confidence / 数据质量 / Explain / ScoreV3 / Alpha / 市场状态 / Feature Flag / Backtest / Shadow 逻辑。Cron 继续自动运行，SCORING_ENGINE=v2 保持，切换需人工确认。
          </div>
        </ResearchSection>
      ) : null}

      {/* 每日累计历史 */}
      <ResearchSection title="每日累计" desc="就绪度 / STRONG_BUY 历史">
        {(d.history ?? []).length === 0 ? <ResearchEmptyState title="暂无每日数据" desc="冻结验证尚未累计每日记录。" /> : (
          <div style={{ maxHeight: 320, overflow: "auto" }}>
            <ResearchTable minWidth={520}>
              <thead><tr><RTh>日期</RTh><RTh>市场</RTh><RTh align="right">就绪度</RTh><RTh align="center">Grade</RTh><RTh align="right">STRONG_BUY</RTh></tr></thead>
              <tbody>
                {d.history.map((h) => (
                  <tr key={h.date} className={rowHoverClass}>
                    <RTd mono color={RM.sub}>{h.date}</RTd>
                    <RTd color={RM.sub}>{REGIME_ZH[h.regime] ?? h.regime}</RTd>
                    <RTd align="right" mono>{h.readiness.toFixed(1)}</RTd>
                    <RTd align="center" color={GRADE_HEX[h.grade]}><b>{h.grade}</b></RTd>
                    <RTd align="right" mono color={RM.sub}>{h.sb ?? "—"}</RTd>
                  </tr>
                ))}
              </tbody>
            </ResearchTable>
          </div>
        )}
      </ResearchSection>
    </ResearchPanelShell>
  );
}

function MiniRes({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  const c = tone === "green" ? RM.green : tone === "amber" ? RM.amber : tone === "red" ? RM.red : RM.ink;
  return (
    <div className="rounded-xl px-3 py-3 text-center" style={{ background: RM.card, border: `1px solid ${RM.border}` }}>
      <div className="text-[18px] font-semibold tabular-nums" style={{ color: c }}>{value}</div>
      <div className="text-[11px] mt-0.5" style={{ color: RM.muted }}>{label}</div>
    </div>
  );
}

// ── FreezeHero ────────────────────────────────────────────────────────────────
function FreezeHero({ d, loading, error, onScore }: { d: Freeze | null; loading: boolean; error: boolean; onScore?: () => void }) {
  const statusText = loading ? "运行中" : error ? "暂无数据" : d ? (d.over ? "已到期" : "冻结中") : "暂无数据";
  const statusTone: Tone = loading ? "amber" : error || !d ? "neutral" : "blue";
  return (
    <div className="rounded-2xl px-6 py-5 flex flex-col lg:flex-row lg:items-center gap-4" style={{ background: RM.panel, border: `1px solid ${RM.border}` }}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]" style={{ color: RM.ink }}>V3冻结监控</h1>
          <span className="text-[12px] font-medium" style={{ color: RM.faint }}>Freeze Monitor</span>
          <ResearchStatusBadge tone={statusTone}>{statusText}</ResearchStatusBadge>
          {d && <ResearchStatusBadge tone={d.gateReady ? "green" : "amber"}>{d.gateReady ? "已达标" : "未达标"}</ResearchStatusBadge>}
        </div>
        <p className="mt-1.5 text-[13px]" style={{ color: RM.muted }}>Shadow Freeze Validation · SCORING_ENGINE=v2</p>
        {d && (
          <div className="mt-3 flex items-center gap-4 flex-wrap">
            <div className="flex items-baseline gap-2"><span className="text-[30px] font-bold leading-none tabular-nums" style={{ color: RM.blue }}>第 {d.day}</span><span className="text-[13px]" style={{ color: RM.faint }}>/ {d.totalDays} 天验证</span></div>
            <span className="h-6 w-px" style={{ background: RM.border }} />
            <span className="text-[12px]" style={{ color: RM.sub }}>开始 <b className="tabular-nums" style={{ color: RM.ink }}>{d.freeze.startDate}</b></span>
            <span className="text-[12px]" style={{ color: RM.sub }}>剩余 <b className="tabular-nums" style={{ color: RM.ink }}>{Math.max(0, d.totalDays - d.day)}</b> 天</span>
            <span className="text-[12px]" style={{ color: RM.faint }}>最终评审 <span className="tabular-nums" style={{ color: RM.sub }}>{d.freeze.endDate}</span></span>
          </div>
        )}
      </div>
      <div className="shrink-0"><ResearchButton onClick={onScore} disabled={!onScore}>查看 V3动态评分 →</ResearchButton></div>
    </div>
  );
}
