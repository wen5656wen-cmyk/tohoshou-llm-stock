// ── Deep Research V2 · AI Semiconductor Benchmark（P17 V2）───────────────────
// 流程：AI 半导体 V1(PUBLISHED) → Strong Model → 生成 V2 候选(AI_RESEARCHED, payload 入库不 apply, V1 保留)
//       → 13 项报告 → Review → Approve → PUBLISHED。禁批量八产业。
// 用法:
//   npx tsx scripts/research/benchmark-v2.ts                 # 用 RESEARCH_STRONG_MODEL 生成 + 出报告（不入库）
//   npx tsx scripts/research/benchmark-v2.ts --persist       # 生成 + 入库 V2 候选(AI_RESEARCHED)
//   npx tsx scripts/research/benchmark-v2.ts --mock --dry    # 用种子占位强模型验证报告管线（无 key）
//   密钥仅 .env 读取，不打印。
import "dotenv/config";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { getResearchProvider, makeProvider, validateIndustryResearch } from "../../lib/research/providers";
import { generateCandidateVersion } from "../../lib/research/engine";
import { SEEDS } from "../../lib/research/provider-seed";
import type { IndustryResearch } from "../../lib/research/types";

const KEY = "AI_SEMICONDUCTOR";
const MATERIAL = new Set(["SHARE", "MOAT", "CHOKEPOINT", "ROADMAP", "CAPACITY"]);
type Claim = { claimType?: string; importance?: number; confidence?: string; evidence?: unknown[]; statement?: string };
type Co = { companyKey?: string; symbol?: string | null; listed?: boolean };
const claims = (d: IndustryResearch): Claim[] => { const o: Claim[] = []; for (const g of [d.companies, d.technologies, d.bottlenecks] as { claims?: Claim[] }[][]) for (const x of g ?? []) for (const c of x.claims ?? []) o.push(c); return o; };
const material = (c: Claim) => (c.importance ?? 0) >= 7 || MATERIAL.has(String(c.claimType ?? "").toUpperCase());
const setOf = <T,>(a: T[]) => new Set(a);
const recall = (want: Set<string>, got: Set<string>) => (want.size ? +([...want].filter((x) => got.has(x)).length / want.size * 100).toFixed(1) : null);

