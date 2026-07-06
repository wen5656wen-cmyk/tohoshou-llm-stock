/**
 * Day Trade TradeResult coverage helper (JPX-calendar-aware)
 * ────────────────────────────────────────────────────────────────────────────
 * Pure, deterministic logic extracted from Data Health Guard CHECK S33 so it
 * can be unit-tested without a DB connection. Depends only on the offline JPX
 * trading calendar.
 *
 * 只读工具：不触碰任何评分 / 策略 / DB / API / 资金链路逻辑。
 */
import { isJPXTradingDay } from "./jpx";

/**
 * Count consecutive JPX TRADING DAYS (most-recent first) that are missing a
 * Day Trade TradeResult.
 *
 * Non-trading days (weekend / Japan holiday / year-end closure) are SKIPPED:
 * DAY_TRADE recommendations can exist on non-trading dates (generated ahead of
 * the next session) but are never settled, so an absent TradeResult on those
 * dates is NOT a coverage gap and must not count as "missing".
 *
 * `candidates` must be ordered most-recent first. Walking stops at the first
 * TRADING day that IS settled, or after `maxTradingDays` trading days examined.
 */
export function countConsecutiveMissingTradingDays(
  candidates: Array<{ tradeDate: Date; hasResult: boolean }>,
  maxTradingDays = 5,
): { missing: number; missingDates: string[] } {
  let missing = 0;
  const missingDates: string[] = [];
  let checkedTradingDays = 0;
  for (const c of candidates) {
    if (!isJPXTradingDay(c.tradeDate)) continue; // skip weekend / holiday / year-end
    checkedTradingDays++;
    if (!c.hasResult) {
      missing++;
      missingDates.push(c.tradeDate.toISOString().slice(0, 10));
    } else {
      break; // first trading day (most recent first) that IS settled → done
    }
    if (checkedTradingDays >= maxTradingDays) break;
  }
  return { missing, missingDates };
}
