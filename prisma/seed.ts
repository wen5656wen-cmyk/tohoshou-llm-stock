import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

const stocks = [
  {
    symbol: "7203.T",
    name: "トヨタ自動車",
    nameEn: "Toyota Motor Corporation",
    market: "TSE Prime",
    price: 2847,
    change: 32,
    changeRate: 1.14,
    marketCap: 291000,
    per: 8.5,
    pbr: 1.21,
    roe: 14.1,
    roa: 5.2,
    dividend: 2.11,
    sector: "輸送用機器",
    industry: "自動車",
    description:
      "世界最大の自動車メーカー。ハイブリッド車・EV・FCV等の次世代車を展開。",
    website: "https://global.toyota",
    employees: 375235,
    aiScore: 78,
  },
  {
    symbol: "6758.T",
    name: "ソニーグループ",
    nameEn: "Sony Group Corporation",
    market: "TSE Prime",
    price: 2936,
    change: -18,
    changeRate: -0.61,
    marketCap: 185000,
    per: 18.2,
    pbr: 2.14,
    roe: 11.6,
    roa: 4.1,
    dividend: 0.68,
    sector: "電気機器",
    industry: "電子機器・エンタメ",
    description:
      "エレクトロニクス・エンタテインメント・金融の多角的グループ。PlayStation・映画・音楽等を展開。",
    website: "https://www.sony.com",
    employees: 113000,
    aiScore: 71,
  },
  {
    symbol: "9984.T",
    name: "ソフトバンクグループ",
    nameEn: "SoftBank Group Corp.",
    market: "TSE Prime",
    price: 9890,
    change: 210,
    changeRate: 2.17,
    marketCap: 168000,
    per: null,
    pbr: 1.82,
    roe: null,
    roa: null,
    dividend: 0.91,
    sector: "情報・通信業",
    industry: "IT投資・通信",
    description:
      "テクノロジー投資会社。ビジョンファンドを通じてAI・テック企業に投資。",
    website: "https://www.softbank.jp",
    employees: 53000,
    aiScore: 62,
  },
  {
    symbol: "7974.T",
    name: "任天堂",
    nameEn: "Nintendo Co., Ltd.",
    market: "TSE Prime",
    price: 8450,
    change: 95,
    changeRate: 1.14,
    marketCap: 109500,
    per: 22.4,
    pbr: 3.82,
    roe: 17.2,
    roa: 12.8,
    dividend: 2.49,
    sector: "その他製品",
    industry: "ゲーム・エンタテインメント",
    description:
      "世界的ゲームメーカー。Switch・マリオ・ゼルダ等の人気IPを保有。",
    website: "https://www.nintendo.co.jp",
    employees: 7200,
    aiScore: 82,
  },
  {
    symbol: "9983.T",
    name: "ファーストリテイリング",
    nameEn: "Fast Retailing Co., Ltd.",
    market: "TSE Prime",
    price: 52400,
    change: -320,
    changeRate: -0.61,
    marketCap: 165000,
    per: 42.1,
    pbr: 11.24,
    roe: 26.5,
    roa: 10.3,
    dividend: 1.03,
    sector: "小売業",
    industry: "アパレル小売",
    description:
      "ユニクロを中核とするアパレル世界大手。グローバルに高品質・低価格衣料を展開。",
    website: "https://www.fastretailing.com",
    employees: 58000,
    aiScore: 75,
  },
  {
    symbol: "6861.T",
    name: "キーエンス",
    nameEn: "KEYENCE CORPORATION",
    market: "TSE Prime",
    price: 67100,
    change: 1200,
    changeRate: 1.82,
    marketCap: 163000,
    per: 38.5,
    pbr: 8.22,
    roe: 21.3,
    roa: 19.1,
    dividend: 0.52,
    sector: "電気機器",
    industry: "センサー・FA機器",
    description:
      "工場自動化センサー・計測機器の世界最大手。超高収益体質で知られる。",
    website: "https://www.keyence.co.jp",
    employees: 10800,
    aiScore: 85,
  },
  {
    symbol: "8306.T",
    name: "三菱UFJフィナンシャル・グループ",
    nameEn: "Mitsubishi UFJ Financial Group",
    market: "TSE Prime",
    price: 1842,
    change: 28,
    changeRate: 1.54,
    marketCap: 245000,
    per: 12.8,
    pbr: 1.15,
    roe: 9.2,
    roa: 0.6,
    dividend: 3.04,
    sector: "銀行業",
    industry: "都市銀行",
    description:
      "日本最大の銀行グループ。国内外での金融サービスを幅広く展開。",
    website: "https://www.mufg.jp",
    employees: 170000,
    aiScore: 69,
  },
  {
    symbol: "4519.T",
    name: "中外製薬",
    nameEn: "Chugai Pharmaceutical Co., Ltd.",
    market: "TSE Prime",
    price: 6420,
    change: -45,
    changeRate: -0.70,
    marketCap: 102000,
    per: 32.6,
    pbr: 7.41,
    roe: 22.7,
    roa: 18.5,
    dividend: 0.62,
    sector: "医薬品",
    industry: "製薬",
    description:
      "ロシュグループの中核。抗がん剤・バイオ医薬品で国内トップクラス。",
    website: "https://www.chugai-pharm.co.jp",
    employees: 8000,
    aiScore: 80,
  },
  {
    symbol: "9432.T",
    name: "日本電信電話",
    nameEn: "Nippon Telegraph and Telephone Corporation",
    market: "TSE Prime",
    price: 152,
    change: 2,
    changeRate: 1.33,
    marketCap: 196000,
    per: 10.2,
    pbr: 1.34,
    roe: 13.1,
    roa: 4.2,
    dividend: 3.29,
    sector: "情報・通信業",
    industry: "通信",
    description:
      "日本最大の通信グループ。NTTドコモ・NTTデータ等を傘下に持つ。",
    website: "https://www.ntt.co.jp",
    employees: 330000,
    aiScore: 67,
  },
  {
    symbol: "6902.T",
    name: "デンソー",
    nameEn: "DENSO CORPORATION",
    market: "TSE Prime",
    price: 2340,
    change: 15,
    changeRate: 0.64,
    marketCap: 72000,
    per: 14.2,
    pbr: 1.56,
    roe: 11.0,
    roa: 5.8,
    dividend: 1.88,
    sector: "輸送用機器",
    industry: "自動車部品",
    description:
      "トヨタ系の自動車部品最大手。電動化・自動運転関連部品で成長。",
    website: "https://www.denso.com",
    employees: 168000,
    aiScore: 73,
  },
];

