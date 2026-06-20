#!/usr/bin/env npx tsx
/**
 * JPX 机构资金流向手动导入工具 (V3.1)
 *
 * 支持格式：CSV / XLSX（JPX 标准格式）
 * 数据权威：source = "jpx_file"（与在线 jpx 同等权威，高于 synthetic）
 *
 * 用法：
 *   npx tsx scripts/import-institutional-flow.ts ./data/jpx.csv
 *   npx tsx scripts/import-institutional-flow.ts ./data/jpx.xlsx
 *   npx tsx scripts/import-institutional-flow.ts ./data/jpx.xlsx --date 2026-06-13
 *   npx tsx scripts/import-institutional-flow.ts ./data/jpx.csv --dry-run
 *
 * 权威规则（禁止降级覆盖）：
 *   jpx > jpx_file > jpx_manual > synthetic
 *   jpx_file 可以覆盖 synthetic，不可被 synthetic 覆盖
 *   jpx 在线数据不会被 jpx_file 覆盖（在线优先）
 *
 * JPX データダウンロード：
 *   https://www.jpx.co.jp/markets/statistics-equities/investor-type/index.html
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as XLSX from "xlsx";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ── Authority levels ───────────────────────────────────────────────────────

// Lower number = higher authority (can overwrite higher-numbered sources)
const AUTHORITY_RANK: Record<string, number> = {
  jpx:        1,  // online fetch (highest)
  jpx_file:   2,  // this script
  jpx_manual: 3,  // manual entry
  synthetic:  99, // generated placeholder (lowest)
};

/** Returns true if `newSrc` is allowed to overwrite `existingSrc`. */
function canOverwrite(existingSrc: string, newSrc: string): boolean {
  const existing = AUTHORITY_RANK[existingSrc] ?? 50;
  const incoming = AUTHORITY_RANK[newSrc] ?? 50;
  return incoming <= existing; // equal rank also allowed (update same-level data)
}

// ── Investor type mapping (Japanese labels → internal keys) ────────────────

const INVESTOR_MAP: Record<string, string> = {
  "外国人":      "foreigners",
  "外国法人等":  "foreigners",
  "海外投資家":  "foreigners",
  "投資信託":    "trust",
  "投信":        "trust",
  "事業法人":    "corp",
  "法人":        "corp",
  "個人":        "individual",
  "個人投資家":  "individual",
  "証券会社":    "dealer",
  "その他法人":  "other",
  "生損保":      "insurance",
  "都銀・地銀等": "bank",
  "信託銀行":    "trust_bank",
};

function mapInvestorType(label: string): string | null {
  for (const [jp, key] of Object.entries(INVESTOR_MAP)) {
    if (label.includes(jp)) return key;
  }
  return null;
}

// ── Date parsing ───────────────────────────────────────────────────────────

function parseJpDate(s: string): Date | null {
  // Handles: 2026/06/13, 2026-06-13, 2026年6月13日, 令和8年6月13日
  const iso = s.match(/(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})/);
  if (iso) {
    return new Date(`${iso[1]}-${iso[2].padStart(2,"0")}-${iso[3].padStart(2,"0")}`);
  }
  // Reiwa era: 令和N年M月D日 (令和1 = 2019)
  const reiwa = s.match(/令和(\d+)年(\d{1,2})月(\d{1,2})日?/);
  if (reiwa) {
    const year = 2018 + parseInt(reiwa[1]);
    return new Date(`${year}-${reiwa[2].padStart(2,"0")}-${reiwa[3].padStart(2,"0")}`);
  }
  return null;
}

// ── CSV parser ─────────────────────────────────────────────────────────────

interface ParsedRow {
  investorType: string;
  market: string;
  buyAmount: number | null;
  sellAmount: number | null;
  netAmount: number | null;
}

interface ParsedFile {
  date: Date;
  rows: ParsedRow[];
  rawDateStr: string;
}

