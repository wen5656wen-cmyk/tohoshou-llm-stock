// ── TOHOSHOU AI · GPT Runtime Log（P5.5 稳定化）─────────────────────────────
// 记录 GPT 调用运行时指标到 logs/gpt-runtime-<JST日期>.jsonl：
//   模型 / 调用数 / 成功 / 失败 / 重试 / 429 / Quota / Token / 耗时。
//
// **纯观测层**：所有写入 try/catch 包裹，绝不影响评分/rerank；不改任何 GPT prompt/参数/逻辑。
// 由 scripts/rerank-top500.ts（主 GPT 消费方）在运行结束时 flush 一条汇总。

import { appendFileSync, mkdirSync } from "fs";
import { join } from "path";

const LOG_DIR = join(process.cwd(), "logs");

function jstDateStr(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

/** 单次 GPT 运行的累计计量（进程内累加，结束时 flush）。 */
export interface GptRunStat {
  job: string;
  model: string;
  calls: number;            // API 调用次数（含重试）
  ok: number;               // 成功次数
  fail: number;             // 最终失败次数
  retries: number;          // 重试次数
  err429: number;           // 429 次数
  quota: number;            // insufficient_quota 次数
  promptTokens: number;
  completionTokens: number;
  totalMs: number;          // 成功调用累计耗时
}

export function newGptStat(job: string, model: string): GptRunStat {
  return { job, model, calls: 0, ok: 0, fail: 0, retries: 0, err429: 0, quota: 0, promptTokens: 0, completionTokens: 0, totalMs: 0 };
}

/** 从错误对象/消息识别 429 与配额耗尽（观测用，绝不抛错）。 */
export function classifyGptError(e: unknown): { is429: boolean; isQuota: boolean } {
  try {
    const s = (e instanceof Error ? e.message : String(e)).toLowerCase();
    const isQuota = s.includes("insufficient_quota") || s.includes("exceeded your current quota");
    const is429 = s.includes("429") || s.includes("rate limit") || isQuota;
    return { is429, isQuota };
  } catch {
    return { is429: false, isQuota: false };
  }
}

/** 结束时 flush 一条汇总记录（append，绝不抛错）。 */
export function flushGptRun(stat: GptRunStat): void {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    const rec = {
      ...stat,
      date: jstDateStr(),
      avgMs: stat.ok ? Math.round(stat.totalMs / stat.ok) : null,
      totalTokens: stat.promptTokens + stat.completionTokens,
      quotaExhausted: stat.quota > 0,
      finishedAt: new Date().toISOString(),
    };
    appendFileSync(join(LOG_DIR, `gpt-runtime-${jstDateStr()}.jsonl`), JSON.stringify(rec) + "\n", "utf-8");
  } catch { /* 观测失败不得影响 GPT/评分 */ }
}
