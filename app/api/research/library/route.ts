// 🔒 P21-P0-API-G2 · 访问级别：ADMIN_ONLY（内部研究 / 实验 / 回测 / 系统状态）
//
// 不属于公开市场数据，也不属于 Boss 决策读取 —— 是内部评分实验、Shadow/Freeze/
// Calibration、融合模型、Alpha 分析与回测、研究资料与 Review、系统健康与内部业绩。
// 封闭前状态：未登录公网可读（P21-P0-API 审计实测 200）。
//
// 凭证与 AUTHENTICATED 本轮相同（单租户，尚无用户体系），但**逻辑等级更高**：
// 后续拆权限时本文件应保持管理员级，不随 AUTHENTICATED 一起下放。
import { guardBetaOrAdmin } from "@/lib/beta-auth"; // P22-S3：白名单只读 → Beta 或 Admin
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/research/library — 研究库：报告 + 版本（现有 ResearchReport/ResearchVersion，不新增模型）
// 筛选: scope / status / provider / q。只读，不影响 Stock Center / Decision Center。
export async function GET(req: Request) {
  const denied = await guardBetaOrAdmin(req);
  if (denied) return denied;

  const u = new URL(req.url);
  const scope = u.searchParams.get("scope") || undefined;
  const status = u.searchParams.get("status") || undefined;
  const provider = u.searchParams.get("provider") || undefined;
  const q = u.searchParams.get("q")?.trim() || undefined;
  const limit = Math.min(200, Number(u.searchParams.get("limit") ?? 100));

  const [reports, versions, industries, reportAgg, versionAgg] = await Promise.all([
    prisma.researchReport.findMany({ where: { ...(scope ? { scope } : {}), ...(status ? { status } : {}), ...(q ? { title: { contains: q, mode: "insensitive" } } : {}) }, orderBy: { updatedAt: "desc" }, take: limit }),
    prisma.researchVersion.findMany({ where: { ...(status ? { status } : {}), ...(provider ? { provider } : {}) }, orderBy: { generatedAt: "desc" }, take: limit, include: { _count: { select: { reviews: true } } } }),
    prisma.researchIndustry.findMany({ select: { id: true, industryKey: true, nameZh: true, nameJa: true } }),
    prisma.researchReport.groupBy({ by: ["status"], _count: true }),
    prisma.researchVersion.groupBy({ by: ["status"], _count: true }),
  ]);
  const indMap = new Map(industries.map((i) => [i.id, i]));

  return NextResponse.json({
    reports: reports.map((r) => ({ id: r.id, scope: r.scope, refKey: r.refKey, title: r.title, version: r.version, status: r.status, model: r.model, summary: r.summary, publishedAt: r.publishedAt, updatedAt: r.updatedAt })),
    versions: versions.map((v) => {
      const ind = v.entityType === "INDUSTRY" ? indMap.get(v.entityId) : undefined;
      return { id: v.id, entityType: v.entityType, entityId: v.entityId, entityKey: ind?.industryKey ?? null, entityName: ind?.nameZh ?? null, entityNameJa: ind?.nameJa ?? null, version: v.version, status: v.status, reviewStatus: v.reviewStatus, provider: v.provider, model: v.model, estimatedCost: v.estimatedCost, tokenUsage: v.tokenUsage, durationMs: v.durationMs, evidenceCount: v.evidenceCount, reviews: v._count.reviews, generatedAt: v.generatedAt, publishedAt: v.publishedAt };
    }),
    facets: { reportStatus: reportAgg.map((a) => ({ status: a.status, count: a._count })), versionStatus: versionAgg.map((a) => ({ status: a.status, count: a._count })) },
  });
}
