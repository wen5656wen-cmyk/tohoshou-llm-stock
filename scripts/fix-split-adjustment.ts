#!/usr/bin/env npx tsx
/**
 * 拆股复权修复 — スキャン & バックフィル (requirement #5 / #7)
 * ────────────────────────────────────────────────────────────────────────────
 * Finds Japanese stocks whose stored `adjClose` still carries a fake cliff from
 * an un-back-adjusted split, re-fetches the correct J-Quants AdjC history, and
 * overwrites `adjClose` on exactly the rows that drifted. Optionally recomputes
 * AI scores for the repaired symbols.
 *
 * Root cause: `sync-all-prices.ts` used `createMany({ skipDuplicates: true })`,
 * which never updates existing rows. When J-Quants back-adjusts the whole AdjC
 * history on a split ex-date, pre-split rows kept their stale adjClose → a
 * -66.7% (1:3) style cliff in MA/RSI/MACD/returns → false "AVOID" ratings.
 *
 * Detection is cheap (DB scan for single-day adjClose cliffs); repair only
 * touches rows whose stored value ≠ fresh J-Quants AdjC, so a GENUINE crash
 * (already correctly adjusted) yields zero updates and is reported, not touched.
 *
 * Usage:
 *   npx tsx scripts/fix-split-adjustment.ts                 # dry-run, scan all
 *   npx tsx scripts/fix-split-adjustment.ts --apply         # scan all + write
 *   npx tsx scripts/fix-split-adjustment.ts --symbol=325A.T # one symbol (dry-run)
 *   npx tsx scripts/fix-split-adjustment.ts --symbol=325A.T --apply --rescore
 *   flags: --since=<days,120> --threshold=<0.35> --limit=<N> --rescore
 */

import "dotenv/config";
import { execSync } from "child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { findAdjCloseCliffs, computeAdjCloseUpdates, SPLIT_CLIFF_THRESHOLD, type AdjBar } from "../lib/split-adjust";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma  = new PrismaClient({ adapter });

// ── Flags ────────────────────────────────────────────────────────────────────
const APPLY     = process.argv.includes("--apply");
const RESCORE   = process.argv.includes("--rescore");
const SYMBOL    = (process.argv.find(a => a.startsWith("--symbol="))    ?? "").split("=")[1] || null;
const SINCE     = parseInt((process.argv.find(a => a.startsWith("--since="))     ?? "").split("=")[1] || "120");
const THRESHOLD = parseFloat((process.argv.find(a => a.startsWith("--threshold=")) ?? "").split("=")[1] || String(SPLIT_CLIFF_THRESHOLD));
const LIMIT     = parseInt((process.argv.find(a => a.startsWith("--limit="))     ?? "").split("=")[1] || "0");

// ── J-Quants (same endpoint/auth as sync-all-prices) ─────────────────────────
const API_KEY = process.env.JQUANTS_API_KEY!;
const BASE    = "https://api.jquants.com/v2";
const CORP_LOOKBACK_DAYS = 1000;

type JBar = { Date: string; C: number; AdjC: number; AdjFactor?: number };

function toCode5(symbol: string): string {
  const base = symbol.replace(/\.[A-Z]+$/, "");
  return base.length === 4 ? base + "0" : base;
}

