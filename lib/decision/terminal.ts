// ── Terminal Design System（P15-03 · 专业交易终端统一视觉规范）─────────────────
// Decision Center 全站唯一终端 token：8pt 间距 / 行高 / 表格色 / action 色条 / AI 等级。
// 纯常量与纯函数，无副作用。演进自 lib/decision/ds（COLORS/格式化）。
import { COLORS } from "../design-tokens";

/** 8pt Grid 间距（禁止随机 margin/padding） */
export const SP = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

/** 终端表格统一行高 & 交互色 */
export const ROW_H = 56;
export const TERM = {
  zebra: "#FAFBFC",
  hover: "#F1F6FF",
  selected: "#E7F0FF",
  header: "#F6F7F9",
  headerText: "#8A8F98",
  gridLine: "#EEEFF2",
} as const;

const ORANGE = "#FF9F0A";
/** action → 左侧色条 & 语义色（STOP红 / SELL·REDUCE橙 / WAIT琥珀 / BUY·ADD·TP绿 / HOLD灰） */
export const ACTION_COLOR: Record<string, string> = {
  STOP_LOSS: COLORS.danger, SELL: ORANGE, REDUCE: ORANGE,
  WAIT: "#F5A623", BUY: COLORS.success, ADD: COLORS.success, TAKE_PROFIT: COLORS.success,
  HOLD: "#9AA0A6", CASH: "#9AA0A6", NO_TRADE: "#9AA0A6",
};
export const actionColor = (a: string | null | undefined): string => (a && ACTION_COLOR[a]) || "#9AA0A6";

/** AI 分 → 专业等级（取代电商星级）。A+/A/B+/B/C+/C */
export function gradeFor(ai: number | null | undefined): { grade: string; color: string } {
  if (ai == null) return { grade: "—", color: COLORS.textFaint };
  if (ai >= 88) return { grade: "A+", color: COLORS.success };
  if (ai >= 78) return { grade: "A", color: COLORS.success };
  if (ai >= 70) return { grade: "B+", color: COLORS.primary };
  if (ai >= 60) return { grade: "B", color: COLORS.primary };
  if (ai >= 50) return { grade: "C+", color: "#F5A623" };
  return { grade: "C", color: COLORS.textFaint };
}

/** 终端统一列宽（px；Symbol/Name 弹性）。所有列表一致。 */
export const COLW = {
  rank: 40, action: 64, current: 92, pnl: 76, entry: 128, target: 88, stop: 88, ai: 72, detail: 60,
} as const;
