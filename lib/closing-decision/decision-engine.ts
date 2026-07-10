// ── TOHOSHOU AI · Closing Decision · Decision Engine（P6-T12）────────────────
// 每天恰好输出一个结论：BUY_TODAY / WATCH_ONLY / STAY_CASH。
// 判断依据（全部来自当日实时快照，纯函数 · 可审计）：
//   ① 大盘趋势 regime      ② Top20 平均 AI 分   ③ 平均风险
//   ④ 买区命中率           ⑤ 新闻风险            ⑥ 已突破买区比例（追高市）
//   ⑦ 可建仓合格候选数     ⑧ 波动率
// **纯函数 · 只读 · 不影响任何评分/推荐。**

import type { DecisionContext, DecisionOutcome, Verdict } from "./types";

/** 机会分权重与门槛（可调）。 */
export const DECISION_CONFIG = {
  buyTodayScore: 3, // opportunity ≥ 此 → BUY_TODAY
  stayCashScore: -1, // opportunity ≤ 此 → STAY_CASH
  strongAvgAi: 74,
  weakAvgAi: 68,
  goodHitRate: 40, // 买区命中率 %
  okHitRate: 25,
  lowHitRate: 15,
  overheatBreakout: 60, // 已突破占比 % → 追高市
  midBreakout: 40,
  highVol: 25, // 年化波动率 %
  top1MinAi: 74,
} as const;

/**
 * 计算当日机会分并裁决。
 * 硬性否决（无视机会分）：regime=BEAR 或 无任何合格候选 → STAY_CASH。
 */
export function decideVerdict(ctx: DecisionContext, cfg = DECISION_CONFIG): DecisionOutcome {
  const parts: string[] = [];
  let score = 0;

  // ① regime
  if (ctx.regime === "BULL") { score += 2; parts.push("大盘多头(+2)"); }
  else if (ctx.regime === "BEAR") { score -= 3; parts.push("大盘空头(−3)"); }
  else { parts.push("大盘震荡(0)"); }

  // ④ 买区命中率
  const hit = ctx.buyZoneHitRate ?? 0;
  if (hit >= cfg.goodHitRate) { score += 2; parts.push(`买区命中率${hit.toFixed(0)}%(+2)`); }
  else if (hit >= cfg.okHitRate) { score += 1; parts.push(`买区命中率${hit.toFixed(0)}%(+1)`); }
  else if (hit < cfg.lowHitRate) { score -= 1; parts.push(`买区命中率仅${hit.toFixed(0)}%(−1)`); }

  // ⑥ 追高市（已突破买区占比过高）
  const bo = ctx.breakoutRatio ?? 0;
  if (bo > cfg.overheatBreakout) { score -= 2; parts.push(`${bo.toFixed(0)}%已突破买区·追高市(−2)`); }
  else if (bo > cfg.midBreakout) { score -= 1; parts.push(`${bo.toFixed(0)}%已突破买区(−1)`); }

  // ⑦ 合格候选数
  if (ctx.qualifiedCount >= 3) { score += 2; parts.push(`合格候选${ctx.qualifiedCount}只(+2)`); }
  else if (ctx.qualifiedCount === 2) { score += 1; parts.push("合格候选2只(+1)"); }
  else if (ctx.qualifiedCount === 0) { score -= 2; parts.push("无合格候选(−2)"); }

  // ② 平均 AI 分
  const avg = ctx.avgAiScore ?? 0;
  if (avg >= cfg.strongAvgAi) { score += 1; parts.push(`平均AI分${avg.toFixed(0)}(+1)`); }
  else if (avg < cfg.weakAvgAi) { score -= 1; parts.push(`平均AI分偏弱${avg.toFixed(0)}(−1)`); }

  // ⑤ 新闻风险
  if (ctx.newsRiskCount >= 3) { score -= 1; parts.push(`${ctx.newsRiskCount}只高影响利空(−1)`); }

  // ⑧ 波动率
  if ((ctx.volatility ?? 0) > cfg.highVol) { score -= 1; parts.push(`波动率${(ctx.volatility ?? 0).toFixed(0)}%偏高(−1)`); }

  // 裁决（含硬性否决）
  let verdict: Verdict;
  if (ctx.regime === "BEAR") {
    verdict = "STAY_CASH";
    return { verdict, opportunity: score, reason: `大盘处于空头(BEAR)，防守优先，今日空仓等待趋势反转。｜机会分 ${score}（${parts.join("，")}）` };
  }
  if (ctx.qualifiedCount === 0) {
    verdict = "STAY_CASH";
    return { verdict, opportunity: score, reason: `今日无满足建仓条件的合格标的（买区/风控/利空过滤后为空），建议空仓。｜机会分 ${score}（${parts.join("，")}）` };
  }
  // top1 太弱也不建仓
  const top1Weak = (ctx.top1AiScore ?? 0) < cfg.top1MinAi;

  if (score >= cfg.buyTodayScore && !top1Weak) {
    verdict = "BUY_TODAY";
  } else if (score <= cfg.stayCashScore) {
    verdict = "STAY_CASH";
  } else {
    verdict = "WATCH_ONLY";
  }

  const head =
    verdict === "BUY_TODAY" ? "今日市场适合建仓，机会与风险偏向有利。" :
    verdict === "WATCH_ONLY" ? (top1Weak && score >= cfg.buyTodayScore
      ? "市场条件尚可但头部标的强度不足，今日以观察为主、等更明确信号。"
      : "机会与风险参半，建议观察为主、轻仓或等待更好买点。") :
    "综合条件偏弱，今日建议空仓、控制风险。";

  return { verdict, opportunity: score, reason: `${head}｜机会分 ${score}（${parts.join("，")}）` };
}