const financials = [
  {
    symbol: "7203.T",
    fiscalYear: 2024,
    quarter: null,
    revenue: 45095316,
    operatingProfit: 5352948,
    ordinaryProfit: 6011619,
    netProfit: 4944933,
    totalAssets: 90421282,
    equity: 30541243,
    eps: 355.4,
    bps: 2391.5,
    roe: 14.1,
    roa: 5.2,
    equityRatio: 33.8,
    dividendPerShare: 60.0,
  },
  {
    symbol: "6758.T",
    fiscalYear: 2024,
    quarter: null,
    revenue: 13020829,
    operatingProfit: 1208824,
    ordinaryProfit: 1192456,
    netProfit: 970559,
    totalAssets: 26894132,
    equity: 7542186,
    eps: 161.2,
    bps: 1374.8,
    roe: 11.6,
    roa: 4.1,
    equityRatio: 28.1,
    dividendPerShare: 20.0,
  },
  {
    symbol: "7974.T",
    fiscalYear: 2024,
    quarter: null,
    revenue: 1671982,
    operatingProfit: 528369,
    ordinaryProfit: 621847,
    netProfit: 490085,
    totalAssets: 3820451,
    equity: 2854623,
    eps: 377.1,
    bps: 2213.5,
    roe: 17.2,
    roa: 12.8,
    equityRatio: 74.7,
    dividendPerShare: 210.0,
  },
];

