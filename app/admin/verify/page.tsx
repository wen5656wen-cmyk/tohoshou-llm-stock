"use client";

import { useEffect, useState, useCallback } from "react";

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

type DailyRecRow = {
  date: string; symbol: string; name: string; nameZh: string | null;
  gptRank: number; finalScore: number; adaptiveScore: number; gptScore: number;
  gptRating: string | null; buyPrice: number | null; recommendation: string | null;
  summaryZh: string | null; entryPrice: number | null;
  return7d: number | null; return30d: number | null; return90d: number | null;
};

type HistoryRow = {
  date: string; gptRank: number; finalScore: number; adaptiveScore: number;
  gptScore: number; gptRating: string | null; buyPrice: number | null;
  recommendation: string | null; return7d: number | null; return30d: number | null; return90d: number | null;
};

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

  const [recDate, setRecDate]       = useState("");
  const [recSymbol, setRecSymbol]   = useState("");
  const [recRows, setRecRows]       = useState<DailyRecRow[]>([]);
  const [availDates, setAvailDates] = useState<{ date: string; count: number }[]>([]);
  const [recLoading, setRecLoading] = useState(false);

  const [histSymbol, setHistSymbol] = useState("");
  const [histData, setHistData]     = useState<{ symbol: string; name: string; nameZh: string | null; rows: HistoryRow[] } | null>(null);
  const [histLoading, setHistLoading] = useState(false);

  const [btPicks, setBtPicks]       = useState<BacktestPick[]>([]);
  const [btResults, setBtResults]   = useState<BacktestResult[]>([]);
  const [btLoading, setBtLoading]   = useState(false);

  const [deploys, setDeploys]       = useState<DeploymentRow[]>([]);
  const [deplTotal, setDeplTotal]   = useState(0);
  const [deplLoading, setDeplLoading] = useState(false);
  const [deplExpanded, setDeplExpanded] = useState<number | null>(null);

  // ── Loaders ────────────────────────────────────────────────────────────────
  const loadStatus = useCallback(async () => {
    setRefreshing(true);
    try {
      const d = await fetch("/api/admin/verify?module=status").then(r => r.json());
      setStatus(d);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadDailyRec = useCallback((date: string, sym: string) => {
    setRecLoading(true);
    const p = new URLSearchParams({ module: "dailyrec", limit: "100" });
    if (date) p.set("date", date);
    if (sym)  p.set("symbol", sym);
    fetch(`/api/admin/verify?${p}`)
      .then(r => r.json())
      .then(d => { setRecRows(d.rows ?? []); setAvailDates(d.availDates ?? []); })
      .finally(() => setRecLoading(false));
  }, []);

  const loadHistory = useCallback((sym: string) => {
    if (!sym) return;
    setHistLoading(true);
    fetch(`/api/admin/verify?module=history&symbol=${encodeURIComponent(sym)}`)
      .then(r => r.json())
      .then(d => setHistData(d))
      .finally(() => setHistLoading(false));
  }, []);

  const loadBacktest = useCallback(() => {
    setBtLoading(true);
    fetch("/api/admin/verify?module=backtest&limit=30")
      .then(r => r.json())
      .then(d => { setBtPicks(d.picks ?? []); setBtResults(d.results ?? []); })
      .finally(() => setBtLoading(false));
  }, []);

  const loadDeploys = useCallback(() => {
    setDeplLoading(true);
    fetch("/api/admin/deployments?limit=20")
      .then(r => r.json())
      .then(d => { setDeploys(d.rows ?? []); setDeplTotal(d.total ?? 0); })
      .finally(() => setDeplLoading(false));
  }, []);

  useEffect(() => {
    loadStatus();
    loadDailyRec("", "");
    loadBacktest();
    loadDeploys();
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

      {/* ── 顶部总状态 Banner ──────────────────────────────────────────────── */}
      <div className={`rounded-2xl border-2 p-5 mb-6 ${ready ? "bg-emerald-50 border-emerald-300" : "bg-red-50 border-red-300"}`}>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="min-w-0">
            {/* 主状态 */}
            <div className={`text-xl font-black mb-0.5 ${ready ? "text-emerald-700" : "text-red-700"}`}>
              {ready ? "✓ 生产环境就绪" : "✗ 生产环境未就绪"}
            </div>
            <div className={`text-sm font-semibold mb-3 ${ready ? "text-emerald-600" : "text-red-600"}`}>
              {ready ? "Production Ready" : "Not Production Ready"}
            </div>

            {/* 指标行 */}
            <div className="flex flex-wrap gap-4 text-sm mb-2">
              <div>
                <span className="text-slate-500 text-xs">允许推荐 / Allow Recommendation</span>
                <div className={`font-bold ${status?.meta.healthAllowRec ? "text-emerald-700" : "text-slate-400"}`}>
                  {status?.meta.healthAllowRec === true ? "YES ✓" : status?.meta.healthAllowRec === false ? "NO ✗" : "—"}
                </div>
              </div>
              <div>
                <span className="text-slate-500 text-xs">阻断问题 / Blocking Issues</span>
                <div className={`font-bold ${blocking.length === 0 ? "text-emerald-700" : "text-red-700"}`}>
                  {blocking.length}
                </div>
              </div>
              <div>
                <span className="text-slate-500 text-xs">警告 / Warnings</span>
                <div className={`font-bold ${warnings.length > 0 ? "text-amber-600" : "text-emerald-700"}`}>
                  {warnings.length}
                </div>
              </div>
              <div>
                <span className="text-slate-500 text-xs">股票总数 / Stocks</span>
                <div className="font-bold text-slate-700">{status?.meta.stockCount?.toLocaleString() ?? "—"}</div>
              </div>
            </div>

            {/* 阻断问题列表 */}
            {blocking.length > 0 && (
              <div className="mt-2 space-y-1">
                <div className="text-xs font-bold text-red-600 uppercase">阻断问题 / Blocking Issues</div>
                {blocking.map((issue, i) => (
                  <div key={i} className="text-xs text-red-700 font-mono bg-red-100/60 rounded px-2 py-1">✗ {issue}</div>
                ))}
              </div>
            )}

            {/* 警告列表 */}
            {warnings.length > 0 && (
              <div className="mt-2 space-y-0.5">
                <div className="text-xs font-bold text-amber-600 uppercase">警告 / Warnings</div>
                {warnings.map((w, i) => (
                  <div key={i} className="text-xs text-amber-700 font-mono">⚠ {w}</div>
                ))}
              </div>
            )}
          </div>

          {/* 操作按钮 */}
          <div className="flex flex-col gap-2 shrink-0 min-w-[160px]">
            <button
              onClick={loadStatus}
              disabled={refreshing}
              className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg font-semibold transition"
            >
              {refreshing ? "检查中…" : "⟳ 刷新全部检查"}
            </button>
            <div className="text-xs text-slate-400 text-center -mt-1">Refresh All Checks</div>
            <button
              onClick={copyReport}
              className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm px-4 py-2 rounded-lg font-semibold transition"
            >
              {copied ? "✓ 已复制!" : "⎘ 复制验收报告"}
            </button>
            <div className="text-xs text-slate-400 text-center -mt-1">Copy Acceptance Report</div>
            <div className="text-xs text-slate-400 text-center mt-1">
              最后检查 / Last checked:<br />
              {status ? new Date(status.checkedAt).toLocaleString("zh-CN", { timeZone: "Asia/Tokyo" }).slice(0, 16) + " JST" : "—"}
            </div>
          </div>
        </div>
      </div>

      {/* ── Nav ────────────────────────────────────────────────────────────── */}
      <div className="flex gap-3 text-xs text-slate-400 mb-4 flex-wrap">
        <a href="#modules"     className="hover:text-slate-700">模块检查 / Modules</a>
        <span>·</span>
        <a href="#dailyrec"    className="hover:text-slate-700">每日推荐 / Daily Rec</a>
        <span>·</span>
        <a href="#history"     className="hover:text-slate-700">历史快照 / History</a>
        <span>·</span>
        <a href="#backtest"    className="hover:text-slate-700">回测结果 / Backtest</a>
        <span>·</span>
        <a href="#deployments" className="hover:text-slate-700 font-medium text-blue-400">部署历史 / Deployments</a>
      </div>

      {/* ── 模块检查 / Module Checks ─────────────────────────────────────── */}
      <Section id="modules" title="模块检查 / Module Checks — 点击展开 / click to expand">
        <div className="space-y-2">
          {(status?.modules ?? []).map(mod => (
            <ModuleCard key={mod.key} mod={mod} />
          ))}
        </div>
      </Section>

      {/* ── 每日推荐快照 / DailyRecommendation Snapshot ─────────────────── */}
      <Section id="dailyrec" title="每日推荐快照 / DailyRecommendation Snapshot">
        <div className="flex gap-2 mb-3 flex-wrap items-center">
          <select
            value={recDate}
            onChange={e => { setRecDate(e.target.value); loadDailyRec(e.target.value, recSymbol); }}
            className="border border-slate-200 rounded px-2 py-1 text-xs bg-white"
          >
            <option value="">全部日期 / All dates</option>
            {availDates.map(d => (
              <option key={d.date} value={d.date}>{d.date}（{d.count} 条）</option>
            ))}
          </select>
          <input
            type="text" placeholder="代码 / Symbol…" value={recSymbol}
            onChange={e => setRecSymbol(e.target.value)}
            onKeyDown={e => e.key === "Enter" && loadDailyRec(recDate, recSymbol)}
            className="border border-slate-200 rounded px-2 py-1 text-xs w-28 font-mono"
          />
          <button onClick={() => loadDailyRec(recDate, recSymbol)}
            className="bg-slate-700 text-white text-xs px-3 py-1 rounded">筛选 / Filter</button>
          <span className="text-xs text-slate-400">{recRows.length} 条</span>
        </div>
        {recLoading ? <p className="text-xs text-slate-400 animate-pulse">加载中 / Loading…</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  {["日期/Date","代码/Sym","名称/Name","排名/Rank","综合分","规则分","GPT分","GPT评级","推荐","价格/Price","7日%","30日%"].map(h => (
                    <th key={h} className="text-left px-2 py-1.5 text-slate-500 font-semibold border-b border-slate-100 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recRows.length === 0 && (
                  <tr><td colSpan={12} className="text-center py-6 text-slate-400">暂无数据 / No data</td></tr>
                )}
                {recRows.map((r, i) => (
                  <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-2 py-1 font-mono text-slate-400">{r.date}</td>
                    <td className="px-2 py-1 font-mono font-bold text-indigo-600">{r.symbol}</td>
                    <td className="px-2 py-1 max-w-[90px] truncate text-slate-600" title={r.nameZh ?? r.name}>{r.nameZh ?? r.name}</td>
                    <td className="px-2 py-1 font-semibold text-slate-700">#{r.gptRank}</td>
                    <td className="px-2 py-1 font-mono">{fmt(r.finalScore)}</td>
                    <td className="px-2 py-1 font-mono text-slate-500">{fmt(r.adaptiveScore)}</td>
                    <td className="px-2 py-1 font-mono text-slate-500">{fmt(r.gptScore)}</td>
                    <td className="px-2 py-1">{ratingBadge(r.gptRating)}</td>
                    <td className="px-2 py-1">{ratingBadge(r.recommendation)}</td>
                    <td className="px-2 py-1 font-mono">{fmtJpy(r.buyPrice)}</td>
                    <td className={`px-2 py-1 font-mono ${retColor(r.return7d)}`}>{fmtPct(r.return7d)}</td>
                    <td className={`px-2 py-1 font-mono ${retColor(r.return30d)}`}>{fmtPct(r.return30d)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ── 历史快照 / Historical Snapshot ──────────────────────────────── */}
      <Section id="history" title="历史快照 / Historical Snapshot — 按代码查询">
        <div className="flex gap-2 mb-3">
          <input
            type="text" placeholder="如 / e.g. 7203.T" value={histSymbol}
            onChange={e => setHistSymbol(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && loadHistory(histSymbol)}
            className="border border-slate-200 rounded px-2 py-1 text-xs w-32 font-mono"
          />
          <button onClick={() => loadHistory(histSymbol)}
            className="bg-slate-700 text-white text-xs px-3 py-1 rounded">查询 / Search</button>
        </div>
        {histLoading && <p className="text-xs text-slate-400 animate-pulse">加载中 / Loading…</p>}
        {histData && !histLoading && (
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">
              {histData.symbol} · {histData.nameZh ?? histData.name}
              <span className="ml-2 text-xs text-slate-400">{histData.rows.length} 日</span>
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    {["日期","排名","综合分","规则分","GPT分","GPT评级","推荐","参考价","7日%","30日%","90日%"].map(h => (
                      <th key={h} className="text-left px-2 py-1 text-slate-500 font-semibold border-b border-slate-100">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {histData.rows.map((r, i) => (
                    <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-2 py-1 font-mono text-slate-400">{r.date}</td>
                      <td className="px-2 py-1 font-semibold text-slate-700">#{r.gptRank}</td>
                      <td className="px-2 py-1 font-mono">{fmt(r.finalScore)}</td>
                      <td className="px-2 py-1 font-mono text-slate-500">{fmt(r.adaptiveScore)}</td>
                      <td className="px-2 py-1 font-mono text-slate-500">{fmt(r.gptScore)}</td>
                      <td className="px-2 py-1">{ratingBadge(r.gptRating)}</td>
                      <td className="px-2 py-1">{ratingBadge(r.recommendation)}</td>
                      <td className="px-2 py-1 font-mono">{fmtJpy(r.buyPrice)}</td>
                      <td className={`px-2 py-1 font-mono ${retColor(r.return7d)}`}>{fmtPct(r.return7d)}</td>
                      <td className={`px-2 py-1 font-mono ${retColor(r.return30d)}`}>{fmtPct(r.return30d)}</td>
                      <td className={`px-2 py-1 font-mono ${retColor(r.return90d)}`}>{fmtPct(r.return90d)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Section>

      {/* ── 回测结果 / Backtest ───────────────────────────────────────────── */}
      <Section id="backtest" title="回测结果 / Backtest Results">
        {btLoading ? <p className="text-xs text-slate-400 animate-pulse">加载中 / Loading…</p> : (
          <>
            {btResults.length > 0 && (
              <div className="mb-5">
                <p className="text-xs font-semibold text-slate-500 mb-2">组合绩效汇总 / Portfolio Summary</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50">
                        {["日期","规模","周期","胜率","均收益","中位数","样本","最佳%","最差%"].map(h => (
                          <th key={h} className="text-left px-2 py-1 text-slate-500 font-semibold border-b border-slate-100">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {btResults.map((r, i) => (
                        <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="px-2 py-1 font-mono text-slate-400">{r.date}</td>
                          <td className="px-2 py-1 font-semibold">{r.portfolioSize}</td>
                          <td className="px-2 py-1 text-slate-500">{r.horizon}</td>
                          <td className={`px-2 py-1 font-mono font-bold ${retColor(r.winRate)}`}>{fmt(r.winRate)}%</td>
                          <td className={`px-2 py-1 font-mono ${retColor(r.avgReturn)}`}>{fmtPct(r.avgReturn)}</td>
                          <td className={`px-2 py-1 font-mono ${retColor(r.medianReturn)}`}>{fmtPct(r.medianReturn)}</td>
                          <td className="px-2 py-1 text-slate-500">{r.filled}/{r.totalRecommendations}</td>
                          <td className={`px-2 py-1 font-mono ${retColor(r.bestReturn)}`}>{fmtPct(r.bestReturn)}</td>
                          <td className={`px-2 py-1 font-mono ${retColor(r.worstReturn)}`}>{fmtPct(r.worstReturn)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <p className="text-xs font-semibold text-slate-500 mb-2">
              逐笔明细 / Individual Picks（含入场价 / with entry price）：{btPicks.length} 条
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    {["日期","代码","排名","评级","推荐价","入场价","7日%","30日%","胜负"].map(h => (
                      <th key={h} className="text-left px-2 py-1 text-slate-500 font-semibold border-b border-slate-100">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {btPicks.length === 0 && (
                    <tr><td colSpan={9} className="text-center py-4 text-slate-400">暂无入场价记录 / No picks with entry price yet</td></tr>
                  )}
                  {btPicks.map((p, i) => {
                    const win = p.return30d != null ? p.return30d > 0 : p.return7d != null ? p.return7d > 0 : null;
                    return (
                      <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="px-2 py-1 font-mono text-slate-400">{p.date}</td>
                        <td className="px-2 py-1 font-mono font-bold text-indigo-600">{p.symbol}</td>
                        <td className="px-2 py-1 text-slate-700">#{p.gptRank}</td>
                        <td className="px-2 py-1">{ratingBadge(p.gptRating)}</td>
                        <td className="px-2 py-1 font-mono">{fmtJpy(p.buyPrice)}</td>
                        <td className="px-2 py-1 font-mono font-semibold">{fmtJpy(p.entryPrice)}</td>
                        <td className={`px-2 py-1 font-mono ${retColor(p.return7d)}`}>{fmtPct(p.return7d)}</td>
                        <td className={`px-2 py-1 font-mono ${retColor(p.return30d)}`}>{fmtPct(p.return30d)}</td>
                        <td className="px-2 py-1 font-bold">
                          {win === true ? <span className="text-emerald-600">盈 WIN</span>
                           : win === false ? <span className="text-red-500">亏 LOSS</span>
                           : <span className="text-slate-300">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Section>

      {/* ── 部署历史 / Deployment History ───────────────────────────────────── */}
      <Section id="deployments" title={`部署历史 / Deployment History · デプロイ履歴 — 共 ${deplTotal} 条`}>
        {deplLoading ? (
          <p className="text-xs text-slate-400 animate-pulse">加载中 / Loading…</p>
        ) : deploys.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm">
            暂无部署记录 / No deployment records yet<br />
            <span className="text-xs font-mono mt-1 block">npm run record:deployment -- --commit=xxx ...</span>
          </div>
        ) : (
          <div className="space-y-2">
            {deploys.map((d, i) => {
              const isLatest  = i === 0;
              const expanded  = deplExpanded === d.id;
              const allPass   = [d.buildStatus, d.apiStatus, d.pageStatus, d.pm2Status].every(s => s === "PASS");
              const hasWarning = d.healthStatus === "WARNING";
              const hasFail   = [d.buildStatus, d.healthStatus, d.apiStatus, d.pageStatus, d.pm2Status].some(s => s === "FAIL");
              const borderCls = d.productionReady
                ? "border-emerald-200 bg-emerald-50/20"
                : hasFail
                  ? "border-red-200 bg-red-50/20"
                  : "border-slate-200";

              return (
                <div key={d.id} className={`rounded-xl border ${borderCls} overflow-hidden`}>
                  {/* Header row */}
                  <div
                    className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50/50"
                    onClick={() => setDeplExpanded(expanded ? null : d.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {isLatest && (
                        <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 uppercase tracking-wide">Latest</span>
                      )}
                      <span className={`shrink-0 w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold ${d.productionReady ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                        {d.productionReady ? "✓" : "✗"}
                      </span>
                      <div className="min-w-0">
                        <div className="text-[12px] font-semibold text-slate-800 truncate leading-tight">{d.summary}</div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">{d.deployedAtJst} · {d.commitHash} · {d.operator}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {([
                        { key: "buildStatus",  label: "Build"  },
                        { key: "healthStatus", label: "Health" },
                        { key: "apiStatus",    label: "API"    },
                        { key: "pageStatus",   label: "Page"   },
                        { key: "pm2Status",    label: "PM2"    },
                      ] as const).map(({ key, label }) => {
                        const v = d[key];
                        const cls = v === "PASS" ? "bg-emerald-100 text-emerald-700"
                                  : v === "WARNING" ? "bg-amber-100 text-amber-700"
                                  : v === "FAIL" ? "bg-red-100 text-red-600"
                                  : "bg-slate-100 text-slate-400";
                        return (
                          <span key={key} className={`text-[9px] font-bold px-1 py-0.5 rounded font-mono ${cls}`}>{label}</span>
                        );
                      })}
                      <span className="text-slate-300 text-xs ml-1">{expanded ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {expanded && (
                    <div className="px-4 pb-4 pt-1 border-t border-slate-100 space-y-3">
                      {/* Full acceptance report */}
                      <div className="bg-slate-800 text-green-400 font-mono text-[10px] rounded-lg p-3 leading-relaxed whitespace-pre-wrap">
{`DEPLOYMENT ACCEPTANCE REPORT
${"─".repeat(48)}
Commit:     ${d.commitHash}
Summary:    ${d.summary}
DeployedAt: ${d.deployedAtJst}
Operator:   ${d.operator}
${"─".repeat(48)}
Build:      ${d.buildStatus}
Health:     ${d.healthStatus}
API:        ${d.apiStatus}
Page:       ${d.pageStatus}
Database:   ${d.databaseStatus}
PM2:        ${d.pm2Status}
${"─".repeat(48)}
Modified Files (${(d.modifiedFiles ?? []).length}):
${(d.modifiedFiles ?? []).map((f: string) => `  · ${f}`).join("\n") || "  (none)"}
${"─".repeat(48)}
Warnings (${(d.warnings ?? []).length}):
${(d.warnings ?? []).map((w: string) => `  ⚠ ${w}`).join("\n") || "  (none)"}
Blocking Issues (${(d.blockingIssues ?? []).length}):
${(d.blockingIssues ?? []).map((b: string) => `  ✗ ${b}`).join("\n") || "  (none)"}
${"─".repeat(48)}
Result: Production Ready = ${d.productionReady ? "YES ✓" : "NO ✗"}`}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-3 text-[10px] text-slate-300 text-right">
          每次部署完成后执行 / After each deploy:<br />
          <code className="font-mono">npm run record:deployment -- --commit=xxx --summary="..." --productionReady=true ...</code>
        </div>
      </Section>

      <p className="text-center text-xs text-slate-300 pb-4">
        内部工具 · 只读 / Internal tool · Read-only · /admin/verify · v8.9.5
      </p>
    </div>
  );
}
