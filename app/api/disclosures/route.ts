import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") || "";
  const category = searchParams.get("category") || "";
  const limit = Math.min(Number(searchParams.get("limit") || "20"), 50);

  const where: Record<string, unknown> = {};
  if (symbol) where.symbol = symbol;
  if (category) where.category = category;

  const disclosures = await prisma.disclosure.findMany({
    where,
    orderBy: { publishedAt: "desc" },
    take: limit,
    include: {
      stock: { select: { symbol: true, name: true } },
    },
  });

  return NextResponse.json(disclosures);
}
