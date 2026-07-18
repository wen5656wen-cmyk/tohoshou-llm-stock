// ── Trading Engine · 决策/复盘时间线（P17-02）─────────────────────────────────
// 统一管理真实持仓的「AI 决策事件」持久化：成交触发(MANUAL_TRADE) + 每日复盘(DAILY_REVIEW)。
// 写入 trade_decision_history（轻量附属表）；不改 user_holdings/user_trades/user_accounts 等核心表。
// 复盘动作单一来源 = lib/decision-engine 的 deriveHoldingAction（与 GET /api/holdings 完全一致）。
import { prisma } from "../prisma";
import { deriveHoldingAction, type PaperPositionInput } from "../decision-engine";
import type { Quote } from "../decision-engine";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type TlAction = "WATCH" | "BUY" | "HOLD" | "ADD" | "REDUCE" | "SELL" | "CLOSED" | "TAKE_PROFIT" | "STOP_LOSS";

export function jstTodayStr(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
// 下次复盘 = 次一交易日（跳过周末；节假日不精确处理，仅作展示提示）。
export function nextReviewStr(fromISO?: string): string {
  const base = fromISO ? new Date(fromISO) : new Date(`${jstTodayStr()}T00:00:00.000Z`);
  const d = new Date(base.getTime());
  do { d.setUTCDate(d.getUTCDate() + 1); } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}

// SELL 卖出原因 → i18n 依据键
const SELL_RK: Record<string, string> = {
  TAKE_PROFIT: "dv.tl.rk.sellTp", STOP_LOSS: "dv.tl.rk.sellStop",
  MANUAL: "dv.tl.rk.sellManual", REBALANCE: "dv.tl.rk.sellRebal", OTHER: "dv.tl.rk.sellOther",
};

export interface ManualDecisionInput {
  symbol: string; name: string; action: TlAction;
  price?: number | null; returnPct?: number | null; aiScore?: number | null;
  reasonKey?: string | null; reasonText?: string | null; rsi?: number | null; maTrend?: string | null;
  outcome?: "HIT" | "MISS" | null; holdingDays?: number | null; realizedPnl?: number | null;
  tradeDate?: Date | null;
}

// 成交触发：买入/加仓/减仓/卖出/清仓 时追加一条时间线（不重复维护，附属记录）。
export async function logManualDecision(input: ManualDecisionInput): Promise<void> {
  const p = prisma as any;
  const reasonKey = input.reasonKey
    ?? (input.action === "BUY" ? "dv.tl.rk.buy" : input.action === "ADD" ? "dv.tl.rk.add" : null);
  try {
    await p.tradeDecisionHistory.create({
      data: {
        symbol: input.symbol, name: input.name, action: input.action, source: "MANUAL_TRADE",
        price: input.price ?? null, returnPct: input.returnPct ?? null, aiScore: input.aiScore ?? null,
        reasonKey, reasonText: input.reasonText ?? null, rsi: input.rsi ?? null, maTrend: input.maTrend ?? null,
        outcome: input.outcome ?? null, holdingDays: input.holdingDays ?? null, realizedPnl: input.realizedPnl ?? null,
        tradeDate: input.tradeDate ?? null,
      },
    });
  } catch (e) {
    // 时间线为附属能力：写失败不得影响主交易流程（买卖已在核心表落库）。
    console.error("[decision-log] logManualDecision", (e as Error).message);
  }
}

// SELL 原因 → 依据键
export function sellReasonKey(reason: string | null | undefined): string {
  return SELL_RK[String(reason ?? "MANUAL")] ?? "dv.tl.rk.sellManual";
}

export interface ReviewInput {
  symbol: string; name: string; avgCost: number;
  openDate?: Date | string | null; // 用于复盘行的 holdingDays（§6）
  quote: Quote | undefined;
  score: { adaptiveScore: number | null; actionRiskLevel: string | null; target1: number | null; stopLoss: number | null; rsi14: number | null; maTrend: string | null; strategyType?: string | null } | null;
}

export type ReviewStatus = "changed" | "skipped" | "failed";
export interface ReviewOutcome {
  symbol: string; status: ReviewStatus;
  prevAction: string | null; newAction: string | null;
  reasonKey: string | null; aiScore: number | null; returnPct: number | null; error?: string;
}

const daysBetween = (a: Date, b: Date) => Math.max(0, Math.round((b.getTime() - a.getTime()) / 86_400_000));

// 单只持仓复盘（§4-§6）：重算动作 → 与最近记录比较。
//  · 动作未变 → status="skipped"，不写 Timeline（§5）。
//  · 动作变化 → status="changed"，追加 Timeline 行（记录 prevAction 由读取时派生）。
//  · 出错 → status="failed"，不影响其它持仓（§10）。
//  · dryRun → 仅计算，不写数据库（§12/§14）。
export async function reviewHolding(input: ReviewInput, dryRun = false): Promise<ReviewOutcome> {
  const p = prisma as any;
  try {
    const price = input.quote?.price ?? null;
    const ret = price != null && input.avgCost > 0 ? (price / input.avgCost - 1) * 100 : null;
    const posInput: PaperPositionInput = {
      symbol: input.symbol, name: input.name, strategyType: input.score?.strategyType ?? null,
      entryPrice: input.avgCost, currentPrice: price, returnPct: ret,
      actionRiskLevel: input.score?.actionRiskLevel ?? null, target1: input.score?.target1 ?? null,
      stopLoss: input.score?.stopLoss ?? null, updatedAt: null,
    };
    const a = deriveHoldingAction(posInput, input.quote);
    const last = await p.tradeDecisionHistory.findFirst({ where: { symbol: input.symbol }, orderBy: { decidedAt: "desc" } });
    const prevAction: string | null = last?.action ?? null;
    const roundedRet = ret != null ? Math.round(ret * 100) / 100 : null;

    // §5：动作未变化 → 跳过（不新增 Timeline；NextReview 为确定性次交易日）。
    if (last && last.action === a.action) {
      return { symbol: input.symbol, status: "skipped", prevAction, newAction: a.action, reasonKey: a.reasonKey, aiScore: input.score?.adaptiveScore ?? null, returnPct: roundedRet };
    }
    if (!dryRun) {
      const hd = input.openDate ? daysBetween(new Date(input.openDate), new Date()) : null;
      await p.tradeDecisionHistory.create({
        data: {
          symbol: input.symbol, name: input.name, action: a.action, source: "DAILY_REVIEW",
          price, returnPct: roundedRet, aiScore: input.score?.adaptiveScore ?? null,
          reasonKey: a.reasonKey, rsi: input.score?.rsi14 ?? null, maTrend: input.score?.maTrend ?? null, holdingDays: hd,
        },
      });
    }
    return { symbol: input.symbol, status: "changed", prevAction, newAction: a.action, reasonKey: a.reasonKey, aiScore: input.score?.adaptiveScore ?? null, returnPct: roundedRet };
  } catch (e) {
    console.error("[decision-log] reviewHolding", input.symbol, (e as Error).message);
    return { symbol: input.symbol, status: "failed", prevAction: null, newAction: null, reasonKey: null, aiScore: null, returnPct: null, error: (e as Error).message };
  }
}

// 兼容旧调用（timeline 懒触发）：返回是否新增了一条复盘行。
export async function runReview(input: ReviewInput): Promise<{ changed: boolean } | null> {
  const r = await reviewHolding(input, false);
  return { changed: r.status === "changed" };
}

export interface TimelineEvent {
  id: number; action: string; prevAction: string | null; source: string; date: string; time: string;
  price: number | null; returnPct: number | null; aiScore: number | null;
  reasonKey: string | null; reasonText: string | null; outcome: string | null;
  holdingDays: number | null; realizedPnl: number | null;
}

// 时间线整形：倒序事件 + 最初依据(首行) + 最新判断(末行) + 下次复盘。
// prevAction（Old Action，§6）= 该事件的前一条事件动作，读取时派生，无需存列。
export function shapeTimeline(rows: any[]): { events: TimelineEvent[]; original: TimelineEvent | null; latest: TimelineEvent | null; nextReview: string } {
  const asc = [...rows].sort((a, b) => new Date(a.decidedAt).getTime() - new Date(b.decidedAt).getTime());
  const events: TimelineEvent[] = asc.map((r, i) => ({
    id: r.id, action: r.action, prevAction: i > 0 ? asc[i - 1].action : null, source: r.source,
    date: new Date(r.decidedAt).toISOString().slice(0, 10),
    time: new Date(r.decidedAt).toISOString().slice(11, 16),
    price: r.price ?? null, returnPct: r.returnPct ?? null, aiScore: r.aiScore ?? null,
    reasonKey: r.reasonKey ?? null, reasonText: r.reasonText ?? null, outcome: r.outcome ?? null,
    holdingDays: r.holdingDays ?? null, realizedPnl: r.realizedPnl ?? null,
  }));
  const original = events.find((e) => e.action === "BUY") ?? events[0] ?? null;
  const latest = events[events.length - 1] ?? null;
  return { events: events.reverse(), original, latest, nextReview: nextReviewStr() };
}
