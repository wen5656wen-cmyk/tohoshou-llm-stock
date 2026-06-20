/**
 * scripts/test-line-v79.ts
 *
 * Tests parseLineIntent() for all 14 required queries.
 * Also validates that all Flex message URLs are production-safe.
 *
 * Usage: npx tsx scripts/test-line-v79.ts
 */

import { parseLineIntent } from "../lib/line-intent";
import {
  buildTopPicksFlexV79,
  buildStockCardV79,
  buildMarketOverviewFlexV79,
  buildSectorFlexV79,
  buildHelpFlexV79,
  buildDataSourceFlexV79,
  buildWelcomeFlexV79,
  buildGroupJoinFlexV79,
} from "../lib/line-flex-v79";
import { validateFlexUrls } from "./validate-line-links";

// ── Test cases ────────────────────────────────────────────────────────────────

const TEST_INPUTS = [
  { input: "今天买什么",          expectedType: "TOP_PICKS" },
  { input: "明天买什么",          expectedType: "TOP_PICKS" },
  { input: "推荐十只",            expectedType: "TOP_PICKS",  expectLimit: 10 },
  { input: "再推荐五只",          expectedType: "TOP_PICKS",  expectLimit: 5 },
  { input: "科技股",              expectedType: "TECH_THEME" },
  { input: "科技股谁最强？",      expectedType: "TECH_THEME" },
  { input: "半导体还能买吗",      expectedType: "SECTOR_OUTLOOK" },
  { input: "伊藤忠怎么样",        expectedType: "STOCK_ANALYSIS", expectSymbol: "8001.T" },
  { input: "分析8001",            expectedType: "STOCK_ANALYSIS", expectSymbol: "8001.T" },
  { input: "丰田值得买吗",        expectedType: "STOCK_ANALYSIS", expectSymbol: "7203.T" },
  { input: "市场怎么样",          expectedType: "MARKET_OVERVIEW" },
  { input: "数据哪里来的",        expectedType: "DATA_SOURCE" },
  { input: "帮助",                expectedType: "HELP" },
  { input: "zxqw#@!乱输入$$",    expectedType: "UNKNOWN" },
];

// ── Color helpers ─────────────────────────────────────────────────────────────

const G = "\x1b[32m";
const R = "\x1b[31m";
const Y = "\x1b[33m";
const B = "\x1b[36m";
const X = "\x1b[0m";

function pass(msg: string) { process.stdout.write(`${G}✅ PASS${X} ${msg}\n`); }
function fail(msg: string) { process.stdout.write(`${R}❌ FAIL${X} ${msg}\n`); }
function info(msg: string) { process.stdout.write(`${B}   ${msg}${X}\n`); }

// ── Intent tests ──────────────────────────────────────────────────────────────

function runIntentTests(): { passed: number; failed: number } {
  console.log("\n── Intent Classification Tests ──────────────────────────────");
  let passed = 0;
  let failed = 0;

  for (const tc of TEST_INPUTS) {
    const intent = parseLineIntent(tc.input);
    const ok = intent.type === tc.expectedType;

    let detail = `type=${intent.type}`;
    if (intent.type === "TOP_PICKS" && tc.expectLimit) {
      const limitOk = intent.limit === tc.expectLimit;
      detail += ` limit=${intent.limit}`;
      if (!limitOk) { fail(`"${tc.input}" → ${detail} (expected limit=${tc.expectLimit})`); failed++; continue; }
    }
    if (intent.type === "STOCK_ANALYSIS" && tc.expectSymbol) {
      const symOk = intent.symbol === tc.expectSymbol;
      detail += ` symbol=${intent.symbol}`;
      if (!symOk) { fail(`"${tc.input}" → ${detail} (expected symbol=${tc.expectSymbol})`); failed++; continue; }
    }

    if (ok) {
      pass(`"${tc.input}" → ${detail}`);
      passed++;
    } else {
      fail(`"${tc.input}" → ${detail} (expected type=${tc.expectedType})`);
      failed++;
    }
  }

  return { passed, failed };
}

