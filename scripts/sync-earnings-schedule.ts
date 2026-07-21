// ── P20 · 财报発表予定同步（范围 = 当前持仓 ∪ 今日 TOP10）────────────────────
// 数据源：Yahoo Finance 批量 quote()（50 只/批，实测 200 只 1.2 秒）。
//
// ⚠️ 为什么不扫全市场：实测 Top300 中 earningsTimestampStart 有值率 93%，但**未过期的只有
//    23%**（70% 是去年的陈旧值）。全市场扫描既昂贵又会让页面充满假「财报预定」。
//    今日事件本就服务于持仓与今日关注标的，故范围锁定在这两类。
//
// 幂等：按 symbol upsert；重跑不产生重复行。
// 断点续跑：本 JST 日已成功刷新（fetchedAt >= 今日 00:00 JST）的 symbol 直接跳过。
//
// 用法：
//   npx tsx scripts/sync-earnings-schedule.ts            # 正常同步
//   npx tsx scripts/sync-earnings-schedule.ts --dry-run  # 只读预览，不写库

import "dotenv/config";
import { prisma } from "../lib/prisma";
import { yahooFinance } from "../lib/yahooFinance";
import { jstDay, toValidFutureJstDay, dateOnly, runLimited, MAX_FAILURE_RATE } from "../lib/corporate-events";

const DRY = process.argv.includes("--dry-run");
const BATCH = 50;
const STALE_DAYS = 14;

type Row = { symbol: string; day: string; confirmed: boolean };

async function main() {
  const t0 = Date.now();
  const today = jstDay();
  const todayStart = new Date(`${today}T00:00:00+09:00`);
  console.log(`[earnings] JST ${today}${DRY ? " · DRY RUN" : ""}`);

  // ── 1. 范围 = 持仓 ∪ 今日 TOP10 ──────────────────────────────────────────
  const [holdings, top10] = await Promise.all([
    prisma.userHolding.findMany({ select: { symbol: true } }),
    prisma.dailyRecommendation.findMany({
      where: { date: dateOnly(today), gptRank: { lte: 10 } },
      select: { symbol: true },
    }),
  ]);
  const scope = [...new Set([...holdings.map((h) => h.symbol), ...top10.map((r) => r.symbol)])];
  console.log(`[earnings] 范围 ${scope.length} 只（持仓 ${holdings.length} · TOP10 ${top10.length}）`);
  if (scope.length === 0) { console.log("[earnings] 范围为空，退出"); return; }

  // ── 2. 断点续跑：今日已刷新过的跳过 ──────────────────────────────────────
  const fresh = DRY ? [] : await prisma.earningsSchedule.findMany({
    where: { symbol: { in: scope }, fetchedAt: { gte: todayStart } },
    select: { symbol: true },
  });
  const freshSet = new Set(fresh.map((r) => r.symbol));
  const todo = scope.filter((s) => !freshSet.has(s));
  if (freshSet.size) console.log(`[earnings] 断点续跑：跳过今日已刷新 ${freshSet.size} 只，待处理 ${todo.length} 只`);
  if (todo.length === 0) { console.log("[earnings] 全部已是今日数据，无需刷新"); return; }

  // ── 3. 批量取数（失败隔离 + 重试 + 限速）────────────────────────────────
  const batches: string[][] = [];
  for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));

  const stats = await runLimited(
    batches,
    (b) => `batch:${b[0]}+${b.length}`,
    async (syms): Promise<Row[]> => {
      const r = await yahooFinance.quote(syms);
      const list = (Array.isArray(r) ? r : [r]) as Record<string, unknown>[];
      const out: Row[] = [];
      for (const q of list) {
        const symbol = String(q?.symbol ?? "");
        if (!symbol) continue;
        // 主字段：earningsTimestampStart（禁止 * 1000，v3 已是 Date）
        const day = toValidFutureJstDay(q.earningsTimestampStart, today);
        if (!day) continue; // 无值 / 已过期 / 越界 → 不入库
        // 交叉校验：earningsTimestamp 与 Start 同日 → confirmed
        const xDay = toValidFutureJstDay(q.earningsTimestamp, today);
        out.push({ symbol, day, confirmed: xDay === day });
      }
      return out;
    },
    { concurrency: 2, spacingMs: 150, retries: 2, timeoutMs: 5 * 60 * 1000 }
  );

  const rows = stats.ok.flat();
  const failRate = batches.length ? stats.failed.length / batches.length : 0;
  console.log(`[earnings] 取数完成：批次 ok=${stats.ok.length} failed=${stats.failed.length} 超时=${stats.timedOut}`);
  console.log(`[earnings] 有效未来日期 ${rows.length} 只（已确认 ${rows.filter((r) => r.confirmed).length}）`);
  for (const f of stats.failed) console.log(`  [failed] ${f.key} → ${f.error}`);

  if (failRate > MAX_FAILURE_RATE) {
    console.log(`[earnings] ❌ 失败率 ${(failRate * 100).toFixed(0)}% > ${MAX_FAILURE_RATE * 100}%，保留旧数据不做任何写入/清理`);
    process.exitCode = 1;
    return;
  }

  if (DRY) {
    rows.slice(0, 20).forEach((r) => console.log(`  ${r.symbol.padEnd(9)} ${r.day} ${r.confirmed ? "✓已确认" : "⚠待确认"}`));
    console.log(`[earnings] DRY RUN 结束，未写库（耗时 ${Date.now() - t0}ms）`);
    return;
  }

  // ── 4. 写入（幂等 upsert）────────────────────────────────────────────────
  for (const r of rows) {
    await prisma.earningsSchedule.upsert({
      where: { symbol: r.symbol },
      create: { symbol: r.symbol, earningsDate: dateOnly(r.day), confirmed: r.confirmed, source: "yahoo" },
      update: { earningsDate: dateOnly(r.day), confirmed: r.confirmed, source: "yahoo", fetchedAt: new Date() },
    });
  }

  // ── 5. 过期与陈旧清理 ───────────────────────────────────────────────────
  const expired = await prisma.earningsSchedule.deleteMany({ where: { earningsDate: { lt: dateOnly(today) } } });
  const stale = await prisma.earningsSchedule.deleteMany({
    where: { fetchedAt: { lt: new Date(Date.now() - STALE_DAYS * 864e5) } },
  });
  console.log(`[earnings] 写入 ${rows.length} 行；清理 过期 ${expired.count} 行 / 陈旧 ${stale.count} 行`);
  console.log(`[earnings] ✅ 完成，耗时 ${Date.now() - t0}ms`);
}

main()
  .catch((e) => { console.error("[earnings] FATAL", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
