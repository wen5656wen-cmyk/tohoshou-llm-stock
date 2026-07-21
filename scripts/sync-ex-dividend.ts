// ── P20 · 除权除息日同步（写入既有 Dividend.exDivDate，不改表结构）──────────
// 数据源：Yahoo quoteSummary(symbol, { modules: ["calendarEvents"] }).calendarEvents.exDividendDate
// ⚠️ 批量 quote() **不返回** exDividendDate（实测 0/200），只能逐只 quoteSummary（实测 108ms/只）。
//
// 行映射（关键）：Dividend 唯一键是 [symbol, year, quarter]，而 Yahoo 只给一个即将到来的
//   除权日。规则 = 严格年份匹配：定位 symbol + year=除权日的 JST 年份 + quarter=null 的
//   **既有行** UPDATE。找不到 → 计入 unmapped 并跳过，**绝不新建 Dividend 行**
//   （dividend 为必填 Float，凭空造行等于伪造派息数据），也绝不写进年份不符的行。
//
// 安全：写入前把 (id, symbol, 原值, 新值) 快照到 reports/exdiv-backup-<ts>.json 供回滚。
//      绝不用空值/无效日期覆盖已有有效数据。
//
// 用法：
//   npx tsx scripts/sync-ex-dividend.ts --scope=market   # 全市场（周日 23:00）
//   npx tsx scripts/sync-ex-dividend.ts --scope=focus    # 持仓+今日TOP10（每日 07:50）
//   npx tsx scripts/sync-ex-dividend.ts --scope=focus --dry-run

import "dotenv/config";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { prisma } from "../lib/prisma";
import { yahooFinance } from "../lib/yahooFinance";
import { jstDay, toValidFutureJstDay, dateOnly, runLimited, MAX_FAILURE_RATE } from "../lib/corporate-events";

const DRY = process.argv.includes("--dry-run");
const SCOPE = (process.argv.find((a) => a.startsWith("--scope="))?.split("=")[1] ?? "focus") as "market" | "focus";

type Hit = { symbol: string; day: string };

