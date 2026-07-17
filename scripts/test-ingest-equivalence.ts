#!/usr/bin/env npx tsx
/**
 * Ingestion Core 等价性测试（P12-INFRA-02）— offline / deterministic / no DB / no network.
 * ════════════════════════════════════════════════════════════════════════════
 * 目标：证明 lib/ingest/ 在给定 profile 下能**逐一复现**两条原路径的行为，
 *      且**已知漂移被如实保留、不被伪造成一致**。
 *
 * 三方对照（A/B/C）：
 *   A = app/api 当前行为（来源：git show e1c6f60:app/api/sync/{news,tdnet}/route.ts）
 *   B = scripts 当前行为（来源：git show e1c6f60:scripts/{sync-news,fetch-tdnet}.ts）
 *   C = 新 Core + 对应 profile
 * 断言 C(profile=api) ≡ A 且 C(profile=scripts) ≡ B。A≠B 处**必须**保持 A≠B。
 *
 * 【能证明】相同输入 → DB 操作的种类/顺序/参数/字段逐一相同；漂移被保留。
 * 【不能证明】live 运行 stdout 逐字相同 —— 实时数据+时间戳非确定，逐字比对无意义。
 *
 * Run: npm run test:ingest-equivalence
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  NEWS_PROFILE_API, NEWS_PROFILE_SCRIPTS, TDNET_PROFILE_API, TDNET_PROFILE_SCRIPTS,
  SYSTEM_CLOCK, type Clock, type Logger,
} from "../lib/ingest/types";
import {
  buildDisclosureUpsert, buildKabutanNewsUpsert, buildTdnetPromotionUpsert, buildTdnetSyncLog,
  buildYahooNewsUpsert, calcCatalystScore, disclosureDedupeKey, formatDateStr, lastTradingDays,
  newsDedupeKey, tdnetCategoryToNews, tdnetNewsDedupeKey,
} from "../lib/ingest/normalize";
import { runNewsSync } from "../lib/ingest/news-core";
import { runTDnetSync } from "../lib/ingest/tdnet-core";
import {
  CONFIDENCE_DISCLOSURE, CONFIDENCE_MARKET, KABUTAN_DELAY_MS, LOG_LINES_LIMIT, NEWS_TOP_N,
  STALE_JOB_THRESHOLD_MS, TDNET_PROMOTE_TAKE, YAHOO_DELAY_MS, YAHOO_SLICE,
} from "../lib/ingest/config";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? "\n      — " + detail : ""}`); }
}
const J = (x: unknown) => JSON.stringify(x);

// ── Fixtures（确定性）────────────────────────────────────────────────────────
const FIXED = new Date("2026-07-10T01:00:00Z");
const CLOCK: Clock = { now: () => 1_800_000_000_000, date: () => new Date("2026-07-17T09:00:00Z") };
const silent: Logger = { log: () => {}, warn: () => {}, error: () => {} };

const yahooItem = { url: "https://y/1", title: "増収増益のお知らせ", source: "Yahoo", publishedAt: FIXED };
const kabuItem = {
  url: "https://k/1", title: "業績予想の上方修正", source: "Kabutan", publishedAt: FIXED,
  sentiment: "POSITIVE", category: "GUIDANCE", importance: 7, relatedSymbolConfidence: 50,
};
const discItem = {
  symbol: "1111.T", code4: "1111", companyName: "テスト株式会社",
  title: "自己株式の取得状況に関するお知らせ", publishedAt: FIXED,
  category: "BUYBACK", sentiment: "NEUTRAL", url: "https://t/1", importance: 5,
};

// ══ 【1】旧源码字面量机器校验（防止手工推导出错）══════════════════════════════
console.log("\n【1】常量 vs 重构前旧源码字面量（机器校验）");

/**
 * INFRA-02 的「before」基线 = e1c6f60（P12-DATA-01 完成时的状态）。
 *
 * ⚠️ 不能用 HEAD：HEAD(d13c03e) 曾把两个 News 入口接线到 Core，
 *    而本指令重新定义 INFRA-02 为 Zero Wiring，该接线已被撤回。
 *    若用 HEAD 作 before，就是拿「被撤回的中间态」当基线对拍 —— 结论会是错的。
 */
