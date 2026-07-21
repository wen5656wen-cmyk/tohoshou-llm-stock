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
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const GRADE_ORDER = ["A+", "A", "B", "C", "D"];
function gradeGe(grade: string | null, min: string): boolean {
  if (!grade) return false;
  return GRADE_ORDER.indexOf(grade) <= GRADE_ORDER.indexOf(min);
}

export async function GET(req: Request) {
  const denied = await guardAdminRoute(req);
  if (denied) return denied;

  try {
    const db = prisma as any;

    // Last 30 records (most recent first)
    const records = await db.strategyDailyValidation.findMany({
      orderBy: { validationDate: "desc" },
      take: 30,
    });

    const latest = records[0] ?? null;

    // Phase 7 live conditions (computed from latest record + extra DB query)
    const dayFilled   = latest?.dayFilledTotal   ?? 0;
    const swingClosed = latest?.swingClosedTotal ?? 0;
    const longClosed  = latest?.longClosedTotal  ?? 0;
    const dayGrade    = latest?.dayGrade         ?? null;
    const swingGrade  = latest?.swingGrade       ?? null;
    const longGrade   = latest?.longGrade        ?? null;

    // Count trailing consecutive healthOk days (records are DESC ordered, most recent first)
    let consecutiveHealthDays = 0;
    for (const r of records) {
      if (!r.healthOk) break;
      consecutiveHealthDays++;
    }

    const conditions = [
      { key: "day100",   met: dayFilled   >= 100, current: String(dayFilled),   target: "100" },
      { key: "swing30",  met: swingClosed >= 30,  current: String(swingClosed), target: "30"  },
      { key: "long20",   met: longClosed  >= 20,  current: String(longClosed),  target: "20"  },
      { key: "dayB",     met: gradeGe(dayGrade,   "B"), current: dayGrade   ?? "N/A", target: "B" },
      { key: "swingC",   met: gradeGe(swingGrade, "C"), current: swingGrade ?? "N/A", target: "C" },
      { key: "longC",    met: gradeGe(longGrade,  "C"), current: longGrade  ?? "N/A", target: "C" },
      { key: "health30", met: consecutiveHealthDays >= 30, current: String(consecutiveHealthDays), target: "30" },
    ];

    const phase7Ready = conditions.every((c) => c.met);

    // Running totals across all records (for pass rate)
    const totalRuns   = records.length;
    const passRuns    = records.filter((r: any) => r.allPass).length;
    const incidentRuns = records.filter((r: any) => r.incidentReport !== null).length;

    return NextResponse.json({
      records,
      latest,
      phase7: { ready: phase7Ready, conditions },
      stats: {
        totalRuns,
        passRuns,
        passRate: totalRuns > 0 ? passRuns / totalRuns : null,
        incidentRuns,
        consecutiveHealthDays,
      },
    });
  } catch (e: any) {
    console.error("[strategy/validation]", e);
    return NextResponse.json({ error: e?.message ?? "Internal error" }, { status: 500 });
  }
}
