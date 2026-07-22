// ─────────────────────────────────────────────────────────────────────────────
// P26 Phase 4 · Core Daily Read API · HTTP/校验/日期助手（纯函数）。
// 不 import prisma / runtime / adapter / python —— 仅参数校验、错误响应、日期格式化。
// 错误只回机器码 + 稳定英文短句，禁 Prisma 原始错误/stack。
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "INVALID_ARGUMENT"
  | "INVALID_CURSOR"
  | "INVALID_LIMIT"
  | "CORE_DAILY_RUN_NOT_FOUND"
  | "CORE_DAILY_DATA_NOT_FOUND"
  | "CORE_DAILY_QUERY_FAILED";

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly httpStatus: number,
    message: string,
    readonly details: Record<string, string | number> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function errorJson(code: ErrorCode, httpStatus: number, message: string, details: Record<string, string | number> = {}) {
  return NextResponse.json({ error: { code, message, details } }, { status: httpStatus });
}

/** 统一异常 → 稳定错误响应（禁泄漏 Prisma/stack）。 */
export function handleError(e: unknown) {
  if (e instanceof ApiError) return errorJson(e.code, e.httpStatus, e.message, e.details);
  return errorJson("CORE_DAILY_QUERY_FAILED", 500, "core daily query failed");
}

// ── 参数校验（白名单/长度/枚举/范围）──────────────────────────────────────────
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CURSOR_RE = /^\d{1,18}$/;

export function parseLimit(v: string | null): number {
  if (v === null || v === "") return 20;
  if (!/^\d{1,3}$/.test(v)) throw new ApiError("INVALID_LIMIT", 400, "limit must be a positive integer");
  const n = parseInt(v, 10);
  if (n < 1) throw new ApiError("INVALID_LIMIT", 400, "limit must be >= 1");
  return Math.min(n, 100); // 强制最大 100
}

export function parseCursor(v: string | null): number | undefined {
  if (v === null || v === "") return undefined;
  if (!CURSOR_RE.test(v)) throw new ApiError("INVALID_CURSOR", 400, "cursor must be a numeric id");
  return parseInt(v, 10);
}

export function parseDate(v: string | null): string | undefined {
  if (v === null || v === "") return undefined;
  if (!DATE_RE.test(v)) throw new ApiError("INVALID_ARGUMENT", 400, "date must be YYYY-MM-DD");
  return v;
}

export function parseEnum<T extends string>(v: string | null, allowed: readonly T[]): T | undefined {
  if (v === null || v === "") return undefined;
  if (!(allowed as readonly string[]).includes(v)) throw new ApiError("INVALID_ARGUMENT", 400, "value not in allowed enum");
  return v as T;
}

export function parseStr(v: string | null, maxLen = 32): string | undefined {
  if (v === null || v === "") return undefined;
  if (v.length > maxLen) throw new ApiError("INVALID_ARGUMENT", 400, "argument too long");
  return v;
}

// ── 日期/时间（禁服务器本地时区隐式转换）─────────────────────────────────────
/** @db.Date → 'YYYY-MM-DD'（存储即 JST 交易日历日，以 UTC 分量取，无漂移）。 */
export function toYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
/** 时间戳 → ISO 8601（UTC）。业务日期口径见响应中的 timezone 字段。 */
export function toIso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}
export const BUSINESS_TZ = "Asia/Tokyo";

// ── 策略头（researchStatus/validationStatus 来自 registry 配置，非业务表；缺失→NOT_AVAILABLE）──
export interface StrategyHeader {
  strategyId: string;
  strategyVersion: string;
  researchStatus: string;
  validationStatus: string;
}
export function readRegistryStrategy(strategyId: string, version: string): StrategyHeader {
  try {
    const raw = JSON.parse(
      readFileSync(join(process.cwd(), "research", "minute", "core_daily", "registry.json"), "utf-8"),
    ) as { strategies: Array<{ id: string; researchStatus?: string; validationStatus?: string }> };
    const s = raw.strategies.find((x) => x.id === strategyId);
    return {
      strategyId, strategyVersion: version,
      researchStatus: s?.researchStatus ?? "NOT_AVAILABLE",
      validationStatus: s?.validationStatus ?? "NOT_AVAILABLE",
    };
  } catch {
    return { strategyId, strategyVersion: version, researchStatus: "NOT_AVAILABLE", validationStatus: "NOT_AVAILABLE" };
  }
}

export const DEFAULT_STRATEGY = "overnight_momentum";
