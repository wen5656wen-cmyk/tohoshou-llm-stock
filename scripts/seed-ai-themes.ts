#!/usr/bin/env npx tsx
/**
 * scripts/seed-ai-themes.ts
 * v8.0 AI产业链地图 — 14细分主题，100+条目
 * 用法：npx tsx scripts/seed-ai-themes.ts
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

type Layer = "UPSTREAM" | "MIDSTREAM" | "DOWNSTREAM" | "INFRASTRUCTURE" | "APPLICATION";

type ThemeEntry = {
  symbol: string;
  theme: string;
  subTheme: string;
  role: string;
  supplyChainLayer: Layer;
  importanceScore: number;
  reason: string;
  riskNote?: string;
  isCore: boolean;
};

// ─── 1. AI芯片设计・AI半导体 ────────────────────────────────────────────────
const CHIP_DESIGN: ThemeEntry[] = [
  {
    symbol: "6723.T", theme: "CHIP_DESIGN", subTheme: "マイコン・SoC",
    role: "汽车/工业AI芯片设计（SoC/MCU）", supplyChainLayer: "UPSTREAM",
    importanceScore: 9, isCore: true,
    reason: "日本最大半导体设计公司，汽车AI芯片市占率全球前3",
    riskNote: "汽车周期敏感，TSMC供货依赖",
  },
  {
    symbol: "6963.T", theme: "CHIP_DESIGN", subTheme: "パワー半導体",
    role: "电源管理IC/功率半导体", supplyChainLayer: "UPSTREAM",
    importanceScore: 7, isCore: false,
    reason: "AI服务器电源管理IC供应商",
    riskNote: "与德州仪器/英飞凌直接竞争",
  },
  {
    symbol: "6965.T", theme: "CHIP_DESIGN", subTheme: "光センサー半導体",
    role: "光探测器/图像传感芯片", supplyChainLayer: "UPSTREAM",
    importanceScore: 8, isCore: false,
    reason: "AI医疗+自动驾驶光学传感核心供应商，LIDAR受益",
    riskNote: "客户集中，需求波动较大",
  },
  {
    symbol: "6875.T", theme: "CHIP_DESIGN", subTheme: "ASIC・SoC受託設計",
    role: "AI Edge ASIC/SoC设计（任天堂/自动驾驶定制芯片）", supplyChainLayer: "UPSTREAM",
    importanceScore: 7, isCore: false,
    reason: "日本最具代表性的ASIC设计公司，游戏→汽车AI Edge芯片转型",
    riskNote: "任天堂订单集中，AI Edge芯片商业化仍在早期",
  },
  {
    symbol: "6758.T", theme: "CHIP_DESIGN", subTheme: "CMOSイメージセンサー",
    role: "AI视觉CMOS图像传感器设计（全球市占率首位）", supplyChainLayer: "UPSTREAM",
    importanceScore: 9, isCore: true,
    reason: "智能手机/自动驾驶/安防AI视觉传感器核心，AI时代图像入口",
    riskNote: "智能手机需求波动，苹果依存度高",
  },
  {
    symbol: "6504.T", theme: "CHIP_DESIGN", subTheme: "パワー半導体",
    role: "AI服务器/EV功率半导体设计（IGBT/SiC/GaN）", supplyChainLayer: "UPSTREAM",
    importanceScore: 7, isCore: false,
    reason: "富士电机功率器件覆盖AI数据中心UPS/变频器应用",
    riskNote: "与三菱电机/英飞凌竞争激烈",
  },
];

// ─── 2. AI半导体设备 ─────────────────────────────────────────────────────────
const SEMI_EQUIPMENT: ThemeEntry[] = [
  {
    symbol: "8035.T", theme: "SEMI_EQUIPMENT", subTheme: "CVD/エッチング/成膜",
    role: "CVD/ALD/エッチング装置（先端ロジック必須）", supplyChainLayer: "MIDSTREAM",
    importanceScore: 10, isCore: true,
    reason: "TSMCのN2/A16工程必须装置，AI算力芯片直接受益",
    riskNote: "出口管制风险，中国营收占比约17%",
  },
  {
    symbol: "7735.T", theme: "SEMI_EQUIPMENT", subTheme: "洗浄・コーティング",
    role: "晶圆清洗/涂布显影装置", supplyChainLayer: "MIDSTREAM",
    importanceScore: 9, isCore: true,
    reason: "先端制程清洗装置全球市占率首位",
    riskNote: "中国出口管制影响约25%营收",
  },
  {
    symbol: "6920.T", theme: "SEMI_EQUIPMENT", subTheme: "EUVマスク検査",
    role: "EUVマスク欠陥检査装置", supplyChainLayer: "MIDSTREAM",
    importanceScore: 9, isCore: true,
    reason: "EUV mask blank检测全球唯一，AI芯片最先端制程不可替代",
    riskNote: "高估值，单一产品依赖，延迟风险",
  },
  {
    symbol: "6146.T", theme: "SEMI_EQUIPMENT", subTheme: "ダイシング・研削",
    role: "晶圆划片/减薄设备", supplyChainLayer: "MIDSTREAM",
    importanceScore: 9, isCore: true,
    reason: "HBM/先进封装减薄工艺核心设备，AI内存爆发直接受益",
    riskNote: "竞争加剧，华为供应商替代",
  },
  {
    symbol: "6857.T", theme: "SEMI_EQUIPMENT", subTheme: "メモリテスター",
    role: "AI加速器/HBM内存测试装置", supplyChainLayer: "MIDSTREAM",
    importanceScore: 9, isCore: true,
    reason: "H100/B200 GPU测试装置主供，SK Hynix HBM全测",
    riskNote: "NVIDIA订单集中度高",
  },
  {
    symbol: "7729.T", theme: "SEMI_EQUIPMENT", subTheme: "CMP・精密測定",
    role: "CMP/精密测量装置", supplyChainLayer: "MIDSTREAM",
    importanceScore: 8, isCore: false,
    reason: "先进封装平坦化工艺不可缺，HBM受益",
    riskNote: "规模较TEL小，竞争压力",
  },
  {
    symbol: "6315.T", theme: "SEMI_EQUIPMENT", subTheme: "モールディング",
    role: "封装成型装置（モールド）", supplyChainLayer: "MIDSTREAM",
    importanceScore: 7, isCore: false,
    reason: "AI芯片封装工艺中段，CoWoS成型设备",
    riskNote: "下游需求波动放大",
  },
  {
    symbol: "6254.T", theme: "SEMI_EQUIPMENT", subTheme: "超純水・CMP",
    role: "超純水製造/CMP浆料供应", supplyChainLayer: "MIDSTREAM",
    importanceScore: 7, isCore: false,
    reason: "晶圆制程超纯水不可或缺",
    riskNote: "水处理设备可替代性较高",
  },
];

// ─── 3. AI测试设备 ───────────────────────────────────────────────────────────
const TEST_EQUIPMENT: ThemeEntry[] = [
  {
    symbol: "6857.T", theme: "TEST_EQUIPMENT", subTheme: "SoCテスター",
    role: "GPU/AI SoC终测装置（ATE）", supplyChainLayer: "MIDSTREAM",
    importanceScore: 10, isCore: true,
    reason: "Nvidia Blackwell全量测试供应商，AI芯片产量扩张直接受益",
    riskNote: "客户集中，单季度波动大",
  },
  {
    symbol: "7729.T", theme: "TEST_EQUIPMENT", subTheme: "ウェーハ測定",
    role: "晶圆级精密测量/探针台", supplyChainLayer: "MIDSTREAM",
    importanceScore: 8, isCore: false,
    reason: "前工段测量设备，与TEL工程协同",
    riskNote: "市场份额偏小",
  },
  {
    symbol: "6871.T", theme: "TEST_EQUIPMENT", subTheme: "ボンディングワイヤ",
    role: "封装键合线/超细铜线", supplyChainLayer: "MIDSTREAM",
    importanceScore: 7, isCore: false,
    reason: "AI封装细节材料，FOPLP/2.5D受益",
    riskNote: "铜价波动成本传导",
  },
  {
    symbol: "6966.T", theme: "TEST_EQUIPMENT", subTheme: "リードフレーム",
    role: "精密冲压零件/引线框架", supplyChainLayer: "MIDSTREAM",
    importanceScore: 7, isCore: false,
    reason: "AI边缘芯片封装关键零件",
    riskNote: "低附加值领域竞争激烈",
  },
  {
    symbol: "7701.T", theme: "TEST_EQUIPMENT", subTheme: "分析計測",
    role: "材料/元素分析仪器", supplyChainLayer: "MIDSTREAM",
    importanceScore: 8, isCore: false,
    reason: "半导体材料质量检测核心仪器",
    riskNote: "非纯AI主题，受益间接",
  },
  {
    symbol: "6951.T", theme: "TEST_EQUIPMENT", subTheme: "電子顕微鏡",
    role: "SEM/TEM电子显微镜（缺陷检查）", supplyChainLayer: "MIDSTREAM",
    importanceScore: 8, isCore: false,
    reason: "EUV制程缺陷检测，先端制程不可或缺",
    riskNote: "KLA/应用材料竞争",
  },
];

// ─── 4. AI芯片材料 ───────────────────────────────────────────────────────────
const CHIP_MATERIAL: ThemeEntry[] = [
  {
    symbol: "4063.T", theme: "CHIP_MATERIAL", subTheme: "EUVフォトレジスト・シリコンウェーハ",
    role: "EUV光刻胶+硅晶圆（双料）", supplyChainLayer: "UPSTREAM",
    importanceScore: 10, isCore: true,
    reason: "全球EUV光刻胶市占率第一，硅晶圆排名前二，AI芯片上游护城河极深",
    riskNote: "日本出口管制政策风险",
  },
  {
    symbol: "3436.T", theme: "CHIP_MATERIAL", subTheme: "シリコンウェーハ",
    role: "300mm硅晶圆供应商（AI服务器芯片基底）", supplyChainLayer: "UPSTREAM",
    importanceScore: 10, isCore: true,
    reason: "全球第2大硅晶圆供应商，TSMC/Samsung主要供应商",
    riskNote: "晶圆价格周期下行风险",
  },
  {
    symbol: "4186.T", theme: "CHIP_MATERIAL", subTheme: "フォトレジスト",
    role: "先进制程光刻胶（KrF/ArF/EUV）", supplyChainLayer: "UPSTREAM",
    importanceScore: 9, isCore: true,
    reason: "AI芯片ArF光刻胶全球市占率前三",
    riskNote: "价格竞争，需持续R&D投入",
  },
  {
    symbol: "4005.T", theme: "CHIP_MATERIAL", subTheme: "半導体材料",
    role: "光刻胶/电子材料综合供应商", supplyChainLayer: "UPSTREAM",
    importanceScore: 8, isCore: false,
    reason: "半导体用特殊化学材料多品种布局",
    riskNote: "农化/医药业务拖累，结构转型中",
  },
  {
    symbol: "4205.T", theme: "CHIP_MATERIAL", subTheme: "フォトレジスト",
    role: "EUV光刻胶/特殊合成树脂", supplyChainLayer: "UPSTREAM",
    importanceScore: 8, isCore: false,
    reason: "EUV光刻胶新材料研发中，次世代潜力",
    riskNote: "规模较信越/TOK小",
  },
  {
    symbol: "4118.T", theme: "CHIP_MATERIAL", subTheme: "ポリイミド",
    role: "聚酰亚胺薄膜/封装绝缘材料", supplyChainLayer: "UPSTREAM",
    importanceScore: 7, isCore: false,
    reason: "AI封装用高性能聚酰亚胺薄膜",
    riskNote: "竞争对手众多",
  },
  {
    symbol: "4042.T", theme: "CHIP_MATERIAL", subTheme: "特殊化学品",
    role: "高纯特殊气体/化学品", supplyChainLayer: "UPSTREAM",
    importanceScore: 7, isCore: false,
    reason: "刻蚀用特殊气体供应商",
    riskNote: "大宗化学品价格波动影响",
  },
  {
    symbol: "4188.T", theme: "CHIP_MATERIAL", subTheme: "機能性フィルム",
    role: "功能性材料/半导体封装树脂", supplyChainLayer: "UPSTREAM",
    importanceScore: 8, isCore: false,
    reason: "先进封装用功能性树脂，CoWoS底填料受益",
    riskNote: "化工整体盈利能力不稳定",
  },
];

// ─── 5. HBM・先进封装 ────────────────────────────────────────────────────────
const HBM_PACKAGING: ThemeEntry[] = [
  {
    symbol: "4062.T", theme: "HBM_PACKAGING", subTheme: "FC-BGAサブストレート",
    role: "FC-BGA基板（GPU/HBM封装核心）", supplyChainLayer: "MIDSTREAM",
    importanceScore: 10, isCore: true,
    reason: "NVIDIA H100/B200 FC-BGA基板主供，AI算力需求直接受益",
    riskNote: "良率爬坡+资本投入大，FC-BGA供需波动",
  },
  {
    symbol: "6967.T", theme: "HBM_PACKAGING", subTheme: "ICサブストレート",
    role: "IC基板/ABF基板供应商", supplyChainLayer: "MIDSTREAM",
    importanceScore: 9, isCore: true,
    reason: "AI ASIC/GPU ABF基板供应商，产能扩张中",
    riskNote: "ABF基板供需周期波动",
  },
  {
    symbol: "7911.T", theme: "HBM_PACKAGING", subTheme: "回路基板",
    role: "印刷电路板/半导体封装基板", supplyChainLayer: "MIDSTREAM",
    importanceScore: 8, isCore: false,
    reason: "大型印刷基板厂，AI服务器PCB受益",
    riskNote: "传统印刷业务拖累",
  },
  {
    symbol: "7912.T", theme: "HBM_PACKAGING", subTheme: "回路基板",
    role: "高多层基板/光学基板", supplyChainLayer: "MIDSTREAM",
    importanceScore: 8, isCore: false,
    reason: "先进光学+基板双轨，AI服务器配套",
    riskNote: "传统印刷业务占比仍大",
  },
  {
    symbol: "6807.T", theme: "HBM_PACKAGING", subTheme: "コネクタ・端子",
    role: "高速连接器（AI服务器背板用）", supplyChainLayer: "MIDSTREAM",
    importanceScore: 7, isCore: false,
    reason: "高速传输连接器，AI数据中心需求受益",
    riskNote: "Amphenol/Molex竞争激烈",
  },
  {
    symbol: "5802.T", theme: "HBM_PACKAGING", subTheme: "銅リードフレーム・ワイヤー",
    role: "铜引线框架/封装导线", supplyChainLayer: "MIDSTREAM",
    importanceScore: 8, isCore: false,
    reason: "AI封装用高纯铜线材料",
    riskNote: "铜价波动，低附加值",
  },
  {
    symbol: "5801.T", theme: "HBM_PACKAGING", subTheme: "特殊銅合金",
    role: "封装用特种铜合金线材", supplyChainLayer: "MIDSTREAM",
    importanceScore: 7, isCore: false,
    reason: "半导体封装线材供应商",
    riskNote: "低毛利率，规模经济依赖",
  },
];

// ─── 6. AI传感器・精密部件 ───────────────────────────────────────────────────
const SENSOR_PRECISION: ThemeEntry[] = [
  {
    symbol: "6758.T", theme: "SENSOR_PRECISION", subTheme: "CMOSイメージセンサー",
    role: "CMOS图像传感器（全球首位）", supplyChainLayer: "UPSTREAM",
    importanceScore: 10, isCore: true,
    reason: "汽车AI+AI手机CMOS全球市占率约50%，不可替代",
    riskNote: "手机需求周期，中国竞争",
  },
  {
    symbol: "6981.T", theme: "SENSOR_PRECISION", subTheme: "MLCC・センサー",
    role: "AI设备MLCC/压力传感器", supplyChainLayer: "UPSTREAM",
    importanceScore: 9, isCore: true,
    reason: "AI服务器/AI手机MLCC核心供应商，需求爆发式增长",
    riskNote: "AI手机采购周期波动",
  },
  {
    symbol: "6971.T", theme: "SENSOR_PRECISION", subTheme: "セラミックパッケージ",
    role: "陶瓷封装/AI半导体基板", supplyChainLayer: "UPSTREAM",
    importanceScore: 8, isCore: false,
    reason: "AI设备陶瓷封装+功率模块",
    riskNote: "电信/汽车业务结构调整",
  },
  {
    symbol: "6762.T", theme: "SENSOR_PRECISION", subTheme: "センサー・インダクタ",
    role: "AI设备传感器/磁性元件", supplyChainLayer: "UPSTREAM",
    importanceScore: 8, isCore: false,
    reason: "AI服务器电源模块+汽车AI传感器受益",
    riskNote: "汽车EV减速影响",
  },
  {
    symbol: "6806.T", theme: "SENSOR_PRECISION", subTheme: "コネクタ",
    role: "高速精密连接器（AI设备专用）", supplyChainLayer: "UPSTREAM",
    importanceScore: 8, isCore: false,
    reason: "AI设备高频高速连接器，利基市场护城河",
    riskNote: "规模小，供应链冗余",
  },
  {
    symbol: "6645.T", theme: "SENSOR_PRECISION", subTheme: "産業センサー",
    role: "工业传感器/FA控制器", supplyChainLayer: "UPSTREAM",
    importanceScore: 8, isCore: false,
    reason: "AI工厂传感器前端感知，AI机器人感知层",
    riskNote: "中国工厂自动化需求下行",
  },
  {
    symbol: "7741.T", theme: "SENSOR_PRECISION", subTheme: "半導体マスク・光学",
    role: "EUV光掩模坯料（全球2强之一）", supplyChainLayer: "MIDSTREAM",
    importanceScore: 9, isCore: true,
    reason: "EUV mask blank全球市占率约25%，AI芯片最先端制程受益",
    riskNote: "Shin-Etsu竞争，EUV普及节奏",
  },
  {
    symbol: "6861.T", theme: "SENSOR_PRECISION", subTheme: "FA光学センサー",
    role: "工厂自动化传感器/计测仪器", supplyChainLayer: "APPLICATION",
    importanceScore: 9, isCore: true,
    reason: "AI工厂视觉检测龙头，高毛利SaaS型商业模式",
    riskNote: "中国需求减速",
  },
];

// ─── 7. AI服务器・数据中心 ───────────────────────────────────────────────────
const SERVER_DC: ThemeEntry[] = [
  {
    symbol: "3778.T", theme: "SERVER_DC", subTheme: "国産クラウド・DC",
    role: "国产AI云/GPU服务器出租", supplyChainLayer: "INFRASTRUCTURE",
    importanceScore: 9, isCore: true,
    reason: "日本政府AI政策+国产云直接受益，NVIDIA GPU服务器大量扩容",
    riskNote: "规模仍小，盈利能力待证",
  },
  {
    symbol: "6701.T", theme: "SERVER_DC", subTheme: "AIサーバー・システム",
    role: "AI服务器/HPC系统集成商", supplyChainLayer: "INFRASTRUCTURE",
    importanceScore: 9, isCore: true,
    reason: "日本政府AI算力基础设施核心承建商",
    riskNote: "政府采购依赖，海外竞争",
  },
  {
    symbol: "6702.T", theme: "SERVER_DC", subTheme: "HPC・AIシステム",
    role: "HPC/AI系统+富岳超算运营", supplyChainLayer: "INFRASTRUCTURE",
    importanceScore: 9, isCore: true,
    reason: "富岳后继机型+企业AI系统主承建商",
    riskNote: "IT服务毛利率偏低",
  },
  {
    symbol: "9432.T", theme: "SERVER_DC", subTheme: "国産DC・光ファイバー",
    role: "NTT国产DC/IOWN光网络基础设施", supplyChainLayer: "INFRASTRUCTURE",
    importanceScore: 9, isCore: true,
    reason: "IOWN全光网络+日本最大DC运营，AI算力骨干网",
    riskNote: "DC扩容投资规模大，ROI周期长",
  },
  {
    symbol: "9613.T", theme: "SERVER_DC", subTheme: "AIクラウド",
    role: "AI企业云/マルチクラウド运营", supplyChainLayer: "INFRASTRUCTURE",
    importanceScore: 8, isCore: false,
    reason: "日本企业AI数字化主要系统集成商",
    riskNote: "AWS/Azure竞争压力",
  },
  {
    symbol: "9433.T", theme: "SERVER_DC", subTheme: "クラウド・DC",
    role: "KDDI AI云/DC扩张", supplyChainLayer: "INFRASTRUCTURE",
    importanceScore: 8, isCore: false,
    reason: "KDDI Telehouse DC扩张，AI企业需求受益",
    riskNote: "通信主业成熟，DC增速待观察",
  },
  {
    symbol: "9434.T", theme: "SERVER_DC", subTheme: "AIインフラ",
    role: "SoftBank AI基础设施/EdgeAI", supplyChainLayer: "INFRASTRUCTURE",
    importanceScore: 8, isCore: false,
    reason: "软银AI战略持续投入，5G+EdgeAI协同",
    riskNote: "ARM持仓波动，财务杠杆高",
  },
  {
    symbol: "5803.T", theme: "SERVER_DC", subTheme: "光ファイバーケーブル",
    role: "DC间光纤互联/AI骨干网电缆", supplyChainLayer: "INFRASTRUCTURE",
    importanceScore: 8, isCore: false,
    reason: "AI DC大量部署光纤电缆受益，海底电缆布局",
    riskNote: "铜价+原料成本波动",
  },
  {
    symbol: "5801.T", theme: "SERVER_DC", subTheme: "光ファイバー",
    role: "光纤电缆/DC内部配线", supplyChainLayer: "INFRASTRUCTURE",
    importanceScore: 7, isCore: false,
    reason: "DC部署用光纤线缆",
    riskNote: "同质化竞争",
  },
];

// ─── 8. AI网络通信 ───────────────────────────────────────────────────────────
const NETWORK: ThemeEntry[] = [
  {
    symbol: "5803.T", theme: "NETWORK", subTheme: "海底ケーブル・光ファイバー",
    role: "海底/陆地光纤电缆（DC互联核心）", supplyChainLayer: "INFRASTRUCTURE",
    importanceScore: 9, isCore: true,
    reason: "AI DC间海底光缆爆发式需求，全球前3供应商",
    riskNote: "项目交付集中，营收波动大",
  },
  {
    symbol: "9432.T", theme: "NETWORK", subTheme: "IOWN全光ネットワーク",
    role: "全光网络IOWN/低遅延AI通信基础设施", supplyChainLayer: "INFRASTRUCTURE",
    importanceScore: 9, isCore: true,
    reason: "IOWN下一代全光网络，AI推理低延迟传输基础",
    riskNote: "IOWN商用时间表不确定",
  },
  {
    symbol: "6754.T", theme: "NETWORK", subTheme: "ネットワーク計測",
    role: "5G/AI网络测试仪器", supplyChainLayer: "INFRASTRUCTURE",
    importanceScore: 8, isCore: false,
    reason: "5G+AI网络质量测试装置核心供应商",
    riskNote: "市场规模有限",
  },
  {
    symbol: "9433.T", theme: "NETWORK", subTheme: "5G・クラウド",
    role: "5G网络/AI边缘计算", supplyChainLayer: "INFRASTRUCTURE",
    importanceScore: 8, isCore: false,
    reason: "5G EdgeAI+企业网络服务",
    riskNote: "5G ROI回收周期长",
  },
  {
    symbol: "9434.T", theme: "NETWORK", subTheme: "5G・エッジAI",
    role: "5G EdgeAI通信", supplyChainLayer: "INFRASTRUCTURE",
    importanceScore: 7, isCore: false,
    reason: "软银5G+EdgeAI联动",
    riskNote: "高债务结构",
  },
  {
    symbol: "3778.T", theme: "NETWORK", subTheme: "インターネットDC",
    role: "互联网骨干网/DC间互联", supplyChainLayer: "INFRASTRUCTURE",
    importanceScore: 8, isCore: false,
    reason: "国内AI DC间互联受益",
    riskNote: "规模相对小",
  },
  {
    symbol: "6701.T", theme: "NETWORK", subTheme: "ネットワーク機器",
    role: "网络设备/AI通信系统集成", supplyChainLayer: "INFRASTRUCTURE",
    importanceScore: 8, isCore: false,
    reason: "AI政府通信基础设施建设",
    riskNote: "Cisco竞争",
  },
  {
    symbol: "6702.T", theme: "NETWORK", subTheme: "通信システム",
    role: "AI通信网络系统", supplyChainLayer: "INFRASTRUCTURE",
    importanceScore: 7, isCore: false,
    reason: "通信基础设施AI化改造",
    riskNote: "海外市场竞争",
  },
];

// ─── 9. AI机器人・自动化 ─────────────────────────────────────────────────────
const ROBOT_AUTO: ThemeEntry[] = [
  {
    symbol: "6954.T", theme: "ROBOT_AUTO", subTheme: "産業ロボット・CNC",
    role: "工业机器人/CNC（全球第2）", supplyChainLayer: "APPLICATION",
    importanceScore: 10, isCore: true,
    reason: "AI工厂核心机器人，全球AI制造自动化主力",
    riskNote: "中国自动化需求下行风险",
  },
  {
    symbol: "6506.T", theme: "ROBOT_AUTO", subTheme: "サーボモーター・ロボット",
    role: "精密伺服电机/协作机器人", supplyChainLayer: "APPLICATION",
    importanceScore: 9, isCore: true,
    reason: "AI工厂协作机器人龙头，MOTOMAN系列国际竞争力强",
    riskNote: "中国竞争/汽车周期",
  },
  {
    symbol: "6861.T", theme: "ROBOT_AUTO", subTheme: "機械ビジョン・FA",
    role: "AI机器视觉检测（FA核心）", supplyChainLayer: "APPLICATION",
    importanceScore: 10, isCore: true,
    reason: "AI工厂视觉检测全球第一，每年30%以上利润增长",
    riskNote: "中国景气度影响",
  },
  {
    symbol: "6645.T", theme: "ROBOT_AUTO", subTheme: "FA制御システム",
    role: "FA控制器/AI工厂系统", supplyChainLayer: "APPLICATION",
    importanceScore: 8, isCore: false,
    reason: "AI工厂自动化控制系统，工业4.0核心",
    riskNote: "中国需求下行，医疗部门盈利压力",
  },
  {
    symbol: "6273.T", theme: "ROBOT_AUTO", subTheme: "空気圧機器",
    role: "气动元件（全球首位）", supplyChainLayer: "APPLICATION",
    importanceScore: 8, isCore: false,
    reason: "工业自动化气动首位，利基市场护城河深",
    riskNote: "中国市场需求减速",
  },
  {
    symbol: "6383.T", theme: "ROBOT_AUTO", subTheme: "物流自動化",
    role: "AI物流自动化系统（AGV/输送）", supplyChainLayer: "APPLICATION",
    importanceScore: 8, isCore: false,
    reason: "AI仓储自动化爆发，电商+半导体工厂受益",
    riskNote: "大型项目交付风险",
  },
  {
    symbol: "6479.T", theme: "ROBOT_AUTO", subTheme: "精密部品・モーター",
    role: "精密轴承/小型电机（AI设备用）", supplyChainLayer: "APPLICATION",
    importanceScore: 7, isCore: false,
    reason: "AI机器人精密部件核心供应商",
    riskNote: "HDD需求下行，转型压力",
  },
  {
    symbol: "7011.T", theme: "ROBOT_AUTO", subTheme: "産業システム・重工",
    role: "工业重型自动化/AI制造系统", supplyChainLayer: "APPLICATION",
    importanceScore: 8, isCore: false,
    reason: "AI製造业自动化+防卫AI系统双受益",
    riskNote: "政府依赖度高，民需慢",
  },
];

// ─── 10. AI软件・云・SaaS ────────────────────────────────────────────────────
const SOFTWARE_CLOUD: ThemeEntry[] = [
  {
    symbol: "5574.T", theme: "SOFTWARE_CLOUD", subTheme: "AI基盤プラットフォーム",
    role: "AI开发平台/MLOps SaaS", supplyChainLayer: "APPLICATION",
    importanceScore: 8, isCore: true,
    reason: "日本企业AI落地平台，Abeja Platform已被多家企业采用",
    riskNote: "竞争激烈，上市后盈利压力",
  },
  {
    symbol: "4478.T", theme: "SOFTWARE_CLOUD", subTheme: "クラウド会計・AI",
    role: "云会计/AI税务SaaS", supplyChainLayer: "APPLICATION",
    importanceScore: 8, isCore: true,
    reason: "日本中小企业AI会计SaaS龙头，可重复订阅收入",
    riskNote: "赤字扩大，增速放缓风险",
  },
  {
    symbol: "4443.T", theme: "SOFTWARE_CLOUD", subTheme: "AI名刺・CRM",
    role: "AI名片管理/B2B数据SaaS", supplyChainLayer: "APPLICATION",
    importanceScore: 8, isCore: true,
    reason: "AI销售情报SaaS，名片数据护城河深",
    riskNote: "市场天花板有限",
  },
  {
    symbol: "6098.T", theme: "SOFTWARE_CLOUD", subTheme: "AI人材・HR",
    role: "AI人才招聘/HR Tech平台", supplyChainLayer: "APPLICATION",
    importanceScore: 9, isCore: true,
    reason: "Indeed+Glassdoor+rikunabi AI搜索，全球规模最大HR平台之一",
    riskNote: "全球景气度影响，Indeed广告依赖",
  },
  {
    symbol: "4751.T", theme: "SOFTWARE_CLOUD", subTheme: "AIデジタル広告",
    role: "AI数字广告/AbemaTV流媒体", supplyChainLayer: "APPLICATION",
    importanceScore: 8, isCore: false,
    reason: "AI广告精准投放+AbemaTV内容AI化，GPT活用广告系统",
    riskNote: "AbemaTV盈亏平衡待证",
  },
  {
    symbol: "4689.T", theme: "SOFTWARE_CLOUD", subTheme: "LINEプラットフォーム",
    role: "LINE AI助理/Yahoo搜索AI", supplyChainLayer: "APPLICATION",
    importanceScore: 8, isCore: false,
    reason: "LINE ChatAI+Yahoo搜索AI化，日本最大C2B AI接触点",
    riskNote: "Naver信息安全问题，外资股权调整",
  },
  {
    symbol: "4385.T", theme: "SOFTWARE_CLOUD", subTheme: "AIフリマ",
    role: "AI定价/C2C Marketplace", supplyChainLayer: "APPLICATION",
    importanceScore: 7, isCore: false,
    reason: "AI商品定价+物流AI优化",
    riskNote: "グローバル展開コスト高，赤字継続",
  },
  {
    symbol: "4431.T", theme: "SOFTWARE_CLOUD", subTheme: "リテールSaaS",
    role: "零售AI管理SaaS", supplyChainLayer: "APPLICATION",
    importanceScore: 7, isCore: false,
    reason: "便利店/餐饮AI收银系统，日本最大规模",
    riskNote: "成长性较freee/Sansan低",
  },
  {
    symbol: "4812.T", theme: "SOFTWARE_CLOUD", subTheme: "AI SI",
    role: "AI系统集成/业务DX", supplyChainLayer: "APPLICATION",
    importanceScore: 7, isCore: false,
    reason: "伊藤忠系AI DX，企业AI化大型项目受益",
    riskNote: "SI利润率偏低",
  },
  {
    symbol: "9719.T", theme: "SOFTWARE_CLOUD", subTheme: "ITサービス",
    role: "AI ITサービス/System Integration", supplyChainLayer: "APPLICATION",
    importanceScore: 7, isCore: false,
    reason: "住友グループ系AI IT，安定した企業需要",
    riskNote: "SI利润率上限有限",
  },
  {
    symbol: "5132.T", theme: "SOFTWARE_CLOUD", subTheme: "数理AI",
    role: "数理AI/大型AIモデル开发", supplyChainLayer: "APPLICATION",
    importanceScore: 7, isCore: false,
    reason: "纯AI研究型公司，AGI向け研究",
    riskNote: "小型企业，赤字期，高波动",
  },
  {
    symbol: "4418.T", theme: "SOFTWARE_CLOUD", subTheme: "AI分析・JDSC",
    role: "数据科学AI分析SaaS", supplyChainLayer: "APPLICATION",
    importanceScore: 7, isCore: false,
    reason: "日本企业AI分析平台，需求扩大",
    riskNote: "小型成长股，高风险",
  },
  {
    symbol: "3659.T", theme: "SOFTWARE_CLOUD", subTheme: "ゲームAI",
    role: "AI游戏/元宇宙平台", supplyChainLayer: "APPLICATION",
    importanceScore: 6, isCore: false,
    reason: "游戏AI化，メタバース受益",
    riskNote: "中国规制风险",
  },
  {
    symbol: "3769.T", theme: "SOFTWARE_CLOUD", subTheme: "AIフィンテック",
    role: "AI支付/フィンテックSaaS", supplyChainLayer: "APPLICATION",
    importanceScore: 6, isCore: false,
    reason: "AI决済SaaS，日本フィンテック受益",
    riskNote: "规制変更リスク",
  },
];

// ─── 11. AI互联网・平台服务 ───────────────────────────────────────────────────
const INTERNET_PLATFORM: ThemeEntry[] = [
  {
    symbol: "4689.T", theme: "INTERNET_PLATFORM", subTheme: "SNS・検索AI",
    role: "LINE AI/Yahoo Search AI（最大消费接触点）", supplyChainLayer: "APPLICATION",
    importanceScore: 9, isCore: true,
    reason: "日本最大消费互联网+AI化搜索，9000万MAU",
    riskNote: "外资股权问题，大股东Naver",
  },
  {
    symbol: "6098.T", theme: "INTERNET_PLATFORM", subTheme: "HR・求人AI",
    role: "AI人才匹配/求职平台", supplyChainLayer: "APPLICATION",
    importanceScore: 9, isCore: true,
    reason: "全球HR AI平台领导者，AI推荐算法护城河",
    riskNote: "景气依赖，广告収入周期性",
  },
  {
    symbol: "4751.T", theme: "INTERNET_PLATFORM", subTheme: "メディア・広告AI",
    role: "AI广告/流媒体内容平台", supplyChainLayer: "APPLICATION",
    importanceScore: 8, isCore: false,
    reason: "Ameba+AbemaTV AI内容化",
    riskNote: "AbemaTV黑字化遅延",
  },
  {
    symbol: "4385.T", theme: "INTERNET_PLATFORM", subTheme: "フリマプラットフォーム",
    role: "C2C AI Marketplace", supplyChainLayer: "APPLICATION",
    importanceScore: 7, isCore: false,
    reason: "AI定価と物流最適化，日米市场",
    riskNote: "赤字継続，海外展開コスト",
  },
  {
    symbol: "3659.T", theme: "INTERNET_PLATFORM", subTheme: "ゲーム・メタバース",
    role: "AI游戏/元宇宙平台服务", supplyChainLayer: "APPLICATION",
    importanceScore: 6, isCore: false,
    reason: "ゲームAI化+メタバースAI",
    riskNote: "中国규제리스크",
  },
  {
    symbol: "9468.T", theme: "INTERNET_PLATFORM", subTheme: "エンタメAI",
    role: "IP/内容AI生成平台", supplyChainLayer: "APPLICATION",
    importanceScore: 7, isCore: false,
    reason: "角川AI内容生成，IP×AI战略",
    riskNote: "AI生成内容著作権問題",
  },
];

// ─── 12. AI医疗・生命科学 ────────────────────────────────────────────────────
const MEDICAL_LIFE: ThemeEntry[] = [
  {
    symbol: "2413.T", theme: "MEDICAL_LIFE", subTheme: "医療情報AI",
    role: "医疗AI信息平台（B2D）", supplyChainLayer: "APPLICATION",
    importanceScore: 9, isCore: true,
    reason: "日本最大医师/医院AI情报平台，AI病历分析受益",
    riskNote: "成长放缓，新规制变化",
  },
  {
    symbol: "6869.T", theme: "MEDICAL_LIFE", subTheme: "体外診断・ヘマトロジー",
    role: "AI诊断设备/血液分析仪", supplyChainLayer: "APPLICATION",
    importanceScore: 9, isCore: true,
    reason: "全球血液检测AI分析系统市占率前2，AI病理诊断先行者",
    riskNote: "ヘルスケア以外の展開限定",
  },
  {
    symbol: "4519.T", theme: "MEDICAL_LIFE", subTheme: "AIドラッグディスカバリー",
    role: "AI药物发现/抗体AI设计", supplyChainLayer: "APPLICATION",
    importanceScore: 9, isCore: true,
    reason: "Roche子会社，AI/计算生物学药物发现全球领先",
    riskNote: "特定品管道依赖",
  },
  {
    symbol: "4502.T", theme: "MEDICAL_LIFE", subTheme: "AI創薬",
    role: "AI大規模創薬研究", supplyChainLayer: "APPLICATION",
    importanceScore: 8, isCore: false,
    reason: "全球AI创药布局，AlphaFold活用",
    riskNote: "临床管道风险，大型制药周期",
  },
  {
    symbol: "4503.T", theme: "MEDICAL_LIFE", subTheme: "AI創薬・ロボット手術",
    role: "AI精准医疗/機器手術", supplyChainLayer: "APPLICATION",
    importanceScore: 8, isCore: false,
    reason: "AI手術ロボット+精準医療",
    riskNote: "研究開発費高く，黒字化遅延",
  },
  {
    symbol: "4568.T", theme: "MEDICAL_LIFE", subTheme: "AI抗体・がん治療",
    role: "AI抗体工程/AI癌症治疗", supplyChainLayer: "APPLICATION",
    importanceScore: 8, isCore: false,
    reason: "ADC抗体药物+AI靶点发现",
    riskNote: "臨床リスク，単一品依存",
  },
  {
    symbol: "4543.T", theme: "MEDICAL_LIFE", subTheme: "医療機器AI",
    role: "AI医疗器械/心血管监护", supplyChainLayer: "APPLICATION",
    importanceScore: 8, isCore: false,
    reason: "AI心血管设备+手术机器人进入",
    riskNote: "Medtronic等大厂竞争",
  },
];

// ─── 13. AI安防・图像识别 ────────────────────────────────────────────────────
const SECURITY_VISION: ThemeEntry[] = [
  {
    symbol: "6701.T", theme: "SECURITY_VISION", subTheme: "顔認識・AI安全",
    role: "AI人脸识别/公共安全系统", supplyChainLayer: "APPLICATION",
    importanceScore: 9, isCore: true,
    reason: "政府AI安防系统核心承包商，NEC顔認識世界首位精度",
    riskNote: "AI监控伦理问题，规制风险",
  },
  {
    symbol: "6758.T", theme: "SECURITY_VISION", subTheme: "CMOSセンサー",
    role: "AI相机CMOS传感器（视觉AI基底）", supplyChainLayer: "UPSTREAM",
    importanceScore: 9, isCore: true,
    reason: "AI安防摄像CMOS传感器全球首位，视觉AI最底层硬件",
    riskNote: "单一技术依赖",
  },
  {
    symbol: "6861.T", theme: "SECURITY_VISION", subTheme: "機械ビジョン",
    role: "AI机器视觉/工厂图像检测", supplyChainLayer: "APPLICATION",
    importanceScore: 9, isCore: true,
    reason: "AI视觉检测最高精度+最快处理，工厂安防双受益",
    riskNote: "中国本土竞争加剧",
  },
  {
    symbol: "6645.T", theme: "SECURITY_VISION", subTheme: "センシング・制御",
    role: "传感/控制AI安防系统", supplyChainLayer: "APPLICATION",
    importanceScore: 8, isCore: false,
    reason: "AI工业传感+安防控制系统",
    riskNote: "中国需求下行",
  },
  {
    symbol: "6702.T", theme: "SECURITY_VISION", subTheme: "AIセキュリティ",
    role: "AI网络安全/图像认证系统", supplyChainLayer: "APPLICATION",
    importanceScore: 8, isCore: false,
    reason: "AI安防系统集成+生体認証受益",
    riskNote: "IT services利润率限制",
  },
  {
    symbol: "7731.T", theme: "SECURITY_VISION", subTheme: "光学システム",
    role: "AI相机光学系统/精密光学", supplyChainLayer: "UPSTREAM",
    importanceScore: 7, isCore: false,
    reason: "AI相机光学镜头，NIL（纳米压印）次世代潜力",
    riskNote: "相机市场成熟，转型期",
  },
  {
    symbol: "7751.T", theme: "SECURITY_VISION", subTheme: "AIカメラ・OCR",
    role: "AI相机/工业OCR识别系统", supplyChainLayer: "APPLICATION",
    importanceScore: 7, isCore: false,
    reason: "AI相机+OCR文字识别，工场DX受益",
    riskNote: "消费者相机部門负担",
  },
];

// ─── 14. AI电力・能源基础设施 ────────────────────────────────────────────────
const POWER_INFRA: ThemeEntry[] = [
  {
    symbol: "6501.T", theme: "POWER_INFRA", subTheme: "電力・ITシステム",
    role: "AI电力系统/IT基础设施双跑（日立）", supplyChainLayer: "INFRASTRUCTURE",
    importanceScore: 9, isCore: true,
    reason: "AI DC电力系统+ITインフラ双受益，Globallogic AI DX",
    riskNote: "多事业部门分散，核心AI聚焦度不足",
  },
  {
    symbol: "6503.T", theme: "POWER_INFRA", subTheme: "パワーエレクトロニクス",
    role: "AI DC电源设备/パワー半导体模块", supplyChainLayer: "INFRASTRUCTURE",
    importanceScore: 8, isCore: false,
    reason: "AI服务器电源装置+変圧器，DC电力需求急增受益",
    riskNote: "电力基础设施周期长",
  },
  {
    symbol: "7011.T", theme: "POWER_INFRA", subTheme: "発電・原子力",
    role: "核电/火电AI化/能源DX", supplyChainLayer: "INFRASTRUCTURE",
    importanceScore: 8, isCore: false,
    reason: "AI DC电力供给（原子力再稼働）最大受益商之一",
    riskNote: "原子力再稼働政治风险",
  },
  {
    symbol: "9501.T", theme: "POWER_INFRA", subTheme: "電力供給",
    role: "AI DC大量电力供应商", supplyChainLayer: "INFRASTRUCTURE",
    importanceScore: 8, isCore: false,
    reason: "东京DC集中供电，AI算力电力需求直接受益",
    riskNote: "原子力再稼働遅延，电力コスト高",
  },
  {
    symbol: "9503.T", theme: "POWER_INFRA", subTheme: "電力供給",
    role: "关西地区AI DC电力供给", supplyChainLayer: "INFRASTRUCTURE",
    importanceScore: 7, isCore: false,
    reason: "关西AI DC集中区域的稳定电力供应商",
    riskNote: "规制环境，再稼働进度",
  },
  {
    symbol: "9502.T", theme: "POWER_INFRA", subTheme: "電力供給",
    role: "中部地区AI DC电力供应", supplyChainLayer: "INFRASTRUCTURE",
    importanceScore: 7, isCore: false,
    reason: "中部DC区域电力，Toyota AI工厂供电",
    riskNote: "电力市场価格競争",
  },
  {
    symbol: "5803.T", theme: "POWER_INFRA", subTheme: "電力ケーブル",
    role: "AI DC电力电缆/超导体", supplyChainLayer: "INFRASTRUCTURE",
    importanceScore: 8, isCore: false,
    reason: "DC大容量电缆+超导体研究，次世代AI电力送电",
    riskNote: "超导商用化未定",
  },
];

// ─── Assemble all entries ─────────────────────────────────────────────────────
const ALL_THEMES: ThemeEntry[] = [
  ...CHIP_DESIGN,
  ...SEMI_EQUIPMENT,
  ...TEST_EQUIPMENT,
  ...CHIP_MATERIAL,
  ...HBM_PACKAGING,
  ...SENSOR_PRECISION,
  ...SERVER_DC,
  ...NETWORK,
  ...ROBOT_AUTO,
  ...SOFTWARE_CLOUD,
  ...INTERNET_PLATFORM,
  ...MEDICAL_LIFE,
  ...SECURITY_VISION,
  ...POWER_INFRA,
];

async function main() {
  console.log("=== TOHOSHOU v8.0 AI産業チェーン Seed ===\n");

  const removed = await prisma.aITheme.deleteMany({});
  console.log(`  ↳ 清除旧数据 ${removed.count} 条\n`);

  let inserted = 0;
  for (const row of ALL_THEMES) {
    await prisma.aITheme.create({
      data: {
        symbol: row.symbol,
        theme: row.theme,
        subTheme: row.subTheme,
        role: row.role,
        supplyChainLayer: row.supplyChainLayer,
        importanceScore: row.importanceScore,
        reason: row.reason,
        riskNote: row.riskNote ?? null,
        isCore: row.isCore,
      },
    });
    const coreFlag = row.isCore ? " ⭐" : "";
    console.log(`  ✓ [${row.theme.padEnd(20)}] ${row.symbol.padEnd(8)}${coreFlag}`);
    inserted++;
  }

  // Stats
  const byTheme = await prisma.aITheme.groupBy({
    by: ["theme"],
    _count: { theme: true },
    orderBy: { theme: "asc" },
  });

  const uniqueSymbols = new Set(ALL_THEMES.map((r) => r.symbol));
  const coreCount = ALL_THEMES.filter((r) => r.isCore).length;

  console.log(`\n✅ 写入完成`);
  console.log(`   总主题数：   14`);
  console.log(`   总记录数：   ${inserted}`);
  console.log(`   覆盖股票数： ${uniqueSymbols.size} 只`);
  console.log(`   核心标的数： ${coreCount} 个`);
  console.log("\n分类统计：");

  const THEME_LABELS: Record<string, string> = {
    CHIP_DESIGN: "AI芯片设计",
    SEMI_EQUIPMENT: "AI半导体设备",
    TEST_EQUIPMENT: "AI测试设备",
    CHIP_MATERIAL: "AI芯片材料",
    HBM_PACKAGING: "HBM・先进封装",
    SENSOR_PRECISION: "AI传感器・精密",
    SERVER_DC: "AI服务器・DC",
    NETWORK: "AI网络通信",
    ROBOT_AUTO: "AI机器人・自动化",
    SOFTWARE_CLOUD: "AI软件・云",
    INTERNET_PLATFORM: "AI互联网・平台",
    MEDICAL_LIFE: "AI医疗・生命科学",
    SECURITY_VISION: "AI安防・图像识别",
    POWER_INFRA: "AI电力・能源",
  };

  for (const t of byTheme) {
    const label = THEME_LABELS[t.theme] ?? t.theme;
    console.log(`   ${label.padEnd(22)} ${String(t._count.theme).padStart(3)} 条`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("CRASH:", e);
  prisma.$disconnect();
  process.exit(1);
});
