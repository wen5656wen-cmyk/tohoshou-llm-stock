// ── Deep Research V2 · AI Semiconductor Benchmark（P17 V2 · 真实执行）─────────
// AI 半导体 V1(PUBLISHED) → Strong Model → V2 候选(AI_RESEARCHED, payload 入库不 apply, V1 保留)
//   → 13 项质量报告 + 真实性字段 → Review → 人工 Approve → PUBLISHED。禁批量八产业/禁自动 Approve。
// 用法:
//   npx tsx scripts/research/benchmark-v2.ts --persist    # 真实生成 + 入库 V2 候选
//   npx tsx scripts/research/benchmark-v2.ts              # 生成 + 报告（不入库）
//   npx tsx scripts/research/benchmark-v2.ts --mock --dry # 种子占位验证管线（无 key）
// 密钥仅 .env 读取，不打印。禁 fallback（retries=0，单次请求）。
import "dotenv/config";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { getResearchProvider, makeProvider, validateIndustryResearch } from "../../lib/research/providers";
import { generateCandidateVersion } from "../../lib/research/engine";
import { industryChecksum } from "../../lib/research/checksum";
import { prisma } from "../../lib/prisma";
import { SEEDS } from "../../lib/research/provider-seed";
import type { IndustryResearch } from "../../lib/research/types";

const KEY = "AI_SEMICONDUCTOR";
const REQUESTED_MODEL = "gpt-5.6-sol";
const MATERIAL = new Set(["SHARE", "MOAT", "CHOKEPOINT", "ROADMAP", "CAPACITY"]);
type Claim = { claimType?: string; importance?: number; confidence?: string; evidence?: unknown[]; statement?: string };
type Co = { symbol?: string | null; listed?: boolean };
const claims = (d: IndustryResearch): Claim[] => { const o: Claim[] = []; for (const g of [d.companies, d.technologies, d.bottlenecks] as { claims?: Claim[] }[][]) for (const x of g ?? []) for (const c of x.claims ?? []) o.push(c); return o; };
const isMat = (c: Claim) => (c.importance ?? 0) >= 7 || MATERIAL.has(String(c.claimType ?? "").toUpperCase());
const recall = (want: Set<string>, got: Set<string>) => (want.size ? +([...want].filter((x) => got.has(x)).length / want.size * 100).toFixed(1) : null);

