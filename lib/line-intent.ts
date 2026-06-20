/**
 * lib/line-intent.ts — LINE NLP Intent Parser V7.9
 *
 * Parses free-form Japanese/Chinese text into structured intents.
 * No DB access here — pure text classification.
 */

// ── Intent types ───────────────────────────────────────────��──────────────────

export type LineIntent =
  | { type: "TOP_PICKS"; limit: number }
  | { type: "STOCK_ANALYSIS"; symbol: string; nameQuery?: string }
  | { type: "TECH_THEME" }
  | { type: "SECTOR_OUTLOOK"; sectors: string[]; sectorLabel: string }
  | { type: "MARKET_OVERVIEW" }
  | { type: "DATA_SOURCE" }
  | { type: "HELP" }
  | { type: "UNKNOWN"; text: string };

// ── Company name → TSE symbol map ───────────────────────────���─────────────────
// CN/JP names (including common variants) → 4-digit code (no .T suffix)

const CN_SYMBOL_MAP: Record<string, string> = {
  // 自動車
  丰田:     "7203", トヨタ:    "7203", toyota:   "7203", "丰田汽车": "7203",
  本田:     "7267", ホンダ:    "7267", honda:    "7267",
  日产:     "7201", 日產:     "7201", nissan:   "7201",
  马自达:   "7261", マツダ:    "7261", mazda:    "7261",
  斯巴鲁:   "7270", スバル:    "7270", subaru:   "7270",
  铃木:     "7269", スズキ:    "7269", suzuki:   "7269",
  三菱汽车: "7211", デンソー:  "6902", 电装:     "6902", denso: "6902",
  爱信:     "7259", aisin:    "7259",

  // 电子・精密
  索尼:     "6758", ソニー:    "6758", sony:     "6758",
  松下:     "6752", パナソニック: "6752", panasonic: "6752",
  日立:     "6501", hitachi:  "6501",
  东芝:     "6502", 東芝:     "6502", toshiba:  "6502",
  富士通:   "6702", fujitsu:  "6702",
  佳能:     "7751", キヤノン:  "7751", canon:    "7751",
  尼康:     "7731", ニコン:    "7731", nikon:    "7731",
  奥林巴斯: "7733", オリンパス: "7733",
  村田制作所:"6981", 村田:     "6981", murata:   "6981",
  tdk:      "6762", TDK:      "6762",
  京瓷:     "6971", 京セラ:   "6971", kyocera:  "6971",
  日本电产: "6594", 尼得科:   "6594", nidec:    "6594",
  瑞萨:     "6723", ルネサス:  "6723", renesas:  "6723",
  富士胶片: "4901", 富士フイルム: "4901",
  hoya:     "7741", HOYA:     "7741",

  // 半导体・设备
  东京电子: "8035", 東京エレクトロン: "8035", tel:      "8035",
  信越化学: "4063", 信越:     "4063", shinetsu: "4063",
  优志旺:   "6925", ウシオ電機: "6925",
  爱德万:   "6857", アドバンテスト: "6857", advantest: "6857",
  screen:   "7735", SCREEN:   "7735",
  迪思科:   "6146", ディスコ:  "6146", disco:    "6146",

  // ソフトウェア・通信
  软银:     "9984", ソフトバンク: "9984", softbank: "9984", "软银集团": "9984",
  ntt:      "9432", NTT:      "9432",
  kddi:     "9433", KDDI:     "9433",
  乐天:     "4755", 楽天:     "4755", rakuten:  "4755",
  "雅虎日本": "4689", zホールディングス: "4689",
  line:     "3938", LINE:     "3938",
  recruit:  "6098", リクルート: "6098",
  富士软件: "9749",
  m3:       "2413", エムスリー: "2413",
  mercari:  "4385", メルカリ:  "4385",

  // 金融
  "三菱ufj": "8306", "三菱UFJ": "8306",
  "三菱UFJ银行": "8306",
  "三井住友": "8316", smfg:    "8316",
  "瑞穗":    "8411", みずほ:   "8411", mizuho:   "8411",
  野村:     "8604", nomura:   "8604",
  大和:     "8601", daiwa:    "8601",
  东京海上: "8766", 東京海上:  "8766",
  三井住友海上: "8725",

  // 商社
  伊藤忠:   "8001", 伊藤忠商事: "8001", itochu:   "8001",
  丸红:     "8002", 丸紅:     "8002", marubeni: "8002",
  三菱商事: "8058", mitsubishi: "8058",
  三井物产: "8031", 三井物產:  "8031", mitsui:   "8031",
  住友商事: "8053", sumitomo: "8053",
  丰通:     "8015", 豊通:     "8015",

  // 小売・消费
  优衣库:   "9983", ユニクロ:  "9983", 迅销:     "9983", uniqlo: "9983", fastretailing: "9983",
  任天堂:   "7974", nintendo: "7974",
  花王:     "4452", kao:      "4452",
  资生堂:   "4911", shiseido: "4911",
  "7-eleven": "3382", 七一一: "3382", "セブン&アイ": "3382",

  // 机械・设备
  小松:     "6301", コマツ:   "6301", komatsu:  "6301",
  "发那科":  "6954", ファナック: "6954", fanuc:    "6954",
  基恩士:   "6861", キーエンス: "6861", keyence:  "6861",
  大金:     "6367", ダイキン:  "6367", daikin:   "6367",
  安川电机: "6506", 安川:     "6506", yaskawa:  "6506",
  奥克斯:   "6471",

  // 制药
  武田:     "4502", 武田薬品:  "4502", takeda:   "4502",
  "第一三共": "4568", daiichi: "4568",
  中外制药: "4519", 中外:     "4519", chugai:   "4519",
  "安斯泰来": "4503", astellas: "4503",
  大冢:     "4578", 大塚:     "4578", otsuka:   "4578",
  参天制药: "4536", santen:   "4536",

  // 电力・能源
  "东京电力": "9501", tepco:   "9501",
  "关西电力": "9503", kepco:   "9503",
  "九州电力": "9508",

  // その他
  "日本制铁": "5401", 日本製鉄: "5401", 新日铁:  "5401",
  旭化成:   "3407", asahi:    "3407",
  东丽:     "3402", 東レ:     "3402", toray:    "3402",
  住友化学: "4005",
  jfe:      "5411", JFE:      "5411",
};

