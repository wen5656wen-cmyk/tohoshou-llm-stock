// ── Decision Design System · tokens + 格式化 SSOT（P14-DEV-01）──────────────────
// 演进自现有 lib/design-tokens.ts（COLORS/Tone），为 Decision 终端层补语义 token 与
// 唯一格式化函数（Freeze 必改⑥：verdict/价格/涨跌/评分/风险 各一个 SSOT + 一种格式）。
// 纯常量与纯函数，无副作用；供 Decision v2 全部组件复用。
import { COLORS, type Tone } from "../design-tokens";

export { COLORS };

/** 语义色（涨/跌/警告/强调/中性），全 Decision 层唯一来源 */
export const SEM = {
  up: COLORS.success,
  down: COLORS.danger,
  warn: COLORS.warning,
  accent: COLORS.primary,
  neutral: COLORS.textFaint,
} as const;

/** 涨跌值 → 色 */
export const upDownColor = (v: number | null | undefined): string =>
  v == null ? COLORS.textFaint : v > 0 ? COLORS.success : v < 0 ? COLORS.danger : COLORS.textSecondary;

/** 风险等级 → tone（LOW/MED/HIGH 全站统一） */
export const riskTone = (r: string | null | undefined): Tone =>
  r === "HIGH" ? "red" : r === "MEDIUM" || r === "MED" ? "amber" : r === "LOW" ? "green" : "neutral";

// ── 格式化 SSOT ────────────────────────────────────────────────────────────────
/** 日元整数：¥1,435 */
export const fmtJpy = (v: number | null | undefined): string =>
  v == null ? "—" : `¥${Math.round(v).toLocaleString("en-US")}`;
/** 百分比带符号：+1.2% / −0.8%（默认 1 位小数） */
export const fmtPct = (v: number | null | undefined, digits = 1): string => {
  if (v == null) return "—";
  const p = 10 ** digits;
  return `${v > 0 ? "+" : ""}${(Math.round(v * p) / p).toFixed(digits)}%`;
};
/** 评分整数 0–100 */
export const fmtScore = (v: number | null | undefined): string => (v == null ? "—" : String(Math.round(v)));
/** JST 时钟 HH:mm:ss */
export const fmtJstClock = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const d = new Date(t + 9 * 3600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
};

/** 终端密度间距（px），供组件统一取值 */
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
/** 字阶（px），终端偏紧凑 */
export const TYPE = { hero: 30, h1: 20, h2: 15, body: 13, sub: 12, tiny: 11, micro: 10 } as const;
