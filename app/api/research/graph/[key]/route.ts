import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/research/graph/[key] — 知识图谱数据（typed nodes + edges）。
// 面向 Phase 6 专业图库（React Flow / Cytoscape.js）；本 API 不渲染，仅提供结构化数据。
export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const ind = await prisma.researchIndustry.findUnique({ where: { industryKey: key } });
  if (!ind) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [links, segments, techs, edges] = await Promise.all([
    prisma.researchCompanyIndustry.findMany({ where: { industryId: ind.id }, include: { company: { select: { id: true, name: true, nameZh: true, symbol: true, listed: true, altDifficulty: true, isHiddenChampion: true } }, segment: { select: { segmentKey: true, layer: true } } } }),
    prisma.researchSegment.findMany({ where: { industryId: ind.id }, select: { id: true, nameZh: true, layer: true, segmentKey: true } }),
    prisma.researchTechnology.findMany({ where: { industryId: ind.id }, select: { id: true, name: true, techKey: true } }),
    prisma.researchGraphEdge.findMany({ where: { industryId: ind.id } }),
  ]);

  // 去重公司节点
  const coSeen = new Map<string, { id: string; label: string; symbol: string | null; listed: boolean; choke: string | null; hc: boolean; layer: string | null }>();
  for (const l of links) {
    if (!coSeen.has(l.company.id)) coSeen.set(l.company.id, { id: l.company.id, label: l.company.nameZh ?? l.company.name, symbol: l.company.symbol, listed: l.company.listed, choke: l.company.altDifficulty, hc: l.company.isHiddenChampion, layer: l.segment?.layer ?? null });
  }

  const nodes = [
    ...[...coSeen.values()].map((c) => ({ id: c.id, type: "COMPANY", label: c.label, group: c.layer, meta: { symbol: c.symbol, listed: c.listed, chokehold: c.choke, hiddenChampion: c.hc } })),
    ...segments.map((s) => ({ id: s.id, type: "SEGMENT", label: s.nameZh, group: s.layer, meta: { segmentKey: s.segmentKey } })),
    ...techs.map((t) => ({ id: t.id, type: "TECHNOLOGY", label: t.name, group: "TECH", meta: { techKey: t.techKey } })),
  ];
  const edgeOut = edges.map((e) => ({ id: e.id, source: e.fromId, target: e.toId, sourceType: e.fromType, targetType: e.toType, type: e.edgeType, directed: e.directed, strength: e.strength, label: e.note }));

  return NextResponse.json({ industryKey: key, nodes, edges: edgeOut, stats: { nodes: nodes.length, edges: edgeOut.length, companies: coSeen.size, segments: segments.length, technologies: techs.length } });
}
