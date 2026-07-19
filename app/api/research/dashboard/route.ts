import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdminAuth } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

// GET /api/research/dashboard — Deep Research 运营中心（7 板块）。
// 只消费现有 ResearchJob/Version/Review/Report/Claim/Evidence/Industry；不新增结构。
// ⚠️ 仅暴露 provider/model 名与"是否已配置"布尔；绝不暴露 ANTHROPIC_API_KEY 等密钥。
export async function GET(req: Request) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const now = new Date();
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(now.getTime() - 7 * 864e5);
  const monthStart = new Date(now.getTime() - 30 * 864e5);
  const soon = new Date(now.getTime() + 7 * 864e5);
  const sum = <T extends { estimatedCost: number | null }>(rows: T[]) => +rows.reduce((n, r) => n + (r.estimatedCost ?? 0), 0).toFixed(4);
  const tok = (rows: { tokenUsage: unknown }[]) => rows.reduce((n, r) => n + Number((r.tokenUsage as { total?: number } | null)?.total ?? 0), 0);

  const [jobStatus, jobType, recentJobs, monthJobs, verByProvider, verByReview, reviewByAction, industries, coFresh, techFresh, claimsTotal, noEvidence, evidenceTotal, reports] = await Promise.all([
    prisma.researchJob.groupBy({ by: ["status"], _count: true }),
    prisma.researchJob.groupBy({ by: ["jobType", "status"], _count: true }),
    prisma.researchJob.findMany({ orderBy: { createdAt: "desc" }, take: 20, select: { id: true, jobType: true, industryKey: true, targetKey: true, status: true, attempt: true, maxAttempts: true, provider: true, model: true, estimatedCost: true, durationMs: true, error: true, createdAt: true, finishedAt: true } }),
    prisma.researchJob.findMany({ where: { createdAt: { gte: monthStart } }, select: { industryKey: true, estimatedCost: true, tokenUsage: true, createdAt: true } }),
    prisma.researchVersion.groupBy({ by: ["provider"], _count: true }),
    prisma.researchVersion.groupBy({ by: ["reviewStatus"], _count: true }),
    prisma.researchReview.groupBy({ by: ["action"], _count: true }),
    prisma.researchIndustry.findMany({ select: { industryKey: true, nameZh: true, status: true, freshnessScore: true, nextReviewAt: true, staleAfter: true } }),
    prisma.researchCompany.findMany({ select: { freshnessScore: true, nextReviewAt: true, staleAfter: true } }),
    prisma.researchTechnology.findMany({ select: { freshnessScore: true, nextReviewAt: true, staleAfter: true } }),
    prisma.researchClaim.count(),
    prisma.researchClaim.count({ where: { evidence: { none: {} } } }),
    prisma.researchEvidence.count(),
    prisma.researchReport.groupBy({ by: ["status"], _count: true }),
  ]);

  const cnt = (rows: { status?: string; _count: number }[]) => Object.fromEntries(rows.map((r) => [r.status ?? "?", r._count]));
  const js = cnt(jobStatus as { status: string; _count: number }[]);
  const succ = js["SUCCESS"] ?? 0, fail = js["FAILED"] ?? 0;
  const overdue = (arr: { nextReviewAt: Date | null; staleAfter: Date | null }[]) => arr.filter((x) => (x.nextReviewAt && x.nextReviewAt < now) || (x.staleAfter && x.staleAfter < now)).length;
  const upcoming = (arr: { nextReviewAt: Date | null }[]) => arr.filter((x) => x.nextReviewAt && x.nextReviewAt >= now && x.nextReviewAt <= soon).length;

  // 各 jobType 最近状态（System Health）
  const healthByType = (t: string) => { const rows = (jobType as { jobType: string; status: string; _count: number }[]).filter((r) => r.jobType === t); const total = rows.reduce((n, r) => n + r._count, 0); return total ? { total, byStatus: Object.fromEntries(rows.map((r) => [r.status, r._count])) } : null; };

  return NextResponse.json({
    jobs: { byStatus: js, running: js["RUNNING"] ?? 0, waiting: js["PENDING"] ?? 0, retry: js["RETRYING"] ?? 0, failed: fail, success: succ, recent: recentJobs, avgDurationMs: recentJobs.filter((j) => j.durationMs).length ? Math.round(recentJobs.reduce((n, j) => n + (j.durationMs ?? 0), 0) / recentJobs.filter((j) => j.durationMs).length) : null },
    provider: { current: process.env.RESEARCH_PROVIDER ?? "openai", strongModel: process.env.RESEARCH_STRONG_MODEL ?? null, dailyModel: process.env.RESEARCH_DAILY_MODEL ?? null, defaultModel: process.env.RESEARCH_MODEL ?? process.env.OPENAI_MODEL ?? null, anthropicConfigured: !!process.env.ANTHROPIC_API_KEY, openaiConfigured: !!process.env.OPENAI_API_KEY, usageByProvider: verByProvider.map((v) => ({ provider: v.provider ?? "seed", count: v._count })), successRate: succ + fail ? +(succ / (succ + fail) * 100).toFixed(1) : null },
    tokenCost: {
      today: { cost: sum(monthJobs.filter((j) => j.createdAt >= dayStart)), tokens: tok(monthJobs.filter((j) => j.createdAt >= dayStart)) },
      week: { cost: sum(monthJobs.filter((j) => j.createdAt >= weekStart)), tokens: tok(monthJobs.filter((j) => j.createdAt >= weekStart)) },
      month: { cost: sum(monthJobs), tokens: tok(monthJobs) },
      byIndustry: Object.entries(monthJobs.reduce((a, j) => { const k = j.industryKey ?? "—"; a[k] = (a[k] ?? 0) + (j.estimatedCost ?? 0); return a; }, {} as Record<string, number>)).map(([k, v]) => ({ industryKey: k, cost: +v.toFixed(4) })).sort((a, b) => b.cost - a.cost).slice(0, 10),
    },
    freshness: {
      industry: { total: industries.length, published: industries.filter((i) => i.status === "PUBLISHED").length, avgFreshness: industries.length ? Math.round(industries.reduce((n, i) => n + (i.freshnessScore ?? 0), 0) / industries.length) : null, overdue: overdue(industries), upcomingReview: upcoming(industries) },
      company: { total: coFresh.length, overdue: overdue(coFresh), upcomingReview: upcoming(coFresh) },
      technology: { total: techFresh.length, overdue: overdue(techFresh), upcomingReview: upcoming(techFresh) },
    },
    review: { byStatus: Object.fromEntries(verByReview.map((v) => [v.reviewStatus, v._count])), byAction: Object.fromEntries(reviewByAction.map((r) => [r.action, r._count])), pending: verByReview.find((v) => v.reviewStatus === "PENDING")?._count ?? 0 },
    evidence: { claims: claimsTotal, evidence: evidenceTotal, noEvidenceClaims: noEvidence, coverage: claimsTotal ? +((claimsTotal - noEvidence) / claimsTotal * 100).toFixed(1) : null },
    systemHealth: { benchmark: healthByType("BENCHMARK"), daily: healthByType("DAILY"), weekly: healthByType("WEEKLY"), trigger: healthByType("TRIGGER"), scheduler: { available: !!process.env.DATABASE_URL, lock: "pg_advisory" }, queue: { depth: (js["PENDING"] ?? 0) + (js["RUNNING"] ?? 0) + (js["RETRYING"] ?? 0) } },
    reports: cnt(reports as { status: string; _count: number }[]),
  });
}