function quality(cand: IndustryResearch, seed: IndustryResearch, usage: { totalTokens: number; estimatedCost: number; durationMs: number }) {
  const v = validateIndustryResearch(cand);
  const cl = claims(cand); const mat = cl.filter(isMat);
  const matCov = mat.length ? +(mat.filter((c) => (c.evidence?.length ?? 0) > 0).length / mat.length * 100).toFixed(1) : null;
  const seedSyms = new Set((seed.companies as Co[]).filter((c) => c.listed && c.symbol).map((c) => c.symbol!));
  const candSyms = new Set((cand.companies as Co[]).filter((c) => c.listed && c.symbol).map((c) => c.symbol!));
  const seedTech = new Set((seed.technologies as { techKey?: string }[]).map((t) => t.techKey ?? "").filter(Boolean));
  const candTech = new Set((cand.technologies as { techKey?: string }[]).map((t) => t.techKey ?? "").filter(Boolean));
  const seedSeg = new Set((seed.segments as { segmentKey?: string }[]).map((s) => s.segmentKey ?? "").filter(Boolean));
  const candSeg = new Set((cand.segments as { segmentKey?: string }[]).map((s) => s.segmentKey ?? "").filter(Boolean));
  const coRecall = recall(seedSyms, candSyms), techRecall = recall(seedTech, candTech), segRecall = recall(seedSeg, candSeg);
  const extra = [...candSyms].filter((s) => !seedSyms.has(s));
  const cons = [coRecall, techRecall, segRecall].filter((x): x is number => x != null);
  const seedNodes = seedSyms.size + seedSeg.size + seedTech.size, candNodes = candSyms.size + candSeg.size + candTech.size;
  const gates = [
    { k: "重大Claim证据覆盖≥95%", pass: (matCov ?? 0) >= 95, v: `${matCov ?? "—"}%` },
    { k: "无证据确定性Claim=0", pass: v.stats.noEvidenceCertainClaims === 0, v: v.stats.noEvidenceCertainClaims },
    { k: "股票代码错误=0", pass: v.stats.symbolErrors === 0, v: v.stats.symbolErrors },
    { k: "Schema=100%", pass: v.schemaValid, v: v.schemaValid ? "100%" : v.errors.join(";") },
    { k: "边重复<2%", pass: (v.stats.edges ? v.stats.duplicateEdges / v.stats.edges * 100 : 0) < 2, v: `${v.stats.edges ? (v.stats.duplicateEdges / v.stats.edges * 100).toFixed(1) : 0}%` },
  ];
  const autoFail = gates.filter((g) => !g.pass);
  return {
    metrics: {
      "01_Claim数": v.stats.claims, "02_Evidence数": v.stats.evidence, "03_EvidenceCoverage_重大Claim_%": matCov,
      "04_Hallucination_种子外上市代码_待人审": { count: extra.length, symbols: extra.slice(0, 30) },
      "05_EntityAccuracy_公司召回_%": coRecall,
      "06_CompanyAccuracy_%": coRecall, "07_TechnologyAccuracy_%": techRecall, "07b_SegmentAccuracy_%": segRecall,
      "08_KG完整度": { nodes: candNodes, edges: v.stats.edges, vsSeedNodes: seedNodes, nodeRatioPct: seedNodes ? +(candNodes / seedNodes * 100).toFixed(1) : null },
      "09_Reviewer修改量": "PENDING(reviewer)",
      "10_Token": usage.totalTokens, "11_Cost_USD_estimated": usage.estimatedCost, "12_Duration_ms": usage.durationMs,
      "13_Seed一致率_%": cons.length ? +(cons.reduce((a, b) => a + b, 0) / cons.length).toFixed(1) : null,
      "13b_PublishReady": autoFail.length ? `NOT_READY(自动门槛未过: ${autoFail.map((g) => g.k).join(", ")})` : "AUTO_PASS(待人审: 幻觉/关系准确率/可发布率)",
    },
    gates, autoPass: autoFail.length === 0, stats: v.stats,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const persist = args.includes("--persist");
  const dry = args.includes("--dry");
  const mock = args.includes("--mock");
  const startedAt = new Date().toISOString();

  console.log("═══ Deep Research V2 · AI Semiconductor Benchmark（真实执行）═══\n");
  const provider = mock ? makeProvider("seed") : getResearchProvider({ role: "strong" });
  const requestedProvider = mock ? "seed(mock)" : (process.env.RESEARCH_PROVIDER ?? "openai");
  const requestedModel = mock ? "seed" : (process.env.RESEARCH_STRONG_MODEL ?? REQUESTED_MODEL);
  console.log(`requestedProvider=${requestedProvider}  requestedModel=${requestedModel}  provider.kind=${provider.kind}  provider.model=${provider.model}  mock=${mock}`);

  const avail = await provider.checkAvailability();
  if (!avail.available) { console.log(`⛔ 强模型不可用: ${avail.reason} —— 停止，不生成。`); process.exit(2); }

  // V1 before
  const before = await industryChecksum(KEY);
  if (!before.exists || before.status !== "PUBLISHED") { console.log(`⛔ V1 非 PUBLISHED（status=${before.status}），停止。`); process.exit(2); }
  console.log(`V1 before: version=${before.publishedVersion} id=${before.publishedVersionId} status=${before.status} sha256=${before.sha256}`);

  console.log(`\n▶  生成 ${KEY} V2 候选（单次请求，禁 fallback）…`);
  const r = await provider.run(KEY, { sourcePack: "", retries: 0, timeoutMs: 1800000 });

  // 归一化：候选固定绑定到 AI_SEMICONDUCTOR（模型可能省略/改写 industryKey）；缺名回填种子。不改研究内容。
  const seedInd = SEEDS[KEY].industry;
  if (!r.data.industry || typeof r.data.industry !== "object") (r.data as { industry: typeof seedInd }).industry = { ...seedInd };
  r.data.industry.industryKey = KEY;
  r.data.industry.nameZh = r.data.industry.nameZh ?? seedInd.nameZh;
  r.data.industry.nameEn = r.data.industry.nameEn ?? seedInd.nameEn;
  r.data.industry.nameJa = r.data.industry.nameJa ?? seedInd.nameJa;

  const q = quality(r.data, SEEDS[KEY], { totalTokens: r.usage.totalTokens, estimatedCost: r.usage.estimatedCost, durationMs: r.usage.durationMs });

  // actualModel 校验
  const actualModel = r.audit.actualModel;
  const modelValid = mock || actualModel === requestedModel;
  const fallbackUsed = !!r.fallbackUsed;

  // 入库候选（不 apply，V1 保留）。容错：入库失败不丢报告与生成结果。
  let candidateVersionId: string | null = null;
  let persistError: string | null = null;
  if (persist && !dry && modelValid) {
    try { const cand = await generateCandidateVersion({ data: r.data, usage: r.usage, sourceKind: "LLM" }); candidateVersionId = cand.versionId; }
    catch (e) { persistError = (e as Error).message; }
  }

  // V1 after
  const after = await industryChecksum(KEY);
  const v1Unchanged = before.sha256 === after.sha256 && before.status === after.status;

  const truthfulness = {
    requestedProvider, actualProvider: provider.kind, requestedModel, actualModel,
    modelValid, mock, fallbackUsed,
    candidateVersionId, v1VersionId: before.publishedVersionId,
    v1ChecksumBefore: before.sha256, v1ChecksumAfter: after.sha256, v1Unchanged,
    apiRequestCount: r.audit.requestCount,
    inputTokens: r.usage.promptTokens, cachedInputTokens: r.audit.cachedInputTokens,
    outputTokens: r.usage.completionTokens, reasoningTokens: r.audit.reasoningTokens,
    totalTokens: r.usage.totalTokens, estimatedCostUSD: r.usage.estimatedCost, durationMs: r.usage.durationMs,
    generationTimestamp: startedAt, rawLength: r.raw.length, persistError,
  };

  // 记 ResearchJob（运营计费：Dashboard Token&Cost 从 ResearchJob 聚合；Version 上也各存一份）
  if (!mock) {
    await prisma.researchJob.create({ data: {
      jobType: "BENCHMARK", industryKey: KEY, targetKey: KEY, status: modelValid ? "SUCCESS" : "FAILED",
      attempt: r.audit.requestCount, maxAttempts: 1, provider: provider.kind, model: actualModel,
      tokenUsage: { prompt: r.usage.promptTokens, completion: r.usage.completionTokens, total: r.usage.totalTokens },
      estimatedCost: r.usage.estimatedCost, durationMs: r.usage.durationMs, versionId: candidateVersionId,
      error: modelValid ? null : `actualModel ${actualModel} ≠ requested ${requestedModel}`,
      startedAt: new Date(startedAt), finishedAt: new Date(),
    } });
  }

  console.log("\n── 真实性 ──"); for (const [k, v] of Object.entries(truthfulness)) console.log(`  ${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`);
  console.log("\n── 13 项质量 ──"); for (const [k, v] of Object.entries(q.metrics)) console.log(`  ${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`);
  console.log(`\n  自动门槛: ${q.autoPass ? "✅ 全过" : "❌ " + q.gates.filter((g) => !g.pass).map((g) => g.k).join(", ")}`);
  console.log(`  V1 未变化: ${v1Unchanged ? "✅ (checksum 相同)" : "❌"}`);
  if (!modelValid) console.log(`  ⚠️ actualModel(${actualModel}) ≠ requestedModel(${requestedModel}) → 本次 Benchmark 判定无效，未入库。`);
  console.log(candidateVersionId ? `\n📥 V2 候选已入库: ${candidateVersionId} status=AI_RESEARCHED · V1 未动 · 待人工 Review（不自动 Approve）` : `\n(未入库${!persist ? "：未加 --persist" : dry ? "：--dry" : !modelValid ? "：模型校验失败" : ""})`);

  const dir = join(process.cwd(), "reports"); mkdirSync(dir, { recursive: true });
  const path = join(dir, `research-benchmark-v2-${KEY}.json`);
  writeFileSync(path, JSON.stringify({ industry: KEY, truthfulness, quality: q.metrics, gates: q.gates, autoPass: q.autoPass, v1Unchanged, validation: r.validation.stats, validationErrors: r.validation.errors, validationWarnings: r.validation.warnings, usage: r.usage, audit: r.audit, rawSample: r.raw.slice(0, 6000) }, null, 2));
  console.log(`\n📄 报告: ${path}${persistError ? `\n⚠️ 入库失败: ${persistError}` : ""}`);
}
main().catch((e) => { console.error("benchmark-v2 失败:", e); process.exit(1); });
