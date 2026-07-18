// ── 盯盘状态派生 · 单一来源（P13-DECISION-06）────────────────────────────────
// 纯函数：Live Monitor 全页（行动摘要 / 组合监控 / 异动 / 列表）唯一的状态判定来源。
// 禁止在卡片/表格/统计各处复制判据；禁止用股票名或代码硬编码；禁止把「缺数据」判成通过。
//
// 数据口径：买区/目标/止损来自收盘决策（top1 + 组合腿的 entryLow/entryHigh/target/stop），
// 现价来自 Yahoo 实时行情（关注池）。关注池自身不含买区 → 无买区数据时返回 NO_ZONE，不猜测。
//
// tsx 脚本经相对路径引用，故内部 import 用相对路径（非 @/ 别名）。
import { isJPXTradingDay } from "../trading-calendar/jpx";

export type LiveStatus =
  | "IN_ZONE"        // 现价在买区内 → 可买
  | "BELOW_ZONE"     // 现价低于买区
  | "ABOVE_ZONE"     // 现价高于买区（追高/已脱离）
  | "REACHED_TARGET" // 已达到/超过目标价
  | "BELOW_STOP"     // 已跌破止损
  | "WAIT_QUOTE"     // 缺现价 → 等待行情
  | "CANCELLED"      // 已取消关注
  | "NO_ZONE";       // 缺买区/目标/止损数据 → 暂无数据（不判定）

export interface LiveStatusInput {
  price: number | null;
  entryLow: number | null;
  entryHigh: number | null;
  target: number | null;
  stop: number | null;
  muted?: boolean;
}

/** 唯一状态判定。优先级：取消 → 缺价 → 缺数据 → 止损 → 目标 → 买区区间。缺数据绝不判成 IN_ZONE。 */
export function deriveLiveStatus(i: LiveStatusInput): LiveStatus {
  if (i.muted) return "CANCELLED";
  if (i.price == null) return "WAIT_QUOTE";
  const hasZone = i.entryLow != null && i.entryHigh != null;
  const hasStop = i.stop != null;
  const hasTarget = i.target != null;
  if (!hasZone && !hasStop && !hasTarget) return "NO_ZONE";
  if (hasStop && i.price <= (i.stop as number)) return "BELOW_STOP";
  if (hasTarget && i.price >= (i.target as number)) return "REACHED_TARGET";
  if (hasZone) {
    if (i.price < (i.entryLow as number)) return "BELOW_ZONE";
    if (i.price > (i.entryHigh as number)) return "ABOVE_ZONE";
    return "IN_ZONE";
  }
  // 有止损/目标但无买区区间，且均未触发 → 无法判定买区，返回 NO_ZONE（诚实）
  return "NO_ZONE";
}

export type StatusTone = "green" | "amber" | "red" | "neutral";
/** UI 元数据：状态 → i18n 标签键 / 建议动作键 / 色调。展示层唯一映射。 */
export const LIVE_STATUS_META: Record<LiveStatus, { labelKey: string; actionKey: string; tone: StatusTone }> = {
  IN_ZONE:        { labelKey: "wl.st.inZone",    actionKey: "wl.act.inZone",    tone: "green" },
  BELOW_ZONE:     { labelKey: "wl.st.belowZone", actionKey: "wl.act.belowZone", tone: "amber" },
  ABOVE_ZONE:     { labelKey: "wl.st.aboveZone", actionKey: "wl.act.aboveZone", tone: "amber" },
  REACHED_TARGET: { labelKey: "wl.st.target",    actionKey: "wl.act.target",    tone: "green" },
  BELOW_STOP:     { labelKey: "wl.st.stop",      actionKey: "wl.act.stop",      tone: "red" },
  WAIT_QUOTE:     { labelKey: "wl.st.waitQuote", actionKey: "wl.act.waitQuote", tone: "neutral" },
  CANCELLED:      { labelKey: "wl.st.cancelled", actionKey: "wl.act.cancelled", tone: "neutral" },
  NO_ZONE:        { labelKey: "wl.st.noZone",    actionKey: "wl.act.noZone",    tone: "neutral" },
};

export type MarketPhase = "PRE" | "OPEN" | "CLOSED";
/** 市场阶段（JST + JPX 日历）：非交易日/收盘后=CLOSED，09:00 前=PRE，其余(含午休)=OPEN。 */
export function marketPhase(now: Date): MarketPhase {
  if (!isJPXTradingDay(now)) return "CLOSED";
  const jst = new Date(now.getTime() + 9 * 3600 * 1000);
  const t = jst.getUTCHours() * 60 + jst.getUTCMinutes();
  if (t < 540) return "PRE";     // 09:00 前
  if (t > 930) return "CLOSED";  // 15:30 后
  return "OPEN";                 // 09:00–15:30（含 11:30–12:30 午休，仍为盘中）
}
/** 是否处于自动刷新的交易时段（排除午休；与页面 60s 刷新一致）。 */
export function isRefreshWindow(now: Date): boolean {
  if (!isJPXTradingDay(now)) return false;
  const jst = new Date(now.getTime() + 9 * 3600 * 1000);
  const t = jst.getUTCHours() * 60 + jst.getUTCMinutes();
  return (t >= 540 && t <= 690) || (t >= 750 && t <= 930); // 09:00–11:30 / 12:30–15:30
}
