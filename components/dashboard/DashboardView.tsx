"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sparkles, Activity, CircleCheck, AlertTriangle, Clock, ArrowUpRight,
  ArrowRight, ShieldCheck, TrendingUp, TrendingDown, Newspaper, Layers,
  BarChart3, Boxes, Search, Bell, User, Zap, FileText, Target, LineChart,
} from "./icons";

// ── Types ─────────────────────────────────────────────────────────────────────
type Sev = "NORMAL" | "WARNING" | "CRITICAL";
type Grade = "GREEN" | "YELLOW" | "RED";

export type DashboardData = {
  greeting: string;
  hero: {
    symbol: string; name: string; rank: number;
    score: number | null; rating: string | null; summary: string | null; price: number | null;
  } | null;
  market: { key: string; label: string; value: number | null; change: number | null; decimals: number }[];
  marketDate: string | null;
  systemStatus: { key: string; label: string; status: Sev; detail: string }[];
  health: { score: number; grade: Grade; critical: number; warning: number; pass: number; auditAt: string | null };
  pipeline: { done: number; total: number };
  stats: { totalStocks: number; scoredCount: number; todayRec: number; todayRecTotal: number; aiAnalysis: number; news: number };
  freshness: { label: string; date: string | null; days: number | null }[];
  timeline: { time: string; label: string; detail: string }[];
  lastTradingDate: string | null;
  generatedAt: string;
};

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  blue: "#007AFF", green: "#34C759", red: "#FF3B30", amber: "#FF9F0A",
  ink: "#1d1d1f", sub: "#6e6e73", faint: "#86868b", line: "#ECECEC", card: "#FFFFFF",
};
function sevColor(s: Sev) { return s === "NORMAL" ? C.green : s === "WARNING" ? C.amber : C.red; }
function gradeColor(g: Grade) { return g === "GREEN" ? C.green : g === "YELLOW" ? C.amber : C.red; }
function gradeLabel(g: Grade) { return g === "GREEN" ? "良好" : g === "YELLOW" ? "注意" : "异常"; }

const RATING: Record<string, { label: string; color: string }> = {
  STRONG_BUY: { label: "强烈推荐", color: C.green },
  BUY: { label: "推荐", color: C.blue },
  HOLD: { label: "持有", color: C.amber },
  WATCH: { label: "观察", color: C.faint },
  AVOID: { label: "回避", color: C.red },
};

