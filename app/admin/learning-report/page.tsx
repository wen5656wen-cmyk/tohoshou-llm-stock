"use client";

import { useEffect, useState, useCallback } from "react";

// ── Types matching generate-learning-report.ts output ─────────────────────────
type HorizonStatus = "READY" | "PARTIAL" | "INSUFFICIENT" | "PENDING";
type BacktestRow = {
  horizon: string; sampleCount: number; filledCount: number; fillRate: number;
  winRate: number | null; avgReturn: number | null; medianReturn: number | null; alpha: number | null;
  bestReturn: number | null; worstReturn: number | null; status: HorizonStatus;
};
type ComponentDetail = { score: number; [key: string]: unknown };
type DataIntegrity = { score: number; grade: string; components: Record<string, ComponentDetail | number> };
type FeatureCoverage = { latestDate: string | null; totalRows: number; overallPct: number; note: string | null };
type FeatureField = { field: string; nonNullCount: number; coveragePct: number };
type DataReadiness = { tradingDays?: number; availableHorizons: string[]; sampleCounts: Record<string, number>; filledCounts: Record<string, number>; featureCoverage: FeatureCoverage; expectedFillDates: { "30d": string | null; "90d": string | null } };
type RegressionDetection = { status: "OK" | "WARNING" | "CRITICAL" | "INSUFFICIENT_DATA"; delta: number | null; message?: string; currentVersion?: string; evidence?: string[] };
type LearningReport = {
  reportDate: string; generatedAt: string; reportVersion: string; engineVersion: string;
  dataIntegrity: DataIntegrity; dataReadiness: DataReadiness; backtestSummary: BacktestRow[];
  regressionDetection: RegressionDetection; recommendations: string[];
};

// ── Palette (Apple × Bloomberg × OpenAI Research) ─────────────────────────────
const C = {
  bg: "#FAFAFA", card: "#FFFFFF", line: "#ECECEC", cardSub: "#F7F7F9",
  ink: "#1D1D1F", sub: "#6E6E73", faint: "#86868B",
  blue: "#007AFF", green: "#34C759", amber: "#FF9F0A", red: "#FF3B30", purple: "#5856D6",
};
const ALL_HORIZONS = ["1d", "3d", "5d", "7d", "10d", "20d", "30d", "60d", "90d"];
const fmtPct1 = (v: number | null | undefined) => v == null ? "—" : `${v.toFixed(1)}%`;
const fmtRet = (v: number | null | undefined) => v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
const retColor = (v: number | null | undefined) => v == null ? C.faint : v > 0 ? C.green : v < 0 ? C.red : C.sub;
const gradeMap = (g: string): { label: string; color: string } => {
  if (g === "GREEN" || g === "PASS") return { label: "PASS", color: C.green };
  if (g === "YELLOW" || g === "WARNING") return { label: "WARNING", color: C.amber };
  return { label: "CRITICAL", color: C.red };
};
const stColor = (s: HorizonStatus) => s === "READY" ? C.green : s === "PARTIAL" ? C.amber : C.faint;
const stLabel = (s: HorizonStatus) => s === "READY" ? "Ready" : s === "PARTIAL" ? "Partial" : s === "INSUFFICIENT" ? "Insufficient" : "Pending";

function Ring({ score, size = 78, stroke = 6, color, suffix }: { score: number | null; size?: number; stroke?: number; color: string; suffix?: string }) {
  const s = score != null && Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : null;
  const r = (size - stroke) / 2, circ = 2 * Math.PI * r, pct = s ?? 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#EEEEF1" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)} style={{ transition: "stroke-dashoffset .7s cubic-bezier(.22,1,.36,1)" }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-semibold tabular-nums leading-none" style={{ fontSize: size * 0.3, color: C.ink }}>{s ?? "—"}{suffix}</span>
      </div>
    </div>
  );
}
function Section({ title, sub, right, children }: { title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-12 dash-in">
      <div className="flex items-end justify-between gap-3 mb-5">
        <div><h2 className="text-[19px] font-semibold tracking-[-0.01em]" style={{ color: C.ink }}>{title}</h2>{sub && <p className="text-[13px] mt-1" style={{ color: C.faint }}>{sub}</p>}</div>
        {right}
      </div>
      {children}
    </section>
  );
}

