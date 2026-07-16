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
        <span className="inline-flex items-center justify-center h-9 mt-4 rounded-full text-[13px] font-semibold cursor-not-allowed" style={{ background: "#F4F4F6", color: C.faint }}>敬请期待</span>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AIResearchLabPage() {
  const [health, setHealth] = useState<Health>(null);
  useEffect(() => { fetch("/api/health/status").then((r) => r.json()).then(setHealth).catch(() => {}); }, []);

  const healthScore = health ? Math.max(0, Math.min(100, 100 - health.criticalCount * 25 - health.warningCount * 3)) : null;
  const lastUpdate = health?.auditAt ? new Date(new Date(health.auditAt).getTime() + 9 * 3600_000).toISOString().slice(5, 16).replace("T", " ") : "暂无数据";

  const kpis = [
    { label: "AI评分引擎", value: "Adaptive V3", sub: "正式 · 影子", icon: <Sparkles size={18} />, accent: C.blue, href: ROUTES.SHADOW_SCORE },
    { label: "Shadow Engine", value: "已启用", sub: "V2 vs V3 对比", icon: <Zap size={18} />, accent: C.purple, href: ROUTES.SHADOW_SCORE },
    { label: "Fusion Engine", value: "已启用", sub: "市场状态融合", icon: <Layers size={18} />, accent: "#AF52DE", href: ROUTES.FUSION_REPORT },
    { label: "Learning Engine", value: "运行中", sub: "每日学习", icon: <GraduationCap size={18} />, accent: C.green, href: ROUTES.LEARNING_REPORT },
    { label: "策略融合研究", value: "Fusion Research", sub: "Production × Alpha × Fusion", icon: <FileText size={18} />, accent: C.amber, href: ROUTES.FUSION_REPORT },
    { label: "Research Health", value: healthScore != null ? `${healthScore}` : "暂无数据", sub: "研究健康度", icon: <Activity size={18} />, accent: healthScore != null && health!.criticalCount === 0 ? C.green : C.amber, href: ROUTES.VERIFY },
  ];

  const modules = [
    { name: "Adaptive Engine", icon: <Sparkles size={18} />, accent: C.blue, href: ROUTES.SHADOW_SCORE, cta: "查看评分",
      rows: [{ k: "版本", v: "V3" }, { k: "状态", v: "正式", color: C.green }, { k: "可信度", v: "暂无数据" }, { k: "最近更新", v: lastUpdate }] },
    { name: "Shadow Engine", icon: <Zap size={18} />, accent: C.purple, href: ROUTES.SHADOW_SCORE, cta: "影子对比",
      rows: [{ k: "状态", v: "运行中", color: C.green }, { k: "当前", v: "V3" }, { k: "影子对比", v: "已就绪", color: C.green }] },
    { name: "Fusion Engine", icon: <Layers size={18} />, accent: "#AF52DE", href: ROUTES.FUSION_REPORT, cta: "融合报告",
      rows: [{ k: "市场状态", v: "已启用", color: C.green }, { k: "当前", v: "正式" }, { k: "最优比例", v: "历史搜索" }] },
    { name: "Learning Engine", icon: <GraduationCap size={18} />, accent: C.green, href: ROUTES.LEARNING_REPORT, cta: "学习报告",
      rows: [{ k: "数据集", v: "暂无数据" }, { k: "最近学习", v: "每日 17:00 JST" }, { k: "健康度", v: health && health.criticalCount === 0 ? "通过" : "暂无数据", color: C.green }] },
    { name: "Backtest Engine", icon: <BarChart3 size={18} />, accent: "#0A84FF", href: ROUTES.BACKTEST, cta: "回测验证",
      rows: [{ k: "历史", v: "可用", color: C.green }, { k: "结果", v: "每日更新" }, { k: "周期", v: "1d / 7d / 30d / 90d" }] },
    { name: "Fusion Research", icon: <FileText size={18} />, accent: C.amber, href: ROUTES.FUSION_REPORT, cta: "查看研究",
      rows: [{ k: "当前状态", v: "研究中", color: C.amber }, { k: "实验模式", v: "Production × Alpha × Fusion" }, { k: "研究方向", v: "策略融合验证" }] },
  ];

  const roadmap = [
    { name: "Adaptive Engine V3", status: "正式", done: true },
    { name: "Shadow Engine", status: "正式", done: true },
    { name: "Fusion Engine", status: "正式", done: true },
    { name: "Learning Engine", status: "正式", done: true },
    { name: "Fusion Research", status: "运行中", done: true },
    { name: "Fusion Research（产品化）", status: "下一步", done: false },
    { name: "Portfolio Engine", status: "下一步", done: false },
    { name: "Adaptive Engine V4", status: "规划中", done: false },
  ];

  const notes = [
    { v: "v17.57", t: "策略情报中心", c: C.blue },
    { v: "v17.56", t: "控制中心 · 数据校验 · 同步", c: C.purple },
    { v: "v17.55", t: "股票详情页精致化重构", c: C.green },
    { v: "v17.54", t: "仪表盘指挥中心", c: C.amber },
    { v: "v17.4x", t: "Alpha 引擎 2.0（因子 → 融合）", c: "#AF52DE" },
  ];

  const future = ["Portfolio Engine", "Fusion Research", "Factor Lab", "Adaptive V4", "AI Explain", "Institution Flow", "Macro Engine"];

  return (
    <div className="min-h-screen dash-font" style={{ background: C.bg }}>
      <div className="mx-auto max-w-[1600px] px-6 lg:px-10 xl:px-14 py-8 lg:py-10">

        {/* Header */}
        <header className="dash-in flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-10">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-2xl" style={{ background: `${C.blue}12`, color: C.blue }}><FlaskConical size={20} /></span>
              <h1 className="text-[30px] lg:text-[34px] font-semibold tracking-[-0.02em]" style={{ color: C.ink }}>AI 研发中心</h1>
            </div>
            <p className="text-[14px] mt-2" style={{ color: C.faint }}>研发中心 · AI 引擎研发</p>
          </div>
          <div className="flex items-center gap-2.5">
            <StatusPill label="Adaptive V3 · 正式" color={C.blue} />
            <StatusPill label={health ? (health.criticalCount === 0 ? "正常" : "待复核") : "…"} color={health && health.criticalCount === 0 ? C.green : C.amber} />
            <span className="text-[12px] tabular-nums hidden lg:inline" style={{ color: C.faint }}>更新 {lastUpdate} JST</span>
          </div>
        </header>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-5 mb-14 dash-in" style={{ animationDelay: "40ms" }}>
          {kpis.map((k) => <KpiCard key={k.label} {...k} />)}
        </div>

        {/* Research Modules */}
        <Section title="研发模块" sub="AI 引擎研发模块 · 全部只读，跳转真实研究页">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {modules.map((m) => <ModuleCard key={m.name} {...m} />)}
          </div>
        </Section>

        {/* Roadmap + Notes */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-12">
          <div className="lg:col-span-7">
            <Section title="研发路线图" sub="研发路线 · 展示用，不影响系统行为">
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
            <Section title="研发笔记" sub="最近研发版本摘要">
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
        <Section title="未来模块" sub="未来研发方向 · 敬请期待">
          <div className="flex flex-wrap gap-3">
            {future.map((f) => (
              <div key={f} className="dash-card px-4 py-3 flex items-center gap-2.5">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl" style={{ background: "#F4F4F6", color: C.faint }}><Boxes size={16} /></span>
                <div>
                  <div className="text-[13px] font-semibold" style={{ color: C.ink }}>{f}</div>
                  <div className="text-[11px]" style={{ color: C.faint }}>敬请期待</div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <div className="flex items-center justify-center gap-1.5 text-[12px] pb-4" style={{ color: C.faint }}>
          <TrendingUp size={13} /> AI 研发中心 · TOHOSHOU AI 引擎研发中枢
        </div>
      </div>
    </div>
  );
}
