/**
 * Standalone news sync worker — replaces the HTTP POST to /api/sync/news.
 * Called directly by cron-scheduler.ts via execSync("npx tsx scripts/sync-news.ts").
 * Running as a child process means pm2 restart of tohoshou-web does NOT kill this job.
 *
 * P12-INFRA-02：编排逻辑已提取到 lib/ingest/news.ts（与 app/api/sync/news 共享）。
 * 本文件只负责 scripts 入口特有的部分：自建 Prisma 实例、stale 时 exit(0)、
 * 致命错误 exit(1)、$disconnect。**行为与重构前逐字一致。**
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  autoFailStaleJob,
  createNewsJob,
  findRunningJob,
  isStale,
  runNewsSync,
  selectNewsSymbols,
} from "../lib/ingest";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const deps = { prisma };

async function main() {
  const startMs = Date.now();

  // ── Stale job guard ────────────────────────────────────────────────────────
  const existingJob = await findRunningJob(deps);

  if (existingJob) {
    const ageMs = Date.now() - existingJob.createdAt.getTime();
    if (!isStale(existingJob)) {
      console.log(
        `[sync-news] SKIPPED — job ${existingJob.id} already running (${Math.round(ageMs / 60000)}min)`
      );
      process.exit(0);
    }
    await autoFailStaleJob(deps, existingJob);
    console.warn(
      `[sync-news] stale job ${existingJob.id} auto-failed (age: ${Math.round(ageMs / 60000)}min)`
    );
  }

  // ── Target symbols: top 200 by adaptiveScore ─────────────────────────────
  const symbols = await selectNewsSymbols(deps);
  const job = await createNewsJob(deps, symbols.length);

  console.log(`[sync-news] started jobId=${job.id}, symbols=${symbols.length}`);

  try {
    await runNewsSync(deps, job.id, symbols, {
      logPrefix: "[sync-news]",
      fatalLabel: "fatal error:",
      startMs,
      logDone: true,
      onFatal: () => process.exit(1),
    });
  } finally {
    await prisma.$disconnect();
  }
}

main();
