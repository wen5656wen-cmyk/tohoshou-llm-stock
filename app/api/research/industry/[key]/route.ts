import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchQuotesBatch } from "@/lib/yahoo";

export const dynamic = "force-dynamic";

function withTimeout<T>(p: Promise<T>, ms: number, fb: T): Promise<T> {
  return Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fb), ms))]);
}

// GET /api/research/industry/[key] — 产业详情（多区域，只读；日股实时读现有 StockScore + Yahoo，不复制）
export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const ind = await prisma.researchIndustry.findUnique({ where: { industryKey: key } });
  if (!ind) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [segments, technologies, coLinks, bottlenecks, edges, version, report, dailies, timeline] = await Promise.all([
    prisma.researchSegment.findMany({ where: { industryId: ind.id }, orderBy: { sortOrder: "asc" } }),
    prisma.researchTechnology.findMany({ where: { industryId: ind.id } }),
    prisma.researchCompanyIndustry.findMany({ where: { industryId: ind.id }, include: { company: { include: { hcScore: true, stockLink: true } }, segment: true } }),
    prisma.researchBottleneck.findMany({ where: { industryId: ind.id }, orderBy: { level: "asc" } }),
    prisma.researchGraphEdge.findMany({ where: { industryId: ind.id } }),
    prisma.researchVersion.findFirst({ where: { entityType: "INDUSTRY", entityId: ind.id }, include: { reviews: true }, orderBy: { generatedAt: "desc" } }),
    prisma.researchReport.findFirst({ where: { refKey: key }, orderBy: { createdAt: "desc" } }),
    prisma.researchDailyUpdate.findMany({ where: { industryId: ind.id }, orderBy: { occurredAt: "desc" }, take: 20 }),
    prisma.researchTimelineEvent.findMany({ where: { entityType: "INDUSTRY", entityId: ind.id }, orderBy: { occurredAt: "desc" }, take: 20 }),
  ]);

  // 去重公司（一公司可跨多环节）
  const coMap = new Map<string, typeof coLinks[number]["company"] & { role: string | null; benefitScore: number | null; segmentKeys: string[] }>();
  for (const l of coLinks) {
    const ex = coMap.get(l.companyId);
    if (ex) { if (l.segment?.segmentKey) ex.segmentKeys.push(l.segment.segmentKey); continue; }
    coMap.set(l.companyId, { ...l.company, role: l.role, benefitScore: l.benefitScore, segmentKeys: l.segment?.segmentKey ? [l.segment.segmentKey] : [] });
  }
  const companies = [...coMap.values()];

  // 日股实时：读现有 StockScore(ai/rec) + Yahoo(price/change)，不复制评分
  const jpSyms = companies.filter((c) => c.listed && c.symbol).map((c) => c.symbol!) as string[];
  const [scores, quotes] = await Promise.all([
    jpSyms.length ? prisma.stockScore.findMany({ where: { symbol: { in: jpSyms } }, select: { symbol: true, adaptiveScore: true, recommendationV2: true, marketRank: true } }) : Promise.resolve([]),
    jpSyms.length ? withTimeout(fetchQuotesBatch(jpSyms), 4000, []) : Promise.resolve([]),
  ]);
  const sMap = new Map(scores.map((s) => [s.symbol, s]));
  const qMap = new Map(quotes.map((q) => [q.symbol, q]));

  // Claims + Evidence（产业/技术/公司/瓶颈 全实体）
  const entityIds = [ind.id, ...technologies.map((t) => t.id), ...companies.map((c) => c.id), ...bottlenecks.map((b) => b.id)];
  const claims = await prisma.researchClaim.findMany({ where: { entityId: { in: entityIds } }, include: { evidence: true }, orderBy: { importance: "desc" } });

  // Today Changed（当日新增 Claim/Evidence + Review 状态，不生成长文）+ Calendar（Planned）
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const [newClaims, newEvidence, calendar] = await Promise.all([
    prisma.researchClaim.count({ where: { entityId: { in: entityIds }, createdAt: { gte: dayStart } } }),
    prisma.researchEvidence.count({ where: { claim: { entityId: { in: entityIds } }, createdAt: { gte: dayStart } } }),
    prisma.researchCalendarEvent.findMany({ where: { industryId: ind.id }, orderBy: { scheduledAt: "asc" }, take: 20 }),
  ]);
  // 统一时间线：Historical/Forecast(TimelineEvent) + Planned(Calendar)
  const unifiedTimeline = [
    ...timeline.map((t) => ({ kind: t.kind, eventType: t.eventType, title: t.title, summary: t.summary, impact: t.impact, at: t.occurredAt })),
    ...calendar.map((c) => ({ kind: "PLANNED", eventType: c.eventType, title: c.title, summary: null as string | null, impact: null as string | null, at: c.scheduledAt })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const companyOut = companies.map((c) => {
    const q = c.symbol ? qMap.get(c.symbol) : undefined;
    const s = c.symbol ? sMap.get(c.symbol) : undefined;
    const price = q?.price ?? null;
    const prev = q?.previousClose ?? null;
    return {
      companyKey: c.companyKey, symbol: c.symbol, name: c.name, nameZh: c.nameZh, country: c.country, listed: c.listed, entityType: c.entityType,
      role: c.role, benefitScore: c.benefitScore, segmentKeys: c.segmentKeys, isHiddenChampion: c.isHiddenChampion, altDifficulty: c.altDifficulty, globalSharePct: c.globalSharePct,
      hc: c.hcScore ? { score: c.hcScore.score, verdict: c.hcScore.verdict } : null,
      // 实时（只读）
      live: c.listed && c.symbol ? { price, changePct: price != null && prev ? (price / prev - 1) * 100 : null, aiScore: s?.adaptiveScore ?? null, recommendation: s?.recommendationV2 ?? null, marketRank: s?.marketRank ?? null } : null,
    };
  });

  const claimsByEntity: Record<string, { statement: string; confidence: string; claimType: string | null; importance: number; evidence: { sourceTitle: string; sourceType: string; publisher: string | null; confidence: string; evidenceSummary: string | null }[] }[]> = {};
  for (const cl of claims) {
    (claimsByEntity[cl.entityId] ??= []).push({ statement: cl.statement, confidence: cl.confidence, claimType: cl.claimType, importance: cl.importance, evidence: cl.evidence.map((e) => ({ sourceTitle: e.sourceTitle, sourceType: e.sourceType, publisher: e.publisher, confidence: e.confidence, evidenceSummary: e.evidenceSummary })) });
  }

  return NextResponse.json({
    industry: { industryKey: ind.industryKey, nameZh: ind.nameZh, nameEn: ind.nameEn, nameJa: ind.nameJa, oneLiner: ind.oneLiner, summary: ind.summary, metrics: ind.metrics, status: ind.status, version: ind.currentVer, freshness: ind.freshnessScore, lastDeepAt: ind.lastDeepAt, lastDailyAt: ind.lastDailyAt, lastWeeklyAt: ind.lastWeeklyAt, nextReviewAt: ind.nextReviewAt },
    segments, technologies, companies: companyOut, bottlenecks, edges,
    version: version ? { version: version.version, status: version.status, reviewStatus: version.reviewStatus, model: version.model, provider: version.provider, estimatedCost: version.estimatedCost, evidenceCount: version.evidenceCount, generatedAt: version.generatedAt, publishedAt: version.publishedAt, reviews: version.reviews.map((r) => ({ reviewer: r.reviewer, action: r.action, comment: r.comment, reviewedAt: r.reviewedAt })) } : null,
    report: report ? { title: report.title, version: report.version, status: report.status, summary: report.summary } : null,
    dailyUpdates: dailies, timeline: unifiedTimeline, claimsByEntity,
    todayChanged: { newClaims, newEvidence, reviewStatus: version?.reviewStatus ?? null, dailyToday: dailies.filter((d) => new Date(d.occurredAt) >= dayStart).length },
    kpi: { companies: companyOut.length, jpListed: companyOut.filter((c) => c.listed).length, bottlenecks: bottlenecks.length, technologies: technologies.length, claims: claims.length, evidence: claims.reduce((n, c) => n + c.evidence.length, 0), hiddenChampions: companyOut.filter((c) => c.hc).length, edges: edges.length },
    evidenceCount: claims.reduce((n, c) => n + c.evidence.length, 0),
  });
}
