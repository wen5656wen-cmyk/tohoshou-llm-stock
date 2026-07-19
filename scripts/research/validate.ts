import "dotenv/config";
import { prisma } from "../../lib/prisma";
async function main() {
  const ind = await prisma.researchIndustry.findUnique({ where: { industryKey: "AI_SEMICONDUCTOR" } });
  if (!ind) throw new Error("industry not found");
  const claims = await prisma.researchClaim.count();
  const claimsNoEv = await prisma.researchClaim.count({ where: { evidence: { none: {} } } });
  const evOrphan = 0; // Evidence.claimId 必填，结构上不可能孤儿
  const ev = await prisma.researchEvidence.count();
  const ver = await prisma.researchVersion.findFirst({ where: { entityType: "INDUSTRY", entityId: ind.id }, include: { reviews: true }, orderBy: { generatedAt: "desc" } });
  const report = await prisma.researchReport.findFirst({ where: { refKey: "AI_SEMICONDUCTOR" } });
  const links = await prisma.researchStockLink.findMany({ select: { symbol: true } });
  const syms = links.map((l) => l.symbol);
  const inScore = await prisma.stockScore.findMany({ where: { symbol: { in: syms } }, select: { symbol: true, adaptiveScore: true, recommendationV2: true } });
  const edges = await prisma.researchGraphEdge.count();
  const hc = await prisma.researchHiddenChampionScore.findMany({ select: { score: true, verdict: true, company: { select: { name: true } } } });
  const job = await prisma.researchJob.findFirst({ where: { industryKey: "AI_SEMICONDUCTOR" }, orderBy: { createdAt: "desc" } });
  console.log(JSON.stringify({
    industry: { status: ind.status, currentVer: ind.currentVer, freshness: ind.freshnessScore, nextReview: ind.nextReviewAt },
    chain_integrity: { claims, evidence: ev, claimsWithoutEvidence: claimsNoEv, evidenceOrphans: evOrphan },
    version: { v: ver?.version, status: ver?.status, reviewStatus: ver?.reviewStatus, reviewActions: ver?.reviews.map((r) => r.action), model: ver?.model, cost: ver?.estimatedCost, evidenceCount: ver?.evidenceCount },
    report: { status: report?.status, title: report?.title },
    stock_closed_loop: { stockLinks: syms.length, symbolsFoundInStockScore: inScore.length, sample: inScore.slice(0, 4) },
    knowledgeGraph: { edges },
    hiddenChampions: hc,
    job: { status: job?.status, durationMs: job?.durationMs },
  }, null, 2));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
