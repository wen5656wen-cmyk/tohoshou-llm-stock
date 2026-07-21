"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ROUTES } from "@/lib/routes";

// ── Types ─────────────────────────────────────────────────────────────────────
type Severity = "NORMAL" | "WARNING" | "CRITICAL";
type StepStatus = "SUCCESS" | "WAITING" | "FAILED" | "SKIPPED";

interface PipelineStep {
  key: string; name: string; scheduledLabel: string; status: StepStatus;
  lastRunAt: string | null; lastRunJst: string | null; durationMs: number | null; timeSource?: "DB" | "LOG";
  duration: string | null; resultSummary: string | null; errorMessage: string | null;
}
interface StrategyRecBlock { total: number; top10Count: number; latestTradeDate: string | null; status: Severity }
interface DayExec { lastSettledDate: string | null; tradeResultCount: number; closedCount: number; skippedCount: number; snapshotExists: boolean; pnl: number | null; alpha: number | null }
interface OpenExec { openPositions: number; newOpensToday: number; closedToday: number; snapshotExists: boolean; over10: boolean; hasDuplicates: boolean }
interface BacktestBlock { asOfDate: string | null; horizonCount: number; horizons: Array<{ horizon: string; maturity: string; fillRate: number | null }> }
interface LearningEntry { reportDate: string; grade: string | null; recommendation: string | null }
interface IssueDetail { id: string; name: string; level: Severity; value: string; impact: string; suggestion: string; relatedToCurrentTask: boolean }
interface Incident { time: string; level: Severity; module: string; title: string; description: string; status: string }
interface ArchitectureStatus { version: string; status: string; frozenDate: string; currentMode: string; nextPhase: string; unlocked: boolean }

interface MissionControlV2 {
  productionStatus: { status: Severity; passCount: number; healthWarningCount: number; healthCriticalCount: number; highestSeverity: Severity; reasons: string[]; lastUpdated: string | null };
  todayPipeline: { completedSteps: number; totalSteps: number; completionPct: number; failedCount: number; allDoneToday: boolean; steps: PipelineStep[] };
  dataFreshness: {
    dailyPrice: { latestDate: string | null; lastCompletedDate: string | null; coveragePct: number; stockCount: number; coveredCount: number; failedCount: number; status: Severity };
    news: { latestAt: string | null; todayNewCount: number };
    globalMarket: { latestDate: string | null };
    stockScore: { latestDate: string | null; scoredTodayCount: number };
  };
  strategyRecommendations: { DAY_TRADE: StrategyRecBlock; SWING_TRADE: StrategyRecBlock; LONG_TRADE: StrategyRecBlock };
  strategyExecutions: { DAY_TRADE: DayExec; SWING_TRADE: OpenExec; LONG_TRADE: OpenExec };
  backtest: { DAY_TRADE: BacktestBlock; SWING_TRADE: BacktestBlock; LONG_TRADE: BacktestBlock };
  learning: { DAY_TRADE: LearningEntry | null; SWING_TRADE: LearningEntry | null; LONG_TRADE: LearningEntry | null; unified: { reportDate: string; integrityScore: number | null; grade: string | null; recommendation: string | null } | null };
  validation: { validationDate: string; allPass: boolean; failCount: number; incidentCount: number; consecutiveHealthDays: number; phase7Ready: boolean; phase7Detail: string | null } | null;
  reports: { weekly: { latestFile: string | null; status: Severity }; monthly: { latestFile: string | null; status: Severity } };
  pm2: { available: boolean; web: { status: string; restarts: number; uptimeMs: number | null } | null; cron: { status: string; restarts: number; uptimeMs: number | null } | null; cronStaleAfterDeploy: boolean; cronStaleDeployAt: string | null; severity: Severity };
  health: { status: string; criticalCount: number; warningCount: number; passCount: number; auditAt: string | null; topIssues: string[]; warningIssues: string[] };
  criticalIssues: IssueDetail[];
  warningIssues: IssueDetail[];
  recentIncidents: Incident[];
  architectureStatus: ArchitectureStatus;
  version: { schemaVersion: string | null; modelVersion: string | null; scoreVersion: string | null; versionSnapshotId: string | null };
  generatedAt: string;
}

