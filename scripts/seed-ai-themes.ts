#!/usr/bin/env npx tsx
/**
 * scripts/seed-ai-themes.ts
 * v8.0 AI产业链地图 — 14细分主题，100+条目
 * 用法：npx tsx scripts/seed-ai-themes.ts
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { SUBTHEME_VOCAB, VOCAB_SET, normalizeSubTheme } from "../lib/ai-theme-subtheme";

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

// ── P8-DATA-03 Provenance（本文件即结构化、可追溯的数据源，git 版本化）─────────
//   sourceType      : J-Quants/Stock 主数据 + 公司公开业务资料（人工复核）
//   sourceDate      : 2026-07-17
//   evidenceSummary : 每条 entry 的 `reason` 字段即 AI 关联证据摘要；`role` 为主要产品/业务
//   reviewedAt      : 2026-07-17
//   version         : SEED_VERSION
//   新增/调整的每只股票均已对生产 Stock / StockScore 核验「真实存在且可交易」，
//   NO_STOCK / 退市者一律不写入（见 main() 的 Stock 存在性校验）。
export const SEED_VERSION = "p8-data-03/2026-07-17";

// AI 关联强度（0-3）↔ importanceScore 映射（无 schema 改动，复用既有列）：
//   3 = 核心AI标的  → importanceScore 9-10（isCore 仅允许此档且流动性/代表性达标）
//   2 = 明确受益    → importanceScore 7-8
//   1 = 间接受益    → importanceScore 5-6
//   0 = 关联不足    → 不纳入 / 移除
export const strengthOf = (importanceScore: number): 0 | 1 | 2 | 3 =>
  importanceScore >= 9 ? 3 : importanceScore >= 7 ? 2 : importanceScore >= 5 ? 1 : 0;

// 已确认无效（生产 Stock 表无记录 / 私有化退市）→ 受控移除并报告，非清空。
//   6967.T 新光电气（JIC 私有化）· 9613.T NTT Data · 9719.T SCSK（均不在可交易宇宙）
const INVALID_SYMBOLS: string[] = ["6967.T", "9613.T", "9719.T"];

// P8-DATA-04：词表与 Mapping 的唯一来源 → lib/ai-theme-subtheme.ts（禁止在此复制）


// ─── 1. AI芯片设计・AI半导体 ────────────────────────────────────────────────
const CHIP_DESIGN: ThemeEntry[] = [
  {
    symbol: "6723.T", theme: "CHIP_DESIGN", subTheme: "マイコン・SoC",
    role: "汽车/工业AI芯片设计（SoC/MCU）", supplyChainLayer: "MIDSTREAM",
    importanceScore: 9, isCore: true,
    reason: "日本最大半导体设计公司，汽车AI芯片市占率全球前3",
    riskNote: "汽车周期敏感，TSMC供货依赖",
  },
  {
    symbol: "6963.T", theme: "CHIP_DESIGN", subTheme: "パワー半導体",
    role: "电源管理IC/功率半导体", supplyChainLayer: "MIDSTREAM",
    importanceScore: 7, isCore: false,
    reason: "AI服务器电源管理IC供应商",
    riskNote: "与德州仪器/英飞凌直接竞争",
  },
  {
    symbol: "6965.T", theme: "CHIP_DESIGN", subTheme: "光センサー半導体",
    role: "光探测器/图像传感芯片", supplyChainLayer: "MIDSTREAM",
    importanceScore: 8, isCore: false,
    reason: "AI医疗+自动驾驶光学传感核心供应商，LIDAR受益",
    riskNote: "客户集中，需求波动较大",
  },
  {
    symbol: "6875.T", theme: "CHIP_DESIGN", subTheme: "ASIC・SoC受託設計",
    role: "AI Edge ASIC/SoC设计（任天堂/自动驾驶定制芯片）", supplyChainLayer: "MIDSTREAM",
    importanceScore: 7, isCore: false,
    reason: "日本最具代表性的ASIC设计公司，游戏→汽车AI Edge芯片转型",
    riskNote: "任天堂订单集中，AI Edge芯片商业化仍在早期",
  },
  {
    symbol: "6758.T", theme: "CHIP_DESIGN", subTheme: "CMOSイメージセンサー",
    role: "AI视觉CMOS图像传感器设计（全球市占率首位）", supplyChainLayer: "MIDSTREAM",
    importanceScore: 9, isCore: true,
    reason: "智能手机/自动驾驶/安防AI视觉传感器核心，AI时代图像入口",
    riskNote: "智能手机需求波动，苹果依存度高",
  },
  {
    symbol: "6504.T", theme: "CHIP_DESIGN", subTheme: "パワー半導体",
    role: "AI服务器/EV功率半导体设计（IGBT/SiC/GaN）", supplyChainLayer: "MIDSTREAM",
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
    role: "FC-BGA基板（GPU/HBM封装核心）", supplyChainLayer: "UPSTREAM",
    importanceScore: 10, isCore: true,
    reason: "NVIDIA H100/B200 FC-BGA基板主供，AI算力需求直接受益",
    riskNote: "良率爬坡+资本投入大，FC-BGA供需波动",
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
    role: "CMOS图像传感器（全球首位）", supplyChainLayer: "MIDSTREAM",
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
    role: "EUV光掩模坯料（全球2强之一）", supplyChainLayer: "UPSTREAM",
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
    role: "AI服务器/HPC系统集成商", supplyChainLayer: "MIDSTREAM",
    importanceScore: 9, isCore: true,
    reason: "日本政府AI算力基础设施核心承建商",
    riskNote: "政府采购依赖，海外竞争",
  },
  {
    symbol: "6702.T", theme: "SERVER_DC", subTheme: "HPC・AIシステム",
    role: "HPC/AI系统+富岳超算运营", supplyChainLayer: "MIDSTREAM",
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
    role: "AI开发平台/MLOps SaaS", supplyChainLayer: "DOWNSTREAM",
    importanceScore: 8, isCore: false,
    reason: "日本企业AI落地平台，Abeja Platform已被多家企业采用",
    riskNote: "竞争激烈，上市后盈利压力",
  },
  {
    symbol: "4478.T", theme: "SOFTWARE_CLOUD", subTheme: "クラウド会計・AI",
    role: "云会计/AI税务SaaS", supplyChainLayer: "DOWNSTREAM",
    importanceScore: 8, isCore: false,
    reason: "日本中小企业AI会计SaaS龙头，可重复订阅收入",
    riskNote: "赤字扩大，增速放缓风险",
  },
  {
    symbol: "4443.T", theme: "SOFTWARE_CLOUD", subTheme: "AI名刺・CRM",
    role: "AI名片管理/B2B数据SaaS", supplyChainLayer: "DOWNSTREAM",
    importanceScore: 8, isCore: false,
    reason: "AI销售情报SaaS，名片数据护城河深",
    riskNote: "市场天花板有限",
  },
  {
    symbol: "6098.T", theme: "SOFTWARE_CLOUD", subTheme: "AI人材・HR",
    role: "AI人才招聘/HR Tech平台", supplyChainLayer: "DOWNSTREAM",
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
    role: "LINE AI助理/Yahoo搜索AI", supplyChainLayer: "DOWNSTREAM",
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
    role: "零售AI管理SaaS", supplyChainLayer: "DOWNSTREAM",
    importanceScore: 7, isCore: false,
    reason: "便利店/餐饮AI收银系统，日本最大规模",
    riskNote: "成长性较freee/Sansan低",
  },
  {
    symbol: "4812.T", theme: "SOFTWARE_CLOUD", subTheme: "AI SI",
    role: "AI系统集成/业务DX", supplyChainLayer: "DOWNSTREAM",
    importanceScore: 7, isCore: false,
    reason: "伊藤忠系AI DX，企业AI化大型项目受益",
    riskNote: "SI利润率偏低",
  },
  {
    symbol: "5132.T", theme: "SOFTWARE_CLOUD", subTheme: "数理AI",
    role: "数理AI/大型AIモデル开发", supplyChainLayer: "DOWNSTREAM",
    importanceScore: 7, isCore: false,
    reason: "纯AI研究型公司，AGI向け研究",
    riskNote: "小型企业，赤字期，高波动",
  },
  {
    symbol: "4418.T", theme: "SOFTWARE_CLOUD", subTheme: "AI分析・JDSC",
    role: "数据科学AI分析SaaS", supplyChainLayer: "DOWNSTREAM",
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
    role: "LINE AI/Yahoo Search AI（最大消费接触点）", supplyChainLayer: "DOWNSTREAM",
    importanceScore: 9, isCore: true,
    reason: "日本最大消费互联网+AI化搜索，9000万MAU",
    riskNote: "外资股权问题，大股东Naver",
  },
  {
    symbol: "6098.T", theme: "INTERNET_PLATFORM", subTheme: "HR・求人AI",
    role: "AI人才匹配/求职平台", supplyChainLayer: "DOWNSTREAM",
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
    role: "AI人脸识别/公共安全系统", supplyChainLayer: "DOWNSTREAM",
    importanceScore: 9, isCore: true,
    reason: "政府AI安防系统核心承包商，NEC顔認識世界首位精度",
    riskNote: "AI监控伦理问题，规制风险",
  },
  {
    symbol: "6758.T", theme: "SECURITY_VISION", subTheme: "CMOSセンサー",
    role: "AI相机CMOS传感器（视觉AI基底）", supplyChainLayer: "MIDSTREAM",
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
    role: "AI网络安全/图像认证系统", supplyChainLayer: "DOWNSTREAM",
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
    role: "AI相机/工业OCR识别系统", supplyChainLayer: "DOWNSTREAM",
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

// ─── 15. AI存储（NAND/SSD/HBM）── P8-DATA-03 新增 ────────────────────────────
const AI_STORAGE: ThemeEntry[] = [
  {
    symbol: "285A.T", theme: "AI_STORAGE", subTheme: "NAND・企業向けSSD",
    role: "NAND闪存/企业级SSD（AI数据中心大容量存储）", supplyChainLayer: "MIDSTREAM",
    importanceScore: 9, isCore: true,
    reason: "日本唯一NAND闪存大厂，全球NAND前二，AI数据中心企业级SSD核心供应",
    riskNote: "NAND价格周期性剧烈，资本开支负担重",
  },
  {
    symbol: "6857.T", theme: "AI_STORAGE", subTheme: "HBMテスター",
    role: "HBM/DRAM测试装置（存储供应链）", supplyChainLayer: "MIDSTREAM",
    importanceScore: 8, isCore: false,
    reason: "SK Hynix HBM全量测试装置供应，AI存储扩产直接受益",
    riskNote: "客户集中度高，与TEST_EQUIPMENT主题重叠",
  },
];

// ─── 16. AI散热（液冷/风冷）── P8-DATA-03 新增 ───────────────────────────────
const AI_COOLING: ThemeEntry[] = [
  {
    symbol: "6367.T", theme: "AI_COOLING", subTheme: "データセンター空調",
    role: "精密空调/HVAC（AI数据中心冷却）", supplyChainLayer: "INFRASTRUCTURE",
    importanceScore: 8, isCore: false,
    reason: "全球HVAC龙头，AI数据中心高密度机柜冷却需求直接受益",
    riskNote: "空调主业非AI，AI收入占比有限（关联强度2）",
  },
  {
    symbol: "6594.T", theme: "AI_COOLING", subTheme: "冷却ファン・液冷ポンプ",
    role: "精密电机/服务器冷却风扇/液冷泵", supplyChainLayer: "INFRASTRUCTURE",
    importanceScore: 8, isCore: false,
    reason: "服务器散热风扇全球主供，液冷泵切入AI数据中心热管理",
    riskNote: "车载电机业务拖累，结构改革中",
  },
];

// ─── 17. 自动驾驶 ── P8-DATA-03 新增 ─────────────────────────────────────────
const AUTO_DRIVE: ThemeEntry[] = [
  {
    symbol: "6902.T", theme: "AUTO_DRIVE", subTheme: "ADAS・車載AI",
    role: "ADAS/自动驾驶传感器与车载AI ECU", supplyChainLayer: "APPLICATION",
    importanceScore: 9, isCore: true,
    reason: "全球前三车载零部件商，ADAS毫米波雷达/摄像头/车载AI SoC核心供应",
    riskNote: "丰田系依存度高，汽车周期敏感",
  },
  {
    symbol: "6723.T", theme: "AUTO_DRIVE", subTheme: "車載AI SoC",
    role: "车载AI SoC/MCU（自动驾驶算力）", supplyChainLayer: "MIDSTREAM",
    importanceScore: 8, isCore: false,
    reason: "汽车MCU/SoC全球前三，R-Car系列为自动驾驶域控制器核心",
    riskNote: "汽车周期敏感，代工依赖TSMC",
  },
  {
    symbol: "7203.T", theme: "AUTO_DRIVE", subTheme: "自動運転・Woven City",
    role: "自动驾驶研发/Woven City智慧城市", supplyChainLayer: "APPLICATION",
    importanceScore: 8, isCore: false,
    reason: "Woven by Toyota自动驾驶软件平台与AI智慧城市实证",
    riskNote: "AI收入占比小，主业为整车（关联强度2）",
  },
  {
    symbol: "7267.T", theme: "AUTO_DRIVE", subTheme: "自動運転Lv3",
    role: "Level3自动驾驶量产/AI驾驶辅助", supplyChainLayer: "APPLICATION",
    importanceScore: 7, isCore: false,
    reason: "全球首个Level3认证量产车企，AI驾驶辅助持续投入",
    riskNote: "AI收入占比小（关联强度2）",
  },
  {
    symbol: "4667.T", theme: "AUTO_DRIVE", subTheme: "HD地図・自動運転",
    role: "高精度地图/自动驾驶实证支援", supplyChainLayer: "APPLICATION",
    importanceScore: 7, isCore: false,
    reason: "日本高精度3D地图与自动驾驶实证服务专业厂商",
    riskNote: "小型股，流动性偏低",
  },
];

// ─── P8-DATA-03 补齐：现有主题的遗漏龙头（均经生产 Stock/StockScore 核验）────
const P8_ADDITIONS: ThemeEntry[] = [
  // 上游 · 材料/气体/被动元件
  { symbol: "4901.T", theme: "CHIP_MATERIAL", subTheme: "CMP・フォトレジスト材料", role: "半导体材料（CMP浆料/光刻）+AI医疗影像", supplyChainLayer: "UPSTREAM", importanceScore: 8, isCore: false, reason: "半导体材料广泛布局，CMP/光刻材料供应AI芯片制程", riskNote: "影像业务占比高，AI关联部分为间接" },
  { symbol: "4091.T", theme: "CHIP_MATERIAL", subTheme: "電子ガス", role: "电子特气（半导体制程必需）", supplyChainLayer: "UPSTREAM", importanceScore: 8, isCore: false, reason: "半导体电子特气日本主供，先端制程扩产直接受益", riskNote: "工业气体主业，价格传导滞后" },
  { symbol: "4021.T", theme: "CHIP_MATERIAL", subTheme: "半導体反射防止膜", role: "半导体反射防止膜/功能材料", supplyChainLayer: "UPSTREAM", importanceScore: 7, isCore: false, reason: "半导体反射防止膜全球高市占，先端制程微细化受益", riskNote: "农化业务占比大" },
  { symbol: "6988.T", theme: "CHIP_MATERIAL", subTheme: "半導体・光学フィルム", role: "半导体/光学功能膜材料", supplyChainLayer: "UPSTREAM", importanceScore: 7, isCore: false, reason: "半导体封装与光学膜材料供应，AI面板/封装受益", riskNote: "多元业务，AI关联部分有限" },
  { symbol: "4088.T", theme: "CHIP_MATERIAL", subTheme: "産業ガス", role: "产业气体/电子材料", supplyChainLayer: "UPSTREAM", importanceScore: 6, isCore: false, reason: "半导体用产业气体供应（关联强度1，间接受益）", riskNote: "AI关联间接，主业为综合气体" },
  { symbol: "6976.T", theme: "SENSOR_PRECISION", subTheme: "MLCC", role: "积层陶瓷电容（AI服务器电源）", supplyChainLayer: "UPSTREAM", importanceScore: 8, isCore: false, reason: "MLCC全球前三，AI服务器/GPU板卡用高容MLCC需求扩张", riskNote: "智能手机需求波动" },
  // 中游 · 设备/设计/基板
  { symbol: "6525.T", theme: "SEMI_EQUIPMENT", subTheme: "バッチALD・成膜装置", role: "批式ALD/成膜装置", supplyChainLayer: "MIDSTREAM", importanceScore: 9, isCore: true, reason: "批式成膜/ALD装置全球寡占，3D NAND与先端逻辑扩产核心设备", riskNote: "中国营收占比高，出口管制风险" },
  { symbol: "6728.T", theme: "SEMI_EQUIPMENT", subTheme: "真空・成膜装置", role: "真空成膜/溅射装置", supplyChainLayer: "MIDSTREAM", importanceScore: 8, isCore: false, reason: "真空成膜装置日本主供，半导体/电子部件制程广泛使用", riskNote: "面板等非半导体业务波动" },
  { symbol: "6526.T", theme: "CHIP_DESIGN", subTheme: "カスタムSoC・AI ASIC", role: "定制SoC/AI ASIC设计（2nm级）", supplyChainLayer: "MIDSTREAM", importanceScore: 9, isCore: true, reason: "日本最大定制SoC/ASIC设计商，AI加速器与数据中心定制芯片直接受益", riskNote: "客户集中，先端制程投入大" },
  { symbol: "6787.T", theme: "HBM_PACKAGING", subTheme: "高多層PCB", role: "高多层PCB/高密度基板", supplyChainLayer: "MIDSTREAM", importanceScore: 7, isCore: false, reason: "AI服务器/车载用高多层PCB供应，高密度基板需求受益", riskNote: "中小型PCB竞争激烈" },
  { symbol: "7240.T", theme: "HBM_PACKAGING", subTheme: "FPC・フレキシブル基板", role: "FPC柔性基板（日本メクトロン）", supplyChainLayer: "MIDSTREAM", importanceScore: 7, isCore: false, reason: "旗下日本メクトロン为全球FPC主供，AI设备与车载电子受益", riskNote: "密封件主业，智能手机需求依存" },
  // 基础设施 · 电力/云DC
  { symbol: "6508.T", theme: "POWER_INFRA", subTheme: "変圧器・配電", role: "变压器/配电设备（DC受电）", supplyChainLayer: "INFRASTRUCTURE", importanceScore: 8, isCore: false, reason: "变压器/配电设备供应，AI数据中心受电与电网增强需求受益", riskNote: "重电业务交期长，利润率偏低" },
  { symbol: "6622.T", theme: "POWER_INFRA", subTheme: "変圧器・配電機器", role: "变压器/配电/焊接机器人", supplyChainLayer: "INFRASTRUCTURE", importanceScore: 7, isCore: false, reason: "变压器与配电设备供应，数据中心电力基建受益", riskNote: "焊接机械业务占比，AI关联部分有限" },
  { symbol: "6674.T", theme: "POWER_INFRA", subTheme: "蓄電池・UPS", role: "蓄电池/UPS电源（DC后备电力）", supplyChainLayer: "INFRASTRUCTURE", importanceScore: 7, isCore: false, reason: "工业蓄电池与UPS供应，数据中心后备电源需求受益", riskNote: "车载电池主业，AI关联为间接" },
  { symbol: "3774.T", theme: "SERVER_DC", subTheme: "クラウド・DC・ネットワーク", role: "云/数据中心/网络运营", supplyChainLayer: "INFRASTRUCTURE", importanceScore: 7, isCore: false, reason: "日本老牌ISP，自建数据中心与云服务，GPU云需求受益", riskNote: "规模小于三大电信，资本开支压力" },
  { symbol: "9984.T", theme: "SERVER_DC", subTheme: "AI投資・Arm・DC", role: "AI投资/Arm持股/AI数据中心", supplyChainLayer: "INFRASTRUCTURE", importanceScore: 9, isCore: true, reason: "持有Arm多数股权（AI芯片IP核心），并主导大型AI数据中心投资", riskNote: "投资损益波动极大，NAV折价" },
  // 下游 · AI软件/平台/安全/SI
  { symbol: "3993.T", theme: "SOFTWARE_CLOUD", subTheme: "生成AI・AI Agent", role: "LLM/AI Agent/算法软件", supplyChainLayer: "DOWNSTREAM", importanceScore: 9, isCore: true, reason: "日本代表性AI算法企业，生成式AI与AI Agent商业化收入明确", riskNote: "小型股，估值波动大" },
  { symbol: "4307.T", theme: "SOFTWARE_CLOUD", subTheme: "AIコンサル・SI", role: "AI咨询/系统集成", supplyChainLayer: "DOWNSTREAM", importanceScore: 8, isCore: false, reason: "日本顶级IT咨询与SI，企业AI落地与DX需求主要承接方", riskNote: "人力密集，AI收入未单独披露" },
  { symbol: "3626.T", theme: "SOFTWARE_CLOUD", subTheme: "企業AI・SI", role: "企业AI/系统集成", supplyChainLayer: "DOWNSTREAM", importanceScore: 7, isCore: false, reason: "大型SI厂商，企业AI与云迁移项目持续增长", riskNote: "人力成本上升，AI关联部分为间接" },
  { symbol: "4776.T", theme: "SOFTWARE_CLOUD", subTheme: "企業SaaS(kintone)", role: "企业SaaS/低代码平台", supplyChainLayer: "DOWNSTREAM", importanceScore: 7, isCore: false, reason: "kintone企业SaaS平台导入AI功能，企业AI应用载体", riskNote: "AI为附加功能，非核心收入" },
  { symbol: "2371.T", theme: "SOFTWARE_CLOUD", subTheme: "検索・レコメンドAI", role: "搜索/推荐AI平台", supplyChainLayer: "DOWNSTREAM", importanceScore: 7, isCore: false, reason: "价格比较与推荐引擎，AI推荐算法为核心产品能力", riskNote: "广告景气依存" },
  { symbol: "4704.T", theme: "SECURITY_VISION", subTheme: "AIサイバーセキュリティ", role: "AI网络安全软件", supplyChainLayer: "DOWNSTREAM", importanceScore: 9, isCore: true, reason: "全球网络安全龙头，AI威胁检测与云安全为核心产品收入", riskNote: "海外竞争激烈，汇率影响" },
  // 应用 · 机器人/医疗
  { symbol: "6324.T", theme: "ROBOT_AUTO", subTheme: "ロボット減速機", role: "谐波减速机（机器人关节）", supplyChainLayer: "APPLICATION", importanceScore: 8, isCore: false, reason: "谐波减速机全球寡占，工业与人形机器人关节核心部件", riskNote: "设备投资周期敏感，估值偏高" },
  { symbol: "6474.T", theme: "ROBOT_AUTO", subTheme: "産業ロボット・軸受", role: "工业机器人/轴承", supplyChainLayer: "APPLICATION", importanceScore: 7, isCore: false, reason: "工业机器人与精密轴承供应，工厂自动化需求受益", riskNote: "利润率偏低，周期敏感" },
  { symbol: "6841.T", theme: "ROBOT_AUTO", subTheme: "産業制御・FA", role: "工业控制/FA系统", supplyChainLayer: "APPLICATION", importanceScore: 7, isCore: false, reason: "过程控制与工厂自动化系统，AI化制造现场受益", riskNote: "石化/能源客户依存" },
  { symbol: "7733.T", theme: "MEDICAL_LIFE", subTheme: "内視鏡AI診断", role: "内窥镜/AI辅助诊断", supplyChainLayer: "APPLICATION", importanceScore: 8, isCore: false, reason: "内窥镜全球市占率首位，AI辅助病变检测已商业化", riskNote: "治理问题历史，北美监管" },
  { symbol: "4483.T", theme: "MEDICAL_LIFE", subTheme: "医療ビッグデータAI", role: "医疗大数据/AI分析", supplyChainLayer: "APPLICATION", importanceScore: 7, isCore: false, reason: "日本最大医疗理赔大数据平台，AI分析为核心业务", riskNote: "小型股，制度变更风险" },
];

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
  ...AI_STORAGE,
  ...AI_COOLING,
  ...AUTO_DRIVE,
  ...P8_ADDITIONS,
];

async function main() {
  // P8-DATA-02：改为幂等 upsert（原为 deleteMany + create 的破坏性「重置」）。
  //   · 不清空已有数据（无 deleteMany）→ 中途失败不丢数据；
  //   · 按唯一键 [symbol, theme] upsert → 不产生重复主题/重复关联；
  //   · 逐行对比：无则 create、有变化则 update、完全一致则 skip；
  //   · 不在种子清单中的既有记录保留（orphans_kept，非破坏性，不删除）；
  //   · DRY_RUN=1 只读预览计数不写库。输出 created / updated / skipped。
  const DRY = process.env.DRY_RUN === "1";
  console.log(`=== TOHOSHOU AI主题研究 Seed ${SEED_VERSION} (idempotent${DRY ? " · DRY_RUN" : ""}) ===\n`);

  // ── P8-DATA-04 ⓪a：subTheme 标准词表硬断言 —— 任何未收录值立即 exit(1)，禁止写库 ──
  if (SUBTHEME_VOCAB.length < 25 || SUBTHEME_VOCAB.length > 40) {
    console.error(`❌ 标准词表数量 ${SUBTHEME_VOCAB.length} 不在 25~40 区间`);
    process.exit(1);
  }
  const unknownSub = [...new Set(ALL_THEMES.map((r) => r.subTheme).filter((s) => normalizeSubTheme(s) === null))];
  if (unknownSub.length) {
    console.error(`❌ subTheme 未收录于标准词表 ${unknownSub.length} 个 → 禁止写库:`);
    unknownSub.forEach((s) => console.error(`   "${s}"`));
    process.exit(1);
  }

  // ── P8-DATA-04 ⓪b：标准化统计（Before / After / Mapping / Unchanged / Unknown）──
  const rawSubs = ALL_THEMES.map((r) => r.subTheme);
  const beforeDistinct = new Set(rawSubs).size;
  const afterDistinct = new Set(rawSubs.map((s) => normalizeSubTheme(s)!)).size;
  const mappedRows = rawSubs.filter((s) => normalizeSubTheme(s) !== s).length;
  const unchangedRows = rawSubs.filter((s) => normalizeSubTheme(s) === s).length;
  console.log("── subTheme 标准化（Controlled Vocabulary）──");
  console.log(`   Before subTheme：${beforeDistinct}`);
  console.log(`   After  subTheme：${afterDistinct}   (词表容量 ${SUBTHEME_VOCAB.length})`);
  console.log(`   Mapping：${mappedRows}   Unchanged：${unchangedRows}   Unknown：${unknownSub.length}`);
  const usedVocab = new Set(rawSubs.map((s) => normalizeSubTheme(s)!));
  const unusedVocab = SUBTHEME_VOCAB.filter((v) => !usedVocab.has(v));
  if (unusedVocab.length) console.log(`   ⓘ 词表中暂无股票归入：${unusedVocab.join(", ")}`);
  console.log("");

  // ── P8-DATA-03 ⓪：核心标的纪律断言 —— isCore 仅允许 AI关联强度=3（importanceScore≥9）──
  const coreViolations = ALL_THEMES.filter((r) => r.isCore && strengthOf(r.importanceScore) !== 3);
  if (coreViolations.length) {
    console.error(`❌ isCore 纪律违规 ${coreViolations.length} 条（isCore 仅限 AI关联强度=3）:`);
    coreViolations.forEach((r) => console.error(`   ${r.symbol}/${r.theme} importanceScore=${r.importanceScore}`));
    process.exit(1);
  }

  // ── P8-DATA-03 ①：Stock 存在性校验 —— 不存在/退市的 symbol 跳过并记录，不静默写入 ──
  const seedSymbols = [...new Set(ALL_THEMES.map((r) => r.symbol))];
  const stockRows = await prisma.stock.findMany({
    where: { symbol: { in: seedSymbols } },
    select: { symbol: true, isDelisted: true },
  });
  const tradable = new Set(stockRows.filter((s) => !s.isDelisted).map((s) => s.symbol));
  const notInUniverse = seedSymbols.filter((s) => !tradable.has(s));
  if (notInUniverse.length) {
    console.log(`⚠️  跳过 ${notInUniverse.length} 个无 Stock 记录/已退市 symbol（不写入）: ${notInUniverse.join(", ")}\n`);
  }

  // ── P8-DATA-03 ②：只读预扫描 → 生成写入计划（DRY 与 APPLY 共用同一计划）──
  const key = (s: string, t: string) => `${s}__${t}`;
  const dataOf = (row: ThemeEntry) => ({
    // P8-DATA-04：写入前统一标准化（上方硬断言已保证非 null）
    subTheme: normalizeSubTheme(row.subTheme)!,
    role: row.role,
    supplyChainLayer: row.supplyChainLayer,
    importanceScore: row.importanceScore,
    reason: row.reason,
    riskNote: row.riskNote ?? null,
    isCore: row.isCore,
  });

  const existing = await prisma.aITheme.findMany({
    select: {
      symbol: true, theme: true, subTheme: true, role: true,
      supplyChainLayer: true, importanceScore: true, reason: true, riskNote: true, isCore: true,
    },
  });
  const exMap = new Map(existing.map((r) => [key(r.symbol, r.theme), r]));

  let skipped = 0, skippedMissing = 0;
  const seen = new Set<string>();
  const plan: { kind: "create" | "update"; row: ThemeEntry }[] = [];

  for (const row of ALL_THEMES) {
    // Stock 表无记录 / 已退市 → 跳过并记录，绝不静默写入。
    if (!tradable.has(row.symbol)) { skippedMissing++; continue; }
    const k = key(row.symbol, row.theme);
    seen.add(k);
    const d = dataOf(row);
    const cur = exMap.get(k);
    if (!cur) {
      plan.push({ kind: "create", row });
      console.log(`  + [${row.theme.padEnd(20)}] ${row.symbol.padEnd(8)}${row.isCore ? " ⭐" : ""}`);
    } else {
      const same =
        cur.subTheme === d.subTheme && cur.role === d.role &&
        cur.supplyChainLayer === d.supplyChainLayer && cur.importanceScore === d.importanceScore &&
        cur.reason === d.reason && (cur.riskNote ?? null) === d.riskNote && cur.isCore === d.isCore;
      if (same) skipped++;
      else { plan.push({ kind: "update", row }); console.log(`  ~ [${row.theme.padEnd(20)}] ${row.symbol.padEnd(8)} (更新)`); }
    }
  }

  const toRemove = existing.filter((r) => INVALID_SYMBOLS.includes(r.symbol));
  const created = plan.filter((p) => p.kind === "create").length;
  const updated = plan.filter((p) => p.kind === "update").length;
  const removed = toRemove.length;
  if (removed) {
    console.log(`\n🗑  ${DRY ? "将移除" : "移除"}无效关联 ${removed} 条（${toRemove.map((t) => `${t.symbol}/${t.theme}`).join(", ")}）`);
  }

  // 期望终态：完全由种子数据 + 可交易过滤派生（非硬编码）
  const live = ALL_THEMES.filter((r) => tradable.has(r.symbol));
  const expected = {
    records: live.length,
    symbols: new Set(live.map((r) => r.symbol)).size,
    themes: new Set(live.map((r) => r.theme)).size,
    core: live.filter((r) => r.isCore).length,
    downstream: live.filter((r) => r.supplyChainLayer === "DOWNSTREAM").length,
  };

  // ── P8-DATA-03 ③：单事务写入（移除 + 新增 + 更新）+ 写后断言，任一不符立即回滚 ──
  if (!DRY) {
    await prisma.$transaction(async (tx) => {
      if (removed) await tx.aITheme.deleteMany({ where: { symbol: { in: INVALID_SYMBOLS } } });
      for (const p of plan) {
        const d = dataOf(p.row);
        if (p.kind === "create") await tx.aITheme.create({ data: { symbol: p.row.symbol, theme: p.row.theme, ...d } });
        else await tx.aITheme.update({ where: { symbol_theme: { symbol: p.row.symbol, theme: p.row.theme } }, data: d });
      }
      // 写后断言（在事务内校验终态；throw → 整体回滚，生产数据不变）
      const after = await tx.aITheme.findMany({ select: { symbol: true, theme: true, isCore: true, supplyChainLayer: true, subTheme: true, importanceScore: true } });
      const a = {
        records: after.length,
        symbols: new Set(after.map((r) => r.symbol)).size,
        themes: new Set(after.map((r) => r.theme)).size,
        core: after.filter((r) => r.isCore).length,
        downstream: after.filter((r) => r.supplyChainLayer === "DOWNSTREAM").length,
        dup: after.length - new Set(after.map((r) => key(r.symbol, r.theme))).size,
      };
      const fails: string[] = [];
      if (a.records !== expected.records) fails.push(`records ${a.records}≠${expected.records}`);
      if (a.symbols !== expected.symbols) fails.push(`symbols ${a.symbols}≠${expected.symbols}`);
      if (a.themes !== expected.themes) fails.push(`themes ${a.themes}≠${expected.themes}`);
      if (a.core !== expected.core) fails.push(`core ${a.core}≠${expected.core}`);
      if (a.downstream !== expected.downstream) fails.push(`DOWNSTREAM ${a.downstream}≠${expected.downstream}`);
      if (a.dup !== 0) fails.push(`duplicate[symbol,theme]=${a.dup}`);
      // P8-DATA-04：subTheme 必须全部 ∈ 标准词表；Unknown=0；distinct 落在 25~40
      const badSub = [...new Set(after.map((r) => r.subTheme).filter((s) => !s || !VOCAB_SET.has(s)))];
      if (badSub.length) fails.push(`subTheme 非标准词表(Unknown=${badSub.length}): ${badSub.slice(0, 5).join(", ")}`);
      const subDistinct = new Set(after.map((r) => r.subTheme)).size;
      if (subDistinct < 25 || subDistinct > 40) fails.push(`subTheme distinct=${subDistinct} 不在 25~40`);

      // 不变量：五层分布 与 AI关联强度分布 必须与种子期望完全一致（本次仅规范化 subTheme）
      const layerAfter = after.reduce<Record<string, number>>((m, r) => { const k = r.supplyChainLayer ?? "(null)"; m[k] = (m[k] ?? 0) + 1; return m; }, {});
      const layerExp = live.reduce<Record<string, number>>((m, r) => { m[r.supplyChainLayer] = (m[r.supplyChainLayer] ?? 0) + 1; return m; }, {});
      for (const L of ["UPSTREAM", "MIDSTREAM", "INFRASTRUCTURE", "DOWNSTREAM", "APPLICATION"]) {
        if ((layerAfter[L] ?? 0) !== (layerExp[L] ?? 0)) fails.push(`layer ${L} ${layerAfter[L] ?? 0}≠${layerExp[L] ?? 0}`);
      }
      const stAfter = after.reduce<Record<number, number>>((m, r) => { const k = strengthOf(r.importanceScore); m[k] = (m[k] ?? 0) + 1; return m; }, {});
      const stExp = live.reduce<Record<number, number>>((m, r) => { const k = strengthOf(r.importanceScore); m[k] = (m[k] ?? 0) + 1; return m; }, {});
      for (const s of [3, 2, 1, 0]) {
        if ((stAfter[s] ?? 0) !== (stExp[s] ?? 0)) fails.push(`strength${s} ${stAfter[s] ?? 0}≠${stExp[s] ?? 0}`);
      }

      if (fails.length) throw new Error(`写后断言失败 → 事务回滚：${fails.join(" | ")}`);
      console.log(`\n🔒 事务写后断言全部通过：records=${a.records} symbols=${a.symbols} themes=${a.themes} core=${a.core} dup=${a.dup} subTheme_distinct=${subDistinct} Unknown=0`);
      console.log(`   layer=${["UPSTREAM", "MIDSTREAM", "INFRASTRUCTURE", "DOWNSTREAM", "APPLICATION"].map((L) => layerAfter[L] ?? 0).join("/")}  strength=3:${stAfter[3] ?? 0}/2:${stAfter[2] ?? 0}/1:${stAfter[1] ?? 0}`);
    }, { timeout: 120_000, maxWait: 15_000 });
  }

  const orphans = existing.filter((r) => !seen.has(key(r.symbol, r.theme)) && !INVALID_SYMBOLS.includes(r.symbol));

  // Stats
  const byTheme = await prisma.aITheme.groupBy({
    by: ["theme"],
    _count: { theme: true },
    orderBy: { theme: "asc" },
  });

  const uniqueSymbols = new Set(ALL_THEMES.map((r) => r.symbol));
  const coreCount = ALL_THEMES.filter((r) => r.isCore).length;

  console.log(`\n✅ Seed 完成（幂等 · ${SEED_VERSION}）`);
  console.log(`   created=${created}  updated=${updated}  unchanged=${skipped}  removed=${removed}  skipped_missing=${skippedMissing}${DRY ? "  (DRY_RUN 未写库)" : ""}`);
  const byLayer = ALL_THEMES.filter((r) => tradable.has(r.symbol))
    .reduce<Record<string, number>>((a, r) => { a[r.supplyChainLayer] = (a[r.supplyChainLayer] ?? 0) + 1; return a; }, {});
  console.log(`   五层分布: ${["UPSTREAM", "MIDSTREAM", "INFRASTRUCTURE", "DOWNSTREAM", "APPLICATION"].map((l) => `${l}=${byLayer[l] ?? 0}`).join("  ")}`);
  const st = ALL_THEMES.filter((r) => tradable.has(r.symbol))
    .reduce<Record<number, number>>((a, r) => { const s = strengthOf(r.importanceScore); a[s] = (a[s] ?? 0) + 1; return a; }, {});
  console.log(`   AI关联强度: 3=${st[3] ?? 0}  2=${st[2] ?? 0}  1=${st[1] ?? 0}`);
  console.log(`   orphans_kept=${orphans.length}${orphans.length ? "（保留未删除：" + orphans.slice(0, 10).map((o) => `${o.symbol}/${o.theme}`).join(", ") + (orphans.length > 10 ? " …" : "") + "）" : ""}`);
  console.log(`   种子主题数：${new Set(ALL_THEMES.map((r) => r.theme)).size}   记录数：${ALL_THEMES.length}   覆盖股票：${uniqueSymbols.size} 只   核心：${coreCount} 个`);
  console.log("\n分类统计（库内实际）：");

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
