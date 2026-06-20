/**
 * Shared news classification utilities used by all news sources.
 */

export type NewsCategory =
  | "EARNINGS"   // 決算短信
  | "GUIDANCE"   // 業績予想修正
  | "DIVIDEND"   // 配当修正
  | "BUYBACK"    // 自己株式取得
  | "IR"         // 大量保有・役員異動・適時開示
  | "MARKET"     // マーケット一般ニュース
  | "OTHER";

export type NewsSentiment = "POSITIVE" | "NEGATIVE" | "NEUTRAL";

// Importance 0–9: 7+ = HIGH, 4–6 = MEDIUM, 0–3 = LOW
export function importanceLevel(imp: number): "HIGH" | "MEDIUM" | "LOW" {
  if (imp >= 7) return "HIGH";
  if (imp >= 4) return "MEDIUM";
  return "LOW";
}

const CATEGORY_MAP: Array<[string[], NewsCategory]> = [
  [["決算短信", "決算発表", "四半期決算", "通期決算", "業績発表"], "EARNINGS"],
  [["業績予想", "業績修正", "上方修正", "下方修正", "見通し修正", "利益修正"], "GUIDANCE"],
  [["配当", "増配", "減配", "特別配当", "無配", "復配", "分配金"], "DIVIDEND"],
  [["自己株", "自社株", "株式取得", "消却"], "BUYBACK"],
  [["大量保有", "取締役", "代表取締役", "役員", "異動", "M&A", "合併", "買収", "TOB", "子会社", "適時開示", "開示"], "IR"],
];

export function classifyCategory(title: string): NewsCategory {
  for (const [keywords, cat] of CATEGORY_MAP) {
    if (keywords.some((kw) => title.includes(kw))) return cat;
  }
  return "OTHER";
}

const POSITIVE_WORDS = [
  "増収", "増益", "最高益", "上方修正", "好業績", "増配", "自社株買い", "自己株式取得",
  "黒字転換", "黒字", "好調", "成長", "拡大", "受注", "好決算", "買い推奨",
  "目標株価引き上げ", "躍進", "復配", "特別配当", "最高売上", "大幅増益",
];

const NEGATIVE_WORDS = [
  "減収", "減益", "下方修正", "赤字", "損失", "悪化", "低下", "警戒",
  "不振", "リスク", "失速", "損害", "格下げ", "目標株価引き下げ", "懸念",
  "無配", "減配", "訴訟", "リコール", "中止", "撤退", "破綻", "倒産",
];

export function classifySentiment(title: string): NewsSentiment {
  const pos = POSITIVE_WORDS.filter((w) => title.includes(w)).length;
  const neg = NEGATIVE_WORDS.filter((w) => title.includes(w)).length;
  if (pos > neg) return "POSITIVE";
  if (neg > pos) return "NEGATIVE";
  return "NEUTRAL";
}

export function calcImportance(title: string, category: NewsCategory): number {
  if (category === "EARNINGS") return 9;
  if (category === "GUIDANCE") {
    if (title.includes("上方")) return 9;
    if (title.includes("下方")) return 8;
    return 7;
  }
  if (category === "DIVIDEND") return 7;
  if (category === "BUYBACK") return 7;
  if (category === "IR") return 6;
  if (category === "MARKET") return 3;
  return 4;
}
