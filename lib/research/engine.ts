// ── Deep Research · Research Engine（P17 Phase 3 核心）───────────────────────
// 全链路：Source(Provider) → Entity → Claim → Evidence → Knowledge Graph
//         → Version → Review → Report → Stock Link，落到 research_* 表。
// 幂等：实体按稳定键 upsert；claims/edges/bottlenecks 按范围重建。
// ⚠️ 只读 StockScore（StockLink 仅存 symbol 指针）；不改任何现有表/评分/交易。
import { prisma } from "../prisma";
import { computeFreshness } from "./freshness";
import type { ClaimInput, IndustryResearch, ResearchProvider, ResearchResult } from "./types";

async function persistClaims(entityType: string, entityId: string, claims: ClaimInput[] | undefined): Promise<number> {
  await prisma.researchClaim.deleteMany({ where: { entityType, entityId } }); // cascade → evidence
  let evCount = 0;
  for (const c of claims ?? []) {
    const hasEv = (c.evidence?.length ?? 0) > 0;
    const conf = hasEv ? (c.confidence ?? "MID") : "LOW"; // 无证据强制 LOW（宪法第七条）
    const claim = await prisma.researchClaim.create({
      data: { entityType, entityId, claimType: c.claimType ?? null, statement: c.statement, confidence: conf, importance: c.importance ?? 5, status: "AI_RESEARCHED" },
    });
    for (const e of c.evidence ?? []) {
      await prisma.researchEvidence.create({
        data: {
          claimId: claim.id, sourceTitle: e.sourceTitle, publisher: e.publisher ?? null, sourceType: e.sourceType,
          url: e.url ?? null, publishedAt: e.publishedAt ? new Date(e.publishedAt) : null, language: e.language ?? null,
          country: e.country ?? null, confidence: e.confidence ?? conf, evidenceSummary: e.evidenceSummary ?? null,
        },
      });
      evCount++;
    }
  }
  return evCount;
}

export interface RunSummary {
  industryKey: string; versionId: string; version: string; jobId: string;
  counts: { segments: number; technologies: number; companies: number; claims: number; evidence: number; edges: number; bottlenecks: number; stockLinks: number; hiddenChampions: number };
  published: boolean; sourceKind: string;
}

