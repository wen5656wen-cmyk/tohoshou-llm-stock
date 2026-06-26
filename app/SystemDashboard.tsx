"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";

// ── Types ─────────────────────────────────────────────────────────────────────

type Props = {
  activeStockCount: number;
  scoredCount: number;
  strongBuyCount: number;
  buyCount: number;
  totalBuyCount: number;
  validPriceCount: number;
  lastTradingDate: string | null;
  lastComputedAt: string | null;
  lastNewsSyncAt: string | null;
  lastPriceSyncAt: string | null;
};

type BacktestHorizon = {
  horizon: string;
  sampleCount: number;
  filledCount: number;
  winRate: number | null;
  avgReturn: number | null;
  alpha: number | null;
};

type FreshnessSource = {
  name: string;
  latestDate: string | null;
  days: number | null;
  status: "FRESH" | "STALE" | "CRITICAL";
};

type StrategyStatItem = {
  strategyType: string;
  winRate: number | null;
  avgReturnPct: number | null;
  avgAlphaPct: number | null;
  sampleCount: number;
  openRows: number;
};

type StrategyPerf = {
  overall: StrategyStatItem | null;
  byStrategy: { DAY: StrategyStatItem | null; SWING: StrategyStatItem | null; POSITION: StrategyStatItem | null };
  totalRows: number;
};

type MissionData = {
  pipeline: {
    stages: Array<{ stage: string; displayName: string; status: string; lastRunAt: string | null }>;
    totalRuns: number;
  };
  freshness: {
    sources: FreshnessSource[];
    latestRecCount: number;
  };
  featureCoverage: {
    overallCoveragePct: number;
    totalRows: number;
    topMissing: string[];
  };
  version: {
    versionSnapshotId: string | null;
    schemaVersion: string | null;
    modelVersion: string | null;
  };
  backtest: {
    horizons: BacktestHorizon[];
    lastComputedAt: string | null;
  };
  healthScore: {
    score: number;
    grade: "GREEN" | "YELLOW" | "RED";
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
    };
  };
  computedAt: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtPct(v: number | null): string {
  if (v === null || v === undefined) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
}

function gradeColor(g: "GREEN" | "YELLOW" | "RED"): string {
  return g === "GREEN" ? "#4ade80" : g === "YELLOW" ? "#fbbf24" : "#f87171";
}

function freshnessColor(s: "FRESH" | "STALE" | "CRITICAL"): string {
  return s === "FRESH" ? "#4ade80" : s === "STALE" ? "#fbbf24" : "#f87171";
}

function stageStatusDot(s: string): string {
  return s === "SUCCESS" ? "#4ade80" : s === "FAILED" ? "#f87171" : "#475569";
}

// ── Data maturity countdown ───────────────────────────────────────────────────
// Schema v2.3 deployed 2026-06-26. Horizons mature based on trading day accumulation.
const SCHEMA_START = "2026-06-26";
const HORIZON_CAL_DAYS: Record<string, number> = {
  "1d": 4, "3d": 6, "5d": 9, "7d": 12, "10d": 17,
  "20d": 32, "30d": 46, "60d": 92, "90d": 132,
};

