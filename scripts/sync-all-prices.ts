#!/usr/bin/env npx tsx
/**
 * 株価並行同期（v2 — 有限並行キュー + 自動後続流水線）
 *
 * Phase 1: J-Quants から OHLCV を並行取得 → DailyPrice / Stock に upsert
 * Phase 2: 価格同期完了後、AI 評分流水線を自動実行（--prices-only 時はスキップ）
 *
 * 並行設定（環境変数で上書き可）:
 *   SYNC_CONCURRENCY    デフォルト 5（並行数）
 *   SYNC_BATCH_DELAY_MS デフォルト 200ms（バッチ間隔）
 *
 * フラグ:
 *   --daily         最近7日のみ（軽量増分モード）
 *   --prices-only   価格同期のみ（下流流水線を実行しない）
 *   --retry-failed  当日または前日の失敗銘柄のみ再同期（--prices-only を暗示）
 *   --limit=N       最初の N 銘柄のみ（テスト用）
 *
 * 用法:
 *   npm run sync-prices-recent              # 全量 400 日 + 下流流水線
 *   npm run sync-prices-daily               # 増分 7 日 + 下流流水線
 *   npm run sync-prices-retry               # 失败重跑（価格のみ）
 *   npx tsx scripts/sync-all-prices.ts --limit=20 --prices-only  # テスト
 */

import "dotenv/config";
import { execSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma  = new PrismaClient({ adapter });

// ── CLI flags ──────────────────────────────────────────────────────────────────
const DAILY_MODE   = process.argv.includes("--daily");
const PRICES_ONLY  = process.argv.includes("--prices-only");
const RETRY_FAILED = process.argv.includes("--retry-failed");
const LIMIT_ARG    = process.argv.find(a => a.startsWith("--limit="));
const LIMIT        = LIMIT_ARG ? parseInt(LIMIT_ARG.split("=")[1]) : undefined;

// --retry-failed は価格修復専用。下流流水線は実行しない。
const RUN_PIPELINE = !PRICES_ONLY && !RETRY_FAILED;

// ── Concurrency config ─────────────────────────────────────────────────────────
const CONCURRENCY    = Math.max(1, parseInt(process.env.SYNC_CONCURRENCY    ?? "5"));
const BATCH_DELAY_MS = Math.max(0, parseInt(process.env.SYNC_BATCH_DELAY_MS ?? "200"));
const MAX_RETRIES    = 2; // 最大 2 回リトライ（初回 + 2 = 計 3 アテンプト）

const DATE_RANGE_DAYS = DAILY_MODE ? 7 : 400;

// ── File paths ─────────────────────────────────────────────────────────────────
const LOG_DIR   = join(process.cwd(), "logs");
try { mkdirSync(LOG_DIR, { recursive: true }); } catch {}

const today     = new Date().toISOString().split("T")[0];
const yesterday = new Date(Date.now() - 86400_000).toISOString().split("T")[0];
const FAIL_FILE = join(LOG_DIR, `sync-prices-failed-${today}.json`);

// ── J-Quants API ───────────────────────────────────────────────────────────────
const API_KEY = process.env.JQUANTS_API_KEY!;
const BASE    = "https://api.jquants.com/v2";

type Bar = {
  Date: string; Code: string;
  O: number; H: number; L: number; C: number;
  Vo: number; AdjC: number;
};

const FETCH_TIMEOUT_MS = 30_000; // 30s per request

// ── fetchBars ─────────────────────────────────────────────────────────────────
async function fetchBars(code5: string, from: string, to: string): Promise<Bar[]> {
  const url = `${BASE}/equities/bars/daily?code=${code5}&dateFrom=${from}&dateTo=${to}`;

  async function doFetch(u: string): Promise<{ data: Bar[]; pagination_key?: string }> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(u, { headers: { "x-api-key": API_KEY }, signal: ac.signal });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`${res.status} ${body.slice(0, 100)}`);
      }
      return res.json() as Promise<{ data: Bar[]; pagination_key?: string }>;
    } finally {
      clearTimeout(timer);
    }
  }

  const first = await doFetch(url);
  let bars = first.data || [];
  let pk   = first.pagination_key;

  while (pk) {
    const page = await doFetch(`${url}&pagination_key=${encodeURIComponent(pk)}`);
    bars = bars.concat(page.data || []);
    pk   = page.pagination_key;
  }
  return bars;
}

// ── toCode5 ───────────────────────────────────────────────────────────────────
function toCode5(symbol: string): string {
  const base = symbol.replace(/\.[A-Z]+$/, "");
  return base.length === 4 ? base + "0" : base;
}

