"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ROUTES } from "@/lib/routes";
import {
  Sparkles, Zap, Layers, GraduationCap, BarChart3, FileText,
  ArrowUpRight, CircleCheck, FlaskConical, Boxes, Activity, TrendingUp,
} from "@/components/dashboard/icons";

const C = {
  bg: "#FAFAFA", card: "#FFFFFF", line: "#ECECEC",
  ink: "#1D1D1F", sub: "#6E6E73", faint: "#86868B",
  blue: "#007AFF", green: "#34C759", amber: "#FF9F0A", red: "#FF3B30", purple: "#5856D6",
};

type Health = { status: string; criticalCount: number; warningCount: number; passCount: number; auditAt: string } | null;

// ── Primitives ────────────────────────────────────────────────────────────────
function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <div className="mb-5">
        <h2 className="text-[19px] font-semibold tracking-[-0.01em]" style={{ color: C.ink }}>{title}</h2>
        {sub && <p className="text-[13px] mt-1" style={{ color: C.faint }}>{sub}</p>}
      </div>
      {children}
    </section>
  );
}

function StatusPill({ label, color }: { label: string; color: string }) {
  return <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ color, background: `${color}14` }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />{label}</span>;
}

function KpiCard({ label, value, sub, icon, accent, href }: { label: string; value: string; sub: string; icon: React.ReactNode; accent: string; href?: string }) {
  const inner = (
    <div className="dash-card dash-int p-6 h-full flex flex-col justify-between min-h-[130px]">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl" style={{ background: `${accent}12`, color: accent }}>{icon}</span>
        {href && <span style={{ color: C.faint }}><ArrowUpRight size={16} /></span>}
      </div>
      <div className="mt-4">
        <div className="text-[22px] font-semibold tracking-[-0.01em]" style={{ color: C.ink }}>{value}</div>
        <div className="text-[12px] font-medium mt-0.5" style={{ color: C.sub }}>{label}</div>
        <div className="text-[11px] mt-0.5" style={{ color: C.faint }}>{sub}</div>
      </div>
    </div>
  );
  return href ? <Link href={href} className="block h-full">{inner}</Link> : inner;
}

