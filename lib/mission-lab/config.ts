// ── P18 · AI Mission Lab · 配置 / 类型 / 周期（M1）──────────────────────────
// Mission = 策略执行层。参数追求周+5%/月+20%，但风控优先（限持仓数/单股仓位/现金比/止损）。
// 真实前向实验：无未来函数；决策(收盘后信号) → 次一交易日开盘成交(+滑点)。
export const STRATEGY_VERSION = "mission-v1";

export type MissionType = "WEEKLY" | "MONTHLY";
export type MissionAction = "BUY" | "SELL" | "ADD" | "REDUCE" | "TP" | "SL" | "HOLD" | "NO_ACTION";

export interface MissionConfig {
  missionType: MissionType;
  initialCapital: number; // JPY
  targetPct: number; // 目标收益%
  periodDays: number; // 交易周期天数
  maxPositions: number; // 最大持仓数
  maxSinglePct: number; // 单股最大仓位%（占总资产）
  minCashPct: number; // 最低现金比例%
  takeProfitPct: number; // 止盈阈值%（相对建仓价）
  stopLossPct: number; // 止损阈值%（负数，相对建仓价）
  addOnDrawdownPct: number; // 浮亏超过该值且信号仍强 → 允许加仓一次
  slippagePct: number; // 成交滑点%（保守）
  minAiScore: number; // 入场最低 adaptiveScore
  buyRecommendations: string[]; // 允许入场的 recommendationV2
}

// 周 Mission：进取 + 高换手 + 紧止损；月 Mission：目标更高 + 可持有更久 + 较宽止损。
export const MISSION_CONFIGS: Record<MissionType, MissionConfig> = {
  WEEKLY: {
    missionType: "WEEKLY",
    initialCapital: 10_000_000,
    targetPct: 5,
    periodDays: 7,
    maxPositions: 6,
    maxSinglePct: 25,
    minCashPct: 10,
    takeProfitPct: 6,
    stopLossPct: -3,
    addOnDrawdownPct: -2,
    slippagePct: 0.1,
    minAiScore: 65,
    buyRecommendations: ["STRONG_BUY", "BUY"],
  },
  MONTHLY: {
    missionType: "MONTHLY",
    initialCapital: 10_000_000,
    targetPct: 20,
    periodDays: 30,
    maxPositions: 8,
    maxSinglePct: 20,
    minCashPct: 5,
    takeProfitPct: 20,
    stopLossPct: -8,
    addOnDrawdownPct: -4,
    slippagePct: 0.1,
    minAiScore: 62,
    buyRecommendations: ["STRONG_BUY", "BUY"],
  },
};

// ── 周期标签（支持 Week30/31/… 与 Month 持续归档）──
// ISO 周（周一为一周起点）。
function isoWeek(d: Date): { year: number; week: number } {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (date.getUTCDay() + 6) % 7; // 周一=0
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // 移到本周周四
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return { year: date.getUTCFullYear(), week };
}

/** 依 type + 起始日 生成周期标签与起止日（JST 视角用 UTC+9 的日历）。 */
export function periodInfo(missionType: MissionType, startJst: Date): { periodLabel: string; startDate: Date; endDate: Date; periodDays: number } {
  const cfg = MISSION_CONFIGS[missionType];
  if (missionType === "WEEKLY") {
    const { year, week } = isoWeek(startJst);
    const end = new Date(startJst.getTime() + cfg.periodDays * 24 * 3600 * 1000);
    return { periodLabel: `${year}-W${String(week).padStart(2, "0")}`, startDate: startJst, endDate: end, periodDays: cfg.periodDays };
  }
  const y = startJst.getUTCFullYear();
  const m = startJst.getUTCMonth() + 1;
  const end = new Date(startJst.getTime() + cfg.periodDays * 24 * 3600 * 1000);
  return { periodLabel: `${y}-M${String(m).padStart(2, "0")}`, startDate: startJst, endDate: end, periodDays: cfg.periodDays };
}
