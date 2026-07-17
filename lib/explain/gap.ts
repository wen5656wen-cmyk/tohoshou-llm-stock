/**
 * lib/explain/gap.ts — 决策解释力：星级 / 门槛差距 / 群体均值 / 催化剂 / 风险两级（SSOT）
 * ────────────────────────────────────────────────────────────────────────────
 * P10-RESEARCH-01 · **纯展示层派生**，全部为纯函数：
 *   · 不修改 GPT / AI 评分 / Recommendation Engine / Portfolio Builder /
 *     Closing Decision Engine / Watchlist Engine / Cron / Schema / DB；
 *   · **不改 Explain 引擎本体**（engine/risk/strength/summary 一律不动），本文件只做
 *     「已有真实字段 → 老板可读结论」的前端换算。
 *
 * 口径纪律（务必遵守，UI 不得混用）：
 *   A. **官方门槛**（v8.1，仅此两项）：adaptiveScore ≥ 70 且 percentileRank ≤ 15% → BUY
 *      只允许措辞：达标 / 未达标 / 还差 X 分 / 超出 X 个百分点。
 *   B. **BUY 群体均值**（技术/基本面/资金/动量…）：**非官方门槛**，只允许措辞：
 *      高于 BUY 群体均值 / 低于 BUY 群体均值 / 参考差值；必须标注样本数。
 *      **禁止把群体均值写成买入门槛。**
 */

// ── ① 星级（weight 0-100 → 5 档，纯视觉，不改任何评分）──────────────────────
export function starsOf(weight: number | null | undefined): number {
  const w = weight ?? 0;
  return w >= 95 ? 5 : w >= 85 ? 4 : w >= 75 ? 3 : w >= 60 ? 2 : 1;
}
export function starStr(n: number): string {
  return "★".repeat(n) + "☆".repeat(Math.max(0, 5 - n));
}

// ── ② 官方门槛（v8.1 双门槛，唯一权威）──────────────────────────────────────
export const THRESHOLDS = {
  STRONG_BUY: { score: 75, pct: 5 },
  BUY: { score: 70, pct: 15 },
} as const;

export type GapItem = { kind: "official" | "cohort"; ok: boolean; text: string };

/** A. 官方门槛差距 —— 只对 adaptiveScore / percentileRank 使用「达标/未达标/还差」 */
export function officialGap(adaptiveScore: number | null, percentileRank: number | null): GapItem[] {
  const t = THRESHOLDS.BUY;
  const out: GapItem[] = [];
  if (adaptiveScore != null) {
    const ok = adaptiveScore >= t.score;
    out.push({
      kind: "official", ok,
      text: ok
        ? `综合评分已达标（${adaptiveScore.toFixed(1)} ≥ ${t.score}）`
        : `综合评分距离 BUY 还差 ${(t.score - adaptiveScore).toFixed(1)} 分（${adaptiveScore.toFixed(1)} → 需 ${t.score}）`,
    });
  }
  if (percentileRank != null) {
    const ok = percentileRank <= t.pct;
    out.push({
      kind: "official", ok,
      text: ok
        ? `百分位已达标（前 ${percentileRank.toFixed(1)}% ≤ ${t.pct}%）`
        : `百分位未进入前 ${t.pct}%（当前前 ${percentileRank.toFixed(1)}%，超出 ${(percentileRank - t.pct).toFixed(1)} 个百分点）`,
    });
  }
  return out;
}

// ── ③ BUY 群体均值（非官方门槛，仅供横向比较）────────────────────────────────
export type Baseline = { n: number; avg: Record<string, number> };
export const COHORT_DIMS: { key: string; label: string }[] = [
  { key: "technicalScore", label: "技术" },
  { key: "fundamentalScore", label: "基本面" },
  { key: "moneyFlowScore", label: "资金" },
  { key: "newsSentimentScore", label: "情绪" },
  { key: "return20d", label: "20日动量" },
];

/** 由当日 BUY/STRONG_BUY 实际成分实时计算基准（样本数随之返回，UI 必须展示） */
export function buildBaseline(rows: Record<string, unknown>[]): Baseline {
  const buy = rows.filter((r) => r.recommendationV2 === "BUY" || r.recommendationV2 === "STRONG_BUY");
  const avg: Record<string, number> = {};
  for (const d of COHORT_DIMS) {
    const v = buy.map((r) => r[d.key]).filter((x): x is number => typeof x === "number");
    if (v.length) avg[d.key] = v.reduce((a, b) => a + b, 0) / v.length;
  }
  return { n: buy.length, avg };
}

/** B. 群体均值对照 —— 措辞严格限定为「高于/低于 BUY 群体均值 + 参考差值」 */
export function cohortGap(stock: Record<string, unknown>, base: Baseline): GapItem[] {
  const out: GapItem[] = [];
  for (const d of COHORT_DIMS) {
    const v = stock[d.key];
    const b = base.avg[d.key];
    if (typeof v !== "number" || typeof b !== "number") continue;
    const diff = v - b;
    out.push({
      kind: "cohort", ok: diff >= 0,
      text: `${d.label}${diff >= 0 ? "高于" : "低于"} BUY 群体均值（${v.toFixed(1)} vs ${b.toFixed(1)}，参考差值 ${diff >= 0 ? "+" : ""}${diff.toFixed(1)}）`,
    });
  }
  return out;
}
export const COHORT_DISCLAIMER = "非官方门槛，仅供横向比较";

