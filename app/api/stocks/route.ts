import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const VALID_SORT = new Set(["symbol", "name", "price", "changeRate", "high52w", "low52w", "volume"]);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q      = searchParams.get("q") || "";
  const market = searchParams.get("market") || "";
  const sector = searchParams.get("sector") || "";
  const sort   = VALID_SORT.has(searchParams.get("sort") ?? "") ? searchParams.get("sort")! : "symbol";
  const order  = searchParams.get("order") === "asc" ? "asc" : "desc";
  const page   = Math.max(1, parseInt(searchParams.get("page") ?? "1") || 1);
  const limit  = Math.min(100, parseInt(searchParams.get("limit") ?? "50") || 50);
  const skip   = (page - 1) * limit;

  const where = {
    AND: [
      q ? { OR: [{ name: { contains: q } }, { symbol: { contains: q } }] } : {},
      market ? { market: { contains: market } } : {},
      sector ? { sector: { contains: sector } } : {},
    ],
  };

  const [total, stocks] = await Promise.all([
    prisma.stock.count({ where }),
    prisma.stock.findMany({
      where,
      orderBy: { [sort]: order },
      skip,
      take: limit,
      select: {
        id: true, symbol: true, name: true, market: true, sector: true,
        industry: true, price: true, change: true, changeRate: true,
        high52w: true, low52w: true, volume: true,
      },
    }),
  ]);

  return NextResponse.json({ stocks, total, page, limit, totalPages: Math.ceil(total / limit) });
}
