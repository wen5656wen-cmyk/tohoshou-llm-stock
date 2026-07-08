#!/usr/bin/env npx tsx
/**
 * TOPIX Data Repair — P6-T10 (T10.3, fixes KNOWN_ISSUES P2-020).
 *
 * GlobalMarket.topix 点位序列在 2026-03-30 有量纲断裂（≈3827 → ≈376，指数/代理切换）。
 * 本脚本用**真实数据**重取 1306.T（Nomura TOPIX ETF）历史 adjClose，检查断点连续性，
 * 若能得到单一连续真实序列则**仅回填断点之前的 topix / topixChange**（不动最近/最新值，
 * 保证生产 globalTrendScore 不受影响），否则不写、记录 FALLBACK（继续 Universe Benchmark）。
 *
 * 禁止人工修正数值——只用 Yahoo 真实 adjClose。默认 VERIFY（dry）；--apply 才回填。
 *
 * Usage:  npm run repair-topix           # verify only
 *         npm run repair-topix -- --apply
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import YahooFinance from "yahoo-finance2";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const yf = new YahooFinance({ suppressNotices: ["ripHistorical", "yahooSurvey"] });
const APPLY = process.argv.includes("--apply");
const SYMBOL = "1306.T";

function ymd(d: Date): string { return d.toISOString().slice(0, 10); }

async function main() {
  console.log(`=== TOPIX Repair (P6-T10 · P2-020) ${APPLY ? "[APPLY]" : "[VERIFY]"} ===`);

  // 1) 现状：检测断点
  const stored = await prisma.globalMarket.findMany({
    where: { topix: { not: null } }, select: { date: true, topix: true }, orderBy: { date: "asc" },
  });
  if (stored.length < 5) { console.log("GlobalMarket topix 数据不足，跳过。"); return; }
  let breakDate: string | null = null;
  for (let i = 1; i < stored.length; i++) {
    const a = stored[i - 1].topix!, b = stored[i].topix!;
    if (a > 0 && (b / a < 0.5 || b / a > 2)) { breakDate = ymd(stored[i].date); break; }
  }
  const minD = stored[0].date, maxD = stored[stored.length - 1].date;
  console.log(`现存 topix: ${stored.length} 天 (${ymd(minD)} … ${ymd(maxD)}) · 断点=${breakDate ?? "无"}`);
  if (!breakDate) { console.log("✅ 未检测到断裂，无需修复。"); await recordStatus("OK"); return; }

  // 2) 重取 1306.T 真实历史 adjClose
  let hist: { date: Date; adjClose: number | null; close: number | null }[] = [];
  try {
    const from = new Date(minD.getTime() - 5 * 86400000);
    const to = new Date(maxD.getTime() + 2 * 86400000);
    const raw = await yf.historical(SYMBOL, { period1: from, period2: to, interval: "1d" });
    hist = raw.map((r) => ({ date: r.date, adjClose: (r.adjClose ?? null) as number | null, close: (r.close ?? null) as number | null }));
    console.log(`Yahoo ${SYMBOL} 历史: ${hist.length} 天`);
  } catch (e) {
    console.log(`⚠ Yahoo 重取失败: ${e instanceof Error ? e.message : e} → 记录 FALLBACK（继续 Universe Benchmark）`);
    await recordStatus("FALLBACK");
    return;
  }
  if (hist.length < stored.length * 0.5) {
    console.log(`⚠ Yahoo 历史覆盖不足（${hist.length} < ${Math.round(stored.length * 0.5)}）→ FALLBACK`);
    await recordStatus("FALLBACK");
    return;
  }

  // 3) 校验重取序列自身连续性（adjClose 相邻 ratio 应无 >2 跳变）
  const byDate = new Map<string, number>();
  const cont = [...hist].sort((a, b) => a.date.getTime() - b.date.getTime());
  let selfBreak: string | null = null;
  let prev: number | null = null;
  for (const h of cont) {
    const v = h.adjClose ?? h.close;
    if (v == null || !(v > 0)) continue;
    byDate.set(ymd(h.date), v);
    if (prev != null && (v / prev < 0.5 || v / prev > 2)) selfBreak = ymd(h.date);
    prev = v;
  }
  if (selfBreak) {
    console.log(`⚠ 重取的 ${SYMBOL} adjClose 自身仍在 ${selfBreak} 跳变 → 无法得到连续真实序列 → FALLBACK`);
    await recordStatus("FALLBACK");
    return;
  }
  console.log(`✅ ${SYMBOL} adjClose 连续（无跳变）`);

  // 4) 仅回填断点之前的日期（保护最近/最新值 → 生产 globalTrendScore 不受影响）
  const targets = stored.filter((s) => ymd(s.date) < breakDate! && byDate.has(ymd(s.date)));
  console.log(`可回填断点前日期: ${targets.length}（${targets.length ? ymd(targets[0].date) + "…" + ymd(targets[targets.length - 1].date) : "无"}）`);
  const preview = targets.slice(0, 3).map((t) => `${ymd(t.date)}: ${t.topix!.toFixed(1)}→${byDate.get(ymd(t.date))!.toFixed(1)}`);
  console.log(`示例: ${preview.join(" · ")}`);

  if (!APPLY) {
    console.log(`(VERIFY) 将回填 ${targets.length} 天断点前 topix（不动断点后/最新）。加 --apply 执行。`);
    await recordStatus(targets.length > 0 ? "RESTORED_PENDING_APPLY" : "FALLBACK");
    return;
  }

  // 5) APPLY：仅更新 topix + topixChange（不动 score/其它字段）
  let n = 0;
  const sortedTargets = [...targets].sort((a, b) => a.date.getTime() - b.date.getTime());
  for (let i = 0; i < sortedTargets.length; i++) {
    const d = sortedTargets[i];
    const v = byDate.get(ymd(d.date))!;
    const prevV = i > 0 ? byDate.get(ymd(sortedTargets[i - 1].date)) ?? null : null;
    const chg = prevV && prevV > 0 ? ((v / prevV - 1) * 100) : null;
    await prisma.globalMarket.update({ where: { date: d.date }, data: { topix: v, topixChange: chg } });
    n++;
  }
  console.log(`✓ 回填 ${n} 天断点前 topix（真实 ${SYMBOL} adjClose）。断点后/最新值未改动。`);
  // 复核
  const after = await topixBreak();
  console.log(`复核: 断点=${after ?? "无（已连续）"}`);
  await recordStatus(after ? "PARTIAL" : "RESTORED");
}

async function topixBreak(): Promise<string | null> {
  const rows = await prisma.globalMarket.findMany({ where: { topix: { not: null } }, select: { date: true, topix: true }, orderBy: { date: "asc" } });
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1].topix!, b = rows[i].topix!;
    if (a > 0 && (b / a < 0.5 || b / a > 2)) return ymd(rows[i].date);
  }
  return null;
}

async function recordStatus(status: string) {
  console.log(`>> TOPIX repair status: ${status}（benchmark 仍为 UNIVERSE，由 Platform Report 每日记录）`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
