#!/usr/bin/env npx tsx
/**
 * Validate all LINE Flex Message button URLs (V7.9 + legacy)
 * - Must be absolute https://aitohoshou.com URLs
 * - No localhost, 127.0.0.1, undefined, null, or relative paths
 * - Core pages must return HTTP 200
 *
 * Usage:  npm run validate:line-links
 *         DRY_RUN=1 npm run validate:line-links  (skip HTTP checks)
 */

import "dotenv/config";
import { getBaseUrl, stockUrl, aiPicksUrl, aiThemeUrl, screenerUrl, newsUrl, notificationsUrl, portfolioUrl, syncUrl, normalizeSymbolForUrl } from "../lib/app-url";

// ��─ Exported library function (used by test-line-v79.ts) ─────────────────────

export interface ValidationResult {
  valid: boolean;
  issues: string[];
  uriCount: number;
  checkedUris: string[];
}

const BAD_PATTERNS = [
  { re: /localhost/i,              label: "localhost" },
  { re: /127\.0\.0\.1/,           label: "127.0.0.1" },
  { re: /"uri"\s*:\s*"\/[^h]/,    label: "relative path" },
  { re: /"uri"\s*:\s*"undefined"/, label: "undefined URI" },
  { re: /"uri"\s*:\s*"null"/,     label: "null URI" },
  { re: /"uri"\s*:\s*""/,         label: "empty URI" },
];

export function validateFlexUrls(json: string): ValidationResult {
  const issues: string[] = [];
  const checkedUris: string[] = [];
  const uriMatches = [...json.matchAll(/"uri"\s*:\s*"([^"]+)"/g)];
  for (const m of uriMatches) checkedUris.push(m[1]);
  for (const { re, label } of BAD_PATTERNS) {
    if (re.test(json)) issues.push(`Found bad URL pattern: ${label}`);
  }
  for (const uri of checkedUris) {
    if (!uri.startsWith("https://") && !uri.startsWith("http://")) {
      issues.push(`Non-https URI: ${uri.slice(0, 80)}`);
    }
  }
  return { valid: issues.length === 0, issues, uriCount: checkedUris.length, checkedUris };
}
import {
  buildMorningReportFlex,
  buildMiddayFlex,
  buildCloseReportFlex,
  buildAlertFlex,
  buildRiskAlertFlex,
  buildStockCard,
  buildTestFlex,
  buildAiPicksChatFlex,
  buildAiThemeChatFlex,
  buildMarketSummaryFlex,
  buildNotificationStatusFlex,
  buildHelpFlex,
  buildWelcomeFlex,
  buildGroupJoinFlex,
} from "../lib/line-flex";
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

const BASE = getBaseUrl();
const DRY_RUN = process.env.DRY_RUN === "1";
let errors = 0;
let warnings = 0;

// ── URI extractor ─────────────────────────────────────────────────────────────

function extractUris(obj: unknown, path = ""): string[] {
  if (!obj || typeof obj !== "object") return [];
  const o = obj as Record<string, unknown>;
  const uris: string[] = [];

  for (const [k, v] of Object.entries(o)) {
    if (k === "uri" && typeof v === "string") {
      uris.push(v);
    } else if (typeof v === "object" && v !== null) {
      uris.push(...extractUris(v, `${path}.${k}`));
    }
  }

  return uris;
}

// ── URI validator ─────────────────────────────────────────────────────────────

function validateUri(uri: string, context: string): void {
  if (!uri || uri === "undefined" || uri === "null") {
    console.error(`  ❌ [${context}] URI is null/undefined/empty: "${uri}"`);
    errors++;
    return;
  }

  if (uri.startsWith("/")) {
    console.error(`  ❌ [${context}] Relative path: "${uri}"`);
    errors++;
    return;
  }

  if (/localhost/i.test(uri)) {
    console.error(`  ❌ [${context}] Contains localhost: "${uri}"`);
    errors++;
    return;
  }

  if (!uri.startsWith("https://")) {
    console.warn(`  ⚠️  [${context}] Not HTTPS: "${uri}"`);
    warnings++;
    return;
  }

  if (!uri.startsWith(BASE)) {
    console.warn(`  ⚠️  [${context}] Not production base (${BASE}): "${uri}"`);
    warnings++;
    return;
  }

  console.log(`  ✅ ${uri}`);
}

// ── HTTP check ────────────────────────────────────────────────────────────────

async function checkHttp(url: string): Promise<boolean> {
  if (DRY_RUN) {
    console.log(`  [DRY] ${url}`);
    return true;
  }
  try {
    const res = await fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      console.log(`  ✅ HTTP ${res.status} ${url}`);
      return true;
    } else {
      console.error(`  ❌ HTTP ${res.status} ${url}`);
      errors++;
      return false;
    }
  } catch (e) {
    console.error(`  ❌ Fetch failed ${url}: ${e}`);
    errors++;
    return false;
  }
}

