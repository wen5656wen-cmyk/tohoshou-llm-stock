import { prisma } from "@/lib/prisma";
import { HomeDashboardClient } from "./HomeDashboardClient";

export const dynamic = "force-dynamic";

async function getDashboardData() {
  const [stockCount, priceCount, , latestPrice, scores, scoreCount] =
    await Promise.all([
      prisma.stock.count(),
      prisma.dailyPrice.count(),
      prisma.financial.count(),
      prisma.dailyPrice.findFirst({ orderBy: { date: "desc" }, select: { date: true } }),
      prisma.stockScore.findMany({
        where: { priceCount: { gte: 20 }, adaptiveScore: { not: null } },
        orderBy: { adaptiveScore: "desc" },
        select: {
          symbol: true, name: true, nameZh: true, market: true, sector: true,
          latestClose: true, latestDate: true,
          return5d: true, return20d: true, return60d: true,
          rsi14: true, maTrend: true, macdSignalLabel: true,
          technicalScore: true, fundamentalScore: true, moneyFlowScore: true, riskScore: true,
          totalScore: true, adaptiveScore: true,
          recommendation: true, recommendationV2: true,
          starsLabel: true, summaryReason: true,
          percentileRank: true, opportunityScore: true, stockStyle: true,
        },
      }),
      prisma.stockScore.count({ where: { priceCount: { gte: 20 } } }),
    ]);

  const latestDateStr = latestPrice ? latestPrice.date.toISOString().split("T")[0] : "—";
  const buyCount   = scores.filter((s) => s.recommendationV2 === "STRONG_BUY" || s.recommendationV2 === "BUY").length;
  const watchCount = scores.filter((s) => s.recommendationV2 === "WATCH").length;
  const top3 = scores.slice(0, 3);

  return { stockCount, priceCount, scoreCount, buyCount, watchCount, latestDateStr, top3, scores };
}

export default async function DashboardPage() {
  const data = await getDashboardData();
  return <HomeDashboardClient {...data} />;
}
