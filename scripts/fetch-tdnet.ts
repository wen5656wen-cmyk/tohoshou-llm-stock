/**
 * fetch-tdnet.ts — Sync TDnet disclosures to Disclosure table
 *
 * Usage:
 *   npx tsx scripts/fetch-tdnet.ts            # fetch last 5 trading days
 *   npx tsx scripts/fetch-tdnet.ts --days 10  # fetch last N trading days
 *   DRY_RUN=1 npx tsx scripts/fetch-tdnet.ts  # print without writing DB
 *
 * Flow:
 *   TDnet → parse → Disclosure table → catalystScore updated in StockScore
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { fetchTDnetForDate } from "../lib/tdnet";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const DRY_RUN = process.env.DRY_RUN === "1";

async function main() {
  const daysArg = process.argv.indexOf("--days");
  const days = daysArg >= 0 ? parseInt(process.argv[daysArg + 1] ?? "5") : 5;

  console.log(`\n=== TDnet 真实数据同步 (last ${days} trading days) ===`);
  if (DRY_RUN) console.log("DRY_RUN=1 — 不写入数据库\n");

  // Preload Stock symbol → id map
  const stocks = await prisma.stock.findMany({ select: { id: true, symbol: true } });
  const symbolToId = new Map(stocks.map((s) => [s.symbol, s.id]));

  let totalFetched = 0;
  let totalUpserted = 0;
  const catStats: Record<string, number> = {};

  // Get last N trading days
  const tradingDays: Date[] = [];
  const today = new Date();
  let d = new Date(today);
  while (tradingDays.length < days) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) tradingDays.push(new Date(d));
    d.setDate(d.getDate() - 1);
  }

  for (const day of tradingDays) {
    const dateStr = `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,"0")}-${String(day.getDate()).padStart(2,"0")}`;
    process.stdout.write(`  ${dateStr} ... `);

    try {
      const disclosures = await fetchTDnetForDate(day);
      console.log(`${disclosures.length} 件`);
      totalFetched += disclosures.length;

      for (const d of disclosures) {
        catStats[d.category] = (catStats[d.category] ?? 0) + 1;
      }

      if (!DRY_RUN && disclosures.length > 0) {
        // Build stock lookup for this batch
        const symbolSet = new Set(disclosures.map((d) => d.symbol));
        const stockRows = await prisma.stock.findMany({
          where: { symbol: { in: [...symbolSet] } },
          select: { id: true, symbol: true },
        });
        const localMap = new Map(stockRows.map((s) => [s.symbol, s.id]));

        // Upsert by url (unique key)
        for (const disc of disclosures) {
          const stockId = localMap.get(disc.symbol) ?? symbolToId.get(disc.symbol) ?? null;
          try {
            await prisma.disclosure.upsert({
              where: { url: disc.url },
              create: {
                symbol: disc.symbol,
                stockId,
                title: disc.title,
                publishedAt: disc.publishedAt,
                category: disc.category,
                sentiment: disc.sentiment,
                url: disc.url,
                importance: disc.importance,
                rawData: { companyName: disc.companyName, code4: disc.code4 },
              },
              update: {
                title: disc.title,
                category: disc.category,
                sentiment: disc.sentiment,
                importance: disc.importance,
              },
            });
            totalUpserted++;
          } catch (_) {
            // skip duplicate url
          }
        }
      }
    } catch (e) {
      console.log(`ERROR: ${(e as Error).message}`);
    }
  }

  // Update catalystScore in StockScore for affected symbols
  if (!DRY_RUN && totalUpserted > 0) {
    console.log("\n=== 更新 catalystScore ===");
    const cutoff = new Date(Date.now() - 30 * 86400_000);
    const recentDiscs = await prisma.disclosure.findMany({
      where: { publishedAt: { gte: cutoff } },
      select: { symbol: true, category: true, importance: true },
    });

    const bySymbol = new Map<string, { count: number; maxImp: number; hasEarnings: boolean }>();
    for (const d of recentDiscs) {
      const cur = bySymbol.get(d.symbol) ?? { count: 0, maxImp: 0, hasEarnings: false };
      cur.count++;
      cur.maxImp = Math.max(cur.maxImp, d.importance);
      if (d.category === "EARNINGS" || d.category === "FORECAST_REVISION") cur.hasEarnings = true;
      bySymbol.set(d.symbol, cur);
    }

    let updated = 0;
    for (const [symbol, info] of bySymbol) {
      // catalystScore: base 5 + 1 per disclosure (max +3) + earnings bonus + max importance bonus
      let score = 5;
      score += Math.min(3, info.count);
      if (info.hasEarnings) score += 2;
      score += Math.round((info.maxImp - 5) / 2); // 0-2 bonus
      score = Math.max(1, Math.min(10, score));

      await prisma.stockScore.updateMany({
        where: { symbol },
        data: { catalystScore: score },
      });
      updated++;
    }
    console.log(`  catalystScore updated: ${updated} 只`);
  }

  console.log(`\n=== 完成 ===`);
  console.log(`Fetched: ${totalFetched} 件  Upserted: ${totalUpserted} 件`);
  console.log("\n公告类型统计:");
  for (const [cat, cnt] of Object.entries(catStats).sort(([,a],[,b]) => b - a)) {
    const pct = totalFetched > 0 ? (cnt / totalFetched * 100).toFixed(1) : "0";
    console.log(`  ${cat.padEnd(22)}: ${cnt} (${pct}%)`);
  }

  // Write SyncLog (skip in DRY_RUN)
  if (!DRY_RUN) {
    await prisma.syncLog.create({
      data: {
        source: "tdnet",
        status: totalUpserted > 0 ? "SUCCESS" : totalFetched > 0 ? "PARTIAL" : "ERROR",
        message: `Fetched ${totalFetched}件 Upserted ${totalUpserted}件 (${days}天)`,
        itemCount: totalUpserted,
      },
    });
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
