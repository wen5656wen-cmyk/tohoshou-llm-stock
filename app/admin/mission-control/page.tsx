"use client";

import { useEffect, useState, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────
type Severity = "NORMAL" | "WARNING" | "CRITICAL";
type StepStatus = "SUCCESS" | "WAITING" | "FAILED" | "SKIPPED";

interface PipelineStep {
  key: string; name: string; scheduledLabel: string; status: StepStatus;
  lastRunAt: string | null; lastRunJst: string | null; durationMs: number | null;
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

// ── Palette (Grafana × GitHub Actions × Linear dark) ──────────────────────────
const M = {
  bg: "#111315", card: "#171A1F", cardHi: "#1C2028", border: "#262B33", borderHi: "#323944",
  ink: "#E6E8EB", sub: "#9BA1A9", faint: "#6B7280",
  green: "#34C759", amber: "#FF9F0A", red: "#FF453A", blue: "#0A84FF",
};
const sevColor: Record<Severity, string> = { NORMAL: M.green, WARNING: M.amber, CRITICAL: M.red };
const sevText: Record<Severity, string> = { NORMAL: "正常", WARNING: "注意", CRITICAL: "异常" };
const stepColor: Record<StepStatus, string> = { SUCCESS: M.green, WAITING: M.amber, FAILED: M.red, SKIPPED: M.faint };
const stepText: Record<StepStatus, string> = { SUCCESS: "成功", WAITING: "等待", FAILED: "失败", SKIPPED: "跳过" };
const STRAT: Record<string, string> = { DAY_TRADE: "日内", SWING_TRADE: "波段", LONG_TRADE: "长线" };

// 显示层翻译（不改 API 返回值）——运维审计项名称 / 阶段 / 原因文案
const ISSUE_ZH: Record<string, string> = {
  high52w_10x_price: "52周高点 > 股价×10（疑似异常）",
  low52w_too_low: "52周低点 < 股价÷20（疑似异常）",
  return20d_extreme: "20日收益 |>100%| 或 < -70%",
  return60d_extreme: "60日收益极端值（>300% 或 < -90%）",
  day_trade_result_recent_coverage: "日内交易结果近期覆盖",
};
function issueName(i: IssueDetail) { return ISSUE_ZH[i.id] ?? i.name; }
function zhVal(v: string) {
  return v
    .replace(/genuine/gi, "真实").replace(/suspect/gi, "可疑")
    .replace(/consecutive day\(s\) missing/gi, "天连续缺失").replace(/missing/gi, "缺失");
}
const PHASE_ZH: Record<string, string> = { "Phase 7 AI Strategy Optimization": "阶段7 · AI 策略优化" };
function phaseZh(s: string) { return PHASE_ZH[s] ?? s.replace(/^Phase\s*(\d+)/i, "阶段$1"); }
function reasonZh(s: string) { return s.replace(/^health:data\s+WARNING=/i, "数据健康检查 · 警告 ").replace(/^health:data\s+CRITICAL=/i, "数据健康检查 · 严重 "); }

const font = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', Inter, system-ui, sans-serif";

function fmtUptime(ms: number | null): string {
  if (ms == null) return "—";
  const h = Math.floor(ms / 3_600_000), d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
  return `${Math.floor(ms / 60_000)}m`;
}

// ── Primitives ────────────────────────────────────────────────────────────────
function DCard({ children, style, className = "" }: { children: React.ReactNode; style?: React.CSSProperties; className?: string }) {
  return <div className={className} style={{ background: M.card, border: `1px solid ${M.border}`, borderRadius: 16, ...style }}>{children}</div>;
}
function Badge({ label, color }: { label: string; color: string }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color, background: `${color}1f`, padding: "3px 9px", borderRadius: 999, letterSpacing: "0.02em" }}><span style={{ width: 6, height: 6, borderRadius: 999, background: color }} />{label}</span>;
}
function Dot({ c }: { c: string }) { return <span style={{ width: 8, height: 8, borderRadius: 999, background: c, boxShadow: `0 0 0 3px ${c}22`, display: "inline-block", flexShrink: 0 }} />; }
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: M.faint, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12 }}>{children}</div>;
}

