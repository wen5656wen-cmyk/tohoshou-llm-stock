"use client";

// ── /admin/runtime · Runtime Reliability（P5.5 稳定化）───────────────────────
// 只读展示：Runtime Reliability 30 天趋势 / Pipeline Timeline / GPT Runtime。
// 数据来自 /api/admin/runtime（聚合日志/报告文件，不查 DB、不改任何数据）。

import { useEffect, useState } from "react";
import {
  AppHeader, AppCard, AppKpiCard, AppKpiGrid, AppTable, AppTh, AppTd,
  AppStatusChip, AppLoading, AppEmptyState, appRowHover, COLORS,
} from "@/components/ui";

type Rel = { date: string; status: "PASS" | "WARNING" | "FAILED"; critical: number; warning: number; runs: number };
type Gpt = { date: string; model: string | null; calls: number; ok: number; fail: number; retries: number; err429: number; quota: number; tokens: number; runs: number; quotaExhausted: boolean };
type Phase = { phase: string; label: string; source: string; startedAt: string; finishedAt: string; durationMs: number; status: string };
type Data = {
  today: string;
  reliability: Rel[];
  reliabilitySummary: { passDays: number; warnDays: number; failDays: number; totalDays: number; reliabilityScore: number };
  gpt: Gpt[];
  rerankRuns: { date: string; count: number }[];
  maxRerankPerDay: number;
  latestTimelineDate: string | null;
  latestTimeline: Phase[];
};

const REL_COLOR: Record<string, string> = { PASS: COLORS.success, WARNING: COLORS.warning, FAILED: COLORS.danger };

