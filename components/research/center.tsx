"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

// ── Dark palette (unified with Mission Control / Strategy Center) ──────────────
const M = { bg: "#111315", card: "#171A1F", cardHi: "#20242B", border: "#2A3038", ink: "#E6E8EB", sub: "#9BA1A9", faint: "#6B7280", green: "#34C759", amber: "#FF9F0A", red: "#FF453A", blue: "#0A84FF", purple: "#5E5CE6" };

type MC = {
  architectureStatus?: { version: string; status: string; frozenDate: string; currentMode: string; nextPhase: string };
  version?: { schemaVersion: string; modelVersion: string; scoreVersion: string; versionSnapshotId: string };
  dataFreshness?: { dailyPrice?: { stockCount: number; latestDate: string; coveragePct: number }; stockScore?: { scoredTodayCount: number; latestDate: string }; news?: { todayNewCount: number; latestAt: string }; globalMarket?: { latestDate: string } };
  strategyRecommendations?: Record<string, { total: number; status: string; latestTradeDate: string }>;
  learning?: { unified?: { integrityScore: number | null; grade: string | null; recommendation: string | null; reportDate: string }; DAY_TRADE?: { grade: string }; SWING_TRADE?: { grade: string }; LONG_TRADE?: { grade: string } };
  health?: { status: string; criticalCount: number; warningCount: number; passCount: number };
  todayPipeline?: { steps?: { name: string; status: string; at?: string | null }[] };
};
type RS = { summary?: { dataConfidence: number; observations: string[] }; quality?: { overallCoverage: number }; readiness?: { tradingDays: number } };

function Pill({ label, color }: { label: string; color: string }) {
  return <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ color, background: `${color}1f` }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />{label}</span>;
}
function DCard({ children, className = "", accent }: { children: React.ReactNode; className?: string; accent?: string }) {
  return <div className={`rounded-2xl ${className}`} style={{ background: M.card, border: `1px solid ${accent ?? M.border}` }}>{children}</div>;
}
function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-semibold uppercase tracking-[0.1em] mb-3" style={{ color: M.faint }}>{children}</div>;
}
const stColor = (s: string) => /READY|DONE|OK|NORMAL|PASS|COMPLETE|完成/i.test(s) ? M.green : /WAIT|PARTIAL|WARN|注意|SKIP|跳过/i.test(s) ? M.amber : /FAIL|CRIT|ERROR/i.test(s) ? M.red : M.faint;

// ── Flow strip ────────────────────────────────────────────────────────────────
function Flow({ steps }: { steps: { label: string; color: string }[] }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {steps.map((s, i) => (
        <span key={s.label} className="inline-flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1.5 rounded-lg" style={{ background: M.cardHi, border: `1px solid ${M.border}`, color: M.ink }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />{s.label}
          </span>
          {i < steps.length - 1 && <span style={{ color: M.faint }}>→</span>}
        </span>
      ))}
    </div>
  );
}

