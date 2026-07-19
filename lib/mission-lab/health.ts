// ── P18-M1-H1 · Mission Health Guard（只读检测，15 项）─────────────────────────
// 只读 ai_mission_*，绝不修改 Mission/交易；输出 PASS/WARNING/CRITICAL + 逐项明细。
import { prisma } from "../prisma";
import { isJPXTradingDay } from "../trading-calendar/jpx";
import { jstDateStr } from "../decision-engine";

export type HealthLevel = "PASS" | "WARNING" | "CRITICAL" | "INFO";
export interface HealthCheck { n: number; key: string; label: string; level: HealthLevel; value: string; detail?: string }
export interface MissionHealth { status: "PASS" | "WARNING" | "CRITICAL"; critical: number; warning: number; checks: HealthCheck[]; asOf: string }

const dstr = (d: Date) => d.toISOString().slice(0, 10);
function prevTradingDay(now: Date): string {
  const d = new Date(now.getTime());
  for (let i = 0; i < 14; i++) { d.setUTCDate(d.getUTCDate() - 1); if (isJPXTradingDay(d)) return jstDateStr(d); }
  return jstDateStr(d);
}

export async function runMissionHealth(): Promise<MissionHealth> {
  const now = new Date();
  const today = jstDateStr(now);
  const jst = new Date(now.getTime() + 9 * 3600 * 1000);
  const jstMin = jst.getUTCHours() * 60 + jst.getUTCMinutes();
  const isTrading = isJPXTradingDay(now);
  const checks: HealthCheck[] = [];
  const add = (n: number, key: string, label: string, level: HealthLevel, value: string, detail?: string) => checks.push({ n, key, label, level, value, detail });

  const missions = await prisma.aiMission.findMany();
  const active = missions.filter((m) => m.status === "ACTIVE");
  const wk = active.find((m) => m.missionType === "WEEKLY");
  const mo = active.find((m) => m.missionType === "MONTHLY");

  // 1 / 2 · Weekly / Monthly 存在
  add(1, "weekly_exists", "Weekly Mission 存在", wk ? "PASS" : "CRITICAL", wk ? `${wk.periodLabel}` : "缺失", wk ? undefined : "无 ACTIVE Weekly Mission");
  add(2, "monthly_exists", "Monthly Mission 存在", mo ? "PASS" : "CRITICAL", mo ? `${mo.periodLabel}` : "缺失", mo ? undefined : "无 ACTIVE Monthly Mission");

  // 3 · 开关
  const enabled = process.env.MISSION_LAB_ENABLED === "true";
  add(3, "enabled", "MISSION_LAB_ENABLED 开启", enabled ? "PASS" : "WARNING", enabled ? "true" : "false", enabled ? undefined : "前向实验未启用，cron 会跳过");

  // 4 · 今日应否运行 Prepare（08:20）
  if (!isTrading) add(4, "prepare_due", "今日应运行 Prepare", "INFO", "非交易日跳过");
  else if (jstMin < 500) add(4, "prepare_due", "今日应运行 Prepare", "INFO", "待运行(08:20 前)");
  else {
    const missed = active.filter((m) => m.lastPrepareDate !== today).map((m) => m.missionType);
    add(4, "prepare_due", "今日应运行 Prepare", missed.length ? "WARNING" : "PASS", missed.length ? `未运行: ${missed.join(",")}` : "已运行", missed.length ? "08:20 后 lastPrepareDate≠今日" : undefined);
  }

  // 5 · 今日应否运行 Execute（09:30）
  if (!isTrading) add(5, "execute_due", "今日应运行 Execute", "INFO", "非交易日跳过");
  else if (jstMin < 570) add(5, "execute_due", "今日应运行 Execute", "INFO", "待运行(09:30 前)");
  else {
    const missed = active.filter((m) => m.lastExecuteDate !== today).map((m) => m.missionType);
    add(5, "execute_due", "今日应运行 Execute", missed.length ? "WARNING" : "PASS", missed.length ? `未运行: ${missed.join(",")}` : "已运行", missed.length ? "09:30 后 lastExecuteDate≠今日" : undefined);
  }

  // 6 · 昨日(上一交易日) NAV 存在
  const prevTD = prevTradingDay(now);
  const navMissing: string[] = [];
  for (const m of active) {
    if (dstr(m.startDate) > prevTD) continue; // Mission 尚未覆盖该交易日
    const nav = await prisma.aiMissionNav.findFirst({ where: { missionId: m.id, date: new Date(`${prevTD}T00:00:00.000Z`) } });
    if (!nav) navMissing.push(m.missionType);
  }
  add(6, "prev_nav", `上一交易日 NAV 存在 (${prevTD})`, navMissing.length ? "WARNING" : "PASS", navMissing.length ? `缺: ${navMissing.join(",")}` : "OK");

  // 7 · 重复 Trade（decisionId 应唯一）
  const dupTrade = await prisma.$queryRawUnsafe<{ c: number }[]>(`SELECT count(*)::int c FROM (SELECT "decisionId" FROM ai_mission_trade WHERE "decisionId" IS NOT NULL GROUP BY "decisionId" HAVING count(*)>1) t`);
  const dupTradeN = dupTrade[0]?.c ?? 0;
  add(7, "dup_trade", "无重复 Trade", dupTradeN ? "CRITICAL" : "PASS", dupTradeN ? `${dupTradeN} 组重复` : "0");

  // 8 · 重复 Decision（同 mission+symbol+action+日+窗口）
  const dupDec = await prisma.$queryRawUnsafe<{ c: number }[]>(`SELECT count(*)::int c FROM (SELECT "missionId",symbol,action,"executionWindow",date_trunc('day',"decidedAt") d FROM ai_mission_decision GROUP BY 1,2,3,4,5 HAVING count(*)>1) t`);
  const dupDecN = dupDec[0]?.c ?? 0;
  add(8, "dup_decision", "无重复 Decision", dupDecN ? "WARNING" : "PASS", dupDecN ? `${dupDecN} 组重复` : "0");

  // 9 · READY_FOR_OPEN 超过一天
  const staleReady = await prisma.aiMissionDecision.count({ where: { status: "READY_FOR_OPEN", decidedAt: { lt: new Date(`${today}T00:00:00.000Z`) } } });
  add(9, "stale_ready", "无 READY_FOR_OPEN 超 1 天", staleReady ? "WARNING" : "PASS", staleReady ? `${staleReady} 条` : "0", staleReady ? "开盘未成交且未过期" : undefined);

  // 10 · EXECUTING 卡死
  const stuckExec = await prisma.aiMissionDecision.count({ where: { status: "EXECUTING" } });
  add(10, "stuck_executing", "无 EXECUTING 卡死", stuckExec ? "CRITICAL" : "PASS", stuckExec ? `${stuckExec} 条` : "0", stuckExec ? "认领后未完成，幂等恢复应清零" : undefined);

  // 11 · Cash 为负
  const negCash = missions.filter((m) => m.cashJpy < 0).map((m) => `${m.missionType}:${m.cashJpy}`);
  add(11, "neg_cash", "Cash 非负", negCash.length ? "CRITICAL" : "PASS", negCash.length ? negCash.join(",") : "OK");

  // 12 · Position 异常
  const badPos = await prisma.aiMissionPosition.findMany({ where: { status: "OPEN" }, select: { symbol: true, qty: true, avgCost: true, marketValue: true } });
  const posErr = badPos.filter((p) => p.qty <= 0 || p.avgCost <= 0 || p.marketValue < 0);
  const posWarn = badPos.filter((p) => p.qty % 100 !== 0 && p.qty > 0);
  add(12, "position_sane", "Position 正常", posErr.length ? "CRITICAL" : posWarn.length ? "WARNING" : "PASS", posErr.length ? `${posErr.length} 异常` : posWarn.length ? `${posWarn.length} 非整手` : "OK", posErr.map((p) => p.symbol).join(",") || undefined);

  // 13 · Mission 超期仍 ACTIVE
  const overdue = active.filter((m) => m.endDate < now).map((m) => `${m.missionType}:${m.periodLabel}`);
  add(13, "overdue_active", "无超期未结束 Mission", overdue.length ? "WARNING" : "PASS", overdue.length ? overdue.join(",") : "OK", overdue.length ? "endDate 已过但仍 ACTIVE（应转 COMPLETED）" : undefined);

  // 14 · NAV 断档（交易日缺 NAV）
  let navGap = 0;
  for (const m of active) {
    const navs = await prisma.aiMissionNav.findMany({ where: { missionId: m.id }, orderBy: { date: "asc" }, select: { date: true } });
    if (navs.length < 2) continue;
    const have = new Set(navs.map((n) => dstr(n.date)));
    const cur = new Date(navs[0].date); const end = navs[navs.length - 1].date;
    while (cur <= end) { const ds = jstDateStr(cur); if (isJPXTradingDay(cur) && !have.has(ds)) navGap++; cur.setUTCDate(cur.getUTCDate() + 1); }
  }
  add(14, "nav_gap", "NAV 无断档", navGap ? "WARNING" : "PASS", navGap ? `${navGap} 交易日缺` : "OK");

  // 15 · Decision Explain 为空
  const emptyExplain = await prisma.aiMissionDecision.count({ where: { OR: [{ explainWhy: "" }] } });
  add(15, "explain_present", "Decision Explain 非空", emptyExplain ? "CRITICAL" : "PASS", emptyExplain ? `${emptyExplain} 条空` : "OK", emptyExplain ? "每个决策必须有可回放解释" : undefined);

  const critical = checks.filter((c) => c.level === "CRITICAL").length;
  const warning = checks.filter((c) => c.level === "WARNING").length;
  const status = critical ? "CRITICAL" : warning ? "WARNING" : "PASS";
  return { status, critical, warning, checks, asOf: now.toISOString() };
}
