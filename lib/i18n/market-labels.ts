import type { Lang } from "./types";

export const SECTOR_MAP: Record<string, Record<Lang, string>> = {
  "電機・精密": { "zh-CN": "电子·精密制造", "ja-JP": "電機・精密", "en-US": "Electronics · Precision" },
  "自動車・輸送機": { "zh-CN": "汽车·运输", "ja-JP": "自動車・輸送機", "en-US": "Auto · Transport" },
  "化学": { "zh-CN": "化学", "ja-JP": "化学", "en-US": "Chemicals" },
  "医薬品": { "zh-CN": "医药", "ja-JP": "医薬品", "en-US": "Pharmaceuticals" },
  "小売業": { "zh-CN": "零售", "ja-JP": "小売業", "en-US": "Retail" },
  "情報・通信": { "zh-CN": "信息通信", "ja-JP": "情報・通信", "en-US": "IT & Telecom" },
  "銀行業": { "zh-CN": "银行", "ja-JP": "銀行業", "en-US": "Banking" },
  "保険業": { "zh-CN": "保险", "ja-JP": "保険業", "en-US": "Insurance" },
  "証券・商品先物": { "zh-CN": "证券·期货", "ja-JP": "証券・商品先物", "en-US": "Securities · Futures" },
  "その他金融業": { "zh-CN": "其他金融", "ja-JP": "その他金融業", "en-US": "Other Finance" },
  "不動産業": { "zh-CN": "房地产", "ja-JP": "不動産業", "en-US": "Real Estate" },
  "建設業": { "zh-CN": "建筑", "ja-JP": "建設業", "en-US": "Construction" },
  "食料品": { "zh-CN": "食品", "ja-JP": "食料品", "en-US": "Food" },
  "繊維製品": { "zh-CN": "纺织", "ja-JP": "繊維製品", "en-US": "Textiles" },
  "パルプ・紙": { "zh-CN": "纸浆·纸业", "ja-JP": "パルプ・紙", "en-US": "Pulp & Paper" },
  "ガラス・土石製品": { "zh-CN": "玻璃·建材", "ja-JP": "ガラス・土石製品", "en-US": "Glass · Stone" },
  "鉄鋼": { "zh-CN": "钢铁", "ja-JP": "鉄鋼", "en-US": "Steel" },
  "非鉄金属": { "zh-CN": "有色金属", "ja-JP": "非鉄金属", "en-US": "Non-ferrous Metals" },
  "金属製品": { "zh-CN": "金属制品", "ja-JP": "金属製品", "en-US": "Metal Products" },
  "機械": { "zh-CN": "机械", "ja-JP": "機械", "en-US": "Machinery" },
  "輸送用機器": { "zh-CN": "运输设备", "ja-JP": "輸送用機器", "en-US": "Transportation Equip." },
  "精密機器": { "zh-CN": "精密仪器", "ja-JP": "精密機器", "en-US": "Precision Instruments" },
  "その他製品": { "zh-CN": "其他产品", "ja-JP": "その他製品", "en-US": "Other Products" },
  "電気・ガス業": { "zh-CN": "电力·燃气", "ja-JP": "電気・ガス業", "en-US": "Utilities" },
  "陸運業": { "zh-CN": "陆运", "ja-JP": "陸運業", "en-US": "Land Transport" },
  "海運業": { "zh-CN": "海运", "ja-JP": "海運業", "en-US": "Shipping" },
  "空運業": { "zh-CN": "航空", "ja-JP": "空運業", "en-US": "Aviation" },
  "倉庫・運輸": { "zh-CN": "仓储·物流", "ja-JP": "倉庫・運輸", "en-US": "Warehousing · Logistics" },
  "卸売業": { "zh-CN": "批发", "ja-JP": "卸売業", "en-US": "Wholesale" },
  "水産・農林業": { "zh-CN": "农林水产", "ja-JP": "水産・農林業", "en-US": "Fishery · Agriculture" },
  "鉱業": { "zh-CN": "矿业", "ja-JP": "鉱業", "en-US": "Mining" },
  "サービス業": { "zh-CN": "服务业", "ja-JP": "サービス業", "en-US": "Services" },
};

export const MARKET_MAP: Record<string, Record<Lang, string>> = {
  "プライム": { "zh-CN": "主板", "ja-JP": "プライム", "en-US": "Prime" },
  "スタンダード": { "zh-CN": "标准", "ja-JP": "スタンダード", "en-US": "Standard" },
  "グロース": { "zh-CN": "成长", "ja-JP": "グロース", "en-US": "Growth" },
};

export function localeSector(sector: string | null, lang: Lang): string {
  if (!sector) return "—";
  const map = SECTOR_MAP[sector];
  return map?.[lang] ?? sector;
}

export function localeMarket(market: string | null, lang: Lang): string {
  if (!market) return "—";
  for (const [jpKey, labels] of Object.entries(MARKET_MAP)) {
    if (market.includes(jpKey)) return labels[lang];
  }
  return market;
}
