import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as fs from "fs";
import * as path from "path";

export const dynamic = "force-dynamic";

function learningReportExists(dateStr: string): boolean {
  const p = path.join(process.cwd(), "reports", `learning-report-${dateStr}.json`);
  return fs.existsSync(p);
}

function getRegressionStatus(dateStr: string): string | null {
  const p = path.join(process.cwd(), "reports", `learning-report-${dateStr}.json`);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
    return raw?.regressionDetection?.regressionStatus ?? null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const [snapshots, experiments, deployments] = await Promise.all([
      prisma.versionSnapshot.findMany({ orderBy: { startDate: "desc" } }),
      prisma.experimentRegistry.findMany({ orderBy: { startDate: "desc" } }),
      prisma.deploymentLog.findMany({
        orderBy: { deployedAt: "desc" },
        take: 50,
        select: {
          id: true, commitHash: true, summary: true,
          deployedAt: true, buildStatus: true, healthStatus: true, productionReady: true,
        },
      }),
    ]);

    // Per-version trading day and sample counts (from BacktestPositionResult)
    const bpAgg = await prisma.$queryRaw<Array<{
      vsId: string | null; tradingDays: bigint; sampleCount: bigint;
    }>>`
      SELECT
        "versionSnapshotId" AS "vsId",
        COUNT(DISTINCT "recDate") AS "tradingDays",
        COUNT(*) AS "sampleCount"
      FROM backtest_position_results
      GROUP BY "versionSnapshotId"
    `;
    const bpMap = new Map(bpAgg.map((r) => [r.vsId ?? "__null__", {
      tradingDays: Number(r.tradingDays),
      sampleCount: Number(r.sampleCount),
    }]));

    type TimelineEntry =
      | { type: "VERSION";     date: string; id: string; schemaVersion: string; modelVersion: string; role: string; tradingDays: number; sampleCount: number; learningReportExists: boolean; regressionStatus: string | null; changeLog: string | null; experimentId: string | null; isBaseline: boolean }
      | { type: "EXPERIMENT";  date: string; id: string; status: string; hypothesis: string; decision: string | null; versionSnapshotId: string | null }
      | { type: "DEPLOYMENT";  date: string; id: number; commitHash: string; summary: string; buildStatus: string; healthStatus: string; productionReady: boolean };

    const entries: TimelineEntry[] = [];

    // Version entries
    for (const s of snapshots) {
      const dateStr = s.startDate.toISOString().slice(0, 10);
      const bp = bpMap.get(s.id) ?? { tradingDays: 0, sampleCount: 0 };
      const role = s.isBaseline ? "baseline" : s.endDate === null ? "current" : "legacy";
      entries.push({
        type:                "VERSION",
        date:                dateStr,
        id:                  s.id,
        schemaVersion:       s.schemaVersion,
        modelVersion:        s.modelVersion,
        role,
        tradingDays:         bp.tradingDays,
        sampleCount:         bp.sampleCount,
        learningReportExists: learningReportExists(dateStr),
        regressionStatus:    getRegressionStatus(dateStr),
        changeLog:           s.changeLog,
        experimentId:        s.experimentId,
        isBaseline:          s.isBaseline,
      });
    }

    // Experiment entries
    for (const ex of experiments) {
      entries.push({
        type:              "EXPERIMENT",
        date:              ex.startDate.toISOString().slice(0, 10),
        id:                ex.id,
        status:            ex.status,
        hypothesis:        ex.hypothesis,
        decision:          ex.decision,
        versionSnapshotId: ex.versionSnapshotId,
      });
    }

    // Deployment entries
    for (const d of deployments) {
      const deployedAt = d.deployedAt as Date | null;
      entries.push({
        type:           "DEPLOYMENT",
        date:           (deployedAt ?? new Date()).toISOString().slice(0, 10),
        id:             d.id,
        commitHash:     d.commitHash,
        summary:        d.summary,
        buildStatus:    d.buildStatus,
        healthStatus:   d.healthStatus,
        productionReady: d.productionReady as boolean ?? false,
      });
    }

    // Sort all entries by date DESC, then by type priority (VERSION > EXPERIMENT > DEPLOYMENT)
    const TYPE_ORDER = { VERSION: 0, EXPERIMENT: 1, DEPLOYMENT: 2 };
    entries.sort((a, b) => {
      const dateDiff = b.date.localeCompare(a.date);
      if (dateDiff !== 0) return dateDiff;
      return TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
    });

    return NextResponse.json({ timeline: entries, totalEntries: entries.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
