// ── P15-01D-V · Runtime Ranking 只读验证采样器 ────────────────────────────────
// 只读：仅对 decision-overview API 发 GET(?debug=1)，落本地 reports/p15-01d-validation/。
// **不写数据库、不改生产决策、不新增 Cron**。供真实交易日每 15 分钟采样（人工/循环触发）。
//
// 用法：
//   npx tsx scripts/p15-01d-validate.ts                 # 单次采样（生产 API）
//   npx tsx scripts/p15-01d-validate.ts --n=16 --interval=900   # 一段会话内每 15 分钟采 16 次
//   URL 覆盖：--url=https://aitohoshou.com
//
// A 组基线 = 当日首次采样时冻结的 Runtime Top10（当日开盘名单）；B 组 = 每次采样的 Runtime Top10。
// 前瞻收益（30/60min/收盘）由后续分析步骤基于本文件记录的价格序列计算，本采样器只落原始快照。

/* eslint-disable @typescript-eslint/no-explicit-any */ // 只读采样器，消费松散 API JSON
import * as fs from "fs";
import * as path from "path";

const ARGS = new Map(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? "1"] as [string, string]; }));
const BASE_URL = ARGS.get("url") || "https://aitohoshou.com";
const N = parseInt(ARGS.get("n") || "1", 10);
const INTERVAL_S = parseInt(ARGS.get("interval") || "900", 10);
const OUT_DIR = path.join(process.cwd(), "reports", "p15-01d-validation");

function jstNow() {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const t = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date());
  return { date: s, time: t };
}

async function sampleOnce() {
  const { date, time } = jstNow();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const t0 = Date.now();
  let body: any = null; let httpMs = 0; let httpErr: string | null = null;
  try {
    const r = await fetch(`${BASE_URL}/api/admin/decision-overview?debug=1`, { headers: { "cache-control": "no-cache" } });
    httpMs = Date.now() - t0;
    body = await r.json();
    if (!r.ok || body?.ok === false) httpErr = `status ${r.status} / ${body?.error ?? ""}`;
  } catch (e) { httpErr = (e as Error).message; httpMs = Date.now() - t0; }

  const picks = [...(body?.executeNow ?? []), ...(body?.waitList ?? []), ...(body?.backups ?? [])];
  const top10 = picks.filter((p: any) => (p.runtimeRank ?? 99) <= 10);

  const record = {
    ts: new Date(t0).toISOString(), jstDate: date, jstTime: time,
    httpErr, httpLatencyMs: httpMs, apiLatencyMs: body?.apiLatencyMs ?? null,
    cached: body?.cached ?? false,
    marketPhase: body?.marketPhase ?? null, tradingDay: body?.tradingDay ?? null,
    regime: body?.marketContext?.regime ?? null,
    quoteSource: body?.freshness?.quoteSource ?? null, stale: body?.freshness?.stale ?? null,
    globalAction: body?.globalDecision?.action ?? null, isExecutable: body?.globalDecision?.isExecutable ?? null,
    blockedReason: body?.globalDecision?.blockedReasonKey ?? null, confidence: body?.globalDecision?.confidence ?? null,
    turnover: body?.runtime?.turnover ?? null, leavers: (body?.runtime?.leavers ?? []).length,
    leaversDetail: body?.runtime?.leavers ?? [],
    debugStats: body?._debugStats ?? null,
    top10: top10.map((p: any) => ({
      symbol: p.symbol, runtimeRank: p.runtimeRank, baseRank: p._debug?.baseRank ?? null,
      previousRank: p.previousRank, rankChange: p.rankChange, isNew: p.isNew,
      adaptiveScore: p._debug?.adaptiveScore ?? p.aiScore ?? null, runtimeScore: p._debug?.runtimeScore ?? null,
      runtimeAdjustment: p._debug?.runtimeAdjustment ?? null,
      currentPrice: p.currentPrice, entryLow: p.buyRangeLow, entryHigh: p.buyRangeHigh,
      dayChangePct: p.changePct, volumeRatio: p._debug?.volumeRatio ?? null, negNews: p._debug?.negNews ?? null,
      action: p.action, replaceReason: p.replaceReasonKey, enterTime: p.enterTime, quoteSource: p.quoteSource,
    })),
  };

  // A 组基线：当日首次采样冻结
  const baselineFile = path.join(OUT_DIR, `baseline-${date}.json`);
  if (!fs.existsSync(baselineFile) && !httpErr && top10.length) {
    fs.writeFileSync(baselineFile, JSON.stringify({ jstDate: date, capturedAt: record.ts, jstTime: time, top10: record.top10 }, null, 2));
    console.log(`[A组基线] 冻结当日开盘 Runtime Top10 → ${baselineFile}`);
  }

  const outFile = path.join(OUT_DIR, `${date}.jsonl`);
  fs.appendFileSync(outFile, JSON.stringify(record) + "\n");
  console.log(`[采样] ${date} ${time} JST · phase=${record.marketPhase} regime=${record.regime} quote=${record.quoteSource} stale=${record.stale} action=${record.globalAction} churn=${record.turnover?.churnPct ?? "—"}% lat=${record.apiLatencyMs ?? record.httpLatencyMs}ms top10=${top10.length} → ${outFile}`);
  return record;
}

(async () => {
  console.log(`P15-01D-V 采样器 · URL=${BASE_URL} · N=${N} interval=${INTERVAL_S}s · 只读(不写DB/不改决策)`);
  for (let i = 0; i < N; i++) {
    await sampleOnce();
    if (i < N - 1) await new Promise((r) => setTimeout(r, INTERVAL_S * 1000));
  }
  console.log("完成。");
})();