function StatusCard({ title, code, sev, metric, metricUnit, sub, pct, footer }: {
  title: string; code: string; sev: Severity; metric: string; metricUnit?: string; sub?: string; pct?: number; footer?: string;
}) {
  const color = sevColor[sev];
  return (
    <DCard style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: M.ink }}>{title}</div>
          <div style={{ fontSize: 10, color: M.faint, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 2 }}>{code}</div>
        </div>
        <Badge label={sevText[sev]} color={color} />
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 14 }}>
        <span style={{ fontSize: 34, fontWeight: 700, color: M.ink, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em", lineHeight: 1 }}>{metric}</span>
        {metricUnit && <span style={{ fontSize: 13, color: M.faint, fontWeight: 600 }}>{metricUnit}</span>}
      </div>
      {sub && <div style={{ fontSize: 12, color: M.sub, marginTop: 4 }}>{sub}</div>}
      {pct != null && (
        <div style={{ marginTop: 12, height: 5, borderRadius: 999, background: "#0d0f12", overflow: "hidden" }}>
          <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: "100%", background: color, transition: "width .4s ease" }} />
        </div>
      )}
      {footer && <div style={{ fontSize: 11, color: M.faint, marginTop: 10, fontVariantNumeric: "tabular-nums" }}>{footer}</div>}
    </DCard>
  );
}

function AlertItem({ issue }: { issue: IssueDetail }) {
  const [open, setOpen] = useState(false);
  const color = sevColor[issue.level];
  return (
    <div style={{ borderRadius: 12, border: `1px solid ${M.border}`, background: M.cardHi, overflow: "hidden" }}>
      <button onClick={() => setOpen((o) => !o)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
        <span style={{ fontSize: 14, color }}>{issue.level === "CRITICAL" ? "✕" : "⚠"}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: M.ink, flex: 1 }}>{issueName(issue)}</span>
        <span style={{ fontSize: 11, color: M.faint, fontVariantNumeric: "tabular-nums" }}>{zhVal(issue.value)}</span>
        <span style={{ fontSize: 10, color, fontWeight: 700 }}>{sevText[issue.level]}</span>
        <span style={{ color: M.faint, fontSize: 11, transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }}>▾</span>
      </button>
      {open && (
        <div style={{ padding: "0 14px 12px 34px", fontSize: 12, color: M.sub, lineHeight: 1.6 }}>
          <div><span style={{ color: M.faint }}>影响：</span>{issue.impact}</div>
          <div style={{ marginTop: 3 }}><span style={{ color: M.faint }}>建议：</span>{issue.suggestion}</div>
        </div>
      )}
    </div>
  );
}

