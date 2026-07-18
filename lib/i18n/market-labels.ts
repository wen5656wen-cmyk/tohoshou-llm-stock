import type { Lang } from "./types";

export const SECTOR_MAP: Record<string, Record<Lang, string>> = {
  "電機・精密": { "zh-CN": "电子·精密制造", "ja-JP": "電機・精密" },
  "自動車・輸送機": { "zh-CN": "汽车·运输", "ja-JP": "自動車・輸送機" },
  "化学": { "zh-CN": "化学", "ja-JP": "化学" },
  "医薬品": { "zh-CN": "医药", "ja-JP": "医薬品" },
  "小売業": { "zh-CN": "零售", "ja-JP": "小売業" },
  "情報・通信": { "zh-CN": "信息通信", "ja-JP": "情報・通信" },
  "銀行業": { "zh-CN": "银行", "ja-JP": "銀行業" },
  "保険業": { "zh-CN": "保险", "ja-JP": "保険業" },
  "証券・商品先物": { "zh-CN": "证券·期货", "ja-JP": "証券・商品先物" },
  "その他金融業": { "zh-CN": "其他金融", "ja-JP": "その他金融業" },
  "不動産業": { "zh-CN": "房地产", "ja-JP": "不動産業" },
  "建設業": { "zh-CN": "建筑", "ja-JP": "建設業" },
  "食料品": { "zh-CN": "食品", "ja-JP": "食料品" },
  "繊維製品": { "zh-CN": "纺织", "ja-JP": "繊維製品" },
  "パルプ・紙": { "zh-CN": "纸浆·纸业", "ja-JP": "パルプ・紙" },
  "ガラス・土石製品": { "zh-CN": "玻璃·建材", "ja-JP": "ガラス・土石製品" },
  "鉄鋼": { "zh-CN": "钢铁", "ja-JP": "鉄鋼" },
  "非鉄金属": { "zh-CN": "有色金属", "ja-JP": "非鉄金属" },
  "金属製品": { "zh-CN": "金属制品", "ja-JP": "金属製品" },
  "機械": { "zh-CN": "机械", "ja-JP": "機械" },
  "輸送用機器": { "zh-CN": "运输设备", "ja-JP": "輸送用機器" },
  "精密機器": { "zh-CN": "精密仪器", "ja-JP": "精密機器" },
  "その他製品": { "zh-CN": "其他产品", "ja-JP": "その他製品" },
  "電気・ガス業": { "zh-CN": "电力·燃气", "ja-JP": "電気・ガス業" },
  "陸運業": { "zh-CN": "陆运", "ja-JP": "陸運業" },
  "海運業": { "zh-CN": "海运", "ja-JP": "海運業" },
  "空運業": { "zh-CN": "航空", "ja-JP": "空運業" },
  "倉庫・運輸": { "zh-CN": "仓储·物流", "ja-JP": "倉庫・運輸" },
  "卸売業": { "zh-CN": "批发", "ja-JP": "卸売業" },
  "水産・農林業": { "zh-CN": "农林水产", "ja-JP": "水産・農林業" },
  "鉱業": { "zh-CN": "矿业", "ja-JP": "鉱業" },
  "サービス業": { "zh-CN": "服务业", "ja-JP": "サービス業" },
};

export const MARKET_MAP: Record<string, Record<Lang, string>> = {
  "プライム": { "zh-CN": "主板", "ja-JP": "プライム" },
  "スタンダード": { "zh-CN": "标准", "ja-JP": "スタンダード" },
  "グロース": { "zh-CN": "成长", "ja-JP": "グロース" },
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
