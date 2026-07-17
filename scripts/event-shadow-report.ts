#!/usr/bin/env npx tsx
/**
 * EventType Shadow Report（P12-DATA-01 · Phase 5）— **READ ONLY**
 * ────────────────────────────────────────────────────────────────────────────
 * 对现有生产样本运行 EventType v1 分类器，输出可人工核验的统计与样本。
 *
 * 🔒 安全契约（docs/P11-Architecture-Baseline.md · ADR-001）：
 *   · 本脚本**只读**：无 create / update / upsert / delete，无 $executeRaw。
 *   · EventType 是纯函数派生量，**不落库**（方案 A）→ 无需回滚。
 *   · 不读取、不修改 sentiment；不触碰评分与推荐路径。
 *
 * Usage:
 *   npx tsx scripts/event-shadow-report.ts                # 近 7 个交易日（默认）
 *   npx tsx scripts/event-shadow-report.ts --days=30      # 近 30 日（对齐 P11-ARCH-02 口径）
 *   npx tsx scripts/event-shadow-report.ts --samples=50   # 人工可读样本条数
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as dotenv from "dotenv";
import { classifyEventType } from "../lib/events/classify";
import { EVENT_TYPE_VERSION, EVENT_TYPE_LABEL, type EventType } from "../lib/events/types";

dotenv.config();
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const arg = (k: string, d: number) => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? Number(a.split("=")[1]) || d : d;
};
const DAYS = arg("days", 7);
const SAMPLES = arg("samples", 30);

const pct = (n: number, total: number) => total === 0 ? "0.0%" : `${((n / total) * 100).toFixed(1)}%`;
const bar = (n: number, max: number, w = 26) => "█".repeat(Math.max(0, Math.round((n / Math.max(1, max)) * w)));

type Row = { symbol: string; title: string; category: string | null; source: string; publishedAt: Date };

async function main() {
  const since = new Date(Date.now() - DAYS * 86400_000);

  // ── 取样：TDnet Disclosure + 普通 News（两条来源都要覆盖）──
  const [disc, news] = await Promise.all([
    prisma.disclosure.findMany({
      where: { publishedAt: { gte: since } },
      select: { symbol: true, title: true, category: true, publishedAt: true },
      orderBy: { publishedAt: "desc" },
    }),
    prisma.news.findMany({
      where: { publishedAt: { gte: since } },
      select: { title: true, category: true, source: true, publishedAt: true, stock: { select: { symbol: true } } },
      orderBy: { publishedAt: "desc" },
    }),
  ]);

  const rows: Row[] = [
    ...disc.map((d) => ({ symbol: d.symbol, title: d.title, category: d.category, source: "TDnet", publishedAt: d.publishedAt })),
    ...news.map((n) => ({ symbol: n.stock?.symbol ?? "—", title: n.title, category: n.category, source: n.source, publishedAt: n.publishedAt })),
  ];

  console.log("═".repeat(78));
  console.log(`  EventType Shadow Report · classifier ${EVENT_TYPE_VERSION} · READ ONLY · 近 ${DAYS} 日`);
  console.log("═".repeat(78));

  const classified = rows.map((r) => ({ r, c: classifyEventType({ title: r.title, category: r.category, source: r.source }) }));

  // ── 1. 总样本数 ──
  console.log(`\n【1】总样本数：${rows.length}（TDnet Disclosure ${disc.length} + News ${news.length}）`);

  // ── 2. 各 EventType 数量 ──
  const byType = new Map<EventType, number>();
  for (const { c } of classified) byType.set(c.eventType, (byType.get(c.eventType) ?? 0) + 1);
  const sorted = [...byType.entries()].sort((a, b) => b[1] - a[1]);
  const max = sorted[0]?.[1] ?? 1;
  console.log("\n【2】EventType 分布");
  for (const [t, n] of sorted) {
    console.log(`  ${t.padEnd(26)}${String(n).padStart(5)}  ${pct(n, rows.length).padStart(6)}  ${bar(n, max)}`);
  }

  // ── 3. UNKNOWN 比例 ──
  const unknown = byType.get("UNKNOWN") ?? 0;
  const other = byType.get("OTHER") ?? 0;
  console.log(`\n【3】UNKNOWN：${unknown} / ${rows.length} = ${pct(unknown, rows.length)}`);
  console.log(`     OTHER  ：${other} / ${rows.length} = ${pct(other, rows.length)}`);
  console.log(`     未定性合计（UNKNOWN+OTHER）：${pct(unknown + other, rows.length)}`);
  console.log("     ※ Baseline F9：EARNINGS/OTHER 类标题无方向信息且 Disclosure 无正文 —");
  console.log("       本阶段不要求降低 UNKNOWN，只要求如实报告。");

  // ── 4. 各 method 数量 ──
  const byMethod = new Map<string, number>();
  for (const { c } of classified) byMethod.set(c.method, (byMethod.get(c.method) ?? 0) + 1);
  console.log("\n【4】method 分布");
  for (const [m, n] of [...byMethod.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${m.padEnd(26)}${String(n).padStart(5)}  ${pct(n, rows.length).padStart(6)}`);
  }

  // ── 5. confidence 分布 ──
  const byConf = new Map<number, number>();
  for (const { c } of classified) byConf.set(c.confidence, (byConf.get(c.confidence) ?? 0) + 1);
  console.log("\n【5】confidence 分布（离散档位，非模型概率）");
  for (const [k, n] of [...byConf.entries()].sort((a, b) => b[0] - a[0])) {
    console.log(`  ${String(k).padStart(3)}${String(n).padStart(8)}  ${pct(n, rows.length).padStart(6)}`);
  }

  // ── 6. BUYBACK 三阶段专项核验（P11 核心教训）──
  console.log("\n【6】BUYBACK 专项核验 —— 三阶段是否被正确区分");
  const bbTypes: EventType[] = ["BUYBACK_ANNOUNCEMENT", "BUYBACK_PROGRESS", "BUYBACK_COMPLETED", "BUYBACK_CANCELLATION", "BUYBACK_DISPOSAL"];
  const bbTotal = bbTypes.reduce((s, t) => s + (byType.get(t) ?? 0), 0);
  for (const t of bbTypes) {
    const n = byType.get(t) ?? 0;
    console.log(`  ${t.padEnd(26)}${String(n).padStart(5)}  ${pct(n, bbTotal).padStart(6)} of buyback  — ${EVENT_TYPE_LABEL[t]}`);
  }
  const catBuyback = classified.filter((x) => x.r.category === "BUYBACK").length;
  const bbUnresolved = classified.filter((x) => x.r.category === "BUYBACK" && !bbTypes.includes(x.c.eventType)).length;
  console.log(`  ── category=BUYBACK 共 ${catBuyback} 条，其中未能定到子类：${bbUnresolved} 条（${pct(bbUnresolved, catBuyback)}）`);

  // ── 7. EQUITY 专项（ARCH-02 顺序 bug 的实测重算）──
  console.log("\n【7】EQUITY 专项 —— 修正规则顺序后的实测重算");
  const inEquity = classified.filter((x) => x.r.category === "EQUITY");
  const eqFinIn = inEquity.filter((x) => x.c.eventType === "EQUITY_FINANCING").length;
  const eqSoIn = inEquity.filter((x) => x.c.eventType === "EQUITY_STOCK_OPTION").length;
  console.log(`  category=EQUITY 共 ${inEquity.length} 条 →  真融资 ${eqFinIn} (${pct(eqFinIn, inEquity.length)}) / 员工期权 ${eqSoIn} (${pct(eqSoIn, inEquity.length)})`);
  console.log(`  全样本（含其它 category）：EQUITY_FINANCING ${byType.get("EQUITY_FINANCING") ?? 0} / EQUITY_STOCK_OPTION ${byType.get("EQUITY_STOCK_OPTION") ?? 0}`);
  console.log("  ※ 员工期权全样本数远大于 category=EQUITY —— 因 RS 薪酬多被 TDnet 归入 category=OTHER。");
  console.log("  ※ P11-ARCH-02 的临时分桶脚本把「新株予約権」判在「第三者割当」之前，");
  console.log("    将 MSワラント 误计为员工期权 → Baseline F7「EQUITY 仅 13.0% 是真稀释」可能低估。");
  console.log("    以上为修正顺序后的实测值，供 Baseline 勘误参考（本任务不改冻结正文）。");

  // ── 8. 人工可读样本 ──
  console.log(`\n【8】人工可读样本（${SAMPLES} 条 · 覆盖各 EventType）`);
  const picked: typeof classified = [];
  const seen = new Set<EventType>();
  for (const x of classified) { // 先每类取 1 条，保证覆盖面
    if (!seen.has(x.c.eventType)) { seen.add(x.c.eventType); picked.push(x); }
  }
  for (const x of classified) { // 再按时间补足
    if (picked.length >= SAMPLES) break;
    if (!picked.includes(x)) picked.push(x);
  }
  console.log("─".repeat(78));
  for (const { r, c } of picked.slice(0, SAMPLES)) {
    console.log(`  ${r.symbol.padEnd(9)} ${r.publishedAt.toISOString().slice(0, 10)}  [${r.source}/${r.category ?? "—"}]`);
    console.log(`    title      : ${r.title.slice(0, 62)}`);
    console.log(`    eventType  : ${c.eventType}  (${EVENT_TYPE_LABEL[c.eventType]})`);
    console.log(`    confidence : ${c.confidence}   method: ${c.method}`);
    console.log(`    evidence   : ${c.evidence.join("  |  ")}`);
    console.log("─".repeat(78));
  }

  console.log("\n✅ Shadow 完成 — 本脚本未写入任何数据（EventType 为纯函数派生量，不落库）。");
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error("ERR", e); await prisma.$disconnect(); process.exit(1); });