function EmptyOk({ text }: { text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 18px", borderRadius: 12, border: `1px solid ${M.green}33`, background: `${M.green}0d` }}>
      <span style={{ width: 26, height: 26, borderRadius: 999, background: `${M.green}22`, color: M.green, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>✓</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: M.green }}>{text}</span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function MissionControlPage() {
  const [data, setData] = useState<MissionControlV2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
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

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    const tick = setInterval(() => setNowTick(Date.now()), 15_000);
    return () => { clearInterval(id); clearInterval(tick); };
  }, [load]);

  if (loading) return <div style={{ background: M.bg, minHeight: "100vh", color: M.faint, padding: 40, fontFamily: font }}>加载中…</div>;
  if (error) return <div style={{ background: M.bg, minHeight: "100vh", color: M.red, padding: 40, fontFamily: font }}>错误：{error}</div>;
  if (!data) return null;

  const { productionStatus, todayPipeline, dataFreshness, strategyRecommendations, strategyExecutions, learning, validation, pm2, criticalIssues, warningIssues, architectureStatus, version } = data;
  const stale = lastRefresh ? (nowTick - lastRefresh.getTime()) > 5 * 60_000 : false;
  const arch = architectureStatus;
  const fresh = dataFreshness;

  const freshCards = [
    { label: "股票行情", date: fresh.dailyPrice.lastCompletedDate ?? fresh.dailyPrice.latestDate, extra: `覆盖 ${fresh.dailyPrice.coveragePct}%`, sev: fresh.dailyPrice.status },
    { label: "综合评分", date: fresh.stockScore.latestDate, extra: `今日 ${fresh.stockScore.scoredTodayCount}`, sev: "NORMAL" as Severity },
    { label: "新闻资讯", date: fresh.news.latestAt ? fresh.news.latestAt.slice(0, 10) : null, extra: `今日 ${fresh.news.todayNewCount}`, sev: "NORMAL" as Severity },
    { label: "全球指数", date: fresh.globalMarket.latestDate, extra: "日经 · VIX", sev: "NORMAL" as Severity },
  ];
  const strat = (["DAY_TRADE", "SWING_TRADE", "LONG_TRADE"] as const);

  return (
    <div style={{ background: M.bg, minHeight: "100vh", color: M.ink, fontFamily: font }}>
      <div style={{ maxWidth: 1600, margin: "0 auto", padding: "20px 24px 40px" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 22 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>控制中心</div>
            <div style={{ fontSize: 12, color: M.faint, marginTop: 2 }}>TOHOSHOU AI 运维驾驶舱 · 交易架构 {arch.version}</div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Badge label={`${arch.version} · ${arch.status === "FROZEN" ? "已冻结 🔒" : arch.status}`} color={M.blue} />
            {version.scoreVersion && <span style={{ fontSize: 11, color: M.sub, fontFamily: "monospace" }}>评分 {version.scoreVersion}</span>}
            {version.versionSnapshotId && <span style={{ fontSize: 11, color: M.faint, fontFamily: "monospace" }}>#{version.versionSnapshotId}</span>}
            <button onClick={load} disabled={refreshing}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: M.ink, background: M.card, border: `1px solid ${M.border}`, borderRadius: 999, padding: "7px 14px", cursor: "pointer" }}>
              <span style={{ display: "inline-block", animation: refreshing ? "dash-spin .8s linear infinite" : "none" }}>↻</span> 刷新
            </button>
            <div style={{ textAlign: "right", fontSize: 10, color: stale ? M.amber : M.faint, fontVariantNumeric: "tabular-nums" }}>
              <div>上次同步 {lastRefresh?.toLocaleTimeString("zh-CN")}</div>
              <div>自动 60s{stale ? " · ⚠ 超 5 分钟" : ""}</div>
            </div>
          </div>
        </div>

        {/* ── First screen: 4 Status Cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, marginBottom: 26 }}>
          <StatusCard title="生产状态" code="任务状态" sev={productionStatus.status}
            metric={`${productionStatus.passCount}`} metricUnit="项通过"
            sub={`⚠ ${productionStatus.healthWarningCount} · ✕ ${productionStatus.healthCriticalCount}`}
            footer={productionStatus.reasons[0] ? reasonZh(productionStatus.reasons[0]) : "系统运行正常"} />
          <StatusCard title="交易架构" code={arch.version} sev={arch.status === "FROZEN" ? "NORMAL" : "WARNING"}
            metric={arch.status === "FROZEN" ? "已冻结" : arch.status} sub={arch.currentMode}
            footer={`冻结 ${arch.frozenDate} · 下一步 ${phaseZh(arch.nextPhase)}`} />
          <StatusCard title="数据流水线" code="今日" sev={todayPipeline.failedCount > 0 ? "CRITICAL" : todayPipeline.allDoneToday ? "NORMAL" : "WARNING"}
            metric={`${todayPipeline.completedSteps}/${todayPipeline.totalSteps}`} metricUnit="步"
            pct={todayPipeline.completionPct} footer={todayPipeline.allDoneToday ? "全部完成 ✓" : `完成率 ${todayPipeline.completionPct}%`} />
          <StatusCard title="每日校验" code="每日" sev={validation ? (validation.allPass ? "NORMAL" : "WARNING") : "WARNING"}
            metric={validation ? `${9 - validation.failCount}/9` : "—"} metricUnit="通过"
            sub={validation ? `连续健康 ${validation.consecutiveHealthDays} 天` : "暂无验证"}
            footer={validation ? `${validation.validationDate}${validation.phase7Ready ? " · 阶段7 就绪" : ""}` : undefined} />
        </div>

        {/* ── Pipeline Timeline (GitHub Actions style) ── */}
        <div style={{ marginBottom: 26 }}>
          <SectionLabel>数据流水线 · 时间线</SectionLabel>
          <DCard style={{ padding: "6px 18px" }}>
            {todayPipeline.steps.map((s, i) => {
              const c = stepColor[s.status];
              const last = i === todayPipeline.steps.length - 1;
              return (
                <div key={s.key} style={{ display: "flex", gap: 14, padding: "10px 0", borderBottom: last ? "none" : `1px solid ${M.border}` }}>
                  <div style={{ width: 80, flexShrink: 0, fontSize: 12, color: M.sub, fontVariantNumeric: "tabular-nums", fontFamily: "monospace" }}>{s.scheduledLabel.replace(" JST", "")}</div>
                  <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}><Dot c={c} /></div>
                  <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ minWidth: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: M.ink }}>{s.name}</span>
                      {s.resultSummary && <span style={{ fontSize: 12, color: M.faint, marginLeft: 10 }}>{s.resultSummary}</span>}
                      {s.errorMessage && <span style={{ fontSize: 12, color: M.red, marginLeft: 10 }}>{s.errorMessage}</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                      {s.duration && <span style={{ fontSize: 11, color: M.faint, fontVariantNumeric: "tabular-nums" }}>{s.duration}</span>}
                      {s.lastRunJst && <span style={{ fontSize: 11, color: M.faint, fontVariantNumeric: "tabular-nums" }}>{s.lastRunJst.slice(11)}</span>}
                      <span style={{ fontSize: 11, fontWeight: 700, color: c }}>{s.status === "SUCCESS" ? "✓" : stepText[s.status]}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </DCard>
        </div>

        {/* ── Warnings + Critical (two columns) ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 26 }} className="mc-2col">
          <div>
            <SectionLabel>警告（{warningIssues.length}）</SectionLabel>
            {warningIssues.length === 0 ? <EmptyOk text="无警告" /> : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{warningIssues.map((i) => <AlertItem key={i.id} issue={i} />)}</div>
            )}
          </div>
          <div>
            <SectionLabel>严重（{criticalIssues.length}）</SectionLabel>
            {criticalIssues.length === 0 ? <EmptyOk text="无严重问题" /> : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{criticalIssues.map((i) => <AlertItem key={i.id} issue={i} />)}</div>
            )}
          </div>
        </div>

        {/* ── Data freshness ── */}
        <div style={{ marginBottom: 26 }}>
          <SectionLabel>数据新鲜度</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
            {freshCards.map((f) => (
              <DCard key={f.label} style={{ padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, color: M.sub, fontWeight: 600 }}>{f.label}</span><Dot c={sevColor[f.sev]} />
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: M.ink, fontVariantNumeric: "tabular-nums", marginTop: 8 }}>{f.date ?? "—"}</div>
                <div style={{ fontSize: 11, color: M.faint, marginTop: 3 }}>{f.extra}</div>
              </DCard>
            ))}
          </div>
        </div>

        {/* ── Strategy + System ── */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20 }} className="mc-2col">
          <div>
            <SectionLabel>三策略</SectionLabel>
            <DCard style={{ padding: 18 }}>
              {strat.map((k, i) => {
                const rec = strategyRecommendations[k];
                const exec = strategyExecutions[k] as DayExec & OpenExec;
                const lrn = learning[k];
                return (
                  <div key={k} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderBottom: i === 2 ? "none" : `1px solid ${M.border}` }}>
                    <span style={{ width: 44, fontSize: 13, fontWeight: 700, color: M.ink }}>{STRAT[k]}</span>
                    <Badge label={sevText[rec.status]} color={sevColor[rec.status]} />
                    <div style={{ flex: 1, display: "flex", gap: 18, fontSize: 12, color: M.sub, fontVariantNumeric: "tabular-nums", flexWrap: "wrap" }}>
                      <span>推荐 <b style={{ color: M.ink }}>{rec.total}</b></span>
                      <span>持仓 <b style={{ color: M.ink }}>{exec.openPositions ?? "—"}</b></span>
                      <span>学习 <b style={{ color: M.ink }}>{lrn?.grade ?? "—"}</b></span>
                      {rec.latestTradeDate && <span style={{ color: M.faint }}>{rec.latestTradeDate}</span>}
                    </div>
                  </div>
                );
              })}
            </DCard>
          </div>
          <div>
            <SectionLabel>系统进程</SectionLabel>
            <DCard style={{ padding: 18 }}>
              {[{ n: "tohoshou-web", p: pm2.web }, { n: "tohoshou-cron", p: pm2.cron }].map(({ n, p }) => (
                <div key={n} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: n === "tohoshou-web" ? `1px solid ${M.border}` : "none" }}>
                  <Dot c={p?.status === "online" ? M.green : M.red} />
                  <span style={{ fontSize: 12, fontFamily: "monospace", color: M.ink, flex: 1 }}>{n}</span>
                  <span style={{ fontSize: 11, color: M.faint, fontVariantNumeric: "tabular-nums" }}>{p ? `↺${p.restarts} · ${fmtUptime(p.uptimeMs)}` : "—"}</span>
                </div>
              ))}
              {pm2.cronStaleAfterDeploy && <div style={{ fontSize: 11, color: M.amber, marginTop: 8 }}>⚠ cron 部署后未重启</div>}
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${M.border}`, fontSize: 11, color: M.faint, fontVariantNumeric: "tabular-nums" }}>
                生成于 {new Date(data.generatedAt).toLocaleString("zh-CN")}
              </div>
            </DCard>
          </div>
        </div>
      </div>

      <style>{`@media (max-width: 900px){ .mc-2col{ grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
