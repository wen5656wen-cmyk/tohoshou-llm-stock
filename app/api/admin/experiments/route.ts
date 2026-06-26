import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const STATUS_ORDER = ["RUNNING", "PLANNED", "COMPLETED", "ADOPTED", "ABANDONED"] as const;

export async function GET() {
  try {
    const experiments = await prisma.experimentRegistry.findMany({
      orderBy: [{ status: "asc" }, { startDate: "desc" }],
    });

    // Group by status
    const grouped: Record<string, typeof experiments> = {};
    for (const s of STATUS_ORDER) grouped[s] = [];
    for (const ex of experiments) {
      const key = ex.status in grouped ? ex.status : "ABANDONED";
      (grouped[key] ??= []).push(ex);
    }

    // Summary counts
    const summary = Object.fromEntries(
      Object.entries(grouped).map(([k, v]) => [k, v.length])
    );

    return NextResponse.json({
      experiments: experiments.map((ex) => ({
        id:               ex.id,
        versionSnapshotId: ex.versionSnapshotId,
        startDate:        ex.startDate.toISOString().slice(0, 10),
        endDate:          ex.endDate?.toISOString().slice(0, 10) ?? null,
        hypothesis:       ex.hypothesis,
        changes:          (() => {
          try { return JSON.parse(ex.changes); } catch { return ex.changes; }
        })(),
        targetMetric:     ex.targetMetric,
        targetThreshold:  ex.targetThreshold,
        status:           ex.status,
        resultSummary:    ex.resultSummary,
        winRateDelta7d:   ex.winRateDelta7d,
        winRateDelta30d:  ex.winRateDelta30d,
        alphaDelta30d:    ex.alphaDelta30d,
        decision:         ex.decision,
        decisionReason:   ex.decisionReason,
        decisionDate:     ex.decisionDate?.toISOString().slice(0, 10) ?? null,
        nextExperimentId: ex.nextExperimentId,
        notes:            ex.notes,
        createdAt:        ex.createdAt.toISOString(),
      })),
      grouped,
      summary,
      total: experiments.length,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
