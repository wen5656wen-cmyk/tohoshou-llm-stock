"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";

dayjs.extend(relativeTime);
dayjs.locale("zh-cn");

// ── Types ─────────────────────────────────────────────────────────────────────

type SourceStatus = "REAL" | "PARTIAL" | "FALLBACK" | "STALE" | "FAILED" | "NEVER_SYNCED";

type SourceInfo = {
  id: string;
  taskName: string;
  icon: string;
  description: string;
  status: SourceStatus;
  source: string;
  lastSyncedAt: string | null;
  latestDate: string | null;
  ageDays: number | null;
  rowsInserted: number | null;
  totalCount: number | null;
  coveredSymbols: number | null;
  nextCron: string;
  errorMessage: string | null;
  apiEndpoint: string | null;
  isAsync: boolean;
  extra: Record<string, unknown>;
};

type Summary = {
  realCount: number;
  partialCount: number;
  fallbackCount: number;
  failedCount: number;
  lastScoreComputedAt: string | null;
  stockScoreTotal: number;
  stockScoreCovered: number;
  buyCount: number;
  strongBuyCount: number;
  holdCount: number;
  watchCount: number;
  avoidCount: number;
  marketTemperature: string;
  bullRate: number;
  disclosureTotal: number;
  disclosureCoveredSymbols: number;
  lineConfigured: boolean;
  gptConfigured: boolean;
};

type SyncLogEntry = {
  id: number;
  source: string;
  status: string;
  message: string | null;
  itemCount: number;
  durationMs: number | null;
  createdAt: string;
};

type StatusData = {
  sources: SourceInfo[];
  summary: Summary;
  recentLogs: SyncLogEntry[];
};

type SyncResult = {
  success?: boolean;
  status?: string;
  count?: number;
  synced?: number;
  errors?: number;
  durationMs?: number;
  syncedAt?: string;
  message?: string;
  log?: string[];
  error?: string;
  detail?: string;
  hint?: string;
  skipped?: string;
  summary?: string;
  jobId?: string;
  total?: number;
  processed?: number;
};

type JobStatus = {
  jobId: string;
  source: string;
  status: "PENDING" | "RUNNING" | "SUCCESS" | "FAILED";
  total: number;
  processed: number;
  successCount: number;
  failedCount: number;
  errorMessage: string | null;
  pct: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<SourceStatus, { label: string; dot: string; badge: string }> = {
  REAL:         { label: "✅ REAL",         dot: "bg-green-500",  badge: "bg-green-100 text-green-700" },
  PARTIAL:      { label: "⚠ 部分",          dot: "bg-amber-400",  badge: "bg-amber-100 text-amber-700" },
  FALLBACK:     { label: "○ FALLBACK",      dot: "bg-slate-400",  badge: "bg-slate-100 text-slate-600" },
  STALE:        { label: "⚠ 数据过期",      dot: "bg-orange-400", badge: "bg-orange-100 text-orange-700" },
  FAILED:       { label: "✗ 失败",          dot: "bg-red-500",    badge: "bg-red-100 text-red-700" },
  NEVER_SYNCED: { label: "— 从未同步",      dot: "bg-gray-300",   badge: "bg-gray-100 text-gray-500" },
};

const TEMP_CFG: Record<string, { emoji: string; label: string; color: string }> = {
  HOT:          { emoji: "🔥", label: "HOT",          color: "text-red-600" },
  WARM:         { emoji: "☀️", label: "WARM",         color: "text-orange-500" },
  NEUTRAL:      { emoji: "🌤", label: "NEUTRAL",      color: "text-blue-600" },
  COLD:         { emoji: "❄️", label: "COLD",         color: "text-sky-500" },
  EXTREME_COLD: { emoji: "🥶", label: "EXTREME_COLD", color: "text-slate-600" },
};

async function safeFetch(url: string, init?: RequestInit): Promise<SyncResult> {
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    if (!text) return { success: false, error: `空响应 (HTTP ${res.status})` };
    const data = JSON.parse(text) as SyncResult;
    if (!res.ok && !data.error) {
      data.error = data.message ?? `HTTP ${res.status}`;
      data.success = false;
    }
    return data;
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SyncBadge({ status }: { status: SourceStatus }) {
  const cfg = STATUS_CFG[status];
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.badge}`}>
      {cfg.label}
    </span>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number | null; sub?: string }) {
  if (value === null || value === undefined) return null;
  return (
    <div className="flex flex-col">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-sm font-semibold text-slate-800 tabular-nums">
        {typeof value === "number" ? value.toLocaleString() : value}
        {sub && <span className="text-xs font-normal text-slate-400 ml-1">{sub}</span>}
      </span>
    </div>
  );
}

function ResultPanel({ result }: { result: SyncResult }) {
  if (!result || Object.keys(result).length === 0) return null;

  if (result.success === false || result.error) {
    return (
      <div className="mt-3 text-sm text-red-600 bg-red-50 rounded-lg p-3">
        <div className="font-medium mb-1">✗ 同步失败</div>
        <div>{result.error}</div>
        {result.detail && <div className="text-xs mt-1 font-mono opacity-80">{result.detail}</div>}
        {result.hint && <div className="text-xs mt-1 text-amber-600">{result.hint}</div>}
      </div>
    );
  }
  if (result.skipped) {
    return (
      <div className="mt-3 text-sm text-slate-400 bg-slate-50 rounded-lg p-3">
        跳过: {result.skipped}
      </div>
    );
  }
  if (result.success === true || result.status === "SUCCESS" || result.status === "PARTIAL") {
    const isPartial = result.status === "PARTIAL" || (result.errors ?? 0) > 0;
    const count = result.count ?? result.synced ?? 0;
    const ms = result.durationMs ?? 0;
    return (
      <div className={`mt-3 text-sm rounded-lg p-3 ${isPartial ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"}`}>
        <div className="font-medium mb-1">
          {isPartial ? "⚠ 部分成功" : "✓ 同步完成"} · {count.toLocaleString()}条 · {(ms / 1000).toFixed(1)}s
        </div>
        {result.syncedAt && (
          <div className="text-xs opacity-70">{dayjs(result.syncedAt).format("YYYY/M/D HH:mm:ss")}</div>
        )}
        {result.summary && <div className="text-xs mt-1 font-mono opacity-80">{result.summary}</div>}
        {result.log && result.log.length > 0 && (
          <div className="text-xs font-mono mt-2 space-y-0.5 max-h-24 overflow-y-auto opacity-80">
            {result.log.slice(0, 15).map((l, i) => <div key={i}>{l}</div>)}
          </div>
        )}
      </div>
    );
  }
  return null;
}