// ── Build all Flex payloads ───────────────────────────────────────────────────

function buildAllFlexPayloads(): Record<string, unknown> {
  const mockStock = { symbol: "7203.T", name: "トヨタ自動車", nameZh: "丰田汽车", nameEn: "Toyota", totalScore: 72, recommendation: "BUY", latestClose: 3150, return5d: 1.2, summaryReason: "テスト", technicalScore: 22, fundamentalScore: 18, moneyFlowScore: 14, newsSentimentScore: 11, globalTrendScore: 7 };
  const mockStocks = Array.from({ length: 10 }, (_, i) => ({ ...mockStock, symbol: `${7200 + i}.T`, nameZh: `测试股票${i + 1}` }));
  const mockThemeStocks = [
    { ...mockStock, theme: "SEMICONDUCTOR" },
    { ...mockStock, symbol: "6645.T", nameZh: "欧姆龙", theme: "INDUSTRIAL_AUTO" },
    { ...mockStock, symbol: "9613.T", nameZh: "NTT Data", theme: "TECH_SERVICES" },
  ];

  const mockV79Stock = {
    ...mockStock, adaptiveScore: 65, recommendationV2: "HOLD",
    percentileRank: 20, marketRank: 300, opportunityScore: 55,
    return20d: -1.3, rsi14: 52, maTrend: "BULLISH", macdSignalLabel: "BUY",
    technicalScore: 18, fundamentalScore: 16, moneyFlowScore: 13,
    newsSentimentScore: 9, globalTrendScore: 6,
    stockStyle: "CYCLICAL_EXPORTER", highRiskFlag: false,
    catalystScore: 5.5, dividendScore: 7, dividendYield: 3.4,
    shortSellingRatio: 38.8, shortSellingSource: "jpx_real",
    scoreSource: "REAL", latestDate: "2026-06-19",
    recommendationReason: null, opportunityLabel: "STEADY",
    payoutRatio: 0.321, dividendAnn: 120, shortSellingDate: "2026-06-19",
  };
  const mockMarketV79 = {
    dateStr: "2026-06-21", marketTemperature: "COLD",
    strongBuy: 0, buy: 35, hold: 206, watch: 1680, avoid: 1828, total: 3749,
    top1: { symbol: "291A.T", name: "Reskill", adaptiveScore: 77, recommendationV2: "BUY", percentileRank: 0.9 },
    globalMarket: { nasdaqChange: 0.5, sp500Change: 0.3, vix: 16.78, nikkeiChange: -0.2, topixChange: -0.1, usdjpy: 156.8, score: 7 },
    instFlow: { investorType: "foreigners", netAmount: 350, date: new Date("2026-06-12"), source: "jquants_investor_types" },
    shortSellRatio: 38.8, shortSellSource: "jpx_real", shortSellDate: "2026-06-19",
  };

  return {
    // Legacy push builders (unchanged)
    morning: buildMorningReportFlex(mockStocks.slice(0, 5), "2026-06-20", "金"),
    midday: buildMiddayFlex(mockStocks.slice(0, 3), mockStocks.slice(3, 6), mockStocks.slice(6, 9), "2026-06-20"),
    close: buildCloseReportFlex({ dateStr: "2026-06-20", dowLabel: "金", total: 3714, strongBuy: 12, buy: 85, hold: 200, watch: 500, avoid: 2900, avgScore: 52, topPerformers: mockStocks.slice(0, 3), fishingCandidates: mockStocks.slice(3, 6) }),
    alert: buildAlertFlex({ stock: mockStock, alertType: "急騰", reasons: ["株価急騰5%"], priceChange: 5.2 }),
    riskAlert: buildRiskAlertFlex(mockStocks.slice(0, 5), "2026-06-20"),
    stockCard: buildStockCard(mockStock),
    testFlex: buildTestFlex("Validation test"),
    aiPicks: buildAiPicksChatFlex(mockStocks, "2026-06-20"),
    aiTheme: buildAiThemeChatFlex(mockThemeStocks, "2026-06-20"),
    market: buildMarketSummaryFlex({ total: 3714, realCount: 3714, strongBuy: 12, buy: 85, hold: 200, watch: 500, avoid: 2900, avgScore: 52, topSymbol: "7203.T", topName: "丰田汽车", topScore: 74, topRec: "HOLD", dateStr: "2026-06-20" }),
    notifications: buildNotificationStatusFlex({ quotaType: "limited", quotaValue: 200, totalUsage: 150, remaining: 50, pct: 75, exhausted: false, morningEnabled: true, middayEnabled: true, closeEnabled: true, alertEnabled: true }),
    help: buildHelpFlex(),
    welcome: buildWelcomeFlex(),
    groupJoin: buildGroupJoinFlex(),
    // V7.9 chat builders
    v79_topPicks: buildTopPicksFlexV79([mockV79Stock], "2026-06-21", 5),
    v79_stockCard: buildStockCardV79(mockV79Stock),
    v79_marketOverview: buildMarketOverviewFlexV79(mockMarketV79),
    v79_sector: buildSectorFlexV79([mockV79Stock], "半导体", "2026-06-21", "COLD"),
    v79_help: buildHelpFlexV79(),
    v79_dataSource: buildDataSourceFlexV79("2026-06-21"),
    v79_welcome: buildWelcomeFlexV79(),
    v79_groupJoin: buildGroupJoinFlexV79(),
  };
}

