/**
 * Market Regime — trend classification from the TOPIX moving-average stack. Pure.
 * Independent: consumes a TOPIX close series (newest-first) only.
 *
 * ⚠️ 量纲断裂防护（2026-07-21 · P2-020 关联修复）
 * `GlobalMarket.topix` 在 2026-03-30 发生量纲断裂（指数 3827 → ETF 代理 376.4，见
 * docs/KNOWN_ISSUES.md P2-020）。断点之后的 120 日窗口会跨过断裂点，把旧量纲数值混进
 * 均线：实测 2026-07-20 收盘 407.9 而 ma120 = 1431.96（现价的 3.5 倍，指数均线不可能）。
 * 后果：5 条件里的 `px > ma120` 与 `ma60 > ma120` 被**硬钉为 false**，trendScore 从 −0.333
 * 被压到 −0.6 → regimeScore −0.33 → 误判 BEAR，进而触发 global-decision 的
 * `regime === "BEAR" → WAIT`、Top200 runtime −5 全局降分、指数风险 HIGH。
 *
 * 修法：先把序列截断到「量纲连续段」（从最新往回，遇到相邻交易日 ±50% 以上的跳变即停），
 * 窗口不足的均线返回 null，trendScore **只用可用条件**计算并标记 degraded。
 * 断点后满 120 个交易日会自动恢复满窗口，无需人工干预（自愈）。
 */
export type TrendResult = {
  ma20: number | null;
  ma60: number | null;
  ma120: number | null;
  trendScore: number | null; // -1 (down) .. +1 (up)
  /** 可用的量纲连续样本数（截断后） */
  usableDays?: number;
  /** true = 因量纲断裂/样本不足，长周期均线缺失，trendScore 由可用条件计算 */
  degraded?: boolean;
};

/** 相邻交易日超过 ±50% 视为量纲断裂/数据错误，而非真实行情。 */
const MAX_STEP_RATIO = 1.5;
/** 少于该样本数则不出趋势结论（宁可无结论，不可给错结论）。 */
const MIN_USABLE = 20;

function sma(closesDesc: number[], n: number): number | null {
  if (closesDesc.length < n) return null;
  return closesDesc.slice(0, n).reduce((a, b) => a + b, 0) / n;
}

/** 从最新往回取「量纲连续」的一段：遇到不可能的跳变即截断。 */
export function usableSeries(closesDesc: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < closesDesc.length; i++) {
    const c = closesDesc[i];
    if (!Number.isFinite(c) || c <= 0) break;
    if (i > 0) {
      const r = c / closesDesc[i - 1];
      if (r > MAX_STEP_RATIO || r < 1 / MAX_STEP_RATIO) break; // 量纲断裂点
    }
    out.push(c);
  }
  return out;
}

/** @param closesDesc TOPIX closes newest-first (index 0 = the as-of date). */
export function classifyTrend(closesDesc: number[]): TrendResult {
  const s = usableSeries(closesDesc);
  const px = s[0] ?? null;
  const ma20 = sma(s, 20);
  const ma60 = sma(s, 60);
  const ma120 = sma(s, 120);
  const degraded = ma60 == null || ma120 == null;

  if (px == null || ma20 == null || s.length < MIN_USABLE) {
    return { ma20, ma60, ma120, trendScore: null, usableDays: s.length, degraded: true };
  }

  // MA stack alignment，**只统计有均线可比的条件**（缺失的长周期均线不计入分母，
  // 避免把「数据不足」当成「趋势向下」）。
  const conds: boolean[] = [px > ma20];
  if (ma60 != null) conds.push(px > ma60, ma20 > ma60);
  if (ma120 != null) conds.push(px > ma120);
  if (ma60 != null && ma120 != null) conds.push(ma60 > ma120);

  const t = conds.filter(Boolean).length;
  const trendScore = Math.round(((2 * t) / conds.length - 1) * 1000) / 1000;
  return { ma20, ma60, ma120, trendScore, usableDays: s.length, degraded };
}
