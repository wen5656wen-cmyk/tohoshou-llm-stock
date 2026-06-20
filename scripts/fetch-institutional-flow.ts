#!/usr/bin/env npx tsx
/**
 * V3: 日本机构资金流向抓取
 *
 * 数据源: JPX (日本取引所グループ) 投資部門別売買動向 週次 CSV
 * URL: https://www.jpx.co.jp/markets/statistics-equities/investor-type/index.html
 *
 * 写入: InstitutionalFlow 表
 * 用于: moneyFlowScore 的 inflow 组件 (0-8分)
 *
 * 如果抓取失败 → 写入 source="synthetic" 的中性数据，不中断评分
 *
 * 用法: npm run fetch-institutional-flow
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// JPX 投資部門別売買動向 index page
const JPX_INDEX_URL = "https://www.jpx.co.jp/markets/statistics-equities/investor-type/index.html";
const JPX_BASE = "https://www.jpx.co.jp";

// investorType mapping (Shift-JIS label → internal key)
const INVESTOR_MAP: Record<string, string> = {
  "外国人":      "foreigners",
  "外国法人等":  "foreigners",
  "投資信託":    "trust",
  "投信":        "trust",
  "事業法人":    "corp",
  "個人":        "individual",
  "証券会社":    "dealer",
  "その他法人":  "other",
};

type FlowRow = {
  investorType: string;
  market: string;
  buyAmount: number | null;
  sellAmount: number | null;
  netAmount: number | null;
};

// ── Attempt to fetch JPX weekly CSV ───────────────────────────────────────

// Compute recent Fridays to try as direct URLs
function recentFridays(count = 4): string[] {
  const dates: string[] = [];
  const d = new Date();
  // Go back to most recent Friday
  const dayOfWeek = d.getDay(); // 0=Sun, 5=Fri
  const daysToFriday = dayOfWeek === 0 ? 1 : dayOfWeek <= 5 ? dayOfWeek - 5 : dayOfWeek - 5 + 7;
  d.setDate(d.getDate() + (daysToFriday <= 0 ? daysToFriday : daysToFriday - 7));
  for (let i = 0; i < count; i++) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    dates.push(`${y}${m}${day}`);
    d.setDate(d.getDate() - 7);
  }
  return dates;
}

// Known URL patterns for JPX investor type weekly data
const JPX_CSV_PATTERNS = [
  (date: string) => `https://www.jpx.co.jp/markets/statistics-equities/investor-type/tvdivq0000000nno-att/data/${date}.csv`,
  (date: string) => `https://www.jpx.co.jp/markets/statistics-equities/investor-type/01.html/${date}.csv`,
];

async function findLatestCsvUrl(): Promise<string | null> {
  // Strategy 1: Try direct URL construction with recent Fridays
  const fridays = recentFridays(4);
  for (const dateStr of fridays) {
    for (const pattern of JPX_CSV_PATTERNS) {
      const url = pattern(dateStr);
      try {
        const res = await fetch(url, {
          method: "HEAD",
          headers: { "User-Agent": "Mozilla/5.0 (compatible; TohoshouBot/3.0)" },
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          console.log(`  ✓ 找到直接 URL (${dateStr}): ${url}`);
          return url;
        }
      } catch {
        // continue
      }
    }
  }

  // Strategy 2: Parse HTML index page for CSV links
  try {
    const res = await fetch(JPX_INDEX_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TohoshouBot/3.0)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Look for CSV download links matching investor-type pattern
    const allLinks = [...html.matchAll(/href="([^"]*\.csv[^"]*)"/gi)];
    for (const m of allLinks) {
      const href = m[1];
      if (href.includes("tvdivq") || href.toLowerCase().includes("investor")) {
        return href.startsWith("http") ? href : `${JPX_BASE}${href}`;
      }
    }
    // Any CSV in investor-type path
    const pathLinks = [...html.matchAll(/href="([^"]*investor-type[^"]*\.csv[^"]*)"/gi)];
    if (pathLinks.length > 0) {
      const href = pathLinks[pathLinks.length - 1][1];
      return href.startsWith("http") ? href : `${JPX_BASE}${href}`;
    }
  } catch {
    // fall through
  }

  return null;
}

async function downloadAndParseCsv(csvUrl: string): Promise<{ date: Date; rows: FlowRow[] } | null> {
  try {
    const res = await fetch(csvUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TohoshouBot/3.0)" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;

    const buf = await res.arrayBuffer();

    // Try Shift-JIS first (standard JPX encoding), fall back to UTF-8
    let text: string;
    try {
      text = new TextDecoder("shift-jis").decode(buf);
    } catch {
      text = new TextDecoder("utf-8").decode(buf);
    }

    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 3) return null;

    // Find date from first data row (look for a date pattern)
    let weekDate: Date | null = null;
    const datePattern = /(\d{4})[\/年](\d{1,2})[\/月](\d{1,2})/;

    const rows: FlowRow[] = [];
    let headerLine = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (datePattern.test(line)) {
        const m = line.match(datePattern);
        if (m && !weekDate) {
          weekDate = new Date(`${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`);
        }
      }
      // Find header containing investor type keywords
      if (line.includes("外国") || line.includes("投資信託") || line.includes("投信")) {
        headerLine = i;
        break;
      }
    }

    if (!weekDate) {
      // Use last Friday as fallback date
      const d = new Date();
      const day = d.getDay();
      const diff = day === 0 ? 2 : day === 6 ? 1 : day >= 1 ? day - 5 : 0;
      d.setDate(d.getDate() - (diff < 0 ? diff + 7 : diff));
      weekDate = d;
    }

    // Parse data rows: look for rows with investor type labels and numeric data
    for (let i = headerLine > 0 ? headerLine + 1 : 1; i < lines.length; i++) {
      const line = lines[i];
      const cells = line.split(/,|\t/).map((c) => c.trim().replace(/["\s]/g, ""));
      if (cells.length < 4) continue;

      // Find investor type in cells
      let investorTypeKey: string | null = null;
      for (const [jpLabel, key] of Object.entries(INVESTOR_MAP)) {
        if (cells.some((c) => c.includes(jpLabel))) {
          investorTypeKey = key;
          break;
        }
      }
      if (!investorTypeKey) continue;

      // Find numeric cells (億円 values)
      const nums = cells
        .map((c) => c.replace(/[,，]/g, ""))
        .filter((c) => /^-?\d+(\.\d+)?$/.test(c))
        .map(Number);

      if (nums.length >= 3) {
        rows.push({
          investorType: investorTypeKey,
          market:       "ALL",
          buyAmount:    nums[0],
          sellAmount:   nums[1],
          netAmount:    nums[2],
        });
      }
    }

    return rows.length > 0 ? { date: weekDate, rows } : null;
  } catch {
    return null;
  }
}

// ── Write synthetic neutral data (fallback) ────────────────────────────────

async function writeSyntheticData(date: Date, reason: string): Promise<number> {
  console.log(`  → 写入中性合成数据（${reason}）`);

  const synthetic: Array<{ investorType: string; net: number }> = [
    { investorType: "foreigners", net: 0 },
    { investorType: "trust",      net: 0 },
    { investorType: "corp",       net: 0 },
    { investorType: "individual", net: 0 },
  ];

  let written = 0;
  for (const row of synthetic) {
    await prisma.institutionalFlow.upsert({
      where: { date_investorType_market: { date, investorType: row.investorType, market: "ALL" } },
      create: { date, investorType: row.investorType, market: "ALL", buyAmount: null, sellAmount: null, netAmount: row.net, source: "synthetic" },
      update: { netAmount: row.net, source: "synthetic" },
    });
    written++;
  }
  return written;
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== V3 机构资金流向抓取 ===\n");

  // Step 1: Find latest CSV URL
  console.log("1. 搜索 JPX 最新 CSV 链接...");
  const csvUrl = await findLatestCsvUrl();

  if (!csvUrl) {
    console.log("  ✗ 未找到 CSV 链接");
    const date = new Date(new Date().toISOString().split("T")[0]);
    await writeSyntheticData(date, "JPX页面无法访问");
    console.log("\n使用 fallback: 中性合成数据 (源=synthetic)");
    await prisma.$disconnect();
    return;
  }
  console.log(`  ✓ 找到 CSV: ${csvUrl}`);

  // Step 2: Download and parse
  console.log("2. 下载并解析 CSV...");
  const parsed = await downloadAndParseCsv(csvUrl);

  if (!parsed || parsed.rows.length === 0) {
    console.log("  ✗ CSV 解析失败或数据为空");
    const date = new Date(new Date().toISOString().split("T")[0]);
    await writeSyntheticData(date, "CSV解析失败");
    console.log("\n使用 fallback: 中性合成数据 (源=synthetic)");
    await prisma.$disconnect();
    return;
  }

  const { date, rows } = parsed;
  const dateStr = date.toISOString().split("T")[0];
  console.log(`  ✓ 解析完成: 日期=${dateStr}, 行数=${rows.length}`);

  // Step 3: Write to DB
  console.log("3. 写入 DB...");
  let written = 0;
  for (const row of rows) {
    await prisma.institutionalFlow.upsert({
      where: { date_investorType_market: { date, investorType: row.investorType, market: row.market } },
      create: { date, ...row, source: "jpx" },
      update: { buyAmount: row.buyAmount, sellAmount: row.sellAmount, netAmount: row.netAmount, source: "jpx" },
    });
    written++;
  }

  // Summary
  const foreigners = rows.find((r) => r.investorType === "foreigners");
  const trust      = rows.find((r) => r.investorType === "trust");
  console.log(`\n✓ 写入 ${written} 条记录`);
  if (foreigners) console.log(`  外国人净买卖: ${foreigners.netAmount != null ? (foreigners.netAmount >= 0 ? "+" : "") + foreigners.netAmount.toFixed(0) + " 億円" : "N/A"}`);
  if (trust)      console.log(`  投资信托净买卖: ${trust.netAmount != null ? (trust.netAmount >= 0 ? "+" : "") + trust.netAmount.toFixed(0) + " 億円" : "N/A"}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("CRASH:", e);
  prisma.$disconnect().finally(() => process.exit(1));
});
