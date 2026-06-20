#!/usr/bin/env npx tsx
/**
 * Standalone J-Quants V2 sync script
 * Usage: npx tsx scripts/sync-jquants.ts
 *
 * Dividend note: /v2/fins/dividend requires Premium plan.
 * Standard plan: dividend data is embedded in /v2/fins/summary fields:
 *   DivAnn (年間配当/株), DivFY (期末配当), PayoutRatioAnn (配当性向)
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const API_KEY = process.env.JQUANTS_API_KEY!;
const BASE = "https://api.jquants.com/v2";

if (!API_KEY) {
  console.error("ERROR: JQUANTS_API_KEY not set in .env");
  process.exit(1);
}

async function jqGet(path: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, { headers: { "x-api-key": API_KEY } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`J-Quants GET ${path} failed: ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json();
}

function toCode(symbol: string): string {
  const c = symbol.replace(/\.[A-Z]+$/, "");
  return c.length === 4 ? c + "0" : c;
}

function parseNum(v: string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(String(v));
  return isNaN(n) ? null : n;
}

type Bar = { Date: string; O: number; H: number; L: number; C: number; Vo: number; AdjC: number };
type FinRow = Record<string, string | null | boolean | number>;
type MasterRow = { CoNameEn: string; MktNm: string; S17Nm: string; S33Nm: string };

async function syncStock(stock: { id: number; symbol: string; name: string }) {
  const code = toCode(stock.symbol);
  const to = new Date().toISOString().split("T")[0];
  const from = new Date(Date.now() - 365 * 86400000).toISOString().split("T")[0];

  // ── 1) Master info ─────────────────────────────────────────────────────────
  try {
    const md = await jqGet(`/equities/master?code=${code}`) as { data: MasterRow[] };
    if (md.data?.length > 0) {
      const m = md.data[0];
      await prisma.stock.update({
        where: { id: stock.id },
        data: { nameEn: m.CoNameEn || undefined, market: m.MktNm || undefined, sector: m.S17Nm || undefined, industry: m.S33Nm || undefined },
      });
    }
  } catch (e) {
    console.warn(`  [master] ${stock.symbol}: ${(e as Error).message}`);
  }

  // ── 2) Daily bars ──────────────────────────────────────────────────────────
  let priceCount = 0;
  let latestClose: number | null = null;
  try {
    const bd = await jqGet(`/equities/bars/daily?code=${code}&dateFrom=${from}&dateTo=${to}`) as { data: Bar[]; pagination_key?: string };
    let bars: Bar[] = bd.data || [];
    let pk = bd.pagination_key;
    while (pk) {
      const nx = await jqGet(`/equities/bars/daily?code=${code}&dateFrom=${from}&dateTo=${to}&pagination_key=${encodeURIComponent(pk)}`) as { data: Bar[]; pagination_key?: string };
      bars = bars.concat(nx.data || []);
      pk = nx.pagination_key;
    }

    for (const b of bars) {
      if (!b.Date || !b.C) continue;
      const date = new Date(b.Date);
      await prisma.dailyPrice.upsert({
        where: { symbol_date: { symbol: stock.symbol, date } },
        create: { symbol: stock.symbol, date, open: b.O, high: b.H, low: b.L, close: b.C, volume: b.Vo, adjClose: b.AdjC ?? null, source: "jquants" },
        update: { open: b.O, high: b.H, low: b.L, close: b.C, volume: b.Vo, adjClose: b.AdjC ?? null },
      });
      priceCount++;
    }

    if (bars.length > 0) {
      const latest = bars[bars.length - 1];
      const prev = bars.length > 1 ? bars[bars.length - 2] : null;
      const change = prev ? latest.C - prev.C : 0;
      const changeRate = prev && prev.C ? (change / prev.C) * 100 : 0;
      const closes = bars.map((b) => b.C);
      latestClose = latest.C;
      await prisma.stock.update({
        where: { id: stock.id },
        data: { price: latest.C, change, changeRate, high52w: Math.max(...closes), low52w: Math.min(...closes), volume: latest.Vo, lastSyncAt: new Date() },
      });
    }
  } catch (e) {
    console.warn(`  [prices] ${stock.symbol}: ${(e as Error).message}`);
  }

  // ── 3) Financials + Dividends from fins/summary ────────────────────────────
  let finCount = 0;
  let divCount = 0;
  try {
    const fd = await jqGet(`/fins/summary?code=${code}`) as { data: FinRow[]; pagination_key?: string };
    let fins: FinRow[] = fd.data || [];
    let fpk = fd.pagination_key;
    while (fpk) {
      const nx = await jqGet(`/fins/summary?code=${code}&pagination_key=${encodeURIComponent(fpk)}`) as { data: FinRow[]; pagination_key?: string };
      fins = fins.concat(nx.data || []);
      fpk = nx.pagination_key;
    }

    const qMap: Record<string, number | null> = { "1Q": 1, "2Q": 2, "3Q": 3, "FY": null, "H1": null, "H2": null };

    // Use most recent 12 records for financials
    for (const s of fins.slice(0, 12)) {
      const fy = new Date(s.CurFYEn as string).getFullYear();
      const quarter = qMap[s.CurPerType as string] ?? null;
      const finData = {
        revenue: parseNum(s.Sales as string),
        operatingProfit: parseNum(s.OP as string),
        ordinaryProfit: parseNum(s.OdP as string),
        netProfit: parseNum(s.NP as string),
        eps: parseNum(s.EPS as string),
        bps: parseNum(s.BPS as string),
        totalAssets: parseNum(s.TA as string),
        equity: parseNum(s.Eq as string),
        equityRatio: parseNum(s.EqAR as string),
        roe: parseNum(s.ROE as string),
        reportedAt: new Date(s.DiscDate as string),
        source: "jquants",
      };

      if (quarter === null) {
        const existing = await prisma.financial.findFirst({ where: { stockId: stock.id, fiscalYear: fy, quarter: null } });
        if (existing) {
          await prisma.financial.update({ where: { id: existing.id }, data: finData });
        } else {
          await prisma.financial.create({ data: { stockId: stock.id, fiscalYear: fy, quarter: null, ...finData } });
        }
      } else {
        await prisma.financial.upsert({
          where: { stockId_fiscalYear_quarter: { stockId: stock.id, fiscalYear: fy, quarter } },
          create: { stockId: stock.id, fiscalYear: fy, quarter, ...finData },
          update: finData,
        });
      }
      finCount++;
    }

    // ── Dividend: extract from FY records in fins/summary ──────────────────
    // /v2/fins/dividend requires Premium; DivAnn/PayoutRatioAnn are in fins/summary
    const fyRecords = fins.filter((s) => s.CurPerType === "FY");
    for (const s of fyRecords) {
      const divAnn = parseNum(s.DivAnn as string);
      if (divAnn === null) continue; // skip if no dividend data

      const fy = new Date(s.CurFYEn as string).getFullYear();
      const payoutRatio = parseNum(s.PayoutRatioAnn as string);

      // Calculate yield rate using latest close price
      const yieldRate =
        latestClose && latestClose > 0 ? (divAnn / latestClose) * 100 : null;

      const divData = {
        dividend: divAnn,
        yieldRate: yieldRate,
        payoutRatio: payoutRatio,
        source: "jquants",
      };

      const existing = await prisma.dividend.findFirst({
        where: { symbol: stock.symbol, year: fy, quarter: null },
      });
      if (existing) {
        await prisma.dividend.update({ where: { id: existing.id }, data: divData });
      } else {
        await prisma.dividend.create({
          data: { symbol: stock.symbol, year: fy, quarter: null, ...divData },
        });
      }
      divCount++;
    }
  } catch (e) {
    console.warn(`  [financials/div] ${stock.symbol}: ${(e as Error).message}`);
  }

  return { priceCount, finCount, divCount };
}

async function main() {
  console.log("=== J-Quants V2 Sync (with Dividend from fins/summary) ===\n");

  const stocks = await prisma.stock.findMany({ select: { id: true, symbol: true, name: true }, orderBy: { symbol: "asc" } });
  console.log(`Found ${stocks.length} stocks to sync\n`);

  const results: { symbol: string; name: string; priceCount: number; finCount: number; divCount: number }[] = [];

  for (const stock of stocks) {
    process.stdout.write(`Syncing ${stock.symbol} (${stock.name})... `);
    const { priceCount, finCount, divCount } = await syncStock(stock);
    console.log(`✓  ${priceCount}日株価 / ${finCount}件財務 / ${divCount}件配当`);
    results.push({ symbol: stock.symbol, name: stock.name, priceCount, finCount, divCount });
    await new Promise((r) => setTimeout(r, 300));
  }

  // DB counts
  const [priceTotal, finTotal, newsTotal, divTotal] = await Promise.all([
    prisma.dailyPrice.count(),
    prisma.financial.count(),
    prisma.news.count(),
    prisma.dividend.count(),
  ]);
  const stockTotal = await prisma.stock.count();

  console.log("\n=== データベース集計 ===\n");
  console.log(`Stock        テーブル: ${stockTotal} 件`);
  console.log(`DailyPrice   テーブル: ${priceTotal} 件`);
  console.log(`Financial    テーブル: ${finTotal} 件`);
  console.log(`Dividend     テーブル: ${divTotal} 件`);
  console.log(`News         テーブル: ${newsTotal} 件`);

  // Per-stock dividend detail for target stocks
  const targets = ["7203.T", "6758.T", "9984.T", "7974.T", "9983.T", "6861.T", "8306.T", "4519.T", "9432.T", "6902.T"];

  console.log("\n=== 配当データ確認（最新3年） ===\n");
  console.log(`${"Symbol".padEnd(12)}${"Name".padEnd(22)}${"Year".padStart(6)}${"DivAnn(円)".padStart(12)}${"Yield%".padStart(8)}${"PayoutRatio".padStart(12)}`);
  console.log("─".repeat(74));

  for (const sym of targets) {
    const divRows = await prisma.dividend.findMany({
      where: { symbol: sym },
      orderBy: { year: "desc" },
      take: 3,
    });
    const stock = await prisma.stock.findUnique({ where: { symbol: sym }, select: { name: true } });
    const name = (stock?.name ?? "").substring(0, 20);
    if (divRows.length === 0) {
      console.log(`${sym.padEnd(12)}${name.padEnd(22)}${"no data".padStart(6)}`);
    }
    for (const d of divRows) {
      const yStr = d.yieldRate !== null ? d.yieldRate.toFixed(2) + "%" : "—";
      const pStr = d.payoutRatio !== null ? (d.payoutRatio * 100).toFixed(1) + "%" : "—";
      console.log(
        `${sym.padEnd(12)}${name.padEnd(22)}${String(d.year).padStart(6)}${String(Number(d.dividend).toFixed(1)).padStart(12)}${yStr.padStart(8)}${pStr.padStart(12)}`
      );
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
