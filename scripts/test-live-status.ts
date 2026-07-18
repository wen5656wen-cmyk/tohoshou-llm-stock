// P13-DECISION-06 · Live 状态派生 SSOT 单元测试
// 运行：npm run test:live-status
import { deriveLiveStatus, marketPhase, isRefreshWindow, type LiveStatus, type LiveStatusInput } from "../lib/decision/live-status";

let pass = 0, fail = 0;
function check(name: string, got: LiveStatus, want: LiveStatus) {
  if (got === want) { pass++; console.log(`✅ ${name} → ${got}`); }
  else { fail++; console.log(`❌ ${name} → got ${got}, want ${want}`); }
}
const base: LiveStatusInput = { price: null, entryLow: 1409, entryHigh: 1482, target: 1671, stop: 1337 };

// 8 项必测覆盖
check("现价在买区(1438∈1409~1482)", deriveLiveStatus({ ...base, price: 1438 }), "IN_ZONE");
check("现价低于买区(1400<1409)",     deriveLiveStatus({ ...base, price: 1400 }), "BELOW_ZONE");
check("现价高于买区(1500>1482)",     deriveLiveStatus({ ...base, price: 1500 }), "ABOVE_ZONE");
check("达到目标(1680≥1671)",         deriveLiveStatus({ ...base, price: 1680 }), "REACHED_TARGET");
check("跌破止损(1330≤1337)",         deriveLiveStatus({ ...base, price: 1330 }), "BELOW_STOP");
check("缺现价→等待行情",             deriveLiveStatus({ ...base, price: null }), "WAIT_QUOTE");
check("缺买区/目标/止损→暂无数据",   deriveLiveStatus({ price: 1438, entryLow: null, entryHigh: null, target: null, stop: null }), "NO_ZONE");
check("已取消关注",                  deriveLiveStatus({ ...base, price: 1438, muted: true }), "CANCELLED");

// 优先级与边界
check("止损优先于买区(1337≤stop)",   deriveLiveStatus({ ...base, price: 1337 }), "BELOW_STOP");
check("目标优先于高于买区",          deriveLiveStatus({ ...base, price: 1671 }), "REACHED_TARGET");
check("买区上沿(1482)=在买区",       deriveLiveStatus({ ...base, price: 1482 }), "IN_ZONE");
check("买区下沿(1409)=在买区",       deriveLiveStatus({ ...base, price: 1409 }), "IN_ZONE");
check("仅止损无买区未触发→NO_ZONE",  deriveLiveStatus({ price: 1500, entryLow: null, entryHigh: null, target: null, stop: 1300 }), "NO_ZONE");
check("取消优先于一切",              deriveLiveStatus({ price: null, entryLow: null, entryHigh: null, target: null, stop: null, muted: true }), "CANCELLED");

// 市场阶段（纯函数，传入固定 UTC 时刻）
// 2026-07-17 是周五交易日；构造对应 UTC 时刻验证 PRE/OPEN/CLOSED
const dOpen = new Date("2026-07-17T01:00:00Z");   // 10:00 JST → OPEN + 刷新窗口
const dPre  = new Date("2026-07-16T23:30:00Z");   // 08:30 JST(07-17) → PRE
const dClosed = new Date("2026-07-17T07:00:00Z"); // 16:00 JST → CLOSED
const dWeekend = new Date("2026-07-18T03:00:00Z");// 周六 → CLOSED
function checkP(name: string, got: string, want: string) { if (got === want) { pass++; console.log(`✅ ${name} → ${got}`); } else { fail++; console.log(`❌ ${name} → got ${got}, want ${want}`); } }
checkP("周五10:00 JST=OPEN", marketPhase(dOpen), "OPEN");
checkP("周五08:30 JST=PRE", marketPhase(dPre), "PRE");
checkP("周五16:00 JST=CLOSED", marketPhase(dClosed), "CLOSED");
checkP("周六=CLOSED", marketPhase(dWeekend), "CLOSED");
checkP("周六非刷新窗口", String(isRefreshWindow(dWeekend)), "false");
checkP("周五10:00刷新窗口", String(isRefreshWindow(dOpen)), "true");

console.log(`\n${fail === 0 ? "✅ ALL PASS" : "❌ FAIL"}  ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
