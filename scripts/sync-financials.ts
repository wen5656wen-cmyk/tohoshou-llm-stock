#!/usr/bin/env npx tsx
/**
 * 财务数据专项同步脚本（不同步价格）
 * 数据来源：J-Quants /fins/summary
 * 用法：npm run sync-financials
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function jqGet(path: string, retries = 3): Promise<unknown> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(`${BASE}${path}`, { headers: { "x-api-key": API_KEY } });
    if (res.status === 429) {
      const wait = (attempt + 1) * 10000; // 10s, 20s, 30s backoff
      console.warn(`\n  [429] Rate limited, waiting ${wait / 1000}s (attempt ${attempt + 1}/${retries})...`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`J-Quants GET ${path} → ${res.status} ${body.slice(0, 200)}`);
    }
    return res.json();
  }
  throw new Error(`J-Quants GET ${path} → Rate limit exceeded after ${retries} retries`);
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

type FinRow = Record<string, string | null | boolean | number>;

async function syncFinancials(stock: { id: number; symbol: string; name: string; price: number | null }) {
  const code = toCode(stock.symbol);
  let finCount = 0;
  let divCount = 0;

  const fd = await jqGet(`/fins/summary?code=${code}`) as { data: FinRow[]; pagination_key?: string };
  let fins: FinRow[] = fd.data || [];
  let pk = fd.pagination_key;
  while (pk) {
    const nx = await jqGet(`/fins/summary?code=${code}&pagination_key=${encodeURIComponent(pk)}`) as { data: FinRow[]; pagination_key?: string };
    fins = fins.concat(nx.data || []);
    pk = nx.pagination_key;
  }

  if (fins.length === 0) return { finCount, divCount };

  const qMap: Record<string, number | null> = { "1Q": 1, "2Q": 2, "3Q": 3, "FY": null, "H1": null, "H2": null };

  for (const s of fins.slice(0, 12)) {
    const fyEnd = s.CurFYEn as string;
    if (!fyEnd) continue;
    const fy = new Date(fyEnd).getFullYear();
    const quarter = qMap[s.CurPerType as string] ?? null;

    const finData = {
      revenue:         parseNum(s.Sales as string),
      operatingProfit: parseNum(s.OP as string),
      ordinaryProfit:  parseNum(s.OdP as string),
      netProfit:       parseNum(s.NP as string),
      eps:             parseNum(s.EPS as string),
      bps:             parseNum(s.BPS as string),
      totalAssets:     parseNum(s.TA as string),
      equity:          parseNum(s.Eq as string),
      equityRatio:     parseNum(s.EqAR as string),
      roe:             parseNum(s.ROE as string),
      reportedAt:      new Date(s.DiscDate as string),
      source:          "jquants",
    };

    if (quarter === null) {
      const existing = await prisma.financial.findFirst({
        where: { stockId: stock.id, fiscalYear: fy, quarter: null },
      });
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

  const latestClose = typeof stock.price === "number" ? stock.price : null;
  const fyRecords = fins.filter((s) => s.CurPerType === "FY");
  for (const s of fyRecords) {
    const divAnn = parseNum(s.DivAnn as string);
    if (divAnn === null) continue;
    const fyEnd = s.CurFYEn as string;
    if (!fyEnd) continue;
    const fy = new Date(fyEnd).getFullYear();
    const payoutRatio = parseNum(s.PayoutRatioAnn as string);
    const yieldRate = latestClose && latestClose > 0 ? (divAnn / latestClose) * 100 : null;
    const divData = { dividend: divAnn, yieldRate, payoutRatio, source: "jquants" };
    const existing = await prisma.dividend.findFirst({
      where: { symbol: stock.symbol, year: fy, quarter: null },
    });
    if (existing) {
      await prisma.dividend.update({ where: { id: existing.id }, data: divData });
    } else {
      await prisma.dividend.create({ data: { symbol: stock.symbol, year: fy, quarter: null, ...divData } });
    }
    divCount++;
  }

  return { finCount, divCount };
}

async function main() {
  console.log("=== 财务数据同步（J-Quants /fins/summary）===\n");
  const start = Date.now();

  const stocks = await prisma.stock.findMany({
    select: { id: true, symbol: true, name: true, price: true },
    orderBy: { symbol: "asc" },
  });
  console.log(`股票总数: ${stocks.length}`);
  console.log("限速: 2000ms/只 + 429自动重试（10s/20s/30s退避）\n");

  let ok = 0, skip = 0, err = 0;
  let totalFin = 0, totalDiv = 0;

  for (let i = 0; i < stocks.length; i++) {
    try {
      const { finCount, divCount } = await syncFinancials(stocks[i]);
      if (finCount > 0 || divCount > 0) {
        ok++;
        totalFin += finCount;
        totalDiv += divCount;
      } else {
        skip++;
      }
    } catch (e) {
      err++;
      if (err <= 20) console.warn(`  ✗ ${stocks[i].symbol}: ${(e as Error).message}`);
    }

    await sleep(2000);

    const pct = Math.round(((i + 1) / stocks.length) * 100);
    if ((i + 1) % 50 === 0 || i + 1 === stocks.length) {
      const elapsed = ((Date.now() - start) / 1000 / 60).toFixed(1);
      process.stdout.write(`\r[${i + 1}/${stocks.length}] ${pct}%  ✓${ok} ○${skip} ✗${err}  (${elapsed}min)`);
    }
  }

  const elapsed = ((Date.now() - start) / 1000 / 60).toFixed(1);
  console.log(`\n\n=== 完成（${elapsed}分钟）===`);
  console.log(`有数据: ${ok} | 无数据: ${skip} | 失败: ${err}`);
  console.log(`Financial记录: ${totalFin} | Dividend记录: ${totalDiv}`);

  const dbFin = await prisma.financial.count();
  const dbDiv = await prisma.dividend.count();
  console.log(`DB Financial总数: ${dbFin} | Dividend总数: ${dbDiv}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("CRASH:", e);
  prisma.$disconnect();
  process.exit(1);
});