export async function runIndustryResearch(provider: ResearchProvider, industryKey: string): Promise<RunSummary> {
  const job = await prisma.researchJob.create({
    data: { jobType: "INDUSTRY_DEEP", industryKey, targetKey: industryKey, status: "RUNNING", provider: provider.name, startedAt: new Date() },
  });
  const t0 = Date.now();
  try {
    const result: ResearchResult = await provider.research(industryKey);
    const R: IndustryResearch = result.data;
    const now = new Date();
    const fresh = computeFreshness({ lastVerifiedAt: now, status: "PUBLISHED", now });

    // 1) Industry
    const ind = await prisma.researchIndustry.upsert({
      where: { industryKey: R.industry.industryKey },
      create: {
        industryKey: R.industry.industryKey, nameZh: R.industry.nameZh, nameEn: R.industry.nameEn, nameJa: R.industry.nameJa,
        oneLiner: R.industry.oneLiner ?? null, summary: R.industry.summary ?? null, metrics: R.industry.metrics ?? undefined,
        status: "AI_RESEARCHED", sortOrder: R.industry.sortOrder ?? 0, lastDeepAt: now, lastVerifiedAt: now,
        freshnessScore: fresh.freshnessScore, nextReviewAt: fresh.nextReviewAt, staleAfter: fresh.staleAfter,
      },
      update: {
        nameZh: R.industry.nameZh, nameEn: R.industry.nameEn, nameJa: R.industry.nameJa, oneLiner: R.industry.oneLiner ?? null,
        summary: R.industry.summary ?? null, metrics: R.industry.metrics ?? undefined, sortOrder: R.industry.sortOrder ?? 0,
        lastDeepAt: now, lastVerifiedAt: now, freshnessScore: fresh.freshnessScore, nextReviewAt: fresh.nextReviewAt, staleAfter: fresh.staleAfter,
      },
    });

    // 2) Segments（upsert，建 key→id 映射）
    const segMap = new Map<string, string>();
    for (const s of R.segments) {
      const row = await prisma.researchSegment.upsert({
        where: { industryId_segmentKey: { industryId: ind.id, segmentKey: s.segmentKey } },
        create: { industryId: ind.id, segmentKey: s.segmentKey, layer: s.layer, nameZh: s.nameZh, nameEn: s.nameEn ?? null, nameJa: s.nameJa ?? null, chokeSummary: s.chokeSummary ?? null, sortOrder: s.sortOrder ?? 0 },
        update: { layer: s.layer, nameZh: s.nameZh, nameEn: s.nameEn ?? null, nameJa: s.nameJa ?? null, chokeSummary: s.chokeSummary ?? null, sortOrder: s.sortOrder ?? 0 },
      });
      segMap.set(s.segmentKey, row.id);
    }

    // 3) Technologies（upsert + claims）
    const techMap = new Map<string, string>();
    let claimCount = 0, evidenceCount = 0;
    for (const tch of R.technologies) {
      const row = await prisma.researchTechnology.upsert({
        where: { industryId_techKey: { industryId: ind.id, techKey: tch.techKey } },
        create: {
          industryId: ind.id, techKey: tch.techKey, name: tch.name, description: tch.description ?? null, currentSolution: tch.currentSolution ?? null,
          nextGen: tch.nextGen ?? null, commercialStage: tch.commercialStage ?? null, maturity: tch.maturity ?? null, difficulty: tch.difficulty ?? null,
          leaderCountry: tch.leaderCountry ?? null, leaderCompany: tch.leaderCompany ?? null, altTech: tch.altTech ?? null,
          roadmap: tch.roadmap ?? undefined, uncertainty: tch.uncertainty ?? null, status: "AI_RESEARCHED",
          lastVerifiedAt: now, freshnessScore: fresh.freshnessScore, nextReviewAt: fresh.nextReviewAt, staleAfter: fresh.staleAfter,
        },
        update: {
          name: tch.name, description: tch.description ?? null, currentSolution: tch.currentSolution ?? null, nextGen: tch.nextGen ?? null,
          commercialStage: tch.commercialStage ?? null, maturity: tch.maturity ?? null, difficulty: tch.difficulty ?? null, leaderCountry: tch.leaderCountry ?? null,
          leaderCompany: tch.leaderCompany ?? null, altTech: tch.altTech ?? null, roadmap: tch.roadmap ?? undefined, uncertainty: tch.uncertainty ?? null,
          lastVerifiedAt: now, freshnessScore: fresh.freshnessScore, nextReviewAt: fresh.nextReviewAt, staleAfter: fresh.staleAfter,
        },
      });
      techMap.set(tch.techKey, row.id);
      if (tch.claims?.length) { evidenceCount += await persistClaims("TECHNOLOGY", row.id, tch.claims); claimCount += tch.claims.length; }
    }

    // 4) Companies（upsert + industry/tech links + HC + StockLink + claims）
    const coMap = new Map<string, string>();
    let stockLinks = 0, hiddenChampions = 0;
    for (const c of R.companies) {
      const row = await prisma.researchCompany.upsert({
        where: { companyKey: c.companyKey },
        create: {
          companyKey: c.companyKey, symbol: c.symbol ?? null, name: c.name, nameZh: c.nameZh ?? null, nameEn: c.nameEn ?? null,
          country: c.country, market: c.market ?? null, listed: c.listed, entityType: c.entityType ?? "COMPANY",
          coreProduct: c.coreProduct ?? null, coreTech: c.coreTech ?? null, globalSharePct: c.globalSharePct ?? null, moat: c.moat ?? null,
          altDifficulty: c.altDifficulty ?? null, customers: c.customers ?? null, suppliers: c.suppliers ?? null, competitors: c.competitors ?? null,
          growthDriver: c.growthDriver ?? null, futureRisk: c.futureRisk ?? null, whyMatters: c.whyMatters ?? null, chainImpact: c.chainImpact ?? null,
          roadmap: c.roadmap ?? undefined, investmentValue: c.investmentValue ?? undefined, isHiddenChampion: c.isHiddenChampion ?? false,
          status: "AI_RESEARCHED", lastVerifiedAt: now, freshnessScore: fresh.freshnessScore, nextReviewAt: fresh.nextReviewAt, staleAfter: fresh.staleAfter,
        },
        update: {
          symbol: c.symbol ?? null, name: c.name, nameZh: c.nameZh ?? null, nameEn: c.nameEn ?? null, country: c.country, market: c.market ?? null,
          listed: c.listed, entityType: c.entityType ?? "COMPANY", coreProduct: c.coreProduct ?? null, coreTech: c.coreTech ?? null,
          globalSharePct: c.globalSharePct ?? null, moat: c.moat ?? null, altDifficulty: c.altDifficulty ?? null, customers: c.customers ?? null,
          suppliers: c.suppliers ?? null, competitors: c.competitors ?? null, growthDriver: c.growthDriver ?? null, futureRisk: c.futureRisk ?? null,
          whyMatters: c.whyMatters ?? null, chainImpact: c.chainImpact ?? null, roadmap: c.roadmap ?? undefined, investmentValue: c.investmentValue ?? undefined,
          isHiddenChampion: c.isHiddenChampion ?? false, lastVerifiedAt: now, freshnessScore: fresh.freshnessScore, nextReviewAt: fresh.nextReviewAt, staleAfter: fresh.staleAfter,
        },
      });
      coMap.set(c.companyKey, row.id);

      // company ↔ industry/segment
      await prisma.researchCompanyIndustry.deleteMany({ where: { companyId: row.id, industryId: ind.id } });
      const segKeys = c.segmentKeys?.length ? c.segmentKeys : [null];
      for (const sk of segKeys) {
        await prisma.researchCompanyIndustry.create({ data: { companyId: row.id, industryId: ind.id, segmentId: sk ? (segMap.get(sk) ?? null) : null, role: c.industryRole ?? null, benefitScore: c.benefitScore ?? null } });
      }
      // company ↔ technology
      await prisma.researchCompanyTechnology.deleteMany({ where: { companyId: row.id } });
      for (const tk of c.techKeys ?? []) {
        const tid = techMap.get(tk); if (!tid) continue;
        await prisma.researchCompanyTechnology.create({ data: { companyId: row.id, technologyId: tid, role: c.industryRole ?? null } });
      }
      // hidden champion
      if (c.hiddenChampion) {
        await prisma.researchHiddenChampionScore.upsert({
          where: { companyId: row.id },
          create: { companyId: row.id, score: c.hiddenChampion.score, dimensions: c.hiddenChampion.dimensions, verdict: c.hiddenChampion.verdict, reasons: c.hiddenChampion.reasons ?? null, mainRisk: c.hiddenChampion.mainRisk ?? null, watchlistCandidate: c.hiddenChampion.watchlistCandidate ?? false },
          update: { score: c.hiddenChampion.score, dimensions: c.hiddenChampion.dimensions, verdict: c.hiddenChampion.verdict, reasons: c.hiddenChampion.reasons ?? null, mainRisk: c.hiddenChampion.mainRisk ?? null, watchlistCandidate: c.hiddenChampion.watchlistCandidate ?? false },
        });
        hiddenChampions++;
      }
      // stock link（只读 symbol 指针）
      if (c.symbol && c.listed) {
        await prisma.researchStockLink.upsert({
          where: { companyId: row.id },
          create: { companyId: row.id, symbol: c.symbol, industryBenefit: c.benefitScore ?? null },
          update: { symbol: c.symbol, industryBenefit: c.benefitScore ?? null },
        });
        stockLinks++;
      }
      if (c.claims?.length) { evidenceCount += await persistClaims("COMPANY", row.id, c.claims); claimCount += c.claims.length; }
    }

    // 5) Bottlenecks（按产业重建）
    await prisma.researchBottleneck.deleteMany({ where: { industryId: ind.id } });
    for (const b of R.bottlenecks) {
      const row = await prisma.researchBottleneck.create({
        data: { industryId: ind.id, name: b.name, dims: b.dims, level: b.level, whyBottleneck: b.whyBottleneck ?? null, controlledBy: b.controlledBy ?? null, dependents: b.dependents ?? null, hasAlternative: b.hasAlternative ?? null, jpBeneficiary: b.jpBeneficiary ?? null, jpSymbols: b.jpSymbols ?? undefined, triggers: b.triggers ?? null, status: "AI_RESEARCHED" },
      });
      if (b.claims?.length) { evidenceCount += await persistClaims("BOTTLENECK", row.id, b.claims); claimCount += b.claims.length; }
    }

    // 6) Knowledge Graph edges（按产业重建，key→id 解析）
    await prisma.researchGraphEdge.deleteMany({ where: { industryId: ind.id } });
    const resolve = (type: string, key: string): string | null =>
      type === "COMPANY" ? (coMap.get(key) ?? null) : type === "SEGMENT" ? (segMap.get(key) ?? null) : type === "TECHNOLOGY" ? (techMap.get(key) ?? null) : type === "INDUSTRY" ? ind.id : null;
    let edgeCount = 0;
    for (const e of R.edges) {
      const fromId = resolve(e.fromType, e.fromKey), toId = resolve(e.toType, e.toKey);
      if (!fromId || !toId) continue; // 未解析的边跳过（诚实，不伪造）
      await prisma.researchGraphEdge.create({ data: { industryId: ind.id, fromType: e.fromType, fromId, toType: e.toType, toId, edgeType: e.edgeType, directed: e.directed ?? true, strength: e.strength ?? null, note: e.note ?? null } });
      edgeCount++;
    }

    // 7) Version（永久保留 · 递增），8) Review（seed 自动通过 / LLM 待审），9) Report
    const prev = await prisma.researchVersion.findFirst({ where: { entityType: "INDUSTRY", entityId: ind.id }, orderBy: { generatedAt: "desc" } });
    const nextNum = prev ? parseInt(prev.version.replace(/\D/g, "")) + 1 : 1;
    const version = `V${nextNum}`;
    const isSeed = result.sourceKind === "SEED";
    const ver = await prisma.researchVersion.create({
      data: {
        entityType: "INDUSTRY", entityId: ind.id, version,
        status: isSeed ? "PUBLISHED" : "AI_RESEARCHED",
        changeReason: prev ? "重新深研" : "首版深研",
        previousVersionId: prev?.id ?? null,
        provider: result.usage.provider, model: result.usage.model, promptVersion: "p17-v1",
        tokenUsage: { prompt: result.usage.promptTokens, completion: result.usage.completionTokens, total: result.usage.totalTokens },
        estimatedCost: result.usage.estimatedCost, durationMs: result.usage.durationMs,
        evidenceCount, reviewStatus: isSeed ? "APPROVED" : "PENDING",
        reviewer: isSeed ? "seed-verified" : null, reviewedAt: isSeed ? now : null, publishedAt: isSeed ? now : null,
      },
    });
    if (isSeed) {
      await prisma.researchReview.create({ data: { versionId: ver.id, reviewer: "seed-verified", action: "APPROVE", comment: "Golden Path 人工核验种子数据（真实公开来源）" } });
    }
    await prisma.researchIndustry.update({ where: { id: ind.id }, data: { currentVer: version, status: isSeed ? "PUBLISHED" : "AI_RESEARCHED" } });
    await prisma.researchReport.create({
      data: { scope: "INDUSTRY", refKey: R.industry.industryKey, title: `${R.industry.nameZh} · 深度研究 ${version}`, version, summary: R.industry.summary ?? null, content: { industryKey: R.industry.industryKey, generatedFrom: version }, model: result.usage.model, status: isSeed ? "PUBLISHED" : "DRAFT", publishedAt: isSeed ? now : null },
    });

    await prisma.researchJob.update({
      where: { id: job.id },
      data: { status: "SUCCESS", model: result.usage.model, tokenUsage: { prompt: result.usage.promptTokens, completion: result.usage.completionTokens, total: result.usage.totalTokens }, estimatedCost: result.usage.estimatedCost, durationMs: Date.now() - t0, versionId: ver.id, finishedAt: new Date() },
    });

    return {
      industryKey: R.industry.industryKey, versionId: ver.id, version, jobId: job.id,
      counts: { segments: R.segments.length, technologies: R.technologies.length, companies: R.companies.length, claims: claimCount, evidence: evidenceCount, edges: edgeCount, bottlenecks: R.bottlenecks.length, stockLinks, hiddenChampions },
      published: isSeed, sourceKind: result.sourceKind,
    };
  } catch (err) {
    await prisma.researchJob.update({ where: { id: job.id }, data: { status: "FAILED", error: String((err as Error)?.message ?? err), durationMs: Date.now() - t0, finishedAt: new Date() } });
    throw err;
  }
}