const news = [
  {
    symbol: "7203.T",
    title: "トヨタ自動車、2024年度通期決算で純利益4.9兆円の過去最高益を更新",
    content:
      "トヨタ自動車は2024年度通期決算を発表し、純利益が4兆9449億円と過去最高益を更新したと発表した。世界的な自動車需要の回復や円安効果、ハイブリッド車の好調な販売が寄与した。",
    source: "Yahoo Finance Japan",
    url: "https://finance.yahoo.co.jp/news/toyota-2024-record-profit",
    publishedAt: new Date("2024-05-08T09:00:00Z"),
    sentiment: "POSITIVE",
    importance: 9,
  },
  {
    symbol: "6758.T",
    title: "ソニーG、PS5販売台数が5500万台突破 ゲーム事業好調",
    content:
      "ソニーグループは、PlayStation 5の累計販売台数が5500万台を突破したと発表した。ゲームソフトウェアおよびサービスの収益も過去最高水準に達している。",
    source: "Kabutan",
    url: "https://kabutan.jp/news/marketnews/sony-ps5-sales",
    publishedAt: new Date("2024-11-05T06:30:00Z"),
    sentiment: "POSITIVE",
    importance: 7,
  },
  {
    symbol: "9984.T",
    title: "ソフトバンクG、ARM株上昇でビジョンファンド含み益が拡大",
    content:
      "ソフトバンクグループが保有するARM Holdingsの株価上昇により、ビジョンファンドの含み益が大幅に拡大している。AI半導体需要の高まりがARMの業績を押し上げている。",
    source: "TDnet",
    url: "https://tdnet.info/softbank-arm-unrealized-gains",
    publishedAt: new Date("2024-10-15T08:00:00Z"),
    sentiment: "POSITIVE",
    importance: 8,
  },
  {
    symbol: "7974.T",
    title: "任天堂、次世代機「Nintendo Switch 2」を2025年発売へ",
    content:
      "任天堂は次世代ゲーム機「Nintendo Switch 2」を2025年内に発売すると発表した。現行Switchの後継機として4K解像度や強化されたプロセッサーを搭載する見込み。",
    source: "Yahoo Finance Japan",
    url: "https://finance.yahoo.co.jp/news/nintendo-switch2-2025",
    publishedAt: new Date("2025-01-16T07:00:00Z"),
    sentiment: "POSITIVE",
    importance: 9,
  },
  {
    symbol: "9983.T",
    title: "ユニクロ、中国事業が回復基調 アジア展開を加速",
    content:
      "ファーストリテイリングは中国の既存店売上が前年比でプラス転換したと発表。東南アジア・インドへの新規出店を加速させ、2026年度末までにグローバル4000店体制を目指す。",
    source: "Kabutan",
    url: "https://kabutan.jp/news/marketnews/fastretailing-china-recovery",
    publishedAt: new Date("2024-10-10T08:30:00Z"),
    sentiment: "POSITIVE",
    importance: 7,
  },
  {
    symbol: "6861.T",
    title: "キーエンス、FA需要回復でQ2営業利益が前期比15%増",
    content:
      "キーエンスの第2四半期決算は製造業向けFA需要の回復を背景に営業利益が前期比15%増となった。特に中国市場での受注が持ち直し、通期業績予想を上方修正した。",
    source: "TDnet",
    url: "https://tdnet.info/keyence-q2-earnings",
    publishedAt: new Date("2024-11-12T09:00:00Z"),
    sentiment: "POSITIVE",
    importance: 8,
  },
  {
    symbol: "8306.T",
    title: "三菱UFJ、日銀利上げで利ざや改善 通期純利益を上方修正",
    content:
      "三菱UFJフィナンシャル・グループは日本銀行の追加利上げを受け、国内貸出金利が上昇し利ざやが改善していると発表。2024年度通期の純利益予想を1兆5000億円に上方修正した。",
    source: "Yahoo Finance Japan",
    url: "https://finance.yahoo.co.jp/news/mufg-boj-rate-hike-profit",
    publishedAt: new Date("2025-01-30T10:00:00Z"),
    sentiment: "POSITIVE",
    importance: 8,
  },
  {
    symbol: null,
    title: "日銀、政策金利を0.5%に引き上げ 17年ぶり高水準",
    content:
      "日本銀行は金融政策決定会合で政策金利を0.25%から0.5%に引き上げることを決定した。17年ぶりの高水準となり、円高・株安の動きが一時的に強まった。",
    source: "TDnet",
    url: "https://tdnet.info/boj-rate-hike-05pct",
    publishedAt: new Date("2025-01-24T12:00:00Z"),
    sentiment: "NEUTRAL",
    importance: 10,
  },
];

