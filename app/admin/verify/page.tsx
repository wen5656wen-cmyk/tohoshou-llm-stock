"use client";

import { useEffect, useState, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────
type SystemData = {
  commit: string; buildTime: string; environment: string; nodeVersion: string;
  healthStatus: string; criticalCount: number | null; warningCount: number | null;
  allowRecommendation: boolean | null; healthRunAt: string | null; topIssues: string[];
};
type SyncData = {
  latestPriceDate: string | null; stockCount: number;
  gptScoreTotal: number; gptScoreRanked: number;
  dailyRecToday: number;
  dailyRecByDate: { date: string; count: number }[];
  backtestResultCount: number; backtestErrorCount: number;
};
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
  recommendation: string | null; entryPrice: number | null;
  return7d: number | null; return30d: number | null; return90d: number | null;
};
type IndicatorData = {
  symbol: string; name: string; nameZh: string | null;
  latestDate: string; latestClose: number;
  high52w: number | null; low52w: number | null; pos52w: number | null;
  rsi14: number | null; ma5: number | null; ma20: number | null; ma60: number | null;
  maTrend: string | null; return5d: number | null; return20d: number | null; return60d: number | null;
  volume: { today: number | null; avg10d: number | null; ratio: number | null; realtimeSource: boolean };
  turnover: { rate: number | null; realtimeSource: boolean };
  priceHistory: { date: string; close: number; adjClose: number | null; volume: number | null }[];
};
type GPTRow = {
  symbol: string; model: string; gptRank: number | null; ruleScore: number | null;
  gptScore: number; finalScore: number; gptRating: string | null;
  confidence: string; action: string; summaryZh: string; risks: string[]; updatedAt: string; inputHash: string | null;
};
type BacktestPick = {
  date: string; symbol: string; name: string; gptRank: number; gptRating: string | null;
  buyPrice: number | null; entryPrice: number | null; entryDate: string | null;
  return7d: number | null; return30d: number | null; return90d: number | null;
  price7d: number | null; price30d: number | null;
  exitDate7d: string | null; exitDate30d: string | null;
};
type BacktestResult = {
  date: string; horizon: string; portfolioSize: string; winRate: number | null;
  avgReturn: number | null; medianReturn: number | null; filled: number; totalRecommendations: number;
  bestReturn: number | null; worstReturn: number | null; bestSymbol: string | null; worstSymbol: string | null;
};
type ErrorRow = { symbol: string; recommendDate: string; horizon: string | null; reason: string; createdAt: string };

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(v: number | null | undefined, dec = 1): string {
  if (v == null) return "—";
  return v.toFixed(dec);
}
function fmtPct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}
function fmtJpy(v: number | null | undefined): string {
  if (v == null) return "—";
  return `¥${v.toLocaleString()}`;
}
function retColor(v: number | null): string {
  if (v == null) return "text-slate-400";
  return v >= 0 ? "text-emerald-600 font-semibold" : "text-red-500 font-semibold";
}
function statusBadge(s: string, pass = true): React.ReactElement {
  const cls = pass
    ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
    : "bg-red-100 text-red-700 border border-red-200";
  return <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${cls}`}>{s}</span>;
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

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-6">
      <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-100 pb-2">
        {title}
      </h2>
      {children}
    </section>
  );
}

// ── KV row ────────────────────────────────────────────────────────────────────
function KVRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start gap-3 py-1.5 border-b border-slate-50 last:border-0">
      <span className="w-44 shrink-0 text-xs text-slate-400 pt-0.5">{label}</span>
      <span className={`text-sm text-slate-800 ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminVerifyPage() {
  const [systemData, setSystemData] = useState<SystemData | null>(null);
  const [syncData, setSyncData]     = useState<SyncData | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  // Module 3 state
  const [recDate, setRecDate]       = useState("");
  const [recSymbol, setRecSymbol]   = useState("");
  const [recRows, setRecRows]       = useState<DailyRecRow[]>([]);
  const [availDates, setAvailDates] = useState<{ date: string; count: number }[]>([]);
  const [recLoading, setRecLoading] = useState(false);

  // Module 4 state
  const [histSymbol, setHistSymbol] = useState("");
  const [histData, setHistData]     = useState<{ symbol: string; name: string; nameZh: string | null; rows: HistoryRow[] } | null>(null);
  const [histLoading, setHistLoading] = useState(false);

  // Module 5 state
  const [indSymbol, setIndSymbol]   = useState("");
  const [indData, setIndData]       = useState<IndicatorData | null>(null);
  const [indLoading, setIndLoading] = useState(false);

  // Module 6 state
  const [gptSymbol, setGptSymbol]   = useState("");
  const [gptRows, setGptRows]       = useState<GPTRow[]>([]);
  const [gptNullCount, setGptNullCount] = useState(0);
  const [gptLoading, setGptLoading] = useState(false);

  // Module 7 state
  const [btSymbol, setBtSymbol]     = useState("");
  const [btPicks, setBtPicks]       = useState<BacktestPick[]>([]);
  const [btResults, setBtResults]   = useState<BacktestResult[]>([]);
  const [btLoading, setBtLoading]   = useState(false);

  // Module 8 state
  const [errRows, setErrRows]       = useState<ErrorRow[]>([]);
  const [errLoading, setErrLoading] = useState(false);

  // ── Initial load ─────────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/admin/verify?module=all")
      .then(r => r.json())
      .then(d => {
        setSystemData(d.system ?? null);
        setSyncData(d.sync ?? null);
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });

    // Load initial DailyRec
    loadDailyRec("", "");
    // Load GPT scores
    loadGPT("");
    // Load backtest
    loadBacktest("");
    // Load errors
    loadErrors();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Loaders ───────────────────────────────────────────────────────────────
  const loadDailyRec = useCallback((date: string, sym: string) => {
    setRecLoading(true);
    const p = new URLSearchParams({ module: "dailyrec", limit: "100" });
    if (date) p.set("date", date);
    if (sym)  p.set("symbol", sym);
    fetch(`/api/admin/verify?${p}`)
      .then(r => r.json())
      .then(d => { setRecRows(d.rows ?? []); setAvailDates(d.availDates ?? []); setRecLoading(false); })
      .catch(() => setRecLoading(false));
  }, []);

  const loadHistory = useCallback((sym: string) => {
    if (!sym) return;
    setHistLoading(true);
    fetch(`/api/admin/verify?module=history&symbol=${encodeURIComponent(sym)}`)
      .then(r => r.json())
      .then(d => { setHistData(d); setHistLoading(false); })
      .catch(() => setHistLoading(false));
  }, []);

  const loadIndicators = useCallback((sym: string) => {
    if (!sym) return;
    setIndLoading(true);
    fetch(`/api/admin/verify?module=indicators&symbol=${encodeURIComponent(sym)}`)
      .then(r => r.json())
      .then(d => { setIndData(d.error ? null : d); setIndLoading(false); })
      .catch(() => setIndLoading(false));
  }, []);

  const loadGPT = useCallback((sym: string) => {
    setGptLoading(true);
    const p = new URLSearchParams({ module: "gpt", limit: "50" });
    if (sym) p.set("symbol", sym);
    fetch(`/api/admin/verify?${p}`)
      .then(r => r.json())
      .then(d => { setGptRows(d.rows ?? []); setGptNullCount(d.nullRankCount ?? 0); setGptLoading(false); })
      .catch(() => setGptLoading(false));
  }, []);

  const loadBacktest = useCallback((sym: string) => {
    setBtLoading(true);
    const p = new URLSearchParams({ module: "backtest", limit: "50" });
    if (sym) p.set("symbol", sym);
    fetch(`/api/admin/verify?${p}`)
      .then(r => r.json())
      .then(d => { setBtPicks(d.picks ?? []); setBtResults(d.results ?? []); setBtLoading(false); })
      .catch(() => setBtLoading(false));
  }, []);

  const loadErrors = useCallback(() => {
    setErrLoading(true);
    fetch("/api/admin/verify?module=errors")
      .then(r => r.json())
      .then(d => { setErrRows(d.errors ?? []); setErrLoading(false); })
      .catch(() => setErrLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-400 text-sm animate-pulse">Loading verify data…</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-500 text-sm">Error: {error}</div>
      </div>
    );
  }

  const isHealthOk = systemData?.healthStatus === "PASS" || systemData?.healthStatus === "WARNING";

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">System Verify</h1>
          <p className="text-xs text-slate-400 mt-0.5">Internal read-only verification dashboard · /admin/verify</p>
        </div>
        <div className="flex gap-2 text-xs text-slate-400">
          <a href="#system"   className="hover:text-slate-700">System</a>·
          <a href="#sync"     className="hover:text-slate-700">Sync</a>·
          <a href="#dailyrec" className="hover:text-slate-700">Snapshot</a>·
          <a href="#history"  className="hover:text-slate-700">History</a>·
          <a href="#indicators" className="hover:text-slate-700">Indicators</a>·
          <a href="#gpt"      className="hover:text-slate-700">GPT</a>·
          <a href="#backtest" className="hover:text-slate-700">Backtest</a>·
          <a href="#errors"   className="hover:text-slate-700">Errors</a>
        </div>
      </div>

      {/* ── Module 1: System Status ─────────────────────────────────────────── */}
      <Section id="system" title="Module 1 — System Status">
        {systemData ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            <div>
              <KVRow label="Commit" value={<span className="font-mono text-indigo-600">{systemData.commit}</span>} />
              <KVRow label="Build Time" value={systemData.buildTime !== "unknown" ? new Date(systemData.buildTime).toLocaleString("zh-CN", { timeZone: "Asia/Tokyo" }) + " JST" : "unknown"} />
              <KVRow label="Environment" value={statusBadge(systemData.environment, systemData.environment === "production")} />
              <KVRow label="Node Version" value={systemData.nodeVersion} mono />
            </div>
            <div>
              <KVRow label="Health Status" value={statusBadge(systemData.healthStatus, isHealthOk)} />
              <KVRow label="CRITICAL Count" value={
                <span className={systemData.criticalCount === 0 ? "text-emerald-600 font-bold" : "text-red-600 font-bold"}>
                  {systemData.criticalCount ?? "—"}
                </span>
              } />
              <KVRow label="WARNING Count" value={systemData.warningCount ?? "—"} />
              <KVRow label="Allow Recommendation" value={
                systemData.allowRecommendation === true
                  ? <span className="text-emerald-600 font-bold">✓ YES</span>
                  : systemData.allowRecommendation === false
                  ? <span className="text-red-600 font-bold">✗ NO</span>
                  : "—"
              } />
              <KVRow label="Health Run At" value={systemData.healthRunAt ? new Date(systemData.healthRunAt).toLocaleString("zh-CN", { timeZone: "Asia/Tokyo" }) + " JST" : "never"} />
            </div>
            {systemData.topIssues.length > 0 && (
              <div className="col-span-2 mt-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs font-bold text-amber-700 mb-1">Top Issues</p>
                {systemData.topIssues.map((i, idx) => (
                  <p key={idx} className="text-xs text-amber-600 font-mono">· {i}</p>
                ))}
              </div>
            )}
          </div>
        ) : <p className="text-slate-400 text-sm">No system data</p>}
      </Section>

      {/* ── Module 2: Data Sync ─────────────────────────────────────────────── */}
      <Section id="sync" title="Module 2 — Data Sync Status">
        {syncData ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            <div>
              <KVRow label="Latest Price Date" value={<span className="font-mono">{syncData.latestPriceDate ?? "—"}</span>} />
              <KVRow label="Stock Count" value={syncData.stockCount.toLocaleString()} />
              <KVRow label="GPTScore Total" value={syncData.gptScoreTotal.toLocaleString()} />
              <KVRow label="GPTScore Ranked" value={
                <span className={syncData.gptScoreRanked > 0 ? "text-emerald-600 font-semibold" : "text-slate-400"}>
                  {syncData.gptScoreRanked.toLocaleString()}
                </span>
              } />
              <KVRow label="BacktestResult Count" value={syncData.backtestResultCount.toLocaleString()} />
              <KVRow label="BacktestError Count" value={
                <span className={syncData.backtestErrorCount > 0 ? "text-amber-600" : "text-slate-600"}>
                  {syncData.backtestErrorCount.toLocaleString()}
                </span>
              } />
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-2">DailyRecommendation by Date</p>
              <div className="space-y-1">
                <div className="text-xs font-semibold text-slate-500 mb-1">
                  Today (JST): <span className={syncData.dailyRecToday >= 300 ? "text-emerald-600" : "text-amber-600"}>
                    {syncData.dailyRecToday} {syncData.dailyRecToday >= 300 ? "✓" : "⚠"}
                  </span>
                </div>
                {syncData.dailyRecByDate.map(d => (
                  <div key={d.date} className="flex justify-between text-xs border-b border-slate-50 py-0.5">
                    <span className="font-mono text-slate-500">{d.date}</span>
                    <span className={d.count >= 300 ? "text-emerald-600 font-semibold" : "text-amber-500"}>
                      {d.count} {d.count >= 300 ? "✓" : "⚠"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : <p className="text-slate-400 text-sm">No sync data</p>}
      </Section>

      {/* ── Module 3: DailyRecommendation Snapshot ─────────────────────────── */}
      <Section id="dailyrec" title="Module 3 — DailyRecommendation Snapshot">
        <div className="flex gap-3 mb-4 flex-wrap">
          <select
            value={recDate}
            onChange={e => { setRecDate(e.target.value); loadDailyRec(e.target.value, recSymbol); }}
            className="border border-slate-200 rounded px-2 py-1 text-xs text-slate-700 bg-white"
          >
            <option value="">All dates</option>
            {availDates.map(d => (
              <option key={d.date} value={d.date}>{d.date} ({d.count})</option>
            ))}
          </select>
          <input
            type="text" placeholder="Search symbol…" value={recSymbol}
            onChange={e => setRecSymbol(e.target.value)}
            onKeyDown={e => e.key === "Enter" && loadDailyRec(recDate, recSymbol)}
            className="border border-slate-200 rounded px-2 py-1 text-xs w-32"
          />
          <button
            onClick={() => loadDailyRec(recDate, recSymbol)}
            className="bg-slate-700 text-white text-xs px-3 py-1 rounded hover:bg-slate-800"
          >
            Filter
          </button>
          <span className="text-xs text-slate-400 self-center">{recRows.length} rows</span>
        </div>
        {recLoading ? <p className="text-xs text-slate-400 animate-pulse">Loading…</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  {["Date","Symbol","Name","Rank","Score","Rule","GPT","Rating","Rec","Price","Return7d","Return30d","Summary"].map(h => (
                    <th key={h} className="text-left px-2 py-1.5 text-slate-500 font-semibold border-b border-slate-200 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recRows.length === 0 && (
                  <tr><td colSpan={13} className="text-center py-4 text-slate-400">No data</td></tr>
                )}
                {recRows.map((r, i) => (
                  <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-2 py-1 font-mono text-slate-500">{r.date}</td>
                    <td className="px-2 py-1 font-mono font-bold text-indigo-600">{r.symbol}</td>
                    <td className="px-2 py-1 text-slate-600 max-w-[120px] truncate" title={r.nameZh ?? r.name}>{r.nameZh ?? r.name}</td>
                    <td className="px-2 py-1 text-slate-700 font-semibold">#{r.gptRank}</td>
                    <td className="px-2 py-1 font-mono text-slate-700">{fmt(r.finalScore)}</td>
                    <td className="px-2 py-1 font-mono text-slate-500">{fmt(r.adaptiveScore)}</td>
                    <td className="px-2 py-1 font-mono text-slate-500">{fmt(r.gptScore)}</td>
                    <td className="px-2 py-1">{ratingBadge(r.gptRating)}</td>
                    <td className="px-2 py-1">{ratingBadge(r.recommendation)}</td>
                    <td className="px-2 py-1 font-mono">{fmtJpy(r.buyPrice)}</td>
                    <td className={`px-2 py-1 font-mono ${retColor(r.return7d)}`}>{fmtPct(r.return7d)}</td>
                    <td className={`px-2 py-1 font-mono ${retColor(r.return30d)}`}>{fmtPct(r.return30d)}</td>
                    <td className="px-2 py-1 text-slate-400 max-w-[140px] truncate" title={r.summaryZh ?? ""}>{r.summaryZh ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ── Module 4: Historical Snapshot ──────────────────────────────────── */}
      <Section id="history" title="Module 4 — Historical Snapshot by Symbol">
        <div className="flex gap-3 mb-4">
          <input
            type="text" placeholder="e.g. 7203.T" value={histSymbol}
            onChange={e => setHistSymbol(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && loadHistory(histSymbol)}
            className="border border-slate-200 rounded px-2 py-1 text-xs w-32 font-mono"
          />
          <button onClick={() => loadHistory(histSymbol)}
            className="bg-slate-700 text-white text-xs px-3 py-1 rounded hover:bg-slate-800">
            Search
          </button>
        </div>
        {histLoading && <p className="text-xs text-slate-400 animate-pulse">Loading…</p>}
        {histData && !histLoading && (
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-3">
              {histData.symbol} — {histData.nameZh ?? histData.name}
              <span className="ml-2 text-xs text-slate-400">{histData.rows.length} dates</span>
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    {["Date","Rank","FinalScore","Rule","GPT","Rating","Rec","Price","Entry","7d","30d","90d"].map(h => (
                      <th key={h} className="text-left px-2 py-1.5 text-slate-500 font-semibold border-b border-slate-200">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {histData.rows.map((r, i) => (
                    <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-2 py-1 font-mono text-slate-500">{r.date}</td>
                      <td className="px-2 py-1 font-semibold text-slate-700">#{r.gptRank}</td>
                      <td className="px-2 py-1 font-mono text-slate-700">{fmt(r.finalScore)}</td>
                      <td className="px-2 py-1 font-mono text-slate-500">{fmt(r.adaptiveScore)}</td>
                      <td className="px-2 py-1 font-mono text-slate-500">{fmt(r.gptScore)}</td>
                      <td className="px-2 py-1">{ratingBadge(r.gptRating)}</td>
                      <td className="px-2 py-1">{ratingBadge(r.recommendation)}</td>
                      <td className="px-2 py-1 font-mono">{fmtJpy(r.buyPrice)}</td>
                      <td className="px-2 py-1 font-mono">{fmtJpy(r.entryPrice)}</td>
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

      {/* ── Module 5: Indicator Calculation ────────────────────────────────── */}
      <Section id="indicators" title="Module 5 — Indicator Calculation Breakdown">
        <div className="flex gap-3 mb-4">
          <input
            type="text" placeholder="e.g. 8035.T" value={indSymbol}
            onChange={e => setIndSymbol(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && loadIndicators(indSymbol)}
            className="border border-slate-200 rounded px-2 py-1 text-xs w-32 font-mono"
          />
          <button onClick={() => loadIndicators(indSymbol)}
            className="bg-slate-700 text-white text-xs px-3 py-1 rounded hover:bg-slate-800">
            Calculate
          </button>
        </div>
        {indLoading && <p className="text-xs text-slate-400 animate-pulse">Loading…</p>}
        {indData && !indLoading && (
          <div className="space-y-4">
            <p className="text-sm font-semibold text-slate-700">
              {indData.symbol} — {indData.nameZh ?? indData.name}
              <span className="ml-2 text-xs text-slate-400 font-mono">{indData.latestDate}</span>
            </p>

            {/* Basic price indicators */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Current Price", value: fmtJpy(indData.latestClose) },
                { label: "RSI(14)", value: fmt(indData.rsi14) + (indData.rsi14 != null ? (indData.rsi14 >= 70 ? " 🔴" : indData.rsi14 <= 30 ? " 🟢" : "") : "") },
                { label: "MA20", value: fmtJpy(indData.ma20) },
                { label: "MA Trend", value: indData.maTrend ?? "—" },
                { label: "52W Position", value: indData.pos52w != null ? `${fmt(indData.pos52w)}%` : "—" },
                { label: "52W High", value: fmtJpy(indData.high52w) },
                { label: "52W Low", value: fmtJpy(indData.low52w) },
                { label: "Return 20d", value: <span className={retColor(indData.return20d)}>{fmtPct(indData.return20d)}</span> },
              ].map(({ label, value }) => (
                <div key={label} className="bg-slate-50 rounded p-2">
                  <div className="text-xs text-slate-400 mb-0.5">{label}</div>
                  <div className="text-sm font-semibold text-slate-800">{value}</div>
                </div>
              ))}
            </div>

            {/* Vol ratio calculation breakdown */}
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
              <p className="text-xs font-bold text-blue-700 mb-3">盘中量比 (Intraday Volume Ratio)</p>
              <div className="flex items-center gap-2 text-sm flex-wrap">
                <span className="text-slate-600">今日成交量</span>
                <span className="text-slate-400">/</span>
                <span className="text-slate-600">最近10日平均成交量</span>
                <span className="text-slate-400">=</span>
                <span className="font-mono text-blue-700 font-bold">
                  {indData.volume.today != null ? Math.round(indData.volume.today).toLocaleString() : "N/A"}
                </span>
                <span className="text-slate-400">/</span>
                <span className="font-mono text-blue-700">
                  {indData.volume.avg10d != null ? Math.round(indData.volume.avg10d).toLocaleString() : "N/A"}
                </span>
                <span className="text-slate-400">=</span>
                <span className="font-mono font-bold text-blue-800 text-base">
                  {indData.volume.ratio != null ? indData.volume.ratio.toFixed(4) : "—"}
                </span>
              </div>
              <p className="mt-2 text-lg font-bold text-blue-900">
                Display: {indData.volume.ratio != null ? `${indData.volume.ratio.toFixed(1)}x` : "—"}
                {indData.volume.ratio != null && indData.volume.ratio > 3 && (
                  <span className="ml-2 text-amber-600 text-sm">{"⚠ High (>3x)"}</span>
                )}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {indData.volume.realtimeSource ? "Source: RealtimeMarket table" : "Source: DailyPrice last 10 bars avg"}
              </p>
            </div>

            {/* Turnover calculation breakdown */}
            <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-4">
              <p className="text-xs font-bold text-emerald-700 mb-3">成交占比 (Share Flow Turnover)</p>
              {indData.turnover.rate != null ? (
                <>
                  <div className="flex items-center gap-2 text-sm flex-wrap">
                    <span className="text-slate-600">成交量</span>
                    <span className="text-slate-400">/</span>
                    <span className="text-slate-600">发行股数</span>
                    <span className="text-slate-400">×</span>
                    <span className="text-slate-600">100</span>
                    <span className="text-slate-400">=</span>
                    <span className="font-mono font-bold text-emerald-800 text-base">
                      {indData.turnover.rate.toFixed(4)}%
                    </span>
                  </div>
                  <p className="mt-2 text-lg font-bold text-emerald-900">
                    Display: {indData.turnover.rate.toFixed(2)}%
                  </p>
                  <p className="text-xs text-slate-400 mt-1">Source: RealtimeMarket (from Yahoo Finance sharesOutstanding)</p>
                </>
              ) : (
                <p className="text-sm text-slate-400">N/A — real-time data not available (market closed or symbol not synced)</p>
              )}
            </div>

            {/* Price history table */}
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2">Last 10 Daily Prices (for avg10d vol calculation)</p>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    {["Date","Close","AdjClose","Volume"].map(h => (
                      <th key={h} className="text-left px-2 py-1 text-slate-500 font-semibold border-b border-slate-200">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {indData.priceHistory.map((p, i) => (
                    <tr key={i} className={`border-b border-slate-50 ${i === 0 ? "bg-blue-50" : ""}`}>
                      <td className="px-2 py-1 font-mono text-slate-500">{typeof p.date === "string" ? p.date.slice(0,10) : String(p.date).slice(0,10)}</td>
                      <td className="px-2 py-1 font-mono">{fmtJpy(p.close)}</td>
                      <td className="px-2 py-1 font-mono text-slate-400">{p.adjClose != null ? fmtJpy(p.adjClose) : "—"}</td>
                      <td className="px-2 py-1 font-mono">{p.volume != null ? Math.round(p.volume).toLocaleString() : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Section>

      {/* ── Module 6: GPT Score ─────────────────────────────────────────────── */}
      <Section id="gpt" title="Module 6 — GPT Score Verification">
        <div className="flex gap-3 mb-4 items-center flex-wrap">
          <input
            type="text" placeholder="Filter symbol…" value={gptSymbol}
            onChange={e => setGptSymbol(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && loadGPT(gptSymbol)}
            className="border border-slate-200 rounded px-2 py-1 text-xs w-32 font-mono"
          />
          <button onClick={() => loadGPT(gptSymbol)}
            className="bg-slate-700 text-white text-xs px-3 py-1 rounded hover:bg-slate-800">
            Search
          </button>
          <span className={`text-xs font-semibold ${gptNullCount > 0 ? "text-red-600" : "text-emerald-600"}`}>
            gptRank=null: {gptNullCount} {gptNullCount > 0 ? "⚠ (rerank needed)" : "✓"}
          </span>
        </div>
        {gptLoading ? <p className="text-xs text-slate-400 animate-pulse">Loading…</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  {["Rank","Symbol","Model","Rule","GPT","Final","Rating","Conf","Action","Summary","Risks","Updated"].map(h => (
                    <th key={h} className="text-left px-2 py-1.5 text-slate-500 font-semibold border-b border-slate-200 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gptRows.length === 0 && (
                  <tr><td colSpan={12} className="text-center py-4 text-slate-400">No GPTScore data</td></tr>
                )}
                {gptRows.map((r, i) => (
                  <tr key={i} className={`border-b border-slate-50 hover:bg-slate-50 ${r.gptRank == null ? "bg-red-50" : ""}`}>
                    <td className="px-2 py-1 font-mono text-slate-500">{r.gptRank ?? <span className="text-red-500 font-bold">NULL</span>}</td>
                    <td className="px-2 py-1 font-mono font-bold text-indigo-600">{r.symbol}</td>
                    <td className="px-2 py-1 text-slate-400">{r.model}</td>
                    <td className="px-2 py-1 font-mono">{fmt(r.ruleScore)}</td>
                    <td className="px-2 py-1 font-mono">{fmt(r.gptScore)}</td>
                    <td className="px-2 py-1 font-mono font-bold text-slate-800">{fmt(r.finalScore)}</td>
                    <td className="px-2 py-1">{ratingBadge(r.gptRating)}</td>
                    <td className="px-2 py-1 text-slate-500">{r.confidence}</td>
                    <td className="px-2 py-1 text-slate-500">{r.action}</td>
                    <td className="px-2 py-1 text-slate-500 max-w-[120px] truncate" title={r.summaryZh}>{r.summaryZh}</td>
                    <td className="px-2 py-1 text-slate-400 max-w-[100px] truncate" title={Array.isArray(r.risks) ? r.risks.join("; ") : ""}>{Array.isArray(r.risks) ? r.risks[0] : "—"}</td>
                    <td className="px-2 py-1 font-mono text-slate-400 whitespace-nowrap">{new Date(r.updatedAt).toLocaleString("zh-CN", { timeZone: "Asia/Tokyo" }).slice(0,16)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ── Module 7: Backtest ──────────────────────────────────────────────── */}
      <Section id="backtest" title="Module 7 — Backtest Verification">
        <div className="flex gap-3 mb-4">
          <input
            type="text" placeholder="Filter symbol…" value={btSymbol}
            onChange={e => setBtSymbol(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && loadBacktest(btSymbol)}
            className="border border-slate-200 rounded px-2 py-1 text-xs w-32 font-mono"
          />
          <button onClick={() => loadBacktest(btSymbol)}
            className="bg-slate-700 text-white text-xs px-3 py-1 rounded hover:bg-slate-800">
            Search
          </button>
        </div>

        {/* Cohort results summary */}
        {btResults.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-slate-500 mb-2">Portfolio Performance Summary (latest)</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    {["Date","Portfolio","Horizon","WinRate","AvgReturn","Median","Filled","BestRtn","WorstRtn","Best","Worst"].map(h => (
                      <th key={h} className="text-left px-2 py-1 text-slate-500 font-semibold border-b border-slate-200">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {btResults.map((r, i) => (
                    <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-2 py-1 font-mono text-slate-500">{r.date}</td>
                      <td className="px-2 py-1 font-semibold text-slate-700">{r.portfolioSize}</td>
                      <td className="px-2 py-1 text-slate-500">{r.horizon}</td>
                      <td className={`px-2 py-1 font-mono font-bold ${retColor(r.winRate)}`}>{fmt(r.winRate)}%</td>
                      <td className={`px-2 py-1 font-mono ${retColor(r.avgReturn)}`}>{fmtPct(r.avgReturn)}</td>
                      <td className={`px-2 py-1 font-mono ${retColor(r.medianReturn)}`}>{fmtPct(r.medianReturn)}</td>
                      <td className="px-2 py-1 text-slate-500">{r.filled}/{r.totalRecommendations}</td>
                      <td className={`px-2 py-1 font-mono ${retColor(r.bestReturn)}`}>{fmtPct(r.bestReturn)}</td>
                      <td className={`px-2 py-1 font-mono ${retColor(r.worstReturn)}`}>{fmtPct(r.worstReturn)}</td>
                      <td className="px-2 py-1 font-mono text-indigo-600">{r.bestSymbol ?? "—"}</td>
                      <td className="px-2 py-1 font-mono text-red-500">{r.worstSymbol ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Individual picks */}
        {btLoading ? <p className="text-xs text-slate-400 animate-pulse">Loading…</p> : (
          <div className="overflow-x-auto">
            <p className="text-xs font-semibold text-slate-500 mb-2">Individual Picks (with entry price filled)</p>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  {["Date","Symbol","Rank","Rating","BuyPx","EntryPx","EntryDate","7dPx","7d%","30dPx","30d%","90d%","Win"].map(h => (
                    <th key={h} className="text-left px-2 py-1 text-slate-500 font-semibold border-b border-slate-200 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {btPicks.length === 0 && (
                  <tr><td colSpan={13} className="text-center py-4 text-slate-400">No picks with entry price yet</td></tr>
                )}
                {btPicks.map((p, i) => {
                  const win = p.return30d != null ? p.return30d > 0 : p.return7d != null ? p.return7d > 0 : null;
                  return (
                    <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-2 py-1 font-mono text-slate-500">{p.date}</td>
                      <td className="px-2 py-1 font-mono font-bold text-indigo-600">{p.symbol}</td>
                      <td className="px-2 py-1 text-slate-700">#{p.gptRank}</td>
                      <td className="px-2 py-1">{ratingBadge(p.gptRating)}</td>
                      <td className="px-2 py-1 font-mono">{fmtJpy(p.buyPrice)}</td>
                      <td className="px-2 py-1 font-mono font-semibold">{fmtJpy(p.entryPrice)}</td>
                      <td className="px-2 py-1 font-mono text-slate-400">{p.entryDate ?? "—"}</td>
                      <td className="px-2 py-1 font-mono">{fmtJpy(p.price7d)}</td>
                      <td className={`px-2 py-1 font-mono ${retColor(p.return7d)}`}>{fmtPct(p.return7d)}</td>
                      <td className="px-2 py-1 font-mono">{fmtJpy(p.price30d)}</td>
                      <td className={`px-2 py-1 font-mono ${retColor(p.return30d)}`}>{fmtPct(p.return30d)}</td>
                      <td className={`px-2 py-1 font-mono ${retColor(p.return90d)}`}>{fmtPct(p.return90d)}</td>
                      <td className="px-2 py-1 font-bold">
                        {win === true ? <span className="text-emerald-600">WIN</span> : win === false ? <span className="text-red-500">LOSS</span> : <span className="text-slate-300">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ── Module 8: Errors ────────────────────────────────────────────────── */}
      <Section id="errors" title="Module 8 — Recent Errors">
        <div className="flex justify-between items-center mb-3">
          <span className={`text-xs font-semibold ${errRows.length > 0 ? "text-amber-600" : "text-emerald-600"}`}>
            {errRows.length > 0 ? `${errRows.length} BacktestErrors` : "✓ No BacktestErrors"}
          </span>
          <button onClick={loadErrors} className="text-xs text-slate-400 hover:text-slate-700 underline">Refresh</button>
        </div>
        {errLoading ? <p className="text-xs text-slate-400 animate-pulse">Loading…</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  {["Symbol","RecommendDate","Horizon","Reason","CreatedAt"].map(h => (
                    <th key={h} className="text-left px-2 py-1 text-slate-500 font-semibold border-b border-slate-200">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {errRows.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-4 text-emerald-500 font-semibold">✓ No errors</td></tr>
                )}
                {errRows.map((e, i) => (
                  <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-2 py-1 font-mono font-bold text-indigo-600">{e.symbol}</td>
                    <td className="px-2 py-1 font-mono text-slate-500">{e.recommendDate}</td>
                    <td className="px-2 py-1 text-slate-500">{e.horizon ?? "entry"}</td>
                    <td className="px-2 py-1 font-mono text-amber-700">{e.reason}</td>
                    <td className="px-2 py-1 font-mono text-slate-400">{new Date(e.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Tokyo" }).slice(0,16)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <p className="text-center text-xs text-slate-300 pb-4">
        Internal tool · Read-only · /admin/verify · v8.9
      </p>
    </div>
  );
}
