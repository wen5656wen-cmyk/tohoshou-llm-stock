#!/usr/bin/env npx tsx
/**
 * backfill-dr-version.ts
 *
 * One-time backfill: set versionSnapshotId / modelVersion / scoreVersion / schemaVersion
 * on DailyRecommendation rows that were created before v13.7.0.
 *
 * Strategy: assign each DR row the VersionSnapshot whose date range covers that DR's date.
 *   - legacy-baseline: startDate 2026-06-20 → endDate 2026-06-25  (schema-v1.0)
 *   - 20260626-v7.7 : startDate 2026-06-26 → endDate null         (schema-v2.3, current)
 *
 * Safe to re-run (idempotent): skips rows that already have versionSnapshotId set.
 *
 * Usage:
 *   npx tsx scripts/backfill-dr-version.ts
 *   npx tsx scripts/backfill-dr-version.ts --dry-run
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  console.log(`📋 backfill-dr-version [${DRY_RUN ? "DRY-RUN" : "LIVE"}]`);

  // Load all VersionSnapshots sorted by startDate DESC (most recent first)
  const snapshots = await prisma.versionSnapshot.findMany({
    orderBy: { startDate: "desc" },
  });
  console.log(`   Found ${snapshots.length} VersionSnapshot(s)`);
  for (const s of snapshots) {
    console.log(`     ${s.id}: ${s.schemaVersion} [${s.startDate.toISOString().slice(0, 10)} → ${s.endDate?.toISOString().slice(0, 10) ?? "now"}]`);
  }

  // Count unlinked DR rows
  const unlinked = await prisma.dailyRecommendation.findMany({
    where: { versionSnapshotId: null },
    select: { id: true, date: true },
    orderBy: { date: "asc" },
  });
  console.log(`\n   Unlinked DR rows: ${unlinked.length}`);
  if (unlinked.length === 0) {
    console.log("   Nothing to backfill. Exiting.");
    return;
  }

  // Map each DR row to the appropriate VersionSnapshot
  type UpdateItem = { id: number; vsId: string; modelVersion: string; scoreVersion: string; schemaVersion: string };
  const updates: UpdateItem[] = [];

  for (const dr of unlinked) {
    const drDate = new Date(dr.date);
    // Find first snapshot whose startDate <= drDate (and endDate > drDate or null)
    let matched = snapshots.find((s) => {
      const start = new Date(s.startDate);
      const end   = s.endDate ? new Date(s.endDate) : null;
      if (start > drDate) return false;
      if (end !== null && end < drDate) return false;
      return true;
    });
    // Fallback: earliest snapshot
    if (!matched) matched = snapshots[snapshots.length - 1];
    if (!matched) continue;

    updates.push({
      id:            dr.id,
      vsId:          matched.id,
      modelVersion:  matched.modelVersion,
      scoreVersion:  matched.scoreVersion,
      schemaVersion: matched.schemaVersion,
    });
  }

  // Group by vsId for logging
  const grouped = new Map<string, number>();
  for (const u of updates) {
    grouped.set(u.vsId, (grouped.get(u.vsId) ?? 0) + 1);
  }
  console.log("\n   Backfill plan:");
  for (const [vsId, count] of grouped) {
    console.log(`     ${vsId} ← ${count} rows`);
  }

  if (DRY_RUN) {
    console.log("\n   [DRY-RUN] No changes written.");
    return;
  }

  // Execute in batches of 500
  const BATCH = 500;
  let done = 0;
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    await prisma.$transaction(
      batch.map((u) =>
        prisma.dailyRecommendation.update({
          where: { id: u.id },
          data: {
            versionSnapshotId: u.vsId,
            modelVersion:      u.modelVersion,
            scoreVersion:      u.scoreVersion,
            schemaVersion:     u.schemaVersion,
          },
        })
      )
    );
    done += batch.length;
    console.log(`   Progress: ${done}/${updates.length}`);
  }

  console.log(`\n✅ Backfill complete: ${done} DR rows updated.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
