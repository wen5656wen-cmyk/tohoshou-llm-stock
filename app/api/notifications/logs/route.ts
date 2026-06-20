import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);

  const logs = await prisma.notificationLog.findMany({
    where: type ? { type } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const stats = await prisma.notificationLog.groupBy({
    by: ["status"],
    _count: { id: true },
    where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 3600000) } },
  });

  return NextResponse.json({ logs, stats });
}