function JobProgressPanel({ job }: { job: JobStatus }) {
  const done = job.status === "SUCCESS" || job.status === "FAILED";
  const ok = job.status === "SUCCESS";
  return (
    <div className={`mt-3 text-sm rounded-lg p-3 ${ok ? "bg-green-50 text-green-700" : done ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium">{ok ? "✓ 完成" : done ? "✗ 失败" : "⟳ 同步中…"}</span>
        <span className="text-xs tabular-nums">{job.processed} / {job.total} 只</span>
      </div>
      <div className="w-full bg-white/60 rounded-full h-1.5 mb-1.5">
        <div
          className={`h-1.5 rounded-full transition-all ${ok ? "bg-green-500" : done ? "bg-red-500" : "bg-blue-500"}`}
          style={{ width: `${job.pct}%` }}
        />
      </div>
      <div className="text-xs opacity-70">
        {done
          ? `成功 ${job.successCount} 只${job.failedCount ? `，失败 ${job.failedCount}` : ""}`
          : `已完成 ${job.pct}%，每3s更新…`}
      </div>
      {job.errorMessage && <div className="text-xs mt-1">{job.errorMessage}</div>}
    </div>
  );
}

// ── Cron schedule ─────────────────────────────────────────────────────────────

const CRON_SCHEDULE = [
  { time: "05:30 JST", task: "GlobalMarket（Yahoo Finance，每日）" },
  { time: "06:00 JST", task: "DailyPrice + Financial（J-Quants，每日）" },
  { time: "07:00 JST", task: "TDnet Disclosure（Cookie方案，工作日）" },
  { time: "07:15 JST", task: "InstitutionalFlow 备份（每周一）" },
  { time: "07:00/12/18/22 JST", task: "Kabutan News（每日4次）" },
  { time: "07:30 JST", task: "ComputeScores + Pass2（每日）" },
  { time: "08:00 JST", task: "LINE 朝报（工作日）" },
  { time: "08:30 JST", task: "LINE 日报 TOP10" },
  { time: "12:30 JST", task: "LINE 午间速报（工作日）" },
  { time: "15:45 JST", task: "LINE 大引け总结（工作日）" },
  { time: "16:30 JST", task: "InstitutionalFlow（J-Quants，每周五）" },
  { time: "16:35 JST", task: "LINE 风险提示（工作日）" },
  { time: "18:30 JST", task: "空売り比率（JPX PDF，工作日）" },
  { time: "22:00 JST", task: "Stock Master 元数据同步（每日）" },
  { time: "22:30 JST", task: "配当历史（J-Quants fins/summary，每日）" },
];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SyncPage() {
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, SyncResult>>({});
  const [jobs, setJobs] = useState<Record<string, JobStatus>>({});
  const pollTimers = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/sync/status", { cache: "no-store" });
      const json = await res.json() as StatusData;
      setData(json);
    } catch (e) {
      console.error("status fetch failed:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    return () => {
      for (const t of Object.values(pollTimers.current)) clearInterval(t);
    };
  }, [fetchStatus]);

  const startPoll = (jobId: string, sourceId: string) => {
    if (pollTimers.current[sourceId]) clearInterval(pollTimers.current[sourceId]);
    pollTimers.current[sourceId] = setInterval(async () => {
      try {
        const res = await fetch(`/api/sync/jobs/${jobId}`, { cache: "no-store" });
        const job = await res.json() as JobStatus;
        setJobs((j) => ({ ...j, [sourceId]: job }));
        if (job.status === "SUCCESS" || job.status === "FAILED") {
          clearInterval(pollTimers.current[sourceId]);
          delete pollTimers.current[sourceId];
          setSyncing((s) => ({ ...s, [sourceId]: false }));
          await fetchStatus();
        }
      } catch { /* keep polling */ }
    }, 3000);
  };

  const runSync = async (source: SourceInfo) => {
    if (!source.apiEndpoint) return;
    const id = source.id;
    setSyncing((s) => ({ ...s, [id]: true }));
    setResults((r) => ({ ...r, [id]: {} }));
    setJobs((j) => { const n = { ...j }; delete n[id]; return n; });

    const data = await safeFetch(source.apiEndpoint, { method: "POST" });

    if (source.isAsync && data.jobId) {
      setJobs((j) => ({
        ...j,
        [id]: {
          jobId: data.jobId!,
          source: id,
          status: "RUNNING",
          total: data.total ?? 0,
          processed: 0,
          successCount: 0,
          failedCount: 0,
          errorMessage: null,
          pct: 0,
        },
      }));
      startPoll(data.jobId!, id);
    } else {
      setResults((r) => ({ ...r, [id]: data }));
      setSyncing((s) => ({ ...s, [id]: false }));
      if (!source.isAsync) await fetchStatus();
    }
  };

  const runAll = async () => {
    if (!data) return;
    for (const src of data.sources) {
      if (src.apiEndpoint) {
        await runSync(src);
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const sum = data?.summary;
  const temp = sum ? TEMP_CFG[sum.marketTemperature] ?? TEMP_CFG.COLD : null;
  const anySyncing = Object.values(syncing).some(Boolean);

  return (
    <div className="p-4 md:p-6 max-w-6xl">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">数据同步中心</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            TOHOSHOU AI v7.7 · 全数据源权威状态 · 手动同步控制
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => fetchStatus()}
            disabled={loading}
            className="text-sm px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
          >
            {loading ? "刷新中…" : "↺ 刷新状态"}
          </button>
          <button
            onClick={runAll}
            disabled={anySyncing || !data}
            className="text-sm px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-300 font-medium transition-colors"
          >
            {anySyncing ? <span className="animate-pulse">同步中…</span> : "▶ 全部同步"}
          </button>
        </div>
      </div>

      {/* ── Summary banner ── */}
      {sum && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 mb-6">
          {/* Health */}
          <div className="col-span-2 sm:col-span-1 bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="text-xs text-slate-500 mb-1">数据源健康</div>
            <div className="flex gap-2 items-baseline flex-wrap">
              <span className="text-lg font-bold text-green-600">{sum.realCount} REAL</span>
              {sum.partialCount > 0 && <span className="text-sm text-amber-600">{sum.partialCount}部分</span>}
              {sum.fallbackCount > 0 && <span className="text-sm text-slate-500">{sum.fallbackCount}降级</span>}
              {sum.failedCount > 0 && <span className="text-sm text-red-600">{sum.failedCount}失败</span>}
            </div>
          </div>
          {/* Last score */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="text-xs text-slate-500 mb-1">最后评分</div>
            <div className="text-sm font-bold text-slate-800 leading-tight">
              {sum.lastScoreComputedAt
                ? dayjs(sum.lastScoreComputedAt).format("M/D HH:mm")
                : "—"}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">JST</div>
          </div>
          {/* StockScore */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="text-xs text-slate-500 mb-1">StockScore</div>
            <div className="text-lg font-bold text-slate-800 tabular-nums">{sum.stockScoreTotal.toLocaleString()}</div>
            <div className="text-xs text-slate-400">只已评分</div>
          </div>
          {/* TDnet */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="text-xs text-slate-500 mb-1">TDnet 披露</div>
            <div className="text-lg font-bold text-slate-800 tabular-nums">{sum.disclosureTotal.toLocaleString()}</div>
            <div className="text-xs text-slate-400">{sum.disclosureCoveredSymbols}只覆盖</div>
          </div>
          {/* BUY count */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="text-xs text-slate-500 mb-1">BUY 评级</div>
            <div className="text-lg font-bold text-emerald-600 tabular-nums">{sum.buyCount}</div>
            <div className="text-xs text-slate-400">STRONG: {sum.strongBuyCount}</div>
          </div>
          {/* Bull rate */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="text-xs text-slate-500 mb-1">买入占比</div>
            <div className="text-lg font-bold text-slate-800 tabular-nums">{sum.bullRate.toFixed(1)}%</div>
            <div className="text-xs text-slate-400">BUY+STRONG_BUY</div>
          </div>
          {/* Market temp */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="text-xs text-slate-500 mb-1">市场温度</div>
            <div className={`text-base font-bold ${temp?.color ?? "text-slate-600"}`}>
              {temp?.emoji} {temp?.label ?? sum.marketTemperature}
            </div>
          </div>
        </div>
      )}

      {/* ── Source cards ── */}
      {loading && !data && (
        <div className="text-center py-16 text-slate-400">加载中…</div>
      )}

      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {data.sources.map((src) => {
            const isSyncing = syncing[src.id];
            const result = results[src.id];
            const job = jobs[src.id];
            const cfg = STATUS_CFG[src.status];

            return (
              <div
                key={src.id}
                className={`bg-white rounded-xl border shadow-sm overflow-hidden ${
                  src.status === "FAILED" || src.status === "NEVER_SYNCED"
                    ? "border-red-200"
                    : src.status === "STALE" || src.status === "PARTIAL"
                    ? "border-amber-200"
                    : src.id === "tdnet"
                    ? "border-green-300"
                    : "border-slate-200"
                }`}
              >
                <div className="p-5">
                  {/* Card header */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span className="text-lg shrink-0 mt-0.5">{src.icon}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <h3 className="font-semibold text-slate-900 text-sm">{src.taskName}</h3>
                          <SyncBadge status={src.status} />
                          {src.isAsync && (
                            <span className="text-xs text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">异步</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 leading-snug">{src.description}</p>
                      </div>
                    </div>

                    {/* Sync button */}
                    {src.apiEndpoint ? (
                      <button
                        onClick={() => runSync(src)}
                        disabled={isSyncing}
                        className="shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white transition-colors"
                      >
                        {isSyncing ? <span className="animate-pulse">同步中</span> : "立即同步"}
                      </button>
                    ) : (
                      <span className="shrink-0 text-xs text-slate-400 bg-slate-50 px-2.5 py-1.5 rounded-lg">
                        仅 Cron
                      </span>
                    )}
                  </div>

                  {/* Stats row */}
                  <div className="flex flex-wrap gap-x-5 gap-y-2 mb-3">
                    <Stat label="总量" value={src.totalCount} sub="条" />
                    {src.coveredSymbols != null && (
                      <Stat label="覆盖股票" value={src.coveredSymbols} sub="只" />
                    )}
                    {src.latestDate && (
                      <Stat label="最新数据" value={src.latestDate} />
                    )}
                    {src.ageDays != null && (
                      <Stat label="距今" value={`${src.ageDays}天`} />
                    )}
                    {src.rowsInserted != null && (
                      <Stat label="上次写入" value={src.rowsInserted} sub="条" />
                    )}
                  </div>

                  {/* Extra stats for compute_scores */}
                  {src.id === "compute_scores" && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-xs text-slate-500">
                      <span className="text-emerald-700 font-medium">BUY {String(src.extra.buy)}</span>
                      <span className="text-slate-600">HOLD {String(src.extra.hold)}</span>
                      <span className="text-slate-500">WATCH {String(src.extra.watch)}</span>
                      <span className="text-slate-400">AVOID {String(src.extra.avoid)}</span>
                      <span className={`font-medium ${
                        String(src.extra.marketTemperature) === "HOT" ? "text-red-600"
                        : String(src.extra.marketTemperature) === "WARM" ? "text-orange-500"
                        : String(src.extra.marketTemperature) === "COLD" ? "text-sky-500"
                        : "text-slate-600"
                      }`}>
                        {TEMP_CFG[String(src.extra.marketTemperature)]?.emoji ?? ""}
                        {String(src.extra.marketTemperature)}
                      </span>
                    </div>
                  )}

                  {/* Extra stats for global_market */}
                  {src.id === "global_market" && src.extra.vix != null && (
                    <div className="flex gap-4 mb-3 text-xs text-slate-500">
                      <span>VIX {Number(src.extra.vix).toFixed(1)}</span>
                      {src.extra.nasdaqChange != null && (
                        <span className={Number(src.extra.nasdaqChange) >= 0 ? "text-green-600" : "text-red-600"}>
                          NASDAQ {Number(src.extra.nasdaqChange) >= 0 ? "+" : ""}{Number(src.extra.nasdaqChange).toFixed(2)}%
                        </span>
                      )}
                      {src.extra.score != null && (
                        <span>全球分 {String(src.extra.score)}/10</span>
                      )}
                    </div>
                  )}

                  {/* Extra stats for line_gpt */}
                  {src.id === "line_gpt" && (
                    <div className="flex gap-4 mb-3 text-xs">
                      <span className={src.extra.lineConfigured ? "text-green-600" : "text-red-500"}>
                        {src.extra.lineConfigured ? "✅ LINE 已配置" : "✗ LINE 未配置"}
                      </span>
                      <span className={src.extra.gptConfigured ? "text-green-600" : "text-red-500"}>
                        {src.extra.gptConfigured ? "✅ GPT 已配置" : "✗ GPT 未配置"}
                      </span>
                    </div>
                  )}

                  {/* Last sync + next cron */}
                  <div className="flex items-center justify-between text-xs text-slate-400 border-t border-slate-50 pt-2.5 mt-1">
                    <span>
                      上次:{" "}
                      {src.lastSyncedAt
                        ? dayjs(src.lastSyncedAt).format("M/D HH:mm")
                        : "—"}
                    </span>
                    <span className="text-slate-300">|</span>
                    <span>Cron: {src.nextCron}</span>
                  </div>

                  {/* Error message */}
                  {src.errorMessage && !job && !result && (
                    <div className="mt-2.5 text-xs text-amber-700 bg-amber-50 rounded p-2 leading-relaxed">
                      ⚠ {src.errorMessage}
                    </div>
                  )}

                  {/* Job progress */}
                  {job && <JobProgressPanel job={job} />}

                  {/* Sync result */}
                  {!job && result && Object.keys(result).length > 0 && (
                    <ResultPanel result={result} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Cron schedule ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
          <h2 className="font-semibold text-slate-900 text-sm">Cron 自动调度</h2>
          <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full font-medium">
            ✅ 自动运行中（PM2: tohoshou-cron）
          </span>
        </div>
        <div className="divide-y divide-slate-50">
          {CRON_SCHEDULE.map(({ time, task }) => (
            <div key={time} className="flex items-center gap-4 px-5 py-2.5 hover:bg-slate-50">
              <span className="text-xs font-mono text-slate-500 w-36 shrink-0">{time}</span>
              <span className="text-sm text-slate-700">{task}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Recent logs ── */}
      {data?.recentLogs && data.recentLogs.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100">
            <h2 className="font-semibold text-slate-900 text-sm">同步日志（近20条）</h2>
          </div>
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-slate-400 bg-slate-50 border-b border-slate-100">
                <th className="px-5 py-2.5 font-medium">时间</th>
                <th className="px-3 py-2.5 font-medium">任务</th>
                <th className="px-3 py-2.5 font-medium">状态</th>
                <th className="px-3 py-2.5 font-medium text-right">写入</th>
                <th className="px-3 py-2.5 font-medium text-right">耗时</th>
                <th className="px-3 py-2.5 font-medium hidden lg:table-cell">说明</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {data.recentLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="px-5 py-2.5 text-xs text-slate-500 tabular-nums">
                    {dayjs(log.createdAt).format("M/D HH:mm:ss")}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-xs font-mono text-slate-700">{log.source}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`text-xs font-medium ${
                      log.status === "SUCCESS" ? "text-green-600"
                      : log.status === "PARTIAL" ? "text-amber-600"
                      : "text-red-600"
                    }`}>
                      {log.status === "SUCCESS" ? "✓ 成功"
                       : log.status === "PARTIAL" ? "⚠ 部分"
                       : "✗ 失败"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs text-slate-600 tabular-nums">
                    {log.itemCount.toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs text-slate-400 tabular-nums">
                    {log.durationMs ? `${(log.durationMs / 1000).toFixed(1)}s` : "—"}
                  </td>
                  <td className="px-3 py-2.5 hidden lg:table-cell">
                    <span className="text-xs text-slate-400 truncate block max-w-xs">
                      {log.message?.slice(0, 80) ?? ""}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
