/**
 * lib/ai-theme-subtheme.ts — AI 产业链 subTheme 标准词表与映射
 * ────────────────────────────────────────────────────────────────────────────
 * P8-DATA-04 · Single Source of Truth（唯一来源）
 *   · 标准词表（Controlled Vocabulary）与历史自由文本 → 标准分类的 Mapping 只在此维护。
 *   · seed 脚本（scripts/seed-ai-themes.ts）与前端分类过滤共用本模块，禁止各处复制。
 *   · 仅规范化 subTheme —— 不影响 theme / supplyChainLayer / importanceScore / isCore /
 *     股票集合 / 任何评分逻辑。
 *   · 新增分类必须：① 加入 SUBTHEME_VOCAB ② 为其补齐 SUBTHEME_MAP 条目
 *     ③ 保持词表容量 25~40（seed 写库前有硬断言，越界即 exit(1)）。
 */

// ─── P8-DATA-04：subTheme 标准词表（Controlled Vocabulary）─────────────────────
// 目标：136 个自由文本 → 40 个标准分类（25~40 区间）。仅规范化 subTheme，
// 不动 theme / layer / importanceScore / isCore / 股票集合 / 评分。
export const SUBTHEME_VOCAB = [
  // Semiconductor / Chip
  "Chip Design", "AI Accelerator", "Power Semiconductor", "Image Sensor",
  // Memory
  "NAND", "Memory Testing",
  // Materials
  "Silicon Wafer", "Photoresist", "Semiconductor Material", "Photomask",
  "Advanced Packaging", "ABF Substrate", "PCB", "Passive & Connector",
  // Equipment
  "Wafer Process", "Inspection", "Testing", "Sensor",
  // Infrastructure
  "AI Server", "Datacenter", "Cooling", "Power", "Transformer", "Optical Comm", "Network",
  // Software
  "LLM", "AI Platform", "AI SaaS", "Enterprise AI", "Search & Recommendation",
  "Cyber Security", "OCR & Vision AI",
  // Application
  "Healthcare AI", "Robotics", "Manufacturing AI", "Autonomous Driving",
  "Advertising AI", "Finance AI", "Retail AI", "Content AI",
] as const;
export const VOCAB_SET = new Set<string>(SUBTHEME_VOCAB);

