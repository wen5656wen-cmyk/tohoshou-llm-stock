"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sparkles, ArrowRight, TrendingUp, TrendingDown, CircleCheck,
  Layers, BarChart3, Boxes, Bell, User, Zap, FileText,
  ShieldCheck, Activity,
} from "./icons";
import { ROUTES, stockDetail, timelineRoute } from "@/lib/routes";

// ── Types ─────────────────────────────────────────────────────────────────────
type Sev = "NORMAL" | "WARNING" | "CRITICAL";
type Grade = "GREEN" | "YELLOW" | "RED";

export type DashboardData = {
  greetKey: string;
  sys: { coveragePct: number; scoresToday: number; recsToday: number; globalOk: boolean };
  intelligence: { regime: string | null; confidence: number | null; risk: string | null; volatility: number | null; breadth: number | null };
  hero: {
    symbol: string; name: string; rank: number;
    score: number | null; rating: string | null; summary: string | null; reasonKeys: string[]; price: number | null;
  } | null;
  market: { key: string; value: number | null; change: number | null; decimals: number }[];
  marketDate: string | null;
  systemStatus: { key: string; status: Sev }[];
  health: { score: number; grade: Grade; critical: number; warning: number; pass: number; auditAt: string | null };
  pipeline: { done: number; total: number };
  stats: { totalStocks: number; scoredCount: number; todayRec: number; todayRecTotal: number; strongBuy: number; aiAnalysis: number; news: number };
  timeline: { time: string; type: string; n: number }[];
  lastTradingDate: string | null;
  generatedAt: string;
};

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  blue: "#007AFF", green: "#34C759", red: "#FF3B30", amber: "#FF9F0A",
  ink: "#1D1D1F", sub: "#6E6E73", faint: "#86868B", line: "#ECECEC",
};
function sevColor(s: Sev) { return s === "NORMAL" ? C.green : s === "WARNING" ? C.amber : C.red; }
function gradeColor(g: Grade) { return g === "GREEN" ? C.green : g === "YELLOW" ? C.amber : C.red; }
function gradeLabel(g: Grade) { return g === "GREEN" ? "良好" : g === "YELLOW" ? "注意" : "异常"; }

const GREET: Record<string, string> = { night: "夜深了", morning: "早上好", noon: "中午好", afternoon: "下午好", evening: "晚上好" };
const SYS_LABEL: Record<string, string> = { datasync: "数据同步", aimodel: "AI 引擎", strategy: "策略引擎", cron: "Cron", database: "数据库", api: "API" };
const MKT_LABEL: Record<string, string> = { nikkei: "日经225", topix: "TOPIX", usdjpy: "美元/日元", vix: "VIX", nasdaq: "纳斯达克" };
const REASON: Record<string, string> = { tech: "技术动能强劲", fund: "基本面稳健", flow: "资金流入活跃", news: "新闻情绪偏正面", global: "全球环境利好" };
const RATING: Record<string, { label: string; color: string }> = {
  STRONG_BUY: { label: "强烈推荐", color: C.green }, BUY: { label: "推荐", color: C.blue },
  HOLD: { label: "持有", color: C.amber }, WATCH: { label: "观察", color: C.faint }, AVOID: { label: "回避", color: C.red },
};
const SENTIMENT: Record<string, { zh: string; en: string; color: string }> = {
  BULL: { zh: "多头", en: "Bullish", color: C.green },
  SIDEWAYS: { zh: "震荡", en: "Neutral", color: C.amber },
  BEAR: { zh: "空头", en: "Bearish", color: C.red },
};
const RISK: Record<string, { zh: string; en: string; color: string }> = {
  LOW: { zh: "低", en: "Low", color: C.green }, MEDIUM: { zh: "中", en: "Medium", color: C.amber }, HIGH: { zh: "高", en: "High", color: C.red },
};
function sysStatusText(s: Sev) { return s === "NORMAL" ? "正常" : s === "WARNING" ? "注意" : "异常"; }
function tlText(type: string, n: number): { label: string; detail: string } {
  switch (type) {
    case "scores": return { label: "完成综合评分", detail: `${n.toLocaleString()} 只` };
    case "news": return { label: "同步新闻资讯", detail: `${n.toLocaleString()} 条` };
    case "prices": return { label: "同步股票行情", detail: `${n}%` };
    default: return { label: "同步全球指数", detail: "OK" };
  }
}
function mktAI(key: string, value: number | null, change: number | null): string {
  const up = change != null && change > 0, down = change != null && change < 0;
  switch (key) {
    case "topix": case "nikkei": return up ? "多头趋势延续" : down ? "承压回调" : "横盘整理";
    case "usdjpy": return value != null && value >= 150 ? "日元偏弱 · 利好出口" : "日元走强";
    case "vix": return value == null ? "—" : value < 20 ? "风险偏低 · 适合持仓" : value <= 30 ? "波动上升 · 谨慎" : "风险偏高 · 防御";
    case "nasdaq": return up ? "美科技走强" : down ? "美科技承压" : "美股走平";
    default: return "";
  }
}
function fmt(v: number | null, d = 0) {
  if (v == null || !Number.isFinite(v)) return "暂无";
  return v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

// ── ScoreRing ─────────────────────────────────────────────────────────────────
function ScoreRing({ score, size = 58, stroke = 5, color }: { score: number | null; size?: number; stroke?: number; color: string }) {
  const s = score != null && Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : null;
  const r = (size - stroke) / 2, circ = 2 * Math.PI * r, pct = s ?? 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#EEEEF1" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)} style={{ transition: "stroke-dashoffset 600ms cubic-bezier(0.22,1,0.36,1)" }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-semibold tabular-nums leading-none" style={{ fontSize: size * 0.38, color: C.ink }}>{s ?? "—"}</span>
      </div>
    </div>
  );
}

