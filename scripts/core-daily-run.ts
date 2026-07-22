/**
 * P26 Phase 3 · Core Daily 手动运行（#7 Manual Runtime · 仅 ADMIN）。
 * 接**真实计算**（PythonPipelineAdapter → 真实分钟→Indicator→Feature→Decision→Strategy）。
 * CURRENT 策略从 Registry 读（不硬编码）。append-only 落库（生产 DB）。**本阶段禁 Cron。**
 *
 * 用法：
 *   CORE_DAILY_PYTHON=<venv/bin/python> DATABASE_URL=<...> npx tsx scripts/core-daily-run.ts --asof=15:15|15:23|09:00 [--date=YYYY-MM-DD]
 *   --asof=15:15 初筛快照 · 15:23 门控+最终 · 09:00 昨日 SHADOW_BUY 的 T+1 验证
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { runCoreDaily } from "../lib/core-daily/runtime";
import { PythonPipelineAdapter } from "../lib/core-daily/adapters";
import { settleValidation } from "../lib/core-daily/validation";
import { getCurrentStrategy } from "../lib/core-daily/registry";
import type { AsOf, MarketSession, RunParams } from "../lib/core-daily/types";

function arg(name: string, def?: string): string | undefined {
  const p = process.argv.find((a) => a.startsWith(`--${name}=`));
  return p ? p.split("=")[1] : def;
}
function jstToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}
function sessionFor(asOf: AsOf): MarketSession {
  return asOf === "09:00" ? "OPEN" : "PRE_CLOSE";
}

async function main(): Promise<void> {
  const cur = getCurrentStrategy(); // Registry 驱动，不硬编码
  const strategyId = arg("strategy", cur.id)!;
  const version = arg("version", cur.version)!;
  const asOfRaw = arg("asof", "15:23")!;
  const date = arg("date", jstToday())!;
  if (asOfRaw !== "15:15" && asOfRaw !== "15:23" && asOfRaw !== "09:00") {
    throw new Error(`invalid --asof=${asOfRaw} (expect 15:15|15:23|09:00)`);
  }
  const asOf = asOfRaw as AsOf;

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    if (asOf === "09:00") {
      const res = await settleValidation(db, strategyId, version, date);
      process.stdout.write(
        `\n[core-daily-run] VALIDATION ${strategyId} ${version} @${date}: settled=${res.settled} skipped=${res.skipped}\n`,
      );
    } else {
      const params: RunParams = { strategyId, tradeDate: date, asOf, marketSession: sessionFor(asOf) };
      const res = await runCoreDaily(db, new PythonPipelineAdapter(version), params, version);
      process.stdout.write(
        `\n[core-daily-run] ${strategyId} ${version} @${date} ${asOf}: runStatus=${res.runStatus} ` +
          `integrity=${res.integrityStatus} gate=${res.gateResult} candidates=${res.candidateCount} ` +
          `shadowBuy=${res.shadowBuyCount} reason=${res.failureReason ?? "-"} ${res.durationMs}ms\n`,
      );
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  process.stderr.write(`[core-daily-run] FAILED: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
