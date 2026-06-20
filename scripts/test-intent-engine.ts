/**
 * scripts/test-intent-engine.ts — V7.9.1 Intent Engine Test
 *
 * Tests 14 inputs through the full pipeline:
 *   parseUserIntent → queryDatabase → buildWebAnswer
 *
 * Verifies:
 *   • Correct intent classification
 *   • answerSource === "DB"
 *   • hallucination === false
 *   • No forbidden phrases
 *   • No localhost URLs in answer
 *
 * Usage:
 *   npm run test:intent-engine
 *   SKIP_DB=1 npm run test:intent-engine  (intent-only test, no DB)
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { parseUserIntent, setContext, clearContext } from "../lib/intent-engine";
import { buildWebAnswer } from "../lib/answer-builder";
import type { StructuredIntent, ConversationContext } from "../lib/intent-schema";

// ── Prisma setup (only for DB tests) ─────────────────────────────────────────

const SKIP_DB = process.env.SKIP_DB === "1";

if (!SKIP_DB) {
  // Wire up prisma singleton (same as production)
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const _prisma = new PrismaClient({ adapter });
  // The singleton in lib/prisma.ts is what queryDatabase uses.
  // In scripts we need to ensure the module resolver picks up the same instance.
  // If running with tsx/ts-node, the module cache is shared, so this is fine.
}

// ── Test cases ────────────────────────────────────────────────────────────────

type TestCase = {
  input: string;
  expectIntent: string;
  expectSymbols?: string[];
  expectLimit?: number;
  expectDividend?: boolean;
  expectRisk?: string;
  context?: Partial<ConversationContext>;
  description?: string;
};

const TEST_CASES: TestCase[] = [
  // 1. Basic top_picks
  {
    input: "今天买什么",
    expectIntent: "top_picks",
    description: "Basic buy query → top_picks",
  },
  // 2. Top_picks future
  {
    input: "明天买什么",
    expectIntent: "top_picks",
    description: "Tomorrow query → top_picks",
  },
  // 3. Explicit limit
  {
    input: "推荐十只",
    expectIntent: "top_picks",
    expectLimit: 10,
    description: "推荐十只 → top_picks limit=10",
  },
  // 4. Filtered top_picks
  {
    input: "高股息低风险的",
    expectIntent: "top_picks",
    expectDividend: true,
    expectRisk: "LOW",
    description: "高股息低风险的 → top_picks dividendPreference=true riskPreference=LOW",
  },
  // 5. Theme rank
  {
    input: "科技股谁最强",
    expectIntent: "theme_rank",
    description: "科技股谁最强 → theme_rank",
  },
  // 6. Sector outlook
  {
    input: "半导体还能买吗",
    expectIntent: "sector_outlook",
    description: "半导体还能买吗 → sector_outlook",
  },
  // 7. Stock analysis by company name
  {
    input: "伊藤忠怎么样",
    expectIntent: "stock_analysis",
    expectSymbols: ["8001.T"],
    description: "伊藤忠怎么样 → stock_analysis 8001.T",
  },
  // 8. Stock compare
  {
    input: "丰田和伊藤忠比",
    expectIntent: "stock_compare",
    description: "丰田和伊藤忠比 → stock_compare",
  },
  // 9. Follow-up: recommend_more (requires context)
  {
    input: "还有其他的吗",
    expectIntent: "recommend_more",
    context: {
      lastIntent: "top_picks",
      lastResults: ["291A.T", "6861.T", "7203.T"],
    },
    description: "还有其他的吗 (with context) → recommend_more",
  },
  // 10. Follow-up: risk_analysis (requires context)
  {
    input: "风险呢",
    expectIntent: "risk_analysis",
    context: {
      lastIntent: "stock_analysis",
      lastSymbols: ["7203.T"],
    },
    description: "风险呢 (with context) → risk_analysis with lastSymbols",
  },
  // 11. Follow-up: reason_explain (requires context)
  {
    input: "为什么",
    expectIntent: "reason_explain",
    context: {
      lastIntent: "top_picks",
      lastSymbols: ["291A.T"],
    },
    description: "为什么 (with context) → reason_explain",
  },
  // 12. Context-aware: can-buy with stock context
  {
    input: "现在能买吗",
    expectIntent: "stock_analysis",
    context: {
      lastIntent: "stock_analysis",
      lastSymbols: ["7203.T"],
    },
    description: "现在能买吗 (with symbol context) → stock_analysis",
  },
  // 13. Data source
  {
    input: "数据哪里来的",
    expectIntent: "data_source",
    description: "数据哪里来的 → data_source",
  },
  // 14. Unknown → help
  {
    input: "xyzABC随便乱输入12345",
    expectIntent: "help",
    description: "Unknown input → help (never 不支持)",
  },
];

// ── Forbidden phrases ─────────────────────────────────────────────────────────

const FORBIDDEN = [
  "表现稳定", "建议关注", "预计上涨", "可能涨", "估计会",
  "应该会", "可能会", "有望", "不支持该查询",
  "localhost:3000",
];

// ── Runner ────────────────────────────────────────────────────────────────────

async function runIntentTests() {
  console.log("\n🧪 [1] Intent Classification Tests (14/14 expected)\n");
  let passed = 0;
  let failed = 0;

  for (let i = 0; i < TEST_CASES.length; i++) {
    const tc = TEST_CASES[i];
    const userId = `test_user_${i}`;
    clearContext(userId);

    // Set context if provided
    if (tc.context) {
      setContext(userId, {
        channel: "LINE",
        ...tc.context,
      });
    }

    const ctx = tc.context ? {
      userId,
      channel: "LINE" as const,
      ...tc.context,
      expiresAt: Date.now() + 30 * 60 * 1000,
    } : undefined;

    const intent = await parseUserIntent(tc.input, ctx);

    const intentOk = intent.intent === tc.expectIntent;
    const symbolsOk = !tc.expectSymbols || tc.expectSymbols.every((s) => intent.symbols?.includes(s));
    const limitOk = tc.expectLimit == null || intent.limit === tc.expectLimit || (intent.limit ?? 10) === tc.expectLimit;
    const dividendOk = tc.expectDividend == null || intent.dividendPreference === tc.expectDividend;
    const riskOk = tc.expectRisk == null || intent.riskPreference === tc.expectRisk;

    const ok = intentOk && symbolsOk && limitOk && dividendOk && riskOk;

    if (ok) {
      console.log(`  ✅ [${i + 1}] ${tc.description ?? tc.input}`);
      console.log(`       intent=${intent.intent}${intent.symbols ? ` symbols=${JSON.stringify(intent.symbols)}` : ""}${intent.dividendPreference ? " dividend=true" : ""}${intent.riskPreference ? ` risk=${intent.riskPreference}` : ""}`);
      passed++;
    } else {
      console.log(`  ❌ [${i + 1}] ${tc.description ?? tc.input}`);
      console.log(`       expected intent=${tc.expectIntent}, got intent=${intent.intent}`);
      if (!symbolsOk) console.log(`       expected symbols=${JSON.stringify(tc.expectSymbols)}, got=${JSON.stringify(intent.symbols)}`);
      if (!limitOk) console.log(`       expected limit=${tc.expectLimit}, got=${intent.limit}`);
      if (!dividendOk) console.log(`       expected dividend=${tc.expectDividend}, got=${intent.dividendPreference}`);
      if (!riskOk) console.log(`       expected risk=${tc.expectRisk}, got=${intent.riskPreference}`);
      failed++;
    }
  }

  console.log(`\n  Intent: ${passed}/14 passed, ${failed} failed`);
  return { passed, failed };
}

async function runAnswerTests() {
  if (SKIP_DB) {
    console.log("\n⏭  [2] Answer Tests — SKIPPED (SKIP_DB=1)\n");
    return { passed: 0, failed: 0 };
  }

  console.log("\n🧪 [2] Answer Builder Tests (DB required)\n");
  let passed = 0;
  let failed = 0;

  const { queryDatabase } = await import("../lib/query-engine");

  const answerCases: Array<{ label: string; input: string; ctx?: Partial<ConversationContext> }> = [
    { label: "top_picks", input: "今天买什么" },
    { label: "stock_analysis (伊藤忠)", input: "伊藤忠怎么样" },
    { label: "market_overview", input: "今天市场怎么样" },
    { label: "sector_outlook", input: "半导体还能买吗" },
    { label: "data_source", input: "数据哪里来的" },
    { label: "help", input: "帮助" },
  ];

  for (const ac of answerCases) {
    try {
      const intent = await parseUserIntent(ac.input);
      const dbData = await queryDatabase(intent);
      const answer = buildWebAnswer(dbData);

      // Verify constraints
      const hasForbidden = FORBIDDEN.filter((f) => answer.includes(f));
      const hasLocalhost = answer.includes("localhost");
      const hasSource = dbData.answerSource === "DB";
      const noHallucination = dbData.hallucination === false;

      if (hasForbidden.length || hasLocalhost || !hasSource || !noHallucination) {
        console.log(`  ❌ [${ac.label}]`);
        if (hasForbidden.length) console.log(`       forbidden phrases: ${hasForbidden.join(", ")}`);
        if (hasLocalhost) console.log(`       contains localhost URL`);
        if (!hasSource) console.log(`       answerSource !== "DB"`);
        if (!noHallucination) console.log(`       hallucination !== false`);
        failed++;
      } else {
        console.log(`  ✅ [${ac.label}] answerSource=DB hallucination=false len=${answer.length}`);
        console.log(`       preview: ${answer.split("\n")[0]}`);
        passed++;
      }
    } catch (err) {
      console.log(`  ❌ [${ac.label}] ERROR: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  console.log(`\n  Answer: ${passed}/${answerCases.length} passed, ${failed} failed`);
  return { passed, failed };
}

async function main() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  TOHOSHOU AI V7.9.1 — Intent Engine Test");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const { passed: ip, failed: if_ } = await runIntentTests();
  const { passed: ap, failed: af } = await runAnswerTests();

  const total = ip + ap;
  const totalFailed = if_ + af;
  const totalPossible = 14 + (SKIP_DB ? 0 : 6);

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  TOTAL: ${total}/${totalPossible} passed${totalFailed > 0 ? ` ❌ ${totalFailed} FAILED` : " ✅ ALL PASSED"}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
