// ── 决策结果评估 · 单一来源（P13-DECISION-07）──────────────────────────────────
// 复盘(Review)与老板驾驶舱(Executive Dashboard)共用的「已实现结果」纯函数。
// 复权收盘价基准、严格防前视（D 之后交易日 < 5 → verifying，绝不提前判定成败）。
// 展示层派生，不改任何评分/推荐/生成逻辑。

export const HOLD_DAYS = 5; // 一周 ≈ 5 个交易日

export interface Bar { date: string; open?: number; high?: number; low?: number; close: number; adjClose?: number | null }

export type Outcome = {
  status: "verifying" | "done";
  daysElapsed: number;
  weekReturn: number | null;
  day1: number | null;
  day3: number | null;
  maxDD: number | null;
  holdDays: number | null;
  actualHighRaw: number | null;
  reachedTarget: boolean | null;
  reachedT2: boolean | null;
  hitStop: boolean | null;
  stars: number | null;
  review: string;
};

/** 由已实现收益派生星级（客观复盘）：≥+10% 5★ / ≥+5% 4★ / ≥0 3★ / ≥−5% 2★ / else 1★ */
export const starsOf = (r: number): number => (r >= 10 ? 5 : r >= 5 ? 4 : r >= 0 ? 3 : r >= -5 ? 2 : 1);

/** 用复权序列计算推荐日之后的真实表现；交易日不足 → verifying（绝不提前判定成败）。 */
export function evaluateOutcome(bars: Bar[], d: string, target: number | null, target2: number | null, stop: number | null): Outcome | null {
  const asc = [...bars].sort((a, b) => (a.date < b.date ? -1 : 1));
  const i = asc.findIndex((b) => b.date === d);
  if (i < 0) return null; // 推荐日不在序列中（停牌等）→ 无法验证
  const base = asc[i];
  const baseAdj = base.adjClose ?? base.close;
  if (!(baseAdj > 0)) return null;
  const ratio = base.close > 0 ? baseAdj / base.close : 1; // D 日复权比例

  const after = asc.slice(i + 1); // 严格只用 D 之后已发生的 bar
  if (after.length < HOLD_DAYS) {
    return { status: "verifying", daysElapsed: after.length, weekReturn: null, day1: null, day3: null, maxDD: null, holdDays: null, actualHighRaw: null, reachedTarget: null, reachedT2: null, hitStop: null, stars: null, review: "" };
  }
  const win = after.slice(0, HOLD_DAYS);
  const adjC = (b: Bar) => b.adjClose ?? b.close;
  const weekReturn = (adjC(win[HOLD_DAYS - 1]) / baseAdj - 1) * 100;
  const day1 = (adjC(win[0]) / baseAdj - 1) * 100;
  const day3 = (adjC(win[2]) / baseAdj - 1) * 100;
  const adjOf = (b: Bar, v: number | undefined) => (v != null && b.close > 0 ? v * ((b.adjClose ?? b.close) / b.close) : (b.adjClose ?? b.close));
  const actualHigh = Math.max(...win.map((b) => adjOf(b, b.high)));
  const actualLow = Math.min(...win.map((b) => adjOf(b, b.low)));
  const maxDD = (actualLow / baseAdj - 1) * 100;

  const targetAdj = target != null ? target * ratio : null;
  const target2Adj = target2 != null ? target2 * ratio : null;
  const stopAdj = stop != null ? stop * ratio : null;
  const reachedTarget = targetAdj != null ? actualHigh >= targetAdj : null;
  const reachedT2 = target2Adj != null ? actualHigh >= target2Adj : null;
  const hitStop = stopAdj != null ? actualLow <= stopAdj : null;
  let holdDays = HOLD_DAYS;
  if (targetAdj != null) { const idx = win.findIndex((b) => adjOf(b, b.high) >= targetAdj); holdDays = idx >= 0 ? idx + 1 : HOLD_DAYS; }

  const review = reachedTarget
    ? `${HOLD_DAYS} 个交易日内触及目标价，达标`
    : hitStop
    ? `${HOLD_DAYS} 个交易日内触及止损价`
    : weekReturn >= 0
    ? "未触及目标价，但收于正收益"
    : "未触及目标价，收于负收益";

  return { status: "done", daysElapsed: after.length, weekReturn, day1, day3, maxDD, holdDays, actualHighRaw: ratio > 0 ? actualHigh / ratio : actualHigh, reachedTarget, reachedT2, hitStop, stars: starsOf(weekReturn), review };
}

export type OutcomeSummary = { n: number; successRate: number; avgReturn: number; t1Rate: number; t2Rate: number; avgDD: number; stopRate: number };
/** 已验证(done)结果统计；无 done → null（调用方显示「等待验证」，禁止伪造）。 */
export function summarizeOutcomes(list: (Outcome | null | undefined)[]): OutcomeSummary | null {
  const done = list.filter((o): o is Outcome => !!o && o.status === "done");
  const n = done.length;
  if (!n) return null;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return {
    n,
    successRate: (done.filter((o) => (o.weekReturn ?? 0) >= 0).length / n) * 100,
    avgReturn: mean(done.map((o) => o.weekReturn ?? 0)),
    t1Rate: (done.filter((o) => o.reachedTarget).length / n) * 100,
    t2Rate: (done.filter((o) => o.reachedT2).length / n) * 100,
    avgDD: mean(done.map((o) => o.maxDD ?? 0)),
    stopRate: (done.filter((o) => o.hitStop).length / n) * 100,
  };
}