function hhmm(iso: string): string {
  try { return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); } catch { return "—"; }
}
function dur(ms: number): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${s % 60}s`;
}

export default function RuntimePage() {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/runtime").then((r) => r.json()).then(setData).catch((e) => setErr(String(e)));
  }, []);

  if (err) return <Shell><AppEmptyState title="加载失败" desc={err} /></Shell>;
  if (!data) return <Shell><AppLoading label="加载 Runtime 数据…" /></Shell>;

  const s = data.reliabilitySummary;
  const rerankOk = data.maxRerankPerDay <= 1;

  return (
    <Shell>
      <AppHeader
        title="Runtime Reliability"
        titleEn="运行可靠性"
        subtitle="流水线执行 / GPT 运行 / 健康趋势 的只读观测 · 数据来自日志与报告文件，不查 DB"
        status={`可靠性 ${s.reliabilityScore}`}
        statusTone={s.reliabilityScore >= 90 ? "green" : s.reliabilityScore >= 75 ? "amber" : "red"}
      />

      {/* KPI */}
      <AppKpiGrid>
        <AppKpiCard label="Runtime 可靠性" value={`${s.reliabilityScore}`} tone={s.reliabilityScore >= 90 ? "green" : "amber"} sub={`最近 ${s.totalDays} 天`} />
        <AppKpiCard label="PASS 天数" value={s.passDays} tone="green" />
        <AppKpiCard label="WARNING 天数" value={s.warnDays} tone="amber" />
        <AppKpiCard label="FAILED 天数" value={s.failDays} tone={s.failDays > 0 ? "red" : "neutral"} />
        <AppKpiCard label="单日 Rerank 次数(峰值)" value={data.maxRerankPerDay || "—"} tone={rerankOk ? "green" : "red"} sub={rerankOk ? "无重复执行 ✓" : "存在重复!"} />
        <AppKpiCard label="GPT 记录天数" value={data.gpt.length} tone="blue" />
      </AppKpiGrid>

      {/* Reliability 趋势 */}
      <AppCard header={<span style={{ fontSize: 14, fontWeight: 600, color: COLORS.text }}>Runtime Reliability 趋势（最近 30 天 · PASS / WARNING / FAILED）</span>}>
        {data.reliability.length === 0 ? (
          <div style={{ fontSize: 13, color: COLORS.textMuted }}>暂无健康报告数据</div>
        ) : (
          <>
            <div className="flex items-end gap-1" style={{ height: 64 }}>
              {data.reliability.map((r) => (
                <div key={r.date} title={`${r.date} · ${r.status}${r.critical ? ` · CRIT ${r.critical}` : ""}${r.warning ? ` · WARN ${r.warning}` : ""}`}
                  style={{ flex: 1, minWidth: 6, height: r.status === "PASS" ? "100%" : r.status === "WARNING" ? "66%" : "40%", background: REL_COLOR[r.status], borderRadius: 3, alignSelf: "flex-end" }} />
              ))}
            </div>
            <div className="flex items-center gap-4 flex-wrap" style={{ marginTop: 12, fontSize: 12, color: COLORS.textSecondary }}>
              {(["PASS", "WARNING", "FAILED"] as const).map((k) => (
                <span key={k} className="inline-flex items-center gap-1.5">
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: REL_COLOR[k] }} />{k}
                </span>
              ))}
              <span style={{ color: COLORS.textFaint }}>{data.reliability[0]?.date} → {data.reliability[data.reliability.length - 1]?.date}</span>
            </div>
          </>
        )}
      </AppCard>

      {/* GPT Runtime */}
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, marginBottom: 10 }}>GPT Runtime（模型 / 调用 / 重试 / 429 / Quota / Token）</div>
        {data.gpt.length === 0 ? (
          <AppEmptyState title="暂无 GPT Runtime 记录" desc="自 P5.5 上线起，每次 GPT rerank 运行结束会写入一条汇总；下次流水线运行后此处将出现数据。" />
        ) : (
          <AppTable minWidth={760}>
            <thead><tr>
              <AppTh>日期</AppTh><AppTh>模型</AppTh><AppTh align="right">调用</AppTh><AppTh align="right">成功</AppTh>
              <AppTh align="right">重试</AppTh><AppTh align="right">429</AppTh><AppTh align="right">Quota</AppTh><AppTh align="right">Token</AppTh>
            </tr></thead>
            <tbody>
              {data.gpt.slice().reverse().map((g) => (
                <tr key={g.date} className={appRowHover}>
                  <AppTd mono>{g.date}</AppTd>
                  <AppTd color={COLORS.textSecondary}>{g.model ?? "—"}</AppTd>
                  <AppTd align="right" mono>{g.calls}</AppTd>
                  <AppTd align="right" mono color={COLORS.success}>{g.ok}</AppTd>
                  <AppTd align="right" mono>{g.retries}</AppTd>
                  <AppTd align="right" mono color={g.err429 > 0 ? COLORS.warning : COLORS.textMuted}>{g.err429}</AppTd>
                  <AppTd align="right" mono color={g.quota > 0 ? COLORS.danger : COLORS.textMuted}>{g.quota}</AppTd>
                  <AppTd align="right" mono>{g.tokens.toLocaleString()}</AppTd>
                </tr>
              ))}
            </tbody>
          </AppTable>
        )}
      </div>

      {/* Pipeline Timeline */}
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, marginBottom: 10 }}>
          Pipeline Timeline {data.latestTimelineDate ? `· ${data.latestTimelineDate}（JST）` : ""}
        </div>
        {data.latestTimeline.length === 0 ? (
          <AppEmptyState title="暂无 Pipeline Timeline" desc="自 P5.5 上线起，每个流水线阶段（Phase2 / fallback / cron）会记录开始/结束/耗时/状态；下次流水线运行后此处将出现完整时间线。" />
        ) : (
          <AppTable minWidth={720}>
            <thead><tr>
              <AppTh>阶段</AppTh><AppTh>来源</AppTh><AppTh>开始</AppTh><AppTh>结束</AppTh><AppTh align="right">耗时</AppTh><AppTh>状态</AppTh>
            </tr></thead>
            <tbody>
              {data.latestTimeline.map((p, i) => (
                <tr key={p.phase + i} className={appRowHover}>
                  <AppTd><span style={{ fontWeight: 600 }}>{p.phase}</span></AppTd>
                  <AppTd color={COLORS.textMuted}>{p.source}</AppTd>
                  <AppTd mono>{hhmm(p.startedAt)}</AppTd>
                  <AppTd mono>{hhmm(p.finishedAt)}</AppTd>
                  <AppTd align="right" mono>{dur(p.durationMs)}</AppTd>
                  <AppTd>
                    <AppStatusChip
                      kind={p.status === "SUCCESS" ? "SUCCESS" : p.status === "SKIPPED" ? "INFO" : "ERROR"}
                      label={p.status === "SKIPPED" ? "跳过(已完成)" : p.status === "SUCCESS" ? "成功" : "失败"}
                    />
                  </AppTd>
                </tr>
              ))}
            </tbody>
          </AppTable>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: COLORS.background }}>
      <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-8 space-y-6">{children}</div>
    </div>
  );
}
