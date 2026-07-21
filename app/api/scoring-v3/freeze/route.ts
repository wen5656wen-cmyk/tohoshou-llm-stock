// 🔒 P21-P0-API-G2 · 访问级别：ADMIN_ONLY（内部研究 / 实验 / 回测 / 系统状态）
//
// 不属于公开市场数据，也不属于 Boss 决策读取 —— 是内部评分实验、Shadow/Freeze/
// Calibration、融合模型、Alpha 分析与回测、研究资料与 Review、系统健康与内部业绩。
// 封闭前状态：未登录公网可读（P21-P0-API 审计实测 200）。
//
// 凭证与 AUTHENTICATED 本轮相同（单租户，尚无用户体系），但**逻辑等级更高**：
// 后续拆权限时本文件应保持管理员级，不随 AUTHENTICATED 一起下放。
import { guardAdminRoute } from "@/lib/admin-auth";
import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { prisma } from "@/lib/prisma";
import { FREEZE, freezeDay, freezeTotalDays, isFreezeOver } from "@/lib/scoring-v3/freeze";

export const dynamic = "force-dynamic";

// GET /api/scoring-v3/freeze — V3 Freeze Monitor 状态。只读。
export async function GET(req: Request) {
  const denied = await guardAdminRoute(req);
  if (denied) return denied;

  const nowIso = new Date().toISOString();
  const [calCount, latestCal, latestShadow] = await Promise.all([
    prisma.adaptiveScoreV3Calibration.count(),
    prisma.adaptiveScoreV3Calibration.findFirst({ orderBy: { date: "desc" } }),
    prisma.adaptiveScoreV3Shadow.findFirst({ orderBy: { date: "desc" }, select: { weightsJson: true, regime: true } }),
  ]);
  const history = await prisma.adaptiveScoreV3Calibration.findMany({ orderBy: { date: "asc" }, select: { date: true, regime: true, readiness: true, readinessGrade: true, ratingDistJson: true, sbStatsJson: true } });

  let replay: any = null;
  try { replay = JSON.parse(fs.readFileSync(path.join(process.cwd(), "reports", "score-v3-replay.json"), "utf8")); } catch { /* none yet */ }

  const readiness = latestCal?.readiness ?? 0;
  const grade = latestCal?.readinessGrade ?? "D";
  const fwd = replay ? [1, 3, 5, 10].map((h) => ({ h, v2: replay.agg?.PRODUCTION?.[20]?.[h]?.avg ?? null, v3: replay.agg?.V3?.[20]?.[h]?.avg ?? null, spread: replay.spread?.[20]?.[h] ?? null })) : [];

  return NextResponse.json({
    freeze: { ...FREEZE },
    day: freezeDay(nowIso),
    totalDays: freezeTotalDays(),
    over: isFreezeOver(nowIso),
    shadowDays: calCount,
    readiness, grade,
    gateReady: readiness >= FREEZE.targetReadiness,
    regime: latestShadow?.regime ?? latestCal?.regime ?? null,
    weights: latestShadow?.weightsJson ?? null,
    latestCalibDate: latestCal?.date?.toISOString().slice(0, 10) ?? null,
    replay: replay ? { asOfRange: replay.asOfRange, days: replay.days, verdict: replay.verdict, forward: fwd } : null,
    history: history.map((h) => ({ date: h.date.toISOString().slice(0, 10), regime: h.regime, readiness: h.readiness, grade: h.readinessGrade, sb: (h.sbStatsJson as any)?.count ?? (h.ratingDistJson as any)?.STRONG_BUY ?? null })),
    computedAt: nowIso,
  });
}