// ── ④ 催化剂（disclosures + news 合并 · 去重 · 优先级 · 7 天）─────────────────
// 事实类别只用底层结构化 category；**禁止**据标题/情绪扩写为「超预期/大订单/新合同」等。
export const CATALYST_META: Record<string, { pri: number; label: string }> = {
  BUYBACK: { pri: 6, label: "回购" },
  EARNINGS: { pri: 5, label: "财报" },
  FORECAST_REVISION: { pri: 5, label: "业绩修正" },
  EQUITY: { pri: 4, label: "增发" },
  MATERIAL: { pri: 4, label: "重大披露" },
  DIVIDEND: { pri: 3, label: "分红" },
  NEWS: { pri: 2, label: "行业新闻" },
  OTHER: { pri: 1, label: "其他" },
};
const PRI_STARS: Record<number, number> = { 6: 5, 5: 4, 4: 3, 3: 2, 2: 2, 1: 1 };

export type Catalyst = { stars: number; label: string; title: string; date: string; stale: boolean; sentiment?: string | null };

/** sentiment 仅作辅助标记，**不改变事件事实类别**（不因 POSITIVE 就升级为「利好」） */
export function buildCatalysts(
  disclosures: { title: string; category?: string | null; sentiment?: string | null; publishedAt: string }[],
  news: { title?: string; publishedAt: string }[],
  todayIso: string,
  limit = 5,
): Catalyst[] {
  const dayDiff = (iso: string) => Math.round((Date.parse(todayIso) - Date.parse(iso.slice(0, 10))) / 86400_000);
  const norm = (s: string) => s.replace(/\s|　/g, "").slice(0, 24); // 去重键：标题前缀
  const seen = new Set<string>();
  const out: Catalyst[] = [];

  for (const d of disclosures ?? []) {
    const meta = CATALYST_META[d.category ?? "OTHER"] ?? CATALYST_META.OTHER;
    const key = norm(d.title);
    if (seen.has(key)) continue; // 同一事件不重复
    seen.add(key);
    const dd = dayDiff(d.publishedAt);
    out.push({
      stars: PRI_STARS[meta.pri] ?? 1, label: meta.label, title: d.title,
      date: d.publishedAt.slice(0, 10), stale: dd > 7, sentiment: d.sentiment ?? null,
    });
  }
  // 新闻聚合为单条「行业新闻」，且与已列披露标题去重
  const freshNews = (news ?? []).filter((n) => !n.title || !seen.has(norm(n.title)));
  if (freshNews.length) {
    const latest = freshNews[0];
    out.push({
      stars: PRI_STARS[CATALYST_META.NEWS.pri], label: CATALYST_META.NEWS.label,
      title: `近期新闻 ${freshNews.length} 条`, date: latest.publishedAt.slice(0, 10),
      stale: dayDiff(latest.publishedAt) > 7,
    });
  }
  // 优先级：回购 > 财报/业绩修正 > 增发/重大 > 分红 > 行业新闻 > 其他；近 7 天优先
  return out
    .sort((a, b) => Number(a.stale) - Number(b.stale) || b.stars - a.stars || (a.date < b.date ? 1 : -1))
    .slice(0, limit);
}

// ── ⑤ 风险两级（L1 个股 explain.risks → L2 市场级回退，绝不出现「暂无风险」）──
export type RiskView = { level: 1 | 2; note: string | null; items: { stars: number; title: string }[] };
export const L2_NOTE = "个股风险信号未触发，以下为市场级风险";

export function buildRiskView(
  explainRisks: { title: string; weight?: number | null }[] | null | undefined,
  market: { nasdaqChange?: number | null; vix?: number | null; usdjpy?: number | null; regime?: string | null },
  limit = 3,
): RiskView {
  if (explainRisks && explainRisks.length) {
    return {
      level: 1, note: null,
      items: explainRisks.slice(0, limit).map((r) => ({ stars: starsOf(r.weight), title: r.title })),
    };
  }
  const l2: { stars: number; title: string }[] = [];
  if ((market.nasdaqChange ?? 0) < -1) l2.push({ stars: 4, title: `NASDAQ ${market.nasdaqChange!.toFixed(2)}% — 美股 AI 板块承压` });
  if ((market.vix ?? 0) > 20) l2.push({ stars: 4, title: `VIX ${market.vix!.toFixed(1)} 偏高，风险偏好收缩` });
  else if (market.vix != null) l2.push({ stars: 2, title: `VIX ${market.vix.toFixed(1)} 平稳` });
  if (market.regime && market.regime !== "BULL") l2.push({ stars: 3, title: `大盘 ${market.regime} — 非牛市环境` });
  if (market.usdjpy != null) l2.push({ stars: 1, title: `USDJPY ${market.usdjpy.toFixed(1)}` });
  return { level: 2, note: L2_NOTE, items: l2.sort((a, b) => b.stars - a.stars).slice(0, limit) };
}
