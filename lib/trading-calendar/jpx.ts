/**
 * JPX Trading Calendar (P5-T3)
 * ────────────────────────────────────────────────────────────────────────────
 * 判断某个日期是否为日本交易所（JPX / 東証）的交易日，供 Cron guard 使用，
 * 避免在周末与日本祝日重复跑高成本的 AI 评分 / GPT rerank / 策略生成 / Paper Broker。
 *
 * 设计原则：
 *   - 纯离线：不联网，祝日来自固定配置表（每年需按官方 JPX 日历更新）。
 *   - 时区安全：始终以「日本时间（Asia/Tokyo）」的日历日为准，无论服务器 TZ。
 *   - 只读工具：不触碰任何评分 / 策略 / DB / API 逻辑。
 *
 * 休市判断规则（按优先级）：
 *   1. 年末年初：12/31 与 1/1–1/3（每年自动生效，无需列入祝日表）
 *   2. 周六 / 周日
 *   3. 预留特别休市日（SPECIAL_CLOSURES，如系统维护 / 国葬等临时休市）
 *   4. 日本法定祝日（JP_HOLIDAYS 固定表）
 *
 * 祝日表更新方式见 docs/JPX_TRADING_CALENDAR.md。
 */

export interface JPXTradingDayStatus {
  /** true = 交易日；false = 休市 */
  isTradingDay: boolean;
  /** 原因："Trading Day" | "Weekend" | "Japan Holiday" | "Year-end Market Close" | "Special Market Close" */
  reason: string;
  /** 该日期在日本时间下的日历日，格式 YYYY-MM-DD */
  date: string;
}

/**
 * 日本法定祝日（JPX 休市），键为日本时间日历日 YYYY-MM-DD，值为祝日名（仅供参考/调试）。
 *
 * ⚠️ 不含年末年初（12/31、1/1–1/3）——那些由规则统一处理，跨年份自动生效。
 * ⚠️ Happy Monday（移动祝日）、春分/秋分（天文测定）、振替休日（补假）每年不同，
 *    必须每年从官方 JPX 日历刷新：https://www.jpx.co.jp/corporate/calendar/
 *
 * 已核验年份：2026（权威）。2027 为前瞻值，启用前请对照官方日历复核春分/秋分/振替休日。
 */
const JP_HOLIDAYS: Record<string, string> = {
  // ── 2026（已核验）──────────────────────────────────────────────────────
  "2026-01-12": "成人の日",
  "2026-02-11": "建国記念の日",
  "2026-02-23": "天皇誕生日",
  "2026-03-20": "春分の日",
  "2026-04-29": "昭和の日",
  "2026-05-03": "憲法記念日",
  "2026-05-04": "みどりの日",
  "2026-05-05": "こどもの日",
  "2026-05-06": "振替休日", // 5/3（日）の振替
  "2026-07-20": "海の日",
  "2026-08-11": "山の日",
  "2026-09-21": "敬老の日",
  "2026-09-22": "国民の休日", // 9/21 敬老の日 と 9/23 秋分の日 に挟まれた日
  "2026-09-23": "秋分の日",
  "2026-10-12": "スポーツの日",
  "2026-11-03": "文化の日",
  "2026-11-23": "勤労感謝の日",
  // ── 2027（前瞻，启用前需对照官方日历复核）────────────────────────────
  "2027-01-11": "成人の日",
  "2027-02-11": "建国記念の日",
  "2027-02-23": "天皇誕生日",
  "2027-03-22": "振替休日", // 3/21 春分の日（日）の振替
  "2027-04-29": "昭和の日",
  "2027-05-03": "憲法記念日",
  "2027-05-04": "みどりの日",
  "2027-05-05": "こどもの日",
  "2027-07-19": "海の日",
  "2027-08-11": "山の日",
  "2027-09-20": "敬老の日",
  "2027-09-23": "秋分の日",
  "2027-10-11": "スポーツの日",
  "2027-11-03": "文化の日",
  "2027-11-23": "勤労感謝の日",
};

/**
 * 预留特别休市日列表：JPX 临时公告的休市（系统维护、国葬、灾害等），格式 YYYY-MM-DD。
 * 平时为空；需要时手动追加。
 */
const SPECIAL_CLOSURES: string[] = [];

/** 提取「日本时间」下的日历年月日（时区安全，不依赖服务器 TZ）。 */
function jstYMD(date: Date): { y: number; m: number; d: number; iso: string } {
  // en-CA 输出 "YYYY-MM-DD"
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d, iso };
}

/**
 * 返回给定日期（默认现在）在 JPX 日历下的交易日状态。
 * 日期一律按日本时间（Asia/Tokyo）的日历日解释。
 */
export function getJPXTradingDayStatus(date: Date = new Date()): JPXTradingDayStatus {
  const { y, m, d, iso } = jstYMD(date);
  // 由 JST 日历日推算星期（0=周日 … 6=周六），不受服务器时区影响。
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();

  // 1) 年末年初休市：12/31 与 1/1–1/3（每年自动生效）
  if ((m === 12 && d === 31) || (m === 1 && d >= 1 && d <= 3)) {
    return { isTradingDay: false, reason: "Year-end Market Close", date: iso };
  }
  // 2) 周末
  if (weekday === 0 || weekday === 6) {
    return { isTradingDay: false, reason: "Weekend", date: iso };
  }
  // 3) 预留特别休市日
  if (SPECIAL_CLOSURES.includes(iso)) {
    return { isTradingDay: false, reason: "Special Market Close", date: iso };
  }
  // 4) 日本法定祝日
  if (JP_HOLIDAYS[iso]) {
    return { isTradingDay: false, reason: "Japan Holiday", date: iso };
  }
  return { isTradingDay: true, reason: "Trading Day", date: iso };
}

/** 便捷布尔判断：给定日期（默认现在）是否为 JPX 交易日。 */
export function isJPXTradingDay(date: Date = new Date()): boolean {
  return getJPXTradingDayStatus(date).isTradingDay;
}
