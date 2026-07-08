"use client";

// ── /admin/feature-platform · Feature Platform Report（P6-T10）───────────────
// P6 Feature Platform 每日状态总览：平台计数 + Integrity Score + 链路 + Pending Trend
// + Factor Alpha 自动化健康 + TOPIX/benchmark 状态。数据来自 GET /api/admin/feature-platform。
// **只读展示 · 不改任何 Feature 状态/评分/推荐。**

import { useEffect, useState } from "react";
import {
  AppHeader, AppCard, AppKpiCard, AppKpiGrid, AppButton, AppLoading, AppEmptyState, COLORS,
} from "@/components/ui";

interface Report {
  production: number; shadow: number; disabled: number; pending: number; evaluated: number;
  promoteCandidates: number; keepShadow: number; disableCandidates: number;
  avgAlpha: number | null; avgContribution: number | null; avgConfidence: number | null; avgPromotionScore: number | null;
  topFeature: { id: string; score: number } | null; worstFeature: { id: string; score: number } | null;
  pendingByReason: Record<string, number>;
}
interface Issue { code: string; severity: string; detail: string }
interface Integrity { integrityScore: number; issues: Issue[]; checks: { name: string; ok: boolean; note: string }[]; chain: Record<string, number> }
interface Trend { pendingDelta: number | null; promoteDelta: number | null; disableDelta: number | null; avgAlphaDelta: number | null; integrityDelta: number | null; pendingByReasonDelta: Record<string, number>; prevDate: string | null }
interface Hist { date: string; pending: number; integrityScore: number | null; avgPromotionScore: number | null }
interface Api {
  ok: boolean; generatedAt: string; reasonLabels: Record<string, string>;
  report: Report; integrity: Integrity; trend: Trend; history: Hist[];
  factorAlpha: { computedAt: string | null; ageDays: number | null; fresh: boolean; rowCount: number };
  benchmark: { mode: string; topixStatus: string; topixBreak: string | null };
  snapshotPersisted: string | null;
}

const SEV_COLOR: Record<string, string> = { CRITICAL: COLORS.danger, WARNING: COLORS.warning, INFO: COLORS.textMuted };
const CHAIN_LABEL: Record<string, string> = { registry: "Registry", shadow: "Shadow", backtest: "Backtest", factorAlpha: "Factor Alpha", promotion: "Promotion", production: "Production" };

function fmt(v: number | null | undefined, s = "", d = 1): string { return v == null ? "—" : `${Math.round(v * 10 ** d) / 10 ** d}${s}`; }
function delta(v: number | null): { txt: string; color: string } {
  if (v == null) return { txt: "—", color: COLORS.textFaint };
  if (v === 0) return { txt: "±0", color: COLORS.textMuted };
  return v > 0 ? { txt: `+${v}`, color: COLORS.success } : { txt: `${v}`, color: COLORS.danger };
}
function intTone(s: number): string { return s >= 90 ? COLORS.success : s >= 70 ? COLORS.warning : COLORS.danger; }

