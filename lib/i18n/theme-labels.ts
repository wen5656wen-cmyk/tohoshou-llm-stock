import type { Lang } from "./types";

export const THEME_LABELS_LOCALE: Record<string, Record<Lang, string>> = {
  CHIP_DESIGN:       { "zh-CN": "AI芯片设计",      "ja-JP": "AIチップ設計",                  "en-US": "AI Chip Design" },
  SEMI_EQUIPMENT:    { "zh-CN": "半导体设备",       "ja-JP": "半導体製造装置",                "en-US": "Semiconductor Equipment" },
  TEST_EQUIPMENT:    { "zh-CN": "测试设备",         "ja-JP": "検査装置",                      "en-US": "Testing Equipment" },
  CHIP_MATERIAL:     { "zh-CN": "芯片材料",         "ja-JP": "半導体材料",                    "en-US": "Chip Materials" },
  HBM_PACKAGING:     { "zh-CN": "HBM封装",          "ja-JP": "HBMパッケージ",                 "en-US": "HBM Packaging" },
  SENSOR_PRECISION:  { "zh-CN": "传感器・精密",     "ja-JP": "センサー・精密",                "en-US": "Sensors & Precision" },
  SERVER_DC:         { "zh-CN": "服务器・数据中心", "ja-JP": "サーバー・DC",                  "en-US": "Server & Data Center" },
  NETWORK:           { "zh-CN": "网络通信",         "ja-JP": "ネットワーク",                  "en-US": "Networking" },
  ROBOT_AUTO:        { "zh-CN": "机器人・自动化",   "ja-JP": "ロボット・自動化",              "en-US": "Robotics & Automation" },
  SOFTWARE_CLOUD:    { "zh-CN": "软件・云・SaaS",   "ja-JP": "ソフトウェア・クラウド",        "en-US": "Software & Cloud" },
  INTERNET_PLATFORM: { "zh-CN": "互联网・平台",     "ja-JP": "インターネット・プラットフォーム", "en-US": "Internet Platform" },
  MEDICAL_LIFE:      { "zh-CN": "医疗AI",           "ja-JP": "医療AI",                        "en-US": "Medical AI" },
  SECURITY_VISION:   { "zh-CN": "安防・视觉",       "ja-JP": "セキュリティ・映像",            "en-US": "Security & Vision" },
  POWER_INFRA:       { "zh-CN": "能源基础设施",     "ja-JP": "エネルギーインフラ",            "en-US": "Energy Infrastructure" },
};

export function getThemeLabel(themeKey: string, lang: Lang): string {
  return THEME_LABELS_LOCALE[themeKey]?.[lang] ?? themeKey;
}

export const LAYER_LABELS_LOCALE: Record<string, Record<Lang, string>> = {
  UPSTREAM:       { "zh-CN": "上游",    "ja-JP": "上流",    "en-US": "Upstream" },
  MIDSTREAM:      { "zh-CN": "中游",    "ja-JP": "中流",    "en-US": "Midstream" },
  DOWNSTREAM:     { "zh-CN": "下游",    "ja-JP": "下流",    "en-US": "Downstream" },
  INFRASTRUCTURE: { "zh-CN": "基础设施", "ja-JP": "インフラ", "en-US": "Infrastructure" },
  APPLICATION:    { "zh-CN": "应用层",  "ja-JP": "応用層",  "en-US": "Applications" },
};

export function getLayerLabel(layerKey: string, lang: Lang): string {
  return LAYER_LABELS_LOCALE[layerKey]?.[lang] ?? layerKey;
}

export const LAYER_DESC_LOCALE: Record<string, Record<Lang, string>> = {
  UPSTREAM:       { "zh-CN": "材料・零部件・芯片设计", "ja-JP": "材料・部品・チップ設計",          "en-US": "Materials · Components · Chip Design" },
  MIDSTREAM:      { "zh-CN": "设备・测试・封装",       "ja-JP": "装置・検査・パッケージ",          "en-US": "Equipment · Testing · Packaging" },
  DOWNSTREAM:     { "zh-CN": "系统・解决方案",         "ja-JP": "システム・ソリューション",         "en-US": "Systems · Solutions" },
  INFRASTRUCTURE: { "zh-CN": "网络・DC・电力",         "ja-JP": "ネットワーク・DC・電力",           "en-US": "Network · DC · Power" },
  APPLICATION:    { "zh-CN": "软件・服务・终端",       "ja-JP": "ソフトウェア・サービス・端末",     "en-US": "Software · Services · Endpoints" },
};

export function getLayerDesc(layerKey: string, lang: Lang): string {
  return LAYER_DESC_LOCALE[layerKey]?.[lang] ?? "";
}
