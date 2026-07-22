#!/usr/bin/env npx tsx
/**
 * 株価並行同期（v3 — レート制限対応 + 有限並行キュー + 自動後続流水線）
 *
 * Phase 1: J-Quants から OHLCV を並行取得 → DailyPrice / Stock に upsert
 * Phase 2: 価格同期完了後、AI 評分流水線を自動実行（--prices-only 時はスキップ）
 *
 * P0 修復（v3, 2026-07-01）— J-Quants レート制限:
 *   旧設定（concurrency=5, batch delay=200ms）は実測で持続 ~25 req/秒相当となり、
 *   J-Quants API（AWS API Gateway usage plan, 429 "Rate limit exceeded"）を
 *   3日連続でほぼ全滅させた（3700銘柄中 3597〜3598 件が 429、成功は約119件のみ。
 *   2026-06-28/06-29/06-30 の sync-prices-failed-*.json で確認）。
 *   本番で直接検証：持続的な複数バッチ送信では低い並行数・間隔でも 429 が発生し、
 *   トラフィックを完全に止めてから約60〜70秒で回復することを確認。単発の
 *   小規模バースト（20並列など）は単独では問題ないが、3700銘柄分の持続的な
 *   送信では逃げ場がない。
 *
 *   修正：全ワーカー共有のグローバル最小間隔ゲート（SYNC_MIN_INTERVAL_MS）で
 *   実際の発火タイミングを一本化し、並行数を下げても実効レートは変わらない
 *   ようにした。429 を検知したら全ワーカー共通のクールダウン（cooldownUntil）
 *   を設定し、以降のリクエストは自動的に待機してから再開する。
 *
 * 並行設定（環境変数で上書き可）:
 *   SYNC_CONCURRENCY    デフォルト 2（並行数。実効レートは MIN_INTERVAL が支配的）
 *   SYNC_BATCH_DELAY_MS デフォルト 200ms（バッチ間隔、MIN_INTERVAL と併用）
 *   SYNC_MIN_INTERVAL_MS デフォルト 500ms（全リクエスト共有の最小発火間隔）
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
import { recordPhase } from "../lib/pipeline-tracker";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hasCorporateAction, computeAdjCloseUpdates } from "../lib/split-adjust";

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
const CONCURRENCY       = Math.max(1, parseInt(process.env.SYNC_CONCURRENCY     ?? "2"));
const BATCH_DELAY_MS    = Math.max(0, parseInt(process.env.SYNC_BATCH_DELAY_MS  ?? "200"));
const MIN_INTERVAL_MS   = Math.max(0, parseInt(process.env.SYNC_MIN_INTERVAL_MS ?? "500"));
const MAX_RETRIES       = 3; // 最大 3 回リトライ（初回 + 3 = 計 4 アテンプト。429 はクールダウンが本体）

// ── P21-R1 · 価格同期レジリエンス（覆盖率韧性补救）─────────────────────────────
// 收盘同步遭大量 429 导致覆盖率不足时，**当轮**自动延迟 retry → 重触发评分，
// 不再依赖次日 06:00 全量同步才能恢复（那是 2026-07-21 18.7% 事故的恢复路径）。
//
// COVERAGE_THRESHOLD 刻意**沿用 data-health-guard 的 80%**（single source of truth）：
//   只要会触发 health CRITICAL，就会先自动 retry 补救，逻辑闭环，不会出现
//   「同步判达标、health 判 CRITICAL」的分裂。
// 延迟递增（round × BASE）是为了让 J-Quants 短窗配额彻底恢复 —— 实测停流约
//   60~70s 恢复，故 BASE 默认 120s 留足余量。
const COVERAGE_THRESHOLD  = parseFloat(process.env.SYNC_COVERAGE_THRESHOLD    ?? "0.80");
const RESILIENCE_ROUNDS   = Math.max(0, parseInt(process.env.SYNC_RESILIENCE_ROUNDS    ?? "2"));
const RETRY_BASE_DELAY_MS = Math.max(0, parseInt(process.env.SYNC_RETRY_BASE_DELAY_MS  ?? "120000"));

// ── Global rate-limit gate (shared across all concurrent workers) ──────────────
// Every outgoing request passes through here first. This makes the *effective*
// throughput independent of CONCURRENCY — raising concurrency only overlaps
// network latency, it does not increase request rate, because every worker
// waits on the same shared clock.
let nextAllowedAt  = 0;     // timestamp of the earliest the next request may fire
let cooldownUntil  = 0;     // set after a 429 — all requests pause until this passes
let rateLimitHits  = 0;

async function throttleGate(): Promise<void> {
  const now1 = Date.now();
  if (cooldownUntil > now1) {
    await new Promise(r => setTimeout(r, cooldownUntil - now1));
  }
  const now2  = Date.now();
  const fireAt = Math.max(now2, nextAllowedAt);
  nextAllowedAt = fireAt + MIN_INTERVAL_MS;
  if (fireAt > now2) {
    await new Promise(r => setTimeout(r, fireAt - now2));
  }
}

class RateLimitError extends Error {}

// ── Failure categorization (for diagnostics) ────────────────────────────────────
type FailCategory = "rate_limit" | "timeout" | "symbol_format" | "db_write_failed" | "api_error" | "unknown";

function categorize(message: string): FailCategory {
  if (/^429\b/.test(message) || /rate limit/i.test(message)) return "rate_limit";
  if (/AbortError|timeout/i.test(message)) return "timeout";
  if (/prisma|P20\d\d|constraint|column|relation/i.test(message)) return "db_write_failed";
  if (/^4\d\d\b/.test(message) && /code|symbol|invalid/i.test(message)) return "symbol_format";
  if (/^[45]\d\d\b/.test(message)) return "api_error";
  return "unknown";
}

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
  // Daily adjustment factor (1.0 normally; = split ratio on the ex-date, e.g.
  // 0.3333 for a 1:3 split). A value ≠ 1 signals a corporate action, which
  // means J-Quants has just retroactively re-adjusted the ENTIRE AdjC history.
  AdjFactor?: number;
};

// Corporate-action refetch reaches back far enough to cover the full stored
// history so every pre-split adjClose gets corrected in one pass.
const CORP_ACTION_LOOKBACK_DAYS = 1000;

const FETCH_TIMEOUT_MS = 30_000; // 30s per request

// ── fetchBars ─────────────────────────────────────────────────────────────────
async function fetchBars(code5: string, from: string, to: string): Promise<Bar[]> {
  const url = `${BASE}/equities/bars/daily?code=${code5}&dateFrom=${from}&dateTo=${to}`;

  async function doFetch(u: string): Promise<{ data: Bar[]; pagination_key?: string }> {
    await throttleGate();
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(u, { headers: { "x-api-key": API_KEY }, signal: ac.signal });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        if (res.status === 429) {
          // Shared cooldown: every worker backs off, not just this one.
          // Empirically the API recovers within ~60-70s of zero traffic once
          // the short-window quota is exhausted — 90s cooldown gives margin.
          rateLimitHits++;
          cooldownUntil = Date.now() + 90_000;
          throw new RateLimitError(`429 ${body.slice(0, 100)}`);
        }
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

// ── Corporate-action handler ────────────────────────────────────────────────
// When a split/reverse-split is detected in the freshly-synced window, J-Quants
// has already back-adjusted its whole AdjC history. But createMany({skipDuplicates})
// never overwrites the pre-split rows we already stored, so their adjClose stays
// stale (== old raw close) and produces a fake cliff in every adjClose-based
// indicator. Here we re-fetch the full history and overwrite adjClose on exactly
// the rows whose stored value no longer matches the (correctly adjusted) AdjC.
// Splits are rare, so this deep refetch runs seldom.
async function refreshAdjCloseFullHistory(
  stock: { id: number; symbol: string },
  to: string,
): Promise<number> {
  const longFrom = new Date(Date.now() - CORP_ACTION_LOOKBACK_DAYS * 86400_000)
    .toISOString().split("T")[0];
  const bars = await fetchBars(toCode5(stock.symbol), longFrom, to);
  const fresh = bars
    .filter(b => b.Date && b.C)
    .map(b => ({
      date:     new Date(b.Date).toISOString().split("T")[0],
      close:    b.C,
      adjClose: b.AdjC ?? b.C,
    }));
  if (fresh.length === 0) return 0;

  const stored = await prisma.dailyPrice.findMany({
    where: { symbol: stock.symbol },
    select: { date: true, adjClose: true },
  });
  const storedMapped = stored.map(s => ({
    date:     s.date.toISOString().split("T")[0],
    adjClose: s.adjClose,
  }));

  const updates = computeAdjCloseUpdates(storedMapped, fresh);
  // Apply in small concurrent chunks (keyed by symbol+date via updateMany).
  const CHUNK = 50;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const slice = updates.slice(i, i + CHUNK);
    await Promise.all(slice.map(u =>
      prisma.dailyPrice.updateMany({
        where: { symbol: stock.symbol, date: new Date(u.date) },
        data:  { adjClose: u.adjClose },
      }),
    ));
  }
  return updates.length;
}

// ── syncPrices ───────────────────────────────────────────────────────────────
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

  // Corporate action in this window → repair stale historical adjClose.
  if (hasCorporateAction(valid.map(b => ({ adjFactor: b.AdjFactor })))) {
    try {
      const fixed = await refreshAdjCloseFullHistory(stock, to);
      console.log(`  ⟳ ${stock.symbol}: corporate action detected → adjClose refreshed on ${fixed} historical row(s)`);
    } catch (e) {
      console.warn(`  ⚠️ ${stock.symbol}: adjClose refresh failed: ${e instanceof Error ? e.message : e}`);
    }
  }

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
      const isRateLimit = e instanceof RateLimitError;
      lastErr = (e instanceof Error ? e.message : String(e)).slice(0, 80);
      if (attempt <= MAX_RETRIES) {
        // Rate-limit retries rely mainly on the shared throttleGate cooldown
        // (set in doFetch) — a small extra per-attempt buffer here just
        // avoids every worker retrying in exact lockstep.
        const backoff = isRateLimit ? 2000 * attempt : 500 * attempt;
        await new Promise(r => setTimeout(r, backoff));
      }
    }
  }
  counters.err++;
  counters.failedEntries.push(`${stock.symbol}: ${lastErr}`);
}

// ── Pipeline stage runner (sync-all-prices はすでに子プロセス内なので execSync OK) ──
// ── 覆盖率計算（data-health-guard と**完全同一口径**。ズレると判定が割れる）──────
// 分母 = stock.count()、分子 = 「今日JST より前の最新 date」の DailyPrice 行数。
type Coverage = { pct: number; rows: number; total: number; date: string };
async function computeCoverage(): Promise<Coverage> {
  const nowJst   = new Date(Date.now() + 9 * 3600 * 1000);
  const todayJst = new Date(Date.UTC(nowJst.getUTCFullYear(), nowJst.getUTCMonth(), nowJst.getUTCDate()));
  const last  = await prisma.dailyPrice.findFirst({
    where: { date: { lt: todayJst } }, orderBy: { date: "desc" }, select: { date: true },
  });
  const total = await prisma.stock.count();
  if (!last || total === 0) return { pct: 100, rows: 0, total, date: "none" };
  const rows = await prisma.dailyPrice.count({ where: { date: last.date } });
  return { pct: (rows / total) * 100, rows, total, date: last.date.toISOString().slice(0, 10) };
}

// ── P21-R1 · 覆盖率韧性补救 ──────────────────────────────────────────────────
// Phase1 直後・Phase2 前に呼ぶ。覆盖率 < 閾値なら、失敗リストのみを対象に
// 延迟 retry を最大 RESILIENCE_ROUNDS 回。復旧すれば正常に、ダメなら告警を残して
// **降級で Phase2 に進む**（ユーザー裁定：毎日必ず評分を出す／残欠は health/告警で明示）。
//
// 告警渠道について：本コードベースに LINE 送信の実装は**存在しない**（ドキュメント先行）。
// よって告警は実在する可観測面に落とす —— logs/sync-alert-<date>.json ＋ pipeline-tracker
// の FAILED フェーズ（Mission Control 今日簡報が読む）＋ data-health-guard は既に
// 低覆盖率を CRITICAL とする。嘘の「LINE 送信済み」は出さない。
async function resilienceRecover(
  stocks: { id: number; symbol: string }[],
  to: string,
  from: string,
  counters: Counters,
): Promise<Coverage & { rounds: number; recovered: boolean; remainingFailed: number }> {
  const gateT0 = Date.now();
  let cov = await computeCoverage();
  const thresholdPct = COVERAGE_THRESHOLD * 100;
  console.log(`\n${"─".repeat(50)}`);
  console.log(`覆盖率チェック: ${cov.pct.toFixed(1)}% (${cov.rows}/${cov.total}) on ${cov.date}  閾値 ${thresholdPct}%`);

  let failedSymbols = counters.failedEntries.map(e => e.split(":")[0].trim());
  let round = 0;
  while (cov.pct < thresholdPct && failedSymbols.length > 0 && round < RESILIENCE_ROUNDS) {
    round++;
    const delayMs = RETRY_BASE_DELAY_MS * round; // 递增：让 429 短窗配额彻底恢复
    console.log(
      `\n⚠️ 覆盖率 ${cov.pct.toFixed(1)}% < ${thresholdPct}% — ${Math.round(delayMs / 1000)}s 遅延後に自動 retry` +
      `（第 ${round}/${RESILIENCE_ROUNDS} 轮 · 失敗 ${failedSymbols.length} 只）`
    );
    await new Promise(r => setTimeout(r, delayMs));

    const failSet = new Set(failedSymbols);
    const targets = stocks.filter(s => failSet.has(s.symbol));
    const rc: Counters = { ok: 0, skip: 0, err: 0, failedEntries: [] };
    const tb = Math.ceil(targets.length / CONCURRENCY);
    for (let bi = 0; bi < tb; bi++) {
      const batch = targets.slice(bi * CONCURRENCY, (bi + 1) * CONCURRENCY);
      await Promise.all(batch.map(s => syncWithRetry(s, to, from, rc))); // 幂等：createMany skipDuplicates
      if (bi < tb - 1 && BATCH_DELAY_MS > 0) await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
    }
    console.log(`  retry 第 ${round} 轮完了: ✓${rc.ok} ○${rc.skip} ✗${rc.err}`);
    failedSymbols = rc.failedEntries.map(e => e.split(":")[0].trim());
    cov = await computeCoverage();
    console.log(`  → 覆盖率 ${cov.pct.toFixed(1)}% (${cov.rows}/${cov.total})`);
  }

  const recovered = cov.pct >= thresholdPct;
  const result = { ...cov, rounds: round, recovered, remainingFailed: failedSymbols.length };

  if (round === 0) {
    console.log(`✅ 覆盖率 ${cov.pct.toFixed(1)}% ≥ ${thresholdPct}% — 补救不要`);
    return result;
  }

  const finishedAt = new Date();
  if (recovered) {
    console.log(`\n✅ 韧性补救成功：${round} 轮 retry 後、覆盖率 ${cov.pct.toFixed(1)}% に回復`);
    recordPhase({
      phase: "price-sync-resilience", label: `価格覆盖率 韧性补救（${round}轮で回復）`, source: "phase2",
      startedAt: new Date(gateT0).toISOString(), finishedAt: finishedAt.toISOString(),
      durationMs: Date.now() - gateT0, status: "SUCCESS", error: null,
    });
  } else {
    // 告警：残欠のまま降級で Phase2 に進む。実在の可観測面にのみ記録。
    const msg =
      `価格覆盖率 ${cov.pct.toFixed(1)}% (${cov.rows}/${cov.total}) が閾値 ${thresholdPct}% を下回り、` +
      `${round} 轮の遅延 retry でも回復せず（残 ${failedSymbols.length} 只）。` +
      `評分流水線は降級実行 —— 推奨は残欠データに基づく。`;
    const alertFile = join(LOG_DIR, `sync-alert-${today}.json`);
    writeFileSync(alertFile, JSON.stringify({
      ts: finishedAt.toISOString(), type: "PRICE_COVERAGE_LOW",
      coveragePct: Number(cov.pct.toFixed(1)), rows: cov.rows, total: cov.total, tradingDate: cov.date,
      thresholdPct, retryRounds: round, remainingFailed: failedSymbols.length,
      rateLimitHits, message: msg,
    }, null, 2), "utf-8");
    console.error(`\n🚨 告警: ${msg}`);
    console.error(`   告警文件: ${alertFile}`);
    recordPhase({
      phase: "price-sync-resilience", label: "価格覆盖率 韧性补救（未回復・降級）", source: "phase2",
      startedAt: new Date(gateT0).toISOString(), finishedAt: finishedAt.toISOString(),
      durationMs: Date.now() - gateT0, status: "FAILED", error: msg,
    });
  }
  return result;
}

function runPipelineStage(scriptFile: string, label: string, timeoutMs = 10 * 60 * 1000): boolean {
  const phase = scriptFile.replace(/\.ts$/, ""); // 与 cron fallback 幂等判定同名
  const scriptPath = join(process.cwd(), "scripts", scriptFile);
  const timeoutSec = Math.floor(timeoutMs / 1000);
  // timeout -k 15: send SIGTERM at N sec, SIGKILL 15s later — prevents tsx orphans
  const cmd  = `timeout -k 15 ${timeoutSec} npx tsx ${scriptPath}`;
  const t0   = Date.now();
  console.log(`\n▶ [pipeline] ${label}`);
  let ok = false;
  let err: string | null = null;
  try {
    execSync(cmd, { stdio: "inherit", env: { ...process.env, TZ: "Asia/Tokyo" } });
    ok = true;
    console.log(`✅ [pipeline] ${label} (${Math.round((Date.now() - t0) / 1000)}s)`);
  } catch (e) {
    err = e instanceof Error ? e.message.slice(0, 200) : String(e);
    console.error(`❌ [pipeline] ${label} FAILED: ${err}`);
  }
  // P5.5：记录 Phase2 阶段完成，供 07:30 fallback 幂等跳过（R3 修复）+ Pipeline Timeline。
  recordPhase({
    phase, label, source: "phase2",
    startedAt: new Date(t0).toISOString(), finishedAt: new Date().toISOString(),
    durationMs: Date.now() - t0, status: ok ? "SUCCESS" : "FAILED", error: err,
  });
  return ok;
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
  // Effective rate is dominated by the shared MIN_INTERVAL_MS gate, not by
  // CONCURRENCY/BATCH_DELAY_MS alone (see throttleGate()).
  const estSec       = total * (MIN_INTERVAL_MS / 1000);
  const estMin       = (estSec / 60).toFixed(0);
  console.log(`対象: ${total} 銘柄  バッチ数: ${totalBatches}  minInterval: ${MIN_INTERVAL_MS}ms  推計: ~${estMin}分\n`);

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
  console.log(`  rate-limit hits (incl. retries): ${rateLimitHits}`);
  console.log(`  duration  : ${phase1Min}m`);

  if (counters.failedEntries.length > 0) {
    writeFileSync(FAIL_FILE, JSON.stringify(counters.failedEntries, null, 2), "utf-8");
    console.log(`\n失敗銘柄保存: ${FAIL_FILE}`);

    // ── Failure category breakdown (P0 diagnostic requirement) ───────────────
    const byCategory = new Map<FailCategory, number>();
    for (const entry of counters.failedEntries) {
      const msg = entry.slice(entry.indexOf(":") + 1).trim();
      const cat = categorize(msg);
      byCategory.set(cat, (byCategory.get(cat) ?? 0) + 1);
    }
    console.log(`\n失敗原因分類:`);
    for (const [cat, n] of [...byCategory.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${cat.padEnd(16)} ${n}`);
    }
    const summaryFile = join(LOG_DIR, `sync-prices-failed-${today}-summary.json`);
    writeFileSync(summaryFile, JSON.stringify(Object.fromEntries(byCategory), null, 2), "utf-8");

    const show = counters.failedEntries.slice(0, 10);
    show.forEach(e => console.log(`  ✗ ${e}`));
    if (counters.failedEntries.length > 10) {
      console.log(`  ... 他 ${counters.failedEntries.length - 10} 件 → --retry-failed で再実行可能`);
    }
  }

  const priceCount = await prisma.dailyPrice.count();
  console.log(`\nDailyPrice 総計: ${priceCount.toLocaleString()} 条`);
  console.log("─".repeat(50));

  // ── Phase 1.5: 覆盖率韧性补救（P21-R1）─────────────────────────────────────
  // 完整流程（06:00）のみ。--retry-failed / --prices-only は補救自体が目的なので
  // 再帰させない（RUN_PIPELINE がその境界）。
  if (RUN_PIPELINE) {
    await resilienceRecover(stocks, to, from, counters);
  }

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
