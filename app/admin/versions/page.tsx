"use client";

import { useEffect, useState, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type VersionRole = "current" | "baseline" | "legacy";

type VersionEntry = {
  id: string;
  modelVersion: string;
  scoreVersion: string;
  schemaVersion: string;
  ruleEngineVer: string;
  scoringSchemaVer: string;
  llmModelVer: string;
  startDate: string;
  endDate: string | null;
  isBaseline: boolean;
  changeLog: string | null;
  experimentId: string | null;
  createdAt: string;
  role: VersionRole;
  drLinked: number;
  bpLinked: number;
  learningReportExists: boolean;
};

type Integrity = {
  drTotal: number;
  drLinked: number;
  drMissingCount: number;
  drCoveragePct: number;
  bpTotal: number;
  bpLinked: number;
  bpMissingCount: number;
  bpCoveragePct: number;
  status: "OK" | "WARNING" | "CRITICAL";
};

type HorizonRow = {
  horizon: string;
  sampleCount: number;
  filledCount: number;
  winCount: number;
  avgReturn: number | null;
  avgAlpha: number | null;
  winRate: number | null;
};

type CompareResult = {
  versionA: { id: string; schemaVersion: string; modelVersion: string; startDate: string };
  versionB: { id: string; schemaVersion: string; modelVersion: string; startDate: string };
  comparisonAllowed: boolean;
  reason: string | null;
  tradingDaysA: number;
  tradingDaysB: number;
  featureCoverageA: number | null;
  featureCoverageB: number | null;
  backtestA: HorizonRow[];
  backtestB: HorizonRow[];
  backtestDelta: Array<{ horizon: string; winRateDelta: number | null; returnDelta: number | null; alphaDelta: number | null }> | null;
  winRateDelta7d: number | null;
  regressionStatus: string;
};

type TimelineEntry =
  | { type: "VERSION";    date: string; id: string; schemaVersion: string; modelVersion: string; role: string; tradingDays: number; sampleCount: number; learningReportExists: boolean; regressionStatus: string | null; changeLog: string | null; isBaseline: boolean }
  | { type: "EXPERIMENT"; date: string; id: string; status: string; hypothesis: string; decision: string | null; versionSnapshotId: string | null }
  | { type: "DEPLOYMENT"; date: string; id: number; commitHash: string; summary: string; buildStatus: string; healthStatus: string; productionReady: boolean };

// ── Style helpers ─────────────────────────────────────────────────────────────

const S = {
  bg:      "#0a0a0a",
  surface: "#111",
  border:  "#222",
  muted:   "#666",
  text:    "#ddd",
  green:   "#22c55e",
  yellow:  "#eab308",
  red:     "#ef4444",
  blue:    "#3b82f6",
  orange:  "#f97316",
  purple:  "#a855f7",
};

function roleBadge(role: VersionRole) {
  const cfg: Record<VersionRole, { bg: string; label: string }> = {
    current:  { bg: S.green,  label: "当前"  },
    baseline: { bg: S.blue,   label: "基准" },
    legacy:   { bg: S.muted,  label: "历史"   },
  };
  const c = cfg[role] ?? cfg.legacy;
  return (
    <span style={{ background: c.bg, color: "#000", fontWeight: 700, fontSize: 10, padding: "1px 5px", borderRadius: 3 }}>
      {c.label}
    </span>
  );
}

function integrityStatus(pct: number, missing: number) {
  if (missing === 0) return <span style={{ color: S.green }}>✅ {pct}%</span>;
  if (pct >= 50)    return <span style={{ color: S.yellow }}>⚠ {pct}% ({missing} 条缺失)</span>;
  return <span style={{ color: S.red }}>❌ {pct}% ({missing} 条缺失)</span>;
}

function regColor(status: string | null) {
  if (!status) return S.muted;
  if (status === "OK")    return S.green;
  if (status === "WARNING") return S.yellow;
  if (status === "CRITICAL") return S.red;
  return S.muted;
}

function deltaColor(v: number | null) {
  if (v === null) return S.muted;
  if (v > 0)  return S.green;
  if (v < -5) return S.red;
  if (v < 0)  return S.yellow;
  return S.text;
}

function fmt(v: number | null, suffix = "") {
  if (v === null) return <span style={{ color: S.muted }}>—</span>;
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}${suffix}`;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function VersionsPage() {
  const [versions,   setVersions]   = useState<VersionEntry[]>([]);
  const [integrity,  setIntegrity]  = useState<Integrity | null>(null);
  const [timeline,   setTimeline]   = useState<TimelineEntry[]>([]);
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [compareA,   setCompareA]   = useState("");
  const [compareB,   setCompareB]   = useState("");
  const [comparing,  setComparing]  = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [activeTab,  setActiveTab]  = useState<"versions" | "timeline" | "compare" | "integrity">("versions");
  const [now,        setNow]        = useState("");

  const loadAll = useCallback(async () => {
    try {
      const [vRes, tRes] = await Promise.all([
        fetch("/api/admin/versions"),
        fetch("/api/admin/version-timeline"),
      ]);
      const vData = await vRes.json();
      const tData = await tRes.json();
      setVersions(vData.versions ?? []);
      setIntegrity(vData.integrity ?? null);
      setTimeline(tData.timeline ?? []);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
    setNow(new Date().toISOString().slice(0, 19).replace("T", " ") + " UTC");
  }, []);

  useEffect(() => {
    loadAll();
    const id = setInterval(loadAll, 60_000);
    return () => clearInterval(id);
  }, [loadAll]);

  // Pre-fill compare selects with current + baseline
  useEffect(() => {
    if (versions.length >= 2 && !compareA && !compareB) {
      const cur  = versions.find((v) => v.role === "current");
      const base = versions.find((v) => v.role === "baseline");
      if (cur)  setCompareA(cur.id);
      if (base) setCompareB(base.id);
    }
  }, [versions, compareA, compareB]);

  const runCompare = useCallback(async () => {
    if (!compareA || !compareB) return;
    setComparing(true);
    try {
      const res = await fetch(`/api/admin/versions/compare?a=${encodeURIComponent(compareA)}&b=${encodeURIComponent(compareB)}`);
      setCompareResult(await res.json());
    } finally {
      setComparing(false);
    }
  }, [compareA, compareB]);

  const mono: React.CSSProperties = { fontFamily: "monospace", fontSize: 12 };
  const cell: React.CSSProperties = { padding: "6px 10px", borderBottom: `1px solid ${S.border}`, ...mono, verticalAlign: "top" };

  return (
    <div style={{ background: S.bg, minHeight: "100vh", color: S.text, ...mono, padding: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>版本中心</h1>
          <div style={{ color: S.muted, fontSize: 11, marginTop: 2 }}>
            {versions.length} 个快照 · 刷新于 {now}
          </div>
        </div>
        <a href="/admin/mission-control" style={{ color: S.blue, fontSize: 11, textDecoration: "none" }}>
          ← 控制中心
        </a>
      </div>

      {error && (
        <div style={{ background: "#1a0000", border: `1px solid ${S.red}`, padding: 8, marginBottom: 12, color: S.red, fontSize: 12 }}>
          错误：{error}
        </div>
      )}

      {/* Integrity banner */}
      {integrity && integrity.status !== "OK" && (
        <div style={{
          background: integrity.status === "CRITICAL" ? "#1a0000" : "#1a1200",
          border: `1px solid ${integrity.status === "CRITICAL" ? S.red : S.yellow}`,
          padding: "8px 12px", marginBottom: 12, fontSize: 12,
        }}>
          <strong style={{ color: integrity.status === "CRITICAL" ? S.red : S.yellow }}>
            {integrity.status === "CRITICAL" ? "❌ 完整性严重异常" : "⚠ 完整性警告"}
          </strong>
          {" · "}
          DR：{integrity.drMissingCount} 条未关联（已关联 {integrity.drCoveragePct}%）
          {" · "}
          BP：{integrity.bpMissingCount} 条未关联（已关联 {integrity.bpCoveragePct}%）
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {(["versions", "timeline", "compare", "integrity"] as const).map((t) => {
          const tabLabel: Record<string, string> = { versions: "快照", timeline: "时间线", compare: "对比", integrity: "完整性" };
          return (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            style={{
              background: activeTab === t ? "#333" : "transparent",
              border: `1px solid ${activeTab === t ? "#555" : S.border}`,
              color: activeTab === t ? S.text : S.muted,
              padding: "4px 12px", cursor: "pointer", ...mono, borderRadius: 3,
            }}
          >
            {tabLabel[t] ?? t.toUpperCase()}
          </button>
          );
        })}
      </div>

      {/* ── VERSIONS TAB ─────────────────────────────────────────────────── */}
      {activeTab === "versions" && (
        <table style={{ width: "100%", borderCollapse: "collapse", border: `1px solid ${S.border}` }}>
          <thead>
            <tr style={{ background: "#181818", fontSize: 11, color: S.muted }}>
              {["状态","ID","schemaVersion","modelVersion","scoreVersion","llmModel","开始日期","结束日期","DR 关联","BP 关联","报告","变更日志"].map((h) => (
                <th key={h} style={{ ...cell, textAlign: "left", fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.id} style={{ background: v.role === "current" ? "#0a1a0a" : "transparent" }}>
                <td style={cell}>{roleBadge(v.role)}</td>
                <td style={{ ...cell, color: S.blue, fontWeight: 600 }}>{v.id}</td>
                <td style={cell}>{v.schemaVersion}</td>
                <td style={cell}>{v.modelVersion}</td>
                <td style={cell}>{v.scoreVersion}</td>
                <td style={cell}>{v.llmModelVer}</td>
                <td style={cell}>{v.startDate}</td>
                <td style={{ ...cell, color: v.endDate ? S.muted : S.green }}>{v.endDate ?? "进行中"}</td>
                <td style={cell}>
                  {v.drLinked > 0
                    ? <span style={{ color: S.green }}>{v.drLinked.toLocaleString()}</span>
                    : <span style={{ color: S.yellow }}>0</span>}
                </td>
                <td style={cell}>
                  {v.bpLinked > 0
                    ? <span style={{ color: S.green }}>{v.bpLinked.toLocaleString()}</span>
                    : <span style={{ color: S.yellow }}>0</span>}
                </td>
                <td style={cell}>
                  {v.learningReportExists
                    ? <span style={{ color: S.green }}>✓</span>
                    : <span style={{ color: S.muted }}>—</span>}
                </td>
                <td style={{ ...cell, maxWidth: 240, color: S.muted, whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 11 }}>
                  {v.changeLog ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ── TIMELINE TAB ─────────────────────────────────────────────────── */}
      {activeTab === "timeline" && (
        <table style={{ width: "100%", borderCollapse: "collapse", border: `1px solid ${S.border}` }}>
          <thead>
            <tr style={{ background: "#181818", fontSize: 11, color: S.muted }}>
              {["日期","类型","ID / 哈希","详情","交易日数","样本数","报告","回归"].map((h) => (
                <th key={h} style={{ ...cell, textAlign: "left", fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {timeline.map((entry, i) => {
              const typeColor = entry.type === "VERSION" ? S.purple : entry.type === "EXPERIMENT" ? S.orange : S.blue;
              return (
                <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "#0d0d0d" }}>
                  <td style={{ ...cell, color: S.muted }}>{entry.date}</td>
                  <td style={cell}><span style={{ color: typeColor, fontWeight: 700, fontSize: 11 }}>{entry.type}</span></td>
                  <td style={{ ...cell, color: S.blue }}>
                    {entry.type === "VERSION"    ? entry.id :
                     entry.type === "EXPERIMENT" ? entry.id :
                     entry.commitHash.slice(0, 7)}
                  </td>
                  <td style={{ ...cell, maxWidth: 260, fontSize: 11, color: S.muted, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {entry.type === "VERSION"    ? (entry.changeLog ?? `${entry.schemaVersion} · ${entry.modelVersion} · ${entry.role}`) :
                     entry.type === "EXPERIMENT" ? `[${entry.status}] ${entry.hypothesis.slice(0, 80)}` :
                     entry.summary.slice(0, 80)}
                  </td>
                  <td style={cell}>
                    {entry.type === "VERSION" ? entry.tradingDays : "—"}
                  </td>
                  <td style={cell}>
                    {entry.type === "VERSION" ? entry.sampleCount.toLocaleString() : "—"}
                  </td>
                  <td style={cell}>
                    {entry.type === "VERSION"
                      ? (entry.learningReportExists ? <span style={{ color: S.green }}>✓</span> : <span style={{ color: S.muted }}>—</span>)
                      : "—"}
                  </td>
                  <td style={cell}>
                    {entry.type === "VERSION"
                      ? <span style={{ color: regColor(entry.regressionStatus) }}>{entry.regressionStatus ?? "—"}</span>
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* ── COMPARE TAB ──────────────────────────────────────────────────── */}
      {activeTab === "compare" && (
        <div>
          {/* Selector */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: S.muted }}>版本 A：</label>
            <select
              value={compareA}
              onChange={(e) => setCompareA(e.target.value)}
              style={{ background: S.surface, color: S.text, border: `1px solid ${S.border}`, padding: "4px 8px", ...mono }}
            >
              <option value="">— 选择 —</option>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>{v.id} [{v.role}]</option>
              ))}
            </select>
            <label style={{ fontSize: 11, color: S.muted }}>vs</label>
            <select
              value={compareB}
              onChange={(e) => setCompareB(e.target.value)}
              style={{ background: S.surface, color: S.text, border: `1px solid ${S.border}`, padding: "4px 8px", ...mono }}
            >
              <option value="">— 选择 —</option>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>{v.id} [{v.role}]</option>
              ))}
            </select>
            <button
              onClick={runCompare}
              disabled={!compareA || !compareB || comparing}
              style={{
                background: "#1a3a1a", border: `1px solid ${S.green}`, color: S.green,
                padding: "4px 14px", cursor: "pointer", ...mono, borderRadius: 3,
              }}
            >
              {comparing ? "加载中…" : "对比"}
            </button>
          </div>

          {compareResult && (
            <div>
              {/* Comparison header */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                {([["A", compareResult.versionA], ["B", compareResult.versionB]] as const).map(([label, v]) => (
                  <div key={label} style={{ background: S.surface, border: `1px solid ${S.border}`, padding: 10 }}>
                    <div style={{ color: S.muted, fontSize: 11, marginBottom: 4 }}>版本 {label}</div>
                    <div style={{ color: S.blue, fontWeight: 700 }}>{v.id}</div>
                    <div>schemaVersion: {v.schemaVersion}</div>
                    <div>modelVersion: {v.modelVersion}</div>
                    <div style={{ color: S.muted }}>startDate: {v.startDate}</div>
                  </div>
                ))}
              </div>

              {/* Comparison allowed banner */}
              <div style={{
                background: compareResult.comparisonAllowed ? "#0a1a0a" : "#1a0000",
                border: `1px solid ${compareResult.comparisonAllowed ? S.green : S.red}`,
                padding: "8px 12px", marginBottom: 12, fontSize: 12,
              }}>
                {compareResult.comparisonAllowed
                  ? <span style={{ color: S.green }}>✅ 可比较 — schemaVersion 相同</span>
                  : <span style={{ color: S.red }}>❌ 不可比较 — {compareResult.reason}</span>}
              </div>

              {/* Meta stats */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 12 }}>
                {[
                  ["交易日数 A", compareResult.tradingDaysA],
                  ["交易日数 B", compareResult.tradingDaysB],
                  ["特征覆盖率 A", compareResult.featureCoverageA != null ? `${compareResult.featureCoverageA}%` : "—"],
                  ["特征覆盖率 B", compareResult.featureCoverageB != null ? `${compareResult.featureCoverageB}%` : "—"],
                ].map(([label, val]) => (
                  <div key={String(label)} style={{ background: S.surface, border: `1px solid ${S.border}`, padding: "8px 10px" }}>
                    <div style={{ color: S.muted, fontSize: 10 }}>{label}</div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{val}</div>
                  </div>
                ))}
              </div>

              {/* Regression status */}
              <div style={{ marginBottom: 12, fontSize: 12 }}>
                <span style={{ color: S.muted }}>回归状态：</span>
                <span style={{ color: regColor(compareResult.regressionStatus), fontWeight: 700 }}>
                  {{ OK: "正常", WARNING: "注意", CRITICAL: "严重" }[compareResult.regressionStatus] ?? compareResult.regressionStatus}
                </span>
                {compareResult.winRateDelta7d !== null && (
                  <span style={{ marginLeft: 8, color: deltaColor(compareResult.winRateDelta7d) }}>
                    （7日胜率变化：{compareResult.winRateDelta7d >= 0 ? "+" : ""}{compareResult.winRateDelta7d?.toFixed(2)}pp）
                  </span>
                )}
              </div>

              {/* Backtest horizon table */}
              <table style={{ width: "100%", borderCollapse: "collapse", border: `1px solid ${S.border}`, marginBottom: 12 }}>
                <thead>
                  <tr style={{ background: "#181818", fontSize: 11, color: S.muted }}>
                    <th style={{ ...cell, textAlign: "left" }}>周期</th>
                    <th style={{ ...cell, textAlign: "right" }}>胜率 A</th>
                    <th style={{ ...cell, textAlign: "right" }}>胜率 B</th>
                    <th style={{ ...cell, textAlign: "right" }}>Δ 胜率</th>
                    <th style={{ ...cell, textAlign: "right" }}>均收益 A</th>
                    <th style={{ ...cell, textAlign: "right" }}>均收益 B</th>
                    <th style={{ ...cell, textAlign: "right" }}>Δ 收益</th>
                    <th style={{ ...cell, textAlign: "right" }}>Δ 超额</th>
                  </tr>
                </thead>
                <tbody>
                  {compareResult.backtestA.map((rowA, i) => {
                    const rowB = compareResult.backtestB[i];
                    const delta = compareResult.backtestDelta?.[i];
                    return (
                      <tr key={rowA.horizon}>
                        <td style={{ ...cell, fontWeight: 700 }}>{rowA.horizon}</td>
                        <td style={{ ...cell, textAlign: "right" }}>{rowA.winRate != null ? `${rowA.winRate.toFixed(1)}%` : "—"}</td>
                        <td style={{ ...cell, textAlign: "right" }}>{rowB?.winRate != null ? `${rowB.winRate.toFixed(1)}%` : "—"}</td>
                        <td style={{ ...cell, textAlign: "right", color: deltaColor(delta?.winRateDelta ?? null) }}>
                          {delta?.winRateDelta != null ? fmt(delta.winRateDelta, "pp") : "—"}
                        </td>
                        <td style={{ ...cell, textAlign: "right" }}>{rowA.avgReturn != null ? `${rowA.avgReturn.toFixed(2)}%` : "—"}</td>
                        <td style={{ ...cell, textAlign: "right" }}>{rowB?.avgReturn != null ? `${rowB.avgReturn.toFixed(2)}%` : "—"}</td>
                        <td style={{ ...cell, textAlign: "right", color: deltaColor(delta?.returnDelta ?? null) }}>
                          {delta?.returnDelta != null ? fmt(delta.returnDelta, "pp") : "—"}
                        </td>
                        <td style={{ ...cell, textAlign: "right", color: deltaColor(delta?.alphaDelta ?? null) }}>
                          {delta?.alphaDelta != null ? fmt(delta.alphaDelta, "pp") : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── INTEGRITY TAB ────────────────────────────────────────────────── */}
      {activeTab === "integrity" && integrity && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 16 }}>
            {/* DR integrity */}
            <div style={{ background: S.surface, border: `1px solid ${S.border}`, padding: 16 }}>
              <div style={{ color: S.muted, fontSize: 11, marginBottom: 8, fontWeight: 600 }}>DailyRecommendation → versionSnapshotId</div>
              <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
                {integrityStatus(integrity.drCoveragePct, integrity.drMissingCount)}
              </div>
              <div style={{ color: S.muted, fontSize: 11 }}>
                {integrity.drLinked.toLocaleString()} / {integrity.drTotal.toLocaleString()} 条已关联
              </div>
              {integrity.drMissingCount > 0 && (
                <div style={{ marginTop: 8, color: S.yellow, fontSize: 11 }}>
                  ⚠ {integrity.drMissingCount} 条 versionSnapshotId 为空。
                  <br />运行：<code style={{ background: "#222", padding: "0 4px" }}>npx tsx scripts/backfill-dr-version.ts</code>
                </div>
              )}
            </div>

            {/* BP integrity */}
            <div style={{ background: S.surface, border: `1px solid ${S.border}`, padding: 16 }}>
              <div style={{ color: S.muted, fontSize: 11, marginBottom: 8, fontWeight: 600 }}>BacktestPositionResult → versionSnapshotId</div>
              <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
                {integrityStatus(integrity.bpCoveragePct, integrity.bpMissingCount)}
              </div>
              <div style={{ color: S.muted, fontSize: 11 }}>
                {integrity.bpLinked.toLocaleString()} / {integrity.bpTotal.toLocaleString()} 条已关联
              </div>
            </div>
          </div>

          {/* Per-version breakdown */}
          <div style={{ color: S.muted, fontSize: 11, marginBottom: 6, fontWeight: 600 }}>各版本关联情况</div>
          <table style={{ width: "100%", borderCollapse: "collapse", border: `1px solid ${S.border}` }}>
            <thead>
              <tr style={{ background: "#181818", fontSize: 11, color: S.muted }}>
                {["状态","ID","DR 关联","BP 关联","学习报告"].map((h) => (
                  <th key={h} style={{ ...cell, textAlign: "left", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id}>
                  <td style={cell}>{roleBadge(v.role)}</td>
                  <td style={{ ...cell, color: S.blue }}>{v.id}</td>
                  <td style={cell}>
                    {v.drLinked > 0
                      ? <span style={{ color: S.green }}>{v.drLinked.toLocaleString()}</span>
                      : <span style={{ color: S.yellow }}>0 ← 需要回填</span>}
                  </td>
                  <td style={cell}>
                    {v.bpLinked > 0
                      ? <span style={{ color: S.green }}>{v.bpLinked.toLocaleString()}</span>
                      : <span style={{ color: S.muted }}>0</span>}
                  </td>
                  <td style={cell}>
                    {v.learningReportExists
                      ? <span style={{ color: S.green }}>✓ 已生成</span>
                      : <span style={{ color: S.muted }}>未生成</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Overall system integrity status */}
          <div style={{
            marginTop: 16,
            background: integrity.status === "OK" ? "#0a1a0a" : integrity.status === "WARNING" ? "#1a1200" : "#1a0000",
            border: `1px solid ${integrity.status === "OK" ? S.green : integrity.status === "WARNING" ? S.yellow : S.red}`,
            padding: 12, fontSize: 12,
          }}>
            <strong style={{ color: integrity.status === "OK" ? S.green : integrity.status === "WARNING" ? S.yellow : S.red }}>
              整体完整性：{{ OK: "正常", WARNING: "警告", CRITICAL: "严重异常" }[integrity.status] ?? integrity.status}
            </strong>
            {integrity.status === "OK" && " — 所有 BacktestPositionResult 和 DailyRecommendation 均可追溯到 VersionSnapshot。"}
            {integrity.status === "WARNING" && " — DailyRecommendation 存在空 versionSnapshotId，请运行 backfill-dr-version.ts 修复。"}
            {integrity.status === "CRITICAL" && " — BacktestPositionResult 存在空 versionSnapshotId，请排查 update-backtest.ts。"}
          </div>
        </div>
      )}

      <div style={{ marginTop: 24, fontSize: 10, color: S.muted, borderTop: `1px solid ${S.border}`, paddingTop: 8 }}>
        Version Center · auto-refreshes every 60s ·{" "}
        <a href="/admin/experiments" style={{ color: S.muted }}>Experiment Dashboard →</a>
      </div>
    </div>
  );
}
