"use client";

import { useEffect, useState, useCallback } from "react";
import { BossDashboard } from "@/components/research/BossDashboard";
import { AlphaFactorsPanel } from "@/components/research/AlphaFactorsPanel";
import { AlphaAnalyticsPanel } from "@/components/research/AlphaAnalyticsPanel";
import { AlphaScorePanel } from "@/components/research/AlphaScorePanel";
import { AlphaBacktestPanel } from "@/components/research/AlphaBacktestPanel";
import { MarketRegimePanel } from "@/components/research/MarketRegimePanel";
import { FusionReportPanel } from "@/components/research/FusionReportPanel";
import { ScoreV3Panel } from "@/components/research/ScoreV3Panel";
import { CalibrationPanel } from "@/components/research/CalibrationPanel";
import { FreezeMonitorPanel } from "@/components/research/FreezeMonitorPanel";

// ── Types ─────────────────────────────────────────────────────────────────────

type TertileStats = {
  tertile: "TOP" | "MIDDLE" | "BOTTOM";
  sampleCount: number;
  winRate: number | null;
  avgReturn: number | null;
  medianReturn: number | null;
  avgAlpha: number | null;
};

type CategoryStats = {
  value: string;
  sampleCount: number;
  winRate: number | null;
  avgReturn: number | null;
  avgAlpha: number | null;
};

type FactorResult = {
  key: string; label: string; type: "numeric" | "categorical" | "boolean";
  coverage: number; sampleCount: number; insufficient: boolean;
  tertiles: TertileStats[]; categories: CategoryStats[];
  winRateDelta: number | null; returnDelta: number | null; alphaDelta: number | null;
  predictiveScore: number | null;
  direction: "positive" | "negative" | "neutral" | "unknown";
};

type FeatureCorr = { key: string; label: string; sampleCount: number; corrReturn: number | null; corrAlpha: number | null; corrWinRate: number | null };
type PairCorr    = { keyA: string; labelA: string; keyB: string; labelB: string; corr: number };
type FeatureQuality = { key: string; label: string; type: string; total: number; filled: number; coveragePct: number; min: number | null; max: number | null; mean: number | null; stddev: number | null; median: number | null };
type HorizonStatus  = { horizon: string; calendarDaysRequired: number; filledCount: number; totalCount: number; fillRate: number; ready: boolean; expectedReadyDate: string | null };

type ResearchData = {
  generatedAt: string;
  horizon: string;
  dataState: { drTotal: number; joinedRows: number; featCoverageRows: number; coveragePct: number; hasData: boolean };
  factorAnalysis: FactorResult[];
  correlation: { featureOutcome: FeatureCorr[]; highCorrPairs: PairCorr[]; hasData: boolean };
  quality: { total: number; features: FeatureQuality[]; overallCoverage: number; unexpectedNulls: string[] };
  readiness: { tradingDays: number; availableHorizons: string[]; earliestRecDate: string | null; latestRecDate: string | null; horizonStatus: HorizonStatus[] };
  summary: { dataConfidence: number; topPositiveFactors: string[]; topNegativeFactors: string[]; mostStableFeatures: string[]; weakestFeatures: string[]; mostPredictiveFeatures: string[]; observations: string[] };
};

// ── Colors ────────────────────────────────────────────────────────────────────

const C = {
  bg:     "#0a0a0a", surface: "#111", border: "#222",
  muted:  "#666",    text: "#ddd",
  green:  "#22c55e", yellow: "#eab308", red: "#ef4444",
  blue:   "#3b82f6", orange: "#f97316", purple: "#a855f7", teal: "#14b8a6",
};

const mono: React.CSSProperties = { fontFamily: "monospace", fontSize: 12 };
const cell: React.CSSProperties = { padding: "5px 8px", borderBottom: `1px solid ${C.border}`, ...mono, verticalAlign: "top" };
const th:   React.CSSProperties = { ...cell, fontWeight: 600, fontSize: 11, color: C.muted };

