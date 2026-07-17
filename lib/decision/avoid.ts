/**
 * lib/decision/avoid.ts — 「今日回避 / 今日放弃股票」唯一判据来源（SSOT）
 * ────────────────────────────────────────────────────────────────────────────
 * P9-DECISION-02：决策中心的「今日回避」（今日总览）与「今日放弃股票」（收盘决策）
 * 是同一概念，必须**结论完全一致**。故判据 / 排除规则 / 严重度排序 / 上限只在此维护，
 * 两个页面一律 import 使用，禁止各自复制实现。
 *
 * 判据（4 条，全部取自 closing-decision.top10 的真实字段，不新增算法、不改评分）：
 *   ① 已脱离买区   inBuyZone === false
 *   ② 风险偏高     riskLevel === "HIGH"
 *   ③ 近期利空     newsSentiment < 0
 *   ④ 放量下跌     volumeRatio > 1.5 且 changePct < 0
 *
 * 排除规则：第一推荐 + 建议组合内全部股票（**组合优先级最高**）→ 冲突自动剔除并 warn。
 * 严重度排序：近期利空(4) > 风险偏高(3) > 放量下跌(2) > 已脱离买区(1)；同级按 top10 rank 升序。
 * 上限 3 只，不足即少，**绝不凑数、绝不编造原因**；0 只时由 UI 显示空态文案。
 * 不变量：recommended ∩ avoid 必须为空（buildAvoidList 内部已强制并断言）。
 */

export const AVOID_LIMIT = 3;
export const VOLUME_SPIKE_RATIO = 1.5;

/** 严重度权重（用于候选 >3 时的确定性排序） */
export const SEVERITY = { news: 4, risk: 3, dump: 2, zone: 1 } as const;

export type AvoidReasonKey = "news" | "risk" | "dump" | "zone";

/** closing-decision top10 行中本模块用到的字段（只读） */
export type AvoidSource = {
  symbol: string;
  name?: string | null;
  rank?: number | null;
  inBuyZone?: boolean | null;
  riskLevel?: string | null;
  newsSentiment?: number | null;
  volumeRatio?: number | null;
  changePct?: number | null;
};

export type AvoidItem = {
  symbol: string;
  name: string | null;
  reasonKeys: AvoidReasonKey[];
  severity: number;
  rank: number;
};

export type AvoidResult = {
  /** 最终展示列表（已排除 recommended、已按严重度排序、已截断至 AVOID_LIMIT） */
  items: AvoidItem[];
  /** 排除 recommended 后的全部候选数（用于「显示前3 / 共N」） */
  totalCandidates: number;
  /** 因与 第一推荐/建议组合 冲突而被剔除的 symbol（组合优先） */
  conflicts: string[];
  /** 断言结果：recommended ∩ items 必须为空 */
  assertionOk: boolean;
};

/** 逐行评估 4 判据；返回命中的原因键（空数组=无瑕疵） */
export function evaluateAvoidReasons(s: AvoidSource): AvoidReasonKey[] {
  const keys: AvoidReasonKey[] = [];
  if ((s.newsSentiment ?? 0) < 0) keys.push("news");
  if (String(s.riskLevel ?? "").toUpperCase() === "HIGH") keys.push("risk");
  if ((s.volumeRatio ?? 0) > VOLUME_SPIKE_RATIO && (s.changePct ?? 0) < 0) keys.push("dump");
  if (s.inBuyZone === false) keys.push("zone");
  return keys;
}

/**
 * 构建「今日回避 / 今日放弃股票」列表 —— 两个页面唯一入口。
 * @param top10        closing-decision.top10
 * @param recommended  第一推荐 + 建议组合内全部 symbol（组合优先级最高）
 */
export function buildAvoidList(top10: AvoidSource[], recommended: Iterable<string>): AvoidResult {
  const rec = new Set(recommended);

  const all: AvoidItem[] = [];
  for (const s of top10 ?? []) {
    const reasonKeys = evaluateAvoidReasons(s);
    if (!reasonKeys.length) continue;
    all.push({
      symbol: s.symbol,
      name: s.name ?? null,
      reasonKeys,
      severity: Math.max(...reasonKeys.map((k) => SEVERITY[k])),
      rank: s.rank ?? 99,
    });
  }

  const conflicts = all.filter((a) => rec.has(a.symbol)).map((a) => a.symbol);
  if (conflicts.length && typeof console !== "undefined") {
    console.warn(
      `[avoid-conflict] ${conflicts.join(", ")} 同时出现在「第一推荐/建议组合」与回避候选中 → 按「组合优先」自动剔除`,
    );
  }

  const survivors = all
    .filter((a) => !rec.has(a.symbol))
    .sort((a, b) => b.severity - a.severity || a.rank - b.rank);
  const items = survivors.slice(0, AVOID_LIMIT);

  const intersect = items.filter((a) => rec.has(a.symbol));
  const assertionOk = intersect.length === 0;
  if (!assertionOk && typeof console !== "undefined") {
    console.error(`[assert-failed] recommended ∩ avoid ≠ ∅: ${intersect.map((x) => x.symbol).join(", ")}`);
  }

  return { items, totalCandidates: survivors.length, conflicts, assertionOk };
}

/** 从 closing-decision 快照派生 recommended 集合（第一推荐 + 组合），两页共用，避免口径分叉 */
export function recommendedSymbols(
  top1: { symbol: string } | null | undefined,
  portfolio: { symbol: string }[] | null | undefined,
): Set<string> {
  const s = new Set<string>();
  for (const p of portfolio ?? []) s.add(p.symbol);
  if (top1?.symbol) s.add(top1.symbol);
  return s;
}