// ── Header (compact) ──────────────────────────────────────────────────────────
export function CmdHeader({ greetKey }: { greetKey: string }) {
  return (
    <header className="dash-in relative z-30 flex items-center justify-between gap-4 h-11">
      <div className="flex items-baseline gap-2.5 min-w-0">
        <span className="text-[17px] font-semibold tracking-[-0.01em]" style={{ color: C.ink }}>指挥中心</span>
        <span className="text-[12px] font-medium truncate" style={{ color: C.faint }}>{GREET[greetKey] ?? "你好"} · 欢迎回来</span>
      </div>
      <div className="flex items-center gap-2">
        <Link href={ROUTES.NEWS} aria-label="通知" title="通知" className="inline-flex items-center justify-center w-9 h-9 rounded-full dash-card dash-int" style={{ color: C.sub }}><Bell size={16} /></Link>
        <Link href={ROUTES.SETTINGS} aria-label="账户" title="系统设置" className="inline-flex items-center justify-center w-9 h-9 rounded-full dash-int" style={{ background: C.ink, color: "#fff" }}><User size={16} /></Link>
      </div>
    </header>
  );
}

// ── Today Intelligence (row 1, left) ──────────────────────────────────────────
export function TodayIntelligence({ intel, hero, marketDate }: { intel: DashboardData["intelligence"]; hero: DashboardData["hero"]; marketDate: string | null }) {
  const sent = intel.regime ? SENTIMENT[intel.regime] ?? { zh: "—", en: "—", color: C.faint } : { zh: "—", en: "—", color: C.faint };
  const risk = intel.risk ? RISK[intel.risk] : null;
  const rating = hero?.rating ? RATING[hero.rating] ?? { label: hero.rating, color: C.blue } : null;
  const reasons = hero?.reasonKeys?.length ? hero.reasonKeys.map((k) => REASON[k] ?? k) : [];
  return (
    <div className="dash-card p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold tracking-[0.14em] uppercase" style={{ color: C.faint }}>Today Intelligence</span>
        <span className="text-[11px] font-medium" style={{ color: C.faint }}>{marketDate ?? ""}</span>
      </div>
      <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
        {/* Left: market judgment */}
        <div className="flex flex-col justify-between pr-4" style={{ borderRight: `1px solid ${C.line}` }}>
          <div>
            <div className="text-[12px] font-medium" style={{ color: C.faint }}>今日 AI 判断</div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-[26px] font-semibold tracking-[-0.01em] leading-none" style={{ color: sent.color }}>{sent.zh}</span>
              <span className="text-[13px] font-semibold" style={{ color: sent.color }}>{sent.en}</span>
            </div>
          </div>
          <div className="mt-2">
            <div className="flex items-center justify-between text-[12px] mb-1">
              <span style={{ color: C.faint }}>AI 置信度</span>
              <span className="font-semibold tabular-nums" style={{ color: C.ink }}>{intel.confidence != null ? `${intel.confidence}%` : "—"}</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#EEEEF1" }}>
              <div className="h-full rounded-full" style={{ width: `${intel.confidence ?? 0}%`, background: sent.color, transition: "width .6s ease" }} />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[12px]" style={{ color: C.faint }}>市场风险</span>
            {risk ? (
              <span className="text-[12px] font-semibold px-2 py-0.5 rounded-full" style={{ color: risk.color, background: `${risk.color}14` }}>{risk.zh} · {risk.en}</span>
            ) : <span className="text-[12px]" style={{ color: C.faint }}>—</span>}
            {intel.volatility != null && <span className="text-[11px] tabular-nums" style={{ color: C.faint }}>波动 {intel.volatility.toFixed(1)}%</span>}
          </div>
        </div>
        {/* Right: top pick */}
        <div className="flex flex-col min-w-0">
          {hero ? (
            <>
              <div className="flex items-center gap-2.5">
                <ScoreRing score={hero.score} size={54} color={rating?.color ?? C.blue} />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ color: C.blue, background: `${C.blue}14` }}>TOP1</span>
                    {rating && <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full" style={{ color: rating.color, background: `${rating.color}14` }}>{rating.label}</span>}
                  </div>
                  <div className="text-[17px] font-semibold tracking-[-0.01em] truncate mt-0.5" style={{ color: C.ink }}>{hero.name}</div>
                  <div className="text-[11px] font-medium tabular-nums" style={{ color: C.faint }}>{hero.symbol}{hero.price != null ? ` · ¥${fmt(hero.price)}` : ""}</div>
                </div>
              </div>
              <div className="mt-2 flex-1 min-h-0">
                {reasons.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    {reasons.map((r, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-[12px]" style={{ color: C.sub }}>
                        <span className="w-1 h-1 rounded-full shrink-0" style={{ background: C.green }} />{r}
                      </div>
                    ))}
                  </div>
                ) : hero.summary ? (
                  <p className="text-[12px] leading-snug line-clamp-3" style={{ color: C.sub }}>{hero.summary}</p>
                ) : null}
              </div>
              <Link href={stockDetail(hero.symbol)} className="inline-flex items-center justify-center gap-1.5 h-8 mt-2 rounded-full text-[12px] font-semibold text-white dash-int" style={{ background: C.blue }}>
                查看分析 <ArrowRight size={13} />
              </Link>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="text-[14px] font-semibold" style={{ color: C.ink }}>今日暂无推荐</div>
              <div className="text-[12px] mt-1" style={{ color: C.faint }}>每日 08:00 自动更新</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── System Health (row 1, right) ──────────────────────────────────────────────
export function SystemHealth({ health, systemStatus, pipeline }: { health: DashboardData["health"]; systemStatus: DashboardData["systemStatus"]; pipeline: DashboardData["pipeline"] }) {
  const g = gradeColor(health.grade);
  return (
    <Link href={ROUTES.MISSION_CONTROL} title="进入控制中心" className="h-full dash-card dash-int p-4 flex flex-col">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5"><span style={{ color: C.ink }}><ShieldCheck size={15} /></span><span className="text-[13px] font-semibold" style={{ color: C.ink }}>系统状态</span></div>
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ color: g, background: `${g}14` }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: g }} />Healthy</span>
      </div>
      <div className="flex items-end gap-1.5 mt-1.5 mb-2.5">
        <span className="text-[34px] font-semibold tabular-nums leading-none tracking-[-0.02em]" style={{ color: C.ink }}>{health.score}</span>
        <span className="text-[12px] font-medium mb-1" style={{ color: C.faint }}>/100</span>
        <span className="text-[11px] font-semibold mb-1 ml-0.5" style={{ color: g }}>{gradeLabel(health.grade)}</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5 flex-1">
        {systemStatus.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: sevColor(s.status) }} />
            <span className="text-[11px] font-medium truncate" style={{ color: C.sub }}>{SYS_LABEL[s.key] ?? s.key}</span>
          </div>
        ))}
      </div>
      <div className="text-[11px] font-medium mt-1.5 pt-1.5" style={{ borderTop: `1px solid ${C.line}`, color: C.faint }}>
        流水线 {pipeline.done}/{pipeline.total} · 校验 {health.critical === 0 ? "通过" : `异常${health.critical}`}
      </div>
    </Link>
  );
}

