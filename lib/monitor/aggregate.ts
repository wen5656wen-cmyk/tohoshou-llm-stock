// ── P22-S1 · 生产可观测聚合（只读）───────────────────────────────────────────
//
// 本模块只做一件事：把**已经存在**的可观测痕迹聚合成趋势与快照，
// 不产生任何新的业务数据、不改任何现有写入路径。
//
// 真实数据源（全部是系统运行时已经落地的文件 / 表，非本轮新增采集）：
//   · reports/data-health-guard-<stamp>.json   —— 每次 health 巡检的结构化结果
//   · logs/pipeline-phases-<date>.jsonl        —— 每日流水线各阶段执行记录
//   · logs/sync-prices-failed-<date>-summary.json —— 同步失败分类（含 429 计数）
//   · DailyPrice / StockScore / DeploymentLog  —— DB（只 count / findFirst，不写）
//
// ⚠️ 诚实原则：数据源缺失时返回 null / 空数组并标注，**绝不编造趋势点**。
//   例如某天没有 failed-summary 文件 = 当天 0 次 429 失败（这是真实推断，非猜测）。

import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";

const REPORTS_DIR = join(process.cwd(), "reports");
const LOGS_DIR = join(process.cwd(), "logs");

/** JST 当天 yyyy-mm-dd（趋势/文件名口径统一走 JST）。 */
export function jstDay(d: Date = new Date()): string {
  const jst = new Date(d.getTime() + 9 * 3600 * 1000);
  return jst.toISOString().slice(0, 10);
}

/** 最近 N 天的 JST 日期列表（含今天，升序）。 */
export function lastNDays(n: number, from: Date = new Date()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(jstDay(new Date(from.getTime() - i * 86400_000)));
  return out;
}

function safeReadJson<T>(path: string): T | null {
  try {
    return existsSync(path) ? (JSON.parse(readFileSync(path, "utf-8")) as T) : null;
  } catch {
    return null;
  }
}

// ── Health 快照 ──────────────────────────────────────────────────────────────
// 文件名 data-health-guard-YYYYMMDD-HHMM.json；每天可能有多次巡检，取当天最新一份。

interface HealthFile {
  auditAt?: string; version?: string; status?: string;
  criticalCount?: number; warningCount?: number; passCount?: number; infoCount?: number;
  allowRecommendation?: boolean; checks?: { id: string; level: string; name: string; value: unknown; pass: boolean }[];
}
export interface HealthSnapshot {
  critical: number; warning: number; pass: number; info: number;
  status: string | null; auditAt: string | null; allowRecommendation: boolean | null; version: string | null;
}

/** 列出 reports 下所有 health 文件名，按 <YYYYMMDD> 分组，每天保留最新（文件名末尾时刻最大）。 */
function healthFilesByDay(): Map<string, string> {
  const byDay = new Map<string, string>(); // yyyy-mm-dd → 文件名（当天最新）
  let files: string[] = [];
  try { files = readdirSync(REPORTS_DIR).filter(f => f.startsWith("data-health-guard-") && f.endsWith(".json")); }
  catch { return byDay; }
  for (const f of files.sort()) {
    const m = f.match(/data-health-guard-(\d{4})(\d{2})(\d{2})-\d{4}\.json/);
    if (!m) continue;
    const day = `${m[1]}-${m[2]}-${m[3]}`;
    byDay.set(day, f); // 已排序，后者覆盖前者 → 当天最新
  }
  return byDay;
}

function toSnapshot(j: HealthFile): HealthSnapshot {
  return {
    critical: j.criticalCount ?? 0, warning: j.warningCount ?? 0, pass: j.passCount ?? 0, info: j.infoCount ?? 0,
    status: j.status ?? null, auditAt: j.auditAt ?? null,
    allowRecommendation: j.allowRecommendation ?? null, version: j.version ?? null,
  };
}

/** 最新一份 health 巡检快照（跨所有日期的最新）。 */
export function latestHealth(): HealthSnapshot | null {
  const byDay = healthFilesByDay();
  const days = [...byDay.keys()].sort();
  const last = days[days.length - 1];
  if (!last) return null;
  const j = safeReadJson<HealthFile>(join(REPORTS_DIR, byDay.get(last)!));
  return j ? toSnapshot(j) : null;
}

