import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidExcludeReason } from "@/lib/ai-universe";

export const dynamic = "force-dynamic";

// Optional auth — same pattern as /api/admin/verify + /api/admin/deployments
function isAuthorized(req: NextRequest): boolean {
  const envToken = process.env.ADMIN_TOKEN;
  if (!envToken) return true; // open if not configured
  const headerToken = req.headers.get("x-admin-token");
  const queryToken = new URL(req.url).searchParams.get("token");
  return headerToken === envToken || queryToken === envToken;
}

const UNIVERSE_SELECT = {
  symbol: true, name: true, aiEnabled: true, excludeReason: true,
  aiExcludeSource: true, aiExcludeRule: true, aiExcludeUpdatedAt: true,
} as const;

// GET current AI-universe state for a symbol
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol: raw } = await params;
  const symbol = decodeURIComponent(raw);
  const stock = await prisma.stock.findUnique({
    where: { symbol },
    select: UNIVERSE_SELECT,
  });
  if (!stock) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(stock);
}

// POST { aiEnabled: boolean, excludeReason?: string }
// - disable → set aiEnabled=false + reason code, and immediately purge the
//   StockScore row so every StockScore-driven flow excludes it right away
//   (not only after the next 07:30 compute-scores run).
// - enable  → set aiEnabled=true, clear excludeReason. Next compute-scores
//   re-creates its StockScore.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { symbol: raw } = await params;
  const symbol = decodeURIComponent(raw);

  let body: { aiEnabled?: unknown; excludeReason?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.aiEnabled !== "boolean") {
    return NextResponse.json({ error: "aiEnabled (boolean) is required" }, { status: 400 });
  }

  const existing = await prisma.stock.findUnique({
    where: { symbol },
    select: { symbol: true, aiExcludeSource: true, aiExcludeRule: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const now = new Date();

  if (body.aiEnabled) {
    // Manual add. If the stock was AUTO/SYSTEM-excluded, this is a manual OVERRIDE:
    // keep source=MANUAL + the matched rule as a warning so the auto guard won't
    // re-exclude it, and the UI can flag "kept despite an auto rule". Otherwise it's
    // a clean enable (clears all provenance). StockScore rebuilt next compute-scores.
    const wasAuto = existing.aiExcludeSource === "AUTO" || existing.aiExcludeSource === "SYSTEM";
    const updated = await prisma.stock.update({
      where: { symbol },
      data: {
        aiEnabled: true,
        excludeReason: null,
        aiExcludeSource: wasAuto ? "MANUAL" : null,
        aiExcludeRule: wasAuto ? existing.aiExcludeRule : null,
        aiExcludeUpdatedAt: now,
      },
      select: UNIVERSE_SELECT,
    });
    return NextResponse.json({ ok: true, purgedScore: false, override: wasAuto, stock: updated });
  }

  // Manual disable → MANUAL source, require a valid reason code (default MANUAL).
  const reason = isValidExcludeReason(body.excludeReason)
    ? body.excludeReason
    : "MANUAL";

  const [updated, purged] = await prisma.$transaction([
    prisma.stock.update({
      where: { symbol },
      data: {
        aiEnabled: false,
        excludeReason: reason,
        aiExcludeSource: "MANUAL",
        aiExcludeRule: null,
        aiExcludeUpdatedAt: now,
      },
      select: UNIVERSE_SELECT,
    }),
    prisma.stockScore.deleteMany({ where: { symbol } }),
  ]);

  return NextResponse.json({ ok: true, purgedScore: purged.count > 0, override: false, stock: updated });
}
