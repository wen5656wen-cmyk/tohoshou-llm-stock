import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/research/industries — Deep Research 首页九卡（只读聚合，不改评分）
export async function GET() {
  const industries = await prisma.researchIndustry.findMany({ orderBy: { sortOrder: "asc" } });

  // 一次取 company↔industry 链（含公司属性）+ 瓶颈 + 今日变化，JS 内聚合（无 N+1）
  const [links, bottlenecks, dailies] = await Promise.all([
    prisma.researchCompanyIndustry.findMany({ select: { industryId: true, companyId: true, company: { select: { listed: true, country: true, isHiddenChampion: true, entityType: true } } } }),
    prisma.researchBottleneck.groupBy({ by: ["industryId"], _count: { _all: true } }),
    prisma.researchDailyUpdate.groupBy({ by: ["industryId"], _count: { _all: true } }),
  ]);
  const botMap = new Map(bottlenecks.map((b) => [b.industryId, b._count._all]));
  const dailyMap = new Map(dailies.map((d) => [d.industryId, d._count._all]));

  // 按 industryId 去重公司统计
  const perInd = new Map<string, { jp: Set<string>; global: Set<string>; hc: Set<string> }>();
  for (const l of links) {
    let e = perInd.get(l.industryId);
    if (!e) { e = { jp: new Set(), global: new Set(), hc: new Set() }; perInd.set(l.industryId, e); }
    e.global.add(l.companyId);
    if (l.company.listed && l.company.country === "日本") e.jp.add(l.companyId);
    if (l.company.isHiddenChampion) e.hc.add(l.companyId);
  }

  const rows = industries.map((ind) => {
    const c = perInd.get(ind.id);
    return {
      industryKey: ind.industryKey, nameZh: ind.nameZh, nameEn: ind.nameEn, nameJa: ind.nameJa, oneLiner: ind.oneLiner,
      status: ind.status, version: ind.currentVer, freshness: ind.freshnessScore,
      lastDeepAt: ind.lastDeepAt, lastDailyAt: ind.lastDailyAt, nextReviewAt: ind.nextReviewAt, updatedAt: ind.updatedAt,
      counts: {
        jpListed: c?.jp.size ?? 0,
        globalCore: c?.global.size ?? 0,
        bottlenecks: botMap.get(ind.id) ?? 0,
        hiddenChampions: c?.hc.size ?? 0,
        todayChanges: dailyMap.get(ind.id) ?? 0,
      },
    };
  });

  return NextResponse.json({ industries: rows, total: rows.length });
}
