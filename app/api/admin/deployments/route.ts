import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Optional auth — same pattern as /api/admin/verify
function isAuthorized(req: NextRequest): boolean {
  const envToken = process.env.ADMIN_TOKEN;
  if (!envToken) return true; // open if not configured
  const headerToken = req.headers.get("x-admin-token");
  const queryToken  = new URL(req.url).searchParams.get("token");
  return headerToken === envToken || queryToken === envToken;
}

// GET /api/admin/deployments?limit=20&offset=0
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url    = new URL(req.url);
  const limit  = Math.min(parseInt(url.searchParams.get("limit")  ?? "20"), 100);
  const offset = parseInt(url.searchParams.get("offset") ?? "0");

  const [total, rows] = await Promise.all([
    prisma.deploymentLog.count(),
    prisma.deploymentLog.findMany({
      orderBy: { deployedAt: "desc" },
      take: limit,
      skip: offset,
    }),
  ]);

  // Convert deployedAt UTC → JST display string
  const enriched = rows.map((r) => {
    const jst = new Date(r.deployedAt.getTime() + 9 * 3600 * 1000);
    return {
      ...r,
      deployedAtJst: jst.toISOString().slice(0, 16).replace("T", " ") + " JST",
      modifiedFiles:   r.modifiedFiles   as string[],
      warnings:        r.warnings        as string[],
      blockingIssues:  r.blockingIssues  as string[],
    };
  });

  return NextResponse.json({ total, rows: enriched });
}

// POST /api/admin/deployments — create a new deployment record
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    commitHash, summary, modifiedFiles = [],
    buildStatus = "SKIP", healthStatus = "SKIP",
    apiStatus = "SKIP", pageStatus = "SKIP",
    databaseStatus = "SKIP", pm2Status = "SKIP",
    productionReady = false,
    warnings = [], blockingIssues = [],
    operator = "Claude",
    deployedAt,
  } = body as {
    commitHash: string; summary: string; modifiedFiles?: string[];
    buildStatus?: string; healthStatus?: string; apiStatus?: string;
    pageStatus?: string; databaseStatus?: string; pm2Status?: string;
    productionReady?: boolean; warnings?: string[]; blockingIssues?: string[];
    operator?: string; deployedAt?: string;
  };

  if (!commitHash || !summary) {
    return NextResponse.json({ error: "commitHash and summary are required" }, { status: 400 });
  }

  const record = await prisma.deploymentLog.create({
    data: {
      commitHash,
      summary,
      modifiedFiles:   modifiedFiles  as unknown as import("@prisma/client").Prisma.JsonArray,
      buildStatus:     String(buildStatus).toUpperCase(),
      healthStatus:    String(healthStatus).toUpperCase(),
      apiStatus:       String(apiStatus).toUpperCase(),
      pageStatus:      String(pageStatus).toUpperCase(),
      databaseStatus:  String(databaseStatus).toUpperCase(),
      pm2Status:       String(pm2Status).toUpperCase(),
      productionReady: Boolean(productionReady),
      warnings:        (warnings  as unknown) as import("@prisma/client").Prisma.JsonArray,
      blockingIssues:  (blockingIssues as unknown) as import("@prisma/client").Prisma.JsonArray,
      operator:        String(operator),
      deployedAt:      deployedAt ? new Date(deployedAt) : new Date(),
    },
  });

  const jst = new Date(record.deployedAt.getTime() + 9 * 3600 * 1000);
  return NextResponse.json({
    ...record,
    deployedAtJst: jst.toISOString().slice(0, 16).replace("T", " ") + " JST",
  }, { status: 201 });
}
