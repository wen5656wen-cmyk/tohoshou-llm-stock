// ─────────────────────────────────────────────────────────────────────────────
// P26 Phase 3 · T+1 Validation（#6）。读昨日 SHADOW_BUY（生产 DB）→ 真实价格（Python 缓存）
// → 毛/净/滑点/成交/成败 → append-only 落库。成本读 P24 成本模型 config（不重算逻辑，同 SSOT）。
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from "fs";
import { join } from "path";
import type { PrismaClient } from "@prisma/client";
import { runPython, VALIDATION_SCRIPT } from "./adapters";
import { persistValidation, type ValidationRow } from "./storage";
import type { FillState, ValidationFailure } from "./types";
import { logCoreDaily } from "./logging";

interface CostBps {
  base: number; // 往返总 %
  slippage: number; // slippage 分量 %
}
function readBaseCost(): CostBps {
  const cfg = JSON.parse(
    readFileSync(join(process.cwd(), "research", "minute", "cost", "config", "cost_model.json"), "utf-8"),
  ) as { tiers: Record<string, Record<string, number>> };
  const t = cfg.tiers.BASE;
  const total = t.commission_bps + t.tax_bps + t.spread_bps + t.slippage_bps + t.auction_impact_bps;
  return { base: total / 100, slippage: t.slippage_bps / 100 };
}

interface PriceRec {
  refClose: number;
  nextOpen: number;
  nextHigh: number;
  nextDate: string;
}

/** 结算某交易日的 SHADOW_BUY 信号（T+1 开盘）。返回结算笔数。 */
export async function settleValidation(
  db: PrismaClient,
  strategyId: string,
  version: string,
  tradeDate: string,
): Promise<{ settled: number; skipped: number }> {
  const signals = await db.coreDailySignal.findMany({
    where: { strategyId, tradeDate: new Date(tradeDate), decision: "SHADOW_BUY" },
    select: { runId: true, symbol: true },
  });
  if (signals.length === 0) return { settled: 0, skipped: 0 };

  const symbols = signals.map((s) => s.symbol).join(",");
  let prices: Record<string, PriceRec> = {};
  try {
    const out = await runPython(VALIDATION_SCRIPT, [`--date=${tradeDate}`, `--symbols=${symbols}`]);
    prices = JSON.parse(out) as Record<string, PriceRec>;
  } catch {
    logCoreDaily("VALIDATION_PRICE_FAIL", { strategyId, tradeDate });
    return { settled: 0, skipped: signals.length };
  }

  const cost = readBaseCost();
  const validatedAt = new Date();
  const rows: ValidationRow[] = [];
  for (const s of signals) {
    const p = prices[s.symbol];
    if (!p || !p.refClose) continue; // 无次日 → 不可结算（不伪造）
    const gross = ((p.nextOpen - p.refClose) / p.refClose) * 100;
    const net = gross - cost.base;
    const fillState: FillState = p.nextOpen ? "FILLED_FULL" : "FILL_UNCERTAIN";
    const failureReason: ValidationFailure | null =
      net > 0 ? null : gross <= 0 ? "OVERNIGHT_REVERSAL" : "COST_EXCEEDED_EDGE";
    rows.push({
      runId: s.runId, strategyId, strategyVersion: version, tradeDate, symbol: s.symbol,
      refClose: p.refClose, nextOpen: p.nextOpen, grossPct: Number(gross.toFixed(3)),
      slippagePct: cost.slippage, costPct: cost.base, netPct: Number(net.toFixed(3)),
      fillState, success: net > 0, failureReason, validatedAt,
    });
  }
  await persistValidation(db, rows);
  return { settled: rows.length, skipped: signals.length - rows.length };
}
