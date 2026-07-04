"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sparkles, ArrowRight, TrendingUp, TrendingDown,
  Newspaper, Layers, BarChart3, Boxes, Search, Bell, User, Zap, FileText,
  Target, ShieldCheck,
} from "./icons";

// ── Types ─────────────────────────────────────────────────────────────────────
type Sev = "NORMAL" | "WARNING" | "CRITICAL";
type Grade = "GREEN" | "YELLOW" | "RED";

export type DashboardData = {
  greetKey: string;
  sys: { coveragePct: number; scoresToday: number; recsToday: number; globalOk: boolean };
  hero: {
    symbol: string; name: string; rank: number;
    score: number | null; rating: string | null; summary: string | null; price: number | null;
  } | null;
  market: { key: string; value: number | null; change: number | null; decimals: number }[];
  marketDate: string | null;
  systemStatus: { key: string; status: Sev }[];
  health: { score: number; grade: Grade; critical: number; warning: number; pass: number; auditAt: string | null };
  pipeline: { done: number; total: number };
  stats: { totalStocks: number; scoredCount: number; todayRec: number; todayRecTotal: number; aiAnalysis: number; news: number };
  timeline: { time: string; type: string; n: number }[];
  lastTradingDate: string | null;
  generatedAt: string;
};

// ── Palette + tokens ──────────────────────────────────────────────────────────
const C = {
  blue: "#007AFF", green: "#34C759", red: "#FF3B30", amber: "#FF9F0A",
  ink: "#1D1D1F", sub: "#6E6E73", faint: "#86868B", line: "#ECECEC",
};
function sevColor(s: Sev) { return s === "NORMAL" ? C.green : s === "WARNING" ? C.amber : C.red; }
function gradeColor(g: Grade) { return g === "GREEN" ? C.green : g === "YELLOW" ? C.amber : C.red; }
function gradeLabel(g: Grade) { return g === "GREEN" ? "良好" : g === "YELLOW" ? "注意" : "异常"; }

// Display labels live in the component layer (keeps app/*.tsx free of CJK literals).
const GREET: Record<string, string> = { night: "夜深了", morning: "早上好", noon: "中午好", afternoon: "下午好", evening: "晚上好" };
const SYS_LABEL: Record<string, string> = { datasync: "数据同步", aimodel: "AI 引擎", strategy: "策略引擎", cron: "Cron 调度", database: "数据库", api: "API 服务" };
const MKT_LABEL: Record<string, string> = { nikkei: "日经225", topix: "TOPIX", usdjpy: "美元/日元", vix: "VIX 恐慌指数", nasdaq: "纳斯达克" };
const sysStatusText = (s: Sev) => (s === "NORMAL" ? "正常" : s === "WARNING" ? "注意" : "异常");
function tlText(type: string, n: number): { label: string; detail: string } {
  switch (type) {
    case "scores": return { label: "完成综合评分", detail: `${n.toLocaleString()} 只股票` };
    case "news": return { label: "同步新闻资讯", detail: `${n.toLocaleString()} 条` };
    case "prices": return { label: "同步股票行情", detail: `覆盖率 ${n}%` };
    default: return { label: "同步全球指数", detail: "Nikkei · TOPIX · VIX" };
  }
}
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

// ── Score ring (Apple Health style) ───────────────────────────────────────────
function ScoreRing({ score }: { score: number | null }) {
  const s = score != null && Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : null;
  const r = 46, circ = 2 * Math.PI * r;
  const pct = s ?? 0;
  const col = pct >= 75 ? C.green : pct >= 60 ? C.blue : pct >= 45 ? C.amber : C.faint;
  return (
    <div className="relative shrink-0" style={{ width: 116, height: 116 }}>
      <svg width={116} height={116} viewBox="0 0 116 116" style={{ transform: "rotate(-90deg)" }}>
        <circle cx={58} cy={58} r={r} fill="none" stroke="#EEEEF1" strokeWidth={9} />
        <circle cx={58} cy={58} r={r} fill="none" stroke={col} strokeWidth={9} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)}
          style={{ transition: "stroke-dashoffset 700ms cubic-bezier(0.22,1,0.36,1)" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[32px] font-semibold tabular-nums leading-none" style={{ color: C.ink }}>{s ?? "—"}</span>
        <span className="text-[10px] font-medium mt-1 tracking-wide" style={{ color: C.faint }}>AI 评分</span>
      </div>
    </div>
  );
}

