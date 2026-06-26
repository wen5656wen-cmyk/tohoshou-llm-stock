import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as fs from "fs";
import * as path from "path";

export const dynamic = "force-dynamic";

// Derive human-readable role from VersionSnapshot fields
function deriveRole(
  isBaseline: boolean,
  endDate: Date | null,
): "current" | "baseline" | "legacy" {
  if (isBaseline) return "baseline";
  if (endDate === null) return "current";
  return "legacy";
}

function learningReportExists(date: Date): boolean {
  const dateStr = date.toISOString().slice(0, 10);
  const p = path.join(process.cwd(), "reports", `learning-report-${dateStr}.json`);
  return fs.existsSync(p);
}

export async function GET() {
  try {
    const [snapshots, drStats, bpStats] = await Promise.all([
      prisma.versionSnapshot.findMany({
        orderBy: { startDate: "desc" },
      }),
      // Count DR rows linked vs total per versionSnapshotId
      prisma.$queryRaw<Array<{ vsId: string | null; cnt: bigint }>>`
        SELECT "versionSnapshotId" AS "vsId", COUNT(*) AS cnt
        FROM daily_recommendations
        GROUP BY "versionSnapshotId"
      `,
      // Count BP rows linked vs total per versionSnapshotId
      prisma.$queryRaw<Array<{ vsId: string | null; cnt: bigint }>>`
        SELECT "versionSnapshotId" AS "vsId", COUNT(*) AS cnt
        FROM backtest_position_results
        GROUP BY "versionSnapshotId"
      `,
    ]);

    // Build per-vsId DR count maps
    const drByVs = new Map<string, number>();
    let drNullCount = 0;
    for (const r of drStats) {
      if (r.vsId == null) drNullCount += Number(r.cnt);
      else drByVs.set(r.vsId, Number(r.cnt));
    }
    const drTotal = drStats.reduce((s, r) => s + Number(r.cnt), 0);
    const drLinked = drTotal - drNullCount;

    const bpByVs = new Map<string, number>();
    let bpNullCount = 0;
    for (const r of bpStats) {
      if (r.vsId == null) bpNullCount += Number(r.cnt);
      else bpByVs.set(r.vsId, Number(r.cnt));
    }
    const bpTotal = bpStats.reduce((s, r) => s + Number(r.cnt), 0);
    const bpLinked = bpTotal - bpNullCount;

    // Annotate each snapshot with integrity counts and role
    const versions = snapshots.map((s) => {
      const drLinkedForVs = drByVs.get(s.id) ?? 0;
      const bpLinkedForVs = bpByVs.get(s.id) ?? 0;
      return {
        id:               s.id,
        modelVersion:     s.modelVersion,
        scoreVersion:     s.scoreVersion,
        schemaVersion:    s.schemaVersion,
        ruleEngineVer:    s.ruleEngineVer,
        scoringSchemaVer: s.scoringSchemaVer,
        llmModelVer:      s.llmModelVer,
        startDate:        s.startDate.toISOString().slice(0, 10),
        endDate:          s.endDate?.toISOString().slice(0, 10) ?? null,
        isBaseline:       s.isBaseline,
        changeLog:        s.changeLog,
        experimentId:     s.experimentId,
        createdAt:        s.createdAt.toISOString(),
        role:             deriveRole(s.isBaseline, s.endDate),
        drLinked:         drLinkedForVs,
        bpLinked:         bpLinkedForVs,
        learningReportExists: learningReportExists(s.startDate),
      };
    });

    return NextResponse.json({
      versions,
      integrity: {
        drTotal,
        drLinked,
        drMissingCount:  drNullCount,
        drCoveragePct:   drTotal > 0 ? Math.round((drLinked / drTotal) * 100) : 0,
        bpTotal,
        bpLinked,
        bpMissingCount:  bpNullCount,
        bpCoveragePct:   bpTotal > 0 ? Math.round((bpLinked / bpTotal) * 100) : 0,
        status:
          bpNullCount > 0 ? "CRITICAL" :
          drNullCount > 0 ? "WARNING" : "OK",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
