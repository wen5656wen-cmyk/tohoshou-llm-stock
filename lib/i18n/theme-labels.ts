import type { Lang } from "./types";

export const THEME_LABELS_LOCALE: Record<string, Record<Lang, string>> = {
  CHIP_DESIGN:       { "zh-CN": "AI芯片设计",      "ja-JP": "AIチップ設計" },
  SEMI_EQUIPMENT:    { "zh-CN": "半导体设备",       "ja-JP": "半導体製造装置" },
  TEST_EQUIPMENT:    { "zh-CN": "测试设备",         "ja-JP": "検査装置" },
  CHIP_MATERIAL:     { "zh-CN": "芯片材料",         "ja-JP": "半導体材料" },
  HBM_PACKAGING:     { "zh-CN": "HBM封装",          "ja-JP": "HBMパッケージ" },
  SENSOR_PRECISION:  { "zh-CN": "传感器・精密",     "ja-JP": "センサー・精密" },
  SERVER_DC:         { "zh-CN": "服务器・数据中心", "ja-JP": "サーバー・DC" },
  NETWORK:           { "zh-CN": "网络通信",         "ja-JP": "ネットワーク" },
  ROBOT_AUTO:        { "zh-CN": "机器人・自动化",   "ja-JP": "ロボット・自動化" },
  SOFTWARE_CLOUD:    { "zh-CN": "软件・云・SaaS",   "ja-JP": "ソフトウェア・クラウド" },
  INTERNET_PLATFORM: { "zh-CN": "互联网・平台",     "ja-JP": "インターネット・プラットフォーム" },
  MEDICAL_LIFE:      { "zh-CN": "医疗AI",           "ja-JP": "医療AI" },
  SECURITY_VISION:   { "zh-CN": "安防・视觉",       "ja-JP": "セキュリティ・映像" },
  POWER_INFRA:       { "zh-CN": "能源基础设施",     "ja-JP": "エネルギーインフラ" },
  // ── P8-DATA-03 新增 ──
  AI_STORAGE:        { "zh-CN": "AI存储",           "ja-JP": "AIストレージ" },
  AI_COOLING:        { "zh-CN": "AI散热",           "ja-JP": "AI冷却" },
  AUTO_DRIVE:        { "zh-CN": "自动驾驶",         "ja-JP": "自動運転" },
};

export function getThemeLabel(themeKey: string, lang: Lang): string {
  return THEME_LABELS_LOCALE[themeKey]?.[lang] ?? themeKey;
}

export const LAYER_LABELS_LOCALE: Record<string, Record<Lang, string>> = {
  UPSTREAM:       { "zh-CN": "上游",    "ja-JP": "上流" },
  MIDSTREAM:      { "zh-CN": "中游",    "ja-JP": "中流" },
  DOWNSTREAM:     { "zh-CN": "下游",    "ja-JP": "下流" },
  INFRASTRUCTURE: { "zh-CN": "基础设施", "ja-JP": "インフラ" },
  APPLICATION:    { "zh-CN": "应用层",  "ja-JP": "応用層" },
};

export function getLayerLabel(layerKey: string, lang: Lang): string {
  return LAYER_LABELS_LOCALE[layerKey]?.[lang] ?? layerKey;
}

export const LAYER_DESC_LOCALE: Record<string, Record<Lang, string>> = {
  UPSTREAM:       { "zh-CN": "材料・零部件・芯片设计", "ja-JP": "材料・部品・チップ設計" },
  MIDSTREAM:      { "zh-CN": "设备・测试・封装",       "ja-JP": "装置・検査・パッケージ" },
  DOWNSTREAM:     { "zh-CN": "系统・解决方案",         "ja-JP": "システム・ソリューション" },
  INFRASTRUCTURE: { "zh-CN": "网络・DC・电力",         "ja-JP": "ネットワーク・DC・電力" },
  APPLICATION:    { "zh-CN": "软件・服务・终端",       "ja-JP": "ソフトウェア・サービス・端末" },
};

export function getLayerDesc(layerKey: string, lang: Lang): string {
  return LAYER_DESC_LOCALE[layerKey]?.[lang] ?? "";
}