// ── syncPrices (ロジック変更なし) ─────────────────────────────────────────────
async function syncPrices(
  stock: { id: number; symbol: string },
  to: string,
  from: string,
): Promise<number> {
  const bars   = await fetchBars(toCode5(stock.symbol), from, to);
  const fromMs = new Date(from).getTime();
  const valid  = bars.filter(b => b.Date && b.C && new Date(b.Date).getTime() >= fromMs);
  if (valid.length === 0) return 0;

  await prisma.dailyPrice.createMany({
    data: valid.map(b => ({
      symbol:   stock.symbol,
      date:     new Date(b.Date),
      open:     b.O   ?? 0,
      high:     b.H   ?? 0,
      low:      b.L   ?? 0,
      close:    b.C,
      volume:   b.Vo  ?? 0,
      adjClose: b.AdjC ?? null,
      source:   "jquants",
    })),
    skipDuplicates: true,
  });

  const latest = valid[valid.length - 1];
  const prev   = valid.length > 1 ? valid[valid.length - 2] : null;
  const change     = prev ? latest.C - prev.C : 0;
  const changeRate = prev && prev.C ? (change / prev.C) * 100 : 0;
  const allAdj     = valid.map(b => b.AdjC ?? b.C);

  await prisma.stock.update({
    where: { id: stock.id },
    data: {
      price:     latest.C,
      change,
      changeRate,
      high52w:   Math.max(...allAdj),
      low52w:    Math.min(...allAdj),
      volume:    latest.Vo ?? null,
      lastSyncAt: new Date(),
    },
  });

  return valid.length;
}

// ── Per-stock retry wrapper ────────────────────────────────────────────────────
type Counters = { ok: number; skip: number; err: number; failedEntries: string[] };

async function syncWithRetry(
  stock: { id: number; symbol: string },
  to: string,
  from: string,
  counters: Counters,
): Promise<void> {
  let lastErr = "unknown";
  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    try {
      const count = await syncPrices(stock, to, from);
      if (count > 0) counters.ok++;
      else           counters.skip++;
      return;
    } catch (e) {
      lastErr = (e instanceof Error ? e.message : String(e)).slice(0, 80);
      if (attempt <= MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 500 * attempt)); // 500ms → 1000ms
      }
    }
  }
  counters.err++;
  counters.failedEntries.push(`${stock.symbol}: ${lastErr}`);
}

