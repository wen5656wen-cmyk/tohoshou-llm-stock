import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const ALL_HORIZONS = ["1d","3d","5d","7d","10d","20d","30d","60d","90d"] as const;
type Horizon = typeof ALL_HORIZONS[number];

function r4(n: number | null | undefined): number | null {
  if (n === null || n === undefined || isNaN(Number(n))) return null;
  return Math.round(Number(n) * 10000) / 10000;
}

type HorizonRow = {
  horizon: Horizon;
  sampleCount: number;
  filledCount: number;
  winCount: number;
  avgReturn: number | null;
  avgAlpha: number | null;
  winRate: number | null;
};

async function getBacktestForVersion(vsId: string): Promise<HorizonRow[]> {
  const rows = await prisma.$queryRaw<Array<{
    horizon: string;
    sampleCount: bigint;
    filledCount: bigint;
    winCount: bigint;
    avgReturn: number | null;
    avgAlpha: number | null;
  }>>`
    SELECT
      horizon,
      COUNT(*) AS "sampleCount",
      COUNT(*) FILTER (WHERE "returnPct" IS NOT NULL) AS "filledCount",
      COUNT(*) FILTER (WHERE "winFlag" = true)        AS "winCount",
      AVG("returnPct")      AS "avgReturn",
      AVG("alphaVsTopix")   AS "avgAlpha"
    FROM backtest_position_results
    WHERE "versionSnapshotId" = ${vsId}
    GROUP BY horizon
  `;

  return ALL_HORIZONS.map((h) => {
    const r = rows.find((x) => x.horizon === h);
    const sampleCount = Number(r?.sampleCount ?? 0);
    const filledCount = Number(r?.filledCount ?? 0);
    const winCount    = Number(r?.winCount    ?? 0);
    const winRate     = filledCount > 0 ? r4((winCount / filledCount) * 100) : null;
    return {
      horizon:     h,
      sampleCount,
      filledCount,
      winCount,
      avgReturn:   r ? r4(r.avgReturn) : null,
      avgAlpha:    r ? r4(r.avgAlpha)  : null,
      winRate,
    };
  });
}

async function getTradingDays(vsId: string): Promise<number> {
  const rows = await prisma.$queryRaw<[{ cnt: bigint }]>`
    SELECT COUNT(DISTINCT "recDate") AS cnt
    FROM backtest_position_results
    WHERE "versionSnapshotId" = ${vsId}
  `;
  return Number(rows[0]?.cnt ?? 0);
}

async function getFeatureCoveragePct(vsId: string): Promise<number | null> {
  const rows = await prisma.$queryRaw<[{ total: bigint; covered: bigint }]>`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE "feat_adaptiveScore" IS NOT NULL) AS covered
    FROM daily_recommendations
    WHERE "versionSnapshotId" = ${vsId}
  `;
  const total   = Number(rows[0]?.total   ?? 0);
  const covered = Number(rows[0]?.covered ?? 0);
  if (total === 0) return null;
  return Math.round((covered / total) * 100);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const aId = searchParams.get("a");
    const bId = searchParams.get("b");

    if (!aId || !bId) {
      return NextResponse.json(
        { error: "Missing required query params: a, b" },
        { status: 400 }
      );
    }

    const [vsA, vsB] = await Promise.all([
      prisma.versionSnapshot.findUnique({ where: { id: aId } }),
      prisma.versionSnapshot.findUnique({ where: { id: bId } }),
    ]);

    if (!vsA) return NextResponse.json({ error: `VersionSnapshot '${aId}' not found` }, { status: 404 });
    if (!vsB) return NextResponse.json({ error: `VersionSnapshot '${bId}' not found` }, { status: 404 });

    const comparisonAllowed = vsA.schemaVersion === vsB.schemaVersion;
    const reason = comparisonAllowed
      ? null
      : `schemaVersion differs (${vsA.schemaVersion} vs ${vsB.schemaVersion}) — backtest feature spaces are incompatible`;

    const [
      tradingDaysA, tradingDaysB,
      featureCovA, featureCovB,
      backtestA, backtestB,
    ] = await Promise.all([
      getTradingDays(aId),
      getTradingDays(bId),
      getFeatureCoveragePct(aId),
      getFeatureCoveragePct(bId),
      getBacktestForVersion(aId),
      getBacktestForVersion(bId),
    ]);

    // Regression: 7d win rate delta (A vs B) — only when comparable
    let regressionStatus: string;
    let winRateDelta7d: number | null = null;
    if (!comparisonAllowed) {
      regressionStatus = "NOT_COMPARABLE";
    } else {
      const wr7A = backtestA.find((h) => h.horizon === "7d")?.winRate ?? null;
      const wr7B = backtestB.find((h) => h.horizon === "7d")?.winRate ?? null;
      if (wr7A === null || wr7B === null) {
        regressionStatus = "INSUFFICIENT_DATA";
      } else {
        winRateDelta7d = r4(wr7A - wr7B);
        if (winRateDelta7d !== null && winRateDelta7d <= -15)       regressionStatus = "CRITICAL";
        else if (winRateDelta7d !== null && winRateDelta7d <= -5)   regressionStatus = "WARNING";
        else                                                         regressionStatus = "OK";
      }
    }

    // Build horizon delta table when comparable
    let backtestDelta: Array<{ horizon: Horizon; winRateDelta: number | null; returnDelta: number | null; alphaDelta: number | null }> | null = null;
    if (comparisonAllowed) {
      backtestDelta = ALL_HORIZONS.map((h) => {
        const rowA = backtestA.find((r) => r.horizon === h);
        const rowB = backtestB.find((r) => r.horizon === h);
        return {
          horizon:      h,
          winRateDelta: rowA?.winRate   != null && rowB?.winRate   != null ? r4(rowA.winRate   - rowB.winRate)   : null,
          returnDelta:  rowA?.avgReturn != null && rowB?.avgReturn != null ? r4(rowA.avgReturn - rowB.avgReturn) : null,
          alphaDelta:   rowA?.avgAlpha  != null && rowB?.avgAlpha  != null ? r4(rowA.avgAlpha  - rowB.avgAlpha)  : null,
        };
      });
    }

    return NextResponse.json({
      versionA: {
        id: vsA.id, schemaVersion: vsA.schemaVersion, modelVersion: vsA.modelVersion,
        startDate: vsA.startDate.toISOString().slice(0, 10),
        endDate:   vsA.endDate?.toISOString().slice(0, 10) ?? null,
        isBaseline: vsA.isBaseline,
      },
      versionB: {
        id: vsB.id, schemaVersion: vsB.schemaVersion, modelVersion: vsB.modelVersion,
        startDate: vsB.startDate.toISOString().slice(0, 10),
        endDate:   vsB.endDate?.toISOString().slice(0, 10) ?? null,
        isBaseline: vsB.isBaseline,
      },
      comparisonAllowed,
      reason,
      tradingDaysA,
      tradingDaysB,
      featureCoverageA: featureCovA,
      featureCoverageB: featureCovB,
      backtestA,
      backtestB,
      backtestDelta,
      winRateDelta7d,
      regressionStatus,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