/** 最近 N 天 health 趋势（缺失日不产点 —— 不编造）。 */
export function healthTrend(days = 30): { date: string; critical: number; warning: number; pass: number }[] {
  const byDay = healthFilesByDay();
  const want = new Set(lastNDays(days));
  const out: { date: string; critical: number; warning: number; pass: number }[] = [];
  for (const day of lastNDays(days)) {
    if (!byDay.has(day) || !want.has(day)) continue;
    const j = safeReadJson<HealthFile>(join(REPORTS_DIR, byDay.get(day)!));
    if (!j) continue;
    out.push({ date: day, critical: j.criticalCount ?? 0, warning: j.warningCount ?? 0, pass: j.passCount ?? 0 });
  }
  return out;
}

// ── Pipeline 阶段（当日）+ Cron 成功率趋势 ──────────────────────────────────
export interface PhaseRow {
  phase: string; label: string; source: string;
  startedAt: string; finishedAt: string; durationMs: number;
  status: "SUCCESS" | "FAILED" | "SKIPPED"; error: string | null; date: string;
}
export function readPhases(day: string): PhaseRow[] {
  const f = join(LOGS_DIR, `pipeline-phases-${day}.jsonl`);
  if (!existsSync(f)) return [];
  try {
    return readFileSync(f, "utf-8").trim().split("\n").filter(Boolean).map(l => JSON.parse(l) as PhaseRow);
  } catch { return []; }
}

/** 最近 N 天 cron/pipeline 成功率趋势（成功阶段 / 总阶段）。 */
export function pipelineTrend(days = 30): { date: string; total: number; success: number; failed: number; successRate: number }[] {
  const out: { date: string; total: number; success: number; failed: number; successRate: number }[] = [];
  for (const day of lastNDays(days)) {
    const rows = readPhases(day);
    if (rows.length === 0) continue; // 无记录不产点
    const success = rows.filter(r => r.status === "SUCCESS").length;
    const failed = rows.filter(r => r.status === "FAILED").length;
    out.push({ date: day, total: rows.length, success, failed, successRate: Math.round((success / rows.length) * 100) });
  }
  return out;
}

// ── J-Quants 429 趋势 ────────────────────────────────────────────────────────
// 来源：logs/sync-prices-failed-<date>-summary.json 的 rate_limit 计数。
// **无文件 = 当天 0 次失败**（真实推断：summary 只在有失败时写）。
export function rateLimitTrend(days = 30): { date: string; rateLimit: number; totalFailed: number; hasData: boolean }[] {
  const out: { date: string; rateLimit: number; totalFailed: number; hasData: boolean }[] = [];
  for (const day of lastNDays(days)) {
    const f = join(LOGS_DIR, `sync-prices-failed-${day}-summary.json`);
    if (!existsSync(f)) { out.push({ date: day, rateLimit: 0, totalFailed: 0, hasData: true }); continue; }
    const j = safeReadJson<Record<string, number>>(f);
    if (!j) { out.push({ date: day, rateLimit: 0, totalFailed: 0, hasData: false }); continue; }
    const rateLimit = j.rate_limit ?? 0;
    const totalFailed = Object.values(j).reduce((a, b) => a + (typeof b === "number" ? b : 0), 0);
    out.push({ date: day, rateLimit, totalFailed, hasData: true });
  }
  return out;
}

/** 今日 429 失败次数（来自今日 failed-summary；无 = 0）。 */
export function rateLimit429Today(): number {
  const day = jstDay();
  const f = join(LOGS_DIR, `sync-prices-failed-${day}-summary.json`);
  const j = safeReadJson<Record<string, number>>(f);
  return j?.rate_limit ?? 0;
}

/** 今日同步告警文件（P21-R1 韧性补救未恢复时写）。存在即代表当日曾触发覆盖率告警。 */
export function todaySyncAlert(): { coveragePct: number; retryRounds: number; remainingFailed: number; message: string; ts: string } | null {
  const f = join(LOGS_DIR, `sync-alert-${jstDay()}.json`);
  return safeReadJson(f);
}

/** 生产 BUILD_ID（.next/BUILD_ID）。部署一致性校验的锚点。 */
export function buildId(): string | null {
  try { return readFileSync(join(process.cwd(), ".next", "BUILD_ID"), "utf-8").trim(); }
  catch { return null; }
}
