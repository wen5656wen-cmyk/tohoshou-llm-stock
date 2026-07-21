// ── P20 · 企业行动事件（财报预定 / 除权除息）共享规则 ─────────────────────────
// 财报与除权息两个同步脚本 + briefing API 共用本文件，避免出现第二套日期/校验口径。
//
// ⚠️ 单位口径（踩过的坑，勿改）：
//   yahoo-finance2 v3 的 earningsTimestampStart / earningsTimestampEnd /
//   earningsTimestamp **已经是 Date 对象**，不是 unix 秒。禁止再 `* 1000` —— 那会得到
//   `+058661-11` 这类越界日期（P20 首次探测实证）。
//
// ⚠️ 陈旧值（实测）：Top300 中 earningsTimestampStart 有值率 93%，但其中 **70% 已过期**
//   （如 9343.T → 2025-05-09）。因此「有值」绝不等于「可用」，必须过未来日期闸门。

import { getJPXTradingDayStatus } from "@/lib/trading-calendar/jpx";

/** 全站唯一日历日口径：把任意时间点归到它所属的 JST 日历日 YYYY-MM-DD。 */
export function jstDay(d: Date = new Date()): string {
  return getJPXTradingDayStatus(d).date;
}

/** 合理日期值域：今日 ~ 今日+400 天。用于挡住越界值与荒谬的远期值。 */
export const MAX_FUTURE_DAYS = 400;

/**
 * 把 Yahoo 返回的日期字段规范成「JST 日历日字符串」，不合格一律返回 null。
 * 合格条件：是 Date / 可解析、非 NaN、JST 日历日 ≥ 今日、且不超过 today+400 天。
 */
export function toValidFutureJstDay(raw: unknown, todayJst: string = jstDay()): string | null {
  if (raw == null) return null;
  // ⚠️ 不做 `* 1000`。v3 已给 Date；若是字符串/数字也按原值解析。
  const d = raw instanceof Date ? raw : new Date(raw as string | number);
  if (Number.isNaN(d.getTime())) return null;
  const day = jstDay(d);
  if (day < todayJst) return null; // 已过期 → 丢弃
  const maxDay = jstDay(new Date(Date.now() + MAX_FUTURE_DAYS * 864e5));
  if (day > maxDay) return null; // 越界（如 +058661-11）→ 丢弃
  return day;
}

/** @db.Date 列的比较/写入基准：JST 日历日 → 该日 00:00:00 UTC。 */
export function dateOnly(jstDayStr: string): Date {
  return new Date(`${jstDayStr}T00:00:00.000Z`);
}

// ── 限速 / 重试 / 失败隔离 ────────────────────────────────────────────────────

export type RunStats<T> = {
  ok: T[];
  failed: { key: string; error: string }[];
  skipped: string[];
  timedOut: boolean;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 仅对网络/限流/5xx 重试；4xx（429 除外）视为确定性失败，不浪费配额。 */
function retriable(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? err);
  if (/\b(429|500|502|503|504)\b/.test(msg)) return true;
  if (/\b4\d\d\b/.test(msg)) return false;
  return true; // 网络层错误（ECONNRESET / timeout / fetch failed）默认可重试
}

/**
 * 并发受限 + 请求间隔 + 有限重试 + 单项失败隔离 + 全局超时 的批处理器。
 * 单项失败绝不中断整批；超时则正常收尾（返回已完成部分并标 timedOut）。
 */
export async function runLimited<I, O>(
  items: I[],
  keyOf: (item: I) => string,
  worker: (item: I) => Promise<O | null>,
  opts: { concurrency?: number; spacingMs?: number; retries?: number; timeoutMs?: number; onProgress?: (done: number, total: number) => void } = {}
): Promise<RunStats<O>> {
  const concurrency = opts.concurrency ?? 4;
  const spacingMs = opts.spacingMs ?? 150;
  const retries = opts.retries ?? 2;
  const timeoutMs = opts.timeoutMs ?? 20 * 60 * 1000;

  const stats: RunStats<O> = { ok: [], failed: [], skipped: [], timedOut: false };
  const deadline = Date.now() + timeoutMs;
  let cursor = 0;
  let done = 0;
  let lastFire = 0;

  async function lane() {
    for (;;) {
      if (Date.now() > deadline) { stats.timedOut = true; return; }
      const i = cursor++;
      if (i >= items.length) return;
      const item = items[i];
      const key = keyOf(item);

      // 请求间隔（全局节流，不是每 lane 各自计时）
      const wait = lastFire + spacingMs - Date.now();
      if (wait > 0) await sleep(wait);
      lastFire = Date.now();

      let attempt = 0;
      for (;;) {
        try {
          const out = await worker(item);
          if (out == null) stats.skipped.push(key);
          else stats.ok.push(out);
          break;
        } catch (e) {
          if (attempt < retries && retriable(e)) {
            await sleep(attempt === 0 ? 1000 : 3000); // 退避 1s → 3s
            attempt++;
            continue;
          }
          // 失败隔离：记录后继续下一只，绝不抛出中断整批
          stats.failed.push({ key, error: String((e as Error)?.message ?? e).slice(0, 200) });
          break;
        }
      }
      done++;
      if (opts.onProgress && done % 100 === 0) opts.onProgress(done, items.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => lane()));
  return stats;
}

/** 失败率闸门：超过阈值视为数据源异常，调用方应保留旧数据而非清空。 */
export const MAX_FAILURE_RATE = 0.3;