function fmtN(v: number | null, decimals = 2, suffix = "") {
  if (v == null) return <span style={{ color: C.muted }}>—</span>;
  return `${v >= 0 ? "+" : ""}${v.toFixed(decimals)}${suffix}`;
}

function fmtPct(v: number | null) {
  if (v == null) return <span style={{ color: C.muted }}>—</span>;
  return `${(v * 100).toFixed(1)}%`;
}

function deltaColor(v: number | null) {
  if (v == null) return C.muted;
  if (v > 0.03) return C.green;
  if (v < -0.03) return C.red;
  if (v !== 0)   return C.yellow;
  return C.text;
}

function corrColor(v: number | null) {
  if (v == null) return C.muted;
  const a = Math.abs(v);
  if (a >= 0.6)  return v > 0 ? C.green : C.red;
  if (a >= 0.3)  return v > 0 ? C.teal  : C.orange;
  return C.muted;
}

function directionBadge(d: string) {
  if (d === "positive") return <span style={{ color: "#000", background: C.green,  fontSize: 10, padding: "1px 5px", borderRadius: 3, fontWeight: 700 }}>▲ 正向</span>;
  if (d === "negative") return <span style={{ color: "#000", background: C.red,    fontSize: 10, padding: "1px 5px", borderRadius: 3, fontWeight: 700 }}>▼ 负向</span>;
  if (d === "neutral")  return <span style={{ color: C.muted, border: `1px solid ${C.border}`, fontSize: 10, padding: "1px 5px", borderRadius: 3 }}>= 中性</span>;
  return <span style={{ color: C.muted, fontSize: 10 }}>—</span>;
}

const HORIZONS = ["1d", "3d", "5d", "7d", "10d", "20d", "30d", "60d", "90d"] as const;

// ── Main Page ─────────────────────────────────────────────────────────────────

// ── AI 研究中心：顶层 Tab 壳（综合 = 原研究分析，其余为 Alpha/Fusion 研究工具）──
const CENTER_TABS: { key: string; label: string }[] = [
  { key: "overview",  label: "综合驾驶舱" },
  { key: "factors",   label: "Alpha因子库" },
  { key: "analytics", label: "因子分析" },
  { key: "score",     label: "影子评分（Alpha）" },
  { key: "backtest",  label: "Alpha策略回测" },
  { key: "regime",    label: "市场状态" },
  { key: "fusion",    label: "AI融合策略研究" },
  { key: "v3",        label: "V3动态评分" },
  { key: "calibration", label: "V3 Calibration" },
  { key: "freeze", label: "V3 Freeze Monitor" },
];

export default function ResearchCenterPage() {
  const [tab, setTab] = useState("overview");
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("tab");
    if (q && CENTER_TABS.some((t) => t.key === q)) setTab(q);
  }, []);

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh" }}>
      {/* 顶部导航栏 */}
      <div style={{ position: "sticky", top: 0, zIndex: 30, background: "#0a0a0a", borderBottom: "1px solid #222", padding: "10px 16px" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#eee", marginBottom: 8, fontFamily: "monospace" }}>AI 研究中心</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {CENTER_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 6, cursor: "pointer",
                fontFamily: "monospace",
                border: tab === t.key ? "1px solid #3b82f6" : "1px solid #222",
                background: tab === t.key ? "#1e3a5f" : "#111",
                color: tab === t.key ? "#93c5fd" : "#888",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab 内容（不跳页，全部内嵌） */}
      {tab === "overview"  && <><BossDashboard /><OverviewTab /></>}
      {tab === "factors"   && <div style={{ background: "#f8fafc", minHeight: "calc(100vh - 84px)" }}><AlphaFactorsPanel /></div>}
      {tab === "analytics" && <div style={{ background: "#f8fafc", minHeight: "calc(100vh - 84px)" }}><AlphaAnalyticsPanel /></div>}
      {tab === "score"     && <div style={{ background: "#f8fafc", minHeight: "calc(100vh - 84px)" }}><AlphaScorePanel /></div>}
      {tab === "backtest"  && <div style={{ background: "#f8fafc", minHeight: "calc(100vh - 84px)" }}><AlphaBacktestPanel /></div>}
      {tab === "regime"    && <div style={{ background: "#f8fafc", minHeight: "calc(100vh - 84px)" }}><MarketRegimePanel /></div>}
      {tab === "fusion"    && <div style={{ background: "#f8fafc", minHeight: "calc(100vh - 84px)" }}><FusionReportPanel /></div>}
      {tab === "v3"        && <div style={{ background: "#f8fafc", minHeight: "calc(100vh - 84px)" }}><ScoreV3Panel /></div>}
      {tab === "calibration" && <div style={{ background: "#f8fafc", minHeight: "calc(100vh - 84px)" }}><CalibrationPanel /></div>}
      {tab === "freeze"      && <div style={{ background: "#f8fafc", minHeight: "calc(100vh - 84px)" }}><FreezeMonitorPanel /></div>}
    </div>
  );
}

