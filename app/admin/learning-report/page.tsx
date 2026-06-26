"use client";

import { useEffect, useState, useCallback } from "react";

// ── Types matching generate-learning-report.ts output ─────────────────────────

type HorizonStatus = "READY" | "PARTIAL" | "INSUFFICIENT" | "PENDING";

type BacktestRow = {
  horizon: string;
  sampleCount: number;
  filledCount: number;
  fillRate: number;
  winRate: number | null;
  avgReturn: number | null;
  medianReturn: number | null;
  alpha: number | null;
  bestReturn: number | null;
  worstReturn: number | null;
  status: HorizonStatus;
};

type ComponentDetail = { score: number; [key: string]: unknown };

type DataIntegrity = {
  score: number;
  grade: string; // API returns "GREEN" | "YELLOW" | "WARNING" | "RED" | "CRITICAL"
  components: Record<string, ComponentDetail | number>;
};

type FeatureCoverage = {
  latestDate: string | null;
  totalRows: number;
  overallPct: number;
  note: string | null;
};

type FeatureField = {
  field: string;
  nonNullCount: number;
  coveragePct: number;
};

type DataReadiness = {
  availableHorizons: string[];
  sampleCounts: Record<string, number>;
  filledCounts: Record<string, number>;
  featureCoverage: FeatureCoverage;
  expectedFillDates: { "30d": string | null; "90d": string | null };
};

type RegressionDetection = {
  status: "OK" | "WARNING" | "CRITICAL" | "INSUFFICIENT_DATA";
  delta: number | null;
  message?: string;
};

type VersionComparisonEntry = {
  versionSnapshotId: string;
  horizon: string;
  winRate: number | null;
  avgReturn: number | null;
  sampleCount: number;
};

