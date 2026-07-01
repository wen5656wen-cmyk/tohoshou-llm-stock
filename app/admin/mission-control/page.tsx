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

interface IssueDetail {
  id: string;
  name: string;
  level: Severity;
  value: string;
  impact: string;
  suggestion: string;
  relatedToCurrentTask: boolean;
}

interface Incident {
  time: string;
  level: Severity;
  module: string;
  title: string;
  description: string;
  status: string;
}

interface Phase7Progress {
  day: { current: number; target: number };
  swing: { current: number; target: number };
  long: { current: number; target: number };
  learning: { dayGrade: string | null; swingGrade: string | null; longGrade: string | null };
  health: { current: number; target: number };
  ready: boolean;
  detail: string | null;
}

interface ArchitectureStatus {
  version: string;
  status: string;
  frozenDate: string;
  currentMode: string;
  nextPhase: string;
  unlocked: boolean;
}

interface MissionControlV2 {
  productionStatus: {
    status: Severity;
    passCount: number;
    healthWarningCount: number;
    healthCriticalCount: number;
    highestSeverity: Severity;
    reasons: string[];
    lastUpdated: string | null;
  };
  todayPipeline: {
    completedSteps: number;
    totalSteps: number;
    completionPct: number;
    failedCount: number;
    allDoneToday: boolean;
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
  criticalIssues: IssueDetail[];
  warningIssues: IssueDetail[];
  recentIncidents: Incident[];
  phase7Progress: Phase7Progress | null;
  architectureStatus: ArchitectureStatus;
  refreshStatus: { generatedAt: string; healthReportAgeMinutes: number | null; stale: boolean };
  version: {
    schemaVersion: string | null;
    modelVersion: string | null;
    scoreVersion: string | null;
    versionSnapshotId: string | null;
  };
  generatedAt: string;
}

// ── Style helpers ─────────────────────────────────────────────────────────────

const sevColor: Record<Severity, string> = { NORMAL: "#22c55e", WARNING: "#f59e0b", CRITICAL: "#ef4444" };
const sevLabel: Record<Severity, string> = { NORMAL: "正常", WARNING: "注意", CRITICAL: "严重" };
const sevLabel3: Record<Severity, string> = { NORMAL: "正常", WARNING: "注意", CRITICAL: "异常" };

const stepColor: Record<StepStatus, string> = { SUCCESS: "#22c55e", WAITING: "#f59e0b", FAILED: "#ef4444", SKIPPED: "#6b7280" };
const stepLabel: Record<StepStatus, string> = { SUCCESS: "✅ 成功", WAITING: "⏳ 等待", FAILED: "❌ 失败", SKIPPED: "— 跳过" };

const STRATEGY_LABEL: Record<string, string> = { DAY_TRADE: "日内", SWING_TRADE: "波段", LONG_TRADE: "长线" };

const cell: React.CSSProperties = { padding: "6px 10px", borderBottom: "1px solid #333", verticalAlign: "top", fontSize: 13, fontFamily: "monospace" };
const th: React.CSSProperties = { ...cell, background: "#1a1a1a", color: "#888", fontWeight: 600, textTransform: "uppercase", fontSize: 11, letterSpacing: "0.05em" };
const sectionTitle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#888", letterSpacing: "0.04em", marginBottom: 6, paddingBottom: 4, borderBottom: "1px solid #333" };
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

function strategySeverity(rec: StrategyRecBlock, exec: OpenExec | null): Severity {
  if (exec?.hasDuplicates) return "CRITICAL";
  if (rec.status === "WARNING" || exec?.over10) return "WARNING";
  return rec.status;
}

function StatCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={card}>
      <div style={{ color: "#666", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ background: "#1a1a1a", borderRadius: 3, height: 8, overflow: "hidden", marginTop: 6 }}>
      <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: "100%", background: color, transition: "width 0.3s" }} />
    </div>
  );
}

