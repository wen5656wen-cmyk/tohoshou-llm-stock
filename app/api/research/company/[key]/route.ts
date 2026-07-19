import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchQuotesBatch } from "@/lib/yahoo";

export const dynamic = "force-dynamic";

function withTimeout<T>(p: Promise<T>, ms: number, fb: T): Promise<T> {
  return Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fb), ms))]);
}

// GET /api/research/company/[key] — 公司深度卡（15 段 + 日股实时只读）。禁复制评分。
export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const c = await prisma.researchCompany.findUnique({
    where: { companyKey: key },
    include: { hcScore: true, stockLink: true, industryLinks: { include: { industry: true, segment: true } }, techLinks: { include: { technology: true } } },
  });
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });

  const claims = await prisma.researchClaim.findMany({ where: { entityType: "COMPANY", entityId: c.id }, include: { evidence: true }, orderBy: { importance: "desc" } });
  const version = await prisma.researchVersion.findFirst({ where: { entityType: "COMPANY", entityId: c.id }, orderBy: { generatedAt: "desc" } });

  // 日股实时（只读现有 StockScore/Stock + Yahoo，不复制）
  let live: { price: number | null; changePct: number | null; marketCap: number | null; aiScore: number | null; recommendation: string | null; sector: string | null; marketRank: number | null } | null = null;
  if (c.listed && c.symbol) {
    const [score, stock, quotes] = await Promise.all([
      prisma.stockScore.findUnique({ where: { symbol: c.symbol }, select: { adaptiveScore: true, recommendationV2: true, sector: true, marketRank: true } }),
      prisma.stock.findUnique({ where: { symbol: c.symbol }, select: { marketCap: true, changeRate: true } }),
      withTimeout(fetchQuotesBatch([c.symbol]), 4000, []),
    ]);
    const q = quotes[0];
    const price = q?.price ?? null;
    const prev = q?.previousClose ?? null;
    live = {
      price,
      changePct: price != null && prev ? (price / prev - 1) * 100 : (stock?.changeRate ?? null),
      marketCap: stock?.marketCap ?? null, // 億円
      aiScore: score?.adaptiveScore ?? null,
      recommendation: score?.recommendationV2 ?? null,
      sector: score?.sector ?? null,
      marketRank: score?.marketRank ?? null,
    };
  }

  return NextResponse.json({
    company: {
      companyKey: c.companyKey, symbol: c.symbol, name: c.name, nameZh: c.nameZh, nameEn: c.nameEn, country: c.country, market: c.market, listed: c.listed, entityType: c.entityType,
      coreProduct: c.coreProduct, coreTech: c.coreTech, globalSharePct: c.globalSharePct, altDifficulty: c.altDifficulty,
      moat: c.moat, customers: c.customers, suppliers: c.suppliers, competitors: c.competitors,
      growthDriver: c.growthDriver, futureRisk: c.futureRisk, whyMatters: c.whyMatters, chainImpact: c.chainImpact,
      roadmap: c.roadmap, investmentValue: c.investmentValue, isHiddenChampion: c.isHiddenChampion, status: c.status,
      industries: c.industryLinks.map((l) => ({ industryKey: l.industry.industryKey, nameZh: l.industry.nameZh, role: l.role, benefitScore: l.benefitScore, segment: l.segment?.nameZh ?? null })),
      technologies: c.techLinks.map((t) => ({ name: t.technology.name, techKey: t.technology.techKey, role: t.role })),
    },
    hiddenChampion: c.hcScore ? { score: c.hcScore.score, dimensions: c.hcScore.dimensions, verdict: c.hcScore.verdict, reasons: c.hcScore.reasons, mainRisk: c.hcScore.mainRisk, watchlistCandidate: c.hcScore.watchlistCandidate } : null,
    live,
    claims: claims.map((cl) => ({ statement: cl.statement, confidence: cl.confidence, claimType: cl.claimType, importance: cl.importance, evidence: cl.evidence.map((e) => ({ sourceTitle: e.sourceTitle, sourceType: e.sourceType, publisher: e.publisher, confidence: e.confidence, evidenceSummary: e.evidenceSummary })) })),
    version: version ? { version: version.version, status: version.status, reviewStatus: version.reviewStatus } : null,
  });
}