export default function FeaturePlatformPage() {
  const [d, setD] = useState<Api | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/admin/feature-platform", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as Api;
      if (!j.ok) throw new Error("API 返回异常");
      setD(j);
    } catch (e) { setError(e instanceof Error ? e.message : "加载失败"); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  return (
    <div style={{ minHeight: "100vh", background: COLORS.background }}>
      <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-8 space-y-6">
        <AppHeader title="Feature Platform" titleEn="因子平台总览" status="P6 · V1" statusTone="blue"
          subtitle="P6 Feature Platform 每日状态：平台计数 · Integrity · 链路 · Pending Trend · Factor Alpha 自动化 · Benchmark 状态（只读）" />

        {loading && <AppCard><AppLoading label="加载平台状态…" /></AppCard>}
        {error && !loading && <AppCard><AppEmptyState title="加载失败" desc={error} actions={<AppButton size="sm" onClick={load}>重试</AppButton>} icon="⚠" /></AppCard>}

        {!loading && !error && d && (
          <>
            {/* 平台 KPI */}
            <AppKpiGrid>
              <AppKpiCard label="Production" value={d.report.production} tone="green" sub="正式因子" />
              <AppKpiCard label="Shadow" value={d.report.shadow} tone="amber" sub={`已评估 ${d.report.evaluated}`} />
              <AppKpiCard label="Disabled" value={d.report.disabled} tone="neutral" />
              <AppKpiCard label="Pending" value={d.report.pending} tone="neutral" sub={(() => { const t = delta(d.trend.pendingDelta); return `较昨日 ${t.txt}`; })()} />
              <AppKpiCard label="Integrity Score" value={fmt(d.integrity.integrityScore)} tone={d.integrity.integrityScore >= 90 ? "green" : "amber"} sub={`${d.integrity.issues.length} issues`} />
              <AppKpiCard label="Promotion 候选" value={d.report.promoteCandidates} tone="purple" sub={`Keep ${d.report.keepShadow} · Disable ${d.report.disableCandidates}`} />
            </AppKpiGrid>

            <div style={{ fontSize: 11.5, color: COLORS.textFaint }}>
              更新 {new Date(d.generatedAt).toLocaleString("zh-CN", { hour12: false })} · 最近快照 {d.snapshotPersisted ?? "—"}
              <AppButton size="sm" variant="ghost" onClick={load} style={{ marginLeft: 10 }}>刷新</AppButton>
            </div>

            {/* Integrity 链路 + issues */}
            <AppCard header={<span style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>Production Integrity · 链路完整性</span>}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                {["registry", "shadow", "backtest", "factorAlpha", "promotion", "production"].map((k, i) => (
                  <div key={k} className="flex items-center gap-2">
                    <div style={{ textAlign: "center", padding: "8px 14px", borderRadius: 12, background: COLORS.tile, border: `1px solid ${COLORS.border}` }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: COLORS.text }}>{d.integrity.chain[k] ?? "—"}</div>
                      <div style={{ fontSize: 10.5, color: COLORS.textMuted }}>{CHAIN_LABEL[k]}</div>
                    </div>
                    {i < 5 && <span style={{ color: COLORS.textFaint }}>→</span>}
                  </div>
                ))}
                <div style={{ marginLeft: "auto", textAlign: "right" }}>
                  <div style={{ fontSize: 26, fontWeight: 800, color: intTone(d.integrity.integrityScore) }}>{fmt(d.integrity.integrityScore)}</div>
                  <div style={{ fontSize: 10.5, color: COLORS.textFaint }}>Integrity / 100 {(() => { const t = delta(d.trend.integrityDelta); return `(${t.txt})`; })()}</div>
                </div>
              </div>
              {d.integrity.issues.length === 0 ? (
                <div style={{ fontSize: 12.5, color: COLORS.success }}>✓ 链路无异常（无 Missing / Duplicate / Broken Link / Missing Alpha）</div>
              ) : (
                <div className="space-y-1.5">
                  {d.integrity.issues.map((is, i) => (
                    <div key={i} style={{ fontSize: 12, color: COLORS.textSecondary }}>
                      <span style={{ fontWeight: 700, color: SEV_COLOR[is.severity] ?? COLORS.textMuted }}>[{is.severity}] {is.code}</span> — {is.detail}
                    </div>
                  ))}
                </div>
              )}
            </AppCard>

            {/* Factor Alpha 自动化 + Benchmark */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <AppCard header={<span style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>Factor Alpha 自动化（Cron Health）</span>}>
                <div className="flex items-center gap-3" style={{ marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: d.factorAlpha.fresh ? COLORS.success : COLORS.danger }}>
                    {d.factorAlpha.fresh ? "🟢 新鲜" : "🔴 陈旧"}
                  </span>
                  <span style={{ fontSize: 12, color: COLORS.textSecondary }}>距今 {d.factorAlpha.ageDays ?? "—"} 天 · {d.factorAlpha.rowCount} 行</span>
                </div>
                <div style={{ fontSize: 11.5, color: COLORS.textMuted }}>最后计算 {d.factorAlpha.computedAt ? new Date(d.factorAlpha.computedAt).toLocaleString("zh-CN", { hour12: false }) : "—"} · 每日 09:20 JST cron 自动生成 FactorAlphaResult</div>
              </AppCard>
              <AppCard header={<span style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>Benchmark / TOPIX 状态</span>}>
                <div className="flex items-center gap-3" style={{ marginBottom: 8 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.primary }}>Benchmark: {d.benchmark.mode}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: d.benchmark.topixStatus === "OK" ? COLORS.success : COLORS.warning }}>
                    TOPIX: {d.benchmark.topixStatus === "OK" ? "连续" : "断裂"}
                  </span>
                </div>
                <div style={{ fontSize: 11.5, color: COLORS.textMuted, lineHeight: 1.6 }}>
                  {d.benchmark.topixStatus === "OK"
                    ? "TOPIX 序列连续。因子 alpha 采用等权宇宙基准（因子选择正确基准）。"
                    : `TOPIX 点位序列在 ${d.benchmark.topixBreak ?? "?"} 量纲断裂（P2-020）→ 自动 Fallback 至等权宇宙 benchmark。`}
                </div>
              </AppCard>
            </div>

            {/* 平均指标 + Top/Worst */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <AppCard header={<span style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>平均指标（已评估影子）</span>}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "10px 8px" }}>
                  <Metric label="平均 Alpha(10d)" value={fmt(d.report.avgAlpha, "%", 2)} />
                  <Metric label="平均贡献" value={fmt(d.report.avgContribution, "%")} />
                  <Metric label="平均置信" value={fmt(d.report.avgConfidence)} />
                  <Metric label="平均晋升分" value={fmt(d.report.avgPromotionScore)} />
                </div>
              </AppCard>
              <AppCard header={<span style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>Top / Worst Feature</span>}>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span style={{ fontSize: 12.5, color: COLORS.success, fontWeight: 700 }}>▲ Top</span>
                    <span style={{ fontSize: 12.5, color: COLORS.text }}>{d.report.topFeature?.id ?? "—"} <b>{fmt(d.report.topFeature?.score)}</b></span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span style={{ fontSize: 12.5, color: COLORS.danger, fontWeight: 700 }}>▼ Worst</span>
                    <span style={{ fontSize: 12.5, color: COLORS.text }}>{d.report.worstFeature?.id ?? "—"} <b>{fmt(d.report.worstFeature?.score)}</b></span>
                  </div>
                </div>
              </AppCard>
            </div>

            {/* Pending Trend */}
            <AppCard header={<span style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>Pending Trend · 待补齐样本分类（较 {d.trend.prevDate ?? "—"}）</span>}>
              <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
                {Object.entries(d.report.pendingByReason).map(([code, n]) => {
                  const dl = d.trend.pendingByReasonDelta[code];
                  const t = delta(dl ?? null);
                  return (
                    <div key={code} style={{ fontSize: 12, padding: "6px 12px", borderRadius: 10, background: COLORS.tile, border: `1px solid ${COLORS.border}` }}>
                      <span style={{ color: COLORS.textSecondary }}>{d.reasonLabels[code] ?? code}</span>
                      <span style={{ fontWeight: 800, color: COLORS.text, marginLeft: 6 }}>{n}</span>
                      <span style={{ marginLeft: 6, color: t.color, fontSize: 11 }}>{t.txt}</span>
                    </div>
                  );
                })}
                {Object.keys(d.report.pendingByReason).length === 0 && <span style={{ fontSize: 12, color: COLORS.textFaint }}>无 Pending 因子</span>}
              </div>
              {d.history.length > 1 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 11, color: COLORS.textFaint, marginBottom: 6 }}>历史快照（Pending / Integrity）</div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 40 }}>
                    {d.history.map((h) => {
                      const maxP = Math.max(1, ...d.history.map((x) => x.pending));
                      return (
                        <div key={h.date} title={`${h.date}: pending ${h.pending} · integrity ${h.integrityScore ?? "—"}`}
                          style={{ flex: 1, height: `${(h.pending / maxP) * 100}%`, minHeight: 3, borderRadius: 2, background: COLORS.warning, opacity: 0.7 }} />
                      );
                    })}
                  </div>
                </div>
              )}
            </AppCard>
          </>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, color: COLORS.textFaint, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.text, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}
