// ── Explain AI Engine · 文案模板（P5-T1）─────────────────────────────────────
// 稳定 code → 中文标签映射。规则引擎产出的自然语言从这里取，便于未来 i18n / GPT 对齐。

// 5 维满分
export const DIM_MAX = { technical: 30, fundamental: 25, moneyFlow: 20, news: 15, global: 10 } as const;
export type DimKey = keyof typeof DIM_MAX;

export const DIM_LABEL: Record<DimKey, string> = {
  technical: "技术面",
  fundamental: "基本面",
  moneyFlow: "资金流动性",
  news: "新闻情绪",
  global: "全球市场",
};

export const REC_LABEL: Record<string, string> = {
  STRONG_BUY: "强烈买入",
  BUY: "买入",
  HOLD: "持有",
  WATCH: "观察",
  AVOID: "回避",
};

export const REGIME_LABEL: Record<string, string> = {
  BULL: "牛市",
  SIDEWAYS: "震荡市",
  BEAR: "熊市",
};

export const STYLE_LABEL: Record<string, string> = {
  VALUE_DEFENSIVE: "价值防御",
  GROWTH_MOMENTUM: "成长动量",
  QUALITY_COMPOUNDER: "质量复利",
  SPECULATIVE_MOMENTUM: "投机动量",
  CYCLICAL_EXPORTER: "周期出口",
  DOMESTIC_DEFENSIVE: "内需防御",
};

export function dimLabel(k: DimKey): string { return DIM_LABEL[k]; }
export function recLabel(r: string | null | undefined): string { return r ? REC_LABEL[r] ?? r : "—"; }
export function regimeLabel(r: string | null | undefined): string { return r ? REGIME_LABEL[r] ?? r : "—"; }
export function styleLabel(s: string | null | undefined): string { return s ? STYLE_LABEL[s] ?? s : "—"; }