// sector keyword → Prisma sector values
export const SECTOR_MAP: Record<string, { sectors: string[]; label: string }> = {
  半导体:   { sectors: ["電機・精密"],                                   label: "半导体・电子" },
  "半导体股": { sectors: ["電機・精密"],                                  label: "半导体" },
  科技股:   { sectors: ["情報通信・サービスその他", "電機・精密"],          label: "科技股" },
  机器人:   { sectors: ["機械", "電機・精密"],                            label: "机器人" },
  "机器人股": { sectors: ["機械", "電機・精密"],                           label: "机器人" },
  数据中心: { sectors: ["情報通信・サービスその他"],                        label: "数据中心" },
  汽车股:   { sectors: ["自動車・輸送機"],                                label: "汽车" },
  金融股:   { sectors: ["銀行業", "証券・商品先物取引業", "保険業"],         label: "金融" },
  银行股:   { sectors: ["銀行業"],                                        label: "银行" },
  商社:     { sectors: ["卸売業"],                                        label: "商社" },
  "商社股":  { sectors: ["卸売業"],                                       label: "商社" },
  医药股:   { sectors: ["医薬品"],                                        label: "医药" },
  能源股:   { sectors: ["鉱業", "電力・ガス"],                             label: "能源" },
  电力股:   { sectors: ["電力・ガス"],                                    label: "电力" },
  化工股:   { sectors: ["化学"],                                          label: "化工" },
  小売:     { sectors: ["小売業"],                                        label: "零售" },
  零售股:   { sectors: ["小���業"],                                        label: "零售" },
  机械:     { sectors: ["機械"],                                          label: "���械" },
  通信股:   { sectors: ["情報通信・サービスその他"],                        label: "通信" },
};

