// ── Deep Research V2 · Post Processor（P17 V2）────────────────────────────────
// 对齐模型输出到 Canonical 规范；不新增数据结构/页面/功能。
//   ① Schema 对齐：segmentKey/techKey/claimType 强制映射到 canonical，非法丢弃（禁自由命名）。
//   ② Graph Builder：source/target/relation/direction 统一 + Edge Hash 自动去重（同关系不重复）。
//   ③ Material Claim：claim 必须有 claimType(canonical)+importance+confidence+≥1 Evidence，否则丢弃。
//   ④ Company Resolver：种子外公司标 NEW_CANDIDATE（不直接判幻觉）。
import { resolveSegment, resolveTech, segmentLayer, techName, CANONICAL_CLAIM_TYPES, CANONICAL_EDGE_TYPES, MATERIAL_CLAIM_TYPES } from "./canonical";
import type { IndustryResearch } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
const CLAIM_OK = new Set<string>(CANONICAL_CLAIM_TYPES as unknown as string[]);
const EDGE_OK = new Set<string>(CANONICAL_EDGE_TYPES as unknown as string[]);
// claimType 别名容错（常见变体 → canonical），映射而非一味丢弃
const CLAIM_ALIAS: Record<string, string> = { MARKET_SHARE: "SHARE", SHARE: "SHARE", DOMINANCE: "SHARE", MOAT: "MOAT", ADVANTAGE: "MOAT", COMPETITIVE_ADVANTAGE: "MOAT", BARRIER: "MOAT", ROADMAP: "ROADMAP", PLAN: "ROADMAP", RISK: "RISK", THREAT: "RISK", GROWTH: "GROWTH", DEMAND: "GROWTH", CHOKEPOINT: "CHOKEPOINT", BOTTLENECK: "CHOKEPOINT", MONOPOLY: "CHOKEPOINT", CUSTOMER: "CUSTOMER", DEMAND_SIDE: "CUSTOMER", CAPACITY: "CAPACITY", EXPANSION: "CAPACITY", CAPEX: "CAPACITY", SUPPLY: "CHOKEPOINT" };
const canonClaimType = (ct: string) => { const u = String(ct ?? "").toUpperCase().replace(/[^A-Z_]/g, ""); return CLAIM_ALIAS[u] ?? (CLAIM_OK.has(u) ? u : ""); };
const clampImp = (v: any, ct: string) => { const n = Number(v); if (Number.isFinite(n) && n >= 1 && n <= 10) return Math.round(n); return MATERIAL_CLAIM_TYPES.has(ct) ? 8 : 5; };

function cleanClaims(claims: any[] | undefined) {
  const kept: any[] = []; let dropped = 0;
  for (const c of claims ?? []) {
    const ct = canonClaimType(c?.claimType); // 别名映射到 canonical；无法映射→""
    if (!ct) { dropped++; continue; } // 非规范且无法映射 → 丢弃（禁自由命名）
    const ev = Array.isArray(c.evidence) ? c.evidence.filter((e: any) => e && e.sourceTitle && e.sourceType) : [];
    // 重大 Claim 必须有证据；否则丢弃（保证 Evidence Coverage 可计算）
    if (MATERIAL_CLAIM_TYPES.has(ct) && ev.length === 0) { dropped++; continue; }
    const conf = ["HIGH", "MID", "LOW"].includes(String(c.confidence ?? "").toUpperCase()) ? String(c.confidence).toUpperCase() : (ev.length ? "MID" : "LOW");
    kept.push({ claimType: ct, statement: String(c.statement ?? "").trim(), importance: clampImp(c.importance, ct), confidence: ev.length ? conf : "LOW", evidence: ev });
  }
  return { kept, dropped };
}

export interface AlignReport {
  segments: { in: number; kept: number; dropped: number };
  technologies: { in: number; kept: number; dropped: number; dupRemoved: number };
  claims: { in: number; kept: number; dropped: number };
  edges: { in: number; kept: number; dedupRemoved: number; dropped: number };
  companies: { total: number; newCandidates: string[] };
  canonicalAdherence: { segmentPct: number | null; techPct: number | null };
}

