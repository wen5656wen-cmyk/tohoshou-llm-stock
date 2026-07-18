// ── Decision Engine · 交易阶段与时间（P15-01B）───────────────────────────────
// 扩展 lib/decision/live-status 的 3 态 marketPhase 为 8 态；提供「下一交易日 / 下一次决策」。
// 纯函数、JST 时区安全（复用 lib/trading-calendar/jpx 的 JPX 日历）。相对 import。
import { isJPXTradingDay } from "../trading-calendar/jpx";
import type { MarketPhase } from "./types";

/** JST 日历日 YYYY-MM-DD（时区安全）。 */
export function jstDateStr(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

/** JST 当日分钟数（0–1439）。 */
export function jstMinutes(d: Date): number {
  const s = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d); // "HH:MM"
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

/** 8 态交易阶段。非交易日=NON_TRADING；否则按 JST 分钟切段（含午休）。 */
export function marketPhase8(now: Date): MarketPhase {
  if (!isJPXTradingDay(now)) return "NON_TRADING";
  const t = jstMinutes(now);
  if (t < 555) return "PRE_OPEN";        // <09:15（含 08:30 盘前）
  if (t < 570) return "OPEN_CONFIRM";    // 09:15–09:30
  if (t < 690) return "MORNING";         // 09:30–11:30
  if (t < 750) return "MIDDAY";          // 11:30–12:30 午休
  if (t < 870) return "AFTERNOON";       // 12:30–14:30
  if (t < 930) return "LATE_SESSION";    // 14:30–15:30
  return "POST_CLOSE";                   // ≥15:30
}

/** 是否处于可执行交易时段（含开盘确认，排除午休/盘前/收盘后）。 */
export function isExecutablePhase(p: MarketPhase): boolean {
  return p === "OPEN_CONFIRM" || p === "MORNING" || p === "AFTERNOON" || p === "LATE_SESSION";
}

/** 下一个 JPX 交易日 YYYY-MM-DD（含当天可选）。 */
export function nextTradingDayStr(from: Date, includeToday = false): string {
  let d = new Date(from.getTime());
  if (!includeToday) d = new Date(d.getTime() + 24 * 3600_000);
  for (let i = 0; i < 30; i++) {
    if (isJPXTradingDay(d)) return jstDateStr(d);
    d = new Date(d.getTime() + 24 * 3600_000);
  }
  return jstDateStr(d);
}

/**
 * 下一次收盘决策（15:15 JST）。v1 唯一决策锚点。
 * 当天交易日且未过 15:15 → 今天；否则下一交易日。返回「YYYY-MM-DD 15:15 JST」。
 */
export function nextDecisionLabel(now: Date): string {
  const DECISION_MIN = 15 * 60 + 15; // 15:15
  const today = isJPXTradingDay(now) && jstMinutes(now) < DECISION_MIN;
  const day = today ? jstDateStr(now) : nextTradingDayStr(now, false);
  return `${day} 15:15 JST`;
}
