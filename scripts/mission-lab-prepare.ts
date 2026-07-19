#!/usr/bin/env npx tsx
// ── P18 · AI Mission Lab · Phase 1 准备（08:20 JST 开盘前）──────────────────
// 仅生成/校验今日决策 → READY_FOR_OPEN。绝不成交/改持仓/扣现金。无未来函数。
// 默认关闭（MISSION_LAB_ENABLED!=true 跳过）。M1 不激活。
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { prepareMissionDay } from "../lib/mission-lab/engine";
import { isJPXTradingDay } from "../lib/trading-calendar/jpx";
import { jstDateStr } from "../lib/decision-engine";

async function main() {
  if (process.env.MISSION_LAB_ENABLED !== "true") { console.log("⛔ MISSION_LAB_ENABLED != true → 跳过（M1 未启用）。"); process.exit(0); }
  const now = new Date();
  if (!isJPXTradingDay(now)) { console.log("📅 非 JPX 交易日 → 跳过 Phase1。"); process.exit(0); }
  const tradingDay = jstDateStr(now);

  const missions = await prisma.aiMission.findMany({ where: { status: "ACTIVE" } });
  if (!missions.length) { console.log("ℹ️ 无 ACTIVE Mission。"); process.exit(0); }
  for (const m of missions) {
    if (now >= m.endDate) { await prisma.aiMission.update({ where: { id: m.id }, data: { status: "COMPLETED" } }); console.log(`🏁 ${m.missionType} ${m.periodLabel} 到期 → COMPLETED（Result/滚动属 M2）。`); continue; }
    const r = await prepareMissionDay(m.id, tradingDay);
    console.log(`📝 Phase1 ${m.missionType} ${m.periodLabel} @${tradingDay}: ${JSON.stringify(r)}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error("mission-lab-prepare 失败:", e); process.exit(1); });
