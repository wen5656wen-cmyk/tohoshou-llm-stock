#!/usr/bin/env npx tsx
/**
 * Portfolio NAV Snapshot — 组合每日净值快照（P17-02B）。
 * 每交易日收盘写一条 PortfolioNavSnapshot（equity=持仓市值+现金 + 同日TOPIX/Nikkei）。
 * 接入已有 15:15 JST 收盘任务（daily-holding-review 之后），不新增 cron.schedule。
 * 亦可手动 `npx tsx scripts/portfolio-nav-snapshot.ts`（幂等，按 JST 日 upsert）。
 */
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { writeNavSnapshot } from "../lib/trading/nav-snapshot";

async function main() {
  const r = await writeNavSnapshot();
  console.log(`[nav-snapshot] date=${new Date(r.date).toISOString().slice(0, 10)} equity=${Math.round(r.equity)} mv=${Math.round(r.marketValue)} cash=${Math.round(r.cash)} pos=${r.positions} topix=${r.topix ?? "—"} nikkei=${r.nikkei ?? "—"}`);
}

main().catch((e) => { console.error("[nav-snapshot] fatal", e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
