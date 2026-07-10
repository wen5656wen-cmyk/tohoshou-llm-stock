// ── TOHOSHOU AI · Closing Decision · 总结 / 信心 / 推送文本（P6-T12）─────────
// 纯函数：由裁决 + Top10 + 组合派生「今日交易总结」、top1 信心等级(A+/A/B)、建议持有
// 时间、以及 push-ready 文本（本期不真正外发，仅落库供未来 webhook 接入）。

import type { DecisionRow, PortfolioResult, Verdict, Confidence } from "./types";

const VERDICT_LABEL: Record<Verdict, string> = {
  BUY_TODAY: "BUY TODAY（今日可建仓）",
  WATCH_ONLY: "WATCH ONLY（今日观察）",
  STAY_CASH: "STAY CASH（今日空仓）",
};

export function verdictLabel(v: Verdict): string { return VERDICT_LABEL[v]; }

/** top1 信心等级：综合 AI/GPT 分、是否买区内、大盘、风险。 */
export function assessConfidence(top1: DecisionRow | null, regime: string | null): Confidence {
  if (!top1) return "B";
  const ai = top1.aiScore ?? 0;
  const gpt = top1.gptScore; // 可能为 null
  const gptOk = gpt == null || gpt >= 70;
  const lowRisk = !top1.highRiskFlag && top1.riskLevel !== "HIGH" && top1.riskLevel !== "EXTREME";
  if (ai >= 76 && gptOk && top1.inBuyZone && regime === "BULL" && lowRisk) return "A+";
  if (ai >= 72 && (top1.inBuyZone || !top1.breakout) && lowRisk) return "A";
  return "B";
}

/** 建议持有时间：按风格/风险粗分（短线/波段）。 */
export function suggestHoldPeriod(top1: DecisionRow | null): string {
  if (!top1) return "—";
  if (top1.highRiskFlag || top1.riskLevel === "HIGH" || top1.riskLevel === "EXTREME") return "3-7日（短线，严格止损）";
  if ((top1.return20d ?? 0) > 25) return "1-2周（强动量，滚动止盈）";
  return "1-3周（波段持有）";
}

/** ⑥ 今日交易总结（中文，规则派生）。 */
export function buildSummary(
  verdict: Verdict,
  top1: DecisionRow | null,
  portfolio: PortfolioResult,
  top10: DecisionRow[],
): string {
  const lines: string[] = [];
  if (verdict === "BUY_TODAY") lines.push("今日市场适合建仓。");
  else if (verdict === "WATCH_ONLY") lines.push("今日以观察为主，可轻仓试探或等待更明确信号。");
  else lines.push("今日建议空仓，控制风险、等待更好买点。");

  if (verdict !== "STAY_CASH" && portfolio.legs.length) {
    lines.push("推荐建仓：");
    for (const l of portfolio.legs) lines.push(`　${l.symbol}${l.name ? " " + l.name : ""}（${l.weight}%）`);
  }

  // 追高提示：Top10 中已突破买区的高涨幅股
  const overheated = top10.filter((r) => r.breakout).sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0));
  if (overheated.length) {
    const o = overheated[0];
    lines.push(`${o.symbol}${o.name ? " " + o.name : ""} 今日${o.changePct != null ? (o.changePct > 0 ? "涨" : "跌") + Math.abs(o.changePct).toFixed(1) + "%" : "涨幅过大"}、已突破买区，不建议追高。`);
  }
  lines.push("其余标的等待回踩买区再介入。");
  return lines.join("\n");
}

/** push-ready 文本（本期不外发，落库备用）。 */
export function buildPushText(
  dateStr: string,
  verdict: Verdict,
  top1: DecisionRow | null,
  portfolio: PortfolioResult,
): string {
  const lines: string[] = [];
  lines.push("📈 收盘决策");
  lines.push(dateStr);
  lines.push("");
  lines.push(`今日：${verdictLabel(verdict).split("（")[0]}`);
  if (top1) {
    lines.push("");
    lines.push(`第一推荐：${top1.symbol}${top1.name ? " " + top1.name : ""}`);
    if (top1.entryLow != null && top1.entryHigh != null) lines.push(`买入区间：${Math.round(top1.entryLow)}–${Math.round(top1.entryHigh)}`);
  }
  if (verdict !== "STAY_CASH" && portfolio.legs.length) {
    lines.push("");
    lines.push("推荐组合：");
    for (const l of portfolio.legs) lines.push(`${l.symbol}　${l.weight}%`);
  } else if (verdict === "STAY_CASH") {
    lines.push("");
    lines.push("今日建议空仓。");
  }
  return lines.join("\n");
}