// ── Flex URL validation ───────────────────────────────────────────────────────

function runFlexUrlTests(): { passed: number; failed: number } {
  console.log("\n── Flex Message URL Validation ──────────────────────────────");
  let passed = 0;
  let failed = 0;

  const dummyStock = {
    symbol: "7203.T", name: "トヨタ自動車", nameZh: "丰田汽车",
    adaptiveScore: 65, totalScore: 62,
    recommendation: "HOLD", recommendationV2: "HOLD",
    percentileRank: 20, marketRank: 300,
    opportunityScore: 55, latestClose: 3500,
    return5d: 2.1, return20d: -1.3,
    technicalScore: 18, fundamentalScore: 16, moneyFlowScore: 13,
    newsSentimentScore: 9, globalTrendScore: 6,
    stockStyle: "CYCLICAL_EXPORTER", highRiskFlag: false,
    catalystScore: 5.5, dividendScore: 7, dividendYield: 3.4,
    shortSellingRatio: 38.8, shortSellingSource: "jpx_real",
    scoreSource: "REAL", latestDate: "2026-06-19",
    rsi14: 52, maTrend: "BULLISH", macdSignalLabel: "BUY",
    recommendationReason: null, opportunityLabel: "STEADY",
    payoutRatio: 0.321, dividendAnn: 120, shortSellingDate: "2026-06-19",
  };

  const dummySectors = [dummyStock];

  const dummyMarket = {
    dateStr: "2026-06-21",
    marketTemperature: "COLD",
    strongBuy: 0, buy: 35, hold: 206, watch: 1680, avoid: 1828, total: 3749,
    top1: { symbol: "291A.T", name: "Reskill", adaptiveScore: 77, recommendationV2: "BUY", percentileRank: 0.9 },
    globalMarket: { nasdaqChange: 0.5, sp500Change: 0.3, vix: 16.78, nikkeiChange: -0.2, topixChange: -0.1, usdjpy: 156.8, score: 7 },
    instFlow: { investorType: "foreigners", netAmount: 350, date: new Date("2026-06-12"), source: "jquants_investor_types" },
    shortSellRatio: 38.8, shortSellSource: "jpx_real", shortSellDate: "2026-06-19",
  };

  const flexBuilders: Array<[string, () => unknown]> = [
    ["buildTopPicksFlexV79",       () => buildTopPicksFlexV79([dummyStock], "2026-06-21", 5)],
    ["buildStockCardV79",          () => buildStockCardV79(dummyStock)],
    ["buildMarketOverviewFlexV79", () => buildMarketOverviewFlexV79(dummyMarket)],
    ["buildSectorFlexV79",         () => buildSectorFlexV79(dummySectors, "半导体", "2026-06-21", "COLD")],
    ["buildHelpFlexV79",           () => buildHelpFlexV79()],
    ["buildDataSourceFlexV79",     () => buildDataSourceFlexV79("2026-06-21")],
    ["buildWelcomeFlexV79",        () => buildWelcomeFlexV79()],
    ["buildGroupJoinFlexV79",      () => buildGroupJoinFlexV79()],
  ];

  for (const [name, builder] of flexBuilders) {
    let flex: unknown;
    try {
      flex = builder();
    } catch (err) {
      fail(`${name}: builder threw — ${err}`);
      failed++;
      continue;
    }

    const json = JSON.stringify(flex);
    const result = validateFlexUrls(json);

    if (result.valid) {
      pass(`${name}: all URLs valid`);
      passed++;
    } else {
      fail(`${name}: invalid URLs found:`);
      for (const issue of result.issues) {
        info(`  ${issue}`);
      }
      failed++;
    }
  }

  return { passed, failed };
}

// ── Additional intent edge cases ───────────────────────────────────��──────────

