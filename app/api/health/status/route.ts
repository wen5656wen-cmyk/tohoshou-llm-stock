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

export async function GET() {
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