function IssueList({ issues }: { issues: IssueDetail[] }) {
  if (issues.length === 0) return <div style={{ fontSize: 11, color: "#555" }}>无</div>;
  return (
    <div>
      {issues.map(i => (
        <div key={i.id} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid #1a1a1a" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ color: sevColor[i.level], fontWeight: 700, fontSize: 12 }}>{i.name}</span>
            <span style={{ color: "#666", fontSize: 11 }}>{i.value}</span>
          </div>
          <div style={{ fontSize: 11, color: "#999", marginTop: 3 }}>影响：{i.impact}</div>
          <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>建议：{i.suggestion}</div>
          <div style={{ fontSize: 10, color: i.relatedToCurrentTask ? "#f59e0b" : "#555", marginTop: 2 }}>
            {i.relatedToCurrentTask ? "● 与近期 Day Trade 修复相关（已知跟踪中）" : "○ 独立问题（与近期修复无关）"}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MissionControlPage() {
  const [data, setData] = useState<MissionControlV2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());

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
    const tick = setInterval(() => setNowTick(Date.now()), 15_000);
    return () => { clearInterval(id); clearInterval(tick); };
  }, [load]);

  if (loading) return <div style={{ color: "#888", padding: 24, fontFamily: "monospace" }}>加载中…</div>;
  if (error)   return <div style={{ color: "#ef4444", padding: 24, fontFamily: "monospace" }}>错误：{error}</div>;
  if (!data)   return null;

  const {
    productionStatus, todayPipeline, dataFreshness, strategyRecommendations, strategyExecutions,
    backtest, learning, validation, reports, pm2, criticalIssues, warningIssues, recentIncidents,
    phase7Progress, architectureStatus, version,
  } = data;

  const staleClientRefresh = lastRefresh ? (nowTick - lastRefresh.getTime()) > 5 * 60_000 : false;

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", color: "#e5e5e5", padding: "16px 20px", fontFamily: "monospace" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid #222" }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>控制中心</div>
          <div style={{ fontSize: 12, color: "#666" }}>Trading Architecture V1 运营驾驶舱</div>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right", fontSize: 11, color: staleClientRefresh ? "#f59e0b" : "#555" }}>
          <div>最后刷新：{lastRefresh?.toLocaleTimeString("zh-CN")} · 自动刷新：60s{staleClientRefresh ? " ⚠ 已超过5分钟未刷新" : ""}</div>
          <div style={{ color: "#555" }}>数据生成于：{new Date(data.generatedAt).toLocaleString("zh-CN")}</div>
          <button onClick={load} style={{ marginTop: 4, padding: "2px 8px", fontSize: 11, cursor: "pointer", background: "#222", color: "#aaa", border: "1px solid #444", borderRadius: 3 }}>
            ↺ 刷新
          </button>
        </div>
      </div>

      {/* ── Trading Architecture status bar ── */}
      <div style={{ display: "flex", gap: 16, alignItems: "center", background: "#111", border: "1px solid #222", borderRadius: 4, padding: "8px 14px", marginBottom: 16, fontSize: 12, flexWrap: "wrap" }}>
        <span style={{ color: "#888" }}>Trading Architecture <b style={{ color: "#e5e5e5" }}>{architectureStatus.version}</b></span>
        <span style={{ color: "#666" }}>|</span>
        <span style={{ color: "#888" }}>状态 <b style={{ color: "#3b82f6" }}>{architectureStatus.status}</b></span>
        <span style={{ color: "#666" }}>|</span>
        <span style={{ color: "#888" }}>冻结日期 <b style={{ color: "#e5e5e5" }}>{architectureStatus.frozenDate}</b></span>
        <span style={{ color: "#666" }}>|</span>
        <span style={{ color: "#888" }}>当前模式 <b style={{ color: "#e5e5e5" }}>{architectureStatus.currentMode}</b></span>
        <span style={{ color: "#666" }}>|</span>
        <span style={{ color: "#888" }}>下一阶段 <b style={{ color: "#e5e5e5" }}>{architectureStatus.nextPhase}</b></span>
        <span style={{ color: "#666" }}>|</span>
        <span style={{ color: "#888" }}>解锁状态 <b style={{ color: architectureStatus.unlocked ? "#22c55e" : "#f59e0b" }}>{architectureStatus.unlocked ? "已就绪" : "未就绪"}</b></span>
      </div>

      {/* ── Top 4 overview cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}>
        <StatCard title="生产状态 Production Status">
          <div style={{ fontSize: 22, fontWeight: 800, color: sevColor[productionStatus.status] }}>
            {sevLabel[productionStatus.status]}
          </div>
          <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
            PASS {productionStatus.passCount} · WARNING {productionStatus.healthWarningCount} · CRITICAL {productionStatus.healthCriticalCount}
          </div>
          <div style={{ fontSize: 10, color: "#555", marginTop: 4 }}>
            最近 health:data：{productionStatus.lastUpdated ? new Date(productionStatus.lastUpdated).toLocaleString("zh-CN") : "无数据"}
          </div>
        </StatCard>

        <StatCard title="今日流水线 Today Pipeline">
          <div style={{ fontSize: 22, fontWeight: 800, color: todayPipeline.allDoneToday ? "#22c55e" : (todayPipeline.failedCount > 0 ? "#ef4444" : "#f59e0b") }}>
            {todayPipeline.completedSteps} / {todayPipeline.totalSteps}
          </div>
          <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
            {todayPipeline.completionPct}% {todayPipeline.allDoneToday ? "· 今日全部完成" : todayPipeline.failedCount > 0 ? `· ${todayPipeline.failedCount} 步失败` : "· 进行中"}
          </div>
          <ProgressBar pct={todayPipeline.completionPct} color={todayPipeline.failedCount > 0 ? "#ef4444" : todayPipeline.allDoneToday ? "#22c55e" : "#f59e0b"} />
        </StatCard>

        <StatCard title="策略状态 Strategy Status">
          <div style={{ fontSize: 11, lineHeight: 1.8 }}>
            <div>日内 推荐<b style={{ color: "#e5e5e5" }}> {strategyRecommendations.DAY_TRADE.total}</b> · 成交<b style={{ color: "#e5e5e5" }}> {strategyExecutions.DAY_TRADE.closedCount}</b></div>
            <div>波段 推荐<b style={{ color: "#e5e5e5" }}> {strategyRecommendations.SWING_TRADE.total}</b> · 持仓<b style={{ color: "#e5e5e5" }}> {strategyExecutions.SWING_TRADE.openPositions}</b></div>
            <div>长线 推荐<b style={{ color: "#e5e5e5" }}> {strategyRecommendations.LONG_TRADE.total}</b> · 持仓<b style={{ color: "#e5e5e5" }}> {strategyExecutions.LONG_TRADE.openPositions}</b></div>
          </div>
        </StatCard>

        <StatCard title="验证状态 Validation Status">
          <div style={{ fontSize: 22, fontWeight: 800, color: validation?.allPass ? "#22c55e" : "#ef4444" }}>
            {validation ? (validation.allPass ? "PASS" : "FAIL") : "—"}
          </div>
          <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
            连续健康 {validation?.consecutiveHealthDays ?? 0} 天 · Phase7 {phase7Progress?.ready ? "已就绪" : "未就绪"}
          </div>
        </StatCard>
      </div>

      {/* ── Production status detail (CRITICAL/WARNING issues below the card row) ── */}
      {(criticalIssues.length > 0 || warningIssues.length > 0) && (
        <div style={{ marginBottom: 16 }}>
          <div style={sectionTitle}>生产状态详情</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={card}>
              <div style={{ fontSize: 11, color: "#ef4444", fontWeight: 700, marginBottom: 6, textTransform: "uppercase" }}>
                CRITICAL Issues（{criticalIssues.length}）
              </div>
              <IssueList issues={criticalIssues} />
            </div>
            <div style={card}>
              <div style={{ fontSize: 11, color: "#f59e0b", fontWeight: 700, marginBottom: 6, textTransform: "uppercase" }}>
                WARNING Issues（{warningIssues.length}）
              </div>
              <IssueList issues={warningIssues} />
            </div>
          </div>
        </div>
      )}

      {/* ── Trading Architecture V1 Pipeline ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={sectionTitle}>Trading Architecture V1 流水线</div>
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
              <tr key={s.key} style={s.status === "FAILED" ? { background: "#2a0d0d" } : undefined}>
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
      <div style={{ marginBottom: 16 }}>
        <div style={sectionTitle}>数据同步状态</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <StatCard title="每日行情 DailyPrice">
            <div style={{ fontSize: 12, color: "#888" }}>最新交易日：{dataFreshness.dailyPrice.lastCompletedDate ?? "—"}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: sevColor[dataFreshness.dailyPrice.status] }}>
              {dataFreshness.dailyPrice.coveragePct}%
            </div>
            <div style={{ fontSize: 11, color: "#666" }}>
              {dataFreshness.dailyPrice.coveredCount}/{dataFreshness.dailyPrice.stockCount} 只
              {dataFreshness.dailyPrice.failedCount > 0 && <span style={{ color: "#ef4444" }}> · 失败{dataFreshness.dailyPrice.failedCount}</span>}
            </div>
          </StatCard>
          <StatCard title="新闻资讯 News">
            <div style={{ fontSize: 12, color: "#888" }}>最新：{dataFreshness.news.latestAt ? new Date(dataFreshness.news.latestAt).toLocaleString("zh-CN") : "—"}</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{dataFreshness.news.todayNewCount}</div>
            <div style={{ fontSize: 11, color: "#666" }}>今日新增</div>
          </StatCard>
          <StatCard title="全球指数 GlobalMarket">
            <div style={{ fontSize: 18, fontWeight: 700 }}>{dataFreshness.globalMarket.latestDate ?? "—"}</div>
            <div style={{ fontSize: 11, color: "#666" }}>最新日期</div>
          </StatCard>
          <StatCard title="综合评分 StockScore">
            <div style={{ fontSize: 12, color: "#888" }}>最新日期：{dataFreshness.stockScore.latestDate ?? "—"}</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{dataFreshness.stockScore.scoredTodayCount}</div>
            <div style={{ fontSize: 11, color: "#666" }}>今日已评分</div>
          </StatCard>
        </div>
      </div>

      {/* ── Strategy status (3-column detail) ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={sectionTitle}>三策略详细状态</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          {/* DAY */}
          {(() => {
            const rec = strategyRecommendations.DAY_TRADE, exec = strategyExecutions.DAY_TRADE;
            const sev = strategySeverity(rec, null);
            return (
              <div style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>日内（DAY_TRADE）</span>
                  <span style={{ color: sevColor[sev], fontSize: 11, fontWeight: 700 }}>{sevLabel3[sev]}</span>
                </div>
                <div style={{ fontSize: 12, lineHeight: 2 }}>
                  <div>推荐总数 <b style={{ float: "right" }}>{rec.total}</b></div>
                  <div>Top10 <b style={{ float: "right" }}>{rec.top10Count}</b></div>
                  <div>已成交 <b style={{ float: "right" }}>{exec.closedCount}</b></div>
                  <div>已跳过 <b style={{ float: "right" }}>{exec.skippedCount}</b></div>
                  <div>最新交易日 <b style={{ float: "right", color: "#888" }}>{rec.latestTradeDate ?? "—"}</b></div>
                </div>
              </div>
            );
          })()}
          {/* SWING */}
          {(() => {
            const rec = strategyRecommendations.SWING_TRADE, exec = strategyExecutions.SWING_TRADE;
            const sev = strategySeverity(rec, exec);
            return (
              <div style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>波段（SWING_TRADE）</span>
                  <span style={{ color: sevColor[sev], fontSize: 11, fontWeight: 700 }}>{sevLabel3[sev]}</span>
                </div>
                <div style={{ fontSize: 12, lineHeight: 2 }}>
                  <div>推荐总数 <b style={{ float: "right" }}>{rec.total}</b></div>
                  <div>Top10 <b style={{ float: "right" }}>{rec.top10Count}</b></div>
                  <div>当前持仓 <b style={{ float: "right" }}>{exec.openPositions}</b></div>
                  <div>今日新开 <b style={{ float: "right" }}>{exec.newOpensToday}</b></div>
                  <div>今日平仓 <b style={{ float: "right" }}>{exec.closedToday}</b></div>
                </div>
                {(exec.over10 || exec.hasDuplicates) && (
                  <div style={{ fontSize: 10, color: "#ef4444", marginTop: 6 }}>{exec.over10 ? "持仓超10只 " : ""}{exec.hasDuplicates ? "存在重复持仓" : ""}</div>
                )}
              </div>
            );
          })()}
          {/* LONG */}
          {(() => {
            const rec = strategyRecommendations.LONG_TRADE, exec = strategyExecutions.LONG_TRADE;
            const sev = strategySeverity(rec, exec);
            return (
              <div style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>长线（LONG_TRADE）</span>
                  <span style={{ color: sevColor[sev], fontSize: 11, fontWeight: 700 }}>{sevLabel3[sev]}</span>
                </div>
                <div style={{ fontSize: 12, lineHeight: 2 }}>
                  <div>推荐总数 <b style={{ float: "right" }}>{rec.total}</b></div>
                  <div>Top10 <b style={{ float: "right" }}>{rec.top10Count}</b></div>
                  <div>当前持仓 <b style={{ float: "right" }}>{exec.openPositions}</b></div>
                  <div>今日新开 <b style={{ float: "right" }}>{exec.newOpensToday}</b></div>
                  <div>今日平仓 <b style={{ float: "right" }}>{exec.closedToday}</b></div>
                </div>
                {(exec.over10 || exec.hasDuplicates) && (
                  <div style={{ fontSize: 10, color: "#ef4444", marginTop: 6 }}>{exec.over10 ? "持仓超10只 " : ""}{exec.hasDuplicates ? "存在重复持仓" : ""}</div>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {/* ── Backtest / Learning / Validation ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div>
          <div style={sectionTitle}>策略回测 Backtest</div>
          <div style={card}>
            {(["DAY_TRADE", "SWING_TRADE", "LONG_TRADE"] as const).map(k => {
              const b = backtest[k];
              return (
                <div key={k} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid #1a1a1a" }}>
                  <div style={{ fontSize: 11, color: "#888" }}>{STRATEGY_LABEL[k]} · {b.asOfDate ?? "无数据"}</div>
                  <div style={{ fontSize: 11, color: "#666" }}>
                    {b.horizons.length === 0 ? "—" : b.horizons.map(h => `${h.horizon}:${h.maturity}`).join("  ")}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <div style={sectionTitle}>策略学习 Learning</div>
          <div style={card}>
            {(["DAY_TRADE", "SWING_TRADE", "LONG_TRADE"] as const).map(k => {
              const l = learning[k];
              return (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                  <span style={{ color: "#888" }}>{STRATEGY_LABEL[k]}</span>
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
          <div style={sectionTitle}>每日验证 Validation</div>
          <div style={card}>
            <div style={{ fontSize: 12, color: "#888" }}>最新：{validation?.validationDate ?? "—"}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: validation?.allPass ? "#22c55e" : "#ef4444", marginTop: 4 }}>
              {validation ? (validation.allPass ? "9/9 通过" : `${9 - validation.failCount}/9 通过`) : "—"}
            </div>
            <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>
              Incident {validation?.incidentCount ?? 0} · 连续健康 {validation?.consecutiveHealthDays ?? 0} 天
            </div>
            {phase7Progress && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #1a1a1a" }}>
                <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", marginBottom: 4 }}>Phase 7 进度</div>
                <div style={{ fontSize: 11, lineHeight: 1.8 }}>
                  <div>日内 <span style={{ float: "right" }}>{phase7Progress.day.current} / {phase7Progress.day.target}</span></div>
                  <div>波段 <span style={{ float: "right" }}>{phase7Progress.swing.current} / {phase7Progress.swing.target}</span></div>
                  <div>长线 <span style={{ float: "right" }}>{phase7Progress.long.current} / {phase7Progress.long.target}</span></div>
                  <div>Health <span style={{ float: "right" }}>{phase7Progress.health.current} / {phase7Progress.health.target}</span></div>
                  <div>Learning <span style={{ float: "right", color: "#888" }}>
                    {phase7Progress.learning.dayGrade ?? "—"}/{phase7Progress.learning.swingGrade ?? "—"}/{phase7Progress.learning.longGrade ?? "—"}
                  </span></div>
                </div>
                <div style={{ fontSize: 11, color: phase7Progress.ready ? "#22c55e" : "#666", marginTop: 4 }}>
                  {phase7Progress.ready ? "READY 🚀" : (phase7Progress.detail ?? "未就绪")}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Reports + PM2 ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div>
          <div style={sectionTitle}>报告状态 Report</div>
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

      {/* ── Health Detail Card ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={sectionTitle}>
          数据校验详情 Health Detail（PASS {productionStatus.passCount} · WARNING {warningIssues.length} · CRITICAL {criticalIssues.length}）
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={card}>
            <div style={{ fontSize: 11, color: "#ef4444", fontWeight: 700, marginBottom: 6 }}>CRITICAL</div>
            <IssueList issues={criticalIssues} />
          </div>
          <div style={card}>
            <div style={{ fontSize: 11, color: "#f59e0b", fontWeight: 700, marginBottom: 6 }}>WARNING</div>
            <IssueList issues={warningIssues} />
          </div>
        </div>
      </div>

      {/* ── Recent Incidents ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={sectionTitle}>最近事件 Recent Incidents</div>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={th}>时间</th>
              <th style={th}>级别</th>
              <th style={th}>模块</th>
              <th style={th}>标题</th>
              <th style={th}>说明</th>
              <th style={th}>状态</th>
            </tr>
          </thead>
          <tbody>
            {recentIncidents.length === 0 ? (
              <tr><td colSpan={6} style={{ ...cell, color: "#555", textAlign: "center" }}>暂无事件</td></tr>
            ) : recentIncidents.map((inc, idx) => (
              <tr key={idx}>
                <td style={{ ...cell, color: "#888", whiteSpace: "nowrap" }}>{new Date(inc.time).toLocaleString("zh-CN")}</td>
                <td style={{ ...cell, color: sevColor[inc.level], fontWeight: 700 }}>{sevLabel[inc.level]}</td>
                <td style={{ ...cell, color: "#888" }}>{inc.module}</td>
                <td style={cell}>{inc.title}</td>
                <td style={{ ...cell, color: "#888" }}>{inc.description}</td>
                <td style={{ ...cell, color: "#666" }}>{inc.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Footer: version info ── */}
      <div style={{ marginTop: 20, paddingTop: 12, borderTop: "1px solid #222", fontSize: 11, color: "#555" }}>
        <div style={{ marginBottom: 4, color: "#666", textTransform: "uppercase", letterSpacing: "0.06em" }}>版本信息</div>
        schemaVersion={version.schemaVersion ?? "—"} · modelVersion={version.modelVersion ?? "—"} · scoreVersion={version.scoreVersion ?? "—"} · versionSnapshotId={version.versionSnapshotId ?? "—"}
        <div style={{ marginTop: 8, textAlign: "right" }}>计算于 {data.generatedAt}</div>
      </div>
    </div>
  );
}