// ── 调色板由全站 Design Tokens 派生（单一来源，P4-T2）─────────────────────────
import { COLORS, SHADOW as TOK } from "@/lib/design-tokens";
const M = {
  bg: COLORS.background, card: COLORS.card, tile: COLORS.tile, track: COLORS.track, border: COLORS.border,
  ink: COLORS.text, sub: COLORS.textSecondary, muted: COLORS.textMuted, faint: COLORS.textFaint,
  green: COLORS.success, amber: COLORS.warning, red: COLORS.danger, blue: COLORS.primary, purple: COLORS.purple,
};
const SHADOW = TOK.md;
const SHADOW_SM = TOK.sm;
const sevColor: Record<Severity, string> = { NORMAL: M.green, WARNING: M.amber, CRITICAL: M.red };
const sevText: Record<Severity, string> = { NORMAL: "正常", WARNING: "注意", CRITICAL: "异常" };
const stepColor: Record<StepStatus, string> = { SUCCESS: M.green, WAITING: M.amber, FAILED: M.red, SKIPPED: M.faint };
const stepText: Record<StepStatus, string> = { SUCCESS: "成功", WAITING: "等待", FAILED: "失败", SKIPPED: "跳过" };
const STRAT: Record<string, string> = { DAY_TRADE: "日内", SWING_TRADE: "波段", LONG_TRADE: "长线" };
const font = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', Inter, system-ui, sans-serif";

function fmtUptime(ms: number | null): string {
  if (ms == null) return "—";
  const h = Math.floor(ms / 3_600_000), d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
  return `${Math.floor(ms / 60_000)}m`;
}

