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

export const dynamic = "force-dynamic";

interface HealthReport {
  auditAt: string;
  version: string;
  status: "PASS" | "WARNING" | "CRITICAL";
  stockTotal: number;
  scoreTotal: number;
  latestPriceDate: string;
  priceAgeDays: number;
  adjCoveragePct: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  passCount: number;
  allowRecommendation: boolean;
  requiresReview: boolean;
  topIssues: string[];
  reportFile: string;
}

export async function GET(req: Request) {
  const denied = await guardAdminRoute(req);
  if (denied) return denied;

  try {
    const reportDir = path.join(process.cwd(), "reports");

    if (!fs.existsSync(reportDir)) {
      return NextResponse.json({ status: "NEVER_RUN", message: "No reports directory found" });
    }

    // Find the most recent data-health-guard report
    const files = fs.readdirSync(reportDir)
      .filter(f => f.startsWith("data-health-guard-") && f.endsWith(".json"))
      .sort()
      .reverse();

    if (files.length === 0) {
      return NextResponse.json({ status: "NEVER_RUN", message: "No health guard reports found" });
    }

    const latest = files[0];
    const content = fs.readFileSync(path.join(reportDir, latest), "utf-8");
    const report = JSON.parse(content) as HealthReport;

    return NextResponse.json({
      status: report.status,
      auditAt: report.auditAt,
      criticalCount: report.criticalCount,
      warningCount: report.warningCount,
      infoCount: report.infoCount,
      passCount: report.passCount,
      allowRecommendation: report.allowRecommendation,
      requiresReview: report.requiresReview,
      topIssues: report.topIssues.slice(0, 3),
      reportFile: latest,
      latestPriceDate: report.latestPriceDate,
      adjCoveragePct: report.adjCoveragePct,
    });
  } catch (e) {
    return NextResponse.json(
      { status: "ERROR", message: (e as Error).message },
      { status: 500 }
    );
  }
}
