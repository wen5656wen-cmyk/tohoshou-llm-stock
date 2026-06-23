export type StockNameFields = {
  symbol: string;
  name?: string | null;
  nameZh?: string | null;
  nameEn?: string | null;
};

/** Primary display name: nameZh → name(nameJa) → nameEn → symbol */
export function getStockDisplayName(stock: StockNameFields): string {
  return stock.nameZh?.trim() || stock.name?.trim() || stock.nameEn?.trim() || stock.symbol;
}

/**
 * Sub-title for Flex cards: Japanese name + symbol
 * e.g. "トヨタ自動車 · 7203"
 */
export function getStockSubName(stock: StockNameFields): string {
  const parts: string[] = [];
  const jaName = stock.name?.trim();
  if (jaName && jaName !== stock.nameZh?.trim()) parts.push(jaName);
  parts.push(stock.symbol.replace(".T", ""));
  return parts.join(" · ");
}