export default function LearningIntelligenceCenter() {
  const [report, setReport] = useState<LearningReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [featFields, setFeatFields] = useState<FeatureField[]>([]);
  const [activeHz, setActiveHz] = useState("1d");

  const loadFeatFields = useCallback(async () => {
    try { const res = await fetch("/api/admin/mission-control"); if (res.ok) { const data = await res.json(); setFeatFields(data.featureCoverage?.fields ?? []); } } catch { /* non-critical */ }
  }, []);
  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/learning-report");
      if (res.status === 404) { setNotFound(true); setReport(null); }
      else if (!res.ok) setError(`HTTP ${res.status}`);
      else { setReport(await res.json()); setNotFound(false); setError(null); }
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); setRefreshing(false); setLastRefresh(new Date()); }
  }, []);
  useEffect(() => {
    load(); loadFeatFields();
    const timer = setInterval(() => { load(); loadFeatFields(); }, 60_000);
    return () => clearInterval(timer);
  }, [load, loadFeatFields]);

  const shell = (inner: React.ReactNode) => <div className="min-h-screen dash-font" style={{ background: C.bg }}><div className="mx-auto max-w-[1600px] px-6 lg:px-10 xl:px-14 py-8 lg:py-10">{inner}</div></div>;
  if (loading) return shell(<div className="py-20 text-center text-[14px]" style={{ color: C.faint }}><span className="animate-pulse">加载学习报告中…</span></div>);
  if (notFound || error || !report) return shell(<div className="dash-card p-6 text-[14px]" style={{ color: error ? C.red : C.faint }}>{error ? `错误：${error}` : "暂无学习报告 · No learning report yet"}</div>);

  const di = report.dataIntegrity;
  const dr = report.dataReadiness;
  const grade = gradeMap(di.grade);
  const totalSample = ALL_HORIZONS.reduce((a, h) => a + (dr.sampleCounts[h] ?? 0), 0);
  const totalFilled = ALL_HORIZONS.reduce((a, h) => a + (dr.filledCounts[h] ?? 0), 0);
  const fillRate = totalSample > 0 ? (totalFilled / totalSample) * 100 : null;
  const gen = report.generatedAt ? new Date(new Date(report.generatedAt).getTime() + 9 * 3600_000).toISOString().slice(5, 16).replace("T", " ") : report.reportDate;

  const cards = [
    { label: "Learning Score", value: di.score, unit: `/100 · ${grade.label}`, color: grade.color, ring: true },
    { label: "Feature Coverage", value: dr.featureCoverage.overallPct, unit: `${dr.featureCoverage.totalRows} rows`, color: dr.featureCoverage.overallPct >= 95 ? C.green : C.amber, ring: true, pctSuffix: "%" },
    { label: "Fill Rate", value: fillRate != null ? Math.round(fillRate) : null, unit: `${totalFilled.toLocaleString()}/${totalSample.toLocaleString()}`, color: fillRate != null && fillRate >= 60 ? C.green : C.amber, ring: true, pctSuffix: "%" },
    { label: "Data Quality", value: null, textValue: grade.label, unit: `${dr.tradingDays ?? report.dataReadiness.availableHorizons.length} trading days`, color: grade.color, ring: false },
  ];

  const highlights = report.recommendations ?? [];
  const bt = report.backtestSummary ?? [];
  const hzRow = bt.find((b) => b.horizon === activeHz) ?? null;
  const hzSample = dr.sampleCounts[activeHz] ?? 0;
  const hzFilled = dr.filledCounts[activeHz] ?? 0;
  const hzFill = hzSample > 0 ? (hzFilled / hzSample) * 100 : 0;
  const reg = report.regressionDetection;

  return shell(
    <>
      {/* ── Hero ── */}
      <header className="dash-in flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-10">
        <div>
          <div className="text-[11px] font-semibold tracking-[0.16em] uppercase" style={{ color: C.faint }}>Learning Intelligence</div>
          <h1 className="text-[30px] lg:text-[34px] font-semibold tracking-[-0.02em] mt-1.5" style={{ color: C.ink }}>Learning Report</h1>
          <p className="text-[14px] mt-1.5" style={{ color: C.sub }}>Today&apos;s AI Learning Summary · {report.reportDate}</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button onClick={load} disabled={refreshing} className="inline-flex items-center gap-1.5 h-10 px-5 rounded-full text-[13px] font-semibold dash-card dash-int" style={{ color: C.ink }}>
            <span style={{ display: "inline-block", animation: refreshing ? "dash-spin .8s linear infinite" : "none" }}>↻</span>Refresh
          </button>
          <div className="hidden lg:flex flex-col items-end leading-tight">
            <span className="text-[12px] font-semibold tabular-nums" style={{ color: C.sub }}>{gen} JST</span>
            <span className="text-[11px] font-mono" style={{ color: C.faint }}>{report.engineVersion}</span>
          </div>
        </div>
      </header>

      {/* ── 4 Premium Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-14 dash-in" style={{ animationDelay: "40ms" }}>
        {cards.map((c) => (
          <div key={c.label} className="dash-card dash-int p-6 flex items-center gap-4">
            {c.ring ? <Ring score={c.value} size={74} color={c.color} suffix={c.pctSuffix} /> : (
              <span className="inline-flex items-center justify-center w-[74px] h-[74px] rounded-full text-[18px] font-bold" style={{ background: `${c.color}14`, color: c.color }}>{c.textValue}</span>
            )}
            <div>
              <div className="text-[13px] font-medium" style={{ color: C.sub }}>{c.label}</div>
              <div className="text-[12px] mt-1 tabular-nums" style={{ color: C.faint }}>{c.unit}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Today's Learning ── */}
      <Section title="Today's Learning" sub="AI 今日学习摘要 · 来自 learning-report recommendations">
        <div className="dash-card p-6">
          {highlights.length === 0 ? (
            <div className="text-[14px]" style={{ color: C.faint }}>No Significant Learning Today · 今日无显著学习</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-3">
              {highlights.map((h, i) => (
                <div key={i} className="flex items-start gap-2.5 text-[14px]" style={{ color: C.sub }}>
                  <span className="shrink-0 mt-0.5" style={{ color: C.green }}>✓</span><span>{h}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>

      {/* ── Learning Timeline (segmented) ── */}
      <Section title="Learning Timeline" sub="按持有周期查看数据成熟度">
        <div className="inline-flex p-1 rounded-full mb-5 flex-wrap gap-0.5" style={{ background: "#F0F0F3", border: `1px solid ${C.line}` }}>
          {ALL_HORIZONS.map((h) => {
            const on = h === activeHz;
            return <button key={h} onClick={() => setActiveHz(h)} className="px-3.5 h-8 rounded-full text-[13px] font-semibold transition-all uppercase" style={on ? { background: "#fff", color: C.ink, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" } : { color: C.sub }}>{h}</button>;
          })}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {[
            { l: "Samples", v: hzSample.toLocaleString(), c: C.ink },
            { l: "Filled", v: hzFilled.toLocaleString(), c: C.ink },
            { l: "Fill Rate", v: `${hzFill.toFixed(0)}%`, c: hzFill >= 60 ? C.green : C.amber },
            { l: "Win Rate", v: hzRow?.winRate != null ? `${hzRow.winRate.toFixed(1)}%` : "—", c: C.ink },
            { l: "Avg Return", v: fmtRet(hzRow?.avgReturn), c: retColor(hzRow?.avgReturn) },
            { l: "Alpha", v: fmtRet(hzRow?.alpha), c: retColor(hzRow?.alpha) },
          ].map((x) => (
            <div key={x.l} className="dash-card p-5">
              <div className="text-[11px] font-medium" style={{ color: C.faint }}>{x.l}</div>
              <div className="text-[22px] font-semibold tabular-nums tracking-[-0.01em] mt-1.5" style={{ color: x.c }}>{x.v}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Backtest Summary ── */}
      <Section title="Backtest Summary" sub="各持有周期回测（数据成熟后生效）">
        <div className="dash-card overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr style={{ borderBottom: `1px solid ${C.line}` }}>
              {["Horizon", "Samples", "Fill", "Win Rate", "Avg Return", "Median", "Alpha", "Best", "Worst", "Status"].map((h, i) => (
                <th key={h} className={`px-4 py-3 font-semibold text-[11px] uppercase tracking-wide ${i === 0 ? "text-left" : "text-right"}`} style={{ color: C.faint }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {bt.map((b) => (
                <tr key={b.horizon} className="transition-colors hover:bg-[#F7F7F9]" style={{ borderBottom: `1px solid ${C.line}` }}>
                  <td className="px-4 py-3 font-semibold uppercase" style={{ color: C.ink }}>{b.horizon}</td>
                  <td className="px-4 py-3 text-right tabular-nums" style={{ color: C.sub }}>{b.sampleCount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right tabular-nums" style={{ color: C.sub }}>{fmtPct1(b.fillRate)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold" style={{ color: b.winRate != null && b.winRate >= 50 ? C.green : C.ink }}>{b.winRate != null ? `${b.winRate.toFixed(1)}%` : "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold" style={{ color: retColor(b.avgReturn) }}>{fmtRet(b.avgReturn)}</td>
                  <td className="px-4 py-3 text-right tabular-nums" style={{ color: retColor(b.medianReturn) }}>{fmtRet(b.medianReturn)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold" style={{ color: retColor(b.alpha) }}>{fmtRet(b.alpha)}</td>
                  <td className="px-4 py-3 text-right tabular-nums" style={{ color: C.green }}>{fmtRet(b.bestReturn)}</td>
                  <td className="px-4 py-3 text-right tabular-nums" style={{ color: C.red }}>{fmtRet(b.worstReturn)}</td>
                  <td className="px-4 py-3 text-right"><span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ color: stColor(b.status), background: `${stColor(b.status)}14` }}>{stLabel(b.status)}</span></td>
                </tr>
              ))}
              {bt.length === 0 && <tr><td colSpan={10} className="px-4 py-8 text-center text-[13px]" style={{ color: C.faint }}>暂无回测数据</td></tr>}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── Learning Progress ── */}
      <Section title="Learning Progress" sub="各周期数据积累进度">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-4">
          {ALL_HORIZONS.map((h) => {
            const sample = dr.sampleCounts[h] ?? 0;
            const filled = dr.filledCounts[h] ?? 0;
            const pct = sample > 0 ? (filled / sample) * 100 : 0;
            const ready = dr.availableHorizons.includes(h);
            const col = ready ? C.green : pct > 0 ? C.amber : C.faint;
            return (
              <div key={h} className="dash-card dash-int p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-bold uppercase" style={{ color: C.ink }}>{h}</span>
                  <span className="w-2 h-2 rounded-full" style={{ background: col }} />
                </div>
                <div className="text-[18px] font-semibold tabular-nums mt-2" style={{ color: col }}>{pct.toFixed(0)}%</div>
                <div className="text-[10px] mt-0.5 tabular-nums" style={{ color: C.faint }}>{filled.toLocaleString()}/{sample.toLocaleString()}</div>
                <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: "#EEEEF1" }}><div className="h-full rounded-full" style={{ width: `${pct}%`, background: col }} /></div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* ── AI Insights ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">
        <div className="lg:col-span-7">
          <Section title="AI Insights" sub="来自 learning-report · recommendations">
            <div className="dash-card p-6">
              {highlights.length === 0 ? <div className="text-[13px]" style={{ color: C.faint }}>No insights</div> : (
                <ul className="space-y-2.5">{highlights.map((h, i) => <li key={i} className="flex items-start gap-2.5 text-[13px]" style={{ color: C.sub }}><span style={{ color: C.blue }}>›</span>{h}</li>)}</ul>
              )}
            </div>
          </Section>
        </div>
        <div className="lg:col-span-5">
          <Section title="Model Version" sub="回归检测 · Regression">
            <div className="dash-card p-6 space-y-3">
              <div className="flex items-center justify-between text-[13px]"><span style={{ color: C.faint }}>Current</span><span className="font-mono font-semibold" style={{ color: C.ink }}>{reg.currentVersion ?? "—"}</span></div>
              <div className="flex items-center justify-between text-[13px]"><span style={{ color: C.faint }}>Regression</span><span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ color: reg.status === "OK" ? C.green : reg.status === "INSUFFICIENT_DATA" ? C.faint : C.amber, background: `${reg.status === "OK" ? C.green : reg.status === "INSUFFICIENT_DATA" ? C.faint : C.amber}14` }}>{reg.status}</span></div>
              <div className="flex items-center justify-between text-[13px]"><span style={{ color: C.faint }}>Data Integrity</span><span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ color: grade.color, background: `${grade.color}14` }}>{grade.label}</span></div>
              {featFields.length > 0 && <div className="flex items-center justify-between text-[13px] pt-2" style={{ borderTop: `1px solid ${C.line}` }}><span style={{ color: C.faint }}>Feature Fields</span><span className="tabular-nums font-semibold" style={{ color: C.ink }}>{featFields.length}</span></div>}
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}
