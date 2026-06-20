#!/usr/bin/env npx tsx
/**
 * 全量上市股票元数据同步（J-Quants /v2/equities/master）
 *
 * 筛选规则：
 *   - 东京证券交易所（Mkt: 0101/0102/0104 = Prime/Standard/Growth）
 *   - 内国株式（国内普通股）
 *   - Code 末位 "0"（普通股）
 *
 * 用法：npm run sync-meta
 * 预计时间：< 30 秒（1次API调用 + DB upsert）
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const API_KEY = process.env.JQUANTS_API_KEY!;
const BASE = "https://api.jquants.com/v2";

// TSE 普通股 Market codes（J-Quants 实际值）
// 0111=プライム, 0112=スタンダード, 0113=グロース
const TSE_DOMESTIC_MKTS = new Set(["0111", "0112", "0113"]);

type MasterRow = {
  Code: string;
  CoName: string;
  CoNameEn: string;
  S17Nm: string;  // 17-category sector
  S33Nm: string;  // 33-category industry
  ScaleCat: string;
  Mkt: string;
  MktNm: string;
  ProdCat: string; // "011"=内国普通株, "014"=ETF, etc.
};

async function fetchMaster(): Promise<MasterRow[]> {
  const res = await fetch(`${BASE}/equities/master`, {
    headers: { "x-api-key": API_KEY },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`J-Quants /equities/master failed: ${res.status} ${body.slice(0, 200)}`);
  }
  const data = await res.json() as { data: MasterRow[]; pagination_key?: string };
  let rows = data.data || [];

  // Handle pagination (usually all in one page, but just in case)
  let pk = data.pagination_key;
  while (pk) {
    const nx = await fetch(`${BASE}/equities/master?pagination_key=${encodeURIComponent(pk)}`, {
      headers: { "x-api-key": API_KEY },
    });
    const nd = await nx.json() as { data: MasterRow[]; pagination_key?: string };
    rows = rows.concat(nd.data || []);
    pk = nd.pagination_key;
  }
  return rows;
}

function codeToSymbol(code: string): string {
  // "72030" → "7203.T"
  return code.slice(0, 4) + ".T";
}

async function main() {
  if (!API_KEY) {
    console.error("ERROR: JQUANTS_API_KEY not set");
    process.exit(1);
  }

  console.log("=== J-Quants 全量股票元数据同步 ===\n");
  console.log("正在获取上市股票列表...");

  const start = Date.now();
  const allRows = await fetchMaster();
  console.log(`API 返回: ${allRows.length} 条记录`);

  // 筛选：TSE 国内普通股
  const filtered = allRows.filter(
    (r) =>
      TSE_DOMESTIC_MKTS.has(r.Mkt) &&    // Prime(0111) / Standard(0112) / Growth(0113)
      r.ProdCat === "011" &&              // 内国普通株（排除 ETF/REIT 等）
      r.Code.length === 5 &&             // 5位代码
      r.Code.endsWith("0")               // 末位0 = 普通股
  );

  console.log(`筛选后（TSE内国普通株）: ${filtered.length} 只\n`);

  // 市场分布统计
  const byMarket: Record<string, number> = {};
  for (const r of filtered) {
    byMarket[r.MktNm] = (byMarket[r.MktNm] || 0) + 1;
  }
  console.log("市场分布：");
  for (const [mkt, cnt] of Object.entries(byMarket)) {
    console.log(`  ${mkt}: ${cnt} 只`);
  }
  console.log();

  // 获取已有 Stock 数量（用于对比）
  const beforeCount = await prisma.stock.count();

  // 批量 upsert（500条一批避免超时）
  let upserted = 0;
  let created = 0;
  const BATCH = 100;

  for (let i = 0; i < filtered.length; i += BATCH) {
    const batch = filtered.slice(i, i + BATCH);

    await Promise.all(
      batch.map(async (r) => {
        const symbol = codeToSymbol(r.Code);
        const result = await prisma.stock.upsert({
          where: { symbol },
          create: {
            symbol,
            name: r.CoName,
            nameEn: r.CoNameEn || null,
            market: r.MktNm,
            price: 0,        // placeholder; updated by price sync
            sector: r.S17Nm || null,
            industry: r.S33Nm || null,
            scaleCategory: r.ScaleCat || null,
          },
          update: {
            name: r.CoName,
            nameEn: r.CoNameEn || null,
            market: r.MktNm,
            sector: r.S17Nm || null,
            industry: r.S33Nm || null,
            scaleCategory: r.ScaleCat || null,
          },
          select: { id: true, createdAt: true },
        });
        upserted++;
        // Detect if this was a create (createdAt within last 5s)
        if (Date.now() - result.createdAt.getTime() < 5000) created++;
      })
    );

    const pct = Math.round(((i + batch.length) / filtered.length) * 100);
    process.stdout.write(`\r进度: ${i + batch.length}/${filtered.length} (${pct}%)`);
  }

  const afterCount = await prisma.stock.count();
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`\n\n=== 同步完成（${elapsed}s）===`);
  console.log(`DB Stock 总数: ${beforeCount} → ${afterCount}`);
  console.log(`本次 upsert: ${upserted} 条（约 ${created} 条新增）`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("CRASH:", e);
  prisma.$disconnect();
  process.exit(1);
});