// 历史自由文本 → 标准分类（覆盖生产库全部 136 个 distinct 值）
const SUBTHEME_MAP: Record<string, string> = {
  // ── Cooling
  "データセンター空調": "Cooling", "冷却ファン・液冷ポンプ": "Cooling",
  // ── Memory
  "HBMテスター": "Memory Testing", "メモリテスター": "Memory Testing",
  "NAND・企業向けSSD": "NAND",
  // ── Autonomous Driving
  "ADAS・車載AI": "Autonomous Driving", "HD地図・自動運転": "Autonomous Driving",
  "自動運転Lv3": "Autonomous Driving", "自動運転・Woven City": "Autonomous Driving",
  // ── Chip Design / Accelerator / Power semi / Image sensor
  "車載AI SoC": "Chip Design", "マイコン・SoC": "Chip Design",
  "ASIC・SoC受託設計": "AI Accelerator", "カスタムSoC・AI ASIC": "AI Accelerator",
  "パワー半導体": "Power Semiconductor", "パワーエレクトロニクス": "Power Semiconductor",
  "CMOSイメージセンサー": "Image Sensor", "CMOSセンサー": "Image Sensor", "光センサー半導体": "Image Sensor",
  // ── Materials
  "EUVフォトレジスト・シリコンウェーハ": "Silicon Wafer", "シリコンウェーハ": "Silicon Wafer",
  "フォトレジスト": "Photoresist", "CMP・フォトレジスト材料": "Photoresist",
  "ポリイミド": "Semiconductor Material", "半導体・光学フィルム": "Semiconductor Material",
  "半導体反射防止膜": "Semiconductor Material", "半導体材料": "Semiconductor Material",
  "機能性フィルム": "Semiconductor Material", "特殊化学品": "Semiconductor Material",
  "産業ガス": "Semiconductor Material", "電子ガス": "Semiconductor Material",
  "半導体マスク・光学": "Photomask", "光学システム": "Photomask",
  // ── Packaging / Substrate / PCB / Passive
  "セラミックパッケージ": "Advanced Packaging", "特殊銅合金": "Advanced Packaging",
  "銅リードフレーム・ワイヤー": "Advanced Packaging", "ボンディングワイヤ": "Advanced Packaging",
  "リードフレーム": "Advanced Packaging", "モールディング": "Advanced Packaging",
  "FC-BGAサブストレート": "ABF Substrate",
  "回路基板": "PCB", "高多層PCB": "PCB", "FPC・フレキシブル基板": "PCB",
  "MLCC": "Passive & Connector", "MLCC・センサー": "Passive & Connector",
  "センサー・インダクタ": "Passive & Connector", "コネクタ": "Passive & Connector",
  "コネクタ・端子": "Passive & Connector",
  // ── Equipment
  "CVD/エッチング/成膜": "Wafer Process", "バッチALD・成膜装置": "Wafer Process",
  "真空・成膜装置": "Wafer Process", "洗浄・コーティング": "Wafer Process",
  "超純水・CMP": "Wafer Process", "CMP・精密測定": "Wafer Process", "ダイシング・研削": "Wafer Process",
  "EUVマスク検査": "Inspection", "電子顕微鏡": "Inspection", "分析計測": "Inspection",
  "SoCテスター": "Testing", "ウェーハ測定": "Testing",
  "産業センサー": "Sensor", "FA光学センサー": "Sensor", "センシング・制御": "Sensor",
  // ── Infrastructure
  "AIサーバー・システム": "AI Server", "HPC・AIシステム": "AI Server",
  "インターネットDC": "Datacenter", "クラウド・DC": "Datacenter",
  "クラウド・DC・ネットワーク": "Datacenter", "国産DC・光ファイバー": "Datacenter",
  "国産クラウド・DC": "Datacenter", "AIインフラ": "Datacenter", "AI投資・Arm・DC": "Datacenter",
  "電力供給": "Power", "発電・原子力": "Power", "電力・ITシステム": "Power",
  "蓄電池・UPS": "Power", "電力ケーブル": "Power",
  "変圧器・配電": "Transformer", "変圧器・配電機器": "Transformer",
  "光ファイバー": "Optical Comm", "光ファイバーケーブル": "Optical Comm",
  "海底ケーブル・光ファイバー": "Optical Comm", "IOWN全光ネットワーク": "Optical Comm",
  "ネットワーク機器": "Network", "ネットワーク計測": "Network", "通信システム": "Network",
  "5G・エッジAI": "Network", "5G・クラウド": "Network",
  // ── Software
  "生成AI・AI Agent": "LLM", "数理AI": "LLM",
  "AI基盤プラットフォーム": "AI Platform",
  "AI名刺・CRM": "AI SaaS", "クラウド会計・AI": "AI SaaS", "リテールSaaS": "AI SaaS",
  "企業SaaS(kintone)": "AI SaaS",
  "AI SI": "Enterprise AI", "AIコンサル・SI": "Enterprise AI", "企業AI・SI": "Enterprise AI",
  "AI人材・HR": "Enterprise AI", "HR・求人AI": "Enterprise AI", "AI分析・JDSC": "Enterprise AI",
  "検索・レコメンドAI": "Search & Recommendation", "SNS・検索AI": "Search & Recommendation",
  "LINEプラットフォーム": "Search & Recommendation",
  "AIサイバーセキュリティ": "Cyber Security", "AIセキュリティ": "Cyber Security",
  "AIカメラ・OCR": "OCR & Vision AI", "顔認識・AI安全": "OCR & Vision AI",
  "機械ビジョン": "OCR & Vision AI", "機械ビジョン・FA": "OCR & Vision AI",
  // ── Application
  "AIドラッグディスカバリー": "Healthcare AI", "AI創薬": "Healthcare AI",
  "AI創薬・ロボット手術": "Healthcare AI", "AI抗体・がん治療": "Healthcare AI",
  "体外診断・ヘマトロジー": "Healthcare AI", "内視鏡AI診断": "Healthcare AI",
  "医療ビッグデータAI": "Healthcare AI", "医療情報AI": "Healthcare AI", "医療機器AI": "Healthcare AI",
  "産業ロボット・CNC": "Robotics", "サーボモーター・ロボット": "Robotics",
  "ロボット減速機": "Robotics", "産業ロボット・軸受": "Robotics",
  "精密部品・モーター": "Robotics", "空気圧機器": "Robotics",
  "FA制御システム": "Manufacturing AI", "産業制御・FA": "Manufacturing AI",
  "産業システム・重工": "Manufacturing AI", "物流自動化": "Manufacturing AI",
  "AIデジタル広告": "Advertising AI", "メディア・広告AI": "Advertising AI",
  "AIフィンテック": "Finance AI",
  "AIフリマ": "Retail AI", "フリマプラットフォーム": "Retail AI",
  "ゲームAI": "Content AI", "ゲーム・メタバース": "Content AI", "エンタメAI": "Content AI",
};

/** 自由文本 → 标准分类；已是标准值则原样返回；无法映射返回 null（=Unknown，将阻断写库）。 */
export function normalizeSubTheme(raw: string): string | null {
  if (VOCAB_SET.has(raw)) return raw;
  return SUBTHEME_MAP[raw] ?? null;
}
