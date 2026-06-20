/**
 * fetch-short-selling-ratio.ts — Fetch JPX daily short selling ratio
 *
 * Data source: https://www.jpx.co.jp/markets/statistics-equities/short-selling/
 * JPX publishes daily PDFs; pdftotext (poppler-utils) must be installed.
 *
 * Usage:
 *   npx tsx scripts/fetch-short-selling-ratio.ts
 *   DRY_RUN=1 npx tsx scripts/fetch-short-selling-ratio.ts
 */

import "dotenv/config";
import { execSync } from "child_process";
import { writeFileSync, unlinkSync, existsSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const DRY_RUN = process.env.DRY_RUN === "1";
const JPX_INDEX = "https://www.jpx.co.jp/markets/statistics-equities/short-selling/index.html";
const TMP_PDF = join("/tmp", "jpx_short.pdf");

async function fetchText(url: string): Promise<string> {
  const resp = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; tohoshou/1.0)" },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  return resp.text();
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const resp = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; tohoshou/1.0)" },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  return Buffer.from(await resp.arrayBuffer());
}

function parsePdfText(text: string): { date: Date; shortSellRatio: number; shortSellValue: number; totalTradingValue: number } | null {
  // Extract date: "2026年6月19日" or "2026/6/19"
  const dateMatch = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/) ||
                    text.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (!dateMatch) return null;
  // Use Date.UTC to avoid timezone offset on CST/JST servers
  const date = new Date(Date.UTC(parseInt(dateMatch[1]), parseInt(dateMatch[2]) - 1, parseInt(dateMatch[3])));

  // Extract numbers (remove commas)
  const nums = (text.match(/[\d,]+/g) ?? []).map((s) => parseInt(s.replace(/,/g, ""), 10)).filter((n) => !isNaN(n) && n > 0);

  // Extract percentages: look for XX.X% pattern
  const pctMatches = [...text.matchAll(/(\d+\.\d+)%/g)].map((m) => parseFloat(m[1]));
  // Expected structure: ratio(a)/(d), ratio(b)/(d), ratio(c)/(d)
  // Short sell ratio = (b)/(d) + (c)/(d)
  let shortSellRatio: number | null = null;
  if (pctMatches.length >= 3) {
    // pctMatches[0] = (a)/(d) regular orders ratio ~61%
    // pctMatches[1] = (b)/(d) short w/ price restriction ~32%
    // pctMatches[2] = (c)/(d) short w/o price restriction ~7%
    shortSellRatio = pctMatches[1] + pctMatches[2];
  }

  // Extract large numbers (100M+ = totalTradingValue candidate)
  // totalTradingValue (d) is the largest, shortSellValue (b+c) is second
  const largeNums = nums.filter((n) => n > 1_000_000).sort((a, b) => b - a);
  if (largeNums.length < 2 || shortSellRatio === null) return null;

  const totalTradingValue = largeNums[0]; // 合計(d)
  // shortSellValue: find (b) and (c), their sum
  // We can calculate from ratio: shortSellValue ≈ (shortSellRatio/100) * totalTradingValue
  const shortSellValue = Math.round((shortSellRatio / 100) * totalTradingValue);

  return { date, shortSellRatio, shortSellValue, totalTradingValue };
}

async function main() {
  const startMs = Date.now();
  console.log("\n=== JPX 空売り比率 取得 ===");
  if (DRY_RUN) console.log("DRY_RUN=1 — 不写入数据库\n");

  let status = "ERROR";
  let message = "";
  let itemCount = 0;

  try {
    // 1. Fetch index page to find latest PDF URL
    console.log("  Fetching JPX index page...");
    const indexHtml = await fetchText(JPX_INDEX);
    const pdfMatch = indexHtml.match(/href="(\/markets\/statistics-equities\/short-selling\/[^"]+?-m\.pdf)"/);
    if (!pdfMatch) throw new Error("No -m.pdf link found on JPX index page");
    const pdfPath = pdfMatch[1];
    const pdfUrl = `https://www.jpx.co.jp${pdfPath}`;
    console.log(`  Found PDF: ${pdfUrl}`);

    // 2. Download PDF
    const pdfBuf = await fetchBuffer(pdfUrl);
    writeFileSync(TMP_PDF, pdfBuf);
    console.log(`  Downloaded ${pdfBuf.length} bytes → ${TMP_PDF}`);

    // 3. Extract text with pdftotext
    const pdfText = execSync(`pdftotext ${TMP_PDF} -`, { encoding: "utf-8" });
    console.log(`  Extracted text (${pdfText.length} chars)`);

    // 4. Parse
    const parsed = parsePdfText(pdfText);
    if (!parsed) throw new Error("Failed to parse PDF text — structure may have changed");

    const { date, shortSellRatio, shortSellValue, totalTradingValue } = parsed;
    const dateStr = date.toISOString().split("T")[0];
    console.log(`\n  Date: ${dateStr}`);
    console.log(`  Short sell ratio: ${shortSellRatio.toFixed(1)}%`);
    console.log(`  Short sell value: ${(shortSellValue / 1000).toFixed(0)}億円`);
    console.log(`  Total trading value: ${(totalTradingValue / 1000).toFixed(0)}億円`);

    if (!DRY_RUN) {
      await prisma.shortSellingRatio.upsert({
        where: { date_market: { date, market: "ALL" } },
        create: {
          date,
          market: "ALL",
          shortSellRatio,
          shortSellValue,
          totalTradingValue,
          source: "jpx_real",
        },
        update: {
          shortSellRatio,
          shortSellValue,
          totalTradingValue,
          source: "jpx_real",
        },
      });
      console.log(`  ✓ Upserted ShortSellingRatio for ${dateStr}`);
      itemCount = 1;
    }

    status = "SUCCESS";
    message = `${dateStr} 空売り比率=${shortSellRatio.toFixed(1)}% 総売買=${(totalTradingValue / 1000).toFixed(0)}億円`;
  } catch (e) {
    const err = e as Error;
    status = "ERROR";
    message = err.message.slice(0, 500);
    console.error(`\n  ERROR: ${err.message}`);
  } finally {
    if (existsSync(TMP_PDF)) {
      try { unlinkSync(TMP_PDF); } catch { /* ignore */ }
    }
  }

  if (!DRY_RUN) {
    await prisma.syncLog.create({
      data: {
        source: "short_selling_ratio",
        status,
        message,
        itemCount,
        durationMs: Date.now() - startMs,
      },
    });
  }

  console.log(`\n=== 完成 (${status}) ===`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