// ── Market + Stats (row 2, merged) ────────────────────────────────────────────
function MarketAndStats({ market, stats }: { market: DashboardData["market"]; stats: DashboardData["stats"] }) {
  const statCells = [
    { label: "股票总数", value: fmt(stats.totalStocks), color: C.blue },
    { label: "评分完成", value: fmt(stats.scoredCount), color: "#5856D6" },
    { label: "今日推荐", value: fmt(stats.todayRec), color: C.green },
    { label: "Strong Buy", value: fmt(stats.strongBuy), color: C.green },
    { label: "AI 分析", value: fmt(stats.aiAnalysis), color: "#AF52DE" },
    { label: "新闻事件", value: fmt(stats.news), color: C.amber },
  ];
  return (
    <div className="flex flex-col gap-2.5">
      {/* Market row with AI interpretation */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {market.map((m) => {
          const up = m.change != null && m.change > 0, down = m.change != null && m.change < 0;
          const cc = up ? C.green : down ? C.red : C.faint;
          return (
            <Link key={m.key} href={ROUTES.MARKET} className="dash-card dash-int p-3 block">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold" style={{ color: C.ink }}>{MKT_LABEL[m.key] ?? m.key}</span>
                {m.change != null && Number.isFinite(m.change) && (
                  <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums" style={{ color: cc }}>
                    {up ? <TrendingUp size={11} /> : down ? <TrendingDown size={11} /> : null}{up ? "+" : ""}{m.change.toFixed(2)}%
                  </span>
                )}
              </div>
              <div className="text-[19px] font-semibold tabular-nums tracking-[-0.01em] leading-none mt-1" style={{ color: C.ink }}>{fmt(m.value, m.decimals)}</div>
              <div className="text-[11px] font-medium mt-1 truncate" style={{ color: C.faint }}>AI：{mktAI(m.key, m.value, m.change)}</div>
            </Link>
          );
        })}
      </div>
      {/* Stats row */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-2.5">
        {statCells.map((s) => (
          <div key={s.label} className="dash-card p-3 flex flex-col justify-center">
            <span className="text-[22px] font-semibold tabular-nums tracking-[-0.02em] leading-none" style={{ color: C.ink }}>{s.value}</span>
            <span className="text-[11px] font-medium mt-1 flex items-center gap-1" style={{ color: C.sub }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Market row only (for Command Center; stats deferred to Screener) ──────────
export function MarketRow({ market }: { market: DashboardData["market"] }) {
  // Home spec: keep exactly 4 cards on one row (日经225 / TOPIX / USDJPY / VIX)
  const four = market.filter((m) => ["nikkei", "topix", "usdjpy", "vix"].includes(m.key));
  const shown = four.length >= 4 ? four.slice(0, 4) : market.slice(0, 4);
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
      {shown.map((m) => {
        const up = m.change != null && m.change > 0, down = m.change != null && m.change < 0;
        const cc = up ? C.green : down ? C.red : C.faint;
        return (
          <Link key={m.key} href={ROUTES.MARKET} className="dash-card dash-int p-3 block">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold" style={{ color: C.ink }}>{MKT_LABEL[m.key] ?? m.key}</span>
              {m.change != null && Number.isFinite(m.change) && (
                <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums" style={{ color: cc }}>
                  {up ? <TrendingUp size={11} /> : down ? <TrendingDown size={11} /> : null}{up ? "+" : ""}{m.change.toFixed(2)}%
                </span>
              )}
            </div>
            <div className="text-[19px] font-semibold tabular-nums tracking-[-0.01em] leading-none mt-1" style={{ color: C.ink }}>{fmt(m.value, m.decimals)}</div>
            <div className="text-[11px] font-medium mt-1 truncate" style={{ color: C.faint }}>AI：{mktAI(m.key, m.value, m.change)}</div>
          </Link>
        );
      })}
    </div>
  );
}

// ── Pipeline (row 3, left) ────────────────────────────────────────────────────
export function PipelineCompact({ timeline }: { timeline: DashboardData["timeline"] }) {
  return (
    <div className="dash-card p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5"><span style={{ color: C.ink }}><Activity size={15} /></span><span className="text-[13px] font-semibold" style={{ color: C.ink }}>今日流水线</span></div>
        <Link href={ROUTES.MISSION_CONTROL} className="text-[11px] font-medium flex items-center gap-0.5" style={{ color: C.blue }}>控制中心 <ArrowRight size={12} /></Link>
      </div>
      <div className="flex flex-col justify-between flex-1">
        {timeline.length > 0 ? timeline.map((e, i) => {
          const tx = tlText(e.type, e.n);
          return (
            <Link key={i} href={timelineRoute(e.type)} className="flex items-center gap-3 py-1.5 group" style={i > 0 ? { borderTop: `1px solid ${C.line}` } : undefined}>
              <span className="text-[12px] font-semibold tabular-nums w-11 shrink-0" style={{ color: C.faint }}>{e.time}</span>
              <span className="text-[13px] font-medium flex-1 transition-colors group-hover:text-[#007AFF]" style={{ color: C.ink }}>{tx.label}</span>
              <span className="text-[12px] tabular-nums" style={{ color: C.faint }}>{tx.detail}</span>
              <span style={{ color: C.green }}><CircleCheck size={15} /></span>
            </Link>
          );
        }) : <div className="text-[12px] text-center py-6" style={{ color: C.faint }}>今日暂无记录</div>}
      </div>
    </div>
  );
}

// ── Quick Actions (row 3, right) ──────────────────────────────────────────────
export function QuickActions() {
  const items = [
    { href: ROUTES.AI_SELECTION, label: "AI 选股", icon: <Sparkles size={19} />, accent: C.blue },
    { href: ROUTES.SHADOW_SCORE, label: "影子评分", icon: <Zap size={19} />, accent: "#5856D6" },
    { href: ROUTES.FUSION_REPORT, label: "融合策略", icon: <Layers size={19} />, accent: "#AF52DE" },
    { href: ROUTES.PAPER_TRADING, label: "纸面交易", icon: <FileText size={19} />, accent: "#FF2D55" },
    { href: ROUTES.BACKTEST, label: "回测研究", icon: <BarChart3 size={19} />, accent: C.green },
    { href: ROUTES.LEARNING_REPORT, label: "学习报告", icon: <TrendingUp size={19} />, accent: C.amber },
  ];
  return (
    <div className="dash-card p-4 h-full flex flex-col">
      <div className="flex items-center gap-1.5 mb-2"><span style={{ color: C.ink }}><Boxes size={15} /></span><span className="text-[13px] font-semibold" style={{ color: C.ink }}>快速入口</span></div>
      <div className="grid grid-cols-3 gap-2.5 flex-1">
        {items.map((q) => (
          <Link key={q.href} href={q.href} className="dash-card dash-tile flex flex-col items-center justify-center gap-1.5 rounded-2xl">
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl" style={{ background: `${q.accent}12`, color: q.accent }}>{q.icon}</span>
            <span className="text-[12px] font-semibold" style={{ color: C.ink }}>{q.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function DashboardView({ data }: { data: DashboardData }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 60_000);
    return () => clearInterval(id);
  }, [router]);

  return (
    <div className="min-h-screen dash-font" style={{ background: "#FAFAFA" }}>
      <div className="mx-auto max-w-[1600px] px-5 lg:px-7 xl:px-9 py-4 flex flex-col gap-3">
        <CmdHeader greetKey={data.greetKey} />

        {/* Row 1 — Today Intelligence + System Health */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 dash-in" style={{ animationDelay: "30ms", height: 232 }}>
          <div className="lg:col-span-8 min-h-0"><TodayIntelligence intel={data.intelligence} hero={data.hero} marketDate={data.marketDate} /></div>
          <div className="lg:col-span-4 min-h-0"><SystemHealth health={data.health} systemStatus={data.systemStatus} pipeline={data.pipeline} /></div>
        </div>

        {/* Row 2 — Market + Statistics (merged) */}
        <div className="dash-in" style={{ animationDelay: "60ms" }}>
          <MarketAndStats market={data.market} stats={data.stats} />
        </div>

        {/* Row 3 — Pipeline + Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 dash-in" style={{ animationDelay: "90ms", height: 210 }}>
          <div className="lg:col-span-7 min-h-0"><PipelineCompact timeline={data.timeline} /></div>
          <div className="lg:col-span-5 min-h-0"><QuickActions /></div>
        </div>

        <div className="flex items-center justify-center gap-1.5 text-[11px]" style={{ color: C.faint }}>
          <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: C.green }} />每 60 秒自动刷新 · {data.generatedAt} JST
        </div>
      </div>
    </div>
  );
}
