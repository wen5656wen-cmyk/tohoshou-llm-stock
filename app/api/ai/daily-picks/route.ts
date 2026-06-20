import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateDailyPicks } from "@/lib/ai";

export async function GET() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const picks = await prisma.aIAnalysis.findMany({
    where: {
      analysisType: "DAILY_PICK",
      createdAt: { gte: today },
    },
    include: {
      stock: true,
    },
    orderBy: { score: "desc" },
    take: 10,
  });

  if (picks.length > 0) return NextResponse.json(picks);

  // Return recent picks if no picks today
  const recent = await prisma.aIAnalysis.findMany({
    where: { analysisType: "DAILY_PICK" },
    include: { stock: true },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return NextResponse.json(recent);
}

export async function POST() {
  const stocks = await prisma.stock.findMany({
    orderBy: { aiScore: "desc" },
  });

  const picks = await generateDailyPicks(stocks);

  const created = [];
  for (const pick of picks) {
    const stock = stocks.find((s) => s.symbol === pick.symbol);
    if (!stock) continue;

    const analysis = await prisma.aIAnalysis.create({
      data: {
        stockId: stock.id,
        model: process.env.AI_MODEL || "gpt-4o-mini",
        analysisType: "DAILY_PICK",
        score: stock.aiScore ?? 60,
        recommendation: "BUY",
        summary: pick.reason,
        bullPoints: [],
        bearPoints: [],
        riskLevel: "MEDIUM",
      },
      include: { stock: true },
    });
    created.push(analysis);
  }

  return NextResponse.json(created, { status: 201 });
}