function OverviewTab() {
  const [data,     setData]     = useState<ResearchData | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [horizon,  setHorizon]  = useState<string>("7d");
  const [tab,      setTab]      = useState<"overview" | "factors" | "correlation" | "quality" | "readiness">("overview");
  const [now,      setNow]      = useState("");

  const load = useCallback(async (h: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/research?horizon=${h}`);
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? res.statusText); }
      setData(await res.json());
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
    setNow(new Date().toISOString().slice(0, 19).replace("T", " ") + " UTC");
  }, []);

  useEffect(() => { load(horizon); }, [load, horizon]);
  useEffect(() => {
    const id = setInterval(() => load(horizon), 60_000);
    return () => clearInterval(id);
  }, [load, horizon]);

  const d = data;
  const hasData = d?.dataState.hasData ?? false;

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, ...mono, padding: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>研究分析</h1>
          <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>
            只读模式 · {now}{loading ? " · 加载中…" : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: C.muted }}>回测周期：</span>
          <select
            value={horizon}
            onChange={(e) => setHorizon(e.target.value)}
            style={{ background: C.surface, color: C.text, border: `1px solid ${C.border}`, padding: "3px 8px", ...mono }}
          >
            {HORIZONS.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
          <a href="/admin/mission-control" style={{ color: C.blue, fontSize: 11, textDecoration: "none" }}>← 控制中心</a>
        </div>
      </div>

      {error && <div style={{ background: "#1a0000", border: `1px solid ${C.red}`, padding: 8, marginBottom: 12, color: C.red, fontSize: 12 }}>错误：{error}</div>}

      {/* Data State Banner */}
      {d && !hasData && (
        <div style={{ background: "#1a1200", border: `1px solid ${C.yellow}`, padding: "8px 12px", marginBottom: 12, fontSize: 12 }}>
          <strong style={{ color: C.yellow }}>⚠ 该周期数据不足：{horizon}</strong>
          {" · "}有效样本：{d.dataState.joinedRows} · 特征覆盖率：{d.dataState.coveragePct}%
          {" · "}回测填充：{d.readiness.horizonStatus.find((h) => h.horizon === horizon)?.filledCount ?? 0}
          {" · "}因子分析需要 feat_* 数据和已填充的回测结果。
          {d.readiness.horizonStatus.find((h) => h.horizon === horizon)?.expectedReadyDate &&
            ` 预计就绪：${d.readiness.horizonStatus.find((h) => h.horizon === horizon)?.expectedReadyDate}`}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {(["overview", "factors", "correlation", "quality", "readiness"] as const).map((t) => {
          const TAB_LABELS: Record<string, string> = { overview: "概览", factors: "因子分析", correlation: "相关性", quality: "数据质量", readiness: "就绪状态" };
          return (
            <button key={t} onClick={() => setTab(t)}
              style={{ background: tab === t ? "#333" : "transparent", border: `1px solid ${tab === t ? "#555" : C.border}`, color: tab === t ? C.text : C.muted, padding: "4px 12px", cursor: "pointer", ...mono, borderRadius: 3 }}>
              {TAB_LABELS[t]}
            </button>
          );
        })}
      </div>

      {!d && loading && <div style={{ color: C.muted, padding: 32, textAlign: "center" }}>加载研究数据中…</div>}

      {d && (
        <>
          {/* ── OVERVIEW TAB ────────────────────────────────────────────── */}
          {tab === "overview" && (
            <div>
              {/* Data confidence */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
                {[
                  { label: "数据可信度",    value: `${d.summary.dataConfidence}/100`,   color: d.summary.dataConfidence >= 75 ? C.green : d.summary.dataConfidence >= 40 ? C.yellow : C.red },
                  { label: "特征覆盖率",    value: `${d.dataState.coveragePct}%`,        color: d.dataState.coveragePct >= 80 ? C.green : d.dataState.coveragePct > 0 ? C.yellow : C.red },
                  { label: "有效样本",      value: d.dataState.joinedRows.toLocaleString(), color: C.text },
                  { label: "交易日数量",    value: d.readiness.tradingDays.toString(),   color: d.readiness.tradingDays >= 30 ? C.green : d.readiness.tradingDays > 0 ? C.yellow : C.red },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ background: C.surface, border: `1px solid ${C.border}`, padding: 12 }}>
                    <div style={{ color: C.muted, fontSize: 10, marginBottom: 4 }}>{label}</div>
                    <div style={{ fontWeight: 700, fontSize: 20, color }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Factor rankings */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                {/* Top Positive Factors */}
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, padding: 12 }}>
                  <div style={{ color: C.green, fontSize: 11, fontWeight: 600, marginBottom: 8 }}>▲ 最佳正向因子</div>
                  {d.summary.topPositiveFactors.length === 0
                    ? <div style={{ color: C.muted, fontSize: 11 }}>暂无数据</div>
                    : d.summary.topPositiveFactors.map((f, i) => (
                      <div key={f} style={{ color: C.text, fontSize: 12, marginBottom: 3 }}>
                        <span style={{ color: C.muted }}>{i + 1}. </span>{f}
                      </div>
                    ))}
                </div>

                {/* Top Negative Factors */}
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, padding: 12 }}>
                  <div style={{ color: C.red, fontSize: 11, fontWeight: 600, marginBottom: 8 }}>▼ 最弱因子</div>
                  {d.summary.topNegativeFactors.length === 0
                    ? <div style={{ color: C.muted, fontSize: 11 }}>暂无数据</div>
                    : d.summary.topNegativeFactors.map((f, i) => (
                      <div key={f} style={{ color: C.text, fontSize: 12, marginBottom: 3 }}>
                        <span style={{ color: C.muted }}>{i + 1}. </span>{f}
                      </div>
                    ))}
                </div>

                {/* Most Predictive */}
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, padding: 12 }}>
                  <div style={{ color: C.purple, fontSize: 11, fontWeight: 600, marginBottom: 8 }}>⚡ 最具预测力</div>
                  {d.summary.mostPredictiveFeatures.length === 0
                    ? <div style={{ color: C.muted, fontSize: 11 }}>暂无数据</div>
                    : d.summary.mostPredictiveFeatures.map((f, i) => (
                      <div key={f} style={{ color: C.text, fontSize: 12, marginBottom: 3 }}>
                        <span style={{ color: C.muted }}>{i + 1}. </span>{f}
                      </div>
                    ))}
                </div>

                {/* Most Stable */}
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, padding: 12 }}>
                  <div style={{ color: C.teal, fontSize: 11, fontWeight: 600, marginBottom: 8 }}>✓ 最稳定因子</div>
                  {d.summary.mostStableFeatures.map((f, i) => (
                    <div key={f} style={{ color: C.text, fontSize: 12, marginBottom: 3 }}>
                      <span style={{ color: C.muted }}>{i + 1}. </span>{f}
                    </div>
                  ))}
                </div>

                {/* Weakest Features */}
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, padding: 12 }}>
                  <div style={{ color: C.orange, fontSize: 11, fontWeight: 600, marginBottom: 8 }}>⚠ 覆盖率最低</div>
                  {d.summary.weakestFeatures.map((f, i) => (
                    <div key={f} style={{ color: C.text, fontSize: 12, marginBottom: 3 }}>
                      <span style={{ color: C.muted }}>{i + 1}. </span>{f}
                    </div>
                  ))}
                </div>

                {/* Observations */}
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, padding: 12 }}>
                  <div style={{ color: C.blue, fontSize: 11, fontWeight: 600, marginBottom: 8 }}>ℹ 分析说明</div>
                  {d.summary.observations.length === 0
                    ? <div style={{ color: C.muted, fontSize: 11 }}>系统运行正常</div>
                    : d.summary.observations.map((obs, i) => (
                      <div key={i} style={{ color: C.text, fontSize: 11, marginBottom: 5, lineHeight: 1.4 }}>• {obs}</div>
                    ))}
                </div>
              </div>
            </div>
          )}

          {/* ── FACTORS TAB ─────────────────────────────────────────────── */}
          {tab === "factors" && (
            <div>
              {!hasData && (
                <div style={{ color: C.muted, padding: 16, background: C.surface, border: `1px solid ${C.border}`, marginBottom: 12, fontSize: 12 }}>
                  因子贡献分析需要已联结的 feat_* 及回测数据。当前 {d.dataState.joinedRows} 条有效样本（周期 {horizon}）。
                </div>
              )}
              <table style={{ width: "100%", borderCollapse: "collapse", border: `1px solid ${C.border}` }}>
                <thead>
                  <tr style={{ background: "#181818" }}>
                    {["因子","类型","覆盖率","样本","方向","高分胜率","中分胜率","低分胜率","Δ胜率","Δ收益","Δ超额"].map((h) => (
                      <th key={h} style={{ ...th, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.factorAnalysis.map((f) => {
                    const top = f.tertiles.find((t) => t.tertile === "TOP");
                    const mid = f.tertiles.find((t) => t.tertile === "MIDDLE");
                    const bot = f.tertiles.find((t) => t.tertile === "BOTTOM");
                    return (
                      <tr key={f.key} style={{ background: f.direction === "positive" ? "#091209" : f.direction === "negative" ? "#120909" : "transparent" }}>
                        <td style={{ ...cell, color: C.blue, whiteSpace: "nowrap" }}>{f.label}</td>
                        <td style={{ ...cell, color: C.muted }}>{f.type}</td>
                        <td style={{ ...cell, color: f.coverage > 50 ? C.green : f.coverage > 0 ? C.yellow : C.red }}>{f.coverage}%</td>
                        <td style={cell}>{f.insufficient ? <span style={{ color: C.muted }}>不足</span> : f.sampleCount}</td>
                        <td style={cell}>{directionBadge(f.direction)}</td>
                        {/* Numeric tertile win rates */}
                        {f.type === "numeric" ? (
                          <>
                            <td style={{ ...cell, textAlign: "right" }}>{fmtPct(top?.winRate ?? null)}</td>
                            <td style={{ ...cell, textAlign: "right" }}>{fmtPct(mid?.winRate ?? null)}</td>
                            <td style={{ ...cell, textAlign: "right" }}>{fmtPct(bot?.winRate ?? null)}</td>
                          </>
                        ) : (
                          <td colSpan={3} style={{ ...cell, color: C.muted, fontSize: 11 }}>
                            {f.categories.slice(0, 3).map((c) => `${c.value.slice(0, 12)}: ${(c.winRate != null ? ((c.winRate * 100).toFixed(0) + "%") : "—")}`).join(" · ")}
                          </td>
                        )}
                        <td style={{ ...cell, textAlign: "right", color: deltaColor(f.winRateDelta) }}>
                          {f.winRateDelta != null ? fmtN(f.winRateDelta * 100, 1, "pp") : "—"}
                        </td>
                        <td style={{ ...cell, textAlign: "right", color: deltaColor(f.returnDelta) }}>
                          {f.returnDelta != null ? fmtN(f.returnDelta, 2, "%") : "—"}
                        </td>
                        <td style={{ ...cell, textAlign: "right", color: deltaColor(f.alphaDelta) }}>
                          {f.alphaDelta != null ? fmtN(f.alphaDelta, 2, "%") : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── CORRELATION TAB ─────────────────────────────────────────── */}
          {tab === "correlation" && (
            <div>
              {!d.correlation.hasData && (
                <div style={{ color: C.muted, padding: 16, background: C.surface, border: `1px solid ${C.border}`, marginBottom: 12, fontSize: 12 }}>
                  相关性分析需要已联结的 feat_* 数据和已填充的回测结果，当前数据不足。
                </div>
              )}

              {/* Feature → Outcome correlations */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ color: C.muted, fontSize: 11, fontWeight: 600, marginBottom: 6 }}>特征与结果相关性（Pearson r）</div>
                <table style={{ width: "100%", borderCollapse: "collapse", border: `1px solid ${C.border}` }}>
                  <thead>
                    <tr style={{ background: "#181818" }}>
                      {["因子","样本","r(收益)","r(超额)","r(胜率)","最强信号"].map((h) => (
                        <th key={h} style={th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {d.correlation.featureOutcome
                      .sort((a, b) => (Math.abs(b.corrReturn ?? 0) + Math.abs(b.corrWinRate ?? 0)) - (Math.abs(a.corrReturn ?? 0) + Math.abs(a.corrWinRate ?? 0)))
                      .map((f) => {
                        const maxCorr = [f.corrReturn, f.corrAlpha, f.corrWinRate]
                          .filter((c): c is number => c != null)
                          .reduce((best, c) => Math.abs(c) > Math.abs(best) ? c : best, 0);
                        return (
                          <tr key={f.key}>
                            <td style={{ ...cell, color: C.blue, whiteSpace: "nowrap" }}>{f.label}</td>
                            <td style={cell}>{f.sampleCount}</td>
                            <td style={{ ...cell, textAlign: "right", color: corrColor(f.corrReturn) }}>
                              {f.corrReturn != null ? f.corrReturn.toFixed(3) : "—"}
                            </td>
                            <td style={{ ...cell, textAlign: "right", color: corrColor(f.corrAlpha) }}>
                              {f.corrAlpha != null ? f.corrAlpha.toFixed(3) : "—"}
                            </td>
                            <td style={{ ...cell, textAlign: "right", color: corrColor(f.corrWinRate) }}>
                              {f.corrWinRate != null ? f.corrWinRate.toFixed(3) : "—"}
                            </td>
                            <td style={{ ...cell, textAlign: "right", color: corrColor(maxCorr === 0 ? null : maxCorr) }}>
                              {maxCorr !== 0 ? maxCorr.toFixed(3) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>

              {/* High correlation pairs */}
              <div>
                <div style={{ color: C.muted, fontSize: 11, fontWeight: 600, marginBottom: 6 }}>
                  高因子间相关性 (|r| ≥ 0.70) — 潜在冗余
                </div>
                {d.correlation.highCorrPairs.length === 0 ? (
                  <div style={{ color: C.muted, fontSize: 12, padding: 12, background: C.surface, border: `1px solid ${C.border}` }}>
                    {d.correlation.hasData ? "未发现高相关因子对 (|r| < 0.70)" : "暂无数据"}
                  </div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", border: `1px solid ${C.border}` }}>
                    <thead>
                      <tr style={{ background: "#181818" }}>
                        {["因子 A","因子 B","Pearson r","说明"].map((h) => <th key={h} style={th}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {d.correlation.highCorrPairs.map((p, i) => (
                        <tr key={i}>
                          <td style={{ ...cell, color: C.blue }}>{p.labelA}</td>
                          <td style={{ ...cell, color: C.blue }}>{p.labelB}</td>
                          <td style={{ ...cell, textAlign: "right", color: corrColor(p.corr), fontWeight: 700 }}>{p.corr.toFixed(3)}</td>
                          <td style={{ ...cell, color: C.muted, fontSize: 11 }}>
                            {Math.abs(p.corr) >= 0.9 ? "高度冗余 — 建议只保留一个"
                              : Math.abs(p.corr) >= 0.7 ? "中度冗余 — 注意多重共线性"
                              : "影响较小"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* ── QUALITY TAB ─────────────────────────────────────────────── */}
          {tab === "quality" && (
            <div>
              {/* Summary */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 12 }}>
                {[
                  { label: "推荐总行数",    value: d.quality.total.toLocaleString(),     color: C.text  },
                  { label: "整体覆盖率",    value: `${d.quality.overallCoverage}%`,       color: d.quality.overallCoverage > 80 ? C.green : d.quality.overallCoverage > 0 ? C.yellow : C.red },
                  { label: "异常空值",      value: d.quality.unexpectedNulls.length.toString(),
                    color: d.quality.unexpectedNulls.length === 30 ? C.yellow : d.quality.unexpectedNulls.length === 0 ? C.green : C.red },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ background: C.surface, border: `1px solid ${C.border}`, padding: 12 }}>
                    <div style={{ color: C.muted, fontSize: 10 }}>{label}</div>
                    <div style={{ fontWeight: 700, fontSize: 18, color }}>{value}</div>
                  </div>
                ))}
              </div>

              {d.quality.unexpectedNulls.length === 30 && (
                <div style={{ background: "#1a1200", border: `1px solid ${C.yellow}`, padding: "8px 12px", marginBottom: 12, fontSize: 11, color: C.yellow }}>
                  ⚠ 全部 30 个 feat_* 字段为空。首批数据预计在 2026-06-27 07:30 JST Cron 运行（rerank-top500.ts Step 8）后生成。
                </div>
              )}

              {/* Per-feature quality table */}
              <table style={{ width: "100%", borderCollapse: "collapse", border: `1px solid ${C.border}` }}>
                <thead>
                  <tr style={{ background: "#181818" }}>
                    {["因子","类型","覆盖率","已填 / 总计","最小","最大","均值","标准差","中位数"].map((h) => (
                      <th key={h} style={{ ...th, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.quality.features.map((f) => (
                    <tr key={f.key}>
                      <td style={{ ...cell, color: C.blue, whiteSpace: "nowrap" }}>{f.label}</td>
                      <td style={{ ...cell, color: C.muted, fontSize: 11 }}>{f.type}</td>
                      <td style={{ ...cell, textAlign: "right" }}>
                        <span style={{ color: f.coveragePct >= 80 ? C.green : f.coveragePct > 0 ? C.yellow : C.red }}>
                          {f.coveragePct}%
                        </span>
                      </td>
                      <td style={{ ...cell, color: C.muted }}>{f.filled.toLocaleString()} / {f.total.toLocaleString()}</td>
                      <td style={{ ...cell, textAlign: "right", color: C.muted }}>{f.min != null ? f.min.toFixed(2) : "—"}</td>
                      <td style={{ ...cell, textAlign: "right", color: C.muted }}>{f.max != null ? f.max.toFixed(2) : "—"}</td>
                      <td style={{ ...cell, textAlign: "right", color: C.muted }}>{f.mean != null ? f.mean.toFixed(2) : "—"}</td>
                      <td style={{ ...cell, textAlign: "right", color: C.muted }}>{f.stddev != null ? f.stddev.toFixed(2) : "—"}</td>
                      <td style={{ ...cell, textAlign: "right", color: C.muted }}>{f.median != null ? f.median.toFixed(2) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── READINESS TAB ───────────────────────────────────────────── */}
          {tab === "readiness" && (
            <div>
              {/* Summary stats */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
                {[
                  { label: "交易日数量",      value: d.readiness.tradingDays.toString(),           color: d.readiness.tradingDays >= 30 ? C.green : C.yellow },
                  { label: "可用回测周期",    value: d.readiness.availableHorizons.join(", ") || "无", color: d.readiness.availableHorizons.length >= 5 ? C.green : d.readiness.availableHorizons.length > 0 ? C.yellow : C.red },
                  { label: "最早推荐日",      value: d.readiness.earliestRecDate ?? "—",           color: C.muted },
                  { label: "最新推荐日",      value: d.readiness.latestRecDate   ?? "—",           color: C.muted },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ background: C.surface, border: `1px solid ${C.border}`, padding: 12 }}>
                    <div style={{ color: C.muted, fontSize: 10 }}>{label}</div>
                    <div style={{ fontWeight: 700, fontSize: 14, color, marginTop: 4 }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Horizon status table */}
              <table style={{ width: "100%", borderCollapse: "collapse", border: `1px solid ${C.border}` }}>
                <thead>
                  <tr style={{ background: "#181818" }}>
                    {["周期","所需日历天数","已填充","总计","填充率","状态","预计就绪日期"].map((h) => (
                      <th key={h} style={{ ...th, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.readiness.horizonStatus.map((h) => (
                    <tr key={h.horizon} style={{ background: h.ready ? "#091209" : "transparent" }}>
                      <td style={{ ...cell, fontWeight: 700, color: h.ready ? C.green : C.muted }}>{h.horizon}</td>
                      <td style={{ ...cell, textAlign: "right" }}>{h.calendarDaysRequired}d</td>
                      <td style={{ ...cell, textAlign: "right", color: h.filledCount > 0 ? C.text : C.muted }}>{h.filledCount.toLocaleString()}</td>
                      <td style={{ ...cell, textAlign: "right" }}>{h.totalCount.toLocaleString()}</td>
                      <td style={{ ...cell, textAlign: "right" }}>
                        <span style={{ color: h.fillRate >= 80 ? C.green : h.fillRate > 0 ? C.yellow : C.muted }}>
                          {h.fillRate}%
                        </span>
                      </td>
                      <td style={cell}>
                        {h.ready
                          ? <span style={{ color: C.green, fontWeight: 700 }}>✅ 就绪</span>
                          : <span style={{ color: h.filledCount > 0 ? C.yellow : C.muted }}>
                              {h.filledCount > 0 ? "部分就绪" : "等待中"}
                            </span>}
                      </td>
                      <td style={{ ...cell, color: C.muted }}>{h.expectedReadyDate ?? (h.ready ? "—" : "计算中…")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Readiness context */}
              <div style={{ marginTop: 12, background: C.surface, border: `1px solid ${C.border}`, padding: 12, fontSize: 11, color: C.muted }}>
                <strong style={{ color: C.text }}>滚动就绪规则：</strong>
                <br />• 当回测仓位的 returnPct 已填充（出场价已记录）时，该周期标记为「就绪」。
                <br />• 填充条件：recDate + N 日历天已过去，且出场日的行情数据存在。
                <br />• 日历天缓冲：1d=4, 3d=6, 5d=9, 7d=12, 10d=17, 20d=32, 30d=46, 60d=92, 90d=132。
                <br />• 滚动执行：尚未实现，本面板仅显示就绪状态。
                <br />• 建议最少 30 个交易日以获得可靠统计结果。
              </div>
            </div>
          )}
        </>
      )}

      <div style={{ marginTop: 24, fontSize: 10, color: C.muted, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
        研究分析 · 第6步 · 只读 · 不修改模型 ·
        <a href="/admin/versions" style={{ color: C.muted, marginLeft: 6 }}>版本中心</a>
        <a href="/admin/experiments" style={{ color: C.muted, marginLeft: 6 }}>实验管理</a>
      </div>
    </div>
  );
}