function parseNumber(s: string): number | null {
  const clean = s.replace(/[,，\s　"']/g, "").trim();
  if (!clean || clean === "-" || clean === "ー" || clean === "―") return null;
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}

function parseCsv(content: string): ParsedFile | null {
  // Try both Shift-JIS decoded and UTF-8
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 3) return null;

  let weekDate: Date | null = null;
  let rawDateStr = "";
  const rows: ParsedRow[] = [];

  for (const line of lines) {
    // Look for date
    const dateCandidates = line.match(/(\d{4}[\/\-年]\d{1,2}[\/\-月]\d{1,2}|令和\d+年\d{1,2}月\d{1,2}日?)/g);
    if (dateCandidates && !weekDate) {
      for (const d of dateCandidates) {
        const parsed = parseJpDate(d);
        if (parsed && !isNaN(parsed.getTime())) {
          weekDate = parsed;
          rawDateStr = d;
          break;
        }
      }
    }

    // Look for investor type rows
    const cells = line.split(/,|\t/).map(c => c.trim().replace(/^"|"$/g, ""));
    if (cells.length < 4) continue;

    // Find investor type in first few cells
    let investorKey: string | null = null;
    for (const cell of cells.slice(0, 3)) {
      investorKey = mapInvestorType(cell);
      if (investorKey) break;
    }
    if (!investorKey) continue;

    // Extract numeric values (buy, sell, net)
    const nums: number[] = [];
    for (const cell of cells) {
      const n = parseNumber(cell);
      if (n !== null) nums.push(n);
    }

    if (nums.length >= 2) {
      rows.push({
        investorType: investorKey,
        market: "ALL",
        buyAmount:  nums[0],
        sellAmount: nums[1],
        netAmount:  nums.length >= 3 ? nums[2] : nums[0] - nums[1],
      });
    }
  }

  if (!weekDate) {
    // Fallback to most recent Friday
    const d = new Date();
    const dow = d.getDay();
    const daysBack = dow === 0 ? 2 : dow === 6 ? 1 : dow - 5;
    d.setDate(d.getDate() - (daysBack < 0 ? daysBack + 7 : daysBack));
    weekDate = d;
    rawDateStr = "(inferred)";
  }

  return rows.length > 0 ? { date: weekDate, rows, rawDateStr } : null;
}

function parseXlsx(filePath: string): ParsedFile | null {
  const workbook = XLSX.readFile(filePath, { type: "file", codepage: 932 });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Convert to CSV-like text for uniform parsing
  const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
  return parseCsv(csv);
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2).filter(a => !a.startsWith("--"));
  const flags = process.argv.slice(2).filter(a => a.startsWith("--"));
  const dryRun = flags.includes("--dry-run");
  const forceDate = flags.find(f => f.startsWith("--date="))?.split("=")[1]
    ?? flags[flags.indexOf("--date") + 1];

  const filePath = args[0];
  if (!filePath) {
    console.error("使用方法: npx tsx scripts/import-institutional-flow.ts <file.csv|file.xlsx> [--date YYYY-MM-DD] [--dry-run]");
    console.error("\nJPX データダウンロード:");
    console.error("  https://www.jpx.co.jp/markets/statistics-equities/investor-type/index.html");
    process.exit(1);
  }

  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    console.error(`✗ ファイルが見つかりません: ${absPath}`);
    process.exit(1);
  }

  console.log("=== JPX 机构资金流向手动导入 (V3.1) ===");
  console.log(`ファイル: ${absPath}`);
  if (dryRun) console.log("モード: DRY RUN（DB書き込みなし）\n");

  // Parse file
  const ext = path.extname(absPath).toLowerCase();
  let parsed: ParsedFile | null = null;

  if (ext === ".xlsx" || ext === ".xls") {
    console.log("XLSX 解析中...");
    parsed = parseXlsx(absPath);
  } else {
    console.log("CSV 解析中...");
    const buf = fs.readFileSync(absPath);
    // Try Shift-JIS first (JPX standard), fall back to UTF-8
    let content: string;
    try {
      content = new TextDecoder("shift-jis").decode(buf);
    } catch {
      content = buf.toString("utf-8");
    }
    parsed = parseCsv(content);
  }

  if (!parsed || parsed.rows.length === 0) {
    console.error("✗ ファイルの解析に失敗しました。フォーマットを確認してください。");
    process.exit(1);
  }

  // Override date if specified
  if (forceDate) {
    const d = new Date(forceDate);
    if (isNaN(d.getTime())) {
      console.error(`✗ 無効な日付: ${forceDate}。YYYY-MM-DD 形式で指定してください。`);
      process.exit(1);
    }
    parsed.date = d;
    console.log(`日付を強制指定: ${forceDate}`);
  }

  const dateStr = parsed.date.toISOString().split("T")[0];
  console.log(`\n解析結果:`);
  console.log(`  日付: ${dateStr} (元データ: ${parsed.rawDateStr})`);
  console.log(`  行数: ${parsed.rows.length}`);
  console.log(`  投資家タイプ: ${parsed.rows.map(r => r.investorType).join(", ")}`);

  // Preview rows
  for (const r of parsed.rows) {
    const net = r.netAmount;
    const netStr = net != null ? (net >= 0 ? `+${net.toFixed(0)}` : net.toFixed(0)) + " 億円" : "N/A";
    console.log(`  ${r.investorType.padEnd(14)} 買=${r.buyAmount?.toFixed(0) ?? "N/A"}  売=${r.sellAmount?.toFixed(0) ?? "N/A"}  純=${netStr}`);
  }

  if (dryRun) {
    console.log("\n[DRY RUN] DB 書き込みをスキップしました。");
    await prisma.$disconnect();
    return;
  }

  // Write to DB with authority check
  console.log("\nDB 書き込み中 (source=jpx_file)...");
  let written = 0;
  let skipped = 0;
  const NEW_SOURCE = "jpx_file";

  for (const row of parsed.rows) {
    const key = { date: parsed.date, investorType: row.investorType, market: row.market };

    // Check existing data authority
    const existing = await prisma.institutionalFlow.findUnique({
      where: { date_investorType_market: key },
      select: { source: true },
    });

    if (existing && !canOverwrite(existing.source, NEW_SOURCE)) {
      console.log(`  ⚠ SKIP ${row.investorType}: 既存データ(${existing.source})の権威が高い`);
      skipped++;
      continue;
    }

    if (existing) {
      console.log(`  ↑ OVERWRITE ${row.investorType}: ${existing.source} → ${NEW_SOURCE}`);
    } else {
      console.log(`  ✓ INSERT ${row.investorType}`);
    }

    await prisma.institutionalFlow.upsert({
      where: { date_investorType_market: key },
      create: { ...key, buyAmount: row.buyAmount, sellAmount: row.sellAmount, netAmount: row.netAmount, source: NEW_SOURCE },
      update: { buyAmount: row.buyAmount, sellAmount: row.sellAmount, netAmount: row.netAmount, source: NEW_SOURCE },
    });
    written++;
  }

  console.log(`\n✓ 完了: 書き込み ${written} 件 / スキップ ${skipped} 件`);
  console.log(`  date=${dateStr}, source=${NEW_SOURCE} → scoreSource: REAL`);
  console.log("\n次のステップ:");
  console.log("  npm run compute-scores  # AI スコアを再計算");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("CRASH:", e);
  prisma.$disconnect().finally(() => process.exit(1));
});
