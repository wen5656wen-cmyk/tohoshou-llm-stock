"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { AISafetyPanel } from "@/components/AISafetyPanel";

// ── Types ─────────────────────────────────────────────────────────────────────
type ModuleStatus = "PASS" | "WARNING" | "FAIL";

interface VerifyModule {
  key: string;
  name: string;
  status: ModuleStatus;
  current: string | number | boolean | null;
  expected: string;
  message: string;
  fixHint: string;
}

interface StatusData {
  ready: boolean;
  blockingIssues: string[];
  warnings: string[];
  modules: VerifyModule[];
  checkedAt: string;
  meta: {
    stockCount: number;
    priceSyncOk: boolean;
    healthCritical: number | null;
    healthAllowRec: boolean | null;
  };
}



type BacktestResult = {
  date: string; horizon: string; portfolioSize: string; winRate: number | null;
  avgReturn: number | null; medianReturn: number | null; filled: number; totalRecommendations: number;
  bestReturn: number | null; worstReturn: number | null; bestSymbol: string | null; worstSymbol: string | null;
};

type BacktestPick = {
  date: string; symbol: string; name: string; gptRank: number; gptRating: string | null;
  buyPrice: number | null; entryPrice: number | null;
  return7d: number | null; return30d: number | null; return90d: number | null;
  price7d: number | null; price30d: number | null;
};

type DeploymentRow = {
  id: number;
  commitHash: string;
  summary: string;
  modifiedFiles: string[];
  buildStatus: string;
  healthStatus: string;
  apiStatus: string;
  pageStatus: string;
  databaseStatus: string;
  pm2Status: string;
  productionReady: boolean;
  warnings: string[];
  blockingIssues: string[];
  operator: string;
  deployedAt: string;
  deployedAtJst: string;
};

