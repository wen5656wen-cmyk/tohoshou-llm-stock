import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  loadEvaluateDeps, evaluateFeatures, checkIntegrity, buildPlatformReport, buildTrend,
} from "@/lib/features/platform";
import { PENDING_REASON_LABEL } from "@/lib/features/promotion/shadow-diagnostics";

export const dynamic = "force-dynamic";

// GET /api/admin/feature-platform — Feature Platform Report V1（P6-T10）
// 每日平台状态：counts / 晋升 / 平均 Alpha·贡献·置信 / Top·Worst / Integrity / Pending
// 分类 + Trend（对比最近快照）+ 快照历史。**只读派生 · 不写任何表 · 不改评分/推荐。**
// 每日快照由 cron `feature-platform-report` 落库；本 API 实时重算 + 读历史算 Trend。

export async function GET() {
  const now = Date.now();
  const { deps, meta } = await loadEvaluateDeps(prisma, now);
  const { rows } = evaluateFeatures(deps);
  const integrity = checkIntegrity(deps.features, rows, { factorAlphaAgeDays: meta.factorAlphaAgeDays });
  const report = buildPlatformReport(rows);

  // TOPIX 连续性
  const gm = await prisma.globalMarket.findMany({ where: { topix: { not: null } }, select: { date: true, topix: true }, orderBy: { date: "asc" } });
  let topixBreak: string | null = null;
  for (let i = 1; i < gm.length; i++) {
    const a = gm[i - 1].topix, b = gm[i].topix;
    if (a && b && a > 0 && (b / a < 0.5 || b / a > 2)) { topixBreak = gm[i].date.toISOString().slice(0, 10); break; }
  }

  // 快照历史（Trend）
  const snaps = await prisma.featurePlatformSnapshot.findMany({ orderBy: { date: "desc" }, take: 30 });
  const latest = snaps[0] ?? null;
  const prev = latest ? {
    date: latest.date.toISOString().slice(0, 10),
    pending: latest.pending, promoteCandidates: latest.promoteCandidates, disableCandidates: latest.disableCandidates,
    avgAlpha: latest.avgAlpha, integrityScore: latest.integrityScore,
    pendingByReason: latest.pendingByReason as Record<string, number> | null,
  } : null;
  const trend = buildTrend({ ...report, integrityScore: integrity.integrityScore }, prev);

  const history = snaps.slice().reverse().map((s) => ({
    date: s.date.toISOString().slice(0, 10),
    pending: s.pending, promoteCandidates: s.promoteCandidates, disableCandidates: s.disableCandidates,
    integrityScore: s.integrityScore, avgAlpha: s.avgAlpha, avgPromotionScore: s.avgPromotionScore,
  }));

  return NextResponse.json({
    ok: true,
    generatedAt: new Date(now).toISOString(),
    reasonLabels: PENDING_REASON_LABEL,
    report,
    integrity,
    trend,
    history,
    factorAlpha: {
      computedAt: meta.factorAlphaComputedAt,
      ageDays: meta.factorAlphaAgeDays,
      fresh: meta.factorAlphaAgeDays != null && meta.factorAlphaAgeDays <= 2,
      rowCount: meta.factorAlphaRowCount,
    },
    benchmark: { mode: "UNIVERSE", topixStatus: topixBreak ? "BROKEN" : "OK", topixBreak },
    snapshotPersisted: latest ? latest.date.toISOString().slice(0, 10) : null,
  });
}