function maturityDate(horizon: string): string {
  const d = new Date(SCHEMA_START + "T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + (HORIZON_CAL_DAYS[horizon] ?? 0));
  return d.toISOString().slice(0, 10);
}

function daysUntilMature(horizon: string): number {
  const target = new Date(maturityDate(horizon) + "T00:00:00.000Z").getTime();
  const now = Date.now();
  return Math.max(0, Math.ceil((target - now) / 86_400_000));
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Pill({
  label, value, color, href,
}: { label: string; value: string; color: string; href?: string }) {
  const inner = (
    <div style={{
      background: "#0f172a",
      border: `1px solid ${color}33`,
      borderRadius: 8,
      padding: "10px 16px",
      minWidth: 120,
    }}>
      <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color }}>{value}</div>
    </div>
  );
  return href ? <Link href={href} style={{ textDecoration: "none" }}>{inner}</Link> : inner;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#0f172a", borderRadius: 8, padding: "16px 20px" }}>
      <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: 12 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function SystemDashboard({
  strongBuyCount,
  buyCount,
  totalBuyCount,
  activeStockCount,
  scoredCount,
  lastTradingDate,
}: Props) {
  const { t } = useI18n();
  const [mc, setMc] = useState<MissionData | null>(null);
  const [mcError, setMcError] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [stratPerf, setStratPerf] = useState<StrategyPerf | null>(null);

  const loadMc = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/mission-control");
      if (res.ok) {
        setMc(await res.json());
        setMcError(false);
      } else {
        setMcError(true);
      }
    } catch {
      setMcError(true);
    }
    setLastRefresh(new Date());
  }, []);

  useEffect(() => {
    loadMc();
    const t = setInterval(loadMc, 60_000);
    return () => clearInterval(t);
  }, [loadMc]);

  useEffect(() => {
    fetch("/api/strategy/performance")
      .then((r) => r.ok ? r.json() : null)
      .then((d: StrategyPerf | null) => { if (d) setStratPerf(d); })
      .catch(() => null);
  }, []);

  const style: React.CSSProperties = {
    background: "#0a0a0a",
    color: "#ddd",
    fontFamily: "monospace",
    minHeight: "100vh",
    padding: "24px",
  };

  const health = mc?.healthScore;
  const pipeline = mc?.pipeline;
  const coverage = mc?.featureCoverage;
  const version = mc?.version;
  const backtest = mc?.backtest;
  const freshness = mc?.freshness;

  // Derived alert list
  const alerts: Array<{ level: "error" | "warn" | "info"; msg: string }> = [];
  if (health?.detail.healthGuardCritical && health.detail.healthGuardCritical > 0) {
    alerts.push({ level: "error", msg: `数据校验 CRITICAL × ${health.detail.healthGuardCritical}` });
  }
  const neverRunStages = pipeline?.stages.filter(s => s.status === "NEVER_RUN") ?? [];
  if (neverRunStages.length > 0) {
    alerts.push({ level: "warn", msg: `Pipeline ${neverRunStages.length} 个 Stage 尚未运行（等待 07:30 JST cron）` });
  }
  if (coverage && coverage.overallCoveragePct === 0 && coverage.totalRows > 0) {
    alerts.push({ level: "warn", msg: `feat_* 覆盖 0%，首批数据预计 2026-06-27 07:30 JST 后产生` });
  }
  if (health && health.score < 50) {
    alerts.push({ level: "warn", msg: `Health Score 偏低（${health.score}/100）— 查看 Mission Control` });
  }

  const DISPLAY_HORIZONS = ["1d", "3d", "7d", "30d", "90d"];

  return (
    <div style={style}>
      {/* ── Page Title + refresh ──────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>{t("nav.cockpit")}</div>
        <div style={{ fontSize: 11, color: "#334155" }}>
          {lastRefresh ? `${lastRefresh.toLocaleTimeString("zh-CN")} 更新` : "加载中…"}
          {mcError && <span style={{ color: "#f87171", marginLeft: 8 }}>⚠ 无法连接 Mission Control</span>}
        </div>
      </div>

      {/* ── Status bar ───────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
        <Pill
          label="Health Score"
          value={health ? `${health.score}/100 ${health.grade}` : "—"}
          color={health ? gradeColor(health.grade) : "#475569"}
          href="/admin/mission-control"
        />
        <Pill
          label="Pipeline"
          value={
            !pipeline ? "—"
            : neverRunStages.length === 0 ? "全部运行 ✓"
            : `${pipeline.stages.length - neverRunStages.length}/${pipeline.stages.length} ⚠`
          }
          color={!pipeline ? "#475569" : neverRunStages.length === 0 ? "#4ade80" : "#fbbf24"}
          href="/admin/mission-control"
        />
        <Pill
          label="VersionSnapshot"
          value={version?.versionSnapshotId ?? "—"}
          color="#94a3b8"
          href="/admin/versions"
        />
        <Pill
          label="feat_* Coverage"
          value={coverage ? `${coverage.overallCoveragePct}%` : "—"}
          color={!coverage ? "#475569" : coverage.overallCoveragePct >= 80 ? "#4ade80" : coverage.overallCoveragePct > 0 ? "#fbbf24" : "#f87171"}
          href="/admin/research"
        />
        <Pill
          label="数据校验"
          value={
            !health ? "—"
            : health.detail.healthGuardStatus === "PASS" ? "PASS ✓"
            : health.detail.healthGuardStatus === "NEVER_RUN" ? "未运行"
            : `CRITICAL ×${health.detail.healthGuardCritical}`
          }
          color={
            !health ? "#475569"
            : health.detail.healthGuardStatus === "PASS" ? "#4ade80"
            : health.detail.healthGuardStatus === "NEVER_RUN" ? "#64748b"
            : "#f87171"
          }
          href="/admin/verify"
        />
      </div>

      {/* ── Alerts ───────────────────────────────────────────────────────────── */}
      {alerts.length > 0 && (
        <div style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 6 }}>
          {alerts.map((a, i) => (
            <div key={i} style={{
              background: a.level === "error" ? "#1a0000" : "#1a1200",
              border: `1px solid ${a.level === "error" ? "#f87171" : "#fbbf24"}`,
              borderRadius: 6,
              padding: "8px 14px",
              fontSize: 12,
              color: a.level === "error" ? "#f87171" : "#fbbf24",
            }}>
              {a.level === "error" ? "✗" : "⚠"} {a.msg}
            </div>
          ))}
        </div>
      )}

      {/* ── Main 3-column grid ────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>

        {/* Col 1: Today's AI Picks */}
        <Section title="今日 AI 推荐">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            <div style={{ background: "#0a0a0a", borderRadius: 6, padding: "10px 14px", border: "1px solid #052e16" }}>
              <div style={{ fontSize: 10, color: "#64748b", marginBottom: 4 }}>STRONG_BUY</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#4ade80" }}>{strongBuyCount}</div>
            </div>
            <div style={{ background: "#0a0a0a", borderRadius: 6, padding: "10px 14px", border: "1px solid #1e3a5f" }}>
              <div style={{ fontSize: 10, color: "#64748b", marginBottom: 4 }}>BUY</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#60a5fa" }}>{buyCount}</div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
            合计 <span style={{ color: totalBuyCount > 0 ? "#e2e8f0" : "#475569", fontWeight: 700 }}>{totalBuyCount}</span> 支
            &nbsp;·&nbsp;最新行情日 <span style={{ color: "#94a3b8" }}>{lastTradingDate ?? "—"}</span>
          </div>
          <div style={{ borderTop: "1px solid #1e293b", paddingTop: 10 }}>
            <div style={{ fontSize: 11, color: "#475569", marginBottom: 6 }}>覆盖市场</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>
              活跃股：<span style={{ color: "#94a3b8" }}>{activeStockCount.toLocaleString()}</span>
              &nbsp;·&nbsp;有效评分：<span style={{ color: "#94a3b8" }}>{scoredCount.toLocaleString()}</span>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <Link href="/screener" style={{
              display: "block",
              textAlign: "center",
              padding: "8px",
              background: "#1e293b",
              borderRadius: 6,
              color: "#94a3b8",
              fontSize: 12,
              textDecoration: "none",
            }}>
              → 查看 AI 选股完整排行
            </Link>
          </div>
        </Section>

        {/* Col 2: Health Score Breakdown */}
        <Section title="系统健康度">
          {health ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <div style={{ fontSize: 40, fontWeight: 700, color: gradeColor(health.grade) }}>
                  {health.score}
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "#64748b" }}>/ 100</div>
                  <div style={{ fontSize: 12, color: gradeColor(health.grade), fontWeight: 700 }}>{health.grade}</div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  { label: "数据新鲜度", pts: health.components.dataFreshness, max: 25 },
                  { label: "Pipeline 运行", pts: health.components.pipelineStatus, max: 25 },
                  { label: "feat_* 覆盖", pts: health.components.featureCoverage, max: 25 },
                  { label: "数据校验", pts: health.components.healthGuard, max: 25 },
                ].map(({ label, pts, max }) => (
                  <div key={label}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                      <span style={{ color: "#64748b" }}>{label}</span>
                      <span style={{ color: pts >= max * 0.6 ? "#94a3b8" : "#fbbf24" }}>{pts}/{max}</span>
                    </div>
                    <div style={{ background: "#1e293b", borderRadius: 3, height: 4, overflow: "hidden" }}>
                      <div style={{
                        background: pts >= max * 0.8 ? "#4ade80" : pts >= max * 0.4 ? "#fbbf24" : "#f87171",
                        width: `${(pts / max) * 100}%`,
                        height: "100%",
                        borderRadius: 3,
                        transition: "width 0.5s ease",
                      }} />
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12 }}>
                <Link href="/admin/mission-control" style={{
                  display: "block",
                  textAlign: "center",
                  padding: "8px",
                  background: "#1e293b",
                  borderRadius: 6,
                  color: "#94a3b8",
                  fontSize: 12,
                  textDecoration: "none",
                }}>
                  → Mission Control 详情
                </Link>
              </div>
            </>
          ) : (
            <div style={{ color: "#475569", fontSize: 13 }}>加载中…</div>
          )}
        </Section>

        {/* Col 3: Backtest Horizon Summary */}
        <Section title="回测摘要（v2.3）">
          {backtest ? (
            <>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", color: "#475569", fontSize: 10, paddingBottom: 8 }}>Horizon</th>
                    <th style={{ textAlign: "right", color: "#475569", fontSize: 10, paddingBottom: 8 }}>胜率</th>
                    <th style={{ textAlign: "right", color: "#475569", fontSize: 10, paddingBottom: 8 }}>收益</th>
                    <th style={{ textAlign: "right", color: "#475569", fontSize: 10, paddingBottom: 8 }}>N</th>
                  </tr>
                </thead>
                <tbody>
                  {DISPLAY_HORIZONS.map(h => {
                    const row = backtest.horizons.find(r => r.horizon === h);
                    const pending = !row || row.filledCount === 0;
                    return (
                      <tr key={h} style={{ opacity: pending ? 0.45 : 1 }}>
                        <td style={{ padding: "4px 0", color: "#e2e8f0", fontWeight: 600 }}>{h}</td>
                        <td style={{
                          textAlign: "right", padding: "4px 0",
                          color: pending ? "#475569" : (row?.winRate ?? 0) >= 50 ? "#4ade80" : "#f87171",
                        }}>
                          {pending ? "待数据" : `${row?.winRate?.toFixed(1)}%`}
                        </td>
                        <td style={{
                          textAlign: "right", padding: "4px 0",
                          color: pending ? "#475569" : (row?.avgReturn ?? 0) > 0 ? "#4ade80" : "#f87171",
                        }}>
                          {pending ? "—" : fmtPct(row?.avgReturn ?? null)}
                        </td>
                        <td style={{ textAlign: "right", padding: "4px 0", color: "#64748b" }}>
                          {row?.filledCount ?? 0}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ marginTop: 12 }}>
                <Link href="/backtest" style={{
                  display: "block",
                  textAlign: "center",
                  padding: "8px",
                  background: "#1e293b",
                  borderRadius: 6,
                  color: "#94a3b8",
                  fontSize: 12,
                  textDecoration: "none",
                }}>
                  → 回测验证完整报告
                </Link>
              </div>
            </>
          ) : (
            <div style={{ color: "#475569", fontSize: 13 }}>加载中…</div>
          )}
        </Section>
      </div>

      {/* ── Data Freshness ────────────────────────────────────────────────────── */}
      <Section title="数据新鲜度">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {(freshness?.sources ?? []).map(src => (
            <div key={src.name} style={{
              background: "#0a0a0a",
              border: `1px solid ${freshnessColor(src.status)}44`,
              borderRadius: 6,
              padding: "8px 14px",
              minWidth: 130,
            }}>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 3 }}>{src.name}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: freshnessColor(src.status) }}>
                {src.latestDate ?? "—"}
              </div>
              <div style={{ fontSize: 10, color: "#475569" }}>
                {src.days === null ? "无数据" : src.days === 0 ? "今日" : `${src.days}天前`}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Three-Strategy Win Rate (v15.0) ──────────────────────────────────── */}
      <div style={{ marginTop: 16 }}>
        <Section title="三策略胜率（v15.0）">
          {stratPerf && stratPerf.totalRows > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
              {([
                { key: "overall" as const,   label: "综合",    alloc: "",    color: "#94a3b8" },
                { key: "DAY"     as const,   label: "日内",    alloc: "30%", color: "#f59e0b" },
                { key: "SWING"   as const,   label: "波段",    alloc: "40%", color: "#3b82f6" },
                { key: "POSITION"as const,   label: "趋势",    alloc: "30%", color: "#10b981" },
              ]).map(({ key, label, alloc, color }) => {
                const s = key === "overall" ? stratPerf.overall : stratPerf.byStrategy[key];
                if (!s) return (
                  <div key={key} style={{ background: "#0a0a0a", borderRadius: 8, padding: "10px 14px", border: `1px solid ${color}22` }}>
                    <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>{label}{alloc && <span style={{ color: "#475569", marginLeft: 6 }}>{alloc}</span>}</div>
                    <div style={{ fontSize: 11, color: "#334155" }}>数据积累中</div>
                  </div>
                );
                const winColor = s.winRate == null ? "#475569" : s.winRate >= 55 ? "#4ade80" : s.winRate >= 45 ? "#fbbf24" : "#f87171";
                const retColor = s.avgReturnPct == null ? "#475569" : s.avgReturnPct > 0 ? "#4ade80" : "#f87171";
                return (
                  <div key={key} style={{ background: "#0a0a0a", borderRadius: 8, padding: "10px 14px", border: `1px solid ${color}33` }}>
                    <div style={{ fontSize: 11, color, marginBottom: 6, fontWeight: 700 }}>
                      {label}{alloc && <span style={{ color: "#475569", fontWeight: 400, marginLeft: 6 }}>{alloc}</span>}
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: winColor }}>
                      {s.winRate != null ? `${s.winRate.toFixed(1)}%` : "—"}
                    </div>
                    <div style={{ fontSize: 10, color: "#475569", marginTop: 2, marginBottom: 6 }}>胜率</div>
                    <div style={{ fontSize: 12, color: retColor }}>
                      {s.avgReturnPct != null ? `${s.avgReturnPct > 0 ? "+" : ""}${s.avgReturnPct.toFixed(2)}%` : "—"} 均收
                    </div>
                    <div style={{ fontSize: 10, color: "#475569", marginTop: 4 }}>
                      样本 {s.sampleCount}
                      {s.openRows > 0 && <span style={{ marginLeft: 6, color: "#334155" }}>持仓 {s.openRows}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ color: "#334155", fontSize: 12 }}>
              尚无策略回测数据 — 运行 <span style={{ color: "#64748b", fontFamily: "monospace" }}>npm run strategy-backtest</span> 填充
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            <Link href="/backtest" style={{ fontSize: 11, color: "#475569", textDecoration: "none" }}>
              → 三策略回测完整报告
            </Link>
          </div>
        </Section>
      </div>

      {/* ── Data Maturity Countdown ──────────────────────────────────────────── */}
      <div style={{ marginTop: 16 }}>
        <Section title="回测数据成熟度倒计时（schema-v2.3，起点 2026-06-26）">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
            {["1d", "7d", "20d", "30d", "90d"].map(h => {
              const daysLeft = daysUntilMature(h);
              const mDate = maturityDate(h);
              const ready = daysLeft === 0;
              const bpRow = backtest?.horizons.find(r => r.horizon === h);
              const filledCount = bpRow?.filledCount ?? 0;
              return (
                <div key={h} style={{
                  background: ready ? "#052e16" : "#0a0a0a",
                  border: `1px solid ${ready ? "#4ade80" : "#1e293b"}`,
                  borderRadius: 6,
                  padding: "10px 14px",
                  textAlign: "center",
                }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: ready ? "#4ade80" : "#94a3b8", marginBottom: 4 }}>{h}</div>
                  <div style={{ fontSize: 10, color: ready ? "#4ade80" : "#475569" }}>
                    {ready ? "✓ 就绪" : `${daysLeft}天后`}
                  </div>
                  <div style={{ fontSize: 10, color: "#334155", marginTop: 2 }}>{mDate}</div>
                  <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>已填 {filledCount}</div>
                </div>
              );
            })}
          </div>
        </Section>
      </div>

      {/* ── Pipeline Stage Overview ──────────────────────────────────────────── */}
      {pipeline && (
        <div style={{ marginTop: 16 }}>
          <Section title="Pipeline 阶段状态">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {pipeline.stages.map(s => (
                <div key={s.stage} style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: "#0a0a0a",
                  border: "1px solid #1e293b",
                  borderRadius: 6,
                  padding: "5px 10px",
                  fontSize: 11,
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: stageStatusDot(s.status), display: "inline-block", flexShrink: 0 }} />
                  <span style={{ color: "#64748b" }}>{s.displayName}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10 }}>
              <Link href="/admin/mission-control" style={{ fontSize: 11, color: "#475569", textDecoration: "none" }}>
                → 查看完整 Pipeline 日志
              </Link>
            </div>
          </Section>
        </div>
      )}

      <div style={{ marginTop: 12, fontSize: 11, color: "#1e293b" }}>
        每 60 秒自动刷新 · Mission Control 数据来源 ·
        {mc ? ` 计算于 ${new Date(mc.computedAt).toLocaleString("zh-CN")}` : ""}
      </div>
    </div>
  );
}