function runEdgeCases(): { passed: number; failed: number } {
  console.log("\n── Edge Case Tests ──────────────────────────────────────────");
  let passed = 0;
  let failed = 0;

  const edgeCases: Array<{ input: string; check: (i: ReturnType<typeof parseLineIntent>) => boolean; desc: string }> = [
    { input: "7203",      check: (i) => i.type === "STOCK_ANALYSIS" && "symbol" in i && i.symbol === "7203.T",  desc: "4-digit code direct" },
    { input: "7203.T",    check: (i) => i.type === "STOCK_ANALYSIS" && "symbol" in i && i.symbol === "7203.T",  desc: "4-digit.T code" },
    { input: "分析7203",  check: (i) => i.type === "STOCK_ANALYSIS" && "symbol" in i && i.symbol === "7203.T",  desc: "分析+code" },
    { input: "分析丰田",  check: (i) => i.type === "STOCK_ANALYSIS" && "symbol" in i && i.symbol === "7203.T",  desc: "分析+CN name" },
    { input: "伊藤忠",    check: (i) => i.type === "STOCK_ANALYSIS" && "symbol" in i && i.symbol === "8001.T",  desc: "CN company name direct" },
    { input: "软银",      check: (i) => i.type === "STOCK_ANALYSIS" && "symbol" in i && i.symbol === "9984.T",  desc: "软银→9984.T" },
    { input: "帮助",      check: (i) => i.type === "HELP",                                                       desc: "HELP" },
    { input: "菜单",      check: (i) => i.type === "HELP",                                                       desc: "菜单→HELP" },
    { input: "推荐",      check: (i) => i.type === "TOP_PICKS",                                                  desc: "推荐→TOP_PICKS" },
    { input: "银行股怎么样", check: (i) => i.type === "SECTOR_OUTLOOK",                                          desc: "银行股→SECTOR_OUTLOOK" },
    { input: "汽车股",    check: (i) => i.type === "SECTOR_OUTLOOK",                                             desc: "汽车股→SECTOR_OUTLOOK" },
    { input: "日经怎么样", check: (i) => i.type === "MARKET_OVERVIEW",                                           desc: "日经→MARKET_OVERVIEW" },
    { input: "数据来源",  check: (i) => i.type === "DATA_SOURCE",                                                 desc: "数据来源→DATA_SOURCE" },
    { input: "评分怎么算", check: (i) => i.type === "DATA_SOURCE",                                                desc: "评分怎么算→DATA_SOURCE" },
  ];

  for (const tc of edgeCases) {
    const intent = parseLineIntent(tc.input);
    if (tc.check(intent)) {
      pass(`"${tc.input}" → ${intent.type}${"symbol" in intent ? " " + (intent as { symbol: string }).symbol : ""} (${tc.desc})`);
      passed++;
    } else {
      fail(`"${tc.input}" → ${intent.type} (${tc.desc})`);
      failed++;
    }
  }

  return { passed, failed };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`${Y}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${X}`);
  console.log(`${Y}  TOHOSHOU AI V7.9 — LINE Intent Tests${X}`);
  console.log(`${Y}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${X}`);

  const r1 = runIntentTests();
  const r2 = runFlexUrlTests();
  const r3 = runEdgeCases();

  const totalPassed = r1.passed + r2.passed + r3.passed;
  const totalFailed = r1.failed + r2.failed + r3.failed;
  const total = totalPassed + totalFailed;

  console.log(`\n${Y}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${X}`);
  console.log(`${totalFailed === 0 ? G : R}結果: ${totalPassed}/${total} 通過${X}`);
  if (totalFailed > 0) {
    console.log(`${R}  Intent tests: ${r1.failed} FAIL${X}`);
    console.log(`${R}  URL tests:    ${r2.failed} FAIL${X}`);
    console.log(`${R}  Edge cases:   ${r3.failed} FAIL${X}`);
    process.exit(1);
  } else {
    console.log(`${G}  全テスト通過 ✅${X}`);
    console.log(`${G}  Intent: ${r1.passed}/${r1.passed + r1.failed}  URL: ${r2.passed}/${r2.passed + r2.failed}  Edge: ${r3.passed}/${r3.passed + r3.failed}${X}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
