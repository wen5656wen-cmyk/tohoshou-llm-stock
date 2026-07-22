"use client";

// ── P22-S1 · Production Monitor（生产统一巡检中心）───────────────────────────
//
// 新增独立页面，**不修改任何现有页面 / IA / 导航**。通过独立 URL
// /admin/production-monitor 访问，AuthGate 保护（ADMIN_ONLY）。
//
// 全部数据来自只读聚合 API /api/admin/production-monitor —— 真实运行时痕迹，
// 无编造。数据源缺失时如实显示「—」或「未接入」，不填假值。
//
// 七区域：Alert（最上，最重要）→ System / Data / Pipeline / Cron / Deployment → History。

import { useEffect, useState, useCallback } from "react";
import { useI18n } from "@/lib/i18n";
import { AppCard, AppBadge, AppLoading, COLORS } from "@/components/ui";

/* eslint-disable @typescript-eslint/no-explicit-any */

const fmtMs = (ms: number | null | undefined) =>
  ms == null ? "—" : ms < 1000 ? `${ms}ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s`;
const fmtJst = (iso: string | null | undefined) => {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  } catch { return "—"; }
};

// 纯 SVG sparkline（无依赖）。values 空→占位。
function Spark({ values, color, height = 34 }: { values: number[]; color: string; height?: number }) {
  if (!values.length) return <div className="text-[11px]" style={{ color: COLORS.textFaint }}>—</div>;
  const w = 160, h = height, min = Math.min(...values), max = Math.max(...values);
  const rng = max - min || 1;
  const pts = values.map((v, i) => {
    const x = values.length === 1 ? w / 2 : (i / (values.length - 1)) * w;
    const y = h - ((v - min) / rng) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function KV({ k, v, tone }: { k: string; v: React.ReactNode; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-[12px]" style={{ color: COLORS.textFaint }}>{k}</span>
      <span className="text-[13px] font-medium tabular-nums" style={{ color: tone ?? COLORS.text }}>{v}</span>
    </div>
  );
}

const statusTone = (s: string | null | undefined): string =>
  s === "SUCCESS" || s === "PASS" ? COLORS.success : s === "FAILED" || s === "FAIL" ? COLORS.danger : s === "SKIPPED" ? COLORS.textFaint : COLORS.warning;

export default function ProductionMonitor() {
  const { t } = useI18n();
  const tx = t as (k: string) => string;
  // 告警文案由前端按语言渲染（API 只给 code + params）。{x} 占位用 params 填充。
  const alertMsg = (code: string, params: Record<string, any> = {}) =>
    Object.entries(params).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), tx(`pm.alert.${code}`));
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true); setErr(null);
    fetch("/api/admin/production-monitor", { cache: "no-store", credentials: "same-origin" })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(j => setData(j))
      .catch(e => setErr(String(e.message ?? e)))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading && !data) return <div className="dash-font" style={{ background: COLORS.background, minHeight: "100vh" }}><div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8"><AppLoading label={tx("pm.title")} /></div></div>;
  if (err && !data) return <div className="dash-font" style={{ background: COLORS.background, minHeight: "100vh" }}><div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-14 text-center"><div className="text-[15px] font-semibold">{tx("pm.title")}</div><div className="text-[12px] mt-1.5" style={{ color: COLORS.danger }}>{tx("pm.loadError")}: {err}</div></div></div>;

  const d = data;
  const p0 = d.alerts.filter((a: any) => a.level === "P0");
  const p1 = d.alerts.filter((a: any) => a.level === "P1");
  const p2 = d.alerts.filter((a: any) => a.level === "P2");
  const overall = p0.length > 0 ? "P0" : p1.length > 0 ? "P1" : "OK";
  const overallTone = overall === "P0" ? COLORS.danger : overall === "P1" ? COLORS.warning : COLORS.success;

  const hist = d.history;
  const covVals = hist.coverage.map((r: any) => r.pct);
  const healthCritVals = hist.health.map((r: any) => r.critical);
  const rlVals = hist.rateLimit.map((r: any) => r.rateLimit);
  const pipeVals = hist.pipeline.map((r: any) => r.successRate);

  return (
    <div className="dash-font" style={{ background: COLORS.background, minHeight: "100vh" }}>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-4">

        {/* 顶部：标题 + 整体状态 + 刷新 */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[19px] font-bold tracking-tight" style={{ color: COLORS.text }}>{tx("pm.title")}</div>
            <div className="text-[11px] mt-0.5" style={{ color: COLORS.textFaint }}>{tx("pm.subtitle")} · {tx("pm.asOf")} {fmtJst(d.generatedAt)} JST</div>
          </div>
          <div className="flex items-center gap-2">
            <AppBadge tone={overall === "P0" ? "red" : overall === "P1" ? "amber" : "green"}>{overall === "OK" ? tx("pm.healthy") : overall}</AppBadge>
            <button onClick={load} className="h-8 px-3 rounded-lg text-[12px] font-semibold" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.text }}>{tx("pm.refresh")}</button>
          </div>
        </div>

        {/* ═══ ① ALERT（最上）═══ */}
        <AppCard header={<div className="flex items-center gap-2"><span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>🔔 {tx("pm.sec.alert")}</span><span className="text-[11px]" style={{ color: COLORS.textFaint }}>P0 {p0.length} · P1 {p1.length} · P2 {p2.length}</span></div>}>
          {d.alerts.length === 0 ? (
            <div className="text-[13px]" style={{ color: COLORS.success }}>✓ {tx("pm.noAlert")}</div>
          ) : (
            <div className="space-y-1.5">
              {[...p0, ...p1, ...p2].map((a: any, i: number) => (
                <div key={i} className="flex items-start gap-2.5 text-[12px]">
                  <AppBadge tone={a.level === "P0" ? "red" : a.level === "P1" ? "amber" : "neutral"}>{a.level}</AppBadge>
                  <span className="font-mono text-[11px] mt-0.5" style={{ color: COLORS.textFaint }}>{a.code}</span>
                  <span className="mt-0.5" style={{ color: COLORS.textSecondary }}>{alertMsg(a.code, a.params)}</span>
                </div>
              ))}
            </div>
          )}
        </AppCard>

        {/* ═══ ②③④⑤ 网格 ═══ */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {/* System */}
          <AppCard header={<span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>🖥 {tx("pm.sec.system")}</span>}>
            <KV k={tx("pm.db")} v={d.system.database.ok ? `${tx("pm.online")} · ${fmtMs(d.system.database.latencyMs)}` : tx("pm.offline")} tone={d.system.database.ok ? (d.system.database.latencyMs > 500 ? COLORS.warning : COLORS.success) : COLORS.danger} />
            <KV k="BUILD_ID" v={<span className="font-mono text-[11px]">{d.system.buildId ?? "—"}</span>} />
            <KV k={tx("pm.schema")} v={d.system.schema.strategy} />
            <KV k={tx("pm.appVer")} v={<span className="text-[11px]" style={{ color: COLORS.textFaint }}>package {d.system.appVersion ?? "—"}</span>} />
          </AppCard>

          {/* Data */}
          <AppCard header={<span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>📊 {tx("pm.sec.data")}</span>}>
            <KV k={tx("pm.coverage")} v={`${d.data.coverage.pct}% (${d.data.coverage.covered}/${d.data.coverage.total})`} tone={d.data.coverage.pct < 80 ? COLORS.danger : d.data.coverage.pct < 95 ? COLORS.warning : COLORS.success} />
            <KV k={tx("pm.covDate")} v={d.data.coverage.date ?? "—"} />
            <KV k={tx("pm.scoreLatest")} v={fmtJst(d.data.stockScore.latestComputedAt)} />
            <KV k={tx("pm.scoreNull")} v={d.data.stockScore.nullCount} tone={d.data.stockScore.nullCount > 0 ? COLORS.danger : COLORS.success} />
            <KV k={tx("pm.rl429")} v={d.data.rateLimit429.today} tone={d.data.rateLimit429.today > 100 ? COLORS.warning : COLORS.text} />
          </AppCard>

          {/* Pipeline */}
          <AppCard header={<span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>🔄 {tx("pm.sec.pipeline")}</span>}>
            {[["pm.p1", d.pipeline.phase1], ["pm.retry", d.pipeline.retry], ["pm.p2", d.pipeline.phase2], ["pm.phealth", d.pipeline.health]].map(([k, ph]: any) => (
              <KV key={k} k={tx(k)} v={ph ? `${ph.status} · ${fmtMs(ph.durationMs)}` : tx("pm.notRun")} tone={ph ? statusTone(ph.status) : COLORS.textFaint} />
            ))}
            <KV k={tx("pm.pTotal")} v={`${d.pipeline.total} · ${tx("pm.failed")} ${d.pipeline.failed}`} tone={d.pipeline.failed > 0 ? COLORS.danger : COLORS.textSecondary} />
          </AppCard>

          {/* Cron */}
          <AppCard header={<span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>⏱ {tx("pm.sec.cron")}</span>}>
            <KV k={tx("pm.cronLast")} v={fmtJst(d.cron.lastRunAt)} />
            <KV k={tx("pm.cronLabel")} v={<span className="text-[11px]">{d.cron.lastLabel ?? "—"}</span>} />
            <KV k={tx("pm.cronDur")} v={fmtMs(d.cron.lastDurationMs)} />
            <KV k={tx("pm.cronRate")} v={d.cron.successRate7d != null ? `${d.cron.successRate7d}%` : "—"} tone={d.cron.successRate7d != null && d.cron.successRate7d < 90 ? COLORS.warning : COLORS.success} />
          </AppCard>

          {/* Deployment */}
          <AppCard header={<span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>🚀 {tx("pm.sec.deploy")}</span>}>
            {d.deployment ? (<>
              <KV k="Commit" v={<span className="font-mono text-[11px]">{d.deployment.commitHash}</span>} />
              <KV k={tx("pm.deployAt")} v={fmtJst(d.deployment.deployedAt)} />
              <KV k="Build" v={d.deployment.buildStatus} tone={statusTone(d.deployment.buildStatus)} />
              <KV k="Health" v={d.deployment.healthStatus} tone={statusTone(d.deployment.healthStatus)} />
              <KV k={tx("pm.prodReady")} v={d.deployment.productionReady ? "✓" : "✗"} tone={d.deployment.productionReady ? COLORS.success : COLORS.danger} />
            </>) : <div className="text-[12px]" style={{ color: COLORS.textFaint }}>—</div>}
          </AppCard>

          {/* Health snapshot */}
          <AppCard header={<span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>🩺 {tx("pm.sec.health")}</span>}>
            {d.health ? (<>
              <KV k="CRITICAL" v={d.health.critical} tone={d.health.critical > 0 ? COLORS.danger : COLORS.success} />
              <KV k="WARNING" v={d.health.warning} tone={d.health.warning > 0 ? COLORS.warning : COLORS.success} />
              <KV k="PASS" v={d.health.pass} tone={COLORS.success} />
              <KV k={tx("pm.allowRec")} v={d.health.allowRecommendation ? "✓" : "✗"} tone={d.health.allowRecommendation ? COLORS.success : COLORS.danger} />
              <KV k={tx("pm.healthAt")} v={fmtJst(d.health.auditAt)} />
            </>) : <div className="text-[12px]" style={{ color: COLORS.textFaint }}>{tx("pm.notRun")}</div>}
          </AppCard>
        </div>

        {/* ═══ ⑦ HISTORY（30 天趋势）═══ */}
        <AppCard header={<div className="flex items-center gap-2"><span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>📈 {tx("pm.sec.history")}</span><span className="text-[11px]" style={{ color: COLORS.textFaint }}>{tx("pm.last30")}</span></div>}>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
            {[
              { label: tx("pm.trCoverage"), vals: covVals, color: COLORS.primary, last: covVals.length ? `${covVals[covVals.length - 1]}%` : "—", n: covVals.length },
              { label: tx("pm.trHealthCrit"), vals: healthCritVals, color: COLORS.danger, last: healthCritVals.length ? String(healthCritVals[healthCritVals.length - 1]) : "—", n: healthCritVals.length },
              { label: tx("pm.tr429"), vals: rlVals, color: COLORS.warning, last: rlVals.length ? String(rlVals[rlVals.length - 1]) : "—", n: rlVals.length },
              { label: tx("pm.trPipeline"), vals: pipeVals, color: COLORS.success, last: pipeVals.length ? `${pipeVals[pipeVals.length - 1]}%` : "—", n: pipeVals.length },
            ].map((tr, i) => (
              <div key={i}>
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-[12px]" style={{ color: COLORS.textSecondary }}>{tr.label}</span>
                  <span className="text-[13px] font-semibold tabular-nums" style={{ color: tr.color }}>{tr.last}</span>
                </div>
                <Spark values={tr.vals} color={tr.color} />
                <div className="text-[10px] mt-1" style={{ color: COLORS.textFaint }}>{tr.n} {tx("pm.points")}</div>
              </div>
            ))}
          </div>
        </AppCard>

        <div className="text-[10px] text-center pb-4" style={{ color: COLORS.textFaint }}>
          {tx("pm.footer")}
        </div>
      </div>
    </div>
  );
}
