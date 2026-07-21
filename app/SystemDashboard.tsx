"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { getPipelineLabel, getDataSourceLabel } from "@/lib/i18n/system-labels";

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
  universeEnabledCount: number;
  universeExcludedCount: number;
};

type FreshnessSource = {
  name: string;
  latestDate: string | null;
  days: number | null;
  status: "FRESH" | "STALE" | "CRITICAL";
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

function gradeColor(g: "GREEN" | "YELLOW" | "RED"): string {
  return g === "GREEN" ? "#4ade80" : g === "YELLOW" ? "#fbbf24" : "#f87171";
}

function freshnessColor(s: "FRESH" | "STALE" | "CRITICAL"): string {
  return s === "FRESH" ? "#4ade80" : s === "STALE" ? "#fbbf24" : "#f87171";
}

function stageStatusDot(s: string): string {
  return s === "SUCCESS" ? "#4ade80" : s === "FAILED" ? "#f87171" : "#475569";
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
  universeEnabledCount,
  universeExcludedCount,
}: Props) {
  const { t } = useI18n();
  const [mc, setMc] = useState<MissionData | null>(null);
  const [mcError, setMcError] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

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
  const freshness = mc?.freshness;

  // Derived alert list
  const alerts: Array<{ level: "error" | "warn" | "info"; msg: string }> = [];
  if (health?.detail.healthGuardCritical && health.detail.healthGuardCritical > 0) {
    alerts.push({ level: "error", msg: `数据校验 CRITICAL × ${health.detail.healthGuardCritical}` });
  }
  const neverRunStages = pipeline?.stages.filter(s => s.status === "NEVER_RUN") ?? [];
  if (neverRunStages.length > 0) {
    alerts.push({ level: "warn", msg: `流水线 ${neverRunStages.length} 个步骤尚未运行（等待 07:30 JST cron）` });
  }
  if (coverage && coverage.overallCoveragePct === 0 && coverage.totalRows > 0) {
    alerts.push({ level: "warn", msg: `feat_* 覆盖 0%，首批数据预计 2026-06-27 07:30 JST 后产生` });
  }
  if (health && health.score < 50) {
    alerts.push({ level: "warn", msg: `系统健康度偏低（${health.score}/100）— 查看控制中心` });
  }

  return (
    <div style={style}>
      {/* ── Page Title + refresh ──────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>{t("nav.cockpit")}</div>
        <div style={{ fontSize: 11, color: "#334155" }}>
          {lastRefresh ? `${lastRefresh.toLocaleTimeString("zh-CN")} 更新` : "加载中…"}
          {mcError && <span style={{ color: "#f87171", marginLeft: 8 }}>⚠ 无法连接控制中心</span>}
        </div>
      </div>

      {/* ── Status bar ───────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
        <Pill
          label="系统健康度"
          value={health ? `${health.score}/100 ${{ GREEN: "良好", YELLOW: "注意", RED: "异常" }[health.grade] ?? health.grade}` : "—"}
          color={health ? gradeColor(health.grade) : "#475569"}
          href="/admin/mission-control"
        />
        <Pill
          label="数据流水线"
          value={
            !pipeline ? "—"
            : neverRunStages.length === 0 ? "全部运行 ✓"
            : `${pipeline.stages.length - neverRunStages.length}/${pipeline.stages.length} ⚠`
          }
          color={!pipeline ? "#475569" : neverRunStages.length === 0 ? "#4ade80" : "#fbbf24"}
          href="/admin/mission-control"
        />
        <Pill
          label="系统版本"
          value={version?.versionSnapshotId ?? "—"}
          color="#94a3b8"
          href="/admin/versions"
        />
        <Pill
          label="功能覆盖率"
          value={coverage ? `${coverage.overallCoveragePct}%` : "—"}
          color={!coverage ? "#475569" : coverage.overallCoveragePct >= 80 ? "#4ade80" : coverage.overallCoveragePct > 0 ? "#fbbf24" : "#f87171"}
          href="/admin/research"
        />
        <Pill
          label="数据校验"
          value={
            !health ? "—"
            : health.detail.healthGuardStatus === "PASS" ? "正常 ✓"
            : health.detail.healthGuardStatus === "NEVER_RUN" ? "尚未执行"
            : `严重 ×${health.detail.healthGuardCritical}`
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
              <div style={{ fontSize: 10, color: "#64748b", marginBottom: 4 }}>强烈推荐</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#4ade80" }}>{strongBuyCount}</div>
            </div>
            <div style={{ background: "#0a0a0a", borderRadius: 6, padding: "10px 14px", border: "1px solid #1e3a5f" }}>
              <div style={{ fontSize: 10, color: "#64748b", marginBottom: 4 }}>推荐</div>
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

          {/* AI Universe stat card (P1-T1) */}
          <div style={{ borderTop: "1px solid #1e293b", paddingTop: 10, marginTop: 10 }}>
            <div style={{ fontSize: 11, color: "#475569", marginBottom: 6 }}>{t("universe.dash_title")}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div style={{ background: "#0a0a0a", borderRadius: 6, padding: "8px 12px", border: "1px solid #064e3b" }}>
                <div style={{ fontSize: 10, color: "#64748b", marginBottom: 2 }}>{t("universe.dash_enabled")}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#4ade80" }}>{universeEnabledCount.toLocaleString()}</div>
              </div>
              <div style={{ background: "#0a0a0a", borderRadius: 6, padding: "8px 12px", border: "1px solid #78350f" }}>
                <div style={{ fontSize: 10, color: "#64748b", marginBottom: 2 }}>{t("universe.dash_excluded")}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#fbbf24" }}>{universeExcludedCount.toLocaleString()}</div>
              </div>
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
          {/* Alpha Engine 2.0 — admin entries (P2-T1) */}
          <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <Link href="/admin/research?tab=factors" style={{
              display: "block", textAlign: "center", padding: "8px 4px",
              background: "#0a0a0a", border: "1px solid #1e293b", borderRadius: 6,
              color: "#818cf8", fontSize: 11, textDecoration: "none",
            }}>
              ⚡ Factors
            </Link>
            <Link href="/admin/research?tab=alpha&sub=analytics" style={{
              display: "block", textAlign: "center", padding: "8px 4px",
              background: "#0a0a0a", border: "1px solid #1e293b", borderRadius: 6,
              color: "#818cf8", fontSize: 11, textDecoration: "none",
            }}>
              ★ Analytics
            </Link>
            <Link href="/admin/research?tab=alpha&sub=score" style={{
              display: "block", textAlign: "center", padding: "8px 4px",
              background: "#0a0a0a", border: "1px solid #1e293b", borderRadius: 6,
              color: "#a5b4fc", fontSize: 11, textDecoration: "none",
            }}>
              ◈ Score
            </Link>
          </div>
          <div style={{ marginTop: 8 }}>
            <Link href="/admin/research?tab=backtest" style={{
              display: "block", textAlign: "center", padding: "8px 4px",
              background: "#0a0a0a", border: "1px solid #1e293b", borderRadius: 6,
              color: "#6ee7b7", fontSize: 11, textDecoration: "none",
            }}>
              ⚖ Shadow Backtest (Production vs Alpha)
            </Link>
          </div>
          <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Link href="/admin/research?tab=alpha&sub=regime" style={{
              display: "block", textAlign: "center", padding: "8px 4px",
              background: "#0a0a0a", border: "1px solid #1e293b", borderRadius: 6,
              color: "#fbbf24", fontSize: 11, textDecoration: "none",
            }}>
              ◱ Market Regime
            </Link>
            <Link href="/admin/research?tab=alpha&sub=fusion" style={{
              display: "block", textAlign: "center", padding: "8px 4px",
              background: "#0a0a0a", border: "1px solid #1e293b", borderRadius: 6,
              color: "#fbbf24", fontSize: 11, textDecoration: "none",
            }}>
              ⚗ Fusion Report
            </Link>
          </div>
          <div style={{ marginTop: 8 }}>
            <Link href="/admin/research?tab=alpha&sub=fusion" style={{
              display: "block", textAlign: "center", padding: "8px 4px",
              background: "#0a0a0a", border: "1px solid #334155", borderRadius: 6,
              color: "#f0abfc", fontSize: 11, textDecoration: "none",
            }}>
              ◎ Fusion Paper Trading (Production vs Alpha vs Fusion)
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
                  <div style={{ fontSize: 12, color: gradeColor(health.grade), fontWeight: 700 }}>{{ GREEN: "良好", YELLOW: "注意", RED: "异常" }[health.grade] ?? health.grade}</div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  { label: "数据新鲜度", pts: health.components.dataFreshness, max: 25 },
                  { label: "流水线运行", pts: health.components.pipelineStatus, max: 25 },
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
                  → 控制中心详情
                </Link>
              </div>
            </>
          ) : (
            <div style={{ color: "#475569", fontSize: 13 }}>加载中…</div>
          )}
        </Section>

        {/* Col 3: Backtest redirect */}
        <Section title="回测验证">
          <div style={{ color: "#64748b", fontSize: 12, marginBottom: 16, lineHeight: 1.6 }}>
            回测数据请前往「回测验证」查看。
          </div>
          <Link href="/backtest" style={{
            display: "block",
            textAlign: "center",
            padding: "10px",
            background: "#1e3a5f",
            borderRadius: 6,
            color: "#60a5fa",
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
          }}>
            → 查看回测验证
          </Link>
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
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 3 }}>{getDataSourceLabel(src.name)}</div>
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

      {/* ── Pipeline Stage Overview ──────────────────────────────────────────── */}
      {pipeline && (
        <div style={{ marginTop: 16 }}>
          <Section title="流水线阶段状态">
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
                  <span style={{ color: "#64748b" }}>{getPipelineLabel(s.stage)}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10 }}>
              <Link href="/admin/mission-control" style={{ fontSize: 11, color: "#475569", textDecoration: "none" }}>
                → 查看完整流水线日志
              </Link>
            </div>
          </Section>
        </div>
      )}

      <div style={{ marginTop: 12, fontSize: 11, color: "#1e293b" }}>
        每 60 秒自动刷新 · 控制中心数据来源 ·
        {mc ? ` 计算于 ${new Date(mc.computedAt).toLocaleString("zh-CN")}` : ""}
      </div>
    </div>
  );
}