// ── DashboardSection ──────────────────────────────────────────────────────────
function DashboardSection({ title, sub, action, delay, children }: {
  title: string; sub?: string; action?: React.ReactNode; delay?: string; children: React.ReactNode;
}) {
  return (
    <section className="dash-in mb-16" style={delay ? { animationDelay: delay } : undefined}>
      <div className="flex items-end justify-between mb-6 gap-4">
        <div>
          <h2 className="text-[22px] font-semibold tracking-[-0.01em]" style={{ color: C.ink }}>{title}</h2>
          {sub && <p className="text-[13px] mt-1" style={{ color: C.faint }}>{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

// ── DashboardHeader ───────────────────────────────────────────────────────────
function DashboardHeader({ greetKey }: { greetKey: string }) {
  return (
    <header className="dash-in flex items-center justify-between gap-4 mb-10">
      <div className="text-[13px] font-medium" style={{ color: C.faint }}>
        {GREET[greetKey] ?? "你好"} 👋 <span style={{ color: C.sub }}>欢迎回来</span>
      </div>
      <div className="flex items-center gap-2.5">
        <Link href="/screener" className="hidden sm:flex items-center gap-2 rounded-full px-4 h-10 dash-card dash-int"
          style={{ color: C.faint }}>
          <Search size={16} />
          <span className="text-[13px] pr-6" style={{ color: C.faint }}>搜索股票…</span>
        </Link>
        <Link href="/news" aria-label="通知" className="inline-flex items-center justify-center w-10 h-10 rounded-full dash-card dash-int" style={{ color: C.sub }}>
          <Bell size={17} />
        </Link>
        <Link href="/admin/mission-control" aria-label="账户" className="inline-flex items-center justify-center w-10 h-10 rounded-full dash-int"
          style={{ background: C.ink, color: "#fff" }}>
          <User size={17} />
        </Link>
      </div>
    </header>
  );
}

// ── DashboardHero ─────────────────────────────────────────────────────────────
function DashboardHero({ hero }: { hero: DashboardData["hero"] }) {
  const rating = hero?.rating ? RATING[hero.rating] ?? { label: hero.rating, color: C.blue } : null;
  return (
    <div className="dash-card p-8 lg:p-9 h-full flex flex-col">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold tracking-[0.16em] uppercase" style={{ color: C.faint }}>Today Intelligence</span>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ color: C.green, background: `${C.green}12` }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: C.green }} /> 实时
        </span>
      </div>
      <h1 className="text-[30px] lg:text-[34px] font-semibold tracking-[-0.02em] mt-4 leading-tight" style={{ color: C.ink }}>
        日本市场正在持续分析中
      </h1>
      <p className="text-[14px] mt-2" style={{ color: C.sub }}>TOHOSHOU AI 每日 08:00 自动更新今日情报</p>

      <div className="mt-auto pt-8">
        {hero ? (
          <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 24 }}>
            <div className="flex items-start justify-between gap-6">
              <div className="min-w-0">
                <div className="text-[12px] font-semibold tracking-wide uppercase mb-2" style={{ color: C.faint }}>今日精选</div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-[28px] font-semibold tracking-[-0.01em]" style={{ color: C.ink }}>{hero.name}</span>
                  <span className="text-[13px] font-medium tabular-nums px-2 py-0.5 rounded-lg" style={{ color: C.sub, background: "#F4F4F6" }}>{hero.symbol}</span>
                </div>
                {rating && (
                  <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold"
                    style={{ color: rating.color, background: `${rating.color}14` }}>
                    {rating.label} · 排名 #{hero.rank}
                  </div>
                )}
              </div>
              <ScoreRing score={hero.score} />
            </div>
            <p className="text-[14px] leading-relaxed mt-5 line-clamp-2" style={{ color: C.sub }}>
              {hero.summary ?? "该标的进入今日 AI 综合评分排行前列，技术面与量化因子共同支撑其推荐评级。"}
            </p>
            <div className="flex items-center gap-4 mt-6">
              <Link href={`/stocks/${hero.symbol}`}
                className="inline-flex items-center gap-2 h-11 px-6 rounded-full text-[15px] font-semibold text-white dash-int"
                style={{ background: C.blue }}>
                查看分析 <ArrowRight size={17} />
              </Link>
              {hero.price != null && (
                <span className="text-[13px] font-medium tabular-nums" style={{ color: C.faint }}>参考价 ¥{fmt(hero.price, 0)}</span>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center py-8" style={{ borderTop: `1px solid ${C.line}`, paddingTop: 32 }}>
            <span className="inline-flex items-center justify-center w-16 h-16 rounded-3xl mb-4" style={{ background: "#F4F4F6", color: C.faint }}>
              <Sparkles size={28} />
            </span>
            <div className="text-[18px] font-semibold" style={{ color: C.ink }}>今日暂无推荐</div>
            <div className="text-[13px] mt-1.5" style={{ color: C.faint }}>每日 08:00 自动更新</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── DashboardStatusCard (health + status pills) ───────────────────────────────
function StatusPill({ label, status }: { label: string; status: Sev }) {
  const color = sevColor(status);
  return (
    <div className="flex items-center gap-2.5 rounded-2xl px-3.5 py-3" style={{ border: `1px solid ${C.line}`, background: "#FCFCFD" }}>
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color, boxShadow: `0 0 0 3px ${color}1f` }} />
      <span className="text-[13px] font-medium flex-1 truncate" style={{ color: C.ink }}>{label}</span>
      <span className="text-[11px] font-semibold" style={{ color }}>{sysStatusText(status)}</span>
    </div>
  );
}
function DashboardStatusCard({ health, pipeline, systemStatus, lastTradingDate }: {
  health: DashboardData["health"]; pipeline: DashboardData["pipeline"];
  systemStatus: DashboardData["systemStatus"]; lastTradingDate: string | null;
}) {
  const gColor = gradeColor(health.grade);
  return (
    <div className="dash-card p-6 lg:p-7 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span style={{ color: C.ink }}><ShieldCheck size={17} /></span>
          <span className="text-[15px] font-semibold" style={{ color: C.ink }}>系统状态</span>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ color: gColor, background: `${gColor}14` }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: gColor }} /> Healthy
        </span>
      </div>

      <div className="flex items-end gap-2 mt-5 mb-5">
        <span className="text-[44px] font-semibold tabular-nums leading-none tracking-[-0.02em]" style={{ color: C.ink }}>{health.score}</span>
        <span className="text-[14px] font-medium mb-1.5" style={{ color: C.faint }}>/100</span>
        <span className="text-[12px] font-semibold mb-1.5 ml-1 px-2 py-0.5 rounded-full" style={{ color: gColor, background: `${gColor}14` }}>{gradeLabel(health.grade)}</span>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {systemStatus.map((s) => (
          <StatusPill key={s.key} label={SYS_LABEL[s.key] ?? s.key} status={s.status} />
        ))}
      </div>

      <div className="mt-auto pt-5 text-[12px] font-medium flex items-center gap-2 flex-wrap" style={{ borderTop: `1px solid ${C.line}`, marginTop: 20, color: C.faint }}>
        <span>流水线 {pipeline.done}/{pipeline.total}</span>
        <span style={{ color: C.line }}>·</span>
        <span>校验 {health.critical === 0 ? "通过" : `异常 ${health.critical}`}</span>
        <span style={{ color: C.line }}>·</span>
        <span>行情 {lastTradingDate ?? "—"}</span>
      </div>
    </div>
  );
}

// ── DashboardMetricCard ───────────────────────────────────────────────────────
function DashboardMetricCard({ value, title, icon, accent }: {
  value: string; title: string; icon: React.ReactNode; accent: string;
}) {
  return (
    <div className="dash-card dash-int p-7">
      <div className="flex items-start justify-between">
        <span className="text-[38px] lg:text-[40px] font-semibold tabular-nums tracking-[-0.02em] leading-none" style={{ color: C.ink }}>{value}</span>
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl mt-0.5" style={{ background: `${accent}12`, color: accent }}>{icon}</span>
      </div>
      <div className="text-[14px] font-medium mt-4" style={{ color: C.sub }}>{title}</div>
    </div>
  );
}

// ── DashboardMarketCard (Apple Stocks style) ──────────────────────────────────
function DashboardMarketCard({ label, value, change, decimals }: {
  label: string; value: number | null; change: number | null; decimals: number;
}) {
  const up = change != null && change > 0;
  const down = change != null && change < 0;
  const cColor = up ? C.green : down ? C.red : C.faint;
  return (
    <div className="dash-card dash-int p-5">
      <div className="flex items-center justify-between">
        <span className="text-[14px] font-semibold" style={{ color: C.ink }}>{label}</span>
        <span className="text-[11px] font-medium" style={{ color: C.faint }}>今日</span>
      </div>
      <div className="text-[27px] font-semibold tabular-nums tracking-[-0.01em] mt-3 leading-none" style={{ color: C.ink }}>{fmt(value, decimals)}</div>
      {change != null && Number.isFinite(change) ? (
        <div className="inline-flex items-center gap-1 mt-3 text-[13px] font-semibold px-2 py-0.5 rounded-lg" style={{ color: cColor, background: `${cColor}12` }}>
          {up ? <TrendingUp size={13} /> : down ? <TrendingDown size={13} /> : null}
          <span className="tabular-nums">{up ? "+" : ""}{change.toFixed(2)}%</span>
        </div>
      ) : (
        <div className="mt-3 text-[12px] font-medium" style={{ color: C.faint }}>收盘价</div>
      )}
    </div>
  );
}

// ── DashboardTimeline (GitHub activity / Apple Health style) ───────────────────
function DashboardTimeline({ items }: { items: DashboardData["timeline"] }) {
  if (items.length === 0) {
    return <div className="dash-card px-6 py-12 text-center text-[14px]" style={{ color: C.faint }}>今日暂无流水线记录</div>;
  }
  return (
    <div className="dash-card p-6 lg:p-7">
      {items.map((e, i) => {
        const tx = tlText(e.type, e.n);
        const last = i === items.length - 1;
        return (
          <div key={i} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span className="w-3 h-3 rounded-full mt-1.5 shrink-0" style={{ background: C.green, boxShadow: `0 0 0 4px ${C.green}1a` }} />
              {!last && <span className="w-px flex-1 my-1" style={{ background: C.line }} />}
            </div>
            <div className={`flex-1 flex items-center justify-between gap-3 ${last ? "" : "pb-6"}`}>
              <div>
                <div className="text-[12px] font-medium tabular-nums" style={{ color: C.faint }}>{e.time} JST</div>
                <div className="text-[14px] font-medium mt-0.5" style={{ color: C.ink }}>{tx.label}</div>
              </div>
              <span className="text-[13px]" style={{ color: C.faint }}>{tx.detail}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── DashboardQuickAction (Launchpad tile) ─────────────────────────────────────
function DashboardQuickAction({ href, label, desc, icon, accent }: {
  href: string; label: string; desc: string; icon: React.ReactNode; accent: string;
}) {
  return (
    <Link href={href} className="block h-full">
      <div className="dash-card dash-tile p-6 h-full flex flex-col items-center text-center cursor-pointer">
        <span className="inline-flex items-center justify-center w-14 h-14 rounded-2xl" style={{ background: `${accent}12`, color: accent }}>{icon}</span>
        <div className="text-[15px] font-semibold mt-4" style={{ color: C.ink }}>{label}</div>
        <div className="text-[12px] mt-1" style={{ color: C.faint }}>{desc}</div>
      </div>
    </Link>
  );
}

// ── Main View ─────────────────────────────────────────────────────────────────
export function DashboardView({ data }: { data: DashboardData }) {
  const router = useRouter();

  // Silent server-side refresh every 60s — re-runs the server component, swaps
  // fresh props with no loading flash (current data stays on screen meanwhile).
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 60_000);
    return () => clearInterval(id);
  }, [router]);

  const { stats } = data;
  const metrics = [
    { value: fmt(stats.totalStocks), title: "日本上市公司", icon: <Boxes size={17} />, accent: C.blue },
    { value: fmt(stats.scoredCount), title: "AI 已完成分析", icon: <Target size={17} />, accent: "#5856D6" },
    { value: fmt(stats.news), title: "新闻事件", icon: <Newspaper size={17} />, accent: C.amber },
    { value: fmt(stats.todayRec), title: "今日推荐", icon: <Sparkles size={17} />, accent: C.green },
  ];
  const quickActions = [
    { href: "/screener", label: "AI 选股", desc: "今日推荐排行", icon: <Sparkles size={24} />, accent: C.blue },
    { href: "/admin/research?tab=score", label: "影子评分", desc: "Alpha Shadow", icon: <Zap size={24} />, accent: "#5856D6" },
    { href: "/admin/research?tab=fusion", label: "融合策略", desc: "Regime Fusion", icon: <Layers size={24} />, accent: "#AF52DE" },
    { href: "/fusion/paper", label: "纸面交易", desc: "Paper Trading", icon: <FileText size={24} />, accent: "#FF2D55" },
    { href: "/backtest", label: "回测研究", desc: "历史验证", icon: <BarChart3 size={24} />, accent: C.green },
    { href: "/admin/learning-report", label: "学习报告", desc: "AI 学习成果", icon: <TrendingUp size={24} />, accent: C.amber },
  ];

  return (
    <div className="min-h-screen dash-font" style={{ background: "#FAFAFA" }}>
      <div className="mx-auto max-w-[1440px] px-6 lg:px-10 xl:px-16 py-8 lg:py-12">
        <DashboardHeader greetKey={data.greetKey} />

        {/* First screen — Hero + System Status (2 cards) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-16">
          <div className="lg:col-span-8 dash-in" style={{ animationDelay: "40ms" }}>
            <DashboardHero hero={data.hero} />
          </div>
          <div className="lg:col-span-4 dash-in" style={{ animationDelay: "80ms" }}>
            <DashboardStatusCard health={data.health} pipeline={data.pipeline} systemStatus={data.systemStatus} lastTradingDate={data.lastTradingDate} />
          </div>
        </div>

        {/* Overview metrics */}
        <DashboardSection title="概览" sub="全市场覆盖与今日产出">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {metrics.map((m) => <DashboardMetricCard key={m.title} {...m} />)}
          </div>
        </DashboardSection>

        {/* Market */}
        <DashboardSection title="市场概况" sub={data.marketDate ? `数据日期 ${data.marketDate}` : "实时市场指数"}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {data.market.map((m) => (
              <DashboardMarketCard key={m.key} label={MKT_LABEL[m.key] ?? m.key} value={m.value} change={m.change} decimals={m.decimals} />
            ))}
          </div>
        </DashboardSection>

        {/* Timeline */}
        <DashboardSection title="今日流水线" sub="数据处理活动流（JST）"
          action={<Link href="/admin/mission-control" className="text-[13px] font-medium flex items-center gap-1" style={{ color: C.blue }}>控制中心 <ArrowRight size={14} /></Link>}>
          <DashboardTimeline items={data.timeline} />
        </DashboardSection>

        {/* Quick actions */}
        <DashboardSection title="快速入口" sub="研究与验证工具">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
            {quickActions.map((q) => <DashboardQuickAction key={q.href} {...q} />)}
          </div>
        </DashboardSection>

        <div className="flex items-center justify-center gap-2 text-[12px] pb-6" style={{ color: C.faint }}>
          <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: C.green }} />
          数据每 60 秒自动刷新 · 更新于 {data.generatedAt} JST
        </div>
      </div>
    </div>
  );
}