async function fetchFull(symbol: string, to: string): Promise<{ date: string; close: number; adjClose: number }[]> {
  const from = new Date(Date.now() - CORP_LOOKBACK_DAYS * 86400_000).toISOString().split("T")[0];
  const url  = `${BASE}/equities/bars/daily?code=${toCode5(symbol)}&dateFrom=${from}&dateTo=${to}`;
  const rows: JBar[] = [];
  let next: string | undefined = url;
  while (next) {
    const res = await fetch(next, { headers: { "x-api-key": API_KEY } });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text().catch(() => "")).slice(0, 80)}`);
    const j = await res.json() as { data: JBar[]; pagination_key?: string };
    rows.push(...(j.data || []));
    next = j.pagination_key ? `${url}&pagination_key=${encodeURIComponent(j.pagination_key)}` : undefined;
  }
  return rows
    .filter(b => b.Date && b.C)
    .map(b => ({ date: new Date(b.Date).toISOString().split("T")[0], close: b.C, adjClose: b.AdjC ?? b.C }));
}

// ── Candidate detection ──────────────────────────────────────────────────────
async function findCandidates(): Promise<string[]> {
  if (SYMBOL) return [SYMBOL];
  const cutoff = new Date(Date.now() - SINCE * 86400_000);
  const rows = await prisma.dailyPrice.findMany({
    where: { date: { gte: cutoff } },
    orderBy: [{ symbol: "asc" }, { date: "asc" }],
    select: { symbol: true, date: true, close: true, adjClose: true },
  });
  const bySymbol = new Map<string, AdjBar[]>();
  for (const r of rows) {
    const arr = bySymbol.get(r.symbol) ?? [];
    arr.push({ date: r.date.toISOString().split("T")[0], close: Number(r.close), adjClose: r.adjClose != null ? Number(r.adjClose) : null });
    bySymbol.set(r.symbol, arr);
  }
  const candidates: string[] = [];
  for (const [symbol, bars] of bySymbol) {
    if (findAdjCloseCliffs(bars, THRESHOLD).length > 0) candidates.push(symbol);
  }
  return candidates.sort();
}

// ── Repair one symbol ────────────────────────────────────────────────────────
async function repair(symbol: string, to: string): Promise<{ updates: number; genuine: boolean }> {
  const fresh = await fetchFull(symbol, to);
  if (fresh.length === 0) return { updates: 0, genuine: false };
  const stored = await prisma.dailyPrice.findMany({
    where: { symbol },
    select: { date: true, adjClose: true },
  });
  const storedMapped = stored.map(s => ({ date: s.date.toISOString().split("T")[0], adjClose: s.adjClose }));
  const updates = computeAdjCloseUpdates(storedMapped, fresh);

  if (updates.length > 0 && APPLY) {
    const CHUNK = 50;
    for (let i = 0; i < updates.length; i += CHUNK) {
      await Promise.all(updates.slice(i, i + CHUNK).map(u =>
        prisma.dailyPrice.updateMany({
          where: { symbol, date: new Date(u.date) },
          data:  { adjClose: u.adjClose },
        }),
      ));
    }
  }
  // updates===0 on a flagged cliff → the move is genuine (stored already matches fresh).
  return { updates: updates.length, genuine: updates.length === 0 };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!API_KEY) { console.error("ERROR: JQUANTS_API_KEY not set"); process.exit(1); }
  const to = new Date().toISOString().split("T")[0];

  console.log(`\n${"═".repeat(64)}`);
  console.log(`拆股复权修复  mode=${APPLY ? "APPLY" : "DRY-RUN"}  threshold=${THRESHOLD}  since=${SINCE}d`);
  console.log("═".repeat(64) + "\n");

  console.log("① 候选检测（adjClose 单日跳空扫描）...");
  let candidates = await findCandidates();
  if (LIMIT > 0) candidates = candidates.slice(0, LIMIT);
  console.log(`   候选: ${candidates.length} 只${candidates.length ? " → " + candidates.join(", ") : ""}\n`);

  if (candidates.length === 0) { console.log("无候选，退出。"); await prisma.$disconnect(); return; }

  console.log("② 逐只对 J-Quants 复核并修复 adjClose...");
  const repaired: string[] = [];
  const genuine: string[]  = [];
  let totalRows = 0;
  for (const symbol of candidates) {
    try {
      const { updates, genuine: isGenuine } = await repair(symbol, to);
      if (updates > 0) {
        repaired.push(symbol); totalRows += updates;
        console.log(`   ✓ ${symbol}: ${APPLY ? "已修复" : "需修复"} ${updates} 行 adjClose`);
      } else if (isGenuine) {
        genuine.push(symbol);
        console.log(`   ○ ${symbol}: 真实波动（stored 已与 J-Quants 一致），跳过`);
      }
    } catch (e) {
      console.error(`   ✗ ${symbol}: ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log(`\n${"─".repeat(50)}`);
  console.log(`修复汇总: ${repaired.length} 只需修复（${totalRows} 行） / ${genuine.length} 只真实波动`);
  if (repaired.length) console.log(`  修复列表: ${repaired.join(", ")}`);

  // ③ Targeted rescore
  if (APPLY && RESCORE && repaired.length > 0) {
    console.log(`\n③ 定向重算评分（compute-scores --symbols）...`);
    await prisma.$disconnect();
    const cmd = `npx tsx ${__dirname}/compute-scores.ts --symbols=${repaired.join(",")}`;
    execSync(cmd, { stdio: "inherit", env: { ...process.env, TZ: "Asia/Tokyo" } });
    console.log("\n✅ 完成。");
    return;
  }

  if (!APPLY && repaired.length > 0) {
    console.log(`\n提示: 加 --apply 写入，加 --rescore 一并重算评分。`);
  }
  await prisma.$disconnect();
}

main().catch(e => { console.error("CRASH:", e); prisma.$disconnect().finally(() => process.exit(1)); });
