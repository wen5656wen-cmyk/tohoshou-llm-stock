import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { payloadCounts, countsDiff } from "@/lib/research/diff";

export const dynamic = "force-dynamic";

// GET /api/research/version/[id] — 版本详情（Claim/Evidence 对照 + 版本 Diff + 审阅记录）。
// 供 Research Library 与 Review Center 共用；只读现有实体，不新增模型。
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await prisma.researchVersion.findUnique({ where: { id }, include: { reviews: { orderBy: { reviewedAt: "desc" } } } });
  if (!v) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [prev, ind] = await Promise.all([
    v.previousVersionId ? prisma.researchVersion.findUnique({ where: { id: v.previousVersionId }, select: { id: true, version: true, status: true, payload: true, evidenceCount: true, generatedAt: true } }) : Promise.resolve(null),
    v.entityType === "INDUSTRY" ? prisma.researchIndustry.findUnique({ where: { id: v.entityId }, select: { industryKey: true, nameZh: true, nameJa: true } }) : Promise.resolve(null),
  ]);
  type ClaimOut = { id: string; entityType: string; claimType: string | null; statement: string; confidence: string; importance: number; status: string; evidence: { sourceTitle: string; publisher: string | null; sourceType: string; url: string | null; publishedAt: Date | null; confidence: string; evidenceSummary: string | null }[] };
  const isCandidate = v.status === "AI_RESEARCHED" && !!v.payload;
  let claimsOut: ClaimOut[];
  if (isCandidate) {
    // 候选：从 payload 读 Claim/Evidence（尚未落库，不能读 V1 实时实体）。无证据→显示 LOW（同引擎口径）。
    const R = v.payload as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    claimsOut = [];
    const push = (etype: string, arr?: any[]) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      for (const x of arr ?? []) for (const c of x.claims ?? []) {
        const ev = c.evidence ?? [];
        claimsOut.push({ id: `p_${claimsOut.length}`, entityType: etype, claimType: c.claimType ?? null, statement: c.statement, confidence: ev.length ? (c.confidence ?? "MID") : "LOW", importance: c.importance ?? 5, status: "AI_RESEARCHED", evidence: ev.map((e: any) => ({ sourceTitle: e.sourceTitle, publisher: e.publisher ?? null, sourceType: e.sourceType, url: e.url ?? null, publishedAt: e.publishedAt ? new Date(e.publishedAt) : null, confidence: e.confidence ?? "MID", evidenceSummary: e.evidenceSummary ?? null })) }); // eslint-disable-line @typescript-eslint/no-explicit-any
      }
    };
    push("COMPANY", R.companies); push("TECHNOLOGY", R.technologies); push("BOTTLENECK", R.bottlenecks);
    claimsOut.sort((a, b) => b.importance - a.importance);
  } else {
    // 已落地版本：聚合产业级 + 全部子实体(公司/技术/瓶颈)的 Claim
    let entityIds = [v.entityId];
    if (v.entityType === "INDUSTRY") {
      const [coLinks, techs, bns] = await Promise.all([
        prisma.researchCompanyIndustry.findMany({ where: { industryId: v.entityId }, select: { companyId: true } }),
        prisma.researchTechnology.findMany({ where: { industryId: v.entityId }, select: { id: true } }),
        prisma.researchBottleneck.findMany({ where: { industryId: v.entityId }, select: { id: true } }),
      ]);
      entityIds = [v.entityId, ...new Set(coLinks.map((c) => c.companyId)), ...techs.map((t) => t.id), ...bns.map((b) => b.id)];
    }
    const rows = await prisma.researchClaim.findMany({ where: { entityId: { in: entityIds } }, include: { evidence: true }, orderBy: [{ importance: "desc" }, { createdAt: "desc" }] });
    claimsOut = rows.map((c) => ({ id: c.id, entityType: c.entityType, claimType: c.claimType, statement: c.statement, confidence: c.confidence, importance: c.importance, status: c.status, evidence: c.evidence.map((e) => ({ sourceTitle: e.sourceTitle, publisher: e.publisher, sourceType: e.sourceType, url: e.url, publishedAt: e.publishedAt, confidence: e.confidence, evidenceSummary: e.evidenceSummary })) }));
  }

  // 轻量 Diff：payload 顶层数组数量对比，供 Version Diff 视图（共享纯函数 lib/research/diff）
  const curC = payloadCounts(v.payload), prevC = prev ? payloadCounts(prev.payload) : null;
  const diff = countsDiff(curC, prevC);

  return NextResponse.json({
    version: { id: v.id, entityType: v.entityType, entityId: v.entityId, entityKey: ind?.industryKey ?? null, entityName: ind?.nameZh ?? null, entityNameJa: ind?.nameJa ?? null, version: v.version, status: v.status, reviewStatus: v.reviewStatus, changeReason: v.changeReason, changeSummary: v.changeSummary, provider: v.provider, model: v.model, promptVersion: v.promptVersion, tokenUsage: v.tokenUsage, estimatedCost: v.estimatedCost, durationMs: v.durationMs, evidenceCount: v.evidenceCount, reviewer: v.reviewer, reviewedAt: v.reviewedAt, generatedAt: v.generatedAt, publishedAt: v.publishedAt, counts: curC },
    previous: prev ? { id: prev.id, version: prev.version, status: prev.status, counts: prevC, generatedAt: prev.generatedAt } : null,
    diff,
    reviews: v.reviews.map((r) => ({ reviewer: r.reviewer, action: r.action, comment: r.comment, reviewedAt: r.reviewedAt })),
    isCandidate,
    claims: claimsOut,
    stats: { claims: claimsOut.length, evidence: claimsOut.reduce((n, c) => n + c.evidence.length, 0), noEvidence: claimsOut.filter((c) => c.evidence.length === 0).length },
  });
}