type LearningReport = {
  reportDate: string;
  generatedAt: string;
  reportVersion: string;
  engineVersion: string;
  dataIntegrity: DataIntegrity;
  dataReadiness: DataReadiness;
  backtestSummary: BacktestRow[];
  versionComparison: VersionComparisonEntry[];
  regressionDetection: RegressionDetection;
  experimentSummary: unknown;
  recommendations: string[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const ALL_HORIZONS = ["1d", "3d", "5d", "7d", "10d", "20d", "30d", "60d", "90d"];

function fmt(v: number | null, dec = 2, suffix = ""): string {
  if (v === null || v === undefined) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(dec)}${suffix}`;
}

function fmtPct(v: number | null): string {
  if (v === null || v === undefined) return "—";
  return `${v.toFixed(1)}%`;
}

function statusColor(s: HorizonStatus): string {
  return s === "READY" ? "#4ade80" : s === "PARTIAL" ? "#fbbf24" : "#64748b";
}

function statusLabel(s: HorizonStatus): string {
  return s === "READY" ? "就绪" : s === "PARTIAL" ? "部分" : s === "INSUFFICIENT" ? "不足" : "待机";
}

function gradeColor(g: string): string {
  return g === "GREEN" ? "#4ade80" : g === "YELLOW" || g === "WARNING" ? "#fbbf24" : "#f87171";
}

function regColor(s: RegressionDetection["status"]): string {
  return s === "OK" ? "#4ade80" : s === "WARNING" ? "#fbbf24" : s === "CRITICAL" ? "#f87171" : "#64748b";
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LearningReportPage() {
  const [report, setReport] = useState<LearningReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [featFields, setFeatFields] = useState<FeatureField[]>([]);

  const loadFeatFields = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/mission-control");
      if (res.ok) {
        const data = await res.json();
        setFeatFields(data.featureCoverage?.fields ?? []);
      }
    } catch {
      // non-critical, silently ignore
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/learning-report");
      if (res.status === 404) {
        setNotFound(true);
        setReport(null);
      } else if (!res.ok) {
        setError(`HTTP ${res.status}`);
      } else {
        const data = await res.json();
        setReport(data);
        setNotFound(false);
        setError(null);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  }, []);

  useEffect(() => {
    load();
    loadFeatFields();
    const timer = setInterval(() => { load(); loadFeatFields(); }, 60_000);
    return () => clearInterval(timer);
  }, [load, loadFeatFields]);

  const style: React.CSSProperties = {
    background: "#0a0a0a",
    color: "#ddd",
    fontFamily: "monospace",
    minHeight: "100vh",
    padding: "24px",
  };

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={style}>
        <div style={{ color: "#64748b", marginTop: 60, textAlign: "center" }}>
          加载学习报告中…
        </div>
      </div>
    );
  }

  // ── Not Found ────────────────────────────────────────────────────────────────
  if (notFound) {
    return (
      <div style={style}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 24, color: "#fff" }}>
          学习报告
        </div>
        <div style={{
          background: "#1a1200",
          border: "1px solid #fbbf24",
          borderRadius: 8,
          padding: "20px 24px",
          marginBottom: 24,
          color: "#fbbf24",
        }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>⚠ 学习报告尚未生成</div>
          <div style={{ fontSize: 13, color: "#d97706", lineHeight: 1.6 }}>
            学习报告由每日 Cron 流水线在 07:30 JST 自动生成。<br />
            首次报告预计在 2026-06-27 07:30 JST（约 14:00–15:00 CST）后可用。<br />
            也可手动运行：<code style={{ background: "#111", padding: "2px 6px", borderRadius: 4 }}>npm run learning:report</code>
          </div>
        </div>
        <div style={{ color: "#475569", fontSize: 12 }}>
          上次检查：{lastRefresh?.toLocaleTimeString("zh-CN")} · 每 60 秒自动重试
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (error || !report) {
    return (
      <div style={style}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 24, color: "#fff" }}>学习报告</div>
        <div style={{ color: "#f87171" }}>错误：{error ?? "未知错误"}</div>
      </div>
    );
  }

  // ── Report ───────────────────────────────────────────────────────────────────
  const { dataIntegrity, dataReadiness, backtestSummary, regressionDetection, recommendations } = report;

  const th: React.CSSProperties = {
    padding: "6px 12px",
    textAlign: "left",
    color: "#64748b",
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    borderBottom: "1px solid #1e293b",
    whiteSpace: "nowrap",
  };
  const td: React.CSSProperties = {
    padding: "6px 12px",
    fontSize: 13,
    borderBottom: "1px solid #0f172a",
  };

  return (
    <div style={style}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>学习报告</div>
        <div style={{ fontSize: 12, color: "#475569" }}>
          {report.reportDate} · {report.engineVersion} · {report.reportVersion}
        </div>
        <div style={{ marginLeft: "auto", fontSize: 12, color: "#475569" }}>
          生成于 {new Date(report.generatedAt).toLocaleString("zh-CN")} ·
          刷新 {lastRefresh?.toLocaleTimeString("zh-CN")}
        </div>
      </div>

      {/* Section 1: Integrity Score */}
      <div style={{ background: "#0f172a", borderRadius: 8, padding: "16px 20px", marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10, fontWeight: 600, textTransform: "uppercase" }}>
          数据完整性评分
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ fontSize: 36, fontWeight: 700, color: gradeColor(dataIntegrity.grade) }}>
            {dataIntegrity.score}<span style={{ fontSize: 16, color: "#64748b" }}>/100</span>
          </div>
          <div style={{
            background: dataIntegrity.grade === "GREEN" ? "#052e16" : (dataIntegrity.grade === "YELLOW" || dataIntegrity.grade === "WARNING") ? "#1a1200" : "#1a0000",
            border: `1px solid ${gradeColor(dataIntegrity.grade)}`,
            borderRadius: 6,
            padding: "4px 12px",
            color: gradeColor(dataIntegrity.grade),
            fontSize: 12,
            fontWeight: 700,
          }}>
            {dataIntegrity.grade}
          </div>
          {Object.entries(dataIntegrity.components ?? {}).map(([k, v]) => (
            <div key={k} style={{ fontSize: 12, color: "#64748b" }}>
              {k}: <span style={{ color: "#94a3b8" }}>
                {typeof v === "number" ? v : (v as ComponentDetail)?.score ?? "—"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Section 2: Backtest Summary — 9 Horizon Matrix */}
      <div style={{ background: "#0f172a", borderRadius: 8, padding: "16px 20px", marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12, fontWeight: 600, textTransform: "uppercase" }}>
          回测摘要 — 9 Horizons（BacktestPositionResult · schema-v2.3）
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <th style={th}>Horizon</th>
                <th style={{ ...th, textAlign: "right" }}>状态</th>
                <th style={{ ...th, textAlign: "right" }}>样本</th>
                <th style={{ ...th, textAlign: "right" }}>已填</th>
                <th style={{ ...th, textAlign: "right" }}>填充率</th>
                <th style={{ ...th, textAlign: "right" }}>胜率</th>
                <th style={{ ...th, textAlign: "right" }}>平均收益</th>
                <th style={{ ...th, textAlign: "right" }}>中位收益</th>
                <th style={{ ...th, textAlign: "right" }}>Alpha</th>
                <th style={{ ...th, textAlign: "right" }}>最大</th>
                <th style={{ ...th, textAlign: "right" }}>最小</th>
              </tr>
            </thead>
            <tbody>
              {ALL_HORIZONS.map(h => {
                const row = backtestSummary.find(r => r.horizon === h);
                if (!row) return (
                  <tr key={h}>
                    <td style={td}>{h}</td>
                    <td style={{ ...td, textAlign: "right", color: "#475569" }}>待机</td>
                    <td colSpan={9} style={{ ...td, color: "#475569", textAlign: "right" }}>暂无数据</td>
                  </tr>
                );
                const isPending = row.status === "PENDING" || row.filledCount === 0;
                return (
                  <tr key={h} style={{ opacity: isPending ? 0.5 : 1 }}>
                    <td style={{ ...td, fontWeight: 600, color: "#e2e8f0" }}>{h}</td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <span style={{ color: statusColor(row.status), fontSize: 11, fontWeight: 700 }}>
                        {statusLabel(row.status)}
                      </span>
                    </td>
                    <td style={{ ...td, textAlign: "right", color: "#94a3b8" }}>{row.sampleCount.toLocaleString()}</td>
                    <td style={{ ...td, textAlign: "right", color: "#94a3b8" }}>{row.filledCount.toLocaleString()}</td>
                    <td style={{ ...td, textAlign: "right" }}>{fmtPct(row.fillRate)}</td>
                    <td style={{ ...td, textAlign: "right", color: isPending ? "#475569" : row.winRate && row.winRate >= 50 ? "#4ade80" : "#f87171" }}>
                      {isPending ? "待数据" : fmtPct(row.winRate)}
                    </td>
                    <td style={{ ...td, textAlign: "right", color: isPending ? "#475569" : row.avgReturn && row.avgReturn > 0 ? "#4ade80" : "#f87171" }}>
                      {isPending ? "待数据" : fmt(row.avgReturn, 2, "%")}
                    </td>
                    <td style={{ ...td, textAlign: "right", color: "#94a3b8" }}>
                      {isPending ? "—" : fmt(row.medianReturn, 2, "%")}
                    </td>
                    <td style={{ ...td, textAlign: "right", color: isPending ? "#475569" : row.alpha && row.alpha > 0 ? "#4ade80" : "#f87171" }}>
                      {isPending ? "待数据" : fmt(row.alpha, 2, "%")}
                    </td>
                    <td style={{ ...td, textAlign: "right", color: "#4ade80" }}>{isPending ? "—" : fmt(row.bestReturn, 2, "%")}</td>
                    <td style={{ ...td, textAlign: "right", color: "#f87171" }}>{isPending ? "—" : fmt(row.worstReturn, 2, "%")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Data pending explanation */}
        {backtestSummary.some(r => r.status === "PENDING" || r.filledCount === 0) && (
          <div style={{ marginTop: 12, padding: "10px 14px", background: "#0a0a0a", borderRadius: 6, fontSize: 12, color: "#64748b" }}>
            <strong style={{ color: "#94a3b8" }}>数据状态说明：</strong>
            「待数据」= 持仓建仓于 2026-06-26，等待 DailyPrice 收盘数据填充。
            30d 预计可用：{dataReadiness.expectedFillDates?.["30d"] ?? "—"} ·
            90d 预计可用：{dataReadiness.expectedFillDates?.["90d"] ?? "—"}
          </div>
        )}
      </div>

      {/* Section 3: Data Readiness */}
      <div style={{ background: "#0f172a", borderRadius: 8, padding: "16px 20px", marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12, fontWeight: 600, textTransform: "uppercase" }}>
          数据就绪度
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {ALL_HORIZONS.map(h => {
            const filled = dataReadiness.filledCounts?.[h] ?? 0;
            const total  = dataReadiness.sampleCounts?.[h] ?? 0;
            const ready  = dataReadiness.availableHorizons.includes(h);
            return (
              <div key={h} style={{
                background: ready ? "#052e16" : "#0f172a",
                border: `1px solid ${ready ? "#4ade80" : "#1e293b"}`,
                borderRadius: 6,
                padding: "8px 14px",
                textAlign: "center",
                minWidth: 80,
              }}>
                <div style={{ color: ready ? "#4ade80" : "#475569", fontWeight: 700, fontSize: 14 }}>{h}</div>
                <div style={{ color: "#64748b", fontSize: 11, marginTop: 2 }}>
                  {filled}/{total}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 12, color: "#64748b" }}>
          30d 成熟日期：<span style={{ color: "#94a3b8" }}>{dataReadiness.expectedFillDates?.["30d"] ?? "—"}</span>
          &nbsp;·&nbsp;
          90d 成熟日期：<span style={{ color: "#94a3b8" }}>{dataReadiness.expectedFillDates?.["90d"] ?? "—"}</span>
        </div>
      </div>

      {/* Section 4: Feature Coverage */}
      {(() => {
        const fc = dataReadiness.featureCoverage;
        if (!fc) return null;
        const TOTAL_FEAT = 30;
        const coveredFields = featFields.filter(f => f.coveragePct > 0).length;
        const isZero = fc.overallPct === 0 && fc.totalRows > 0;
        return (
          <div style={{ background: "#0f172a", borderRadius: 8, padding: "16px 20px", marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10, fontWeight: 600, textTransform: "uppercase" }}>
              特征覆盖率（feat_* · {TOTAL_FEAT} 字段）
            </div>

            {/* WARNING banner */}
            {isZero && (
              <div style={{
                background: "#1a1200",
                border: "1px solid #fbbf24",
                borderRadius: 6,
                padding: "8px 14px",
                marginBottom: 12,
                fontSize: 12,
                color: "#fbbf24",
              }}>
                ⚠ WARNING — feat_* 覆盖率 0%：现有 {fc.totalRows} 行均创建于 Step 2 部署前（2026-06-26），下次 cron 运行后新 DR 行开始填充。
                {fc.note && <span style={{ color: "#d97706", marginLeft: 6 }}>{fc.note}</span>}
              </div>
            )}

            {/* Summary stats */}
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 14 }}>
              {[
                ["总 DR 行数", fc.totalRows.toLocaleString()],
                ["字段总数", TOTAL_FEAT],
                ["已覆盖字段", featFields.length > 0 ? coveredFields : "—"],
                ["整体覆盖率", `${fc.overallPct}%`],
                ["最新日期", fc.latestDate ?? "—"],
              ].map(([label, val]) => (
                <div key={String(label)}>
                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>{label}</div>
                  <div style={{
                    fontSize: 20,
                    fontWeight: 700,
                    color: label === "整体覆盖率" && fc.overallPct === 0 ? "#fbbf24" : "#e2e8f0",
                  }}>{val}</div>
                </div>
              ))}
            </div>

            {/* Per-field breakdown */}
            {featFields.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {featFields.map(f => {
                  const covered = f.coveragePct > 0;
                  return (
                    <div key={f.field} style={{
                      background: covered ? "#052e16" : "#1e1e1e",
                      border: `1px solid ${covered ? "#4ade80" : "#334155"}`,
                      borderRadius: 4,
                      padding: "3px 8px",
                      fontSize: 11,
                      color: covered ? "#4ade80" : "#475569",
                      fontFamily: "monospace",
                    }}>
                      {f.field.replace("feat_", "")}
                      <span style={{ marginLeft: 4, color: covered ? "#86efac" : "#334155" }}>
                        {f.coveragePct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "#475569" }}>加载字段明细中…</div>
            )}
          </div>
        );
      })()}

      {/* Section 5: Regression Detection */}
      <div style={{ background: "#0f172a", borderRadius: 8, padding: "16px 20px", marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10, fontWeight: 600, textTransform: "uppercase" }}>
          回归检测
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{
            background: "#0a0a0a",
            border: `1px solid ${regColor(regressionDetection.status)}`,
            color: regColor(regressionDetection.status),
            borderRadius: 6,
            padding: "4px 14px",
            fontSize: 12,
            fontWeight: 700,
          }}>
            {regressionDetection.status}
          </span>
          {regressionDetection.delta !== null && (
            <span style={{ fontSize: 13, color: "#94a3b8" }}>
              7d WinRate delta: {regressionDetection.delta > 0 ? "+" : ""}{regressionDetection.delta?.toFixed(1)}pp
            </span>
          )}
          {regressionDetection.status === "INSUFFICIENT_DATA" && (
            <span style={{ fontSize: 12, color: "#475569" }}>
              需要 ≥2 个相同 schemaVersion 的 VersionSnapshot（当前仅 1 个：20260626-v7.7）
            </span>
          )}
        </div>
      </div>

      {/* Section 6: Recommendations */}
      {recommendations.length > 0 && (
        <div style={{ background: "#0f172a", borderRadius: 8, padding: "16px 20px", marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10, fontWeight: 600, textTransform: "uppercase" }}>
            建议事项
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {recommendations.map((rec, i) => (
              <li key={i} style={{
                fontSize: 13,
                color: rec.startsWith("CRITICAL") ? "#f87171" : rec.startsWith("WARNING") ? "#fbbf24" : "#94a3b8",
                padding: "4px 0",
                borderBottom: i < recommendations.length - 1 ? "1px solid #0f172a" : "none",
              }}>
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ fontSize: 11, color: "#334155", marginTop: 8 }}>
        数据来源：BacktestPositionResult（不可变）· VersionSnapshot · pipeline-runs.jsonl ·
        reports/ 目录快照 · 不读 StockScore（可变表）
      </div>
    </div>
  );
}