function fmt(v: number | null, decimals = 0) {
  if (v == null || !Number.isFinite(v)) return "暂无";
  return v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function freshLabel(days: number | null) {
  if (days == null) return "无数据";
  if (days <= 0) return "今日";
  if (days === 1) return "昨日";
  return `${days} 天前`;
}

// ── Primitives ────────────────────────────────────────────────────────────────
function SectionHeader({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between mb-5">
      <div>
        <h2 className="text-[19px] font-semibold tracking-tight" style={{ color: C.ink }}>{title}</h2>
        {sub && <p className="text-[13px] mt-1" style={{ color: C.faint }}>{sub}</p>}
      </div>
      {action}
    </div>
  );
}

function Card({ children, className = "", style, hover = false }: {
  children: React.ReactNode; className?: string; style?: React.CSSProperties; hover?: boolean;
}) {
  return (
    <div
      className={`rounded-3xl bg-white transition-transform duration-300 ${hover ? "hover:scale-[1.02] will-change-transform" : ""} ${className}`}
      style={{ border: `1px solid ${C.line}`, boxShadow: "0 1px 2px rgba(0,0,0,0.03), 0 12px 32px -20px rgba(0,0,0,0.12)", ...style }}
    >
      {children}
    </div>
  );
}

function MetricCard({ label, value, unit, accent, icon }: {
  label: string; value: string; unit?: string; accent?: string; icon?: React.ReactNode;
}) {
  return (
    <Card hover className="p-6 flex flex-col justify-between min-h-[132px]">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium" style={{ color: C.sub }}>{label}</span>
        {icon && <span style={{ color: accent ?? C.faint }}>{icon}</span>}
      </div>
      <div className="mt-4">
        <span className="text-[34px] font-semibold tracking-tight tabular-nums leading-none" style={{ color: C.ink }}>{value}</span>
        {unit && <span className="text-[14px] font-medium ml-1.5" style={{ color: C.faint }}>{unit}</span>}
      </div>
    </Card>
  );
}

function StatusRow({ label, detail, status }: { label: string; detail: string; status: Sev }) {
  const color = sevColor(status);
  const Ico = status === "NORMAL" ? CircleCheck : AlertTriangle;
  const txt = status === "NORMAL" ? "正常" : status === "WARNING" ? "注意" : "异常";
  return (
    <div className="flex items-center justify-between py-3" style={{ borderTop: `1px solid ${C.line}` }}>
      <div className="flex items-center gap-3">
        <span style={{ color }}><Ico size={18} /></span>
        <div>
          <div className="text-[14px] font-medium" style={{ color: C.ink }}>{label}</div>
          <div className="text-[12px]" style={{ color: C.faint }}>{detail}</div>
        </div>
      </div>
      <span className="text-[12px] font-semibold px-2.5 py-1 rounded-full" style={{ color, background: `${color}14` }}>{txt}</span>
    </div>
  );
}

function MarketCard({ label, value, change, decimals }: { label: string; value: number | null; change: number | null; decimals: number }) {
  const up = change != null && change > 0;
  const down = change != null && change < 0;
  const cColor = up ? C.green : down ? C.red : C.faint;
  return (
    <Card hover className="p-5">
      <div className="text-[13px] font-medium mb-2" style={{ color: C.sub }}>{label}</div>
      <div className="text-[26px] font-semibold tracking-tight tabular-nums leading-none" style={{ color: C.ink }}>{fmt(value, decimals)}</div>
      {change != null && Number.isFinite(change) ? (
        <div className="flex items-center gap-1 mt-2 text-[13px] font-semibold" style={{ color: cColor }}>
          {up ? <TrendingUp size={14} /> : down ? <TrendingDown size={14} /> : null}
          <span className="tabular-nums">{up ? "+" : ""}{change.toFixed(2)}%</span>
        </div>
      ) : (
        <div className="mt-2 text-[13px] font-medium" style={{ color: C.faint }}>收盘价</div>
      )}
    </Card>
  );
}

function QuickAction({ href, label, desc, icon, accent }: {
  href: string; label: string; desc: string; icon: React.ReactNode; accent: string;
}) {
  return (
    <Link href={href}>
      <Card hover className="p-6 h-full flex flex-col justify-between group cursor-pointer">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center justify-center w-11 h-11 rounded-2xl" style={{ background: `${accent}14`, color: accent }}>
            {icon}
          </span>
          <span className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: C.faint }}><ArrowUpRight size={18} /></span>
        </div>
        <div className="mt-5">
          <div className="text-[16px] font-semibold" style={{ color: C.ink }}>{label}</div>
          <div className="text-[13px] mt-0.5" style={{ color: C.faint }}>{desc}</div>
        </div>
      </Card>
    </Link>
  );
}

