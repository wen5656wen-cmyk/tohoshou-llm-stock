// GET /api/admin/runtime — Runtime 可观测性（P5.5）
// 只读聚合服务器日志/报告文件，**不查 DB、不改任何数据**：
//   logs/pipeline-phases-<date>.jsonl  → Pipeline Timeline（per-phase 开始/结束/耗时/状态）
//   logs/gpt-runtime-<date>.jsonl      → GPT Runtime（model/token/retry/429/quota）
//   reports/data-health-guard-*.json   → Runtime Reliability 30 天趋势（PASS/WARNING/FAILED）
//   logs/pipeline-phases 的 rerank 记录 → rerank 单日执行次数（R3 去重验证）

import { NextResponse } from "next/server";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

const LOG_DIR = join(process.cwd(), "logs");
const REPORT_DIR = join(process.cwd(), "reports");

function jstDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function last30Dates(): string[] {
  const out: string[] = [];
  const now = Date.now();
  for (let i = 0; i < 30; i++) out.push(jstDate(new Date(now - i * 86400_000)));
  return out.reverse();
}
function readJsonl(file: string): Record<string, unknown>[] {
  try {
    if (!existsSync(file)) return [];
    return readFileSync(file, "utf-8").trim().split("\n").filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter((x): x is Record<string, unknown> => x !== null);
  } catch { return []; }
}

export async function GET() {
  const dates = last30Dates();

  // ── Pipeline Timeline（每日 phases）─────────────────────────────────────────
  const timelineByDate: Record<string, unknown[]> = {};
  const rerankRuns: { date: string; count: number }[] = [];
  for (const d of dates) {
    const rows = readJsonl(join(LOG_DIR, `pipeline-phases-${d}.jsonl`));
    if (rows.length) timelineByDate[d] = rows;
    const rerankCount = rows.filter((r) => r.phase === "rerank-top500" && r.status !== "SKIPPED").length;
    if (rerankCount > 0) rerankRuns.push({ date: d, count: rerankCount });
  }
  const timelineDates = Object.keys(timelineByDate).sort();
  const latestTimelineDate = timelineDates[timelineDates.length - 1] ?? null;

  // ── GPT Runtime ────────────────────────────────────────────────────────────
  const gpt: Record<string, unknown>[] = [];
  for (const d of dates) {
    const rows = readJsonl(join(LOG_DIR, `gpt-runtime-${d}.jsonl`));
    // 一天可能多条（多次 rerank）——聚合为该日汇总
    if (rows.length) {
      type Agg = { calls: number; ok: number; fail: number; retries: number; err429: number; quota: number; tokens: number; runs: number };
      const agg = rows.reduce<Agg>((a, r) => ({
        calls: a.calls + (Number(r.calls) || 0),
        ok: a.ok + (Number(r.ok) || 0),
        fail: a.fail + (Number(r.fail) || 0),
        retries: a.retries + (Number(r.retries) || 0),
        err429: a.err429 + (Number(r.err429) || 0),
        quota: a.quota + (Number(r.quota) || 0),
        tokens: a.tokens + (Number(r.totalTokens) || 0),
        runs: a.runs + 1,
      }), { calls: 0, ok: 0, fail: 0, retries: 0, err429: 0, quota: 0, tokens: 0, runs: 0 });
      gpt.push({ date: d, model: rows[rows.length - 1].model ?? null, ...agg, quotaExhausted: agg.quota > 0 });
    }
  }

  // ── Runtime Reliability 趋势（30 天，来自 health 报告）────────────────────────
  let healthFiles: string[] = [];
  try { healthFiles = readdirSync(REPORT_DIR).filter((f) => /^data-health-guard-\d{8}-\d{4}\.json$/.test(f)); } catch { /* noop */ }
  const byDay: Record<string, { runs: number; maxCrit: number; maxWarn: number }> = {};
  for (const f of healthFiles) {
    const m = f.match(/(\d{4})(\d{2})(\d{2})/);
    if (!m) continue;
    const day = `${m[1]}-${m[2]}-${m[3]}`;
    if (!dates.includes(day)) continue;
    try {
      const j = JSON.parse(readFileSync(join(REPORT_DIR, f), "utf-8"));
      const cur = byDay[day] ?? { runs: 0, maxCrit: 0, maxWarn: 0 };
      cur.runs++;
      cur.maxCrit = Math.max(cur.maxCrit, Number(j.criticalCount) || 0);
      cur.maxWarn = Math.max(cur.maxWarn, Number(j.warningCount) || 0);
      byDay[day] = cur;
    } catch { /* skip */ }
  }
  const reliability = dates
    .filter((d) => byDay[d])
    .map((d) => {
      const v = byDay[d];
      const status = v.maxCrit > 0 ? "FAILED" : v.maxWarn > 0 ? "WARNING" : "PASS";
      return { date: d, status, critical: v.maxCrit, warning: v.maxWarn, runs: v.runs };
    });
  const passDays = reliability.filter((r) => r.status === "PASS").length;
  const warnDays = reliability.filter((r) => r.status === "WARNING").length;
  const failDays = reliability.filter((r) => r.status === "FAILED").length;
  const totalDays = reliability.length || 1;
  const reliabilityScore = Math.round(((passDays * 1 + warnDays * 0.8 + failDays * 0) / totalDays) * 100);

  return NextResponse.json({
    today: jstDate(new Date()),
    reliability,
    reliabilitySummary: { passDays, warnDays, failDays, totalDays: reliability.length, reliabilityScore },
    gpt,
    rerankRuns,
    maxRerankPerDay: rerankRuns.reduce((m, r) => Math.max(m, r.count), 0),
    timelineDates,
    latestTimelineDate,
    latestTimeline: latestTimelineDate ? timelineByDate[latestTimelineDate] : [],
  });
}