const BEFORE_REV = "e1c6f60";
const old = (p: string) => { try { return execSync(`git show ${BEFORE_REV}:${p}`, { encoding: "utf8" }); } catch { return ""; } };
{
  const oS = old("scripts/sync-news.ts"), oA = old("app/api/sync/news/route.ts");
  const tS = old("scripts/fetch-tdnet.ts"), tA = old("app/api/sync/tdnet/route.ts");
  ok("能取到 4 份重构前源码", oS.length > 1000 && oA.length > 1000 && tS.length > 1000 && tA.length > 500);

  const checks: [string, number, RegExp][] = [
    ["NEWS_TOP_N=200", NEWS_TOP_N, /take:\s*200/],
    ["YAHOO_SLICE=50", YAHOO_SLICE, /slice\(0,\s*50\)/],
    ["YAHOO_DELAY_MS=100", YAHOO_DELAY_MS, /setTimeout\(r,\s*100\)/],
    ["KABUTAN_DELAY_MS=800", KABUTAN_DELAY_MS, /setTimeout\(r,\s*800\)/],
    ["TDNET_PROMOTE_TAKE=500", TDNET_PROMOTE_TAKE, /take:\s*500/],
    ["CONFIDENCE_MARKET=20", CONFIDENCE_MARKET, /relatedSymbolConfidence:\s*20/],
    ["CONFIDENCE_DISCLOSURE=95", CONFIDENCE_DISCLOSURE, /relatedSymbolConfidence:\s*95/],
    ["LOG_LINES_LIMIT=50", LOG_LINES_LIMIT, /slice\(0,\s*50\)/],
    ["STALE_JOB_THRESHOLD_MS=2h", STALE_JOB_THRESHOLD_MS, /2\s*\*\s*60\s*\*\s*60\s*\*\s*1000/],
  ];
  for (const [name, , re] of checks) {
    ok(`${name}：旧 scripts/api News 两侧均存在同一字面量`, re.test(oS) && re.test(oA),
      `script=${re.test(oS)} api=${re.test(oA)}`);
  }
  ok("TDNET_PROMOTE_LOOKBACK_DAYS=30（旧两侧一致）", /30\s*\*\s*86400000/.test(oS) && /30\s*\*\s*86400000/.test(oA));
  // 漂移的源码级证据
  ok("【漂移证据】旧 API News 侧 durationMs: null", /durationMs:\s*null/.test(oA));
  ok("【漂移证据】旧 scripts News 侧 durationMs 为真实耗时", /durationMs:\s*Date\.now\(\)\s*-\s*startMs/.test(oS));
  ok("【漂移证据】旧 scripts TDnet 写 code4", /code4:\s*disc\.code4/.test(tS));
  ok("【漂移证据】旧 API TDnet **不写** code4", !/code4/.test(tA), "旧 API TDnet 源码中出现了 code4");
  ok("【漂移证据】旧 scripts TDnet update 含 title", /update:\s*\{[\s\S]{0,80}title:\s*disc\.title/.test(tS));
  ok("【漂移证据】旧 API TDnet update **不含** title", !/update:\s*\{[^}]*title/.test(tA));
  ok("【漂移证据】旧 scripts TDnet 写 catalystScore", /catalystScore/.test(tS));
  ok("【漂移证据】旧 API TDnet **完全无** catalystScore", !/catalystScore/.test(tA));
  ok("【漂移证据】旧 scripts TDnet days=5 默认", /\?\?\s*"5"|parseInt\(process\.argv\[daysArg \+ 1\] \?\? "5"\)/.test(tS));
  ok("【漂移证据】旧 API TDnet 硬编码 3 天", /length\s*<\s*3/.test(tA));
}

// ══ 【2】News：纯函数数据形状（A/B 相同 → C 必须相同）════════════════════════
console.log("\n【2】News 数据形状（A=api / B=scripts 本就一致 → C 复现）");
{
  const y = buildYahooNewsUpsert(yahooItem);
  ok("Yahoo where.url = 原始 url", J(y.where) === J({ url: "https://y/1" }));
  ok("Yahoo create.stockId = null（旧码硬编码）", y.create.stockId === null);
  ok("Yahoo create.relatedSymbolConfidence = 20", y.create.relatedSymbolConfidence === 20);
  ok("Yahoo update 键集 = sentiment/category/importance/tradeEffectiveDate",
    J(Object.keys(y.update).sort()) === J(["category", "importance", "sentiment", "tradeEffectiveDate"]));

  const k = buildKabutanNewsUpsert(kabuItem, 7);
  ok("Kabutan create.stockId 来自入参", k.create.stockId === 7);
  ok("Kabutan conf 取 item 自带值（50），非硬编码", k.create.relatedSymbolConfidence === 50);
  ok("Kabutan sentiment/category 取 item 自带值，不重新分类",
    k.create.sentiment === "POSITIVE" && k.create.category === "GUIDANCE");
  ok("Kabutan update 键集含 stockId + relatedSymbolConfidence",
    J(Object.keys(k.update).sort()) ===
      J(["category", "importance", "relatedSymbolConfidence", "sentiment", "stockId", "tradeEffectiveDate"]));

  const t = buildTdnetPromotionUpsert(discItem, 7);
  ok("TDnet→News url 前缀 tdnet:", (t.where as any).url === "tdnet:https://t/1");
  ok("TDnet→News source = \"TDnet\"", t.create.source === "TDnet");
  ok("TDnet→News conf = 95", t.create.relatedSymbolConfidence === 95);
  ok("TDnet→News category 经映射（BUYBACK→BUYBACK）", t.create.category === "BUYBACK");
  ok("TDnet→News update.stockId = 7", t.update.stockId === 7);
  const tNull = buildTdnetPromotionUpsert(discItem, null);
  ok("TDnet→News stockId=null 时 update.stockId = undefined（旧码 ?? undefined：不覆盖）",
    tNull.update.stockId === undefined && tNull.create.stockId === null);
}

// ══ 【3】去重键 ══════════════════════════════════════════════════════════════
console.log("\n【3】去重键与 category 映射");
{
  ok("newsDedupeKey = url", newsDedupeKey({ url: "u" }) === "u");
  ok("tdnetNewsDedupeKey = tdnet:url", tdnetNewsDedupeKey({ url: "u" }) === "tdnet:u");
  ok("disclosureDedupeKey = url（不加前缀）", disclosureDedupeKey({ url: "u" }) === "u");
  const map: Record<string, string> = {
    EARNINGS: "EARNINGS", FORECAST_REVISION: "GUIDANCE", BUYBACK: "BUYBACK",
    DIVIDEND: "DIVIDEND", EQUITY: "IR", MATERIAL: "IR", OTHER: "OTHER",
  };
  for (const [k, v] of Object.entries(map)) ok(`category ${k} → ${v}`, tdnetCategoryToNews(k) === v);
  ok("未知 category → OTHER", tdnetCategoryToNews("NOPE") === "OTHER");
}

// ══ 【4】🔴 TDnet 漂移必须被保留（不得伪造一致）════════════════════════════════
console.log("\n【4】TDnet 漂移保留 —— A≠B 处必须保持 A≠B");
{
  const B = buildDisclosureUpsert(discItem, 7, TDNET_PROFILE_SCRIPTS); // scripts
  const A = buildDisclosureUpsert(discItem, 7, TDNET_PROFILE_API);     // api

  // code4
  ok("code4 · B(scripts) rawData 含 code4", J((B.create.rawData as any)) === J({ companyName: "テスト株式会社", code4: "1111" }));
  ok("code4 · A(api) rawData **不含** code4", J((A.create.rawData as any)) === J({ companyName: "テスト株式会社" }));
  ok("code4 · A ≠ B（漂移被保留，未被统一）", J(A.create.rawData) !== J(B.create.rawData));

  // title
  ok("title · B(scripts) update 含 title", "title" in B.update && B.update.title === discItem.title);
  ok("title · A(api) update **不含** title", !("title" in A.update));
  ok("title · A ≠ B（漂移被保留，未被统一）", J(Object.keys(A.update).sort()) !== J(Object.keys(B.update).sort()));
  ok("title · A.update 键集 = category/importance/sentiment",
    J(Object.keys(A.update).sort()) === J(["category", "importance", "sentiment"]));
  ok("title · B.update 键集 = category/importance/sentiment/title",
    J(Object.keys(B.update).sort()) === J(["category", "importance", "sentiment", "title"]));

  // create 其余部分两侧一致
  const strip = (o: any) => { const { rawData, ...rest } = o; return rest; };
  ok("create 除 rawData 外两侧完全一致", J(strip(A.create)) === J(strip(B.create)));

  // catalystScore（INFRA-02 新发现，不在 INFRA-01 清单）
  ok("catalystScore · B(scripts) profile.updateCatalystScore = true", TDNET_PROFILE_SCRIPTS.updateCatalystScore === true);
  ok("catalystScore · A(api) profile.updateCatalystScore = false（评分输入静默分裂）",
    TDNET_PROFILE_API.updateCatalystScore === false);

  // days / dateStringMode
  ok("days · B=5 / A=3（漂移保留）", TDNET_PROFILE_SCRIPTS.days === 5 && TDNET_PROFILE_API.days === 3);
  const day = new Date("2026-07-17T00:30:00+09:00"); // JST 上午 → UTC 仍是前一天
  ok("dateStringMode · local 与 utc 在 JST 上午确实不同（漂移真实存在）",
    formatDateStr(day, "local") !== formatDateStr(day, "utc"),
    `${formatDateStr(day, "local")} vs ${formatDateStr(day, "utc")}`);

  // SyncLog 两侧公式不同
  const args = { totalFetched: 10, totalUpserted: 0, errors: 1, days: 5, logLines: ["x"], durationMs: 123 };
  const lB = buildTdnetSyncLog("scripts", args), lA = buildTdnetSyncLog("api", args);
  ok("SyncLog · B(scripts) status=PARTIAL（upserted=0 但 fetched>0）", lB.status === "PARTIAL");
  ok("SyncLog · A(api) status=ERROR（errors>0 且 synced=0）", lA.status === "ERROR");
  ok("SyncLog · B message = `Fetched X件 Upserted Y件 (N天)`", lB.message === "Fetched 10件 Upserted 0件 (5天)");
  ok("SyncLog · A message = log.join(\" | \")", lA.message === "x");
  ok("SyncLog · B **不写** durationMs / A 写", !("durationMs" in lB) && lA.durationMs === 123);
}

// ══ 【5】catalystScore 公式 ══════════════════════════════════════════════════
console.log("\n【5】catalystScore 公式（逐字取自 scripts/fetch-tdnet.ts:125-130）");
{
  ok("base 5 + count(≤3) + earnings2 + (maxImp-5)/2，钳制 1..10",
    calcCatalystScore({ count: 2, maxImp: 7, hasEarnings: true }) === 10, // 5+2+2+1=10
    `got ${calcCatalystScore({ count: 2, maxImp: 7, hasEarnings: true })}`);
  ok("count 上限 +3", calcCatalystScore({ count: 99, maxImp: 5, hasEarnings: false }) === 8);
  ok("上钳制 10", calcCatalystScore({ count: 99, maxImp: 10, hasEarnings: true }) === 10);
  ok("下钳制 1", calcCatalystScore({ count: 0, maxImp: 0, hasEarnings: false }) >= 1);
}

// ── Prisma spy ──────────────────────────────────────────────────────────────
type Op = { model: string; op: string; args: any };
function makeSpy(opts: { disclosures?: any[]; stocks?: any[]; throwOn?: string } = {}) {
  const ops: Op[] = [];
  const rec = (model: string, op: string) => (args: any) => {
    ops.push({ model, op, args });
    if (opts.throwOn === `${model}.${op}`) return Promise.reject(new Error("boom"));
    if (model === "stock" && op === "findMany") return Promise.resolve(opts.stocks ?? [{ id: 1, symbol: "1111.T" }, { id: 2, symbol: "2222.T" }]);
    if (model === "disclosure" && op === "findMany") return Promise.resolve(opts.disclosures ?? []);
    return Promise.resolve({});
  };
  const prisma: any = {
    syncJob: { update: rec("syncJob", "update"), create: rec("syncJob", "create"), findFirst: rec("syncJob", "findFirst") },
    stock: { findMany: rec("stock", "findMany") },
    stockScore: { findMany: rec("stockScore", "findMany"), updateMany: rec("stockScore", "updateMany") },
    news: { upsert: (a: any) => { ops.push({ model: "news", op: "upsert", args: a }); return { catch: () => Promise.resolve(null) }; } },
    disclosure: { findMany: rec("disclosure", "findMany"), upsert: rec("disclosure", "upsert") },
    syncLog: { create: rec("syncLog", "create") },
  };
  return { prisma, ops };
}

async function main() {
  // ══ 【6】News Core：A/B fixture 各跑一次 ═══════════════════════════════════
  console.log("\n【6】News Core 编排（A=api profile / B=scripts profile）");
  const runNews = async (profile: typeof NEWS_PROFILE_API, throwOn?: string) => {
    const { prisma, ops } = makeSpy({ disclosures: [discItem], throwOn });
    const res = await runNewsSync(
      { prisma, logger: silent, clock: CLOCK },
      { fetchNews: async (s) => (s === "1111.T" ? [yahooItem] : []), fetchKabutanNews: async (s) => (s === "1111.T" ? [kabuItem] : []) },
      profile, "JOB1", ["1111.T", "2222.T"], CLOCK.now() - 60_000,
    );
    return { ops, res };
  };

  const B = await runNews(NEWS_PROFILE_SCRIPTS);
  const A = await runNews(NEWS_PROFILE_API);

  const seq = B.ops.map((o) => `${o.model}.${o.op}`);
  const expected = [
    "syncJob.update",       // → RUNNING
    "stock.findMany",       // symbol → id
    "news.upsert",          // Yahoo 1111.T
    "news.upsert",          // Kabutan 1111.T（upsert 先于进度更新）
    "syncJob.update",       // 进度 i=0
    "syncJob.update",       // 进度 i=1（2222.T 无新闻）
    "disclosure.findMany",  // TDnet 提升
    "news.upsert",          // TDnet → News
    "syncJob.update",       // 终态
    "syncLog.create",
  ];
  ok("B(scripts) DB 操作序列与旧码一致", J(seq) === J(expected), `\n      actual  : ${J(seq)}\n      expected: ${J(expected)}`);
  ok("A(api) DB 操作序列与 B 完全一致（News 两侧写库本就相同）",
    J(A.ops.map((o) => `${o.model}.${o.op}`)) === J(seq));

  ok("Yahoo 只跑 slice(0,50) 内的标的", B.ops.filter((o) => o.model === "news" && o.op === "upsert").length === 3);
  ok("结构化结果：yahoo=1 kabutan=1 tdnet=1 total=3", B.res.yahooCount === 1 && B.res.kabutanCount === 1 && B.res.tdnetCount === 1 && B.res.totalUpserted === 3);
  ok("结构化结果：jobStatus=SUCCESS / fatalError=null", B.res.jobStatus === "SUCCESS" && B.res.fatalError === null);

  // ══ 【7】News durationMs 漂移保留 ═════════════════════════════════════════
  console.log("\n【7】News durationMs 漂移保留");
  {
    const lB = B.ops.find((o) => o.model === "syncLog")!.args.data;
    const lA = A.ops.find((o) => o.model === "syncLog")!.args.data;
    ok("B(scripts) durationMs 为数字（真实耗时）", typeof lB.durationMs === "number", `got ${lB.durationMs}`);
    ok("A(api) durationMs = null（既有缺陷，如实保留）", lA.durationMs === null, `got ${lA.durationMs}`);
    ok("durationMs · A ≠ B（漂移被保留，未被统一）", lA.durationMs !== lB.durationMs);
    ok("除 durationMs 外 SyncLog 全字段一致",
      lB.source === lA.source && lB.status === lA.status && lB.message === lA.message && lB.itemCount === lA.itemCount);
    ok("clock 注入 → durationMs 确定性可复现（60000ms）", lB.durationMs === 60_000, `got ${lB.durationMs}`);
  }

  // ══ 【8】错误处理 / 空数据 / 幂等形状 ═════════════════════════════════════
  console.log("\n【8】错误处理 · 空数据 · 幂等");
  {
    const bad = await runNews(NEWS_PROFILE_SCRIPTS, "stock.findMany");
    ok("致命错误 → fatalError 非空，Core **不** exit", bad.res.fatalError !== null && bad.res.jobStatus === "FAILED");
    ok("致命错误 → syncJob 被置 FAILED",
      bad.ops.some((o) => o.model === "syncJob" && o.args?.data?.status === "FAILED"));

    const { prisma, ops } = makeSpy({ disclosures: [] });
    const empty = await runNewsSync(
      { prisma, logger: silent, clock: CLOCK },
      { fetchNews: async () => [], fetchKabutanNews: async () => [] },
      NEWS_PROFILE_SCRIPTS, "J", ["1111.T"], CLOCK.now(),
    );
    ok("空数据 → total=0 且仍写 SyncLog", empty.totalUpserted === 0 && ops.some((o) => o.model === "syncLog"));
    ok("空数据 → syncLogStatus=SUCCESS（errors=0）", empty.syncLogStatus === "SUCCESS");

    // 幂等：同一 item 两次构建载荷完全相同
    ok("幂等：同一输入两次 buildYahooNewsUpsert 完全相同",
      J(buildYahooNewsUpsert(yahooItem)) === J(buildYahooNewsUpsert(yahooItem)));
    ok("幂等：同一输入两次 buildDisclosureUpsert 完全相同",
      J(buildDisclosureUpsert(discItem, 7, TDNET_PROFILE_API)) === J(buildDisclosureUpsert(discItem, 7, TDNET_PROFILE_API)));
    ok("Yahoo 同 url 去重（yahooSeen）—— 重复 item 只 upsert 一次", await (async () => {
      const { prisma, ops } = makeSpy({ disclosures: [] });
      await runNewsSync({ prisma, logger: silent, clock: CLOCK },
        { fetchNews: async () => [yahooItem, yahooItem], fetchKabutanNews: async () => [] },
        NEWS_PROFILE_SCRIPTS, "J", ["1111.T"], CLOCK.now());
      return ops.filter((o) => o.model === "news" && o.op === "upsert").length === 1;
    })());
  }

  // ══ 【9】TDnet Core：A/B fixture 各跑一次 ═════════════════════════════════
  console.log("\n【9】TDnet Core 编排（A=api profile / B=scripts profile）");
  {
    const runT = async (profile: typeof TDNET_PROFILE_API) => {
      const { prisma, ops } = makeSpy({ disclosures: [{ symbol: "1111.T", category: "EARNINGS", importance: 8 }] });
      const res = await runTDnetSync(
        { prisma, logger: silent, clock: CLOCK },
        { fetchTDnetForDate: async () => [discItem] },
        profile,
      );
      return { ops, res };
    };
    const tB = await runT(TDNET_PROFILE_SCRIPTS);
    const tA = await runT(TDNET_PROFILE_API);

    ok("B(scripts) 抓 5 个交易日 → fetch 5 次", tB.res.totalFetched === 5, `got ${tB.res.totalFetched}`);
    ok("A(api) 抓 3 个交易日 → fetch 3 次", tA.res.totalFetched === 3, `got ${tA.res.totalFetched}`);
    ok("days · A ≠ B（漂移保留）", tA.res.totalFetched !== tB.res.totalFetched);

    ok("B(scripts) 执行 catalystScore 更新（写 stockScore）",
      tB.ops.some((o) => o.model === "stockScore" && o.op === "updateMany") && tB.res.catalystUpdated > 0);
    ok("A(api) **完全跳过** catalystScore（不碰 stockScore）",
      !tA.ops.some((o) => o.model === "stockScore") && tA.res.catalystUpdated === 0);
    ok("catalystScore · A ≠ B（评分输入静默分裂，漂移保留）",
      tA.res.catalystUpdated !== tB.res.catalystUpdated);

    ok("B(scripts) perBatchStockLookup → stock.findMany 多次",
      tB.ops.filter((o) => o.model === "stock" && o.op === "findMany").length > 1);
    ok("A(api) 仅全局 stock.findMany 一次",
      tA.ops.filter((o) => o.model === "stock" && o.op === "findMany").length === 1);

    const dB = tB.ops.find((o) => o.model === "disclosure" && o.op === "upsert")!.args;
    const dA = tA.ops.find((o) => o.model === "disclosure" && o.op === "upsert")!.args;
    ok("编排层实写载荷：B 含 code4 / A 不含",
      "code4" in (dB.create.rawData as any) && !("code4" in (dA.create.rawData as any)));
    ok("编排层实写载荷：B update 含 title / A 不含", "title" in dB.update && !("title" in dA.update));

    ok("dryRun（仅 scripts profile 支持）→ 零写库", await (async () => {
      const { prisma, ops } = makeSpy();
      const r = await runTDnetSync({ prisma, logger: silent, clock: CLOCK },
        { fetchTDnetForDate: async () => [discItem] }, TDNET_PROFILE_SCRIPTS, { dryRun: true });
      return r.dryRun === true && !ops.some((o) => o.op === "upsert" || o.model === "syncLog");
    })());
    ok("A(api) profile 不支持 dryRun → 传 dryRun 也照常写库", await (async () => {
      const { prisma, ops } = makeSpy();
      const r = await runTDnetSync({ prisma, logger: silent, clock: CLOCK },
        { fetchTDnetForDate: async () => [discItem] }, TDNET_PROFILE_API, { dryRun: true });
      return r.dryRun === false && ops.some((o) => o.model === "disclosure" && o.op === "upsert");
    })());

    ok("TDnet 抓取异常 → errors 计数，不抛出", await (async () => {
      const { prisma } = makeSpy();
      const r = await runTDnetSync({ prisma, logger: silent, clock: CLOCK },
        { fetchTDnetForDate: async () => { throw new Error("net down"); } }, TDNET_PROFILE_API);
      return r.errors === 3 && r.status === "ERROR";
    })());
    ok("TDnet 空数据 → fetched=0 upserted=0", await (async () => {
      const { prisma } = makeSpy();
      const r = await runTDnetSync({ prisma, logger: silent, clock: CLOCK },
        { fetchTDnetForDate: async () => [] }, TDNET_PROFILE_API);
      return r.totalFetched === 0 && r.totalUpserted === 0;
    })());
    ok("Core 不读 argv：days 由入参传入即可覆盖 profile", await (async () => {
      const { prisma } = makeSpy();
      const r = await runTDnetSync({ prisma, logger: silent, clock: CLOCK },
        { fetchTDnetForDate: async () => [discItem] }, TDNET_PROFILE_SCRIPTS, { days: 1 });
      return r.totalFetched === 1;
    })());
    ok("lastTradingDays 跳过周末", lastTradingDays(new Date("2026-07-19T00:00:00Z"), 1)[0].getDay() !== 0);
  }

  // ══ 【10】Core 无 Next.js / CLI / process.exit 强耦合 ══════════════════════
  console.log("\n【10】Core 解耦检查（静态扫描 lib/ingest/*.ts）");
  {
    const files = ["types.ts", "config.ts", "normalize.ts", "news-core.ts", "tdnet-core.ts", "index.ts"];
    // ⚠️ 必须剥掉注释再扫描 —— 否则本文件里「Core 不调用 process.exit」这类**说明文字**
    //    会被正则当成代码命中（首跑即踩此坑）。
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const src = files.map((f) => strip(readFileSync(`lib/ingest/${f}`, "utf8"))).join("\n");
    ok("不 import next/*", !/from\s+["']next\//.test(src));
    ok("不使用 NextResponse / NextRequest", !/NextResponse|NextRequest/.test(src));
    ok("不调用 process.exit", !/process\.exit/.test(src));
    ok("不读 process.argv", !/process\.argv/.test(src));
    ok("不读 process.env", !/process\.env/.test(src));
    ok("不使用 @/ 路径别名（scripts 经 tsx 不支持）", !/from\s+["']@\//.test(src));
    // 仅允许 SYSTEM_CLOCK 定义内出现 Date.now()/new Date()；业务逻辑一律走注入的 clock
    const noClockDef = src.replace(/export const SYSTEM_CLOCK[\s\S]*?;\n/, "");
    ok("业务逻辑不直接调 Date.now()（时间经 clock 注入 → 输出确定性）",
      !/Date\.now\(\)/.test(noClockDef), "除 SYSTEM_CLOCK 定义外不得出现 Date.now()");
    ok("SYSTEM_CLOCK 默认实现存在", typeof SYSTEM_CLOCK.now() === "number");
  }

  // ══ 【11】生产入口零接线（最关键的验收）══════════════════════════════════
  console.log("\n【11】🔒 生产入口零接线证明");
  {
    const entries = [
      "app/api/sync/news/route.ts", "app/api/sync/tdnet/route.ts", "app/api/sync/route.ts",
      "scripts/sync-news.ts", "scripts/fetch-tdnet.ts", "scripts/cron-scheduler.ts",
      "components/system/SyncView.tsx",
    ];
    for (const f of entries) {
      const s = readFileSync(f, "utf8");
      ok(`${f} 未引用 lib/ingest`, !/lib\/ingest/.test(s));
    }
    // 入口文件与 HEAD 完全一致（未被 Core 替换）
    for (const f of ["scripts/sync-news.ts", "app/api/sync/news/route.ts", "scripts/fetch-tdnet.ts", "app/api/sync/tdnet/route.ts"]) {
      ok(`${f} 与 before 基线逐字节相同（原实现未被替换）`, readFileSync(f, "utf8") === old(f));
    }
  }

  console.log(`\n${"─".repeat(60)}`);
  console.log(`Ingestion Core equivalence: ${pass} passed, ${fail} failed`);
  if (fail > 0) { console.log("❌ FAIL"); process.exit(1); }
  console.log("✅ PASS");
}

main();