// ── Core page URLs ─────────────────────────────────────────────────────────────

const CORE_PAGES = [
  aiPicksUrl(),
  aiThemeUrl(),
  screenerUrl(),
  newsUrl(),
  notificationsUrl(),
  portfolioUrl(),
  syncUrl(),
  stockUrl("7203"),
  stockUrl("291A"),
];

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(60));
  console.log("LINE Flex Link Validator");
  console.log(`Base URL: ${BASE}`);
  console.log(`DRY_RUN:  ${DRY_RUN}`);
  console.log("=".repeat(60));

  // 1. Validate URL utility functions
  console.log("\n── URL 工具函数验证 ──");
  const urlTests: [string, string][] = [
    ["7203 → 7203.T", normalizeSymbolForUrl("7203")],
    ["7203.T → 7203.T", normalizeSymbolForUrl("7203.T")],
    ["291A → 291A.T", normalizeSymbolForUrl("291A")],
    ["291A.T → 291A.T", normalizeSymbolForUrl("291A.T")],
  ];
  for (const [desc, result] of urlTests) {
    const ok = result.endsWith(".T");
    console.log(`  ${ok ? "✅" : "❌"} ${desc} = "${result}"`);
    if (!ok) errors++;
  }

  // 2. Extract and validate all Flex URIs
  console.log("\n── Flex Message URI 验证 ──");
  const payloads = buildAllFlexPayloads();
  for (const [name, payload] of Object.entries(payloads)) {
    const uris = extractUris(payload);
    console.log(`\n  [${name}] ${uris.length} URI(s)`);
    for (const uri of uris) {
      validateUri(uri, name);
    }
    if (uris.length === 0) {
      console.warn(`  ⚠️  [${name}] No URIs found`);
      warnings++;
    }
  }

  // 3. HTTP 200 check on core pages
  console.log("\n── 核心页面 HTTP 检查 ──");
  for (const url of CORE_PAGES) {
    await checkHttp(url);
  }

  // 4. Summary
  console.log("\n" + "=".repeat(60));
  console.log(`结果: ${errors} 错误, ${warnings} 警告`);
  if (errors > 0) {
    console.error("❌ 验证失败 — 修复所有错误后再部署");
    process.exit(1);
  } else if (warnings > 0) {
    console.warn("⚠️  验证通过（有警告）");
    process.exit(0);
  } else {
    console.log("✅ 全部通过");
    process.exit(0);
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
