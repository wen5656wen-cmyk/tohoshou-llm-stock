import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
  // INDUSTRY 版本：聚合产业级 + 全部子实体(公司/技术/瓶颈)的 Claim，供 Review 全面核查
  let entityIds = [v.entityId];
  if (v.entityType === "INDUSTRY") {
    const [coLinks, techs, bns] = await Promise.all([
      prisma.researchCompanyIndustry.findMany({ where: { industryId: v.entityId }, select: { companyId: true } }),
      prisma.researchTechnology.findMany({ where: { industryId: v.entityId }, select: { id: true } }),
      prisma.researchBottleneck.findMany({ where: { industryId: v.entityId }, select: { id: true } }),
    ]);
    entityIds = [v.entityId, ...new Set(coLinks.map((c) => c.companyId)), ...techs.map((t) => t.id), ...bns.map((b) => b.id)];
  }
  const claims = await prisma.researchClaim.findMany({ where: { entityId: { in: entityIds } }, include: { evidence: true }, orderBy: [{ importance: "desc" }, { createdAt: "desc" }] });

  // 轻量 Diff：payload 顶层数组数量对比（公司/技术/证据等），供 Version Diff 视图
  const counts = (p: unknown) => {
    const d = (p ?? {}) as Record<string, unknown[]>;
    return { segments: (d.segments ?? []).length, technologies: (d.technologies ?? []).length, companies: (d.companies ?? []).length, bottlenecks: (d.bottlenecks ?? []).length, edges: (d.edges ?? []).length };
  };
  const curC = counts(v.payload), prevC = prev ? counts(prev.payload) : null;
  const diff = prevC ? Object.fromEntries(Object.keys(curC).map((k) => [k, { prev: (prevC as any)[k], cur: (curC as any)[k], delta: (curC as any)[k] - (prevC as any)[k] }])) : null; // eslint-disable-line @typescript-eslint/no-explicit-any

  return NextResponse.json({
    version: { id: v.id, entityType: v.entityType, entityId: v.entityId, entityKey: ind?.industryKey ?? null, entityName: ind?.nameZh ?? null, entityNameJa: ind?.nameJa ?? null, version: v.version, status: v.status, reviewStatus: v.reviewStatus, changeReason: v.changeReason, changeSummary: v.changeSummary, provider: v.provider, model: v.model, promptVersion: v.promptVersion, tokenUsage: v.tokenUsage, estimatedCost: v.estimatedCost, durationMs: v.durationMs, evidenceCount: v.evidenceCount, reviewer: v.reviewer, reviewedAt: v.reviewedAt, generatedAt: v.generatedAt, publishedAt: v.publishedAt, counts: curC },
    previous: prev ? { id: prev.id, version: prev.version, status: prev.status, counts: prevC, generatedAt: prev.generatedAt } : null,
    diff,
    reviews: v.reviews.map((r) => ({ reviewer: r.reviewer, action: r.action, comment: r.comment, reviewedAt: r.reviewedAt })),
    claims: claims.map((c) => ({ id: c.id, entityType: c.entityType, claimType: c.claimType, statement: c.statement, confidence: c.confidence, importance: c.importance, status: c.status, evidence: c.evidence.map((e) => ({ sourceTitle: e.sourceTitle, publisher: e.publisher, sourceType: e.sourceType, url: e.url, publishedAt: e.publishedAt, confidence: e.confidence, evidenceSummary: e.evidenceSummary })) })),
    stats: { claims: claims.length, evidence: claims.reduce((n, c) => n + c.evidence.length, 0), noEvidence: claims.filter((c) => c.evidence.length === 0).length },
  });
}
