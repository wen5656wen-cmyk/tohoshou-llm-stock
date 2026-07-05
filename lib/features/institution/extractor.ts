// ── TOHOSHOU AI · Institution Flow Feature Extractor（P6-T4）────────────────
// 从现有 InstitutionalFlow 派生 10 个市场级机构资金因子（影子）。**纯函数、只读、
// 不落库、不接评分、不改任何数据。** 序列为空 → N/A（不伪造）。

import {
  buildSeries, sumSeries, streak, mean, clampScore, num, weekKey,
  type WeekPoint, type SeriesOptions,
} from "./parser";
import {
  type InstitutionalFlowLike, type InstitutionFeatureResult, type InstitutionFeatureSet,
  type InstitutionFeatureType, type FlowDirection, INSTITUTION_FEATURE_TYPES, INVESTOR,
} from "./types";

function na(type: InstitutionFeatureType, note: string): InstitutionFeatureResult {
  return { type, available: false, value: null, direction: "NA", score: null, note };
}
function last(s: WeekPoint[]): WeekPoint | null {
  return s.length ? s[s.length - 1] : null;
}
function maxAbs(s: WeekPoint[]): number {
  return Math.max(1, ...s.map((p) => Math.abs(p.net)));
}
function dirBySign(net: number): FlowDirection {
  return net > 0 ? "POSITIVE" : net < 0 ? "NEGATIVE" : "NEUTRAL";
}
/** 净额 → 0-100 分（按序列自身量级自归一化，+50 中枢）。 */
function magScore(net: number, s: WeekPoint[]): number {
  return clampScore(50 + (net / maxAbs(s)) * 50);
}

