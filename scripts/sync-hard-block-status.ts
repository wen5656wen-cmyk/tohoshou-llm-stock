#!/usr/bin/env npx tsx
/**
 * Hard Block Phase 2 — 上場区分・売買停止ステータス同期
 *
 * データソース:
 *   1. J-Quants /v2/equities/master → 上場廃止検出（DB銘柄がマスターに存在しない = 廃止）
 *   2. DailyPrice 直近14日 volume=0 → 売買停止検出（3日以上連続出来高ゼロ）
 *
 * 書込フィールド（Stock テーブル）:
 *   isDelisted    Boolean  — true = 上場廃止
 *   isSuspended   Boolean  — true = 売買停止中
 *   listingStatus String   — "LISTED" | "DELISTED"
 *   tradingStatus String   — "ACTIVE" | "HALTED" | "SUSPENDED"
 *
 * 用法:
 *   npm run sync:hard-block          # 本番実行
 *   npm run sync:hard-block:dry      # ドライラン（DB更新なし）
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const API_KEY = process.env.JQUANTS_API_KEY!;
const BASE = "https://api.jquants.com/v2";

// TSE 普通株 Market codes（sync-stock-meta.ts と同一条件）
const TSE_DOMESTIC_MKTS = new Set(["0111", "0112", "0113"]);

type MasterRow = {
  Code: string;
  Mkt: string;
  ProdCat: string;
};

// J-Quants master から現在上場中の .T シンボルセットを取得
async function fetchListedSymbols(): Promise<Set<string>> {
  if (!API_KEY) throw new Error("JQUANTS_API_KEY not set in environment");

  const res = await fetch(`${BASE}/equities/master`, {
    headers: { "x-api-key": API_KEY },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`J-Quants /equities/master failed: ${res.status} ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { data: MasterRow[]; pagination_key?: string };
  let rows: MasterRow[] = data.data ?? [];

  let pk = data.pagination_key;
  while (pk) {
    const nx = await fetch(
      `${BASE}/equities/master?pagination_key=${encodeURIComponent(pk)}`,
      { headers: { "x-api-key": API_KEY } }
    );
    const nd = (await nx.json()) as { data: MasterRow[]; pagination_key?: string };
    rows = rows.concat(nd.data ?? []);
    pk = nd.pagination_key;
  }

  const symbols = new Set<string>();
  for (const r of rows) {
    if (
      TSE_DOMESTIC_MKTS.has(r.Mkt) &&
      r.ProdCat === "011" &&
      r.Code.length === 5 &&
      r.Code.endsWith("0")
    ) {
      symbols.add(r.Code.slice(0, 4) + ".T");
    }
  }
  return symbols;
}

// 直近14日間で出来高ゼロが3日以上続く銘柄を一括検出（単一SQL）
async function fetchSuspendedSymbols(): Promise<Set<string>> {
  const rows = await prisma.$queryRaw<{ symbol: string }[]>`
    SELECT symbol
    FROM "DailyPrice"
    WHERE date >= CURRENT_DATE - INTERVAL '14 days'
    GROUP BY symbol
    HAVING COUNT(*) >= 3
       AND SUM(volume) = 0
  `;
  return new Set(rows.map((r) => r.symbol));
}

async function main() {
  const isDryRun = process.argv.includes("--dry-run");
  console.log(`=== Hard Block Phase 2 データ同期${isDryRun ? " [DRY RUN]" : ""} ===\n`);

  const start = Date.now();

  // ── Step 1: J-Quants master ──────────────────────────────────────────────
  console.log("Step 1: J-Quants マスター取得中...");
  const listedSymbols = await fetchListedSymbols();
  console.log(`  J-Quants 上場銘柄: ${listedSymbols.size} 件`);

  // ── Step 2: DB 銘柄リスト ─────────────────────────────────────────────────
  console.log("Step 2: DB 銘柄取得中...");
  const allStocks = await prisma.stock.findMany({
    select: { id: true, symbol: true },
  });
  console.log(`  DB 保有銘柄: ${allStocks.length} 件`);

  // ── Step 3: 廃止 / 上場中 に分類 ─────────────────────────────────────────
  const delistedSymbols: string[] = [];
  const activeSymbols: string[] = [];

  for (const stock of allStocks) {
    if (listedSymbols.has(stock.symbol)) {
      activeSymbols.push(stock.symbol);
    } else {
      delistedSymbols.push(stock.symbol);
    }
  }

  console.log(`\n  分類:`);
  console.log(`    上場中 (LISTED):     ${activeSymbols.length} 件`);
  console.log(`    上場廃止 (DELISTED): ${delistedSymbols.length} 件`);

  if (delistedSymbols.length > 0 && delistedSymbols.length <= 20) {
    console.log(`    廃止銘柄: ${delistedSymbols.join(", ")}`);
  } else if (delistedSymbols.length > 20) {
    console.log(`    廃止銘柄サンプル: ${delistedSymbols.slice(0, 10).join(", ")} ...他${delistedSymbols.length - 10}件`);
  }

  // ── Step 4: 売買停止検出（出来高ゼロ） ──────────────────────────────────
  console.log("\nStep 3: 売買停止検出中（直近14日間・出来高ゼロ）...");
  const suspendedSymbols = await fetchSuspendedSymbols();
  // 廃止銘柄はすでに isDelisted で処理するので除外
  const delistedSet = new Set(delistedSymbols);
  for (const s of suspendedSymbols) {
    if (delistedSet.has(s)) suspendedSymbols.delete(s);
  }
  console.log(`  売買停止 (HALTED): ${suspendedSymbols.size} 件`);
  if (suspendedSymbols.size > 0 && suspendedSymbols.size <= 20) {
    console.log(`  停止銘柄: ${Array.from(suspendedSymbols).join(", ")}`);
  }

  // ── Dry run 終了 ──────────────────────────────────────────────────────────
  if (isDryRun) {
    console.log("\n[DRY RUN] DB は更新しません。");
    await prisma.$disconnect();
    return;
  }

  // ── Step 5: DB 更新 ───────────────────────────────────────────────────────
  console.log("\nStep 4: DB 更新中...");

  // 廃止銘柄
  if (delistedSymbols.length > 0) {
    const r = await prisma.stock.updateMany({
      where: { symbol: { in: delistedSymbols } },
      data: {
        isDelisted: true,
        isSuspended: false,
        listingStatus: "DELISTED",
        tradingStatus: "SUSPENDED",
      },
    });
    console.log(`  DELISTED マーク: ${r.count} 件`);
  }

  // 上場中・通常営業銘柄（停止なし）
  const normalActive = activeSymbols.filter((s) => !suspendedSymbols.has(s));
  if (normalActive.length > 0) {
    const r = await prisma.stock.updateMany({
      where: { symbol: { in: normalActive } },
      data: {
        isDelisted: false,
        isSuspended: false,
        listingStatus: "LISTED",
        tradingStatus: "ACTIVE",
      },
    });
    console.log(`  ACTIVE マーク: ${r.count} 件`);
  }

  // 上場中・停止銘柄
  const suspArr = Array.from(suspendedSymbols);
  if (suspArr.length > 0) {
    const r = await prisma.stock.updateMany({
      where: { symbol: { in: suspArr } },
      data: {
        isDelisted: false,
        isSuspended: true,
        listingStatus: "LISTED",
        tradingStatus: "HALTED",
      },
    });
    console.log(`  HALTED マーク: ${r.count} 件`);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const normal = normalActive.length;
  const halted = suspArr.length;
  const delisted = delistedSymbols.length;

  console.log(`\n=== 完了 (${elapsed}s) ===`);
  console.log(`ACTIVE: ${normal}  HALTED: ${halted}  DELISTED: ${delisted}`);
  console.log(`Hard Block 対象: ${halted + delisted} 件 (HALTED + DELISTED)`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("CRASH:", e);
  prisma.$disconnect();
  process.exit(1);
});