export function alignPayload(industryKey: string, raw: IndustryResearch, knownSymbols?: Set<string>): { payload: IndustryResearch; report: AlignReport } {
  const R: any = JSON.parse(JSON.stringify(raw ?? {}));
  R.industry = R.industry ?? {};

  // ── Segments：映射到 canonical + 补 layer；丢弃非规范 ──
  const segIn = Array.isArray(R.segments) ? R.segments.length : 0;
  const segSeen = new Set<string>();
  R.segments = (R.segments ?? []).map((s: any) => { const k = resolveSegment(industryKey, s?.segmentKey) ?? resolveSegment(industryKey, s?.nameZh) ?? resolveSegment(industryKey, s?.nameEn); return k ? { ...s, segmentKey: k, layer: segmentLayer(industryKey, k) ?? s.layer ?? "MIDSTREAM" } : null; })
    .filter((s: any) => s && !segSeen.has(s.segmentKey) && segSeen.add(s.segmentKey));

  // ── Technologies：映射到 canonical + 补 name；去重；丢弃非规范 ──
  const techIn = Array.isArray(R.technologies) ? R.technologies.length : 0;
  const techSeen = new Set<string>(); let techDup = 0;
  R.technologies = (R.technologies ?? []).map((t: any) => { const k = resolveTech(industryKey, t?.techKey) ?? resolveTech(industryKey, t?.name); if (!k) return null; if (techSeen.has(k)) { techDup++; return null; } techSeen.add(k); const { kept } = cleanClaims(t.claims); return { ...t, techKey: k, name: t.name ?? techName(industryKey, k) ?? k, claims: kept }; })
    .filter(Boolean);

  // ── Companies：规范化引用键；Company Resolver（NEW_CANDIDATE）；claims 清洗 ──
  let claimIn = 0, claimKept = 0, claimDropped = 0;
  const newCandidates: string[] = [];
  R.companies = (R.companies ?? []).map((c: any) => {
    const segKeys = [...new Set((c.segmentKeys ?? []).map((k: string) => resolveSegment(industryKey, k)).filter(Boolean))];
    const techKeys = [...new Set((c.techKeys ?? []).map((k: string) => resolveTech(industryKey, k)).filter(Boolean))];
    const cc = cleanClaims(c.claims); claimIn += (c.claims?.length ?? 0); claimKept += cc.kept.length; claimDropped += cc.dropped;
    // Company Resolver：种子外上市公司标 NEW_CANDIDATE（不判幻觉）
    if (c.listed && c.symbol && knownSymbols && !knownSymbols.has(c.symbol)) newCandidates.push(c.symbol);
    return { ...c, segmentKeys: segKeys, techKeys, claims: cc.kept };
  });

  // ── Bottlenecks：claims 清洗 ──
  R.bottlenecks = (R.bottlenecks ?? []).map((b: any) => { const cc = cleanClaims(b.claims); claimIn += (b.claims?.length ?? 0); claimKept += cc.kept.length; claimDropped += cc.dropped; return { ...b, claims: cc.kept }; });

  // ── Graph Builder：统一 source/target/relation/direction + Edge Hash 去重 ──
  const edgeIn = Array.isArray(R.edges) ? R.edges.length : 0;
  const coKeys = new Set(R.companies.map((c: any) => c.companyKey));
  const segKeysSet = new Set(R.segments.map((s: any) => s.segmentKey));
  const techKeysSet = new Set(R.technologies.map((t: any) => t.techKey));
  const resolveEndpoint = (type: string, key: string): string | null => {
    const ty = String(type ?? "").toUpperCase();
    if (ty === "COMPANY") return coKeys.has(key) ? key : null;
    if (ty === "SEGMENT") { const k = resolveSegment(industryKey, key); return k && segKeysSet.has(k) ? k : null; }
    if (ty === "TECHNOLOGY") { const k = resolveTech(industryKey, key); return k && techKeysSet.has(k) ? k : null; }
    if (ty === "INDUSTRY") return industryKey;
    return null;
  };
  const seenEdge = new Set<string>(); let edgeDrop = 0, edgeDedup = 0;
  const edges: any[] = [];
  for (const e of R.edges ?? []) {
    const et = String(e?.edgeType ?? "").toUpperCase();
    const from = resolveEndpoint(e?.fromType, e?.fromKey), to = resolveEndpoint(e?.toType, e?.toKey);
    if (!EDGE_OK.has(et) || !from || !to || from === to) { edgeDrop++; continue; }
    const directed = e.directed !== false;
    const fT = String(e.fromType).toUpperCase(), tT = String(e.toType).toUpperCase();
    const a = `${fT}:${from}`, b = `${tT}:${to}`;
    const hash = directed ? `${a}|${et}|${b}` : [a, b].sort().join("|") + `|${et}`;
    if (seenEdge.has(hash)) { edgeDedup++; continue; }
    seenEdge.add(hash);
    edges.push({ fromType: fT, fromKey: from, toType: tT, toKey: to, edgeType: et, directed, strength: e.strength ?? null, note: e.note ?? null });
  }
  R.edges = edges;

  const segPct = segIn ? +(R.segments.length / segIn * 100).toFixed(1) : null;
  const techPct = techIn ? +(R.technologies.length / techIn * 100).toFixed(1) : null;
  return {
    payload: R as IndustryResearch,
    report: {
      segments: { in: segIn, kept: R.segments.length, dropped: segIn - R.segments.length },
      technologies: { in: techIn, kept: R.technologies.length, dropped: techIn - R.technologies.length - techDup, dupRemoved: techDup },
      claims: { in: claimIn, kept: claimKept, dropped: claimDropped },
      edges: { in: edgeIn, kept: edges.length, dedupRemoved: edgeDedup, dropped: edgeDrop },
      companies: { total: R.companies.length, newCandidates: [...new Set(newCandidates)] },
      canonicalAdherence: { segmentPct: segPct, techPct: techPct },
    },
  };
}
