"use client";

// 运营看板（P17 Track 1）· Deep Research 运营中心 · 只消费现有 Job/Version/Review/Report/Claim/Evidence/Industry
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { AppLoading } from "@/components/ui";
import { COLORS } from "@/lib/decision/ds";
import ResearchSubNav from "./ResearchSubNav";

/* eslint-disable @typescript-eslint/no-explicit-any */
const JST: Record<string, string> = { SUCCESS: COLORS.success, FAILED: COLORS.danger, RUNNING: COLORS.primary, RETRYING: COLORS.warning, PENDING: COLORS.textMuted };

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 11 }}><span style={{ fontSize: 13.5, fontWeight: 800 }}>{title}</span>{hint && <span style={{ fontSize: 10.5, color: COLORS.textFaint }}>{hint}</span>}</div>
      {children}
    </div>
  );
}
const KV = ({ l, v, c }: { l: string; v: any; c?: string }) => (
  <div><div className="tabular-nums" style={{ fontSize: 19, fontWeight: 800, color: c ?? COLORS.text }}>{v ?? 0}</div><div style={{ fontSize: 10.5, color: COLORS.textMuted, marginTop: 1 }}>{l}</div></div>
);
const grid = (n = 100) => ({ display: "grid", gridTemplateColumns: `repeat(auto-fit,minmax(${n}px,1fr))`, gap: 11 } as const);

