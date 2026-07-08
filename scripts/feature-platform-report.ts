#!/usr/bin/env npx tsx
/**
 * Feature Platform Report — P6-T10 (T10.2 + T10.4 + T10.5).
 *
 * 每日一次：统一评估全部 Feature → Integrity Check + Platform Report + Pending 分类，
 * 并落 FeaturePlatformSnapshot（date 唯一）。Trend 由与前一份快照对比派生。
 * READ-ONLY 派生：不修改任何 Feature 状态 / 评分 / 推荐 / Production；仅写平台快照表。
 *
 * Usage:  npm run feature-platform-report
 *         DRY_RUN=1 npm run feature-platform-report
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  loadEvaluateDeps, evaluateFeatures, checkIntegrity, buildPlatformReport, buildTrend,
} from "../lib/features/platform";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const DRY_RUN = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");

function todayJstDate(nowMs: number): Date {
  const jst = new Date(nowMs + 9 * 3600 * 1000);
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()));
}

/** 检测 GlobalMarket.topix 是否存在量纲断裂（相邻日 ratio < 0.5 或 > 2）。 */
async function topixContinuity(): Promise<{ status: "OK" | "BROKEN"; breakDate: string | null }> {
  const rows = await prisma.globalMarket.findMany({
    where: { topix: { not: null } }, select: { date: true, topix: true }, orderBy: { date: "asc" },
  });
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1].topix, b = rows[i].topix;
    if (a && b && a > 0) {
      const r = b / a;
      if (r < 0.5 || r > 2) return { status: "BROKEN", breakDate: rows[i].date.toISOString().slice(0, 10) };
    }
  }
  return { status: "OK", breakDate: null };
}

async function main() {
  const t0 = Date.now();
  console.log(`=== Feature Platform Report (P6-T10) ${DRY_RUN ? "(DRY RUN)" : ""} ===`);
  const now = Date.now();
  const date = todayJstDate(now);

  const { deps, meta } = await loadEvaluateDeps(prisma, now);
  const { rows } = evaluateFeatures(deps);
  const integrity = checkIntegrity(deps.features, rows, { factorAlphaAgeDays: meta.factorAlphaAgeDays });
  const report = buildPlatformReport(rows);
  const topix = await topixContinuity();
  const topixStatus = topix.status === "BROKEN" ? "BROKEN" : "RESTORED";

  const prevSnap = await prisma.featurePlatformSnapshot.findFirst({
    where: { date: { lt: date } }, orderBy: { date: "desc" },
  });
  const prev = prevSnap ? {
    date: prevSnap.date.toISOString().slice(0, 10),
    pending: prevSnap.pending, promoteCandidates: prevSnap.promoteCandidates, disableCandidates: prevSnap.disableCandidates,
    avgAlpha: prevSnap.avgAlpha, integrityScore: prevSnap.integrityScore,
    pendingByReason: (prevSnap.pendingByReason as Record<string, number> | null),
  } : null;
  const trend = buildTrend({ ...report, integrityScore: integrity.integrityScore }, prev);

  console.log(`日期(JST): ${date.toISOString().slice(0, 10)}`);
  console.log(`平台: Prod ${report.production} · Shadow ${report.shadow} · Disabled ${report.disabled} · Pending ${report.pending} · Evaluated ${report.evaluated}`);
  console.log(`晋升: Promote ${report.promoteCandidates} · KeepShadow ${report.keepShadow} · Disable ${report.disableCandidates}`);
  console.log(`均值: avgAlpha ${report.avgAlpha ?? "—"}% · avgContribution ${report.avgContribution ?? "—"}% · avgConfidence ${report.avgConfidence ?? "—"} · avgScore ${report.avgPromotionScore ?? "—"}`);
  console.log(`Top: ${report.topFeature?.id ?? "—"}(${report.topFeature?.score ?? "—"}) · Worst: ${report.worstFeature?.id ?? "—"}(${report.worstFeature?.score ?? "—"})`);
  console.log(`Integrity: ${integrity.integrityScore}/100 · issues ${integrity.issues.length} ${integrity.issues.map((i) => i.code).join(",") || "(none)"}`);
  console.log(`Pending by reason: ${JSON.stringify(report.pendingByReason)}`);
  console.log(`Trend vs ${trend.prevDate ?? "—"}: pending ${trend.pendingDelta ?? "—"} · promote ${trend.promoteDelta ?? "—"} · avgAlpha ${trend.avgAlphaDelta ?? "—"} · integrity ${trend.integrityDelta ?? "—"}`);
  console.log(`FactorAlpha: fresh=${meta.factorAlphaAgeDays != null && meta.factorAlphaAgeDays <= 2} age=${meta.factorAlphaAgeDays ?? "—"}d rows=${meta.factorAlphaRowCount} · TOPIX=${topix.status}${topix.breakDate ? "@" + topix.breakDate : ""} · benchmark=UNIVERSE`);

  // Prisma Json 输入需为 plain object/array
  const issuesJson = JSON.parse(JSON.stringify(integrity.issues));
  const pendingJson = JSON.parse(JSON.stringify(report.pendingByReason));

  if (!DRY_RUN) {
    await prisma.featurePlatformSnapshot.upsert({
      where: { date },
      create: {
        date,
        production: report.production, shadow: report.shadow, disabled: report.disabled, pending: report.pending, evaluated: report.evaluated,
        promoteCandidates: report.promoteCandidates, keepShadow: report.keepShadow, disableCandidates: report.disableCandidates,
        avgAlpha: report.avgAlpha, avgContribution: report.avgContribution, avgConfidence: report.avgConfidence, avgPromotionScore: report.avgPromotionScore,
        topFeature: report.topFeature?.id ?? null, topFeatureScore: report.topFeature?.score ?? null,
        worstFeature: report.worstFeature?.id ?? null, worstFeatureScore: report.worstFeature?.score ?? null,
        integrityScore: integrity.integrityScore, integrityIssues: issuesJson,
        pendingByReason: pendingJson,
        factorAlphaFresh: meta.factorAlphaAgeDays != null && meta.factorAlphaAgeDays <= 2,
        factorAlphaComputedAt: meta.factorAlphaComputedAt ? new Date(meta.factorAlphaComputedAt) : null,
        benchmarkMode: "UNIVERSE", topixStatus,
      },
      update: {
        production: report.production, shadow: report.shadow, disabled: report.disabled, pending: report.pending, evaluated: report.evaluated,
        promoteCandidates: report.promoteCandidates, keepShadow: report.keepShadow, disableCandidates: report.disableCandidates,
        avgAlpha: report.avgAlpha, avgContribution: report.avgContribution, avgConfidence: report.avgConfidence, avgPromotionScore: report.avgPromotionScore,
        topFeature: report.topFeature?.id ?? null, topFeatureScore: report.topFeature?.score ?? null,
        worstFeature: report.worstFeature?.id ?? null, worstFeatureScore: report.worstFeature?.score ?? null,
        integrityScore: integrity.integrityScore, integrityIssues: issuesJson,
        pendingByReason: pendingJson,
        factorAlphaFresh: meta.factorAlphaAgeDays != null && meta.factorAlphaAgeDays <= 2,
        factorAlphaComputedAt: meta.factorAlphaComputedAt ? new Date(meta.factorAlphaComputedAt) : null,
        benchmarkMode: "UNIVERSE", topixStatus,
      },
    });
    console.log("✓ FeaturePlatformSnapshot upserted");
  } else {
    console.log("(DRY RUN — 未写快照)");
  }
  console.log(`=== Done (${((Date.now() - t0) / 1000).toFixed(1)}s) ===`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
