"use client";

import { useEffect, useState, useCallback, useRef } from "react";

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

type BacktestPick = {
  date: string; symbol: string; name: string; gptRank: number; gptRating: string | null;
  buyPrice: number | null; entryPrice: number | null; entryDate: string | null;
  return7d: number | null; return30d: number | null; return90d: number | null;
  price7d: number | null; price30d: number | null;
};
type BacktestResult = {
  date: string; horizon: string; portfolioSize: string; winRate: number | null;
  avgReturn: number | null; medianReturn: number | null; filled: number; totalRecommendations: number;
  bestReturn: number | null; worstReturn: number | null; bestSymbol: string | null; worstSymbol: string | null;
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
    BUY: "bg-blue-100 text-blue-700",
    HOLD: "bg-slate-100 text-slate-600",
    WATCH: "bg-amber-100 text-amber-700",
    AVOID: "bg-red-100 text-red-600",
  };
  const cls = map[r ?? ""] ?? "bg-slate-100 text-slate-500";
  return <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${cls}`}>{r ?? "—"}</span>;
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status, size = "sm" }: { status: ModuleStatus; size?: "sm" | "lg" }) {
  const cls = {
    PASS:    "bg-emerald-100 text-emerald-800 border-emerald-200",
    WARNING: "bg-amber-100 text-amber-800 border-amber-200",
    FAIL:    "bg-red-100 text-red-800 border-red-200",
  }[status];
  const icon = { PASS: "✓", WARNING: "⚠", FAIL: "✗" }[status];
  const sz = size === "lg" ? "px-3 py-1 text-sm font-bold" : "px-2 py-0.5 text-xs font-bold";
  return (
    <span className={`inline-flex items-center gap-1 rounded border ${cls} ${sz} font-mono`}>
      {icon} {status}
    </span>
  );
}

// ── Module card ───────────────────────────────────────────────────────────────
function ModuleCard({ mod }: { mod: VerifyModule }) {
  const [open, setOpen] = useState(false);
  const borderCls = {
    PASS:    "border-emerald-200 bg-emerald-50/30",
    WARNING: "border-amber-200 bg-amber-50/30",
    FAIL:    "border-red-200 bg-red-50/30",
  }[mod.status];

  return (
    <div className={`rounded-xl border ${borderCls} p-4 cursor-pointer select-none`}
         onClick={() => setOpen(o => !o)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <StatusBadge status={mod.status} />
          <span className="font-semibold text-slate-800 text-sm">{mod.name}</span>
          <span className="text-xs text-slate-500 truncate hidden sm:block">{mod.message}</span>
        </div>
        <span className="text-slate-400 text-xs shrink-0">{open ? "▲" : "▼"}</span>
      </div>

      {open && (
        <div className="mt-3 space-y-1.5 border-t border-slate-200/60 pt-3">
          <Row label="Current"  value={String(mod.current ?? "—")} mono />
          <Row label="Expected" value={mod.expected} />
          <Row label="Status"   value={mod.message} />
          {mod.fixHint && (
            <div className="bg-amber-50 border border-amber-200 rounded px-3 py-2 mt-2">
              <span className="text-xs font-semibold text-amber-700">Fix: </span>
              <span className="text-xs text-amber-700 font-mono">{mod.fixHint}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-3 text-xs">
      <span className="w-24 shrink-0 text-slate-400">{label}</span>
      <span className={`text-slate-700 break-all ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-4">
      <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 border-b border-slate-100 pb-2">
        {title}
      </h2>
      {children}
    </section>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminVerifyPage() {
  const [status, setStatus]       = useState<StatusData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied]       = useState(false);

  // Detail tabs
  const [recDate, setRecDate]     = useState("");
  const [recSymbol, setRecSymbol] = useState("");
  const [recRows, setRecRows]     = useState<DailyRecRow[]>([]);
  const [availDates, setAvailDates] = useState<{ date: string; count: number }[]>([]);
  const [recLoading, setRecLoading] = useState(false);

  const [histSymbol, setHistSymbol] = useState("");
  const [histData, setHistData]     = useState<{ symbol: string; name: string; nameZh: string | null; rows: HistoryRow[] } | null>(null);
  const [histLoading, setHistLoading] = useState(false);

  const [btPicks, setBtPicks]     = useState<BacktestPick[]>([]);
  const [btResults, setBtResults] = useState<BacktestResult[]>([]);
  const [btLoading, setBtLoading] = useState(false);

  // ── Load status ────────────────────────────────────────────────────────────
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

  useEffect(() => {
    loadStatus();
    loadDailyRec("", "");
    loadBacktest();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Loaders ────────────────────────────────────────────────────────────────
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

  // ── Copy report ────────────────────────────────────────────────────────────
  const copyReport = useCallback(() => {
    if (!status) return;
    const mods = status.modules;
    const get = (key: string) => mods.find(m => m.key === key);
    const fmt2 = (m: VerifyModule | undefined) =>
      m ? `${m.status.padEnd(7)} | ${m.current}` : "—";

    const rec = get("daily_rec");
    const ai  = get("ai_scores");
    const bt  = get("backtest");
    const hlt = get("health");

    const txt = [
      "PRODUCTION ACCEPTANCE REPORT",
      `Checked At : ${new Date(status.checkedAt).toLocaleString("zh-CN", { timeZone: "Asia/Tokyo" })} JST`,
      "─".repeat(55),
      `PM2        : (check server: pm2 list)`,
      `BUILD      : (local: npm run build)`,
      `HEALTH     : ${fmt2(hlt)}`,
      `DAILY REC  : ${fmt2(rec)}`,
      `AI SCORES  : ${fmt2(ai)}`,
      `BACKTEST   : ${fmt2(bt)}`,
      `ADMIN PAGE : 200 OK · /admin/verify`,
      "─".repeat(55),
      `BLOCKING ISSUES (${status.blockingIssues.length}):`,
      ...(status.blockingIssues.length > 0
        ? status.blockingIssues.map(i => `  ✗ ${i}`)
        : ["  (none)"]),
      "─".repeat(55),
      `PRODUCTION DEPLOY: ${status.ready ? "YES ✓" : "NO ✗"}`,
    ].join("\n");

    navigator.clipboard.writeText(txt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [status]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-400 text-sm animate-pulse">Running checks…</div>
      </div>
    );
  }

  const ready = status?.ready ?? false;
  const blocking = status?.blockingIssues ?? [];
  const warnings = status?.warnings ?? [];

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">

      {/* ── Top status banner ──────────────────────────────────────────────── */}
      <div className={`rounded-2xl border-2 p-5 mb-6 ${
        ready ? "bg-emerald-50 border-emerald-300" : "bg-red-50 border-red-300"
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className={`text-2xl font-black ${ready ? "text-emerald-700" : "text-red-700"}`}>
                {ready ? "✓ PRODUCTION READY" : "✗ NOT READY"}
              </span>
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              <span className={`font-semibold ${status?.meta.healthAllowRec ? "text-emerald-700" : "text-slate-500"}`}>
                Allow Recommendation: {status?.meta.healthAllowRec === true ? "YES" : status?.meta.healthAllowRec === false ? "NO" : "—"}
              </span>
              <span className={`font-semibold ${blocking.length === 0 ? "text-emerald-700" : "text-red-700"}`}>
                Blocking Issues: {blocking.length}
              </span>
              {warnings.length > 0 && (
                <span className="text-amber-700 font-semibold">Warnings: {warnings.length}</span>
              )}
            </div>
            {blocking.length > 0 && (
              <ul className="mt-2 space-y-1">
                {blocking.map((issue, i) => (
                  <li key={i} className="text-xs text-red-700 font-mono">✗ {issue}</li>
                ))}
              </ul>
            )}
            {warnings.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {warnings.map((w, i) => (
                  <li key={i} className="text-xs text-amber-600 font-mono">⚠ {w}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <button
              onClick={loadStatus}
              disabled={refreshing}
              className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg font-semibold transition"
            >
              {refreshing ? "Checking…" : "⟳ Refresh All Checks"}
            </button>
            <button
              onClick={copyReport}
              className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm px-4 py-2 rounded-lg font-semibold transition"
            >
              {copied ? "✓ Copied!" : "⎘ Copy Acceptance Report"}
            </button>
            <p className="text-xs text-slate-400 text-center">
              Last checked: {status ? new Date(status.checkedAt).toLocaleTimeString("zh-CN", { timeZone: "Asia/Tokyo" }) + " JST" : "—"}
            </p>
          </div>
        </div>
      </div>

      {/* ── Nav ────────────────────────────────────────────────────────────── */}
      <div className="flex gap-2 text-xs text-slate-400 mb-4 flex-wrap">
        {["modules","dailyrec","history","backtest"].map(id => (
          <a key={id} href={`#${id}`} className="hover:text-slate-700 capitalize">{id}</a>
        ))}
      </div>

      {/* ── Module status cards ─────────────────────────────────────────────── */}
      <Section id="modules" title="Module Checks — click to expand">
        <div className="space-y-2">
          {(status?.modules ?? []).map(mod => (
            <ModuleCard key={mod.key} mod={mod} />
          ))}
        </div>
      </Section>

      {/* ── DailyRecommendation detail ──────────────────────────────────────── */}
      <Section id="dailyrec" title="DailyRecommendation Snapshot">
        <div className="flex gap-2 mb-3 flex-wrap">
          <select
            value={recDate}
            onChange={e => { setRecDate(e.target.value); loadDailyRec(e.target.value, recSymbol); }}
            className="border border-slate-200 rounded px-2 py-1 text-xs bg-white"
          >
            <option value="">All dates</option>
            {availDates.map(d => (
              <option key={d.date} value={d.date}>{d.date} ({d.count})</option>
            ))}
          </select>
          <input
            type="text" placeholder="Symbol…" value={recSymbol}
            onChange={e => setRecSymbol(e.target.value)}
            onKeyDown={e => e.key === "Enter" && loadDailyRec(recDate, recSymbol)}
            className="border border-slate-200 rounded px-2 py-1 text-xs w-28 font-mono"
          />
          <button onClick={() => loadDailyRec(recDate, recSymbol)}
            className="bg-slate-700 text-white text-xs px-3 py-1 rounded">Filter</button>
          <span className="text-xs text-slate-400 self-center">{recRows.length} rows</span>
        </div>
        {recLoading ? <p className="text-xs text-slate-400 animate-pulse">Loading…</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  {["Date","Sym","Name","Rank","Final","Rule","GPT","GPT Rating","Rec","Price","7d%","30d%"].map(h => (
                    <th key={h} className="text-left px-2 py-1.5 text-slate-500 font-semibold border-b border-slate-100 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recRows.length === 0 && (
                  <tr><td colSpan={12} className="text-center py-6 text-slate-400">No data</td></tr>
                )}
                {recRows.map((r, i) => (
                  <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-2 py-1 font-mono text-slate-400">{r.date}</td>
                    <td className="px-2 py-1 font-mono font-bold text-indigo-600">{r.symbol}</td>
                    <td className="px-2 py-1 max-w-[100px] truncate text-slate-600" title={r.nameZh ?? r.name}>{r.nameZh ?? r.name}</td>
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

      {/* ── History ─────────────────────────────────────────────────────────── */}
      <Section id="history" title="Historical Snapshot by Symbol">
        <div className="flex gap-2 mb-3">
          <input
            type="text" placeholder="e.g. 7203.T" value={histSymbol}
            onChange={e => setHistSymbol(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && loadHistory(histSymbol)}
            className="border border-slate-200 rounded px-2 py-1 text-xs w-32 font-mono"
          />
          <button onClick={() => loadHistory(histSymbol)}
            className="bg-slate-700 text-white text-xs px-3 py-1 rounded">Search</button>
        </div>
        {histLoading && <p className="text-xs text-slate-400 animate-pulse">Loading…</p>}
        {histData && !histLoading && (
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">
              {histData.symbol} · {histData.nameZh ?? histData.name}
              <span className="ml-2 text-xs text-slate-400">{histData.rows.length} dates</span>
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    {["Date","Rank","Final","Rule","GPT","Rating","Rec","Price","7d","30d","90d"].map(h => (
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

      {/* ── Backtest ─────────────────────────────────────────────────────────── */}
      <Section id="backtest" title="Backtest Results">
        {btLoading ? <p className="text-xs text-slate-400 animate-pulse">Loading…</p> : (
          <>
            {btResults.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-slate-500 mb-2">Cohort Summary</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50">
                        {["Date","Size","Horizon","WinRate","AvgRtn","Median","Filled","Best","Worst"].map(h => (
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
              Picks with Entry Price ({btPicks.length})
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    {["Date","Sym","Rank","Rating","BuyPx","EntryPx","7d%","30d%","Win"].map(h => (
                      <th key={h} className="text-left px-2 py-1 text-slate-500 font-semibold border-b border-slate-100">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {btPicks.length === 0 && (
                    <tr><td colSpan={9} className="text-center py-4 text-slate-400">No picks with entry price yet</td></tr>
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
                          {win === true ? <span className="text-emerald-600">WIN</span>
                           : win === false ? <span className="text-red-500">LOSS</span>
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

      <p className="text-center text-xs text-slate-300 pb-4">
        Internal tool · Read-only · /admin/verify · v8.9.1
      </p>
    </div>
  );
}