async function main() {
  const t0 = Date.now();
  const today = jstDay();
  console.log(`[exdiv] JST ${today} · scope=${SCOPE}${DRY ? " · DRY RUN" : ""}`);

  // ── 1. 范围 ─────────────────────────────────────────────────────────────
  let scope: string[];
  if (SCOPE === "market") {
    scope = (await prisma.stockScore.findMany({ select: { symbol: true } })).map((r) => r.symbol);
  } else {
    const [holdings, top10] = await Promise.all([
      prisma.userHolding.findMany({ select: { symbol: true } }),
      prisma.dailyRecommendation.findMany({ where: { date: dateOnly(today), gptRank: { lte: 10 } }, select: { symbol: true } }),
    ]);
    scope = [...new Set([...holdings.map((h) => h.symbol), ...top10.map((r) => r.symbol)])];
  }
  console.log(`[exdiv] 范围 ${scope.length} 只`);
  if (scope.length === 0) { console.log("[exdiv] 范围为空，退出"); return; }

  // ── 2. 断点续跑 ─────────────────────────────────────────────────────────
  //    Dividend 表无「本次写入时间」列（且禁止改其结构），故用 checkpoint 文件记录
  //    本 JST 日已取数完成的 symbol。中途 kill 后重跑自动跳过，不重复打 Yahoo。
  //    文件按 JST 日 + scope 命名，隔日自然失效；不进 git。
  const ckDir = join(process.cwd(), "reports");
  mkdirSync(ckDir, { recursive: true });
  const ckPath = join(ckDir, `exdiv-checkpoint-${today}-${SCOPE}.json`);
  const doneKey = new Set<string>(
    existsSync(ckPath) ? (JSON.parse(readFileSync(ckPath, "utf8")) as string[]) : []
  );
  if (doneKey.size) console.log(`[exdiv] 断点续跑：checkpoint 命中 ${doneKey.size} 只，跳过`);
  // ⚠️ DRY RUN 绝不可写 checkpoint —— 否则预演会"吃掉"待办清单，随后的真实同步
  //    会误判为全部已完成而一行不写（本轮预演即复现过）。
  const flushCk = () => { if (!DRY) writeFileSync(ckPath, JSON.stringify([...doneKey])); };

  // ── 3. 逐只取数（限速 4 并发 / 150ms 间隔 / 重试 2 次 / 失败隔离）───────
  const pending = scope.filter((s) => !doneKey.has(s));
  console.log(`[exdiv] 待取数 ${pending.length} 只`);
  const stats = await runLimited(
    pending,
    (s) => s,
    async (symbol): Promise<Hit | null> => {
      const q = (await yahooFinance.quoteSummary(symbol, { modules: ["calendarEvents"] })) as Record<string, unknown>;
      const ce = (q?.calendarEvents ?? {}) as Record<string, unknown>;
      const day = toValidFutureJstDay(ce.exDividendDate, today);
      doneKey.add(symbol); // 取数成功即记 checkpoint（无值也算完成，不必重取）
      return day ? { symbol, day } : null; // 无值/过期/越界 → skipped，绝不覆盖既有数据
    },
    {
      concurrency: 4, spacingMs: 150, retries: 2,
      timeoutMs: SCOPE === "market" ? 20 * 60 * 1000 : 5 * 60 * 1000,
      onProgress: (d, n) => { console.log(`[exdiv] 进度 ${d}/${n}`); flushCk(); },
    }
  );
  flushCk();

  const hits = stats.ok;
  const failRate = pending.length ? stats.failed.length / pending.length : 0;
  console.log(`[exdiv] 取数完成：有值 ${hits.length} · 无值/过期 ${stats.skipped.length} · 失败 ${stats.failed.length} · 超时=${stats.timedOut}`);
  stats.failed.slice(0, 10).forEach((f) => console.log(`  [failed] ${f.key} → ${f.error}`));

  if (failRate > MAX_FAILURE_RATE) {
    console.log(`[exdiv] ❌ 失败率 ${(failRate * 100).toFixed(0)}% > ${MAX_FAILURE_RATE * 100}%，保留旧数据不做任何写入`);
    process.exitCode = 1;
    return;
  }

  // ── 4. 严格年份行映射 ───────────────────────────────────────────────────
  const plan: { id: number; symbol: string; oldExDiv: string | null; newExDiv: string }[] = [];
  let unmapped = 0;
  for (const h of hits) {
    const year = Number(h.day.slice(0, 4));
    const row = await prisma.dividend.findFirst({
      where: { symbol: h.symbol, year, quarter: null },
      select: { id: true, exDivDate: true },
    });
    if (!row) { unmapped++; continue; } // 无匹配年份行 → 跳过，绝不新建
    const oldVal = row.exDivDate ? new Date(row.exDivDate).toISOString().slice(0, 10) : null;
    if (oldVal === h.day) continue; // 已是同值 → 幂等，无需写
    plan.push({ id: row.id, symbol: h.symbol, oldExDiv: oldVal, newExDiv: h.day });
  }
  console.log(`[exdiv] 行映射：待写 ${plan.length} 行 · 无匹配年份行 ${unmapped} 只 · 已是同值 ${hits.length - plan.length - unmapped} 只`);

  if (DRY) {
    plan.slice(0, 20).forEach((p) => console.log(`  Dividend#${p.id} ${p.symbol.padEnd(9)} ${p.oldExDiv ?? "null"} → ${p.newExDiv}`));
    console.log(`[exdiv] DRY RUN 结束，未写库（耗时 ${Date.now() - t0}ms）`);
    return;
  }
  if (plan.length === 0) { console.log(`[exdiv] 无需写入，耗时 ${Date.now() - t0}ms`); return; }

  // ── 5. 写入前快照（回滚依据；不进 git）──────────────────────────────────
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(ckDir, `exdiv-backup-${stamp}.json`);
  writeFileSync(backupPath, JSON.stringify({
    writtenAt: new Date().toISOString(), jstDate: today, scope: SCOPE, count: plan.length,
    rows: plan.map((p) => ({ id: p.id, symbol: p.symbol, oldExDivDate: p.oldExDiv, newExDivDate: p.newExDiv, writtenAt: new Date().toISOString() })),
  }, null, 2));
  console.log(`[exdiv] 备份已写入 ${backupPath}`);

  // ── 6. 写入 ─────────────────────────────────────────────────────────────
  let written = 0;
  for (const p of plan) {
    await prisma.dividend.update({ where: { id: p.id }, data: { exDivDate: dateOnly(p.newExDiv) } });
    written++;
  }
  const totalWithEx = await prisma.dividend.count({ where: { exDivDate: { not: null } } });
  console.log(`[exdiv] ✅ 写入 ${written} 行；全表 exDivDate 非空 ${totalWithEx} 行；耗时 ${Date.now() - t0}ms`);
}

main()
  .catch((e) => { console.error("[exdiv] FATAL", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
