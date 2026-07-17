#!/usr/bin/env npx tsx
/**
 * EventType 分类器自动测试（P12-DATA-01 · Phase 6）— offline / deterministic / no DB / no network.
 *
 * 守护 P11 用生产数据换来的教训：
 *   · BUYBACK 三阶段（新决议 / 进度月报 / 取得終了）必须被区分开 ——
 *     P11-ARCH-02 Shadow 证明混为一谈会把 82.7% 的法定月报变成买入信号；
 *   · 「第三者割当による新株予約権」（MSワラント · 真融资）不得被误判为员工期权 ——
 *     ARCH-02 的临时分桶脚本正是栽在这个顺序上；
 *   · 「子会社への増資」是对外投资，不是自身股权融资；
 *   · 无法可靠判定子类时必须 UNKNOWN，不猜（Disclosure 无正文）。
 *
 * Fixtures 均为生产库真实标题（P11-ARCH-02 实测样本）。
 *
 * Run: npm run test:event-classify
 */

import { classifyEventType } from "../lib/events/classify";
import { EVENT_TYPE_VERSION, EVENT_TYPES, type EventType } from "../lib/events/types";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? "  — " + detail : ""}`); }
}

function expectType(title: string, category: string | null, want: EventType, label?: string) {
  const r = classifyEventType({ title, category });
  ok(
    label ?? `${want.padEnd(24)} ← ${title.slice(0, 34)}`,
    r.eventType === want,
    `got ${r.eventType} (conf=${r.confidence} method=${r.method} ev=${r.evidence.join("|")})`,
  );
  return r;
}

// ── 1. BUYBACK 三阶段（+ 消却/処分）—— P11 核心教训 ──────────────────────────
console.log("\n【1】BUYBACK 五分（真实生产标题）");
expectType("自己株式の取得状況に関するお知らせ", "BUYBACK", "BUYBACK_PROGRESS");
expectType("自己株式の取得状況及び取得終了に関するお知らせ", "BUYBACK", "BUYBACK_COMPLETED");
expectType("自己株式の取得に係る事項の決定に関するお知らせ", "BUYBACK", "BUYBACK_ANNOUNCEMENT");
expectType("自己株式の消却に関するお知らせ", "BUYBACK", "BUYBACK_CANCELLATION");
expectType("自己株式の処分に関するお知らせ", "BUYBACK", "BUYBACK_DISPOSAL");
// 真实长标题（含会社法条款括注），务必不被括注干扰
expectType(
  "自己株式の取得状況に関するお知らせ（会社法第459条第1項の規定による当社定款の定めに基づく自己株式の取得）",
  "BUYBACK", "BUYBACK_PROGRESS",
  "BUYBACK_PROGRESS ← 含「取得」括注仍判进度月报（不得误升为新决议）",
);
// 「取得状況及び取得終了」同时含两词 → 必须 COMPLETED 而非 PROGRESS
{
  const r = classifyEventType({ title: "自己株式の取得状況及び取得終了に関するお知らせ", category: "BUYBACK" });
  ok("BUYBACK 顺序：終了 优先于 状況", r.eventType === "BUYBACK_COMPLETED", `got ${r.eventType}`);
}

// ── 2. 财报 vs 业绩修正 ──────────────────────────────────────────────────────
console.log("\n【2】财报 / 业绩预想修正");
expectType("2026年3月期 第1四半期決算短信〔日本基準〕（連結）", "EARNINGS", "EARNINGS");
expectType("業績予想の上方修正に関するお知らせ", "FORECAST_REVISION", "GUIDANCE_UP");
expectType("通期業績予想の下方修正に関するお知らせ", "FORECAST_REVISION", "GUIDANCE_DOWN");
expectType("業績予想の修正に関するお知らせ", "FORECAST_REVISION", "GUIDANCE_REVISION",
  "GUIDANCE_REVISION ← 方向未言明时不得臆断上/下修");

// ── 3. 増資 vs 株式分割 vs 员工期权（顺序陷阱）───────────────────────────────
console.log("\n【3】EQUITY 拆分（ARCH-02 顺序 bug 的回归守护）");
expectType("株式報酬型ストック・オプション（新株予約権）の発行に関するお知らせ", "EQUITY", "EQUITY_STOCK_OPTION");
expectType("募集新株予約権(有償ストック・オプション)の発行に関するお知らせ", "EQUITY", "EQUITY_STOCK_OPTION",
  "EQUITY_STOCK_OPTION ← 含「募集」仍须判员工期权（SO 规则优先于融资规则）");
expectType(
  "第三者割当による第14回新株予約権（行使価額修正条項付）の発行に係る払込完了に関するお知らせ",
  "EQUITY", "EQUITY_FINANCING",
  "EQUITY_FINANCING ← MSワラント 必须判真融资（ARCH-02 曾误判为员工期权）",
);
expectType("第三者割当による新株式発行（現物出資）の払込日の確定に関するお知らせ", "EQUITY", "EQUITY_FINANCING");
expectType(
  "新株予約権付社債発行プログラム設定契約に基づく第三者割当による第２回無担保転換社債型新株予約権付社債の発行",
  "EQUITY", "EQUITY_FINANCING",
);
expectType("株式分割及び定款の一部変更に関するお知らせ", "OTHER", "STOCK_SPLIT",
  "STOCK_SPLIT ← 不得被 GOVERNANCE（定款変更）抢先");
expectType("子会社への増資および特定子会社の異動に関するお知らせ", "EQUITY", "SUBSIDIARY_CHANGE",
  "SUBSIDIARY_CHANGE ← 「子会社への増資」是对外投资，非自身稀释");

// ── 3b. Shadow v1 首跑暴露的过匹配 bug（回归守护）─────────────────────────────
console.log("\n【3b】过匹配回归（Shadow 首跑实测捕获，真实生产标题）");
expectType("譲渡制限付株式報酬としての自己株式処分に関するお知らせ", "OTHER", "EQUITY_STOCK_OPTION",
  "EQUITY_STOCK_OPTION ← RS 薪酬用「自己株式処分」，不得误判为 BUYBACK_DISPOSAL");
expectType("従業員持株会に対する譲渡制限付株式としての自己株式処分に関するお知らせ", "OTHER", "EQUITY_STOCK_OPTION");
expectType("譲渡制限付株式報酬としての自己株式の処分の払込完了に関するお知らせ", "OTHER", "EQUITY_STOCK_OPTION",
  "EQUITY_STOCK_OPTION ← 含「完了」不得误判为 BUYBACK_COMPLETED");
expectType("（開示事項の経過）大英エレクトロニクス株式会社の株式取得（子会社化）完了のお知らせ", "OTHER", "M_AND_A",
  "M_AND_A ← 「株式取得…完了」是并购，不得误判为 BUYBACK_COMPLETED（裸 /取得.完了/ 之祸）");
expectType("当社が保有する子会社株式等についての処分禁止の仮処分命令の発令に関するお知らせ", "OTHER", "LEGAL_RISK",
  "LEGAL_RISK ← 「仮処分命令」是法律风险，不得误判为 BUYBACK_DISPOSAL");
// News 与 TDnet 使用两套不同 category 词表，corroborates 必须同时覆盖
{
  const r = classifyEventType({ title: "業績予想の上方修正に関するお知らせ", category: "GUIDANCE" });
  ok("News 词表 category=GUIDANCE 可佐证 → COMBINED_RULE",
    r.eventType === "GUIDANCE_UP" && r.method === "COMBINED_RULE", `got ${r.eventType}/${r.method}`);
}
{
  const r = classifyEventType({ title: "日経平均は続伸", category: "MARKET" });
  ok("News 词表 category=MARKET → OTHER（可识别但在 taxonomy 之外，非 UNKNOWN）",
    r.eventType === "OTHER" && r.method === "CATEGORY_RULE", `got ${r.eventType}/${r.method}`);
}

// ── 4. UNKNOWN 回退 ─────────────────────────────────────────────────────────
console.log("\n【4】UNKNOWN 诚实回退");
{
  // category=BUYBACK 但标题无任何子类线索 → 新决议与月报含义相反，必须 UNKNOWN
  const r = classifyEventType({ title: "お知らせ", category: "BUYBACK" });
  ok("category=BUYBACK 无标题线索 → UNKNOWN（禁止 category 直接等同 EventType）",
    r.eventType === "UNKNOWN" && r.method === "FALLBACK", `got ${r.eventType}/${r.method}`);
  ok("UNKNOWN 保留 category 证据", r.evidence.includes("category:BUYBACK"), r.evidence.join("|"));
}
{
  const r = classifyEventType({ title: "", category: "EARNINGS" });
  ok("空标题 → UNKNOWN", r.eventType === "UNKNOWN" && r.evidence.includes("empty_title"), `got ${r.eventType}`);
}
{
  const r = classifyEventType({ title: "本日の当社に関するお知らせ", category: null });
  ok("无 category + 无规则命中 → UNKNOWN", r.eventType === "UNKNOWN", `got ${r.eventType}`);
}

// ── 5. 幂等性 / 纯函数 ──────────────────────────────────────────────────────
console.log("\n【5】幂等性与纯函数");
{
  const input = { title: "自己株式の取得状況に関するお知らせ", category: "BUYBACK" };
  const a = classifyEventType(input);
  const b = classifyEventType(input);
  const c = classifyEventType({ ...input });
  ok("同一输入重复调用结果完全一致",
    JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(b) === JSON.stringify(c));
  const frozen = JSON.stringify(input);
  classifyEventType(input);
  ok("不修改入参（无副作用）", JSON.stringify(input) === frozen);
}
{
  // 全角空格归一化：TDnet 标题常含全角空格
  const a = classifyEventType({ title: "自己株式の取得状況に関するお知らせ", category: "BUYBACK" });
  const b = classifyEventType({ title: "自己株式の　取得状況に関する　お知らせ", category: "BUYBACK" });
  ok("全角空格归一化后结果一致", a.eventType === b.eventType, `${a.eventType} vs ${b.eventType}`);
}

// ── 6. 契约不变量 ───────────────────────────────────────────────────────────
console.log("\n【6】契约不变量（ADR-001 / ADR-003）");
{
  const samples = [
    { title: "自己株式の取得状況に関するお知らせ", category: "BUYBACK" },
    { title: "業績予想の上方修正に関するお知らせ", category: "FORECAST_REVISION" },
    { title: "決算短信〔日本基準〕", category: "EARNINGS" },
    { title: "訴訟の提起に関するお知らせ", category: "MATERIAL" },
    { title: "お知らせ", category: null },
  ];
  const results = samples.map((s) => classifyEventType(s));
  ok("eventType 全部属于 EVENT_TYPES 枚举",
    results.every((r) => (EVENT_TYPES as readonly string[]).includes(r.eventType)));
  ok("version 恒为 " + EVENT_TYPE_VERSION, results.every((r) => r.version === EVENT_TYPE_VERSION));
  ok("confidence 为离散档位 {0,50,85,95}",
    results.every((r) => [0, 50, 85, 95].includes(r.confidence)),
    results.map((r) => r.confidence).join(","));
  ok("evidence 非空", results.every((r) => r.evidence.length > 0));
  // ADR-003：EventType 不得表达方向
  ok("枚举不含 POSITIVE / NEGATIVE",
    !(EVENT_TYPES as readonly string[]).some((t) => /POSITIVE|NEGATIVE/.test(t)));
  ok("返回结构不含 direction / sentiment 字段",
    results.every((r) => !("direction" in r) && !("sentiment" in r)));
}

// ── 汇总 ────────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(58)}`);
console.log(`EventType classifier ${EVENT_TYPE_VERSION}: ${pass} passed, ${fail} failed`);
if (fail > 0) { console.log("❌ FAIL"); process.exit(1); }
console.log("✅ PASS");