const analyses = [
  {
    symbol: "7203.T",
    model: "gpt-4o-mini",
    analysisType: "COMPREHENSIVE",
    score: 78,
    recommendation: "BUY",
    summary:
      "トヨタ自動車はPER8.5倍という低バリュエーションと14.1%のROEを誇り、ハイブリッド・EV双方への対応力が際立つ。円安恩恵に加え、北米需要の堅調さが業績を支える。配当利回り2.1%も魅力的。ただし中国市場での競争激化と原材料コスト上昇がリスク要因。",
    bullPoints: [
      "PER8.5倍の低バリュエーション",
      "HV・EV両にらみの柔軟な戦略",
      "配当利回り2.1%の安定還元",
      "北米市場での強固なシェア",
    ],
    bearPoints: [
      "中国EV競合の台頭でシェア圧迫",
      "円高進行時の業績下振れリスク",
    ],
    targetPrice: 3200,
    riskLevel: "LOW",
  },
  {
    symbol: "6758.T",
    model: "gpt-4o-mini",
    analysisType: "COMPREHENSIVE",
    score: 71,
    recommendation: "BUY",
    summary:
      "ソニーグループはゲーム・音楽・映画・半導体と多角化した収益基盤が強み。PS5の普及によるゲームサービス収益の成長が加速中。CMOSイメージセンサーはスマホ向けで圧倒的シェア。ただし映像機器市場の縮小と投資事業の変動性に留意が必要。",
    bullPoints: [
      "PS5普及でゲームサービス収益拡大",
      "CMOSセンサーで圧倒的世界シェア",
      "音楽・映画IPポートフォリオが安定収益源",
    ],
    bearPoints: [
      "テレビ等映像機器市場の構造的縮小",
      "投資・金融事業の業績変動",
    ],
    targetPrice: 3300,
    riskLevel: "MEDIUM",
  },
  {
    symbol: "7974.T",
    model: "deepseek-chat",
    analysisType: "DAILY_PICK",
    score: 82,
    recommendation: "BUY",
    summary:
      "任天堂はSwitch 2発売期待から株価上昇余地が大きい。マリオ・ゼルダ等の強力なIP資産とソフト・ハード一体型のエコシステムが競争優位を形成。現金豊富なバランスシートと2.5%の高配当も評価できる。",
    bullPoints: [
      "Switch 2発売による業績加速期待",
      "マリオ・ポケモン等の不変IP価値",
      "潤沢な手元キャッシュと2.5%配当",
    ],
    bearPoints: ["Switch 2普及ペースの不確実性", "モバイルゲーム収益の伸び悩み"],
    targetPrice: 9500,
    riskLevel: "LOW",
  },
];

async function main() {
  console.log("🌱 Seeding database...");

  await prisma.aIAnalysis.deleteMany();
  await prisma.news.deleteMany();
  await prisma.financial.deleteMany();
  await prisma.portfolio.deleteMany();
  await prisma.stock.deleteMany();

  const stockMap: Record<string, number> = {};

  for (const s of stocks) {
    const stock = await prisma.stock.create({ data: s });
    stockMap[s.symbol] = stock.id;
    console.log(`  ✅ Stock: ${s.name} (${s.symbol})`);
  }

  for (const f of financials) {
    const { symbol, ...data } = f;
    await prisma.financial.create({
      data: { ...data, stockId: stockMap[symbol] },
    });
  }
  console.log(`  ✅ Financials: ${financials.length}件`);

  for (const n of news) {
    const { symbol, ...data } = n;
    await prisma.news.create({
      data: {
        ...data,
        stockId: symbol ? stockMap[symbol] : null,
      },
    });
  }
  console.log(`  ✅ News: ${news.length}件`);

  for (const a of analyses) {
    const { symbol, ...data } = a;
    await prisma.aIAnalysis.create({
      data: { ...data, stockId: stockMap[symbol] },
    });
  }
  console.log(`  ✅ AIAnalysis: ${analyses.length}件`);

  await prisma.portfolio.createMany({
    data: [
      {
        stockId: stockMap["7203.T"],
        symbol: "7203.T",
        name: "トヨタ自動車",
        shares: 100,
        avgPrice: 2650,
        note: "長期保有・配当狙い",
      },
      {
        stockId: stockMap["7974.T"],
        symbol: "7974.T",
        name: "任天堂",
        shares: 20,
        avgPrice: 7800,
        note: "Switch 2期待",
      },
      {
        stockId: stockMap["6861.T"],
        symbol: "6861.T",
        name: "キーエンス",
        shares: 5,
        avgPrice: 63000,
        note: "FA回復局面",
      },
    ],
  });
  console.log("  ✅ Portfolio: 3件");

  console.log("✨ Seed complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
