export type StockNameData = {
  symbol: string;
  name: string;
  nameZh?: string | null;
  nameEn?: string | null;
};

/** 主显示名称：nameZh → name → nameEn → symbol */
export function primaryName(s: StockNameData): string {
  return s.nameZh || s.name || s.nameEn || s.symbol;
}

/** 副名称（日文）：仅在 nameZh 存在且不等于 name 时返回 */
export function subName(s: StockNameData): string | null {
  if (s.nameZh && s.nameZh !== s.name) return s.name;
  return null;
}
