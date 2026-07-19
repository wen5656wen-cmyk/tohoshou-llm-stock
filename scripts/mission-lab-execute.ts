#!/usr/bin/env npx tsx
// ── P18 · AI Mission Lab · Phase 2 执行（09:30 JST 开盘后·默认）──────────────
// 09:30：Yahoo Japan 实时行情约 15–20 分钟延迟，09:30 取到的才是真实可跟随价（可跟单，非贴近开盘）。
// 读实时行情(regularMarketTime 校验开盘后新鲜) → 成交 READY_FOR_OPEN → Trade/Position/Cash/NAV。
// 幂等：CAS 认领 + Trade.decisionId 唯一 + 原子现金增减 + NAV upsert，可安全重跑/重启。
// 无新鲜行情 → 跳过(SKIPPED)，绝不回填/模拟/读收盘 OHLC。默认关闭。M1 不激活。
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { executeMissionDay } from "../lib/mission-lab/engine";
import { isJPXTradingDay } from "../lib/trading-calendar/jpx";
import { jstDateStr } from "../lib/decision-engine";

async function main() {
  if (process.env.MISSION_LAB_ENABLED !== "true") { console.log("⛔ MISSION_LAB_ENABLED != true → 跳过（M1 未启用）。"); process.exit(0); }
  const now = new Date();
  if (!isJPXTradingDay(now)) { console.log("📅 非 JPX 交易日 → 跳过 Phase2。"); process.exit(0); }
  const tradingDay = jstDateStr(now);

  const missions = await prisma.aiMission.findMany({ where: { status: "ACTIVE" } });
  if (!missions.length) { console.log("ℹ️ 无 ACTIVE Mission。"); process.exit(0); }
  for (const m of missions) {
    const r = await executeMissionDay(m.id, tradingDay);
    console.log(`⚡ Phase2 ${m.missionType} ${m.periodLabel} @${tradingDay}: ${JSON.stringify(r)}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error("mission-lab-execute 失败:", e); process.exit(1); });