export function ResearchCenter({ onTab }: { onTab?: (k: string) => void }) {
  const [mc, setMc] = useState<MC | null>(null);
  const [rs, setRs] = useState<RS | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState("");

  const load = useCallback(async () => {
    setRefreshing(true);
    const [m, r] = await Promise.all([
      fetch("/api/admin/mission-control").then((x) => x.ok ? x.json() : null).catch(() => null),
      fetch("/api/admin/research?horizon=7d").then((x) => x.ok ? x.json() : null).catch(() => null),
    ]);
    if (m) setMc(m); if (r) setRs(r);
    setUpdatedAt(new Date().toISOString().slice(11, 16) + " UTC");
    setRefreshing(false);
  }, []);
  useEffect(() => { load(); const id = setInterval(load, 60_000); return () => clearInterval(id); }, [load]);

  const df = mc?.dataFreshness;
  const universe = df?.dailyPrice?.stockCount ?? null;
  const scored = df?.stockScore?.scoredTodayCount ?? null;
  const confidence = rs?.summary?.dataConfidence ?? (mc?.learning?.unified?.integrityScore != null ? Math.round(mc.learning.unified.integrityScore) : null);
  const scoreVer = mc?.version?.scoreVersion ?? "adaptive-v3";
  const health = mc?.health;
  const arch = mc?.architectureStatus;
  const lu = mc?.learning?.unified;

  const engines = [
    { name: "Adaptive Score", status: "Production", color: M.green, ver: scoreVer, conf: confidence != null ? `${confidence}%` : "N/A", tab: "v3", ext: null },
    { name: "Shadow Engine", status: "Enabled", color: M.green, ver: mc?.version?.modelVersion ?? "v7.7", conf: "Ready", tab: "v3", ext: null },
    { name: "Fusion Engine", status: "Enabled", color: M.green, ver: "Production", conf: "Market Regime", tab: "fusion", ext: null },
    { name: "Learning Engine", status: lu?.recommendation === "NOT_READY" ? "Running" : "Running", color: M.green, ver: `Grade ${lu?.grade ?? "—"}`, conf: lu?.integrityScore != null ? `${lu.integrityScore.toFixed(0)}` : "N/A", tab: null, ext: "/admin/learning-report" },
    { name: "News Engine", status: "Running", color: M.green, ver: `${df?.news?.todayNewCount ?? "—"} today`, conf: df?.news?.latestAt ? df.news.latestAt.slice(5, 10) : "N/A", tab: null, ext: "/news" },
    { name: "Institution Flow", status: "Data", color: M.amber, ver: "JPX", conf: "N/A", tab: null, ext: null },
    { name: "Macro Engine", status: "Coming Soon", color: M.faint, ver: "—", conf: "N/A", tab: null, ext: null },
    { name: "Paper Trading", status: "Research", color: M.amber, ver: "Fusion paper", conf: "N/A", tab: null, ext: "/fusion/paper" },
  ];

  const insights = [
    { k: "市场", v: df?.globalMarket?.latestDate ? "运营中" : "N/A", c: M.green, sub: df?.globalMarket?.latestDate ? `全球指数 ${df.globalMarket.latestDate}` : "" },
    { k: "AI 评分", v: scored != null ? "偏积极" : "N/A", c: M.green, sub: scored != null ? `${scored.toLocaleString()} 只已评分` : "" },
    { k: "新闻", v: df?.news?.todayNewCount ? "偏活跃" : "N/A", c: M.blue, sub: df?.news?.todayNewCount ? `今日 ${df.news.todayNewCount} 条` : "" },
    { k: "机构流向", v: "N/A", c: M.faint, sub: "InstitutionalFlow 待接入" },
    { k: "推荐", v: arch?.status === "FROZEN" ? "继续执行 Production" : "N/A", c: M.amber, sub: arch ? `${arch.currentMode}` : "" },
  ];

  const pipeSteps = mc?.todayPipeline?.steps ?? [];
  const matrixRows = [
    { name: "Adaptive", ver: scoreVer, status: "Production", conf: confidence != null ? `${confidence}%` : "N/A", update: df?.stockScore?.latestDate ?? "—", health: M.green },
    { name: "Shadow", ver: mc?.version?.modelVersion ?? "v7.7", status: "Enabled", conf: "Ready", update: df?.stockScore?.latestDate ?? "—", health: M.green },
    { name: "Fusion", ver: "Production", status: "Enabled", conf: "Regime", update: df?.stockScore?.latestDate ?? "—", health: M.green },
    { name: "Learning", ver: `Grade ${lu?.grade ?? "—"}`, status: "Running", conf: lu?.integrityScore != null ? `${lu.integrityScore.toFixed(0)}` : "N/A", update: lu?.reportDate ?? "—", health: lu?.grade === "D" ? M.amber : M.green },
    { name: "News", ver: `${df?.news?.todayNewCount ?? "—"}`, status: "Running", conf: "N/A", update: df?.news?.latestAt?.slice(5, 10) ?? "—", health: M.green },
    { name: "Paper", ver: "Research", status: "Research", conf: "N/A", update: "—", health: M.amber },
    { name: "Macro", ver: "—", status: "Coming Soon", conf: "N/A", update: "—", health: M.faint },
    { name: "Institution", ver: "JPX", status: "Data", conf: "N/A", update: "—", health: M.amber },
  ];
  const future = ["Adaptive V4", "Institution AI", "Portfolio AI", "Macro Engine", "Risk Engine", "Factor Lab"];

  return (
    <div style={{ background: M.bg, minHeight: "100vh", color: M.ink, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', Inter, system-ui, sans-serif" }}>
      <div className="mx-auto max-w-[1600px] px-6 lg:px-10 py-8 dash-in">

        {/* Hero */}
        <header className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-[28px] font-semibold tracking-[-0.02em]" style={{ color: M.ink }}>AI 研究中心</h1>
            <p className="text-[13px] mt-1" style={{ color: M.faint }}>AI Engine · Adaptive Intelligence · Research Platform</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Pill label="Research Running" color={M.green} />
            <Pill label={scoreVer} color={M.blue} />
            <Pill label="Shadow Enabled" color={M.green} />
            <Pill label="Fusion Enabled" color={M.green} />
            <Pill label="Learning Running" color={M.green} />
            <button onClick={load} disabled={refreshing} className="inline-flex items-center justify-center w-8 h-8 rounded-full" style={{ background: M.cardHi, border: `1px solid ${M.border}`, color: M.ink }}><span style={{ display: "inline-block", animation: refreshing ? "dash-spin .8s linear infinite" : "none" }}>↻</span></button>
            {updatedAt && <span className="text-[11px] tabular-nums hidden xl:inline" style={{ color: M.faint }}>{updatedAt}</span>}
          </div>
        </header>

        {/* 6 KPI */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          {[
            { l: "Universe", s: "研究股票", v: universe != null ? universe.toLocaleString() : "—", c: M.ink },
            { l: "AI 评分", s: "已评分", v: scored != null ? scored.toLocaleString() : "—", c: M.blue },
            { l: "Research Confidence", s: "研究可信度", v: confidence != null ? `${confidence}%` : "N/A", c: confidence != null && confidence >= 50 ? M.green : M.amber },
            { l: "Alpha Engine", s: "Alpha Version", v: scoreVer, c: M.purple, small: true },
            { l: "Fusion Engine", s: "状态", v: "Enabled", c: M.green, small: true },
            { l: "System Health", s: `C${health?.criticalCount ?? "—"} · W${health?.warningCount ?? "—"}`, v: health?.status ?? "—", c: health?.criticalCount === 0 ? M.green : M.red, small: true },
          ].map((k) => (
            <DCard key={k.l} className="p-5">
              <div className="text-[11px] font-medium" style={{ color: M.sub }}>{k.l}</div>
              <div className={`font-semibold tabular-nums tracking-[-0.01em] mt-2 ${k.small ? "text-[18px]" : "text-[26px]"}`} style={{ color: k.c }}>{k.v}</div>
              <div className="text-[11px] mt-1" style={{ color: M.faint }}>{k.s}</div>
            </DCard>
          ))}
        </div>

        {/* AI 决策流程 */}
        <section className="mb-8">
          <Label>AI 决策流程 · Decision Pipeline</Label>
          <DCard className="p-5">
            <Flow steps={[
              { label: "Market", color: M.green }, { label: "Universe", color: M.green }, { label: "Feature", color: rs?.quality?.overallCoverage ? M.green : M.amber }, { label: "AI Score", color: M.green },
              { label: "Shadow", color: M.green }, { label: "Fusion", color: M.green }, { label: "Strategy", color: M.green }, { label: "Recommendation", color: M.green }, { label: "Learning", color: lu?.grade === "D" ? M.amber : M.green },
            ]} />
          </DCard>
        </section>

        {/* AI 引擎卡片 */}
        <section className="mb-8">
          <Label>AI 引擎 · Engines</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {engines.map((e) => (
              <DCard key={e.name} className="p-5 flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[14px] font-semibold" style={{ color: M.ink }}>{e.name}</span>
                  <Pill label={e.status} color={e.color} />
                </div>
                <div className="space-y-1.5 flex-1 text-[12px]">
                  <div className="flex justify-between"><span style={{ color: M.faint }}>版本</span><span className="tabular-nums" style={{ color: M.sub }}>{e.ver}</span></div>
                  <div className="flex justify-between"><span style={{ color: M.faint }}>Confidence</span><span className="tabular-nums" style={{ color: M.sub }}>{e.conf}</span></div>
                </div>
                {e.ext ? <Link href={e.ext} className="inline-flex items-center justify-center h-8 mt-3 rounded-full text-[12px] font-semibold" style={{ background: M.cardHi, border: `1px solid ${M.border}`, color: M.blue }}>详情 →</Link>
                  : e.tab ? <button onClick={() => onTab?.(e.tab!)} className="inline-flex items-center justify-center h-8 mt-3 rounded-full text-[12px] font-semibold" style={{ background: M.cardHi, border: `1px solid ${M.border}`, color: M.blue }}>详情 →</button>
                  : <span className="inline-flex items-center justify-center h-8 mt-3 rounded-full text-[12px] font-semibold" style={{ background: "#181B20", color: M.faint }}>Coming Soon</span>}
              </DCard>
            ))}
          </div>
        </section>

        {/* 研究洞察 */}
        <section className="mb-8">
          <Label>研究洞察 · Today&apos;s Insight</Label>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {insights.map((x) => (
              <DCard key={x.k} className="p-5">
                <div className="text-[11px]" style={{ color: M.faint }}>{x.k}</div>
                <div className="text-[18px] font-semibold mt-1.5" style={{ color: x.c }}>{x.v}</div>
                {x.sub && <div className="text-[11px] mt-1 tabular-nums" style={{ color: M.faint }}>{x.sub}</div>}
              </DCard>
            ))}
          </div>
        </section>

        {/* AI 模块关系图 */}
        <section className="mb-8">
          <Label>AI 模块关系图 · Engine Map</Label>
          <DCard className="p-5">
            <Flow steps={[
              { label: scoreVer, color: M.green }, { label: "Shadow", color: M.green }, { label: "Fusion", color: M.green }, { label: "Strategy", color: M.green },
              { label: "Portfolio", color: M.amber }, { label: "Learning", color: M.green }, { label: "Adaptive v4 · Coming Soon", color: M.faint },
            ]} />
          </DCard>
        </section>

        {/* Research Timeline */}
        {pipeSteps.length > 0 && (
          <section className="mb-8">
            <Label>Research Timeline · 今日流水线</Label>
            <DCard className="p-2">
              {pipeSteps.map((s, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5" style={i > 0 ? { borderTop: `1px solid ${M.border}` } : undefined}>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: stColor(s.status) }} />
                  <span className="text-[13px] font-medium flex-1" style={{ color: M.ink }}>{s.name}</span>
                  <span className="text-[11px] tabular-nums" style={{ color: M.faint }}>{s.at ?? ""}</span>
                  <span className="text-[11px] font-semibold w-16 text-right" style={{ color: stColor(s.status) }}>{s.status}</span>
                </div>
              ))}
            </DCard>
          </section>
        )}

        {/* Engine Matrix */}
        <section className="mb-8">
          <Label>Engine Matrix</Label>
          <DCard className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead><tr style={{ borderBottom: `1px solid ${M.border}` }}>
                {["Engine", "Version", "Status", "Confidence", "Update", "Health"].map((h, i) => <th key={h} className={`px-4 py-3 text-[11px] font-semibold uppercase ${i === 0 ? "text-left" : "text-right"}`} style={{ color: M.faint }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {matrixRows.map((r) => (
                  <tr key={r.name} className="transition-colors" style={{ borderBottom: `1px solid ${M.border}` }} onMouseEnter={(e) => (e.currentTarget.style.background = M.cardHi)} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                    <td className="px-4 py-3 font-semibold" style={{ color: M.ink }}>{r.name}</td>
                    <td className="px-4 py-3 text-right tabular-nums" style={{ color: M.sub }}>{r.ver}</td>
                    <td className="px-4 py-3 text-right"><span className="text-[11px] font-semibold" style={{ color: r.health }}>{r.status}</span></td>
                    <td className="px-4 py-3 text-right tabular-nums" style={{ color: M.sub }}>{r.conf}</td>
                    <td className="px-4 py-3 text-right tabular-nums" style={{ color: M.faint }}>{r.update}</td>
                    <td className="px-4 py-3 text-right"><span className="inline-block w-2 h-2 rounded-full" style={{ background: r.health }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DCard>
        </section>

        {/* Future Roadmap */}
        <section className="mb-4">
          <Label>Future Roadmap · Coming Soon</Label>
          <div className="flex flex-wrap gap-3">
            {future.map((f) => (
              <div key={f} className="rounded-xl px-4 py-3 flex items-center gap-2.5" style={{ background: M.card, border: `1px solid ${M.border}` }}>
                <span className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-[13px]" style={{ background: M.cardHi, color: M.faint }}>◇</span>
                <div><div className="text-[13px] font-semibold" style={{ color: M.ink }}>{f}</div><div className="text-[11px]" style={{ color: M.faint }}>Coming Soon</div></div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
