#!/usr/bin/env npx tsx
/**
 * Daily Holding Review — P17-02A 持仓每日自动复盘。
 *
 * 收盘后扫描全部真实持仓，逐只重算 AI Action；动作变化 → 追加 Decision Timeline，
 * 动作未变 → 跳过（NextReview 为确定性次交易日）。单只失败不影响其它。
 *
 * 接入：作为已有 15:15 JST 收盘任务（generate-closing-decision）之后的一个步骤触发，
 * **不新增 cron.schedule**（§9）。亦可手动 `npx tsx scripts/daily-holding-review.ts`。
 * 单一来源 = reviewHolding → deriveHoldingAction，与 GET /api/holdings 完全一致。
 */
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { runDailyReview } from "../lib/trading/daily-review";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const t0 = Date.now();
  const s = await runDailyReview({ reviewAll: true, dryRun });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  // Review Summary（§13）
  console.log(`[daily-review] ${dryRun ? "DRY-RUN " : ""}Review=${s.reviewed} Changed=${s.changed} Skipped=${s.skipped} Failed=${s.failed} nextReview=${s.nextReview} elapsed=${elapsed}s`);
  for (const r of s.results) {
    if (r.status === "changed") console.log(`  ↳ ${r.symbol}  ${r.prevAction ?? "—"} → ${r.newAction}  (${r.reasonKey ?? ""})  ret=${r.returnPct ?? "—"}`);
    else if (r.status === "failed") console.log(`  ✗ ${r.symbol}  FAILED: ${r.error ?? ""}`);
  }
  if (s.failed > 0) process.exitCode = 0; // 单只失败不使整批失败（§10）；已逐条记录 Error
}

main().catch((e) => { console.error("[daily-review] fatal", e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
