import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const [globalMarket, latestFlow, flowSummary] = await Promise.all([
    prisma.globalMarket.findFirst({
      orderBy: { date: "desc" },
      select: {
        date: true, score: true, source: true,
        nasdaq: true, nasdaqChange: true,
        vix: true, usdjpy: true,
        nikkei: true, nikkeiChange: true,
        topix: true, topixChange: true,
      },
    }),
    prisma.institutionalFlow.findFirst({
      orderBy: { date: "desc" },
      select: { date: true, source: true },
    }),
    prisma.institutionalFlow.findMany({
      where: {
        date: (await prisma.institutionalFlow.findFirst({ orderBy: { date: "desc" }, select: { date: true } }))?.date ?? new Date(0),
        market: "ALL",
      },
      select: { investorType: true, netAmount: true, buyAmount: true, sellAmount: true, source: true },
    }),
  ]);

  const nowMs = Date.now();
  const globalAgeMs = globalMarket ? nowMs - globalMarket.date.getTime() : null;
  const flowAgeMs   = latestFlow   ? nowMs - latestFlow.date.getTime()   : null;

  return NextResponse.json({
    globalMarket: globalMarket
      ? {
          date:          globalMarket.date.toISOString().split("T")[0],
          ageDays:       globalAgeMs != null ? +(globalAgeMs / 86400000).toFixed(1) : null,
          isStale:       globalAgeMs != null && globalAgeMs > 7 * 86400000,
          score:         globalMarket.score,
          source:        globalMarket.source,
          nasdaq:        globalMarket.nasdaq,
          nasdaqChange:  globalMarket.nasdaqChange ? +globalMarket.nasdaqChange.toFixed(2) : null,
          vix:           globalMarket.vix,
          usdjpy:        globalMarket.usdjpy,
          nikkei:        globalMarket.nikkei,
          nikkeiChange:  globalMarket.nikkeiChange ? +globalMarket.nikkeiChange.toFixed(2) : null,
          topix:         globalMarket.topix,
          topixChange:   globalMarket.topixChange  ? +globalMarket.topixChange.toFixed(2)  : null,
        }
      : null,

    institutionalFlow: latestFlow
      ? {
          date:    latestFlow.date.toISOString().split("T")[0],
          ageDays: flowAgeMs != null ? +(flowAgeMs / 86400000).toFixed(1) : null,
          isStale: flowAgeMs != null && flowAgeMs > 14 * 86400000,
          source:  latestFlow.source,
          flows:   flowSummary.map((f) => ({
            investorType: f.investorType,
            netAmount:    f.netAmount,
            buyAmount:    f.buyAmount,
            sellAmount:   f.sellAmount,
          })),
        }
      : null,

    scoringMode: {
      globalTrend:  globalMarket && globalAgeMs != null && globalAgeMs <= 7 * 86400000 ? "yahoo_v3" : "v2_default_7",
      moneyFlow:    latestFlow   && flowAgeMs   != null && flowAgeMs   <= 14 * 86400000
        ? (latestFlow.source === "jpx" ? "jpx_v3" : "synthetic_neutral")
        : "v2_proxy",
    },
  });
}