// ── Helper: resolve company name to symbol ────────────────────���───────────────

export function resolveCompanyToSymbol(text: string): string | null {
  const lower = text.toLowerCase().replace(/\s+/g, "");
  // Exact match first
  for (const [key, code] of Object.entries(CN_SYMBOL_MAP)) {
    if (lower === key.toLowerCase()) return code;
  }
  // Substring match (longer keys first to avoid false positives)
  const sorted = Object.entries(CN_SYMBOL_MAP).sort((a, b) => b[0].length - a[0].length);
  for (const [key, code] of sorted) {
    if (lower.includes(key.toLowerCase())) return code;
  }
  return null;
}

// ── Main intent parser ─────────────────────────────���──────────────────────────

export function parseLineIntent(text: string): LineIntent {
  const raw = text.trim();
  const t = raw.toLowerCase();

  // ── HELP ──────��─────────────────────────────────────────────────────────────
  if (/^(帮助|幫助|使用指南|菜单|菜單|功能|help|\/help|ガイド|使い方|ヘルプ|\/start|start)$/.test(raw.trim())) {
    return { type: "HELP" };
  }

  // ── DATA_SOURCE ─────────────────────────��─────────────────────────���──────────
  if (/(数据|データ).*(哪里|来源|来自|どこ|源)|数据来源|データソース|评分怎么算|あなた.*データ|データ.*準|データ.*正確/.test(t)) {
    return { type: "DATA_SOURCE" };
  }

  // ── TOP_PICKS ─────────────────────────────��──────────────────────────────────
  // "再推荐五只" → limit=5, "推荐十只" → limit=10
  const rePicksMatch = raw.match(/再推荐\s*([五六七八九十\d]+)\s*只?|再推薦\s*([五六七八九十\d]+)/);
  if (rePicksMatch) {
    const n = parseJpNum(rePicksMatch[1] ?? rePicksMatch[2]);
    return { type: "TOP_PICKS", limit: n };
  }

  const tenMatch = raw.match(/推荐\s*([十五六七八九\d]+)\s*只?|推薦\s*([十五六七八九\d]+)/);
  if (tenMatch) {
    const n = parseJpNum(tenMatch[1] ?? tenMatch[2]);
    return { type: "TOP_PICKS", limit: n };
  }

  if (/(今[天日]|明[天日]|这[周週]|今[周週])?(买什么|买哪|推荐|ai推荐|ai推薦|今日推|今日のおすすめ|picks|top10?|购买推荐)/i.test(t)) {
    return { type: "TOP_PICKS", limit: 10 };
  }

  // ── TECH_THEME ────────────────────────────���───────────────────────��──────────
  if (/(科技股.*最强|最强.*科技|ai.*最强|科技.*谁|科技.*哪|ai产业链|科技主题|テーマ株|ait産業チェーン)/.test(t)) {
    return { type: "TECH_THEME" };
  }
  if (/^(科技股|ai产业链|ai産業チェーン|テーマ株)$/.test(raw.trim().toLowerCase())) {
    return { type: "TECH_THEME" };
  }

  // ── SECTOR_OUTLOOK ──────────────────────��────────────────────────────────────
  // Check longest sector keyword first
  const sectorKeys = Object.keys(SECTOR_MAP).sort((a, b) => b.length - a.length);
  for (const key of sectorKeys) {
    if (t.includes(key)) {
      const { sectors, label } = SECTOR_MAP[key];
      return { type: "SECTOR_OUTLOOK", sectors, sectorLabel: label };
    }
  }
  // Broad sector patterns
  if (/(半[导導]体|semiconductor|chip|チップ)/.test(t)) {
    return { type: "SECTOR_OUTLOOK", sectors: ["電機・精密"], sectorLabel: "半导体" };
  }
  if (/(自動車|自動车|ev|電気自動車|新能源)/.test(t)) {
    return { type: "SECTOR_OUTLOOK", sectors: ["自動車・輸送機"], sectorLabel: "汽车" };
  }
  if (/(銀行|银行|banking|金融)/.test(t)) {
    return { type: "SECTOR_OUTLOOK", sectors: ["銀行業", "証券・商品先物取引業", "保険業"], sectorLabel: "金融" };
  }

  // ── MARKET_OVERVIEW ──────────────────────────────────────────────────────────
  if (/(市场|市場|行情|大盘|大盤|日[股経经]|ニッケイ|日経|日经|nikkei|topix|纳斯达克|nasdaq|vix|恐慌|美元|汇率|为替|今日.*市場|今天.*市场)/.test(t)) {
    return { type: "MARKET_OVERVIEW" };
  }

  // ── STOCK_ANALYSIS ───────────────────────────��───────────────────────────────
  // 1. Exact 4-digit code
  const codeMatch = raw.match(/^(\d{4})(\.T)?$/);
  if (codeMatch) {
    return { type: "STOCK_ANALYSIS", symbol: codeMatch[1] + ".T" };
  }

  // 2. "分析XXXX" / "分析 丰田" etc.
  const analysisPrefix = /^(分析|解析|analyze|查询|查询|調べて|見せて|教えて)\s*/i;
  if (analysisPrefix.test(raw)) {
    const query = raw.replace(analysisPrefix, "").trim();
    if (!query) return { type: "HELP" };
    const codeOnly = query.match(/^(\d{4})(\.T)?$/);
    if (codeOnly) {
      return { type: "STOCK_ANALYSIS", symbol: codeOnly[1] + ".T" };
    }
    const resolved = resolveCompanyToSymbol(query);
    if (resolved) {
      return { type: "STOCK_ANALYSIS", symbol: resolved + ".T", nameQuery: query };
    }
    return { type: "STOCK_ANALYSIS", symbol: query + ".T", nameQuery: query };
  }

  // 3. "XXXX怎么样" / "XXXX值得买吗" / "XXXX能买吗"
  const stockQueryMatch = raw.match(/^(.{1,12}?)[\s　]*(怎么样|怎麼樣|如何|好不好|能买吗|能買嗎|值得买|值得買|买入吗|買入嗎|おすすめ|買える|いい銘柄|分析して)$/);
  if (stockQueryMatch) {
    const query = stockQueryMatch[1].trim();
    const codeOnly = query.match(/^(\d{4})(\.T)?$/);
    if (codeOnly) {
      return { type: "STOCK_ANALYSIS", symbol: codeOnly[1] + ".T" };
    }
    const resolved = resolveCompanyToSymbol(query);
    if (resolved) {
      return { type: "STOCK_ANALYSIS", symbol: resolved + ".T", nameQuery: query };
    }
  }

  // 4. Pure company name lookup (no suffix)
  const resolved = resolveCompanyToSymbol(raw);
  if (resolved) {
    return { type: "STOCK_ANALYSIS", symbol: resolved + ".T", nameQuery: raw };
  }

  // ── UNKNOWN ───────────────���───────────────────────────────��──────────────────
  return { type: "UNKNOWN", text: raw };
}

// ── Parse Japanese/Chinese number words ──────────────────────────────────────

function parseJpNum(s: string): number {
  const numMap: Record<string, number> = {
    一: 1, 二: 2, 三: 3, 四: 4, 五: 5,
    六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
  };
  if (/^\d+$/.test(s)) return Math.min(20, Math.max(1, parseInt(s, 10)));
  let n = 0;
  for (const ch of s) {
    n += numMap[ch] ?? 0;
  }
  return n > 0 ? Math.min(20, n) : 10;
}
