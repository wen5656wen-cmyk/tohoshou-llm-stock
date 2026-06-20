#!/usr/bin/env npx tsx
/**
 * Seed 日本科技股・AI产业链主题分类数据
 * 用法：npx tsx scripts/seed-ai-themes.ts
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const AI_THEMES: Array<{ symbol: string; theme: string; name: string }> = [
  // ── 半导体设备 ──────────────────────────────────────────────────────────
  { symbol: "8035.T", theme: "SEMICONDUCTOR",   name: "東京エレクトロン" },
  { symbol: "6857.T", theme: "SEMICONDUCTOR",   name: "アドバンテスト" },
  { symbol: "6920.T", theme: "SEMICONDUCTOR",   name: "レーザーテック" },
  { symbol: "7735.T", theme: "SEMICONDUCTOR",   name: "SCREENホールディングス" },
  { symbol: "6146.T", theme: "SEMICONDUCTOR",   name: "ディスコ" },
  { symbol: "3436.T", theme: "SEMICONDUCTOR",   name: "SUMCO" },

  // ── 电子・传感器・精密 ──────────────────────────────────────────────────
  { symbol: "6758.T", theme: "ELECTRONICS",     name: "ソニーグループ" },
  { symbol: "6861.T", theme: "ELECTRONICS",     name: "キーエンス" },
  { symbol: "6981.T", theme: "ELECTRONICS",     name: "村田製作所" },
  { symbol: "6762.T", theme: "ELECTRONICS",     name: "TDK" },
  { symbol: "6963.T", theme: "ELECTRONICS",     name: "ローム" },
  { symbol: "6965.T", theme: "ELECTRONICS",     name: "浜松ホトニクス" },
  { symbol: "6806.T", theme: "ELECTRONICS",     name: "ヒロセ電機" },

  // ── 软件・AI・云 ────────────────────────────────────────────────────────
  { symbol: "3993.T", theme: "SOFTWARE_AI",     name: "PKSHA Technology" },
  { symbol: "5574.T", theme: "SOFTWARE_AI",     name: "ABEJA" },
  { symbol: "4382.T", theme: "SOFTWARE_AI",     name: "HEROZ" },
  { symbol: "5132.T", theme: "SOFTWARE_AI",     name: "pluszero" },
  { symbol: "9613.T", theme: "SOFTWARE_AI",     name: "NTTデータグループ" },
  { symbol: "9449.T", theme: "SOFTWARE_AI",     name: "GMOインターネットグループ" },
  { symbol: "9719.T", theme: "SOFTWARE_AI",     name: "SCSKホールディングス" },
  { symbol: "4684.T", theme: "SOFTWARE_AI",     name: "オービック" },
  { symbol: "4307.T", theme: "SOFTWARE_AI",     name: "野村総合研究所" },

  // ── 工业自动化・机器人 ──────────────────────────────────────────────────
  { symbol: "6954.T", theme: "INDUSTRIAL_AUTO", name: "ファナック" },
  { symbol: "6506.T", theme: "INDUSTRIAL_AUTO", name: "安川電機" },
  { symbol: "6273.T", theme: "INDUSTRIAL_AUTO", name: "SMC" },
  { symbol: "6645.T", theme: "INDUSTRIAL_AUTO", name: "オムロン" },
  { symbol: "6383.T", theme: "INDUSTRIAL_AUTO", name: "ダイフク" },

  // ── 通信・数据中心 ──────────────────────────────────────────────────────
  { symbol: "9984.T", theme: "TELECOM_DC",      name: "ソフトバンクグループ" },
  { symbol: "9432.T", theme: "TELECOM_DC",      name: "日本電信電話（NTT）" },
  { symbol: "9433.T", theme: "TELECOM_DC",      name: "KDDI" },
  { symbol: "6701.T", theme: "TELECOM_DC",      name: "NEC" },
  { symbol: "6702.T", theme: "TELECOM_DC",      name: "富士通" },

  // ── 科技服务・互联网 ────────────────────────────────────────────────────
  { symbol: "6098.T", theme: "TECH_SERVICES",   name: "リクルートホールディングス" },
  { symbol: "4751.T", theme: "TECH_SERVICES",   name: "サイバーエージェント" },
  { symbol: "4385.T", theme: "TECH_SERVICES",   name: "メルカリ" },
  { symbol: "3994.T", theme: "TECH_SERVICES",   name: "マネーフォワード" },
  { symbol: "4443.T", theme: "TECH_SERVICES",   name: "Sansan" },
  { symbol: "4478.T", theme: "TECH_SERVICES",   name: "freee" },
];

async function main() {
  console.log(`=== 日本科技股・AI产业链 Seed ===`);
  console.log(`投入 ${AI_THEMES.length} 只股票...\n`);

  // 全量重置（避免旧 symbol 残留在不同分类）
  const removed = await prisma.aITheme.deleteMany({});
  console.log(`  ↳ 清除旧数据 ${removed.count} 条，重新写入...\n`);

  let upserted = 0;
  for (const row of AI_THEMES) {
    await prisma.aITheme.upsert({
      where: { symbol: row.symbol },
      create: { symbol: row.symbol, theme: row.theme },
      update: { theme: row.theme },
    });
    upserted++;
    console.log(`  ✓ [${row.theme.padEnd(15)}] ${row.symbol.padEnd(8)}  ${row.name}`);
  }

  console.log(`\n✅ 完成：${upserted} 只股票已写入 ai_themes`);

  const byTheme = await prisma.aITheme.groupBy({
    by: ["theme"],
    _count: { theme: true },
    orderBy: { theme: "asc" },
  });
  console.log("\n分类统计：");
  for (const t of byTheme) {
    console.log(`  ${t.theme.padEnd(18)} ${t._count.theme} 只`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("CRASH:", e);
  prisma.$disconnect();
  process.exit(1);
});
