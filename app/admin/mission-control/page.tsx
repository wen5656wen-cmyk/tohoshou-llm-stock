"use client";

import { useEffect, useState, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type StageStatus = "SUCCESS" | "FAILED" | "NEVER_RUN";
type FreshnessStatus = "FRESH" | "STALE" | "CRITICAL";
type Grade = "GREEN" | "YELLOW" | "RED";

interface PipelineStage {
  stage: string;
  displayName: string;
  schedule: string;
  status: StageStatus;
  isDryRun: boolean;
  duration: string | null;
  durationMs: number | null;
  lastRunAt: string | null;
  lastRunJst: string | null;
  errorMessage: string | null;
  prodStatus: StageStatus;
  prodLastRunAt: string | null;
}

interface FreshnessSource {
  name: string;
  latestDate: string | null;
  days: number | null;
  status: FreshnessStatus;
}

interface FieldStat {
  field: string;
  nonNullCount: number;
  coveragePct: number;
}

interface HorizonSummary {
  horizon: string;
  sampleCount: number;
  filledCount: number;
  winRate: number | null;
  avgReturn: number | null;
  alpha: number | null;
}

interface MissionControlData {
  pipeline: {
    stages: PipelineStage[];
    totalRuns: number;
    productionRuns: number;
    dryRunCount: number;
    includeDryRun: boolean;
  };
  freshness: {
    sources: FreshnessSource[];
    latestRecCount: number;
  };
  featureCoverage: {
    totalRows: number;
    latestDate: string | null;
    overallCoveragePct: number;
    fields: FieldStat[];
    topMissing: string[];
  };
  version: {
    schemaVersion: string | null;
    modelVersion: string | null;
    scoreVersion: string | null;
    versionSnapshotId: string | null;
    pipelineRunId: string | null;
    activeExperiment: string | null;
  };
  backtest: {
    horizons: HorizonSummary[];
    lastComputedAt: string | null;
  };
  healthScore: {
    score: number;
    grade: Grade;
    components: {
      dataFreshness: number;
      pipelineStatus: number;
      featureCoverage: number;
      healthGuard: number;
    };
    detail: {
      healthGuardStatus: string;
      healthGuardCritical: number | null;
      healthGuardWarning: number | null;
      healthGuardAgeHours: number | null;
    };
  };
  computedAt: string;
}

// ── Style helpers ─────────────────────────────────────────────────────────────

const stageColor: Record<StageStatus, string> = {
  SUCCESS:   "#22c55e",
  FAILED:    "#ef4444",
  NEVER_RUN: "#6b7280",
};
const stageLabel: Record<StageStatus, string> = {
  SUCCESS:   "✅ SUCCESS",
  FAILED:    "❌ FAILED",
  NEVER_RUN: "— no data",
};

const freshnessColor: Record<FreshnessStatus, string> = {
  FRESH:    "#22c55e",
  STALE:    "#f59e0b",
  CRITICAL: "#ef4444",
};

const gradeColor: Record<Grade, string> = {
  GREEN:  "#22c55e",
  YELLOW: "#f59e0b",
  RED:    "#ef4444",
};
const gradeLabel: Record<Grade, string> = {
  GREEN:  "SYSTEM HEALTHY",
  YELLOW: "ATTENTION NEEDED",
  RED:    "ACTION REQUIRED",
};

const cell: React.CSSProperties = {
  padding: "6px 10px",
  borderBottom: "1px solid #333",
  verticalAlign: "top",
  fontSize: 13,
  fontFamily: "monospace",
};

const th: React.CSSProperties = {
  ...cell,
  background: "#1a1a1a",
  color: "#888",
  fontWeight: 600,
  textTransform: "uppercase",
  fontSize: 11,
  letterSpacing: "0.05em",
};

const sectionTitle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#888",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom: 6,
  paddingBottom: 4,
  borderBottom: "1px solid #333",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  background: "#111",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function MissionControlPage() {
  const [data, setData] = useState<MissionControlData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [showDryRun, setShowDryRun] = useState(false);

  const load = useCallback(async (dryRun = false) => {
    try {
      const url = dryRun
        ? "/api/admin/mission-control?includeDryRun=true"
        : "/api/admin/mission-control";
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setLastRefresh(new Date());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(showDryRun);
    const id = setInterval(() => load(showDryRun), 60_000);
    return () => clearInterval(id);
  }, [load, showDryRun]);

  if (loading) return <div style={{ color: "#888", padding: 24, fontFamily: "monospace" }}>Loading mission control…</div>;
  if (error)   return <div style={{ color: "#ef4444", padding: 24, fontFamily: "monospace" }}>Error: {error}</div>;
  if (!data)   return null;

  const { pipeline, freshness, featureCoverage, version, backtest, healthScore } = data;

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", color: "#e5e5e5", padding: "16px 20px", fontFamily: "monospace" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 20, paddingBottom: 12, borderBottom: "1px solid #222" }}>
        <div>
          <span style={{ fontSize: 36, fontWeight: 800, color: gradeColor[healthScore.grade] }}>
            {healthScore.score}
          </span>
          <span style={{ fontSize: 18, color: "#666" }}>/100</span>
          <span style={{
            marginLeft: 12, padding: "3px 10px", borderRadius: 4,
            background: gradeColor[healthScore.grade] + "22",
            color: gradeColor[healthScore.grade],
            fontSize: 13, fontWeight: 700,
          }}>
            {gradeLabel[healthScore.grade]}
          </span>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right", fontSize: 11, color: "#555" }}>
          <div>TOHOSHOU AI Mission Control</div>
          <div>Last refresh: {lastRefresh?.toLocaleTimeString("ja-JP")} · auto every 60s</div>
          <button onClick={() => load(showDryRun)} style={{ marginTop: 4, padding: "2px 8px", fontSize: 11, cursor: "pointer", background: "#222", color: "#aaa", border: "1px solid #444", borderRadius: 3 }}>
            ↺ Refresh
          </button>
        </div>
      </div>

      {/* ── Score breakdown ── */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, fontSize: 12 }}>
        {[
          ["Data Freshness",   healthScore.components.dataFreshness,   25],
          ["Pipeline Status",  healthScore.components.pipelineStatus,  25],
          ["Feature Coverage", healthScore.components.featureCoverage, 25],
          ["Health Guard",     healthScore.components.healthGuard,     25],
        ].map(([label, score, max]) => (
          <div key={String(label)} style={{ flex: 1, background: "#111", border: "1px solid #222", borderRadius: 4, padding: "8px 10px" }}>
            <div style={{ color: "#666", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: Number(score) >= Number(max) * 0.75 ? "#22c55e" : Number(score) >= Number(max) * 0.5 ? "#f59e0b" : "#ef4444" }}>
              {score}<span style={{ fontSize: 11, color: "#444" }}>/{max}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Row 1: Pipeline + Freshness ── */}
      <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 16, marginBottom: 16 }}>

        {/* Pipeline Status */}
        <div>
          <div style={{ ...sectionTitle, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>
              Pipeline Status
              <span style={{ color: "#444", fontWeight: 400 }}>
                {" "}({pipeline.productionRuns} prod · {pipeline.dryRunCount} dry-run)
              </span>
            </span>
            {pipeline.dryRunCount > 0 && (
              <button
                onClick={() => setShowDryRun(v => !v)}
                style={{
                  fontSize: 10,
                  padding: "2px 8px",
                  cursor: "pointer",
                  background: showDryRun ? "#1a3a1a" : "#1a1a1a",
                  color: showDryRun ? "#22c55e" : "#666",
                  border: `1px solid ${showDryRun ? "#22c55e" : "#444"}`,
                  borderRadius: 3,
                  fontFamily: "monospace",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {showDryRun ? "✓ Dry-Run ON" : "Show Dry-Run"}
              </button>
            )}
          </div>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={th}>Stage</th>
                <th style={th}>Schedule</th>
                <th style={th}>Status</th>
                <th style={th}>Duration</th>
                <th style={th}>Last Run (JST)</th>
              </tr>
            </thead>
            <tbody>
              {pipeline.stages.map(s => (
                <tr key={s.stage} style={{ opacity: s.isDryRun && showDryRun ? 0.8 : 1 }}>
                  <td style={cell}>
                    {s.displayName}
                    {s.isDryRun && showDryRun && (
                      <span style={{
                        marginLeft: 6,
                        fontSize: 9,
                        padding: "1px 5px",
                        background: "#0d2d0d",
                        color: "#4ade80",
                        border: "1px solid #166534",
                        borderRadius: 3,
                        fontWeight: 700,
                        letterSpacing: "0.04em",
                      }}>
                        DRY
                      </span>
                    )}
                  </td>
                  <td style={{ ...cell, color: "#555" }}>{s.schedule}</td>
                  <td style={{ ...cell, color: stageColor[s.status] }}>{stageLabel[s.status]}</td>
                  <td style={{ ...cell, color: "#aaa" }}>{s.duration ?? "—"}</td>
                  <td style={{ ...cell, color: "#888", fontSize: 12 }}>
                    {s.lastRunJst ?? "—"}
                    {s.errorMessage && (
                      <div style={{ color: "#ef4444", fontSize: 11, marginTop: 2 }}>
                        {s.errorMessage.slice(0, 80)}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {showDryRun && pipeline.dryRunCount > 0 && (
            <div style={{ marginTop: 6, fontSize: 10, color: "#555", padding: "4px 6px", background: "#0d1a0d", border: "1px solid #166534", borderRadius: 3 }}>
              ℹ Dry-run entries are shown for display verification only — they do NOT affect the Health Score.
            </div>
          )}
        </div>

        {/* Data Freshness */}
        <div>
          <div style={sectionTitle}>Data Freshness</div>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={th}>Source</th>
                <th style={th}>Latest Date</th>
                <th style={th}>Age</th>
              </tr>
            </thead>
            <tbody>
              {freshness.sources.map(s => (
                <tr key={s.name}>
                  <td style={cell}>{s.name}</td>
                  <td style={{ ...cell, color: s.latestDate ? "#e5e5e5" : "#555" }}>
                    {s.latestDate ?? "no data"}
                  </td>
                  <td style={{ ...cell, color: freshnessColor[s.status] }}>
                    {s.days === null ? "—" : s.days === 0 ? "today" : `${s.days}d ago`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 8, fontSize: 11, color: "#555" }}>
            Latest DR: {freshness.latestRecCount} rows
          </div>
        </div>
      </div>

      {/* ── Row 2: Feature Coverage + Version ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>

        {/* Feature Coverage */}
        <div>
          <div style={sectionTitle}>
            Feature Coverage (feat_* — Step 2 Health)
          </div>
          <div style={{ background: "#111", border: "1px solid #222", borderRadius: 4, padding: "10px 12px" }}>
            <div style={{ display: "flex", gap: 20, marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase" }}>Total Rows</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{featureCoverage.totalRows.toLocaleString()}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase" }}>Coverage</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: featureCoverage.overallCoveragePct >= 80 ? "#22c55e" : featureCoverage.overallCoveragePct >= 30 ? "#f59e0b" : "#ef4444" }}>
                  {featureCoverage.overallCoveragePct}%
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase" }}>Date</div>
                <div style={{ fontSize: 13, color: "#888" }}>{featureCoverage.latestDate ?? "—"}</div>
              </div>
            </div>

            {featureCoverage.overallCoveragePct === 0 && featureCoverage.totalRows > 0 && (
              <div style={{ padding: "6px 8px", background: "#1a0a00", border: "1px solid #5a3a00", borderRadius: 3, fontSize: 11, color: "#f59e0b", marginBottom: 8 }}>
                ⚠ feat_* = 0% — rows were created before Step 2 deployment. First populated batch: next cron run.
              </div>
            )}

            {featureCoverage.topMissing.length > 0 && featureCoverage.overallCoveragePct > 0 && (
              <div>
                <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", marginBottom: 4 }}>Top Missing Fields</div>
                {featureCoverage.topMissing.map(f => (
                  <div key={f} style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>{f}</div>
                ))}
              </div>
            )}

            {/* Coverage bar per field */}
            {featureCoverage.overallCoveragePct > 0 && featureCoverage.fields.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", marginBottom: 6 }}>Field Coverage</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
                  {featureCoverage.fields.map(f => (
                    <div key={f.field} style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 4 }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: f.coveragePct >= 90 ? "#22c55e" : f.coveragePct >= 50 ? "#f59e0b" : "#ef4444", flexShrink: 0 }} />
                      <span style={{ color: "#666", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {f.field.replace("feat_", "")}
                      </span>
                      <span style={{ color: "#444", marginLeft: "auto" }}>{f.coveragePct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Version Status */}
        <div>
          <div style={sectionTitle}>Version Status</div>
          <div style={{ background: "#111", border: "1px solid #222", borderRadius: 4, padding: "10px 12px" }}>
            {[
              ["schemaVersion",     version.schemaVersion],
              ["modelVersion",      version.modelVersion],
              ["scoreVersion",      version.scoreVersion],
              ["versionSnapshotId", version.versionSnapshotId],
              ["pipelineRunId",     version.pipelineRunId],
            ].map(([key, val]) => (
              <div key={key} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid #1a1a1a" }}>
                <span style={{ color: "#555", fontSize: 12 }}>{key}</span>
                <span style={{ color: val ? "#e5e5e5" : "#444", fontSize: 12 }}>{val ?? "—"}</span>
              </div>
            ))}
            <div style={{ marginTop: 4 }}>
              <span style={{ color: "#555", fontSize: 12 }}>Experiment</span>
              <div style={{ color: version.activeExperiment ? "#f59e0b" : "#444", fontSize: 11, marginTop: 2 }}>
                {version.activeExperiment ?? "none active"}
              </div>
            </div>

            <div style={{ marginTop: 12, paddingTop: 8, borderTop: "1px solid #1a1a1a" }}>
              <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", marginBottom: 4 }}>Health Guard</div>
              <div style={{ fontSize: 12 }}>
                <span style={{
                  color: healthScore.detail.healthGuardStatus === "PASS" ? "#22c55e"
                       : healthScore.detail.healthGuardStatus === "WARNING" ? "#f59e0b"
                       : "#ef4444"
                }}>
                  {healthScore.detail.healthGuardStatus}
                </span>
                {healthScore.detail.healthGuardCritical !== null && (
                  <span style={{ color: "#555", marginLeft: 8, fontSize: 11 }}>
                    CRITICAL={healthScore.detail.healthGuardCritical} WARN={healthScore.detail.healthGuardWarning}
                    {healthScore.detail.healthGuardAgeHours !== null && ` (${healthScore.detail.healthGuardAgeHours}h ago)`}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Backtest Summary ── */}
      <div>
        <div style={sectionTitle}>
          Backtest Summary (BacktestPositionResult v2.3)
          {backtest.lastComputedAt && <span style={{ color: "#444", fontWeight: 400 }}> · last computed {backtest.lastComputedAt}</span>}
        </div>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={th}>Horizon</th>
              <th style={th}>Samples</th>
              <th style={th}>Filled</th>
              <th style={th}>Win Rate</th>
              <th style={th}>Avg Return</th>
              <th style={th}>Alpha vs TOPIX</th>
            </tr>
          </thead>
          <tbody>
            {backtest.horizons.map(h => (
              <tr key={h.horizon}>
                <td style={{ ...cell, fontWeight: 700, color: "#aaa" }}>{h.horizon}</td>
                <td style={cell}>{h.sampleCount.toLocaleString()}</td>
                <td style={{ ...cell, color: "#888" }}>{h.filledCount.toLocaleString()}</td>
                <td style={{ ...cell, color: h.winRate !== null ? (h.winRate >= 50 ? "#22c55e" : "#f59e0b") : "#555" }}>
                  {h.winRate !== null ? `${h.winRate}%` : "—"}
                </td>
                <td style={{ ...cell, color: h.avgReturn !== null ? (h.avgReturn >= 0 ? "#22c55e" : "#ef4444") : "#555" }}>
                  {h.avgReturn !== null ? `${h.avgReturn >= 0 ? "+" : ""}${h.avgReturn}%` : "—"}
                </td>
                <td style={{ ...cell, color: h.alpha !== null ? (h.alpha >= 0 ? "#22c55e" : "#ef4444") : "#555" }}>
                  {h.alpha !== null ? `${h.alpha >= 0 ? "+" : ""}${h.alpha}%` : "—"}
                </td>
              </tr>
            ))}
            {backtest.horizons.every(h => h.sampleCount === 0) && (
              <tr>
                <td colSpan={6} style={{ ...cell, color: "#555", textAlign: "center" }}>
                  No backtest data yet — runs automatically after market close
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 16, fontSize: 10, color: "#333", textAlign: "right" }}>
        Computed at {data.computedAt}
      </div>
    </div>
  );
}