// ── i18n label maps ───────────────────────────────────────────────────────────
const MODULE_LABELS: Record<string, string> = {
  system:      "系统状态 / System",
  data_sync:   "数据同步 / Data Sync",
  daily_rec:   "每日推荐 / Daily Recommendation",
  ai_scores:   "AI评分 / AI Scores",
  backtest:    "回测结果 / Backtest",
  cron:        "定时任务 / Cron & Health",
  health:      "数据健康守卫 / Data Health Guard",
  api_routes:  "接口路由 / API Routes",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(v: number | null | undefined, dec = 1) { return v == null ? "—" : v.toFixed(dec); }
function fmtPct(v: number | null | undefined) {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}
function fmtJpy(v: number | null | undefined) { return v == null ? "—" : `¥${v.toLocaleString()}`; }
function retColor(v: number | null) {
  if (v == null) return "text-slate-400";
  return v >= 0 ? "text-emerald-600 font-semibold" : "text-red-500 font-semibold";
}
function ratingBadge(r: string | null): React.ReactElement {
  const map: Record<string, string> = {
    STRONG_BUY: "bg-violet-100 text-violet-800",
    BUY:        "bg-blue-100 text-blue-700",
    HOLD:       "bg-slate-100 text-slate-600",
    WATCH:      "bg-amber-100 text-amber-700",
    AVOID:      "bg-red-100 text-red-600",
  };
  return <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${map[r ?? ""] ?? "bg-slate-100 text-slate-500"}`}>{r ?? "—"}</span>;
}

// ── Status badge (bilingual) ──────────────────────────────────────────────────
function StatusBadge({ status, size = "sm" }: { status: ModuleStatus; size?: "sm" | "lg" }) {
  const cfg = {
    PASS:    { cls: "bg-emerald-100 text-emerald-800 border-emerald-300", label: "通过 / PASS",    icon: "✓" },
    WARNING: { cls: "bg-amber-100  text-amber-800  border-amber-300",  label: "警告 / WARNING", icon: "⚠" },
    FAIL:    { cls: "bg-red-100    text-red-800    border-red-300",    label: "失败 / FAIL",    icon: "✗" },
  }[status];
  const sz = size === "lg" ? "px-3 py-1 text-sm font-bold" : "px-2 py-0.5 text-xs font-bold";
  return (
    <span className={`inline-flex items-center gap-1 rounded border font-mono ${cfg.cls} ${sz}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

// ── Module card (bilingual expand) ────────────────────────────────────────────
function ModuleCard({ mod }: { mod: VerifyModule }) {
  const [open, setOpen] = useState(false);
  const borderCls = { PASS: "border-emerald-200 bg-emerald-50/30", WARNING: "border-amber-200 bg-amber-50/30", FAIL: "border-red-200 bg-red-50/40" }[mod.status];
  const displayName = MODULE_LABELS[mod.key] ?? mod.name;

  return (
    <div className={`rounded-xl border ${borderCls} p-4 cursor-pointer select-none`} onClick={() => setOpen(o => !o)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <StatusBadge status={mod.status} />
          <span className="font-semibold text-slate-800 text-sm">{displayName}</span>
        </div>
        <span className="text-slate-400 text-xs shrink-0">{open ? "▲" : "▼"}</span>
      </div>
      {!open && (
        <p className="mt-1 text-xs text-slate-500 pl-1 truncate">{mod.message}</p>
      )}
      {open && (
        <div className="mt-3 space-y-2 border-t border-slate-200/60 pt-3">
          <BiRow label="当前值 / Current"  value={String(mod.current ?? "—")} mono />
          <BiRow label="期望值 / Expected" value={mod.expected} />
          <BiRow label="状态说明 / Message" value={mod.message} />
          {mod.fixHint && (
            <div className="bg-amber-50 border border-amber-200 rounded px-3 py-2 mt-1">
              <span className="text-xs font-bold text-amber-700">修复建议 / Fix Hint：</span>
              <span className="text-xs text-amber-700 font-mono ml-1">{mod.fixHint}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BiRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-3 text-xs">
      <span className="w-40 shrink-0 text-slate-400 font-medium">{label}</span>
      <span className={`text-slate-700 break-all ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────
function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-4">
      <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 border-b border-slate-100 pb-2">{title}</h2>
      {children}
    </section>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminVerifyPage() {
  const [status, setStatus]         = useState<StatusData | null>(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied]         = useState(false);
  const [health, setHealth]         = useState<{ status: string; criticalCount: number; warningCount: number; passCount: number; adjCoveragePct: number; auditAt: string; latestPriceDate: string } | null>(null);



  // ── Loaders ────────────────────────────────────────────────────────────────
  const loadStatus = useCallback(async () => {
    setRefreshing(true);
    try {
      const [d, h] = await Promise.all([
        fetch("/api/admin/verify?module=status").then(r => r.json()),
        fetch("/api/health/status").then(r => r.json()).catch(() => null),
      ]);
      setStatus(d);
      if (h) setHealth(h);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);



  useEffect(() => {
    loadStatus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Copy acceptance report ─────────────────────────────────────────────────
  const copyReport = useCallback(() => {
    if (!status) return;
    const get = (key: string) => status.modules.find(m => m.key === key);
    const line = (m: VerifyModule | undefined) => m ? `${m.status.padEnd(7)} | ${m.current}` : "—";
    const txt = [
      "PRODUCTION ACCEPTANCE REPORT",
      `检查时间 Checked At: ${new Date(status.checkedAt).toLocaleString("zh-CN", { timeZone: "Asia/Tokyo" })} JST`,
      "─".repeat(56),
      `PM2            : (ssh: pm2 list)`,
      `BUILD          : (local: npm run build)`,
      `HEALTH         : ${line(get("health"))}`,
      `每日推荐 DAILY REC : ${line(get("daily_rec"))}`,
      `AI评分 AI SCORES  : ${line(get("ai_scores"))}`,
      `回测 BACKTEST     : ${line(get("backtest"))}`,
      `页面 ADMIN PAGE   : 200 OK · /admin/verify`,
      "─".repeat(56),
      `阻断问题 BLOCKING ISSUES (${status.blockingIssues.length}):`,
      ...(status.blockingIssues.length ? status.blockingIssues.map(i => `  ✗ ${i}`) : ["  (无 / none)"]),
      "─".repeat(56),
      `生产部署 PRODUCTION DEPLOY: ${status.ready ? "YES ✓" : "NO ✗"}`,
    ].join("\n");
    navigator.clipboard.writeText(txt).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }, [status]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-400 text-sm animate-pulse">正在检查 / Running checks…</div>
      </div>
    );
  }

  const ready    = status?.ready ?? false;
  const blocking = status?.blockingIssues ?? [];
  const warnings = status?.warnings ?? [];

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">

      {/* ── Hero — Verification Center ─────────────────────────────────────── */}
      {(() => {
        const hCrit = health?.criticalCount ?? status?.meta?.healthCritical ?? blocking.length;
        const hWarn = health?.warningCount ?? warnings.length;
        const hScore = Math.max(0, Math.min(100, 100 - hCrit * 25 - hWarn * 3));
        const scoreColor = hCrit > 0 ? "#FF3B30" : hScore >= 90 ? "#34C759" : "#FF9F0A";
        const coverage = health?.adjCoveragePct ?? (status?.meta?.priceSyncOk ? 100 : null);
        const lastCheck = status ? new Date(status.checkedAt).toLocaleString("zh-CN", { timeZone: "Asia/Tokyo" }).slice(5, 16) : "—";
        const cells = [
          { label: "Health Score", value: `${hScore}`, unit: health?.status === "WARNING" ? "注意" : hCrit > 0 ? "异常" : "Healthy", color: scoreColor },
          { label: "Warnings", value: `${hWarn}`, unit: "Non Blocking", color: hWarn > 0 ? "#FF9F0A" : "#34C759" },
          { label: "Critical", value: `${hCrit}`, unit: hCrit === 0 ? "PASS" : "Blocking", color: hCrit > 0 ? "#FF3B30" : "#34C759" },
          { label: "Stocks", value: (status?.meta?.stockCount ?? 0).toLocaleString(), unit: "上市", color: "#1D1D1F" },
          { label: "Coverage", value: coverage != null ? `${coverage}%` : "—", unit: "行情覆盖", color: coverage != null && coverage >= 95 ? "#34C759" : "#FF9F0A" },
          { label: "Last Check", value: lastCheck.split(" ")[1] ?? lastCheck, unit: `${lastCheck.split(" ")[0] ?? ""} JST`, color: "#1D1D1F" },
        ];
        return (
          <div className="dash-font mb-6">
            <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center justify-center w-11 h-11 rounded-2xl text-[20px]" style={{ background: ready ? "#34C75914" : "#FF3B3014", color: ready ? "#34C759" : "#FF3B30" }}>{ready ? "✓" : "✗"}</span>
                <div>
                  <div className="text-[24px] font-semibold tracking-[-0.02em]" style={{ color: "#1D1D1F" }}>{ready ? "Production Ready" : "Production Not Ready"}</div>
                  <div className="text-[13px]" style={{ color: "#86868B" }}>Verification Center · System Health · Production Readiness</div>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <button onClick={loadStatus} disabled={refreshing}
                  className="inline-flex items-center gap-1.5 h-10 px-5 rounded-full text-[13px] font-semibold text-white disabled:opacity-50" style={{ background: "#007AFF" }}>
                  <span style={{ display: "inline-block", animation: refreshing ? "dash-spin .8s linear infinite" : "none" }}>↻</span>{refreshing ? "检查中…" : "刷新全部检查"}
                </button>
                <button onClick={copyReport}
                  className="inline-flex items-center gap-1.5 h-10 px-5 rounded-full text-[13px] font-semibold dash-card dash-int" style={{ color: "#1D1D1F" }}>
                  {copied ? "✓ 已复制" : "⎘ 复制报告"}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {cells.map((c) => (
                <div key={c.label} className="dash-card p-5">
                  <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "#86868B" }}>{c.label}</div>
                  <div className="text-[30px] font-semibold tabular-nums tracking-[-0.02em] leading-none mt-2" style={{ color: c.color }}>{c.value}</div>
                  <div className="text-[12px] font-medium mt-1.5" style={{ color: "#6E6E73" }}>{c.unit}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── Warnings / Blocking — Apple Alert Cards ────────────────────────── */}
      {(blocking.length > 0 || warnings.length > 0) ? (
        <div className="dash-font mb-6">
          <div className="text-[11px] font-semibold uppercase tracking-[0.1em] mb-2.5" style={{ color: "#86868B" }}>告警 · Alerts ({blocking.length + warnings.length})</div>
          <div className="space-y-2">
            {blocking.map((w, i) => (
              <div key={`b${i}`} className="dash-card flex items-start gap-3 p-3.5" style={{ borderColor: "#FF3B3033" }}>
                <span className="text-[15px]" style={{ color: "#FF3B30" }}>✕</span>
                <span className="text-[13px] font-medium flex-1" style={{ color: "#1D1D1F" }}>{w}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: "#FF3B30", background: "#FF3B3014" }}>BLOCKING</span>
              </div>
            ))}
            {warnings.map((w, i) => (
              <div key={`w${i}`} className="dash-card flex items-start gap-3 p-3.5">
                <span className="text-[15px]" style={{ color: "#FF9F0A" }}>⚠</span>
                <span className="text-[13px] font-medium flex-1" style={{ color: "#1D1D1F" }}>{w}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: "#FF9F0A", background: "#FF9F0A14" }}>WARNING · Non-Blocking</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="dash-font mb-6">
          <div className="dash-card flex items-center gap-3 p-4" style={{ borderColor: "#34C75933", background: "#34C7590d" }}>
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-[15px]" style={{ background: "#34C75922", color: "#34C759" }}>✓</span>
            <span className="text-[13px] font-semibold" style={{ color: "#34C759" }}>No Blocking Issues · System Ready</span>
          </div>
        </div>
      )}

      {/* ── Production Status — module timeline ────────────────────────────── */}
      <div className="dash-font mb-6">
        <div className="text-[11px] font-semibold uppercase tracking-[0.1em] mb-2.5" style={{ color: "#86868B" }}>生产状态 · Production Status</div>
        <div className="dash-card p-2">
          {(status?.modules ?? []).map((m, i) => {
            const col = m.status === "PASS" ? "#34C759" : m.status === "WARNING" ? "#FF9F0A" : "#FF3B30";
            return (
              <div key={m.key} className="flex items-center gap-3 px-3.5 py-3" style={i > 0 ? { borderTop: "1px solid #ECECEC" } : undefined}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: col, boxShadow: `0 0 0 3px ${col}22` }} />
                <span className="text-[13px] font-semibold w-40 shrink-0" style={{ color: "#1D1D1F" }}>{m.name}</span>
                <span className="text-[12px] flex-1 truncate" style={{ color: "#86868B" }}>{String(m.current ?? m.message ?? "")}</span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ color: col, background: `${col}14` }}>{m.status}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── AI 安全规范 / Decision Engine Safety Rules ──────────────────── */}
      <div className="mb-4">
        <AISafetyPanel />
      </div>

      {/* ── 回测结果 → 重定向 ────────────────────────────────────────────── */}
      <Section id="backtest" title="回测验证">
        <p className="text-sm text-slate-500 mb-4">回测数据请前往「回测验证」页面查看。</p>
        <Link
          href="/backtest"
          className="inline-block px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
        >
          → 查看回测验证
        </Link>
      </Section>

      {/* ── 部署历史 → 重定向 ────────────────────────────────────────────── */}
      <Section id="deployments" title="版本部署记录">
        <p className="text-sm text-slate-500 mb-4">部署历史请前往「版本中心」页面查看。</p>
        <Link
          href="/admin/versions"
          className="inline-block px-4 py-2 bg-slate-600 text-white text-sm font-semibold rounded-lg hover:bg-slate-700 transition-colors"
        >
          → 查看版本部署记录
        </Link>
      </Section>

      <p className="text-center text-xs text-slate-300 pb-4">
        内部工具 · 只读 / Internal tool · Read-only · /admin/verify · v8.9.5
      </p>
    </div>
  );
}
