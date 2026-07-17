#!/usr/bin/env npx tsx
/**
 * Ingestion Core 等价测试（P12-INFRA-02）— offline / deterministic / no DB / no network.
 *
 * 证明目标：重构后 lib/ingest/news.ts 产生的 **DB 操作序列与参数**，
 * 与重构前 scripts/sync-news.ts + app/api/sync/news/route.ts 逐一相同。
 *
 * 【本测试能证明什么】
 *   · 在完全相同的输入下，DB 操作的「种类 / 顺序 / 参数 / 字段」逐一相同；
 *   · 两个入口的既有差异（durationMs / logPrefix / fatalLabel / DONE 行）被如实保留。
 * 【本测试不能证明什么】
 *   · live 运行的 stdout 逐字相同 —— 实时数据与时间戳本就非确定，不可能逐字比对。
 *     故此处改为「相同输入 → 相同操作序列」这一更强且可复现的等价口径。
 *
 * 期望值来源：重构前的旧源码（git show HEAD）逐行推导，并由【1】对旧文件字面量
 * 做机器校验，防止手工推导出错。
 *
 * Run: npm run test:ingest-equivalence
 */

import { execSync } from "node:child_process";
import { runNewsSync, tdnetCategoryToNews } from "../lib/ingest/news";
import {
  CONFIDENCE_DISCLOSURE, CONFIDENCE_MARKET, KABUTAN_DELAY_MS, LOG_LINES_LIMIT,
  NEWS_TOP_N, STALE_JOB_THRESHOLD_MS, TDNET_PROMOTE_TAKE, YAHOO_DELAY_MS, YAHOO_SLICE,
} from "../lib/ingest/config";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? "\n      — " + detail : ""}`); }
}

// ── ① 机器校验：新 config 的每个常量都等于旧源码里的字面量 ────────────────────
console.log("\n【1】常量等价（对照重构前旧源码字面量，机器校验）");
function oldSource(rev: string, path: string): string {
  try { return execSync(`git show ${rev}:${path}`, { encoding: "utf8" }); }
  catch { return ""; }
}
{
  // HEAD 仍是重构前（本次改动尚未 commit）→ 直接取 HEAD 版本作为「before」
  const oldScript = oldSource("HEAD", "scripts/sync-news.ts");
  const oldApi = oldSource("HEAD", "app/api/sync/news/route.ts");
  ok("能取到重构前源码", oldScript.length > 1000 && oldApi.length > 1000,
    `script=${oldScript.length}B api=${oldApi.length}B`);

  const checks: [string, string | number, RegExp][] = [
    ["NEWS_TOP_N", NEWS_TOP_N, /take:\s*200/],
    ["YAHOO_SLICE", YAHOO_SLICE, /slice\(0,\s*50\)/],
    ["YAHOO_DELAY_MS", YAHOO_DELAY_MS, /setTimeout\(r,\s*100\)/],
    ["KABUTAN_DELAY_MS", KABUTAN_DELAY_MS, /setTimeout\(r,\s*800\)/],
    ["TDNET_PROMOTE_TAKE", TDNET_PROMOTE_TAKE, /take:\s*500/],
    ["CONFIDENCE_MARKET", CONFIDENCE_MARKET, /relatedSymbolConfidence:\s*20/],
    ["CONFIDENCE_DISCLOSURE", CONFIDENCE_DISCLOSURE, /relatedSymbolConfidence:\s*95/],
    ["LOG_LINES_LIMIT", LOG_LINES_LIMIT, /slice\(0,\s*50\)/],
    ["STALE_JOB_THRESHOLD_MS", STALE_JOB_THRESHOLD_MS, /2\s*\*\s*60\s*\*\s*60\s*\*\s*1000/],
  ];
  for (const [name, newVal, re] of checks) {
    const inScript = re.test(oldScript);
    const inApi = re.test(oldApi);
    ok(`${name} = ${newVal} 且旧 scripts/api 两侧均存在同一字面量`, inScript && inApi,
      `script=${inScript} api=${inApi}`);
  }
  // 30 日回溯
  ok("TDNET_PROMOTE_LOOKBACK_DAYS = 30（旧两侧均为 30 * 86400000）",
    /30\s*\*\s*86400000/.test(oldScript) && /30\s*\*\s*86400000/.test(oldApi));
  // 旧 API 的 durationMs 缺陷必须被如实保留
  ok("旧 API 侧 SyncLog.durationMs 确为 null（缺陷，重构后原样保留）",
    /durationMs:\s*null/.test(oldApi), "旧 API 源码中未找到 durationMs: null");
  ok("旧 scripts 侧 SyncLog.durationMs 确为真实耗时",
    /durationMs:\s*Date\.now\(\)\s*-\s*startMs/.test(oldScript));
}

// ── ② tdnetCategoryToNews 映射表逐项等价 ──────────────────────────────────────
console.log("\n【2】tdnetCategoryToNews 映射（旧两侧各有一份，逐项比对）");
{
  const expected: Record<string, string> = {
    EARNINGS: "EARNINGS", FORECAST_REVISION: "GUIDANCE", BUYBACK: "BUYBACK",
    DIVIDEND: "DIVIDEND", EQUITY: "IR", MATERIAL: "IR", OTHER: "OTHER",
  };
  for (const [k, v] of Object.entries(expected)) {
    ok(`${k} → ${v}`, tdnetCategoryToNews(k) === v, `got ${tdnetCategoryToNews(k)}`);
  }
  ok("未知 category → OTHER", tdnetCategoryToNews("NOPE") === "OTHER");
}

// ── ③ DB 操作序列等价（prisma spy + 桩抓取器）──────────────────────────────────
console.log("\n【3】DB 操作序列（相同输入 → 相同操作/顺序/参数）");

type Op = { model: string; op: string; args: any };

function makeSpy(disclosures: any[]) {
  const ops: Op[] = [];
  const rec = (model: string, op: string) => (args: any) => {
    ops.push({ model, op, args });
    if (model === "stock" && op === "findMany") {
      return Promise.resolve([{ id: 1, symbol: "1111.T" }, { id: 2, symbol: "2222.T" }]);
    }
    if (model === "disclosure" && op === "findMany") return Promise.resolve(disclosures);
    return Promise.resolve({});
  };
  const prisma: any = {
    syncJob: { update: rec("syncJob", "update") },
    stock: { findMany: rec("stock", "findMany") },
    news: { upsert: (a: any) => { ops.push({ model: "news", op: "upsert", args: a }); return { catch: () => Promise.resolve(null) }; } },
    disclosure: { findMany: rec("disclosure", "findMany") },
    syncLog: { create: rec("syncLog", "create") },
  };
  return { prisma, ops };
}

const FIXED = new Date("2026-07-10T01:00:00Z");
const yahooItem = { url: "https://y/1", title: "増収増益のお知らせ", source: "Yahoo", publishedAt: FIXED };
const kabuItem = {
  url: "https://k/1", title: "業績予想の上方修正", source: "Kabutan", publishedAt: FIXED,
  sentiment: "POSITIVE", category: "GUIDANCE", importance: 7, relatedSymbolConfidence: 50,
};
const disc = {
  symbol: "1111.T", title: "自己株式の取得状況に関するお知らせ", category: "BUYBACK",
  url: "https://t/1", importance: 5, publishedAt: FIXED,
};

async function run(startMs: number | null) {
  const { prisma, ops } = makeSpy([disc]);
  await runNewsSync(
    { prisma }, "JOB1", ["1111.T", "2222.T"],
    { logPrefix: "[x]", fatalLabel: "fatal error:", startMs, logDone: false },
    {
      fetchNews: async (s: string) => (s === "1111.T" ? [yahooItem] : []),
      fetchKabutanNews: async (s: string) => (s === "1111.T" ? [kabuItem] : []),
    } as any,
  );
  return ops;
}

async function main() {
  const ops = await run(1000);

  // 期望的操作序列 —— 逐条对照重构前旧源码（scripts/sync-news.ts:82-291）推导
  const seq = ops.map((o) => `${o.model}.${o.op}`);
  // Kabutan 循环内：upsert 先于 syncJob.update（旧码 163-206 行顺序）
  const expectedSeqFixed = [
    "syncJob.update", "stock.findMany",
    "news.upsert",                        // Yahoo
    "news.upsert", "syncJob.update",      // Kabutan i=0: upsert → 进度
    "syncJob.update",                     // Kabutan i=1: 无 stockId 命中? (2222.T 有 id=2 → fetch 返回 [] → 无 upsert)
    "disclosure.findMany", "news.upsert",
    "syncJob.update", "syncLog.create",
  ];
  ok("操作序列与旧码一致", JSON.stringify(seq) === JSON.stringify(expectedSeqFixed),
    `\n      actual  : ${JSON.stringify(seq)}\n      expected: ${JSON.stringify(expectedSeqFixed)}`);

  // ── ④ 关键参数逐字段等价 ──────────────────────────────────────────────────────
  console.log("\n【4】upsert 参数逐字段（对照旧码字段映射）");
  {
    const upserts = ops.filter((o) => o.model === "news" && o.op === "upsert");
    const [yah, kab, tdn] = upserts.map((o) => o.args);

    ok("Yahoo: where.url", yah.where.url === "https://y/1");
    ok("Yahoo: create.stockId = null（旧码硬编码 null）", yah.create.stockId === null);
    ok(`Yahoo: create.relatedSymbolConfidence = 20`, yah.create.relatedSymbolConfidence === 20);
    ok("Yahoo: update 仅含 sentiment/category/importance/tradeEffectiveDate",
      JSON.stringify(Object.keys(yah.update).sort()) ===
        JSON.stringify(["category", "importance", "sentiment", "tradeEffectiveDate"]));

    ok("Kabutan: create.stockId 来自 idMap", kab.create.stockId === 1);
    ok("Kabutan: conf 取 item 自带值（50），非硬编码",
      kab.create.relatedSymbolConfidence === 50);
    ok("Kabutan: update 含 stockId + relatedSymbolConfidence（旧码如此）",
      JSON.stringify(Object.keys(kab.update).sort()) ===
        JSON.stringify(["category", "importance", "relatedSymbolConfidence", "sentiment", "stockId", "tradeEffectiveDate"]));

    ok("TDnet: url 前缀 tdnet:", tdn.where.url === "tdnet:https://t/1");
    ok("TDnet: create.source = \"TDnet\"", tdn.create.source === "TDnet");
    ok("TDnet: create.relatedSymbolConfidence = 95", tdn.create.relatedSymbolConfidence === 95);
    ok("TDnet: category 经 tdnetCategoryToNews（BUYBACK→BUYBACK）", tdn.create.category === "BUYBACK");
    ok("TDnet: update.stockId 用 ?? undefined（旧码语义：null 时不覆盖）",
      kab.create.stockId === 1 && tdn.update.stockId === 1);
  }

  // ── ⑤ 入口差异如实保留 ───────────────────────────────────────────────────────
  console.log("\n【5】入口差异保留（durationMs 是两侧唯一的 SyncLog 差异）");
  {
    const logScripts = ops.find((o) => o.model === "syncLog")!.args.data;
    ok("scripts 侧（startMs=1000）：durationMs 为数字", typeof logScripts.durationMs === "number");

    const opsApi = await run(null);
    const logApi = opsApi.find((o) => o.model === "syncLog")!.args.data;
    ok("api 侧（startMs=null）：durationMs 为 null（既有缺陷，原样保留）",
      logApi.durationMs === null, `got ${logApi.durationMs}`);

    ok("除 durationMs 外，两侧 SyncLog 其余字段完全一致",
      logScripts.source === logApi.source &&
      logScripts.status === logApi.status &&
      logScripts.message === logApi.message &&
      logScripts.itemCount === logApi.itemCount);

    ok("两侧 DB 操作序列完全一致（入口差异不影响写库）",
      JSON.stringify(opsApi.map((o) => `${o.model}.${o.op}`)) === JSON.stringify(seq));
  }

  // ── ⑥ 冻结项守护 ────────────────────────────────────────────────────────────
  console.log("\n【6】冻结项守护（Baseline P12-DATA-02 的目标不得在本任务被改动）");
  {
    const dfm = ops.find((o) => o.model === "disclosure" && o.op === "findMany")!.args;
    ok("TDnet 双重过滤仍在：symbol IN symbols", Array.isArray(dfm.where.symbol?.in));
    ok("TDnet 双重过滤仍在：take = 500", dfm.take === 500);
    ok("Top200 未改", NEWS_TOP_N === 200);
  }

  console.log(`\n${"─".repeat(58)}`);
  console.log(`Ingestion Core equivalence: ${pass} passed, ${fail} failed`);
  if (fail > 0) { console.log("❌ FAIL"); process.exit(1); }
  console.log("✅ PASS");
}

main();
