"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";
import { useI18n } from "@/lib/i18n";

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

type HealthStatus = {
  status: "PASS" | "WARNING" | "CRITICAL" | "NEVER_RUN" | "ERROR";
  auditAt?: string;
  criticalCount?: number;
  warningCount?: number;
  infoCount?: number;
  passCount?: number;
  allowRecommendation?: boolean;
  requiresReview?: boolean;
  topIssues?: string[];
  reportFile?: string;
  latestPriceDate?: string;
  adjCoveragePct?: number;
  message?: string;
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
  { time: "16:30 JST", task: "InstitutionalFlow（J-Quants，每周五）" },
  { time: "18:30 JST", task: "空売り比率（JPX PDF，工作日）" },
  { time: "22:00 JST", task: "Stock Master 元数据同步（每日）" },
  { time: "22:30 JST", task: "配当历史（J-Quants fins/summary，每日）" },
];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SyncPage() {
  const { t, lang } = useI18n();
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, SyncResult>>({});
  const [jobs, setJobs] = useState<Record<string, JobStatus>>({});
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const pollTimers = useRef<Record<string, ReturnType<typeof setInterval>>>({});
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

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

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/health/status", { cache: "no-store" });
      const json = await res.json() as HealthStatus;
      setHealth(json);
    } catch { /* non-critical */ }
  }, []);

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([fetchStatus(), fetchHealth()]);
      setRefreshedAt(new Date());
      const msg = lang === "ja-JP" ? "状態を更新しました" : "状态已刷新";
      showToast(msg, true);
    } catch {
      const msg = lang === "ja-JP" ? "更新に失敗しました" : "刷新失败，请稍后重试";
      showToast(msg, false);
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, fetchStatus, fetchHealth, lang]);

  useEffect(() => {
    fetchStatus();
    fetchHealth();
    return () => {
      for (const t of Object.values(pollTimers.current)) clearInterval(t);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [fetchStatus, fetchHealth]);

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
      {/* ── Toast ── */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium transition-all ${
          toast.ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.ok ? "✓" : "✗"} {toast.msg}
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("sync.title")}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            TOHOSHOU AI v10
            {refreshedAt && (
              <span className="ml-2 text-slate-400">
                · {lang === "ja-JP" ? "最終更新" : "最后刷新"}：
                {refreshedAt.toLocaleTimeString(lang === "ja-JP" ? "ja-JP" : "zh-CN")}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
          >
            <span className={refreshing ? "animate-spin inline-block" : ""}>↺</span>
            {refreshing
              ? (lang === "ja-JP" ? "更新中..." : "刷新中...")
              : t("sync.refresh")}
          </button>
          <button
            onClick={runAll}
            disabled={anySyncing || !data}
            className="text-sm px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-300 font-medium transition-colors"
          >
            {anySyncing ? <span className="animate-pulse">{t("sync.syncing")}</span> : t("sync.run_all")}
          </button>
        </div>
      </div>

      {/* ── Hero — Data Pipeline Center ─────────────────────────────────────── */}
      {sum && (() => {
        const total = data?.sources.length ?? 0;
        const healthy = sum.realCount;
        const hlCrit = health?.criticalCount ?? 0;
        const hlWarn = health?.warningCount ?? 0;
        const hlScore = Math.max(0, Math.min(100, 100 - hlCrit * 25 - hlWarn * 3));
        const scoreColor = hlCrit > 0 ? "#FF3B30" : hlScore >= 90 ? "#34C759" : "#FF9F0A";
        const cov = health?.adjCoveragePct ?? null;
        const cells = [
          { label: "数据源健康", value: `${healthy}/${total}`, unit: sum.failedCount > 0 ? `${sum.failedCount} 失败` : "全部 REAL", color: sum.failedCount > 0 ? "#FF3B30" : "#34C759" },
          { label: "Health Score", value: `${hlScore}`, unit: health?.status === "WARNING" ? "注意" : hlCrit > 0 ? "异常" : "Healthy", color: scoreColor },
          { label: "行情覆盖", value: cov != null ? `${cov}%` : "—", unit: "Coverage", color: cov != null && cov >= 95 ? "#34C759" : "#FF9F0A" },
          { label: "综合评分", value: sum.stockScoreTotal.toLocaleString(), unit: "只已评分", color: "#1D1D1F" },
          { label: "TDnet 披露", value: sum.disclosureTotal.toLocaleString(), unit: `${sum.disclosureCoveredSymbols} 只覆盖`, color: "#1D1D1F" },
          { label: "市场温度", value: temp?.label ?? sum.marketTemperature, unit: sum.lastScoreComputedAt ? `评分 ${dayjs(sum.lastScoreComputedAt).format("M/D HH:mm")}` : "—", color: "#1D1D1F" },
        ];
        return (
          <div className="dash-font mb-6">
            {/* Progress strip */}
            <div className="dash-card p-4 mb-4 flex items-center gap-4 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-2.5 py-1 rounded-full" style={{ color: sum.failedCount > 0 ? "#FF9F0A" : "#34C759", background: sum.failedCount > 0 ? "#FF9F0A14" : "#34C75914" }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: sum.failedCount > 0 ? "#FF9F0A" : "#34C759" }} />
                {healthy}/{total} {sum.failedCount > 0 ? "需关注" : "Healthy"}
              </span>
              <div className="flex-1 min-w-[160px] h-2 rounded-full overflow-hidden" style={{ background: "#EEEEF1" }}>
                <div className="h-full rounded-full" style={{ width: `${total ? (healthy / total) * 100 : 0}%`, background: "#34C759", transition: "width .5s ease" }} />
              </div>
              <span className="text-[12px] font-medium" style={{ color: "#86868B" }}>{total ? Math.round((healthy / total) * 100) : 0}% Data Ready</span>
            </div>
            {/* Stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {cells.map((c) => (
                <div key={c.label} className="dash-card p-5">
                  <div className="text-[11px] font-medium" style={{ color: "#86868B" }}>{c.label}</div>
                  <div className="text-[22px] font-semibold tabular-nums tracking-[-0.01em] leading-tight mt-2" style={{ color: c.color }}>{c.value}</div>
                  <div className="text-[11px] font-medium mt-1" style={{ color: "#6E6E73" }}>{c.unit}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── Data Health card ── */}
      {health && (() => {
        const s = health.status;
        const isCrit = s === "CRITICAL";
        const isPass = s === "PASS";
        const color = isCrit ? "#FF3B30" : isPass ? "#34C759" : "#FF9F0A";
        return (
          <details className="dash-card dash-font mb-6" style={{ borderColor: `${color}33` }}>
            <summary className="flex items-center gap-3 p-4 cursor-pointer" style={{ listStyle: "none" }}>
              <span className="text-[15px]" style={{ color }}>{isPass ? "✓" : "⚠"}</span>
              <span className="text-[14px] font-semibold" style={{ color: "#1D1D1F" }}>
                {isPass ? "数据健康守卫 · 全部通过" : `数据健康守卫 · ${health.warningCount ?? 0} Warning`}
              </span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ color, background: `${color}14` }}>
                {isCrit ? `CRITICAL ${health.criticalCount}` : "No Blocking"}
              </span>
              {health.allowRecommendation && <span className="text-[11px] font-medium" style={{ color: "#34C759" }}>AI 推荐已允许</span>}
              <span className="ml-auto text-[11px] tabular-nums" style={{ color: "#86868B" }}>
                {health.auditAt ? dayjs(health.auditAt).format("M/D HH:mm") : ""} · adjClose {health.adjCoveragePct?.toFixed(0) ?? "—"}%
              </span>
              <span className="text-[11px]" style={{ color: "#86868B" }}>▾</span>
            </summary>
            {health.topIssues && health.topIssues.length > 0 && (
              <div className="px-4 pb-4 text-[12px] space-y-1" style={{ color: "#6E6E73" }}>
                {health.topIssues.map((issue, i) => <div key={i}>• {issue}</div>)}
              </div>
            )}
          </details>
        );
      })()}

      {/* ── Source cards ── */}
      {loading && !data && (
        <div className="text-center py-16 text-slate-400">{t("common.loading")}</div>
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
                className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${
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
