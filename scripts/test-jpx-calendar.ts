#!/usr/bin/env npx tsx
/**
 * JPX Trading Calendar 测试（P5-T3）
 *
 * 运行：npm run test:jpx-calendar
 *
 * 覆盖：普通工作日 / 周六 / 周日 / 元旦 / 成人之日 / 黄金周 / 年末 12/31 / 年初 1/1–1/3。
 * 断言失败时 process.exit(1)，供 CI / 部署前校验使用。
 *
 * 说明：为消除时区歧义，测试日期一律用「+09:00」显式指定日本时间正午，
 * 保证被测函数解析出的 JST 日历日与期望一致。
 */
import { isJPXTradingDay, getJPXTradingDayStatus } from "../lib/trading-calendar/jpx";

/** 构造某个「日本时间日历日」的 Date（正午，避免跨时区跳日）。 */
function jst(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00+09:00`);
}

interface Case {
  label: string;
  date: string;            // YYYY-MM-DD（日本时间）
  expectTrading: boolean;
  expectReason?: string;   // 可选：断言 reason
}

const CASES: Case[] = [
  // 普通工作日
  { label: "普通工作日（周一）", date: "2026-07-06", expectTrading: true,  expectReason: "Trading Day" },
  { label: "普通工作日（周三）", date: "2026-06-24", expectTrading: true,  expectReason: "Trading Day" },
  // 周末
  { label: "周六",              date: "2026-07-04", expectTrading: false, expectReason: "Weekend" },
  { label: "周日（今天）",       date: "2026-07-05", expectTrading: false, expectReason: "Weekend" },
  // 元旦 / 年初 / 年末（年末年初休市）
  { label: "元旦 1/1",          date: "2026-01-01", expectTrading: false, expectReason: "Year-end Market Close" },
  { label: "年初 1/2",          date: "2026-01-02", expectTrading: false, expectReason: "Year-end Market Close" },
  { label: "年初 1/3",          date: "2026-01-03", expectTrading: false, expectReason: "Year-end Market Close" },
  { label: "年末 12/31",        date: "2026-12-31", expectTrading: false, expectReason: "Year-end Market Close" },
  // 日本祝日
  { label: "成人之日（1月第2个周一）", date: "2026-01-12", expectTrading: false, expectReason: "Japan Holiday" },
  // 2026-05-03 憲法記念日 落在周日 → 按优先级 reason=Weekend（周末先于祝日判断）
  { label: "黄金周·宪法记念日（周日）", date: "2026-05-03", expectTrading: false, expectReason: "Weekend" },
  { label: "黄金周·儿童节 5/5", date: "2026-05-05", expectTrading: false, expectReason: "Japan Holiday" },
  { label: "黄金周·振替休日 5/6", date: "2026-05-06", expectTrading: false, expectReason: "Japan Holiday" },
  { label: "春分之日 3/20",     date: "2026-03-20", expectTrading: false, expectReason: "Japan Holiday" },
  // 交易日边界：黄金周里非祝日的工作日（5/1 周五）应为交易日
  { label: "黄金周·5/1（周五非祝日）", date: "2026-05-01", expectTrading: true, expectReason: "Trading Day" },
];

let pass = 0;
let fail = 0;
const failures: string[] = [];

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("JPX Trading Calendar 测试（P5-T3）");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

for (const c of CASES) {
  const status = getJPXTradingDayStatus(jst(c.date));
  const bool = isJPXTradingDay(jst(c.date));

  const okBool = bool === c.expectTrading && status.isTradingDay === c.expectTrading;
  const okDate = status.date === c.date;
  const okReason = c.expectReason === undefined || status.reason === c.expectReason;
  const ok = okBool && okDate && okReason;

  if (ok) {
    pass++;
    console.log(`✅ ${c.label.padEnd(22)} ${c.date}  →  ${status.isTradingDay ? "TRADING" : "SKIP"}  (${status.reason})`);
  } else {
    fail++;
    const msg = `❌ ${c.label} ${c.date} → 期望 trading=${c.expectTrading}${c.expectReason ? ` reason=${c.expectReason}` : ""}，实际 trading=${status.isTradingDay} reason=${status.reason} date=${status.date}`;
    console.log(msg);
    failures.push(msg);
  }
}

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`结果：${pass} PASS / ${fail} FAIL（共 ${CASES.length}）`);
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

if (fail > 0) {
  console.error("\nJPX Calendar 测试未通过：");
  failures.forEach((f) => console.error("  " + f));
  process.exit(1);
}
console.log("JPX Calendar PASS ✅");
process.exit(0);
