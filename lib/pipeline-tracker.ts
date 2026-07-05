// ── TOHOSHOU AI · Pipeline Tracker（P5.5 稳定化）─────────────────────────────
// 按「阶段」记录流水线执行到 logs/pipeline-phases-<JST日期>.jsonl，用于：
//   1) R3 修复：fallback 用 isPhaseCompletedToday() 跳过「今日已成功」阶段，
//      避免 Phase2 与 07:30 fallback 重复执行 GPT rerank（重复调用/覆盖/扣费）。
//   2) P1 可观测性：完整的 per-phase Pipeline Timeline（开始/结束/耗时/状态/错误）。
//
// **纯观测 + 编排幂等，不参与任何评分/计算/DB。所有写入均 try/catch 包裹，
// 观测层绝不能影响流水线本身。** 跨进程共享靠文件系统（Phase2 在 sync-all-prices
// 子进程写，cron-scheduler 主进程读）。

import { appendFileSync, mkdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";

const LOG_DIR = join(process.cwd(), "logs");

/** 日本时间日历日 YYYY-MM-DD（时区安全）。 */
export function jstDateStr(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

function fileFor(date: string): string {
  return join(LOG_DIR, `pipeline-phases-${date}.jsonl`);
}

export type PhaseStatus = "SUCCESS" | "FAILED" | "SKIPPED";
export type PhaseSource = "phase2" | "fallback" | "cron";

export interface PhaseRecord {
  phase: string;          // 脚本基名，如 rerank-top500（Phase2 与 fallback 必须一致）
  label: string;          // 显示名
  date: string;           // JST 日历日
  startedAt: string;      // ISO
  finishedAt: string;     // ISO
  durationMs: number;
  status: PhaseStatus;
  source: PhaseSource;
  error: string | null;
}

/** 追加一条阶段记录（观测层，绝不抛错）。 */
export function recordPhase(r: Omit<PhaseRecord, "date"> & { date?: string }): void {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    const rec: PhaseRecord = { ...r, date: r.date ?? jstDateStr() };
    appendFileSync(fileFor(rec.date), JSON.stringify(rec) + "\n", "utf-8");
  } catch { /* 观测失败不得影响流水线 */ }
}

/** 记录一个「跳过」阶段（fallback 幂等命中时）。 */
export function recordSkip(phase: string, label: string, source: PhaseSource): void {
  const now = new Date().toISOString();
  recordPhase({ phase, label, startedAt: now, finishedAt: now, durationMs: 0, status: "SKIPPED", source, error: null });
}

/**
 * 今日（JST）该阶段是否已成功执行过。
 * 用于 fallback 幂等：Phase2 已成功的阶段，fallback 不再重复执行。
 */
export function isPhaseCompletedToday(phase: string): boolean {
  try {
    const f = fileFor(jstDateStr());
    if (!existsSync(f)) return false;
    const lines = readFileSync(f, "utf-8").trim().split("\n");
    for (const l of lines) {
      if (!l) continue;
      try {
        const r = JSON.parse(l) as PhaseRecord;
        if (r.phase === phase && r.status === "SUCCESS") return true;
      } catch { /* skip malformed line */ }
    }
    return false;
  } catch {
    return false; // 读取失败时保守返回 false（宁可重跑也不误跳）
  }
}

/** 读取某一 JST 日期的全部阶段记录（供 Runtime 观测 API）。 */
export function readPhasesForDate(date: string): PhaseRecord[] {
  try {
    const f = fileFor(date);
    if (!existsSync(f)) return [];
    return readFileSync(f, "utf-8").trim().split("\n")
      .filter(Boolean)
      .map((l) => { try { return JSON.parse(l) as PhaseRecord; } catch { return null; } })
      .filter((x): x is PhaseRecord => x !== null);
  } catch {
    return [];
  }
}
