import { prisma } from "@/lib/prisma";
import { SystemDashboard } from "./SystemDashboard";

export const dynamic = "force-dynamic";

function todayJSTDate(): Date {
  const jst = new Date().toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })
    .replace(/\//g, "-")
    .replace(/(\d{4})-(\d{1,2})-(\d{1,2})/, (_, y, m, d) =>
      `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
    );
  return new Date(`${jst}T00:00:00.000Z`);
}

async function getDashboardData() {
  const todayObj = todayJSTDate();

  const [
    activeStockCount,
    scoredCount,
    todayRecGroups,
    validPriceCount,
    latestPrice,
    latestScore,
    latestNews,
    latestJquants,
  ] = await Promise.all([
    // 1. Active stocks: LISTED + not delisted
    prisma.stock.count({
      where: { isDelisted: false, OR: [{ listingStatus: "LISTED" }, { listingStatus: null }] },
    }),

    // 2. Valid scored stocks: adaptiveScore not null
    prisma.stockScore.count({
      where: { adaptiveScore: { not: null } },
    }),

    // 3. Today's BUY/STRONG_BUY from DailyRecommendation
    prisma.dailyRecommendation.groupBy({
      by: ["recommendation"],
      where: { date: todayObj, recommendation: { in: ["STRONG_BUY", "BUY"] } },
      _count: { recommendation: true },
    }),

    // 4. Valid price records: close > 0, volume >= 0
    prisma.dailyPrice.count({
      where: { close: { gt: 0 }, volume: { gte: 0 } },
    }),

    // 5. Last trading date
    prisma.dailyPrice.findFirst({
      orderBy: { date: "desc" },
      select: { date: true },
    }),

    // 6. Last score computation time
    prisma.stockScore.findFirst({
      orderBy: { computedAt: "desc" },
      select: { computedAt: true },
    }),

    // 7. Last news sync
    prisma.syncJob.findFirst({
      where: { source: "news", status: "SUCCESS" },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true, finishedAt: true, successCount: true, status: true },
    }),

    // 8. Last jquants price sync
    prisma.syncJob.findFirst({
      where: { source: "jquants", status: "SUCCESS" },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true, finishedAt: true, successCount: true, status: true },
    }),
  ]);

  const strongBuyCount =
    todayRecGroups.find((r) => r.recommendation === "STRONG_BUY")?._count?.recommendation ?? 0;
  const buyCount =
    todayRecGroups.find((r) => r.recommendation === "BUY")?._count?.recommendation ?? 0;

  return {
    activeStockCount,
    scoredCount,
    strongBuyCount,
    buyCount,
    totalBuyCount: strongBuyCount + buyCount,
    validPriceCount,
    lastTradingDate: latestPrice?.date?.toISOString()?.slice(0, 10) ?? null,
    lastComputedAt: latestScore?.computedAt?.toISOString() ?? null,
    lastNewsSyncAt: latestNews?.startedAt?.toISOString() ?? null,
    lastPriceSyncAt: latestJquants?.startedAt?.toISOString() ?? null,
  };
}

export default async function DashboardPage() {
  const data = await getDashboardData();
  return <SystemDashboard {...data} />;
}