function ModuleCard({ name, icon, accent, rows, href, cta }: {
  name: string; icon: React.ReactNode; accent: string; rows: { k: string; v: string; color?: string }[]; href?: string; cta?: string;
}) {
  return (
    <div className="dash-card p-6 flex flex-col">
      <div className="flex items-center gap-2.5 mb-4">
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl" style={{ background: `${accent}12`, color: accent }}>{icon}</span>
        <span className="text-[15px] font-semibold" style={{ color: C.ink }}>{name}</span>
      </div>
      <div className="space-y-2 flex-1">
        {rows.map((r) => (
          <div key={r.k} className="flex items-center justify-between text-[13px]">
            <span style={{ color: C.faint }}>{r.k}</span>
            <span className="font-semibold tabular-nums" style={{ color: r.color ?? C.ink }}>{r.v}</span>
          </div>
        ))}
      </div>
      {href ? (
        <Link href={href} className="inline-flex items-center justify-center gap-1.5 h-9 mt-4 rounded-full text-[13px] font-semibold dash-card dash-int" style={{ color: C.blue }}>
          {cta ?? "打开"} <ArrowUpRight size={14} />
        </Link>
      ) : (
        <span className="inline-flex items-center justify-center h-9 mt-4 rounded-full text-[13px] font-semibold cursor-not-allowed" style={{ background: "#F4F4F6", color: C.faint }}>Coming Soon</span>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AIResearchLabPage() {
  const [health, setHealth] = useState<Health>(null);
  useEffect(() => { fetch("/api/health/status").then((r) => r.json()).then(setHealth).catch(() => {}); }, []);

  const healthScore = health ? Math.max(0, Math.min(100, 100 - health.criticalCount * 25 - health.warningCount * 3)) : null;
  const lastUpdate = health?.auditAt ? new Date(new Date(health.auditAt).getTime() + 9 * 3600_000).toISOString().slice(5, 16).replace("T", " ") : "N/A";

  const kpis = [
    { label: "AI Engine", value: "Adaptive V3", sub: "Production · Shadow", icon: <Sparkles size={18} />, accent: C.blue, href: ROUTES.SHADOW_SCORE },
    { label: "Shadow", value: "Enabled", sub: "V2 vs V3 compare", icon: <Zap size={18} />, accent: C.purple, href: ROUTES.SHADOW_SCORE },
    { label: "Fusion", value: "Enabled", sub: "Market Regime", icon: <Layers size={18} />, accent: "#AF52DE", href: ROUTES.FUSION_REPORT },
    { label: "Learning", value: "Running", sub: "Daily reports", icon: <GraduationCap size={18} />, accent: C.green, href: ROUTES.LEARNING_REPORT },
    { label: "Paper Trading", value: "Research", sub: "Fusion paper", icon: <FileText size={18} />, accent: C.amber, href: ROUTES.PAPER_TRADING },
    { label: "Research Health", value: healthScore != null ? `${healthScore}` : "N/A", sub: health ? `${lastUpdate} JST` : "loading…", icon: <Activity size={18} />, accent: healthScore != null && health!.criticalCount === 0 ? C.green : C.amber, href: ROUTES.VERIFY },
  ];

  const modules = [
    { name: "Adaptive Score", icon: <Sparkles size={18} />, accent: C.blue, href: ROUTES.SHADOW_SCORE, cta: "查看评分",
      rows: [{ k: "Version", v: "V3" }, { k: "Status", v: "Production", color: C.green }, { k: "Confidence", v: "N/A" }, { k: "Last Update", v: lastUpdate }] },
    { name: "Shadow Engine", icon: <Zap size={18} />, accent: C.purple, href: ROUTES.SHADOW_SCORE, cta: "影子对比",
      rows: [{ k: "Status", v: "Running", color: C.green }, { k: "Current", v: "V3" }, { k: "Shadow Compare", v: "Ready", color: C.green }] },
    { name: "Fusion Engine", icon: <Layers size={18} />, accent: "#AF52DE", href: ROUTES.FUSION_REPORT, cta: "融合报告",
      rows: [{ k: "Market Regime", v: "Enabled", color: C.green }, { k: "Current", v: "Production" }, { k: "Best Ratio", v: "Search-based" }] },
    { name: "Learning Engine", icon: <GraduationCap size={18} />, accent: C.green, href: ROUTES.LEARNING_REPORT, cta: "学习报告",
      rows: [{ k: "Dataset", v: "N/A" }, { k: "Last Learn", v: "Daily 17:00 JST" }, { k: "Health", v: health && health.criticalCount === 0 ? "PASS" : "N/A", color: C.green }] },
    { name: "Backtest", icon: <BarChart3 size={18} />, accent: "#0A84FF", href: ROUTES.BACKTEST, cta: "回测验证",
      rows: [{ k: "History", v: "Available", color: C.green }, { k: "Results", v: "Daily update" }, { k: "Horizons", v: "1d / 7d / 30d / 90d" }] },
    { name: "Paper Trading", icon: <FileText size={18} />, accent: C.amber, href: ROUTES.PAPER_TRADING, cta: "纸面交易",
      rows: [{ k: "Status", v: "Research", color: C.amber }, { k: "Mode", v: "Fusion paper" }, { k: "Product Module", v: "Coming Soon", color: C.faint }] },
  ];

  const roadmap = [
    { name: "Adaptive Score V3", status: "Production", done: true },
    { name: "Shadow Engine", status: "Production", done: true },
    { name: "Fusion Engine", status: "Production", done: true },
    { name: "Learning Engine", status: "Production", done: true },
    { name: "Paper Trading (Research)", status: "Running", done: true },
    { name: "Paper Trading (Product)", status: "Next", done: false },
    { name: "Portfolio Engine", status: "Next", done: false },
    { name: "Adaptive Score V4", status: "Planning", done: false },
  ];

  const notes = [
    { v: "v17.57", t: "Strategy Intelligence Center", c: C.blue },
    { v: "v17.56", t: "Mission Control · Verify · Sync", c: C.purple },
    { v: "v17.55", t: "Apple Premium Stock Detail", c: C.green },
    { v: "v17.54", t: "Dashboard Command Center", c: C.amber },
    { v: "v17.4x", t: "Alpha Engine 2.0 (Factors → Fusion)", c: "#AF52DE" },
  ];

  const future = ["Portfolio", "Paper Trading", "Factor Lab", "Adaptive V4", "AI Explain", "Institution Flow", "Macro Engine"];

  return (
    <div className="min-h-screen dash-font" style={{ background: C.bg }}>
      <div className="mx-auto max-w-[1600px] px-6 lg:px-10 xl:px-14 py-8 lg:py-10">

        {/* Header */}
        <header className="dash-in flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-10">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-2xl" style={{ background: `${C.blue}12`, color: C.blue }}><FlaskConical size={20} /></span>
              <h1 className="text-[30px] lg:text-[34px] font-semibold tracking-[-0.02em]" style={{ color: C.ink }}>AI Research Lab</h1>
            </div>
            <p className="text-[14px] mt-2" style={{ color: C.faint }}>Research Center · AI Engine Development</p>
          </div>
          <div className="flex items-center gap-2.5">
            <StatusPill label="Adaptive V3 · Production" color={C.blue} />
            <StatusPill label={health ? (health.criticalCount === 0 ? "Healthy" : "Review") : "…"} color={health && health.criticalCount === 0 ? C.green : C.amber} />
            <span className="text-[12px] tabular-nums hidden lg:inline" style={{ color: C.faint }}>Updated {lastUpdate} JST</span>
          </div>
        </header>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-5 mb-14 dash-in" style={{ animationDelay: "40ms" }}>
          {kpis.map((k) => <KpiCard key={k.label} {...k} />)}
        </div>

        {/* Research Modules */}
        <Section title="Research Modules" sub="AI 引擎研发模块 · 全部只读，跳转真实研究页">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {modules.map((m) => <ModuleCard key={m.name} {...m} />)}
          </div>
        </Section>

        {/* Roadmap + Notes */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-12">
          <div className="lg:col-span-7">
            <Section title="Research Roadmap" sub="研发路线 · 展示用，不影响系统行为">
              <div className="dash-card p-6">
                {roadmap.map((r, i) => {
                  const color = r.done ? C.green : r.status === "Next" ? C.blue : C.faint;
                  const last = i === roadmap.length - 1;
                  return (
                    <div key={r.name} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full mt-0.5 shrink-0" style={{ background: r.done ? color : "transparent", border: r.done ? "none" : `2px solid ${color}`, color: "#fff" }}>
                          {r.done ? <CircleCheck size={13} /> : <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />}
                        </span>
                        {!last && <span className="w-px flex-1 my-1" style={{ background: C.line }} />}
                      </div>
                      <div className={`flex-1 flex items-center justify-between gap-3 ${last ? "" : "pb-5"}`}>
                        <span className="text-[14px] font-medium" style={{ color: C.ink }}>{r.name}</span>
                        <StatusPill label={r.status} color={color} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          </div>
          <div className="lg:col-span-5">
            <Section title="Research Notes" sub="最近研发版本摘要">
              <div className="dash-card p-2">
                {notes.map((n, i) => (
                  <div key={n.v} className="flex items-center gap-3 px-4 py-3" style={i > 0 ? { borderTop: `1px solid ${C.line}` } : undefined}>
                    <span className="text-[12px] font-bold tabular-nums px-2 py-0.5 rounded-md shrink-0" style={{ color: n.c, background: `${n.c}12` }}>{n.v}</span>
                    <span className="text-[13px] font-medium" style={{ color: C.ink }}>{n.t}</span>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        </div>

        {/* Future Roadmap */}
        <Section title="Future Modules" sub="未来研发方向 · Coming Soon">
          <div className="flex flex-wrap gap-3">
            {future.map((f) => (
              <div key={f} className="dash-card px-4 py-3 flex items-center gap-2.5">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl" style={{ background: "#F4F4F6", color: C.faint }}><Boxes size={16} /></span>
                <div>
                  <div className="text-[13px] font-semibold" style={{ color: C.ink }}>{f}</div>
                  <div className="text-[11px]" style={{ color: C.faint }}>Coming Soon</div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <div className="flex items-center justify-center gap-1.5 text-[12px] pb-4" style={{ color: C.faint }}>
          <TrendingUp size={13} /> AI Research Lab · TOHOSHOU AI Engine Development Hub
        </div>
      </div>
    </div>
  );
}
