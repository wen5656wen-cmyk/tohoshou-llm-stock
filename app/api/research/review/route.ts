// 🔒 P21-P0-API-G2 · 访问级别：ADMIN_ONLY（内部研究 / 实验 / 回测 / 系统状态）
//
// 不属于公开市场数据，也不属于 Boss 决策读取 —— 是内部评分实验、Shadow/Freeze/
// Calibration、融合模型、Alpha 分析与回测、研究资料与 Review、系统健康与内部业绩。
// 封闭前状态：未登录公网可读（P21-P0-API 审计实测 200）。
//
// 凭证与 AUTHENTICATED 本轮相同（单租户，尚无用户体系），但**逻辑等级更高**：
// 后续拆权限时本文件应保持管理员级，不随 AUTHENTICATED 一起下放。
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isReviewAction, reviewPatch } from "@/lib/research/review-flow";
import { guardAdminRoute } from "@/lib/admin-auth";
import { guardBetaOrAdmin } from "@/lib/beta-auth"; // P22-S3：GET 开放 Beta，POST 仍 Admin
import { applyVersion } from "@/lib/research/engine";

export const dynamic = "force-dynamic";

// GET /api/research/review — 待审版本（reviewStatus=PENDING 或 status=AI_RESEARCHED）。
export async function GET(req: Request) {
  const denied = await guardBetaOrAdmin(req);
  if (denied) return denied;

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
