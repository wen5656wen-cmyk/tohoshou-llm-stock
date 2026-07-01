"use client";

import { useEffect, useState, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Severity = "NORMAL" | "WARNING" | "CRITICAL";
type StepStatus = "SUCCESS" | "WAITING" | "FAILED" | "SKIPPED";

interface PipelineStep {
  key: string;
  name: string;
  scheduledLabel: string;
  status: StepStatus;
  lastRunAt: string | null;
  lastRunJst: string | null;
  durationMs: number | null;
  duration: string | null;
  resultSummary: string | null;
  errorMessage: string | null;
}

interface StrategyRecBlock {
  total: number;
  top10Count: number;
  latestTradeDate: string | null;
  status: Severity;
}

interface DayExec {
  lastSettledDate: string | null;
  tradeResultCount: number;
  closedCount: number;
  skippedCount: number;
  snapshotExists: boolean;
  pnl: number | null;
  alpha: number | null;
}

interface OpenExec {
  openPositions: number;
  newOpensToday: number;
  closedToday: number;
  snapshotExists: boolean;
  over10: boolean;
  hasDuplicates: boolean;
}

interface BacktestBlock {
  asOfDate: string | null;
  horizonCount: number;
  horizons: Array<{ horizon: string; maturity: string; fillRate: number | null }>;
}

interface LearningEntry {
  reportDate: string;
  grade: string | null;
  recommendation: string | null;
}

interface MissionControlV2 {
  productionStatus: {
    status: Severity;
    healthCriticalCount: number;
    healthWarningCount: number;
    reasons: string[];
    lastUpdated: string | null;
  };
  todayPipeline: {
    completedSteps: number;
    totalSteps: number;
    steps: PipelineStep[];
  };
  dataFreshness: {
    dailyPrice: {
      latestDate: string | null;
      lastCompletedDate: string | null;
      coveragePct: number;
      stockCount: number;
      coveredCount: number;
      failedCount: number;
      status: Severity;
    };
    news: { latestAt: string | null; todayNewCount: number };
    globalMarket: { latestDate: string | null };
    stockScore: { latestDate: string | null; scoredTodayCount: number };
  };
  strategyRecommendations: {
    DAY_TRADE: StrategyRecBlock;
    SWING_TRADE: StrategyRecBlock;
    LONG_TRADE: StrategyRecBlock;
  };
  strategyExecutions: {
    DAY_TRADE: DayExec;
    SWING_TRADE: OpenExec;
    LONG_TRADE: OpenExec;
  };
  backtest: {
    DAY_TRADE: BacktestBlock;
    SWING_TRADE: BacktestBlock;
    LONG_TRADE: BacktestBlock;
  };
  learning: {
    DAY_TRADE: LearningEntry | null;
    SWING_TRADE: LearningEntry | null;
    LONG_TRADE: LearningEntry | null;
    unified: { reportDate: string; integrityScore: number | null; grade: string | null; recommendation: string | null } | null;
  };
  validation: {
    validationDate: string;
    allPass: boolean;
    failCount: number;
    incidentCount: number;
    consecutiveHealthDays: number;
    phase7Ready: boolean;
    phase7Detail: string | null;
  } | null;
  reports: {
    weekly: { latestFile: string | null; generatedThisPeriod: boolean; updatedAt: string | null; status: Severity };
    monthly: { latestFile: string | null; generatedThisPeriod: boolean; updatedAt: string | null; status: Severity };
  };
  pm2: {
    available: boolean;
    web: { name: string; status: string; restarts: number; uptimeMs: number | null } | null;
    cron: { name: string; status: string; restarts: number; uptimeMs: number | null } | null;
    cronStaleAfterDeploy: boolean;
    cronStaleDeployAt: string | null;
    severity: Severity;
  };
  health: {
    status: string;
    criticalCount: number;
    warningCount: number;
    passCount: number;
    auditAt: string | null;
    topIssues: string[];
    warningIssues: string[];
  };
  version: {
    schemaVersion: string | null;
    modelVersion: string | null;
    scoreVersion: string | null;
    versionSnapshotId: string | null;
  };
  generatedAt: string;
}

// ── Style helpers ─────────────────────────────────────────────────────────────

const sevColor: Record<Severity, string> = {
  NORMAL: "#22c55e",
  WARNING: "#f59e0b",
  CRITICAL: "#ef4444",
};
const sevLabel: Record<Severity, string> = {
  NORMAL: "正常",
  WARNING: "注意",
  CRITICAL: "严重",
};

const stepColor: Record<StepStatus, string> = {
  SUCCESS: "#22c55e",
  WAITING: "#f59e0b",
  FAILED: "#ef4444",
  SKIPPED: "#6b7280",
};
const stepLabel: Record<StepStatus, string> = {
  SUCCESS: "✅ 成功",
  WAITING: "⏳ 等待",
  FAILED: "❌ 失败",
  SKIPPED: "— 跳过",
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
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", background: "#111" };
const card: React.CSSProperties = { background: "#111", border: "1px solid #222", borderRadius: 4, padding: "10px 12px" };

function fmtUptime(ms: number | null): string {
  if (ms == null) return "—";
  const h = Math.floor(ms / 3_600_000);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
  return `${Math.floor(ms / 60_000)}m`;
}

function StatCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={card}>
      <div style={{ color: "#666", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MissionControlPage() {
  const [data, setData] = useState<MissionControlV2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/mission-control");
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
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  if (loading) return <div style={{ color: "#888", padding: 24, fontFamily: "monospace" }}>加载中…</div>;
  if (error)   return <div style={{ color: "#ef4444", padding: 24, fontFamily: "monospace" }}>错误：{error}</div>;
  if (!data)   return null;

  const { productionStatus, todayPipeline, dataFreshness, strategyRecommendations, strategyExecutions, backtest, learning, validation, reports, pm2, health, version } = data;

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", color: "#e5e5e5", padding: "16px 20px", fontFamily: "monospace" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 20, paddingBottom: 12, borderBottom: "1px solid #222" }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>控制中心</div>
          <div style={{ fontSize: 12, color: "#666" }}>Trading Architecture V1 运营驾驶舱</div>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right", fontSize: 11, color: "#555" }}>
          <div>最后刷新：{lastRefresh?.toLocaleTimeString("zh-CN")} · 每60秒自动刷新</div>
          <button onClick={load} style={{ marginTop: 4, padding: "2px 8px", fontSize: 11, cursor: "pointer", background: "#222", color: "#aaa", border: "1px solid #444", borderRadius: 3 }}>
            ↺ 刷新
          </button>
        </div>
      </div>

      {/* ── Top 4 overview cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        <StatCard title="Production Status">
          <div style={{ fontSize: 22, fontWeight: 800, color: sevColor[productionStatus.status] }}>
            {sevLabel[productionStatus.status]}
          </div>
          <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
            CRITICAL: {productionStatus.healthCriticalCount} · WARNING: {productionStatus.healthWarningCount}
          </div>
          <div style={{ fontSize: 10, color: "#555", marginTop: 4 }}>
            {productionStatus.lastUpdated ? new Date(productionStatus.lastUpdated).toLocaleString("zh-CN") : "无数据"}
          </div>
          {productionStatus.reasons.length > 0 && (
            <div style={{ fontSize: 10, color: "#f59e0b", marginTop: 4 }}>{productionStatus.reasons.join(" · ")}</div>
          )}
        </StatCard>

        <StatCard title="Today Pipeline">
          <div style={{ fontSize: 22, fontWeight: 800, color: todayPipeline.completedSteps === todayPipeline.totalSteps ? "#22c55e" : "#f59e0b" }}>
            {todayPipeline.completedSteps}/{todayPipeline.totalSteps}
          </div>
          <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>今日完成步骤</div>
        </StatCard>

        <StatCard title="Strategy Status">
          <div style={{ fontSize: 11, lineHeight: 1.8 }}>
            <div>DAY 推荐 <b style={{ color: "#e5e5e5" }}>{strategyRecommendations.DAY_TRADE.total}</b> · 成交 <b style={{ color: "#e5e5e5" }}>{strategyExecutions.DAY_TRADE.tradeResultCount}</b></div>
            <div>SWING 推荐 <b style={{ color: "#e5e5e5" }}>{strategyRecommendations.SWING_TRADE.total}</b> · 持仓 <b style={{ color: "#e5e5e5" }}>{strategyExecutions.SWING_TRADE.openPositions}</b></div>
            <div>LONG 推荐 <b style={{ color: "#e5e5e5" }}>{strategyRecommendations.LONG_TRADE.total}</b> · 持仓 <b style={{ color: "#e5e5e5" }}>{strategyExecutions.LONG_TRADE.openPositions}</b></div>
          </div>
        </StatCard>

        <StatCard title="Validation Status">
          <div style={{ fontSize: 22, fontWeight: 800, color: validation?.allPass ? "#22c55e" : "#ef4444" }}>
            {validation ? (validation.allPass ? "PASS" : "FAIL") : "—"}
          </div>
          <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
            连续健康 {validation?.consecutiveHealthDays ?? 0} 天 · Phase7 {validation?.phase7Ready ? "READY" : "未就绪"}
          </div>
        </StatCard>
      </div>

      {/* ── Trading Architecture V1 Pipeline ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={sectionTitle}>Trading Architecture V1 Pipeline</div>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={th}>步骤</th>
              <th style={th}>计划时间</th>
              <th style={th}>状态</th>
              <th style={th}>最近运行 (JST)</th>
              <th style={th}>耗时</th>
              <th style={th}>输出摘要 / 错误</th>
            </tr>
          </thead>
          <tbody>
            {todayPipeline.steps.map(s => (
              <tr key={s.key}>
                <td style={cell}>{s.name}</td>
                <td style={{ ...cell, color: "#555" }}>{s.scheduledLabel}</td>
                <td style={{ ...cell, color: stepColor[s.status], fontWeight: 700 }}>{stepLabel[s.status]}</td>
                <td style={{ ...cell, color: "#888" }}>{s.lastRunJst ?? "—"}</td>
                <td style={{ ...cell, color: "#aaa" }}>{s.duration ?? "—"}</td>
                <td style={{ ...cell, color: s.errorMessage ? "#ef4444" : "#888" }}>
                  {s.errorMessage ?? s.resultSummary ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Data sync status ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={sectionTitle}>数据同步状态</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <StatCard title="DailyPrice">
            <div style={{ fontSize: 12, color: "#888" }}>最新交易日：{dataFreshness.dailyPrice.lastCompletedDate ?? "—"}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: sevColor[dataFreshness.dailyPrice.status] }}>
              {dataFreshness.dailyPrice.coveragePct}%
            </div>
            <div style={{ fontSize: 11, color: "#666" }}>
              {dataFreshness.dailyPrice.coveredCount}/{dataFreshness.dailyPrice.stockCount} 只
              {dataFreshness.dailyPrice.failedCount > 0 && <span style={{ color: "#ef4444" }}> · 失败{dataFreshness.dailyPrice.failedCount}</span>}
            </div>
          </StatCard>
          <StatCard title="News">
            <div style={{ fontSize: 12, color: "#888" }}>最新：{dataFreshness.news.latestAt ? new Date(dataFreshness.news.latestAt).toLocaleString("zh-CN") : "—"}</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{dataFreshness.news.todayNewCount}</div>
            <div style={{ fontSize: 11, color: "#666" }}>今日新增</div>
          </StatCard>
          <StatCard title="GlobalMarket">
            <div style={{ fontSize: 18, fontWeight: 700 }}>{dataFreshness.globalMarket.latestDate ?? "—"}</div>
            <div style={{ fontSize: 11, color: "#666" }}>最新日期</div>
          </StatCard>
          <StatCard title="StockScore">
            <div style={{ fontSize: 12, color: "#888" }}>最新日期：{dataFreshness.stockScore.latestDate ?? "—"}</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{dataFreshness.stockScore.scoredTodayCount}</div>
            <div style={{ fontSize: 11, color: "#666" }}>今日已评分</div>
          </StatCard>
        </div>
      </div>

      {/* ── Strategy recommendations + executions ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        <div>
          <div style={sectionTitle}>三策略推荐状态</div>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={th}>策略</th>
                <th style={th}>推荐总数</th>
                <th style={th}>Top10</th>
                <th style={th}>最新交易日</th>
                <th style={th}>状态</th>
              </tr>
            </thead>
            <tbody>
              {(["DAY_TRADE", "SWING_TRADE", "LONG_TRADE"] as const).map(k => {
                const r = strategyRecommendations[k];
                return (
                  <tr key={k}>
                    <td style={cell}>{k}</td>
                    <td style={cell}>{r.total}</td>
                    <td style={cell}>{r.top10Count}</td>
                    <td style={{ ...cell, color: "#888" }}>{r.latestTradeDate ?? "—"}</td>
                    <td style={{ ...cell, color: sevColor[r.status] }}>{sevLabel[r.status]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div>
          <div style={sectionTitle}>三策略执行状态</div>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={th}>策略</th>
                <th style={th}>持仓/成交</th>
                <th style={th}>新开/平仓</th>
                <th style={th}>Snapshot</th>
                <th style={th}>提示</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={cell}>DAY_TRADE</td>
                <td style={cell}>{strategyExecutions.DAY_TRADE.closedCount} 成交 / {strategyExecutions.DAY_TRADE.skippedCount} 跳过</td>
                <td style={{ ...cell, color: strategyExecutions.DAY_TRADE.pnl != null ? (strategyExecutions.DAY_TRADE.pnl >= 0 ? "#22c55e" : "#ef4444") : "#555" }}>
                  P&L {strategyExecutions.DAY_TRADE.pnl != null ? `¥${strategyExecutions.DAY_TRADE.pnl.toLocaleString()}` : "—"}
                </td>
                <td style={{ ...cell, color: strategyExecutions.DAY_TRADE.snapshotExists ? "#22c55e" : "#ef4444" }}>
                  {strategyExecutions.DAY_TRADE.snapshotExists ? "✅" : "❌"}
                </td>
                <td style={{ ...cell, color: "#666" }}>{strategyExecutions.DAY_TRADE.lastSettledDate ?? "—"}</td>
              </tr>
              {(["SWING_TRADE", "LONG_TRADE"] as const).map(k => {
                const e = strategyExecutions[k];
                return (
                  <tr key={k}>
                    <td style={cell}>{k}</td>
                    <td style={cell}>{e.openPositions} 持仓</td>
                    <td style={cell}>{e.newOpensToday} / {e.closedToday}</td>
                    <td style={{ ...cell, color: e.snapshotExists ? "#22c55e" : "#f59e0b" }}>{e.snapshotExists ? "✅" : "—"}</td>
                    <td style={{ ...cell, color: (e.over10 || e.hasDuplicates) ? "#ef4444" : "#555" }}>
                      {e.over10 ? "超10只 " : ""}{e.hasDuplicates ? "重复持仓" : (e.over10 ? "" : "—")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Backtest / Learning / Validation ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>
        <div>
          <div style={sectionTitle}>Backtest</div>
          <div style={card}>
            {(["DAY_TRADE", "SWING_TRADE", "LONG_TRADE"] as const).map(k => {
              const b = backtest[k];
              return (
                <div key={k} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid #1a1a1a" }}>
                  <div style={{ fontSize: 11, color: "#888" }}>{k} · {b.asOfDate ?? "无数据"}</div>
                  <div style={{ fontSize: 11, color: "#666" }}>
                    {b.horizons.length === 0 ? "—" : b.horizons.map(h => `${h.horizon}:${h.maturity}`).join("  ")}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <div style={sectionTitle}>Learning</div>
          <div style={card}>
            {(["DAY_TRADE", "SWING_TRADE", "LONG_TRADE"] as const).map(k => {
              const l = learning[k];
              return (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                  <span style={{ color: "#888" }}>{k}</span>
                  <span>{l?.grade ?? "—"} <span style={{ color: "#555" }}>({l?.recommendation ?? "—"})</span></span>
                </div>
              );
            })}
            <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid #1a1a1a", fontSize: 12, display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#888" }}>综合</span>
              <span>{learning.unified?.grade ?? "—"} ({learning.unified?.integrityScore?.toFixed(1) ?? "—"})</span>
            </div>
          </div>
        </div>
        <div>
          <div style={sectionTitle}>Validation</div>
          <div style={card}>
            <div style={{ fontSize: 12, color: "#888" }}>最新：{validation?.validationDate ?? "—"}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: validation?.allPass ? "#22c55e" : "#ef4444", marginTop: 4 }}>
              {validation ? (validation.allPass ? "9/9 PASS" : `FAIL (${validation.failCount})`) : "—"}
            </div>
            <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>
              Incident: {validation?.incidentCount ?? 0} · 连续健康 {validation?.consecutiveHealthDays ?? 0} 天
            </div>
            <div style={{ fontSize: 11, color: validation?.phase7Ready ? "#22c55e" : "#666", marginTop: 4 }}>
              Phase7: {validation?.phase7Ready ? "READY 🚀" : (validation?.phase7Detail ?? "未就绪")}
            </div>
          </div>
        </div>
      </div>

      {/* ── Reports + PM2 ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        <div>
          <div style={sectionTitle}>Report 状态</div>
          <div style={card}>
            {([["周报", reports.weekly], ["月报", reports.monthly]] as const).map(([label, r]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid #1a1a1a" }}>
                <div>
                  <div style={{ fontSize: 12, color: "#888" }}>{label}</div>
                  <div style={{ fontSize: 11, color: "#666" }}>{r.latestFile ?? "暂无"}</div>
                </div>
                <span style={{ color: sevColor[r.status], fontSize: 11, fontWeight: 700 }}>
                  {r.generatedThisPeriod ? "已生成" : sevLabel[r.status]}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={sectionTitle}>PM2 / Cron 状态</div>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={th}>进程</th>
                <th style={th}>状态</th>
                <th style={th}>重启次数</th>
                <th style={th}>运行时长</th>
              </tr>
            </thead>
            <tbody>
              {[pm2.web, pm2.cron].map(p => p && (
                <tr key={p.name}>
                  <td style={cell}>{p.name}</td>
                  <td style={{ ...cell, color: p.status === "online" ? "#22c55e" : "#ef4444", fontWeight: 700 }}>
                    {p.status === "online" ? "✅ online" : `❌ ${p.status}`}
                  </td>
                  <td style={cell}>{p.restarts}</td>
                  <td style={cell}>{fmtUptime(p.uptimeMs)}</td>
                </tr>
              ))}
              {!pm2.available && (
                <tr><td colSpan={4} style={{ ...cell, color: "#555", textAlign: "center" }}>无法读取 pm2 状态（本地开发环境）</td></tr>
              )}
            </tbody>
          </table>
          {pm2.cronStaleAfterDeploy && (
            <div style={{ marginTop: 6, fontSize: 11, color: "#f59e0b", padding: "4px 6px", background: "#1a1400", border: "1px solid #5a4a00", borderRadius: 3 }}>
              ⚠ cron-scheduler.ts 在当前 tohoshou-cron 进程启动后又被部署（{pm2.cronStaleDeployAt ? new Date(pm2.cronStaleDeployAt).toLocaleString("zh-CN") : ""}），新调度可能未生效，需 pm2 restart tohoshou-cron
            </div>
          )}
        </div>
      </div>

      {/* ── Health detail ── */}
      {(health.topIssues.length > 0 || health.warningIssues.length > 0) && (
        <div style={{ marginBottom: 20 }}>
          <div style={sectionTitle}>Health 详情（PASS {health.passCount} · WARNING {health.warningCount} · CRITICAL {health.criticalCount}）</div>
          <div style={card}>
            {health.topIssues.map((i, idx) => <div key={idx} style={{ fontSize: 12, color: "#ef4444", marginBottom: 4 }}>❌ {i}</div>)}
            {health.warningIssues.map((i, idx) => <div key={idx} style={{ fontSize: 12, color: "#f59e0b", marginBottom: 4 }}>⚠ {i}</div>)}
          </div>
        </div>
      )}

      {/* ── Footer: version info ── */}
      <div style={{ marginTop: 20, paddingTop: 12, borderTop: "1px solid #222", fontSize: 11, color: "#555" }}>
        <div style={{ marginBottom: 4, color: "#666", textTransform: "uppercase", letterSpacing: "0.06em" }}>版本信息</div>
        schemaVersion={version.schemaVersion ?? "—"} · modelVersion={version.modelVersion ?? "—"} · scoreVersion={version.scoreVersion ?? "—"} · versionSnapshotId={version.versionSnapshotId ?? "—"}
        <div style={{ marginTop: 8, textAlign: "right" }}>计算于 {data.generatedAt}</div>
      </div>
    </div>
  );
}
