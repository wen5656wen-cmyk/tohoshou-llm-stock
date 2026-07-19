#!/usr/bin/env npx tsx
// ── P18 · AI Mission Lab · 初始化（创建 Weekly + Monthly Mission）─────────────
// ⚠️ 前向实验注资入口。默认拒绝运行；仅当 MISSION_LAB_ENABLED=true（人工 GO 后配置）才创建。
// M1 阶段：本脚本写好但不在生产运行。
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { MISSION_CONFIGS, periodInfo, STRATEGY_VERSION, type MissionType } from "../lib/mission-lab/config";

async function ensure(type: MissionType) {
  const active = await prisma.aiMission.findFirst({ where: { missionType: type, status: "ACTIVE" } });
  if (active) { console.log(`✅ ${type} 已有 ACTIVE Mission: ${active.periodLabel}（不重复创建）`); return active; }
  const cfg = MISSION_CONFIGS[type];
  const jst = new Date(Date.now() + 9 * 3600 * 1000); // JST 日历视角
  const { periodLabel, startDate, endDate, periodDays } = periodInfo(type, jst);
  const seq = (await prisma.aiMission.count({ where: { missionType: type } })) + 1;
  const exists = await prisma.aiMission.findUnique({ where: { missionType_periodLabel: { missionType: type, periodLabel } } });
  if (exists) { console.log(`ℹ️ ${type} ${periodLabel} 已存在（status=${exists.status}），跳过`); return exists; }
  const m = await prisma.aiMission.create({ data: {
    missionType: type, periodLabel, seq, name: `${type} ${periodLabel}`,
    initialCapital: cfg.initialCapital, targetPct: cfg.targetPct, periodDays,
    startDate, endDate, status: "ACTIVE",
    cashJpy: cfg.initialCapital, equityJpy: cfg.initialCapital, realizedPnl: 0, peakEquity: cfg.initialCapital,
    strategyVersion: STRATEGY_VERSION,
  } });
  console.log(`🚀 创建 ${type} Mission ${periodLabel}：资金 ¥${cfg.initialCapital.toLocaleString("en-US")}，目标 +${cfg.targetPct}%，${periodDays}天，止 ${endDate.toISOString().slice(0, 10)}`);
  return m;
}

async function main() {
  if (process.env.MISSION_LAB_ENABLED !== "true") {
    console.log("⛔ MISSION_LAB_ENABLED != true → 拒绝初始化（前向实验注资需人工 GO 后置 true）。");
    process.exit(0);
  }
  await ensure("WEEKLY");
  await ensure("MONTHLY");
  console.log("✅ Mission 初始化完成。");
  process.exit(0);
}
main().catch((e) => { console.error("mission-lab-init 失败:", e); process.exit(1); });