// ── Primitives ────────────────────────────────────────────────────────────────
function Card({ children, style, className = "" }: { children: React.ReactNode; style?: React.CSSProperties; className?: string }) {
  return <div className={className} style={{ background: M.card, border: `1px solid ${M.border}`, borderRadius: 22, boxShadow: SHADOW, ...style }}>{children}</div>;
}
function Badge({ label, color }: { label: string; color: string }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color, background: `${color}14`, border: `1px solid ${color}29`, padding: "3px 9px", borderRadius: 999 }}><span style={{ width: 6, height: 6, borderRadius: 999, background: color }} />{label}</span>;
}
function Dot({ c }: { c: string }) { return <span style={{ width: 8, height: 8, borderRadius: 999, background: c, boxShadow: `0 0 0 3px ${c}22`, display: "inline-block", flexShrink: 0 }} />; }
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: M.faint, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>{children}</div>;
}
function Kpi({ label, value, sub, color = M.ink, tone }: { label: string; value: string; sub?: string; color?: string; tone?: string }) {
  return (
    <div style={{ background: M.card, border: `1px solid ${M.border}`, borderRadius: 16, boxShadow: SHADOW_SM, padding: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: M.muted }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: tone ?? color, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em", marginTop: 8, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: M.faint, marginTop: 5, fontVariantNumeric: "tabular-nums" }}>{sub}</div>}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function MissionControlPage() {
  const [data, setData] = useState<MissionControlV2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/mission-control");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setLastRefresh(new Date());
      setError(null);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); const id = setInterval(load, 60_000); return () => clearInterval(id); }, [load]);

  if (loading) return <div style={{ background: M.bg, minHeight: "100vh", color: M.faint, padding: 40, fontFamily: font }}>加载中…</div>;
  if (error) return <div style={{ background: M.bg, minHeight: "100vh", color: M.red, padding: 40, fontFamily: font }}>加载失败：{error}</div>;
  if (!data) return null;

  const { todayPipeline, dataFreshness, strategyRecommendations, strategyExecutions, learning, pm2, criticalIssues, architectureStatus, version } = data;
  const arch = architectureStatus;
  const fresh = dataFreshness;
  const healthScore = Math.max(0, Math.min(100, 100 - data.health.criticalCount * 25 - data.health.warningCount * 3));
  const healthy = data.health.criticalCount === 0;
  const scoreVer = version.scoreVersion ?? "adaptive-v3";
  const nextCron = todayPipeline.steps.find((s) => s.status === "WAITING")?.scheduledLabel.replace(" JST", "") ?? "—";
  const webOnline = pm2.web?.status === "online";
  const cronOnline = pm2.cron?.status === "online";

  const kpis = [
    { label: "AI Engine", value: scoreVer, sub: arch.status === "FROZEN" ? "已冻结 · 影子" : arch.currentMode, color: M.blue },
    { label: "Cron", value: cronOnline ? "运行中" : "异常", sub: pm2.cron ? `↺${pm2.cron.restarts} · ${fmtUptime(pm2.cron.uptimeMs)}` : "—", tone: cronOnline ? M.green : M.red },
    { label: "API", value: "正常", sub: "接口响应正常", tone: M.green },
    { label: "Database", value: "正常", sub: "PostgreSQL 连接正常", tone: M.green },
    { label: "Pipeline", value: `${todayPipeline.completedSteps}/${todayPipeline.totalSteps}`, sub: `完成率 ${todayPipeline.completionPct}%`, tone: todayPipeline.failedCount > 0 ? M.red : M.ink },
    { label: "Health", value: `${healthScore}`, sub: `${data.health.status} · ⚠${data.health.warningCount} ✕${data.health.criticalCount}`, tone: healthy ? M.green : M.red },
  ];

  const freshCards = [
    { label: "股票行情", date: fresh.dailyPrice.lastCompletedDate ?? fresh.dailyPrice.latestDate, extra: `覆盖 ${fresh.dailyPrice.coveragePct}%`, sev: fresh.dailyPrice.status },
    { label: "新闻资讯", date: fresh.news.latestAt ? fresh.news.latestAt.slice(0, 10) : null, extra: `今日 ${fresh.news.todayNewCount} 条`, sev: "NORMAL" as Severity },
    { label: "综合评分", date: fresh.stockScore.latestDate, extra: `今日 ${fresh.stockScore.scoredTodayCount} 只`, sev: "NORMAL" as Severity },
    { label: "全球指数", date: fresh.globalMarket.latestDate, extra: "日经 · VIX", sev: "NORMAL" as Severity },
  ];

  const lu = learning.unified;
  const stratWorst = (["DAY_TRADE", "SWING_TRADE", "LONG_TRADE"] as const).reduce<Severity>((acc, k) => {
    const s = strategyRecommendations[k].status;
    return s === "CRITICAL" || acc === "CRITICAL" ? "CRITICAL" : s === "WARNING" || acc === "WARNING" ? "WARNING" : "NORMAL";
  }, "NORMAL");
  const gradeSev = (g: string | null): Severity => (g === "A" || g === "B" ? "NORMAL" : g === "C" ? "WARNING" : "CRITICAL");

  // 五个领域诊断卡（非五个雷同 Warning）
  const domains = [
    { title: "Data Quality", sev: data.health.warningCount > 0 ? ("WARNING" as Severity) : ("NORMAL" as Severity), desc: data.health.warningCount > 0 ? `${data.health.warningCount} 项数据质量告警待复核` : "数据完整性检查通过", href: ROUTES.VERIFY },
    { title: "Pipeline", sev: todayPipeline.failedCount > 0 ? ("CRITICAL" as Severity) : todayPipeline.allDoneToday ? ("NORMAL" as Severity) : ("WARNING" as Severity), desc: `今日流水线 ${todayPipeline.completedSteps}/${todayPipeline.totalSteps} 步完成`, href: ROUTES.DATA_CENTER },
    { title: "Score", sev: fresh.stockScore.scoredTodayCount > 0 ? ("NORMAL" as Severity) : ("WARNING" as Severity), desc: `今日 ${fresh.stockScore.scoredTodayCount} 只已评分 · ${scoreVer}`, href: ROUTES.SHADOW_SCORE },
    { title: "Research", sev: gradeSev(lu?.grade ?? null), desc: lu ? `Learning Grade ${lu.grade ?? "—"} · 就绪度 ${lu.integrityScore?.toFixed(0) ?? "—"}` : "暂无学习报告", href: ROUTES.FUSION_REPORT },
    { title: "Strategy", sev: stratWorst, desc: `三策略 推荐 ${strategyRecommendations.DAY_TRADE.total}/${strategyRecommendations.SWING_TRADE.total}/${strategyRecommendations.LONG_TRADE.total}`, href: ROUTES.STRATEGY_CENTER },
  ];

  const services = [
    { n: "Web", ok: webOnline, extra: pm2.web ? `↺${pm2.web.restarts} · ${fmtUptime(pm2.web.uptimeMs)}` : "—" },
    { n: "Cron", ok: cronOnline, extra: pm2.cron ? `↺${pm2.cron.restarts} · ${fmtUptime(pm2.cron.uptimeMs)}` : "—" },
    { n: "Database", ok: true, extra: "PostgreSQL" },
    { n: "API", ok: true, extra: "REST · 200" },
    { n: "AI Engine", ok: true, extra: scoreVer },
  ];

  return (
    <div style={{ background: M.bg, minHeight: "100vh", color: M.ink, fontFamily: font }}>
      <div style={{ maxWidth: 1600, margin: "0 auto", padding: "28px 28px 48px" }} className="dash-in">

        {/* ── Hero ── */}
        <Card style={{ padding: 24, marginBottom: 22, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 20 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", color: M.ink }}>控制中心</h1>
              <Badge label={healthy ? "Healthy" : "Review"} color={healthy ? M.green : M.amber} />
              <Badge label={`${arch.version} · ${arch.status === "FROZEN" ? "已冻结" : arch.status}`} color={M.blue} />
            </div>
            <p style={{ fontSize: 13, color: M.muted, marginTop: 6 }}>Mission Control · AI 运行状态 · System Health</p>
            <div style={{ display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap", marginTop: 14 }}>
              <div>
                <div style={{ fontSize: 34, fontWeight: 700, color: healthy ? M.green : M.red, letterSpacing: "-0.02em", lineHeight: 1 }}>{healthScore}<span style={{ fontSize: 15, color: M.faint, fontWeight: 600 }}> / 100</span></div>
                <div style={{ fontSize: 11, color: M.faint, marginTop: 4 }}>System Health</div>
              </div>
              <div style={{ width: 1, height: 34, background: M.border }} />
              <div><div style={{ fontSize: 13, fontWeight: 600, color: M.ink, fontVariantNumeric: "tabular-nums" }}>{lastRefresh?.toLocaleTimeString("zh-CN") ?? "—"}</div><div style={{ fontSize: 11, color: M.faint }}>最后同步</div></div>
              <div><div style={{ fontSize: 13, fontWeight: 600, color: M.ink, fontVariantNumeric: "tabular-nums" }}>{nextCron}</div><div style={{ fontSize: 11, color: M.faint }}>下一步 Cron</div></div>
              <div><div style={{ fontSize: 13, fontWeight: 600, color: M.blue }}>{scoreVer}</div><div style={{ fontSize: 11, color: M.faint }}>版本</div></div>
            </div>
          </div>
          <button onClick={load} disabled={refreshing}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: M.ink, background: M.card, border: `1px solid ${M.border}`, borderRadius: 999, padding: "9px 16px", cursor: "pointer", boxShadow: SHADOW_SM }}>
            <span style={{ display: "inline-block", animation: refreshing ? "dash-spin .8s linear infinite" : "none" }}>↻</span> 刷新
          </button>
        </Card>

        {/* ── 6 KPI ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 30 }}>
          {kpis.map((k) => <Kpi key={k.label} {...k} />)}
        </div>

        {/* ── Today's Pipeline · Timeline ── */}
        <div style={{ marginBottom: 30 }}>
          <SectionLabel>Today&apos;s Pipeline · 今日流水线</SectionLabel>
          <Card style={{ padding: "6px 20px" }}>
            {todayPipeline.steps.map((s, i) => {
              const c = stepColor[s.status];
              const last = i === todayPipeline.steps.length - 1;
              return (
                <div key={s.key} style={{ display: "flex", gap: 14, padding: "11px 0", borderBottom: last ? "none" : `1px solid ${M.tile}`, alignItems: "center" }}>
                  <div style={{ width: 78, flexShrink: 0, fontSize: 12, color: M.sub, fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{s.scheduledLabel.replace(" JST", "")}</div>
                  <Dot c={c} />
                  <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ minWidth: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: M.ink }}>{s.name}</span>
                      {s.resultSummary && <span style={{ fontSize: 12, color: M.faint, marginLeft: 10 }}>{s.resultSummary}</span>}
                      {s.errorMessage && <span style={{ fontSize: 12, color: M.red, marginLeft: 10 }}>{s.errorMessage}</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                      {s.duration && <span style={{ fontSize: 11, color: M.faint, fontVariantNumeric: "tabular-nums" }}>{s.duration}</span>}
                      {s.lastRunJst && <span style={{ fontSize: 11, color: M.faint, fontVariantNumeric: "tabular-nums" }} title={`${s.lastRunAt ?? ""}${s.timeSource ? ` · ${s.timeSource}` : ""}`}>{s.lastRunJst.slice(11)}{s.timeSource === "DB" ? " ·DB" : ""}</span>}
                      <span style={{ fontSize: 11, fontWeight: 700, color: c, minWidth: 30, textAlign: "right" }}>{s.status === "SUCCESS" ? "✓" : stepText[s.status]}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </Card>
        </div>

        {/* ── System Warnings · 五领域诊断 ── */}
        <div style={{ marginBottom: 30 }}>
          <SectionLabel>System Warnings · 系统诊断</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
            {domains.map((d) => {
              const c = sevColor[d.sev];
              return (
                <Card key={d.title} style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: M.ink }}>{d.title}</span>
                    <Badge label={sevText[d.sev]} color={c} />
                  </div>
                  <div style={{ fontSize: 12, color: M.sub, lineHeight: 1.5, flex: 1 }}>{d.desc}</div>
                  <Link href={d.href} style={{ fontSize: 12, fontWeight: 600, color: M.blue }}>查看详情 →</Link>
                </Card>
              );
            })}
          </div>
          {criticalIssues.length > 0 && (
            <div style={{ marginTop: 12, fontSize: 12, color: M.red, fontWeight: 600 }}>⚠ 存在 {criticalIssues.length} 项严重问题，请前往数据校验处理。</div>
          )}
        </div>

        {/* ── Data Freshness ── */}
        <div style={{ marginBottom: 30 }}>
          <SectionLabel>Data Freshness · 数据新鲜度</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
            {freshCards.map((f) => (
              <Card key={f.label} style={{ padding: 18 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, color: M.sub, fontWeight: 600 }}>{f.label}</span><Dot c={sevColor[f.sev]} />
                </div>
                <div style={{ fontSize: 19, fontWeight: 700, color: M.ink, fontVariantNumeric: "tabular-nums", marginTop: 10 }}>{f.date ?? "—"}</div>
                <div style={{ fontSize: 11, color: M.faint, marginTop: 4 }}>{f.extra}</div>
              </Card>
            ))}
          </div>
        </div>

        {/* ── Strategy Status ── */}
        <div style={{ marginBottom: 30 }}>
          <SectionLabel>Strategy Status · 三策略</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
            {(["DAY_TRADE", "SWING_TRADE", "LONG_TRADE"] as const).map((k) => {
              const rec = strategyRecommendations[k];
              const exec = strategyExecutions[k] as DayExec & OpenExec;
              const lrn = learning[k];
              const pnl = exec.pnl;
              return (
                <Card key={k} style={{ padding: 18 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: M.ink }}>{STRAT[k]}</span>
                    <Badge label={sevText[rec.status]} color={sevColor[rec.status]} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 14px" }}>
                    <St label="推荐数" value={String(rec.total)} />
                    <St label="持仓" value={String(exec.openPositions ?? exec.closedCount ?? "—")} />
                    <St label="收益" value={pnl == null ? "—" : `${pnl >= 0 ? "+" : ""}${pnl.toFixed(1)}%`} color={pnl == null ? M.ink : pnl >= 0 ? M.green : M.red} />
                    <St label="学习" value={lrn?.grade ?? "—"} />
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        {/* ── System Services ── */}
        <div style={{ marginBottom: 8 }}>
          <SectionLabel>System Services · 系统服务</SectionLabel>
          <Card style={{ padding: 6 }}>
            {services.map((s, i) => (
              <div key={s.n} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderTop: i > 0 ? `1px solid ${M.tile}` : "none" }}>
                <Dot c={s.ok ? M.green : M.red} />
                <span style={{ fontSize: 13, fontWeight: 600, color: M.ink, flex: 1 }}>{s.n}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: s.ok ? M.green : M.red }}>{s.ok ? "正常" : "异常"}</span>
                <span style={{ fontSize: 11, color: M.faint, fontVariantNumeric: "tabular-nums", width: 130, textAlign: "right" }}>{s.extra}</span>
              </div>
            ))}
            {pm2.cronStaleAfterDeploy && <div style={{ fontSize: 11, color: M.amber, padding: "0 16px 10px 40px" }}>⚠ cron 部署后未重启</div>}
          </Card>
          <div style={{ fontSize: 11, color: M.faint, marginTop: 10, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>生成于 {new Date(data.generatedAt).toLocaleString("zh-CN")}</div>
        </div>
      </div>
    </div>
  );
}

function St({ label, value, color = "#1D1D1F" }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: M.tile, border: `1px solid ${M.border}`, borderRadius: 12, padding: "9px 12px" }}>
      <div style={{ fontSize: 11, color: M.muted }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{value}</div>
    </div>
  );
}
