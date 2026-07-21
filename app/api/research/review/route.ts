import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isReviewAction, reviewPatch } from "@/lib/research/review-flow";
import { guardAdminRoute } from "@/lib/admin-auth";
import { applyVersion } from "@/lib/research/engine";

export const dynamic = "force-dynamic";

// GET /api/research/review — 待审版本（reviewStatus=PENDING 或 status=AI_RESEARCHED）。
export async function GET() {
  const [pending, industries, agg] = await Promise.all([
    prisma.researchVersion.findMany({ where: { OR: [{ reviewStatus: "PENDING" }, { status: "AI_RESEARCHED" }] }, orderBy: { generatedAt: "desc" }, take: 100, include: { _count: { select: { reviews: true } } } }),
    prisma.researchIndustry.findMany({ select: { id: true, industryKey: true, nameZh: true, nameJa: true } }),
    prisma.researchVersion.groupBy({ by: ["reviewStatus"], _count: true }),
  ]);
  const indMap = new Map(industries.map((i) => [i.id, i]));
  return NextResponse.json({
    pending: pending.map((v) => { const ind = v.entityType === "INDUSTRY" ? indMap.get(v.entityId) : undefined; return { id: v.id, entityType: v.entityType, entityKey: ind?.industryKey ?? null, entityName: ind?.nameZh ?? null, entityNameJa: ind?.nameJa ?? null, version: v.version, status: v.status, reviewStatus: v.reviewStatus, provider: v.provider, model: v.model, evidenceCount: v.evidenceCount, estimatedCost: v.estimatedCost, reviews: v._count.reviews, generatedAt: v.generatedAt }; }),
    facets: { reviewStatus: agg.map((a) => ({ reviewStatus: a.reviewStatus, count: a._count })) },
  });
}

// POST /api/research/review — 审阅动作 { versionId, reviewer, action: APPROVE|REJECT|REQUEST_CHANGES, comment }
// APPROVE → PUBLISHED（唯有人审通过才发布，防幻觉）；REJECT → REJECTED；REQUEST_CHANGES → 退回 PENDING。
export async function POST(req: Request) {
  const denied = await guardAdminRoute(req);
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  const versionId = body?.versionId as string | undefined;
  const reviewer = (body?.reviewer as string | undefined)?.trim();
  const action = body?.action as string | undefined;
  const comment = (body?.comment as string | undefined) ?? null;
  if (!versionId || !reviewer || !isReviewAction(action)) {
    return NextResponse.json({ error: "versionId / reviewer / action(APPROVE|REJECT|REQUEST_CHANGES) 必填" }, { status: 400 });
  }
  const v = await prisma.researchVersion.findUnique({ where: { id: versionId } });
  if (!v) return NextResponse.json({ error: "version not found" }, { status: 404 });

  const now = new Date();
  await prisma.researchReview.create({ data: { versionId, reviewer, action: String(action), comment } });

  // 候选(有 payload)的 INDUSTRY 版本获批 → 落地 payload 到实体 + 版本/产业/报告置 PUBLISHED
  // （此刻起 live=V2；V1 版本记录永久保留不覆盖）。不触碰评分/交易/Decision。
  let applied = false;
  if (action === "APPROVE" && v.entityType === "INDUSTRY" && v.payload) {
    await applyVersion(versionId);
    applied = true;
  }
  const patch = reviewPatch(action, reviewer, comment, now, v);
  const updated = await prisma.researchVersion.update({ where: { id: versionId }, data: patch });
  // legacy（无 payload）产业 APPROVE：仅置产业 PUBLISHED
  if (action === "APPROVE" && v.entityType === "INDUSTRY" && !applied) {
    await prisma.researchIndustry.update({ where: { id: v.entityId }, data: { status: "PUBLISHED" } }).catch(() => {});
  }
  return NextResponse.json({ ok: true, applied, version: { id: updated.id, status: updated.status, reviewStatus: updated.reviewStatus } });
}
