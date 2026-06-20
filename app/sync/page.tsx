"use client";

import { useEffect, useRef, useState } from "react";
import dayjs from "dayjs";

type SyncStatus = {
  configured: { yahoo: boolean; jquants: boolean; tdnet: boolean; news: boolean };
  jquantsMethod?: string;
  counts: {
    dailyPrices: number;
    disclosures: number;
    dividends: number;
    syncedStocks: number;
    news: number;
  };
  lastSync: {
    yahoo: SyncLog | null;
    jquants: SyncLog | null;
    tdnet: SyncLog | null;
    news: SyncLog | null;
  };
  recentLogs: SyncLog[];
};

type SyncLog = {
  id: number;
  source: string;
  status: string;
  message: string | null;
  itemCount: number;
  durationMs: number | null;
  createdAt: string;
};

type SyncResult = {
  success?: boolean;
  source?: string;
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
  status?: string;
  skipped?: string;
  // async job fields
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

const sourceConfig = {
  yahoo: {
    label: "Yahoo Finance Japan",
    description: "股价・指标（Top 300 已评分股票，仅同步当前报价）",
    icon: "◉",
    color: "text-blue-600",
    note: "无需API密钥 / 即可使用",
  },
  news: {
    label: "新闻同步",
    description: "Yahoo Finance Japan 新闻・情绪分析（Top 200，每日4次自动同步）",
    icon: "◍",
    color: "text-rose-600",
    note: "同步 Top 200 评分股票的最新新闻 / 自动情绪分类",
  },
  jquants: {
    label: "J-Quants (JPX)",
    description: "日线价格・财务数据（Top 200 已评分股票，近90天）",
    icon: "◈",
    color: "text-emerald-600",
    note: "需注册: jpx-jquants.com | 环境变量: JQUANTS_EMAIL + JQUANTS_PASSWORD 或 JQUANTS_API_KEY",
    docUrl: "https://jpx-jquants.com/",
  },
  tdnet: {
    label: "TDnet 适时披露",
    description: "财报・业绩修正・回购・股息变更",
    icon: "◎",
    color: "text-purple-600",
    note: "爬虫抓取方式 / 失败时使用样本数据",
  },
} as const;

type Source = keyof typeof sourceConfig;

async function safeFetchJson(url: string, init?: RequestInit): Promise<SyncResult> {
  const res = await fetch(url, init);
  const text = await res.text();
  if (!text) return { success: false, error: `空响应 (HTTP ${res.status})` };
  let data: SyncResult;
  try {
    data = JSON.parse(text);
  } catch {
    return { success: false, error: `非JSON响应 (HTTP ${res.status}): ${text.slice(0, 300)}` };
  }
  if (!res.ok && !data.error) {
    data.error = data.message ?? data.detail ?? `HTTP ${res.status}`;
    data.success = false;
  }
  return data;
}

export default function SyncPage() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, SyncResult>>({});
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/sync", { cache: "no-store" });
      const text = await res.text();
      if (text) setStatus(JSON.parse(text));
    } catch (e) {
      console.error("fetchStatus failed:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    return () => { if (pollTimer.current) clearInterval(pollTimer.current); };
  }, []);

  // Poll job progress for jquants async jobs
  const startPolling = (jobId: string) => {
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/sync/jobs/${jobId}`, { cache: "no-store" });
        const job: JobStatus = await res.json();
        setJobStatus(job);
        if (job.status === "SUCCESS" || job.status === "FAILED") {
          clearInterval(pollTimer.current!);
          pollTimer.current = null;
          setSyncing((s) => ({ ...s, jquants: false }));
          await fetchStatus();
        }
      } catch {
        // keep polling
      }
    }, 3000);
  };

  const runSync = async (source: string) => {
    setSyncing((s) => ({ ...s, [source]: true }));
    setResults((r) => ({ ...r, [source]: {} }));
    if (source === "jquants") setJobStatus(null);

    const url = source === "all" ? "/api/sync" : `/api/sync/${source}`;
    try {
      const data = await safeFetchJson(url, { method: "POST" });
      if (source === "all") {
        const r = (data as Record<string, unknown>).results;
        setResults((prev) => ({
          ...prev,
          all: typeof r === "object" && r ? (r as SyncResult) : data,
        }));
        setSyncing((s) => ({ ...s, all: false }));
      } else if (source === "jquants" && data.jobId) {
        // Async job — start polling
        setJobStatus({
          jobId: data.jobId,
          source: "jquants",
          status: "RUNNING",
          total: data.total ?? 0,
          processed: 0,
          successCount: 0,
          failedCount: 0,
          errorMessage: null,
          pct: 0,
        });
        startPolling(data.jobId);
        // Don't clear syncing here — polling will clear it when done
      } else {
        setResults((r) => ({ ...r, [source]: data }));
        setSyncing((s) => ({ ...s, [source]: false }));
      }
    } catch (e) {
      setResults((r) => ({ ...r, [source]: { success: false, error: (e as Error).message } }));
      setSyncing((s) => ({ ...s, [source]: false }));
    }

    if (source !== "jquants") await fetchStatus();
  };

  const StatusDot = ({ ok }: { ok: boolean }) => (
    <span className={`w-2 h-2 rounded-full inline-block ${ok ? "bg-green-500" : "bg-slate-300"}`} />
  );

  const statusLabel = (log: SyncLog | null) => {
    if (!log) return <span className="text-slate-400 text-xs">从未同步</span>;
    const color =
      log.status === "SUCCESS" ? "text-green-600"
      : log.status === "PARTIAL" ? "text-amber-600"
      : "text-red-600";
    const statusMap: Record<string, string> = { SUCCESS: "成功", PARTIAL: "部分", FAILED: "失败", ERROR: "失败" };
    return (
      <span className={`text-xs font-medium ${color}`}>
        {statusMap[log.status] ?? log.status} · {log.itemCount}条 · {dayjs(log.createdAt).format("M/D HH:mm")}
      </span>
    );
  };

  // Progress panel for async jquants job
  const JobProgressPanel = ({ job }: { job: JobStatus }) => {
    const isDone = job.status === "SUCCESS" || job.status === "FAILED";
    const isSuccess = job.status === "SUCCESS";
    const bgColor = isSuccess ? "bg-green-50" : isDone ? "bg-red-50" : "bg-blue-50";
    const textColor = isSuccess ? "text-green-700" : isDone ? "text-red-700" : "text-blue-700";
    const barColor = isSuccess ? "bg-green-500" : isDone ? "bg-red-500" : "bg-blue-500";

    return (
      <div className="mt-4 pt-4 border-t border-slate-100">
        <div className={`text-sm rounded-lg p-3 ${bgColor} ${textColor}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium">
              {isSuccess ? "✓ 同步完成" : isDone ? "✗ 同步失败" : "⟳ 同步中…"}
            </span>
            <span className="text-xs tabular-nums">
              {job.processed} / {job.total} 只
              {isDone && job.failedCount > 0 && ` (失败 ${job.failedCount})`}
            </span>
          </div>
          <div className="w-full bg-white/60 rounded-full h-2 overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${barColor}`}
              style={{ width: `${job.pct}%` }}
            />
          </div>
          <div className="text-xs mt-1.5 opacity-70">
            {isDone
              ? `成功 ${job.successCount} 只${job.failedCount > 0 ? `，失败 ${job.failedCount} 只` : ""}`
              : `已完成 ${job.pct}%，每3秒更新…`}
          </div>
          {job.errorMessage && (
            <div className="text-xs mt-1 opacity-80">{job.errorMessage}</div>
          )}
        </div>
      </div>
    );
  };

  const ResultPanel = ({ result }: { result: SyncResult }) => {
    if (!result || Object.keys(result).length === 0) return null;

    if (result.success === false || (result.error && !result.success)) {
      return (
        <div className="mt-4 pt-4 border-t border-slate-100">
          <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3">
            <div className="font-medium mb-1">✗ 同步失败</div>
            <div>{result.error}</div>
            {result.detail && <div className="text-xs text-red-500 mt-1 font-mono">{result.detail}</div>}
            {result.hint  && <div className="text-xs text-amber-600 mt-1">{result.hint}</div>}
          </div>
        </div>
      );
    }

    if (result.skipped) {
      return (
        <div className="mt-4 pt-4 border-t border-slate-100">
          <div className="text-sm text-slate-400 bg-slate-50 rounded-lg p-3">— 已跳过: {result.skipped}</div>
        </div>
      );
    }

    if (result.success === true) {
      const count = result.count ?? result.synced ?? 0;
      const ms = result.durationMs ?? 0;
      const isPartial = (result.errors ?? 0) > 0;
      return (
        <div className="mt-4 pt-4 border-t border-slate-100">
          <div className={`text-sm rounded-lg p-3 ${isPartial ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"}`}>
            <div className="font-medium mb-1">
              {isPartial ? "⚠ 部分成功" : "✓ 同步成功"} · 同步{count}条 · 耗时{(ms / 1000).toFixed(1)}s
            </div>
            {result.syncedAt && (
              <div className="text-xs opacity-70">同步时间: {dayjs(result.syncedAt).format("YYYY/M/D HH:mm:ss")}</div>
            )}
            {result.log && result.log.length > 0 && (
              <div className="text-xs space-y-0.5 max-h-28 overflow-y-auto mt-2 font-mono opacity-80">
                {result.log.slice(0, 20).map((l, i) => <div key={i}>{l}</div>)}
              </div>
            )}
          </div>
        </div>
      );
    }

    if (result.status) {
      const count = result.synced ?? result.count ?? 0;
      return (
        <div className="mt-4 pt-4 border-t border-slate-100">
          <div className={`text-sm rounded-lg p-3 ${
            result.status === "SUCCESS" ? "bg-green-50 text-green-700"
            : result.status === "PARTIAL" ? "bg-amber-50 text-amber-700"
            : "bg-red-50 text-red-700"
          }`}>
            <div className="font-medium mb-1">
              {result.status} · 同步{count}条 · 耗时{(result.durationMs ?? 0) / 1000 | 0}s
            </div>
            {result.log && (
              <div className="text-xs space-y-0.5 max-h-28 overflow-y-auto mt-1 font-mono opacity-80">
                {result.log.slice(0, 20).map((l, i) => <div key={i}>{l}</div>)}
              </div>
            )}
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">数据同步</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Yahoo Finance / J-Quants / TDnet / 新闻 数据同步管理
          </p>
        </div>
        <button
          onClick={() => runSync("all")}
          disabled={Object.values(syncing).some(Boolean)}
          className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white text-sm px-4 py-2 rounded-lg font-medium transition-colors"
        >
          {syncing.all ? (
            <><span className="animate-spin">◌</span> 同步中...</>
          ) : (
            "▶ 全部同步"
          )}
        </button>
      </div>

      {status && (
        <div className="grid grid-cols-5 gap-3 mb-6">
          {[
            { label: "日线价格",   value: status.counts.dailyPrices,  unit: "条" },
            { label: "披露信息",   value: status.counts.disclosures,  unit: "条" },
            { label: "分红数据",   value: status.counts.dividends,    unit: "条" },
            { label: "已同步股票", value: status.counts.syncedStocks, unit: "只" },
            { label: "新闻条数",   value: status.counts.news ?? 0,    unit: "条" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <div className="text-xs text-slate-500 mb-1">{s.label}</div>
              <div className="text-xl font-bold text-slate-900 tabular-nums">
                {s.value.toLocaleString()}
                <span className="text-sm font-normal text-slate-400 ml-1">{s.unit}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-4">
        {(Object.keys(sourceConfig) as Source[]).map((source) => {
          const cfg = sourceConfig[source];
          const isConfigured = status?.configured[source] ?? false;
          const lastLog = status?.lastSync[source] ?? null;
          const isSyncing = syncing[source];
          const result = results[source];

          const jqMethod = source === "jquants" ? status?.jquantsMethod : null;
          const jqNote = jqMethod
            ? jqMethod.includes("api_key")
              ? "✅ 已配置：API Key 模式"
              : jqMethod.includes("email")
              ? "✅ 已配置：Email + Password 模式"
              : jqMethod.includes("refresh")
              ? "✅ 已配置：Refresh Token 模式"
              : cfg.note
            : cfg.note;

          return (
            <div key={source} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span className={`text-xl ${cfg.color} mt-0.5`}>{cfg.icon}</span>
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="font-semibold text-slate-900">{cfg.label}</h3>
                        <StatusDot ok={isConfigured} />
                        {!isConfigured && (
                          <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                            未配置
                          </span>
                        )}
                        {source === "jquants" && (
                          <span className="text-xs text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">
                            异步任务
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-500">{cfg.description}</p>
                      <p className={`text-xs mt-0.5 ${isConfigured && jqMethod ? "text-green-600" : "text-slate-400"}`}>
                        {source === "jquants" ? jqNote : cfg.note}
                      </p>
                      {"docUrl" in cfg && !isConfigured && (
                        <a
                          href={(cfg as { docUrl: string }).docUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline"
                        >
                          注册页面 →
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <div>{statusLabel(lastLog)}</div>
                    <button
                      onClick={() => runSync(source)}
                      disabled={isSyncing || (!isConfigured && source !== "yahoo" && source !== "news" && source !== "tdnet")}
                      className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${
                        isConfigured
                          ? "bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white"
                          : "bg-slate-100 text-slate-400 cursor-not-allowed"
                      }`}
                    >
                      {isSyncing ? (
                        <><span className="animate-spin">◌</span> 同步中</>
                      ) : (
                        "立即同步"
                      )}
                    </button>
                  </div>
                </div>

                {/* J-Quants: show async job progress */}
                {source === "jquants" && jobStatus && !loading && (
                  <JobProgressPanel job={jobStatus} />
                )}

                {/* Other sources: show result panel */}
                {source !== "jquants" && !loading && result && (
                  <ResultPanel result={result} />
                )}

                {/* J-Quants error (non-job errors like not configured) */}
                {source === "jquants" && !jobStatus && !loading && result && (
                  <ResultPanel result={result} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {status?.recentLogs && status.recentLogs.length > 0 && (
        <div className="mt-6 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100">
            <h2 className="font-semibold text-slate-900 text-sm">同步日志（近10条）</h2>
          </div>
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-slate-100 bg-slate-50">
                <th className="px-5 py-2.5 font-medium">时间</th>
                <th className="px-3 py-2.5 font-medium">来源</th>
                <th className="px-3 py-2.5 font-medium">状态</th>
                <th className="px-3 py-2.5 font-medium text-right">数量</th>
                <th className="px-3 py-2.5 font-medium text-right">耗时</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {status.recentLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="px-5 py-2.5 text-xs text-slate-500">
                    {dayjs(log.createdAt).format("YYYY/M/D HH:mm")}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-xs font-medium text-slate-700 uppercase">{log.source}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`text-xs font-medium ${
                      log.status === "SUCCESS" ? "text-green-600"
                      : log.status === "PARTIAL" ? "text-amber-600"
                      : "text-red-600"
                    }`}>
                      {log.status === "SUCCESS" ? "成功" : log.status === "PARTIAL" ? "部分" : "失败"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-xs text-slate-600">
                    {log.itemCount}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-xs text-slate-500">
                    {log.durationMs ? `${(log.durationMs / 1000).toFixed(1)}s` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 bg-slate-900 rounded-xl p-5 text-slate-300 text-sm">
        <div className="font-semibold text-white mb-3">⚙ .env 配置说明</div>
        <pre className="text-xs leading-relaxed text-slate-400 overflow-x-auto">{`# J-Quants (JPX官方数据) - https://jpx-jquants.com/
JQUANTS_EMAIL=your@email.com
JQUANTS_PASSWORD=your_password
# 或者使用 Refresh Token
JQUANTS_REFRESH_TOKEN=your_refresh_token
# 或者使用 API Key (V2 兼容)
JQUANTS_API_KEY=your_api_key

# AI 分析 (DeepSeek / OpenAI)
OPENAI_BASE_URL=https://api.deepseek.com
OPENAI_API_KEY=sk-deepseek-...
AI_MODEL=deepseek-chat`}</pre>
      </div>
    </div>
  );
}
