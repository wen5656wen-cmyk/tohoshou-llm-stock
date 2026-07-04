// ── TOHOSHOU AI · Design Tokens（全站统一设计基础，单一来源）──────────────────
// P4-T2 工程化治理。所有 UI 颜色/圆角/阴影/间距/字号/过渡/层级的唯一来源。
// 禁止在页面内再写 magic number（#F7F8FA / rgba() / 24px 等）——一律从这里 import。
// 当前基准 = 全站已统一的 Apple Dashboard 浅色（首页/研究中心/控制中心/策略/自动交易一致）。

export const COLORS = {
  background: "#F7F8FA", // 页面底
  card: "#FFFFFF", // 卡片
  tile: "#F4F5F7", // 卡内小块 / hover 底
  track: "#EEF0F4", // segmented 轨道
  border: "#E8EAED", // 主边框
  borderSoft: "#EEF0F4", // 弱边框（表格行分隔）
  text: "#1D1D1F", // 主文字（ink）
  textSecondary: "#6E6E73", // 次文字（sub）
  textMuted: "#86868B", // 更弱
  textFaint: "#A1A1A6", // 最弱 / 占位
  primary: "#007AFF", // 主色（蓝）
  success: "#34C759", // 成功（绿）
  warning: "#FF9F0A", // 警告（橙）
  danger: "#FF3B30", // 危险（红）
  purple: "#5E5CE6", // 紫
  white: "#FFFFFF",
} as const;

// 备用品牌基准（如未来切换品牌蓝，改这里再统一映射，不动页面）：
// primary #1677FF · success #16A34A · warning #F59E0B · danger #EF4444 · purple #7C3AED · text #111827 · textSecondary #6B7280

// ── 状态语义色（全站统一）─────────────────────────────────────────────────────
export type StatusKind = "SUCCESS" | "WARNING" | "ERROR" | "INFO" | "COMING_SOON";
export const STATUS_COLORS: Record<StatusKind, string> = {
  SUCCESS: COLORS.success,
  WARNING: COLORS.warning,
  ERROR: COLORS.danger,
  INFO: COLORS.primary,
  COMING_SOON: COLORS.textFaint,
};

// tone → 颜色（UI Kit 通用语义）
export type Tone = "neutral" | "blue" | "green" | "amber" | "red" | "purple";
export function toneColor(tone: Tone): string {
  switch (tone) {
    case "blue": return COLORS.primary;
    case "green": return COLORS.success;
    case "amber": return COLORS.warning;
    case "red": return COLORS.danger;
    case "purple": return COLORS.purple;
    default: return COLORS.textSecondary;
  }
}

// 涨跌染色：正绿 / 负红 / 中性 / 空缺
export function retColor(v: number | null | undefined): string {
  if (v == null) return COLORS.textFaint;
  return v > 0 ? COLORS.success : v < 0 ? COLORS.danger : COLORS.textSecondary;
}

// ── 圆角 ──────────────────────────────────────────────────────────────────────
export const RADIUS = { sm: 8, md: 12, lg: 16, xl: 22, pill: 9999 } as const;

// ── 阴影 ──────────────────────────────────────────────────────────────────────
export const SHADOW = {
  none: "none",
  sm: "0 1px 3px rgba(0,0,0,0.04)",
  md: "0 8px 30px rgba(0,0,0,0.05)",
} as const;

// ── 间距（px）─────────────────────────────────────────────────────────────────
export const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, "2xl": 24, "3xl": 32 } as const;

// ── 字体 ──────────────────────────────────────────────────────────────────────
export const FONT_FAMILY = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', Inter, system-ui, sans-serif";
export const FONT = {
  pageTitle: { fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" },
  sectionTitle: { fontSize: 19, fontWeight: 600, letterSpacing: "-0.01em" },
  cardTitle: { fontSize: 14, fontWeight: 600 },
  metric: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" },
  description: { fontSize: 13, fontWeight: 400 },
  label: { fontSize: 12, fontWeight: 600 },
  caption: { fontSize: 11, fontWeight: 500 },
} as const;

// ── 过渡 ──────────────────────────────────────────────────────────────────────
export const TRANSITION = { base: "all .2s ease", slow: "all .4s ease", spin: "dash-spin .8s linear infinite" } as const;

// ── 层级（弹层规范，与既有 Z 规范一致）───────────────────────────────────────
export const Z = { base: 1, sticky: 30, tooltip: 9000, dropdown: 9500, modal: 10000 } as const;

// ── 复合边框快捷值 ────────────────────────────────────────────────────────────
export const BORDER = {
  hairline: `1px solid ${COLORS.border}`,
  soft: `1px solid ${COLORS.borderSoft}`,
} as const;