// ── Main View ─────────────────────────────────────────────────────────────────
export function DashboardView({ data }: { data: DashboardData }) {
  const router = useRouter();
  const [tick, setTick] = useState(0);

  // Silent server-side refresh every 60s — re-runs the page's server component,
  // swaps in fresh props with no loading flash (keeps current data on screen).
  useEffect(() => {
    const id = setInterval(() => { router.refresh(); setTick((t) => t + 1); }, 60_000);
    return () => clearInterval(id);
  }, [router]);

  const { hero, health, pipeline, stats } = data;
  const heroRating = hero?.rating ? RATING[hero.rating] ?? { label: hero.rating, color: C.blue } : null;
  const pipelineOk = pipeline.done === pipeline.total;

  const quickActions = [
    { href: "/screener", label: "AI选股", desc: "今日推荐排行", icon: <Sparkles size={22} />, accent: C.blue },
    { href: "/admin/research?tab=score", label: "影子评分", desc: "Alpha Shadow Score", icon: <Zap size={22} />, accent: "#5856D6" },
    { href: "/admin/research?tab=fusion", label: "融合策略", desc: "Regime Fusion", icon: <Layers size={22} />, accent: "#AF52DE" },
    { href: "/fusion/paper", label: "纸面交易", desc: "Paper Trading", icon: <FileText size={22} />, accent: "#FF2D55" },
    { href: "/backtest", label: "回测研究", desc: "历史策略验证", icon: <BarChart3 size={22} />, accent: C.green },
    { href: "/admin/learning-report", label: "学习报告", desc: "AI 学习成果", icon: <TrendingUp size={22} />, accent: C.amber },
  ];

  const opCards = [
    {
      label: "系统健康度",
      value: `${health.score}`,
      unit: `/100 · ${gradeLabel(health.grade)}`,
      color: gradeColor(health.grade),
      icon: <ShieldCheck size={18} />,
      href: "/admin/mission-control",
    },
    {
      label: "数据流水线",
      value: pipelineOk ? "全部完成" : `${pipeline.done}/${pipeline.total}`,
      unit: pipelineOk ? "" : "步骤",
      color: pipelineOk ? C.green : C.amber,
      icon: <Activity size={18} />,
      href: "/admin/mission-control",
    },
    {
      label: "数据校验",
      value: health.critical === 0 ? "通过" : "异常",
      unit: `CRITICAL ${health.critical}`,
      color: health.critical === 0 ? C.green : C.red,
      icon: <CircleCheck size={18} />,
      href: "/admin/verify",
    },
    {
      label: "数据新鲜度",
      value: data.lastTradingDate ?? "无数据",
      unit: "最新行情日",
      color: C.ink,
      icon: <Clock size={18} />,
      href: "/sync",
    },
  ];

  return (
    <div className="min-h-screen dash-font" style={{ background: "#FAFAFA" }}>
      <div className="mx-auto max-w-[1440px] px-6 lg:px-10 xl:px-14 py-8 lg:py-10">

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <header className="dash-in flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5 mb-10">
          <div>
            <div className="text-[13px] font-medium" style={{ color: C.faint }}>{data.greeting} 👋 欢迎回来</div>
            <h1 className="text-[30px] lg:text-[34px] font-semibold tracking-tight mt-1" style={{ color: C.ink }}>
              TOHOSHOU AI 正在分析日本市场
            </h1>
          </div>
          <div className="flex items-center gap-2.5">
            <Link href="/screener" className="flex items-center gap-2 rounded-full px-4 h-11 bg-white transition-colors hover:bg-[#f5f5f7]"
              style={{ border: `1px solid ${C.line}`, color: C.faint }}>
              <Search size={17} />
              <span className="text-[14px]" style={{ color: C.faint }}>搜索股票…</span>
            </Link>
            <Link href="/news" aria-label="通知" className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-white transition-colors hover:bg-[#f5f5f7]"
              style={{ border: `1px solid ${C.line}`, color: C.sub }}>
              <Bell size={18} />
            </Link>
            <Link href="/admin/mission-control" aria-label="账户" className="inline-flex items-center justify-center w-11 h-11 rounded-full transition-transform hover:scale-105"
              style={{ background: C.ink, color: "#fff" }}>
              <User size={18} />
            </Link>
          </div>
        </header>

        {/* ── Screen 1: Hero + System Status ─────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
          {/* Hero */}
          <div className="lg:col-span-8 dash-in" style={{ animationDelay: "40ms" }}>
            <Card className="p-8 h-full flex flex-col overflow-hidden relative">
              <div className="flex items-center gap-2 mb-6">
                <span style={{ color: C.blue }}><Sparkles size={18} /></span>
                <span className="text-[13px] font-semibold tracking-wide uppercase" style={{ color: C.faint }}>今日精选</span>
              </div>
              {hero ? (
                <div className="flex-1 flex flex-col">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-[32px] font-semibold tracking-tight" style={{ color: C.ink }}>{hero.name}</span>
                        <span className="text-[15px] font-medium tabular-nums px-2 py-0.5 rounded-lg" style={{ color: C.sub, background: "#f5f5f7" }}>{hero.symbol}</span>
                      </div>
                      {heroRating && (
                        <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full text-[13px] font-semibold"
                          style={{ color: heroRating.color, background: `${heroRating.color}14` }}>
                          {heroRating.label} · 排名 #{hero.rank}
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[13px] font-medium" style={{ color: C.faint }}>AI 综合评分</div>
                      <div className="text-[48px] font-semibold tracking-tight tabular-nums leading-none mt-1" style={{ color: C.blue }}>
                        {hero.score != null ? Math.round(hero.score) : "—"}
                      </div>
                    </div>
                  </div>
                  <p className="text-[15px] leading-relaxed mt-6 flex-1" style={{ color: C.sub }}>
                    {hero.summary ?? "该标的进入今日 AI 综合评分排行前列，技术面与量化因子共同支撑其推荐评级。"}
                  </p>
                  <div className="flex items-center gap-3 mt-6">
                    <Link href={`/stocks/${hero.symbol}`}
                      className="inline-flex items-center gap-2 h-11 px-6 rounded-full text-[15px] font-semibold text-white transition-transform hover:scale-[1.03]"
                      style={{ background: C.blue }}>
                      查看分析 <ArrowRight size={17} />
                    </Link>
                    {hero.price != null && (
                      <span className="text-[14px] font-medium tabular-nums" style={{ color: C.faint }}>
                        参考价 ¥{fmt(hero.price, 0)}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
                  <span className="inline-flex items-center justify-center w-16 h-16 rounded-3xl mb-4" style={{ background: "#f5f5f7", color: C.faint }}>
                    <Sparkles size={28} />
                  </span>
                  <div className="text-[19px] font-semibold" style={{ color: C.ink }}>今日暂无推荐</div>
                  <div className="text-[14px] mt-1.5" style={{ color: C.faint }}>每日 08:00 自动更新</div>
                </div>
              )}
            </Card>
          </div>

          {/* System status */}
          <div className="lg:col-span-4 dash-in" style={{ animationDelay: "80ms" }}>
            <Card className="p-6 h-full">
              <div className="flex items-center gap-2 mb-1">
                <span style={{ color: C.ink }}><Activity size={18} /></span>
                <span className="text-[15px] font-semibold" style={{ color: C.ink }}>系统状态</span>
              </div>
              <p className="text-[12px] mb-2" style={{ color: C.faint }}>核心服务实时健康度</p>
              {data.systemStatus.map((s) => (
                <StatusRow key={s.key} label={s.label} detail={s.detail} status={s.status} />
              ))}
            </Card>
          </div>
        </div>

        {/* ── Operations strip (fixes the previously broken "—" cards) ────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-14 dash-in" style={{ animationDelay: "120ms" }}>
          {opCards.map((c) => (
            <Link key={c.label} href={c.href}>
              <Card hover className="p-6 cursor-pointer">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium" style={{ color: C.sub }}>{c.label}</span>
                  <span style={{ color: c.color }}>{c.icon}</span>
                </div>
                <div className="mt-4 flex items-baseline gap-1.5">
                  <span className="text-[24px] font-semibold tracking-tight tabular-nums" style={{ color: c.color }}>{c.value}</span>
                  {c.unit && <span className="text-[12px] font-medium" style={{ color: C.faint }}>{c.unit}</span>}
                </div>
              </Card>
            </Link>
          ))}
        </div>

        {/* ── 市场概况 ───────────────────────────────────────────────────────── */}
        <section className="mb-14 dash-in">
          <SectionHeader title="市场概况" sub={data.marketDate ? `数据日期 ${data.marketDate}` : "实时市场指数"} />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
            {data.market.map((m) => (
              <MarketCard key={m.key} label={m.label} value={m.value} change={m.change} decimals={m.decimals} />
            ))}
          </div>
        </section>

        {/* ── AI 数据统计 ────────────────────────────────────────────────────── */}
        <section className="mb-14 dash-in">
          <SectionHeader title="AI 数据统计" sub="全市场覆盖与今日产出" />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
            <MetricCard label="股票总数" value={fmt(stats.totalStocks)} unit="只" accent={C.blue} icon={<Boxes size={18} />} />
            <MetricCard label="评分完成" value={fmt(stats.scoredCount)} unit="只" accent="#5856D6" icon={<Target size={18} />} />
            <MetricCard label="今日推荐" value={fmt(stats.todayRec)} unit="只" accent={C.green} icon={<Sparkles size={18} />} />
            <MetricCard label="AI 分析" value={fmt(stats.aiAnalysis)} unit="次" accent="#AF52DE" icon={<LineChart size={18} />} />
            <MetricCard label="新闻数量" value={fmt(stats.news)} unit="条" accent={C.amber} icon={<Newspaper size={18} />} />
          </div>
        </section>

        {/* ── 今日流水线 Timeline ────────────────────────────────────────────── */}
        <section className="mb-14 dash-in">
          <SectionHeader title="今日流水线" sub="数据处理时间线（JST）"
            action={<Link href="/admin/mission-control" className="text-[13px] font-medium flex items-center gap-1" style={{ color: C.blue }}>控制中心 <ArrowRight size={14} /></Link>} />
          <Card className="p-2">
            {data.timeline.length > 0 ? (
              <div className="divide-y" style={{ borderColor: C.line }}>
                {data.timeline.map((e, i) => (
                  <div key={i} className="flex items-center gap-5 px-5 py-4">
                    <div className="text-[15px] font-semibold tabular-nums w-16 shrink-0" style={{ color: C.ink }}>{e.time}</div>
                    <div className="relative flex items-center justify-center shrink-0">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: C.green }} />
                    </div>
                    <div className="flex-1 flex items-center justify-between gap-3">
                      <span className="text-[14px] font-medium" style={{ color: C.ink }}>{e.label}</span>
                      <span className="text-[13px]" style={{ color: C.faint }}>{e.detail}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-5 py-10 text-center text-[14px]" style={{ color: C.faint }}>今日暂无流水线记录</div>
            )}
          </Card>
        </section>

        {/* ── 快速入口 ───────────────────────────────────────────────────────── */}
        <section className="mb-10 dash-in">
          <SectionHeader title="快速入口" sub="研究与验证工具" />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
            {quickActions.map((q) => (
              <QuickAction key={q.href} href={q.href} label={q.label} desc={q.desc} icon={q.icon} accent={q.accent} />
            ))}
          </div>
        </section>

        {/* ── Footer ─────────────────────────────────────────────────────────── */}
        <div className="text-center text-[12px] pb-6" style={{ color: C.faint }}>
          数据每 60 秒自动刷新 · 更新于 {data.generatedAt} JST
        </div>
      </div>
    </div>
  );
}