// ── Pipeline stage runner (sync-all-prices はすでに子プロセス内なので execSync OK) ──
function runPipelineStage(scriptFile: string, label: string, timeoutMs = 10 * 60 * 1000): boolean {
  const scriptPath = join(process.cwd(), "scripts", scriptFile);
  const timeoutSec = Math.floor(timeoutMs / 1000);
  // timeout -k 15: send SIGTERM at N sec, SIGKILL 15s later — prevents tsx orphans
  const cmd  = `timeout -k 15 ${timeoutSec} npx tsx ${scriptPath}`;
  const t0   = Date.now();
  console.log(`\n▶ [pipeline] ${label}`);
  try {
    execSync(cmd, { stdio: "inherit", env: { ...process.env, TZ: "Asia/Tokyo" } });
    console.log(`✅ [pipeline] ${label} (${Math.round((Date.now() - t0) / 1000)}s)`);
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 200) : String(e);
    console.error(`❌ [pipeline] ${label} FAILED: ${msg}`);
    return false;
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  if (!API_KEY) {
    console.error("ERROR: JQUANTS_API_KEY not set");
    process.exit(1);
  }

  const startMs = Date.now();
  const to   = new Date().toISOString().split("T")[0];
  const from = new Date(Date.now() - DATE_RANGE_DAYS * 86400_000).toISOString().split("T")[0];

  const modeTag = DAILY_MODE ? "[DAILY 7d]" : `[FULL ${DATE_RANGE_DAYS}d]`;
  console.log(`\n${"═".repeat(62)}`);
  console.log(`株価並行同期 ${modeTag}  concurrency=${CONCURRENCY}  batchDelay=${BATCH_DELAY_MS}ms  retry=${MAX_RETRIES}`);
  console.log(`日付範囲: ${from} → ${to}`);
  console.log(`RUN_PIPELINE=${RUN_PIPELINE}  PRICES_ONLY=${PRICES_ONLY}  RETRY_FAILED=${RETRY_FAILED}`);
  console.log("═".repeat(62) + "\n");

  // ── Load target symbols ────────────────────────────────────────────────────
  let stocks = await prisma.stock.findMany({
    select: { id: true, symbol: true },
    orderBy: { symbol: "asc" },
  });

  if (RETRY_FAILED) {
    // Load failure list from today or yesterday
    const candidates = [FAIL_FILE, join(LOG_DIR, `sync-prices-failed-${yesterday}.json`)];
    let failedSymbols: string[] = [];
    for (const f of candidates) {
      if (existsSync(f)) {
        const entries = JSON.parse(readFileSync(f, "utf-8")) as string[];
        failedSymbols = entries.map(e => e.split(":")[0].trim());
        console.log(`重跑失敗銘柄: ${failedSymbols.length} 只  source: ${f}`);
        break;
      }
    }
    if (failedSymbols.length === 0) {
      console.log("失敗ファイルが見つかりません — 終了");
      await prisma.$disconnect();
      return;
    }
    const failSet = new Set(failedSymbols);
    stocks = stocks.filter(s => failSet.has(s.symbol));
  }

  if (LIMIT) {
    stocks = stocks.slice(0, LIMIT);
    console.log(`[TEST] --limit=${LIMIT} 適用`);
  }

  const total = stocks.length;
  if (total === 0) {
    console.log("同期対象銘柄なし — 終了");
    await prisma.$disconnect();
    return;
  }

  const totalBatches = Math.ceil(total / CONCURRENCY);
  const estSec       = totalBatches * (1.5 + BATCH_DELAY_MS / 1000);
  const estMin       = (estSec / 60).toFixed(0);
  console.log(`対象: ${total} 銘柄  バッチ数: ${totalBatches}  推計: ~${estMin}分\n`);

  // ── Phase 1: 並行バッチ同期 ────────────────────────────────────────────────
  const counters: Counters = { ok: 0, skip: 0, err: 0, failedEntries: [] };
  const progressEvery = Math.max(1, Math.floor(totalBatches * 0.05)); // ~5% ごと

  for (let bi = 0; bi < totalBatches; bi++) {
    const batch = stocks.slice(bi * CONCURRENCY, (bi + 1) * CONCURRENCY);
    await Promise.all(batch.map(s => syncWithRetry(s, to, from, counters)));

    // ── Progress log ──────────────────────────────────────────────────────────
    if ((bi + 1) % progressEvery === 0 || bi === totalBatches - 1) {
      const processed = Math.min((bi + 1) * CONCURRENCY, total);
      const pct       = Math.round(processed / total * 100);
      const elSec     = Math.round((Date.now() - startMs) / 1000);
      const etaSec    = elSec > 0 && pct > 0 ? Math.round(elSec / pct * (100 - pct)) : 0;
      const fmt = (s: number) => s < 60 ? `${s}s` : `${Math.floor(s/60)}m${s%60}s`;
      console.log(
        `[${processed}/${total}] ${pct}%  ` +
        `✓${counters.ok} ✗${counters.err} ○${counters.skip}  ` +
        `elapsed:${fmt(elSec)}  ETA:~${fmt(etaSec)}`
      );
    }

    if (bi < totalBatches - 1 && BATCH_DELAY_MS > 0) {
      await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  // ── Phase 1 summary ────────────────────────────────────────────────────────
  const phase1Min = ((Date.now() - startMs) / 60_000).toFixed(1);
  console.log(`\n${"─".repeat(50)}`);
  console.log(`価格同期完了`);
  console.log(`  attempted : ${total}`);
  console.log(`  success   : ${counters.ok}`);
  console.log(`  skipped   : ${counters.skip}  (J-Quants returned no bars)`);
  console.log(`  failed    : ${counters.err}`);
  console.log(`  duration  : ${phase1Min}m`);

  if (counters.failedEntries.length > 0) {
    writeFileSync(FAIL_FILE, JSON.stringify(counters.failedEntries, null, 2), "utf-8");
    console.log(`\n失敗銘柄保存: ${FAIL_FILE}`);
    const show = counters.failedEntries.slice(0, 10);
    show.forEach(e => console.log(`  ✗ ${e}`));
    if (counters.failedEntries.length > 10) {
      console.log(`  ... 他 ${counters.failedEntries.length - 10} 件 → --retry-failed で再実行可能`);
    }
  }

  const priceCount = await prisma.dailyPrice.count();
  console.log(`\nDailyPrice 総計: ${priceCount.toLocaleString()} 条`);
  console.log("─".repeat(50));

  await prisma.$disconnect();

  // ── Phase 2: 下流 AI 評分流水線 ───────────────────────────────────────────
  if (!RUN_PIPELINE) {
    console.log("\n[prices-only / retry-failed] 下流流水線スキップ。終了。");
    return;
  }

  console.log(`\n${"═".repeat(62)}`);
  console.log("価格同期完了 → AI 評分流水線起動");
  console.log("═".repeat(62));

  const computeOk = runPipelineStage("compute-scores.ts",           "AI 評分計算",                90 * 60 * 1000);
  if (computeOk) {
    runPipelineStage("rerank-top500.ts",             "GPT Rerank Top500",           5 * 60 * 60 * 1000);
  } else {
    console.warn("⚠️ compute-scores 失敗 → rerank-top500 スキップ（評分なしの再ランクは無意味）");
  }
  runPipelineStage("create-portfolio-snapshot.ts",   "AI 組合スナップショット生成");
  runPipelineStage("update-ai-signal-stats.ts",      "AI シグナル統計更新");
  runPipelineStage("update-backtest.ts",             "バックテスト更新",            20 * 60 * 1000);
  runPipelineStage("generate-learning-report.ts",    "Learning Engine レポート生成");
  runPipelineStage("data-health-guard.ts",           "データ健全性チェック");

  const totalMin = ((Date.now() - startMs) / 60_000).toFixed(1);
  console.log(`\n${"═".repeat(62)}`);
  console.log(`全工程完了  合計 ${totalMin} 分`);
  console.log("═".repeat(62) + "\n");
}

main().catch(e => {
  console.error("CRASH:", e);
  prisma.$disconnect().finally(() => process.exit(1));
});