// 13 项报告：候选 vs 种子(V1 真值)
function report(cand: IndustryResearch, seed: IndustryResearch, usage: { totalTokens: number; estimatedCost: number; durationMs: number }) {
  const v = validateIndustryResearch(cand);
  const cl = claims(cand); const mat = cl.filter(material);
  const matCov = mat.length ? +(mat.filter((c) => (c.evidence?.length ?? 0) > 0).length / mat.length * 100).toFixed(1) : null;
  const seedSyms = setOf((seed.companies as Co[]).filter((c) => c.listed && c.symbol).map((c) => c.symbol!));
  const candSyms = setOf((cand.companies as Co[]).filter((c) => c.listed && c.symbol).map((c) => c.symbol!));
  const seedTech = setOf((seed.technologies as { techKey?: string }[]).map((t) => t.techKey ?? "").filter(Boolean));
  const candTech = setOf((cand.technologies as { techKey?: string }[]).map((t) => t.techKey ?? "").filter(Boolean));
  const seedSeg = setOf((seed.segments as { segmentKey?: string }[]).map((s) => s.segmentKey ?? "").filter(Boolean));
  const candSeg = setOf((cand.segments as { segmentKey?: string }[]).map((s) => s.segmentKey ?? "").filter(Boolean));
  const coRecall = recall(seedSyms, candSyms), techRecall = recall(seedTech, candTech), segRecall = recall(seedSeg, candSeg);
  const extraSyms = [...candSyms].filter((s) => !seedSyms.has(s)); // 种子外上市代码 → 幻觉候选（人审确认）
  const consistency = [coRecall, techRecall, segRecall].filter((x): x is number => x != null);
  const seedNodes = seedSyms.size + seedSeg.size + seedTech.size, candNodes = candSyms.size + candSeg.size + candTech.size;

  const autoGates = [
    { k: "重大Claim证据覆盖≥95%", pass: (matCov ?? 0) >= 95, v: `${matCov ?? "—"}%` },
    { k: "无证据确定性Claim=0", pass: v.stats.noEvidenceCertainClaims === 0, v: v.stats.noEvidenceCertainClaims },
    { k: "股票代码错误=0", pass: v.stats.symbolErrors === 0, v: v.stats.symbolErrors },
    { k: "Schema=100%", pass: v.schemaValid, v: v.schemaValid ? "100%" : v.errors.join(";") },
    { k: "边重复<2%", pass: (v.stats.edges ? v.stats.duplicateEdges / v.stats.edges * 100 : 0) < 2, v: `${v.stats.edges ? (v.stats.duplicateEdges / v.stats.edges * 100).toFixed(1) : 0}%` },
  ];
  const autoFail = autoGates.filter((g) => !g.pass);
  return {
    metrics: {
      "01_Claim数": v.stats.claims,
      "02_Evidence数": v.stats.evidence,
      "03_EvidenceCoverage(重大Claim)": matCov,
      "04_Hallucination(种子外上市代码,待人审)": { count: extraSyms.length, symbols: extraSyms.slice(0, 20) },
      "05_EntityAccuracy(公司召回%)": coRecall,
      "06_Company/TechnologyAccuracy": { companyRecall: coRecall, technologyRecall: techRecall, segmentRecall: segRecall },
      "07_KG完整度": { nodes: candNodes, edges: v.stats.edges, vsSeedNodes: seedNodes, nodeRatio: seedNodes ? +(candNodes / seedNodes * 100).toFixed(1) : null },
      "08_Reviewer修改量": "PENDING(reviewer)",
      "09_Token": usage.totalTokens,
      "10_Cost_USD": usage.estimatedCost,
      "11_Duration_ms": usage.durationMs,
      "12_与Seed一致率%": consistency.length ? +(consistency.reduce((a, b) => a + b, 0) / consistency.length).toFixed(1) : null,
      "13_PublishReady": autoFail.length ? `NOT_READY(自动门槛未过: ${autoFail.map((g) => g.k).join(", ")})` : "AUTO_PASS(待人审: 幻觉/关系准确率/可发布率)",
    },
    autoGates, validation: v.stats,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const persist = args.includes("--persist");
  const dry = args.includes("--dry");
  const mock = args.includes("--mock");

  console.log("═══ Deep Research V2 · AI Semiconductor Benchmark ═══\n");
  const provider = mock ? makeProvider("seed") : getResearchProvider({ role: "strong" });
  console.log(`provider: ${provider.kind}  model: ${provider.model ?? (mock ? "seed(mock)" : "—")}  capabilities: ${JSON.stringify(provider.capabilities)}`);
  const avail = await provider.checkAvailability();
  if (!avail.available) { console.log(`⏭  强模型不可用: ${avail.reason}\n   → 服务器 /opt/tohoshou/.env 配 RESEARCH_PROVIDER/RESEARCH_STRONG_MODEL/ANTHROPIC_API_KEY 后重试。`); process.exit(0); }

  console.log(`▶  生成 ${KEY} 候选（Strong Model${mock ? "=seed mock" : ""}）…`);
  const r = await provider.run(KEY, { sourcePack: "" });
  const rep = report(r.data, SEEDS[KEY], { totalTokens: r.usage.totalTokens, estimatedCost: r.usage.estimatedCost, durationMs: r.usage.durationMs });
  console.log("\n── 13 项报告 ──");
  for (const [k, val] of Object.entries(rep.metrics)) console.log(`  ${k}: ${typeof val === "object" ? JSON.stringify(val) : val}`);
  console.log(`\n  自动门槛: ${rep.autoGates.every((g) => g.pass) ? "✅ 全过" : "❌ " + rep.autoGates.filter((g) => !g.pass).map((g) => g.k).join(", ")}`);

  let versionId: string | null = null;
  if (persist && !dry) {
    const cand = await generateCandidateVersion({ data: r.data, usage: r.usage, sourceKind: "LLM" });
    versionId = cand.versionId;
    console.log(`\n📥 已入库 V2 候选: ${cand.version} (${cand.versionId}) status=AI_RESEARCHED · **V1 未动**`);
    console.log(`   → Review at /deep-research/review（Approve 后才 apply 落地、置 PUBLISHED）`);
  } else {
    console.log(`\n(未入库；加 --persist 入库 V2 候选)`);
  }

  const dir = join(process.cwd(), "reports"); mkdirSync(dir, { recursive: true });
  const path = join(dir, `research-benchmark-v2-${KEY}.json`);
  writeFileSync(path, JSON.stringify({ generatedAt: new Date().toISOString(), industry: KEY, provider: provider.kind, model: provider.model, versionId, ...rep, usage: r.usage }, null, 2));
  console.log(`\n📄 报告: ${path}`);
}
main().catch((e) => { console.error("benchmark-v2 失败:", e); process.exit(1); });