export function extractInstitutionFeatures(
  flows: InstitutionalFlowLike[],
  opts: SeriesOptions = {},
): InstitutionFeatureSet {
  const foreign = buildSeries(flows, INVESTOR.FOREIGN, opts);
  const trustBank = buildSeries(flows, INVESTOR.TRUST_BANK, opts);
  const dealer = buildSeries(flows, INVESTOR.DEALER, opts);
  const individual = buildSeries(flows, INVESTOR.INDIVIDUAL, opts);
  const insurance = buildSeries(flows, INVESTOR.INSURANCE, opts);
  const smart = sumSeries([foreign, trustBank, insurance]); // 机构 smart money

  const allWeeks = Array.from(new Set(flows.map((f) => weekKey(f.date)))).sort();
  const latestWeek = allWeeks.length ? allWeeks[allWeeks.length - 1] : null;

  const F = {} as Record<InstitutionFeatureType, InstitutionFeatureResult>;

  // 1) FOREIGN_BUY（外资净买入强度）
  {
    const l = last(foreign);
    if (!l) F.FOREIGN_BUY = na("FOREIGN_BUY", "无 foreigners 数据");
    else F.FOREIGN_BUY = { type: "FOREIGN_BUY", available: true, value: l.net, direction: dirBySign(l.net), score: magScore(l.net, foreign), note: l.net > 0 ? "外资本周買越" : "外资本周非買越" };
  }

  // 2) FOREIGN_SELL（外资抛压：净额<0 时的卖压强度）
  {
    const l = last(foreign);
    if (!l) F.FOREIGN_SELL = na("FOREIGN_SELL", "无 foreigners 数据");
    else {
      const selling = l.net < 0;
      const sellPressure = clampScore(Math.min(Math.abs(Math.min(l.net, 0)) / maxAbs(foreign), 1) * 100);
      F.FOREIGN_SELL = { type: "FOREIGN_SELL", available: true, value: l.net, direction: selling ? "NEGATIVE" : "NEUTRAL", score: sellPressure, note: selling ? "外资本周売越（分数=卖压强度）" : "外资本周无净卖出" };
    }
  }

  // 3) FOREIGN_BUY_STREAK（外资连续买入周数）
  {
    if (foreign.length === 0) F.FOREIGN_BUY_STREAK = na("FOREIGN_BUY_STREAK", "无 foreigners 数据");
    else {
      const st = streak(foreign, 1);
      F.FOREIGN_BUY_STREAK = { type: "FOREIGN_BUY_STREAK", available: true, value: st, direction: st >= 2 ? "POSITIVE" : st === 0 ? "NEGATIVE" : "NEUTRAL", score: clampScore(st * 20), note: `连续買越 ${st} 周（历史仅 ${foreign.length} 周）` };
    }
  }

  // 4) TRUST_BANK_FLOW
  F.TRUST_BANK_FLOW = flowFeature("TRUST_BANK_FLOW", trustBank, "无 trust_bank 数据");
  // 5) DEALER_FLOW
  F.DEALER_FLOW = flowFeature("DEALER_FLOW", dealer, "无 dealer 数据");
  // 6) RETAIL_FLOW（个人，常为反向指标）
  {
    const l = last(individual);
    if (!l) F.RETAIL_FLOW = na("RETAIL_FLOW", "无 individual 数据");
    else F.RETAIL_FLOW = { type: "RETAIL_FLOW", available: true, value: l.net, direction: dirBySign(l.net), score: magScore(l.net, individual), note: "个人投资者常为反向指标，方向仅表原始净流" };
  }

  // 7) NET_FLOW_MOMENTUM（smart money 动量：最新 vs 之前均值）
  {
    if (smart.length < 2) F.NET_FLOW_MOMENTUM = na("NET_FLOW_MOMENTUM", `smart money 序列不足 2 周（现 ${smart.length}）`);
    else {
      const l = smart[smart.length - 1].net;
      const priorMean = mean(smart.slice(0, -1).map((p) => p.net));
      const mom = l - priorMean;
      F.NET_FLOW_MOMENTUM = { type: "NET_FLOW_MOMENTUM", available: true, value: mom, direction: dirBySign(mom), score: clampScore(50 + (mom / maxAbs(smart)) * 50), note: "机构净流最新周相对前几周均值的变化" };
    }
  }

  // 8) FLOW_REVERSAL（smart money 符号翻转）
  {
    if (smart.length < 2) F.FLOW_REVERSAL = na("FLOW_REVERSAL", `smart money 序列不足 2 周（现 ${smart.length}）`);
    else {
      const cur = smart[smart.length - 1].net;
      const prev = smart[smart.length - 2].net;
      const reversed = Math.sign(cur) !== Math.sign(prev) && cur !== 0 && prev !== 0;
      const bullish = reversed && cur > 0;
      const bearish = reversed && cur < 0;
      F.FLOW_REVERSAL = { type: "FLOW_REVERSAL", available: true, value: reversed ? 1 : 0, direction: bullish ? "POSITIVE" : bearish ? "NEGATIVE" : "NEUTRAL", score: bullish ? 80 : bearish ? 20 : 50, note: reversed ? (bullish ? "转为净流入（看多反转）" : "转为净流出（看空反转）") : "无反转" };
    }
  }

  // 9) SMART_MONEY_SCORE（机构综合：外资+信托+保险 最新净流）
  {
    const l = last(smart);
    if (!l) F.SMART_MONEY_SCORE = na("SMART_MONEY_SCORE", "无 smart money（外资/信托/保险）数据");
    else F.SMART_MONEY_SCORE = { type: "SMART_MONEY_SCORE", available: true, value: l.net, direction: dirBySign(l.net), score: magScore(l.net, smart), note: "外资+信托银行+保险 净流综合" };
  }

  // 10) FLOW_STABILITY（外资净流方向一致度，需 ≥3 周）
  {
    if (foreign.length < 3) F.FLOW_STABILITY = na("FLOW_STABILITY", `外资序列不足 3 周（现 ${foreign.length}），稳定性无法评估`);
    else {
      const pos = foreign.filter((p) => p.net > 0).length;
      const neg = foreign.filter((p) => p.net < 0).length;
      const ratio = Math.max(pos, neg) / foreign.length; // 主方向占比
      F.FLOW_STABILITY = { type: "FLOW_STABILITY", available: true, value: Math.round(ratio * 100) / 100, direction: "NEUTRAL", score: clampScore(ratio * 100), note: `主方向占比 ${(ratio * 100).toFixed(0)}%（历史仅 ${foreign.length} 周，深度受限）` };
    }
  }

  return {
    scope: "MARKET",
    market: opts.market && opts.market !== "ALL" ? opts.market : "ALL",
    weeks: allWeeks.length,
    latestWeek,
    asOf: latestWeek ? new Date(latestWeek).toISOString() : new Date(0).toISOString(),
    features: F,
  };
}

/** 通用「最新净流」因子（TRUST_BANK / DEALER）。 */
function flowFeature(type: InstitutionFeatureType, series: WeekPoint[], missNote: string): InstitutionFeatureResult {
  const l = last(series);
  if (!l) return na(type, missNote);
  return { type, available: true, value: l.net, direction: dirBySign(l.net), score: magScore(l.net, series) };
}