export default function ResearchDashboard() {
  const { t } = useI18n();
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { fetch("/api/research/dashboard", { cache: "no-store", headers: { "x-admin-token": localStorage.getItem("llmstock_admin_token") ?? "" } }).then((r) => r.json()).then((j) => { setD(j); setLoading(false); }).catch(() => setLoading(false)); }, []);

  if (loading) return <div className="max-w-[1300px] mx-auto px-6 py-10"><ResearchSubNav /><AppLoading label="dashboard" /></div>;
  if (!d) return <div className="max-w-[1300px] mx-auto px-6 py-10"><ResearchSubNav /></div>;

  return (
    <div className="max-w-[1300px] mx-auto px-4 sm:px-6 py-5" style={{ color: COLORS.text }}>
      <ResearchSubNav />
      <h1 style={{ fontSize: 21, fontWeight: 800, marginBottom: 13 }}>📊 {t("dr.nav.dashboard")}</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 14, alignItems: "start" }}>

        {/* 1 研究任务 */}
        <Card title={t("dr.db.jobs")} hint={`${t("dr.db.avgDur")} ${d.jobs.avgDurationMs ? (d.jobs.avgDurationMs / 1000).toFixed(1) + "s" : "—"}`}>
          <div style={grid(72)}>
            <KV l={t("dr.db.running")} v={d.jobs.running} c={COLORS.primary} /><KV l={t("dr.db.waiting")} v={d.jobs.waiting} /><KV l={t("dr.db.retry")} v={d.jobs.retry} c={COLORS.warning} /><KV l={t("dr.db.failed")} v={d.jobs.failed} c={COLORS.danger} /><KV l={t("dr.db.success")} v={d.jobs.success} c={COLORS.success} />
          </div>
          {d.jobs.recent?.length ? (
            <div style={{ marginTop: 11, paddingTop: 10, borderTop: `1px solid ${COLORS.borderSoft}`, maxHeight: 150, overflowY: "auto" }}>
              {d.jobs.recent.slice(0, 8).map((j: any) => (
                <div key={j.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 11, padding: "3px 0" }}>
                  <span style={{ fontWeight: 700, color: JST[j.status] ?? COLORS.textMuted, minWidth: 60 }}>{j.status}</span>
                  <span style={{ color: COLORS.textMuted }}>{j.jobType}</span>
                  <span>{j.industryKey ?? j.targetKey ?? ""}</span>
                  {j.attempt > 1 && <span style={{ color: COLORS.warning }}>×{j.attempt}</span>}
                  <span style={{ marginLeft: "auto", color: COLORS.textFaint }}>{j.durationMs ? (j.durationMs / 1000).toFixed(1) + "s" : ""}</span>
                </div>
              ))}
            </div>
          ) : <div style={{ fontSize: 11.5, color: COLORS.textFaint, marginTop: 9 }}>{t("dr.db.noJobs")}</div>}
        </Card>

        {/* 2 AI 提供方 */}
        <Card title={t("dr.db.provider")} hint={`${t("dr.db.successRate")} ${d.provider.successRate ?? "—"}%`}>
          <div style={{ fontSize: 12.5 }}>
            <div>{t("dr.db.current")}: <b>{d.provider.current}</b></div>
            <div style={{ color: COLORS.textMuted, marginTop: 4 }}>strong: {d.provider.strongModel ?? "—"} · daily: {d.provider.dailyModel ?? "—"} · default: {d.provider.defaultModel ?? "—"}</div>
            <div style={{ marginTop: 5, display: "flex", gap: 12, fontSize: 11.5 }}>
              <span style={{ color: d.provider.anthropicConfigured ? COLORS.success : COLORS.textFaint }}>● Anthropic {d.provider.anthropicConfigured ? t("dr.db.configured") : t("dr.db.notSet")}</span>
              <span style={{ color: d.provider.openaiConfigured ? COLORS.success : COLORS.textFaint }}>● OpenAI {d.provider.openaiConfigured ? t("dr.db.configured") : t("dr.db.notSet")}</span>
            </div>
            <div style={{ marginTop: 9, display: "flex", gap: 14, flexWrap: "wrap" }}>{d.provider.usageByProvider.map((p: any) => <span key={p.provider} className="tabular-nums" style={{ fontSize: 11.5 }}><b>{p.count}</b> <span style={{ color: COLORS.textMuted }}>{p.provider}</span></span>)}</div>
          </div>
        </Card>

        {/* 3 Token 与成本 */}
        <Card title={t("dr.db.tokenCost")}>
          <div style={grid(80)}>
            <KV l={`${t("dr.db.today")} $`} v={d.tokenCost.today.cost} c={COLORS.primary} /><KV l={`${t("dr.db.week")} $`} v={d.tokenCost.week.cost} /><KV l={`${t("dr.db.month")} $`} v={d.tokenCost.month.cost} /><KV l={`${t("dr.db.month")} tok`} v={d.tokenCost.month.tokens} />
          </div>
          {d.tokenCost.byIndustry?.length ? <div style={{ marginTop: 10, paddingTop: 9, borderTop: `1px solid ${COLORS.borderSoft}`, fontSize: 11.5 }}>{d.tokenCost.byIndustry.slice(0, 5).map((x: any) => <div key={x.industryKey} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}><span style={{ color: COLORS.textMuted }}>{x.industryKey}</span><span className="tabular-nums">${x.cost}</span></div>)}</div> : null}
        </Card>

        {/* 4 新鲜度 */}
        <Card title={t("dr.db.freshness")} hint={`${t("dr.db.industry")} ${t("dr.db.avg")} ${d.freshness.industry.avgFreshness ?? "—"}`}>
          {[[t("dr.db.industry"), d.freshness.industry], [t("dr.db.company"), d.freshness.company], [t("dr.db.technology"), d.freshness.technology]].map(([l, f]: any, i: number) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "5px 0", borderTop: i ? `1px solid ${COLORS.borderSoft}` : "none" }}>
              <span style={{ fontWeight: 700, minWidth: 56 }}>{l}</span>
              <span style={{ color: COLORS.textMuted }}>{t("dr.db.total")} {f.total}</span>
              <span style={{ marginLeft: "auto", color: f.overdue ? COLORS.danger : COLORS.textFaint }}>{t("dr.db.overdue")} {f.overdue}</span>
              <span style={{ color: f.upcomingReview ? COLORS.warning : COLORS.textFaint }}>{t("dr.db.reviewSoon")} {f.upcomingReview}</span>
            </div>
          ))}
        </Card>

        {/* 5 审核 */}
        <Card title={t("dr.db.review")} hint={`${t("dr.db.pending")} ${d.review.pending}`}>
          <div style={grid(74)}>
            <KV l={t("dr.db.pending")} v={d.review.byStatus?.PENDING ?? 0} c={COLORS.warning} /><KV l={t("dr.db.approved")} v={d.review.byStatus?.APPROVED ?? 0} c={COLORS.success} /><KV l={t("dr.db.rejected")} v={d.review.byStatus?.REJECTED ?? 0} c={COLORS.danger} />
            <KV l={t("dr.db.reqChanges")} v={d.review.byAction?.REQUEST_CHANGES ?? 0} />
          </div>
        </Card>

        {/* 6 证据 */}
        <Card title={t("dr.db.evidence")} hint={`${t("dr.db.coverage")} ${d.evidence.coverage ?? "—"}%`}>
          <div style={grid(74)}>
            <KV l="Claims" v={d.evidence.claims} c={COLORS.primary} /><KV l="Evidence" v={d.evidence.evidence} c={COLORS.success} /><KV l={t("dr.db.noEvidence")} v={d.evidence.noEvidenceClaims} c={d.evidence.noEvidenceClaims ? COLORS.danger : COLORS.textMuted} /><KV l={`${t("dr.db.coverage")}%`} v={d.evidence.coverage} />
          </div>
          <div style={{ height: 6, borderRadius: 3, background: COLORS.track, marginTop: 11 }}><div style={{ height: "100%", width: `${d.evidence.coverage ?? 0}%`, borderRadius: 3, background: (d.evidence.coverage ?? 0) >= 95 ? COLORS.success : COLORS.warning }} /></div>
        </Card>

        {/* 7 系统健康 */}
        <Card title={t("dr.db.health")} hint={`${t("dr.db.queue")} ${d.systemHealth.queue.depth}`}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px", fontSize: 12 }}>
            {[["Benchmark", d.systemHealth.benchmark], ["Daily", d.systemHealth.daily], ["Weekly", d.systemHealth.weekly], ["Trigger", d.systemHealth.trigger]].map(([l, h]: any, i: number) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: 4, background: h ? (h.byStatus?.FAILED ? COLORS.danger : COLORS.success) : COLORS.border }} /><span>{l}</span><span style={{ marginLeft: "auto", color: COLORS.textFaint }}>{h ? h.total : t("dr.db.idle")}</span></div>
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: 4, background: d.systemHealth.scheduler.available ? COLORS.success : COLORS.danger }} /><span>{t("dr.db.scheduler")}</span><span style={{ marginLeft: "auto", color: COLORS.textFaint }}>{d.systemHealth.scheduler.lock}</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: 4, background: d.systemHealth.queue.depth ? COLORS.warning : COLORS.success }} /><span>{t("dr.db.queue")}</span><span style={{ marginLeft: "auto", color: COLORS.textFaint }}>{d.systemHealth.queue.depth}</span></div>
          </div>
        </Card>
      </div>
    </div>
  );
}
