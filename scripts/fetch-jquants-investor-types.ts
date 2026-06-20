#!/usr/bin/env npx tsx
/**
 * J-Quants 投资部门别売買動向 同步脚本 (V3.1)
 *
 * 数据源: J-Quants API  GET /v2/equities/investor-types
 * 权威级别: jquants_investor_types（最高，与 jpx_online 等同）
 * 调度: 每周五 16:00 JST 或 周一 07:00 JST（cron 自动执行）
 *
 * 用法:
 *   npx tsx scripts/fetch-jquants-investor-types.ts           # 同步最近 4 周
 *   npx tsx scripts/fetch-jquants-investor-types.ts --weeks=8 # 同步最近 8 周
 *   npx tsx scripts/fetch-jquants-investor-types.ts --dry-run # 预览，不写 DB
 *
 * 数据转换:
 *   - API 单位: 日元（¥1）→ 写入単位: 億円（÷ 1e8）
 *   - 每周一行 → 按投资者类型拆分为多行
 *   - 日期键: EnDate（周结束日，通常为周五）
 *
 * 权威规则:
 *   jquants_investor_types (1) > jpx_file (2) > jpx_manual (3) > synthetic (99)
 *   高权威数据不会被低权威数据覆盖
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const JQUANTS_BASE = "https://api.jquants.com";
const SOURCE = "jquants_investor_types" as const;

// ── Authority ranking (lower = higher authority) ───────────────────────────

const AUTHORITY: Record<string, number> = {
  jpx:                    1,
  jquants_investor_types: 1, // same as jpx online
  jpx_file:               2,
  jpx_manual:             3,
  synthetic:              99,
};

function canOverwrite(existing: string, incoming: string): boolean {
  return (AUTHORITY[incoming] ?? 50) <= (AUTHORITY[existing] ?? 50);
}

// ── API field → InstitutionalFlow investorType mapping ────────────────────

const INVESTOR_COLS: Array<{ prefix: string; type: string; label: string }> = [
  { prefix: "Frgn",    type: "foreigners",   label: "外国人"     },
  { prefix: "InvTr",   type: "trust",         label: "投資信託"   },
  { prefix: "BusCo",   type: "corp",          label: "事業法人"   },
  { prefix: "Ind",     type: "individual",    label: "個人"       },
  { prefix: "SecCo",   type: "dealer",        label: "証券会社"   },
  { prefix: "TrstBnk", type: "trust_bank",    label: "信託銀行"   },
  { prefix: "InsCo",   type: "insurance",     label: "保険会社"   },
  { prefix: "Bank",    type: "bank",          label: "銀行"       },
  { prefix: "OthCo",   type: "other",         label: "その他法人" },
];

// ── J-Quants auth ─────────────────────────────────────────────────────────

async function getAuthHeaders(): Promise<Record<string, string>> {
  // Option A: API Key (x-api-key)
  if (process.env.JQUANTS_API_KEY && !process.env.JQUANTS_EMAIL) {
    return { "x-api-key": process.env.JQUANTS_API_KEY };
  }
  // Option B: Email+Password or Refresh Token → idToken (Bearer)
  let refreshToken = process.env.JQUANTS_REFRESH_TOKEN ?? "";
  if (!refreshToken && process.env.JQUANTS_EMAIL && process.env.JQUANTS_PASSWORD) {
    const r = await fetch(`${JQUANTS_BASE}/v1/token/auth_user`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mailaddress: process.env.JQUANTS_EMAIL, password: process.env.JQUANTS_PASSWORD }),
    });
    const d = await r.json() as { refreshToken?: string; message?: string };
    if (!d.refreshToken) throw new Error(`J-Quants auth_user 失败: ${d.message}`);
    refreshToken = d.refreshToken;
  }
  if (!refreshToken) throw new Error("未配置 J-Quants 认证（需 JQUANTS_API_KEY 或 JQUANTS_EMAIL+PASSWORD）");
  const r2 = await fetch(`${JQUANTS_BASE}/v1/token/auth_refresh?refreshtoken=${encodeURIComponent(refreshToken)}`, { method: "POST" });
  const d2 = await r2.json() as { idToken?: string; message?: string };
  if (!d2.idToken) throw new Error(`J-Quants auth_refresh 失败: ${d2.message}`);
  return { Authorization: `Bearer ${d2.idToken}` };
}

// ── API response row type ─────────────────────────────────────────────────

type ApiRow = {
  PubDate: string;  // 発表日
  StDate:  string;  // 週開始日
  EnDate:  string;  // 週終了日（基本は金曜日）
  Section: string;  // "TSEPrime" | "TSEStandard" | ...
  // Per-investor: FrgnBuy / FrgnSell / FrgnBal / ...
  [key: string]: string | number;
};

// ── Fetch from API ────────────────────────────────────────────────────────

async function fetchInvestorTypes(
  section: string,
  fromDate: string,
  toDate: string,
  headers: Record<string, string>,
): Promise<ApiRow[]> {
  const url = `${JQUANTS_BASE}/v2/equities/investor-types?section=${section}&from=${fromDate}&to=${toDate}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`J-Quants GET investor-types 失败: HTTP ${res.status} — ${body.slice(0, 200)}`);
  }
  const data = await res.json() as { data?: ApiRow[]; message?: string };
  return data.data ?? [];
}

// ── Transform API row → DB rows ───────────────────────────────────────────

type FlowRow = {
  date:         Date;
  market:       string;
  investorType: string;
  buyAmount:    number | null;
  sellAmount:   number | null;
  netAmount:    number | null;
  label:        string;
};

function transformRow(apiRow: ApiRow, section: string): FlowRow[] {
  const date   = new Date(apiRow.EnDate);
  const market = section; // "TSEPrime"

  return INVESTOR_COLS.map(({ prefix, type, label }) => {
    const buy  = Number(apiRow[`${prefix}Buy`]  ?? null);
    const sell = Number(apiRow[`${prefix}Sell`] ?? null);
    const bal  = Number(apiRow[`${prefix}Bal`]  ?? null);
    return {
      date,
      market,
      investorType: type,
      buyAmount:  isNaN(buy)  ? null : buy  / 1e8, // ¥1 → 億円
      sellAmount: isNaN(sell) ? null : sell / 1e8,
      netAmount:  isNaN(bal)  ? null : bal  / 1e8,
      label,
    };
  });
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== J-Quants 投資部門別売買動向 同期 (V3.1) ===");
  console.log(`source: ${SOURCE}  (権威: 最高)\n`);

  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const weeksArg = args.find(a => a.startsWith("--weeks="));
  const weeks = weeksArg ? parseInt(weeksArg.split("=")[1]) : 4;

  if (dryRun) console.log("モード: DRY RUN（DB書き込みなし）\n");

  const toDate   = new Date().toISOString().split("T")[0];
  const fromDate = new Date(Date.now() - weeks * 7 * 86400000).toISOString().split("T")[0];
  const sections = ["TSEPrime", "TSEStandard", "TSEGrowth"];

  console.log(`日付範囲: ${fromDate} → ${toDate} (${weeks}週)`);
  console.log(`セクション: ${sections.join(", ")}\n`);

  // Auth
  let headers: Record<string, string>;
  try {
    headers = await getAuthHeaders();
    console.log("✓ J-Quants 認証成功\n");
  } catch (e) {
    console.error(`✗ 認証失敗: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }

  // Fetch all sections
  const allApiRows: Array<{ apiRow: ApiRow; section: string }> = [];

  for (const section of sections) {
    process.stdout.write(`  ${section} 取得中... `);
    try {
      const rows = await fetchInvestorTypes(section, fromDate, toDate, headers);
      console.log(`${rows.length} 週`);
      for (const r of rows) allApiRows.push({ apiRow: r, section });
    } catch (e) {
      console.log(`⚠ 失敗 (${e instanceof Error ? e.message.slice(0, 80) : e})`);
    }
  }

  // Transform
  const allFlowRows: FlowRow[] = [];
  for (const { apiRow, section } of allApiRows) {
    allFlowRows.push(...transformRow(apiRow, section));
  }

  console.log(`\n変換完了: ${allFlowRows.length} 行\n`);

  // Preview
  const foreignPrime = allFlowRows.filter(r => r.market === "TSEPrime" && r.investorType === "foreigners");
  if (foreignPrime.length > 0) {
    console.log("外国人 (TSEPrime) サマリー:");
    for (const r of foreignPrime.slice(-4)) {
      const net = r.netAmount;
      const netStr = net != null ? (net >= 0 ? `+${net.toFixed(1)}` : net.toFixed(1)) + " 億円" : "N/A";
      console.log(`  ${r.date.toISOString().split("T")[0]}  純=${netStr}  買=${r.buyAmount?.toFixed(0) ?? "N/A"}  売=${r.sellAmount?.toFixed(0) ?? "N/A"}`);
    }
    console.log();
  }

  if (dryRun) {
    console.log("[DRY RUN] DB 書き込みをスキップしました。");
    await prisma.$disconnect();
    return;
  }

  // Write to DB
  console.log("DB 書き込み中...");
  let written = 0, skipped = 0;

  for (const row of allFlowRows) {
    const key = { date: row.date, investorType: row.investorType, market: row.market };

    const existing = await prisma.institutionalFlow.findUnique({
      where: { date_investorType_market: key },
      select: { source: true },
    });

    if (existing && !canOverwrite(existing.source, SOURCE)) {
      skipped++;
      continue;
    }

    await prisma.institutionalFlow.upsert({
      where: { date_investorType_market: key },
      create: { ...key, buyAmount: row.buyAmount, sellAmount: row.sellAmount, netAmount: row.netAmount, source: SOURCE },
      update: { buyAmount: row.buyAmount, sellAmount: row.sellAmount, netAmount: row.netAmount, source: SOURCE },
    });
    written++;
  }

  console.log(`✓ 書き込み: ${written} 行  スキップ(権威保護): ${skipped} 行\n`);

  // Summary
  const latest = await prisma.institutionalFlow.findFirst({
    where: { source: SOURCE },
    orderBy: { date: "desc" },
    select: { date: true, source: true },
  });

  const countBySource = await prisma.institutionalFlow.groupBy({
    by: ["source"],
    _count: { source: true },
  });

  console.log("=== DB 状態 ===");
  console.log(`最新日付 (${SOURCE}): ${latest?.date.toISOString().split("T")[0] ?? "なし"}`);
  console.log("source 分布:");
  for (const g of countBySource) {
    console.log(`  ${g.source.padEnd(28)} ${g._count.source} 行`);
  }

  console.log("\n次のステップ:");
  console.log("  npm run compute-scores  # AI スコア再計算 (moneyFlowSource=REAL が期待値)");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("CRASH:", e instanceof Error ? e.message : e);
  prisma.$disconnect().finally(() => process.exit(1));
});
