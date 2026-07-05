#!/usr/bin/env npx tsx
/**
 * TDnet Event Feature 测试（P6-T2）
 * 运行：npm run test:tdnet-features
 *
 * 覆盖：6 事件类型分类（含真实 TDnet 标题 + 多事件标题 + 取得/消却区分 + 无事件）+ extractor 聚合。
 * 断言失败时 process.exit(1)。纯函数测试，不连 DB、不影响任何评分。
 */
import { classifyTdnetEvent } from "../lib/features/tdnet/parser";
import { extractSymbolFeatures, extractEventMatches } from "../lib/features/tdnet/extractor";
import type { TdnetEventType, DisclosureLike } from "../lib/features/tdnet/types";

let pass = 0, fail = 0;
const fails: string[] = [];

function eqSet(a: TdnetEventType[], b: TdnetEventType[]): boolean {
  const sa = new Set(a), sb = new Set(b);
  return sa.size === sb.size && [...sa].every((x) => sb.has(x));
}
function check(title: string, expect: TdnetEventType[]) {
  const got = classifyTdnetEvent(title);
  if (eqSet(got, expect)) { pass++; console.log(`✅ ${JSON.stringify(got).padEnd(52)} ${title.slice(0, 34)}`); }
  else { fail++; const m = `❌ 期望 ${JSON.stringify(expect)} 实得 ${JSON.stringify(got)} — ${title}`; console.log(m); fails.push(m); }
}

console.log("━━━ TDnet Event Parser 测试（真实标题）━━━");
check("自己株式の取得状況に関するお知らせ", ["BUYBACK"]);
check("自己株式の消却完了に関するお知らせ", ["TREASURY_SHARE_CANCELLATION"]);
check("自己株式の取得及び消却に関するお知らせ", ["BUYBACK", "TREASURY_SHARE_CANCELLATION"]);
check("配当予想の修正（増配）に関するお知らせ", ["DIVIDEND_INCREASE"]);
check("配当予想の修正（復配）に関するお知らせ", ["DIVIDEND_INCREASE"]);
check("通期業績予想（上方修正）および期末配当予想（増配）の修正に関するお知らせ", ["DIVIDEND_INCREASE", "EARNINGS_UP_REVISION"]);
check("業績予想の修正（下方修正）に関するお知らせ", ["EARNINGS_DOWN_REVISION"]);
check("株式分割及び株式分割に伴う定款の一部変更、配当予想の修正（増配）並びに株主優待制度", ["DIVIDEND_INCREASE", "STOCK_SPLIT"]);
check("2026年3月期 第2四半期決算短信〔日本基準〕", []);
check("代表取締役の異動に関するお知らせ", []);

console.log("\n━━━ Extractor 聚合测试 ━━━");
const now = new Date("2026-07-05T12:00:00+09:00");
const discs: DisclosureLike[] = [
  { symbol: "7203.T", title: "自己株式の取得状況に関するお知らせ", publishedAt: "2026-07-01T00:00:00+09:00" },
  { symbol: "7203.T", title: "配当予想の修正（増配）に関するお知らせ", publishedAt: "2026-06-20T00:00:00+09:00" },
  { symbol: "7203.T", title: "株式分割に関するお知らせ", publishedAt: "2026-01-01T00:00:00+09:00" }, // 窗口外(>90d)
  { symbol: "9999.T", title: "自己株式の消却完了に関するお知らせ", publishedAt: "2026-07-04T00:00:00+09:00" },
];
const feat = extractSymbolFeatures("7203.T", discs, { asOf: now, windowDays: 90, recentDays: 30 });
function assert(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`✅ ${name}`); } else { fail++; const m = `❌ ${name}`; console.log(m); fails.push(m); }
}
assert("BUYBACK count=1", feat.events.BUYBACK.count === 1);
assert("BUYBACK hasRecent(≤30d)=true", feat.events.BUYBACK.hasRecent === true);
assert("DIVIDEND_INCREASE count=1", feat.events.DIVIDEND_INCREASE.count === 1);
assert("STOCK_SPLIT 窗口外 count=0", feat.events.STOCK_SPLIT.count === 0);
assert("totalEvents=2（窗口内）", feat.totalEvents === 2);
assert("跨 symbol 隔离（不含 9999 的消却）", feat.events.TREASURY_SHARE_CANCELLATION.count === 0);
const matches = extractEventMatches(discs);
assert("extractEventMatches 命中 4 事件（含窗口外/跨symbol）", matches.length === 4);

console.log(`\n结果：${pass} PASS / ${fail} FAIL`);
if (fail > 0) { console.error("\n未通过:"); fails.forEach((f) => console.error("  " + f)); process.exit(1); }
console.log("TDnet Feature PASS ✅");
process.exit(0);
