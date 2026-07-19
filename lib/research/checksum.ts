// ── Deep Research · 产业 live 实体确定性 checksum（P17 V2）──────────────────
// 证明 Benchmark run 前后 V1(或任意产业) live 实体未被改写。只读，不改任何数据。
import { createHash } from "crypto";
import { prisma } from "../prisma";

export interface IndustryChecksum {
  exists: boolean; status?: string; currentVer?: string | null;
  publishedVersionId?: string | null; publishedVersion?: string | null;
  counts?: { companies: number; technologies: number; bottlenecks: number; claims: number; evidence: number; edges: number };
  sha256?: string;
}

export async function industryChecksum(industryKey: string): Promise<IndustryChecksum> {
  const ind = await prisma.researchIndustry.findUnique({ where: { industryKey } });
  if (!ind) return { exists: false };
  const [coLinks, techs, bns, publishedVer] = await Promise.all([
    prisma.researchCompanyIndustry.findMany({ where: { industryId: ind.id }, include: { company: { select: { id: true, companyKey: true, symbol: true } } } }),
    prisma.researchTechnology.findMany({ where: { industryId: ind.id }, select: { id: true, techKey: true } }),
    prisma.researchBottleneck.findMany({ where: { industryId: ind.id }, select: { id: true, name: true } }),
    prisma.researchVersion.findFirst({ where: { entityType: "INDUSTRY", entityId: ind.id, status: "PUBLISHED" }, orderBy: { generatedAt: "desc" }, select: { id: true, version: true } }),
  ]);
  const coIds = [...new Set(coLinks.map((c) => c.company.id))];
  const entityIds = [ind.id, ...coIds, ...techs.map((t) => t.id), ...bns.map((b) => b.id)];
  const claims = await prisma.researchClaim.findMany({ where: { entityId: { in: entityIds } }, include: { evidence: { select: { id: true } } }, orderBy: { statement: "asc" } });
  const edges = await prisma.researchGraphEdge.count({ where: { industryId: ind.id } });
  const evidence = claims.reduce((n, c) => n + c.evidence.length, 0);
  const canonical = JSON.stringify({
    status: ind.status, currentVer: ind.currentVer,
    companyKeys: [...new Set(coLinks.map((c) => c.company.companyKey))].sort(),
    symbols: [...new Set(coLinks.map((c) => c.company.symbol).filter(Boolean))].sort(),
    techKeys: techs.map((t) => t.techKey).sort(), bottlenecks: bns.map((b) => b.name).sort(),
    claimStatements: claims.map((c) => c.statement).sort(), evidence, edges,
  });
  return {
    exists: true, status: ind.status, currentVer: ind.currentVer,
    publishedVersionId: publishedVer?.id ?? null, publishedVersion: publishedVer?.version ?? null,
    counts: { companies: coIds.length, technologies: techs.length, bottlenecks: bns.length, claims: claims.length, evidence, edges },
    sha256: createHash("sha256").update(canonical).digest("hex"),
  };
}
