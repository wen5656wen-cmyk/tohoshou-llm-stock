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
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: "13px 15px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}><span style={{ fontSize: 12.5, fontWeight: 800 }}>{title}</span>{hint && <span style={{ fontSize: 10, color: COLORS.textFaint }}>{hint}</span>}</div>
      {children}
    </div>
  );
}
const KV = ({ l, v, c }: { l: string; v: any; c?: string }) => (
  <div><div className="tabular-nums" style={{ fontSize: 18, fontWeight: 800, color: c ?? COLORS.text }}>{v ?? 0}</div><div style={{ fontSize: 9.5, color: COLORS.textFaint }}>{l}</div></div>
);
const grid = (n = 100) => ({ display: "grid", gridTemplateColumns: `repeat(auto-fit,minmax(${n}px,1fr))`, gap: 10 } as const);

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
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>📊 {t("dr.nav.dashboard")}</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 14, alignItems: "start" }}>

        {/* 1 Research Jobs */}
        <Card title="Research Jobs" hint={`avg ${d.jobs.avgDurationMs ? (d.jobs.avgDurationMs / 1000).toFixed(1) + "s" : "—"}`}>
          <div style={grid(72)}>
            <KV l="Running" v={d.jobs.running} c={COLORS.primary} /><KV l="Waiting" v={d.jobs.waiting} /><KV l="Retry" v={d.jobs.retry} c={COLORS.warning} /><KV l="Failed" v={d.jobs.failed} c={COLORS.danger} /><KV l="Success" v={d.jobs.success} c={COLORS.success} />
          </div>
          {d.jobs.recent?.length ? (
            <div style={{ marginTop: 10, paddingTop: 9, borderTop: `1px solid ${COLORS.borderSoft}`, maxHeight: 150, overflowY: "auto" }}>
              {d.jobs.recent.slice(0, 8).map((j: any) => (
                <div key={j.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 10.5, padding: "3px 0" }}>
                  <span style={{ fontWeight: 700, color: JST[j.status] ?? COLORS.textMuted, minWidth: 58 }}>{j.status}</span>
                  <span style={{ color: COLORS.textMuted }}>{j.jobType}</span>
                  <span>{j.industryKey ?? j.targetKey ?? ""}</span>
                  {j.attempt > 1 && <span style={{ color: COLORS.warning }}>×{j.attempt}</span>}
                  <span style={{ marginLeft: "auto", color: COLORS.textFaint }}>{j.durationMs ? (j.durationMs / 1000).toFixed(1) + "s" : ""}</span>
                </div>
              ))}
            </div>
          ) : <div style={{ fontSize: 11, color: COLORS.textFaint, marginTop: 8 }}>no jobs yet</div>}
        </Card>

        {/* 2 Provider */}
        <Card title="Provider" hint={`success ${d.provider.successRate ?? "—"}%`}>
          <div style={{ fontSize: 12 }}>
            <div>Current: <b>{d.provider.current}</b></div>
            <div style={{ color: COLORS.textMuted, marginTop: 3 }}>strong: {d.provider.strongModel ?? "—"} · daily: {d.provider.dailyModel ?? "—"} · default: {d.provider.defaultModel ?? "—"}</div>
            <div style={{ marginTop: 4, display: "flex", gap: 10, fontSize: 11 }}>
              <span style={{ color: d.provider.anthropicConfigured ? COLORS.success : COLORS.textFaint }}>● Anthropic {d.provider.anthropicConfigured ? "configured" : "not set"}</span>
              <span style={{ color: d.provider.openaiConfigured ? COLORS.success : COLORS.textFaint }}>● OpenAI {d.provider.openaiConfigured ? "configured" : "not set"}</span>
            </div>
            <div style={{ marginTop: 8, display: "flex", gap: 14, flexWrap: "wrap" }}>{d.provider.usageByProvider.map((p: any) => <span key={p.provider} className="tabular-nums" style={{ fontSize: 11 }}><b>{p.count}</b> <span style={{ color: COLORS.textMuted }}>{p.provider}</span></span>)}</div>
          </div>
        </Card>

        {/* 3 Token & Cost */}
        <Card title="Token & Cost">
          <div style={grid(80)}>
            <KV l="Today $" v={d.tokenCost.today.cost} c={COLORS.primary} /><KV l="Week $" v={d.tokenCost.week.cost} /><KV l="Month $" v={d.tokenCost.month.cost} /><KV l="Month tok" v={d.tokenCost.month.tokens} />
          </div>
          {d.tokenCost.byIndustry?.length ? <div style={{ marginTop: 9, paddingTop: 8, borderTop: `1px solid ${COLORS.borderSoft}`, fontSize: 11 }}>{d.tokenCost.byIndustry.slice(0, 5).map((x: any) => <div key={x.industryKey} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}><span style={{ color: COLORS.textMuted }}>{x.industryKey}</span><span className="tabular-nums">${x.cost}</span></div>)}</div> : null}
        </Card>

        {/* 4 Freshness */}
        <Card title="Freshness" hint={`industry avg ${d.freshness.industry.avgFreshness ?? "—"}`}>
          {[["Industry", d.freshness.industry], ["Company", d.freshness.company], ["Technology", d.freshness.technology]].map(([l, f]: any) => (
            <div key={l} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, padding: "4px 0", borderTop: l !== "Industry" ? `1px solid ${COLORS.borderSoft}` : "none" }}>
              <span style={{ fontWeight: 700, minWidth: 82 }}>{l}</span>
              <span style={{ color: COLORS.textMuted }}>total {f.total}</span>
              <span style={{ marginLeft: "auto", color: f.overdue ? COLORS.danger : COLORS.textFaint }}>overdue {f.overdue}</span>
              <span style={{ color: f.upcomingReview ? COLORS.warning : COLORS.textFaint }}>review≤7d {f.upcomingReview}</span>
            </div>
          ))}
        </Card>

        {/* 5 Review */}
        <Card title="Review" hint={`pending ${d.review.pending}`}>
          <div style={grid(74)}>
            <KV l="Pending" v={d.review.byStatus?.PENDING ?? 0} c={COLORS.warning} /><KV l="Approved" v={d.review.byStatus?.APPROVED ?? 0} c={COLORS.success} /><KV l="Rejected" v={d.review.byStatus?.REJECTED ?? 0} c={COLORS.danger} />
            <KV l="Req.Changes" v={d.review.byAction?.REQUEST_CHANGES ?? 0} />
          </div>
        </Card>

        {/* 6 Evidence */}
        <Card title="Evidence" hint={`coverage ${d.evidence.coverage ?? "—"}%`}>
          <div style={grid(74)}>
            <KV l="Claims" v={d.evidence.claims} c={COLORS.primary} /><KV l="Evidence" v={d.evidence.evidence} c={COLORS.success} /><KV l="No-Evidence" v={d.evidence.noEvidenceClaims} c={d.evidence.noEvidenceClaims ? COLORS.danger : COLORS.textMuted} /><KV l="Coverage%" v={d.evidence.coverage} />
          </div>
          <div style={{ height: 5, borderRadius: 3, background: COLORS.track, marginTop: 10 }}><div style={{ height: "100%", width: `${d.evidence.coverage ?? 0}%`, borderRadius: 3, background: (d.evidence.coverage ?? 0) >= 95 ? COLORS.success : COLORS.warning }} /></div>
        </Card>

        {/* 7 System Health */}
        <Card title="System Health" hint={`queue ${d.systemHealth.queue.depth}`}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px 12px", fontSize: 11.5 }}>
            {[["Benchmark", d.systemHealth.benchmark], ["Daily", d.systemHealth.daily], ["Weekly", d.systemHealth.weekly], ["Trigger", d.systemHealth.trigger]].map(([l, h]: any) => (
              <div key={l} style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: 4, background: h ? (h.byStatus?.FAILED ? COLORS.danger : COLORS.success) : COLORS.border }} /><span>{l}</span><span style={{ marginLeft: "auto", color: COLORS.textFaint }}>{h ? h.total : "idle"}</span></div>
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: 4, background: d.systemHealth.scheduler.available ? COLORS.success : COLORS.danger }} /><span>Scheduler</span><span style={{ marginLeft: "auto", color: COLORS.textFaint }}>{d.systemHealth.scheduler.lock}</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: 4, background: d.systemHealth.queue.depth ? COLORS.warning : COLORS.success }} /><span>Queue</span><span style={{ marginLeft: "auto", color: COLORS.textFaint }}>{d.systemHealth.queue.depth}</span></div>
          </div>
        </Card>
      </div>
    </div>
  );
}
