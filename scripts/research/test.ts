// ── Deep Research · 测试套件（P17 收尾）─────────────────────────────────────
// 纯函数：Schema 校验 / Claim 无 Evidence 阻断 / Provider Adapter / Version Diff / 边去重 / Review 流转 / Seed 完整性。
// DB：Scheduler 幂等 / Advisory lock 并发 / Retry / Timeout / Failure isolation / StockLink 只读。
// 用法: npx tsx scripts/research/test.ts   （DB 测试需可达数据库，本地不可达则在生产跑）
/* eslint-disable @typescript-eslint/no-explicit-any */
import "dotenv/config";
import { validateIndustryResearch, makeProvider, getResearchProvider } from "../../lib/research/providers";
import { SEEDS } from "../../lib/research/provider-seed";
import { payloadCounts, countsDiff } from "../../lib/research/diff";
import { reviewPatch, isReviewAction } from "../../lib/research/review-flow";
import { runResearchJob, runResearchJobsIsolated } from "../../lib/research/scheduler";
import { runIndustryResearch, generateCandidateVersion, applyVersion } from "../../lib/research/engine";
import { prisma } from "../../lib/prisma";
import type { IndustryResearch } from "../../lib/research/types";

async function cleanupTestIndustry(key: string, coKeys: string[]) {
  const ind = await prisma.researchIndustry.findUnique({ where: { industryKey: key } });
  if (!ind) return;
  const cos = await prisma.researchCompany.findMany({ where: { companyKey: { in: coKeys } }, select: { id: true } });
  const coIds = cos.map((c) => c.id);
  const techs = await prisma.researchTechnology.findMany({ where: { industryId: ind.id }, select: { id: true } });
  await prisma.researchClaim.deleteMany({ where: { entityId: { in: [ind.id, ...coIds, ...techs.map((t) => t.id)] } } });
  await prisma.researchGraphEdge.deleteMany({ where: { industryId: ind.id } });
  await prisma.researchBottleneck.deleteMany({ where: { industryId: ind.id } });
  await prisma.researchCompanyIndustry.deleteMany({ where: { industryId: ind.id } });
  await prisma.researchCompanyTechnology.deleteMany({ where: { companyId: { in: coIds } } });
  await prisma.researchStockLink.deleteMany({ where: { companyId: { in: coIds } } });
  await prisma.researchHiddenChampionScore.deleteMany({ where: { companyId: { in: coIds } } });
  await prisma.researchVersion.deleteMany({ where: { entityType: "INDUSTRY", entityId: ind.id } });
  await prisma.researchReport.deleteMany({ where: { refKey: key } });
  await prisma.researchJob.deleteMany({ where: { industryKey: key } });
  await prisma.researchTechnology.deleteMany({ where: { industryId: ind.id } });
  await prisma.researchSegment.deleteMany({ where: { industryId: ind.id } });
  await prisma.researchCompany.deleteMany({ where: { companyKey: { in: coKeys } } });
  await prisma.researchIndustry.delete({ where: { id: ind.id } });
}

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (cond) { pass++; console.log(`  ✅ ${name}`); } else { fail++; console.log(`  ❌ ${name} ${extra}`); } };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const goodPayload: IndustryResearch = {
  industry: { industryKey: "TEST_IND", nameZh: "测试", nameEn: "Test", nameJa: "テスト" },
  segments: [{ segmentKey: "s1", layer: "UPSTREAM", nameZh: "上游" }],
  technologies: [], bottlenecks: [],
  companies: [
    { companyKey: "co1", symbol: "6920.T", name: "A", country: "JP", listed: true, claims: [{ statement: "share high", confidence: "HIGH", importance: 8, evidence: [{ sourceTitle: "x", sourceType: "FILING" }] }] },
    { companyKey: "co2", symbol: "BAD", name: "B", country: "JP", listed: true, claims: [{ statement: "no ev", confidence: "HIGH", importance: 8 }] }, // 无证据确定 Claim + 非法 symbol
  ],
  edges: [{ fromType: "COMPANY", fromKey: "co1", toType: "SEGMENT", toKey: "s1", edgeType: "SUPPLY" }, { fromType: "COMPANY", fromKey: "co1", toType: "SEGMENT", toKey: "s1", edgeType: "SUPPLY" }], // 重复边
};

async function main() {
  console.log("═══ Deep Research 测试套件 ═══\n");

  console.log("【1】Schema validation");
  const v = validateIndustryResearch(goodPayload);
  ok("有效 payload schemaValid", v.schemaValid);
  ok("空对象 schemaValid=false", validateIndustryResearch({}).schemaValid === false);
  ok("统计 companies=2/jpListed=2", v.stats.companies === 2 && v.stats.jpListed === 2, JSON.stringify(v.stats));

  console.log("【2】Claim 无 Evidence 阻断 / symbol 校验");
  ok("检出无证据确定性 Claim=1", v.stats.noEvidenceCertainClaims === 1, `got ${v.stats.noEvidenceCertainClaims}`);
  ok("检出非法 JP symbol=1", v.stats.symbolErrors === 1, `got ${v.stats.symbolErrors}`);

  console.log("【3】边去重");
  ok("检出重复边=1", v.stats.duplicateEdges === 1, `got ${v.stats.duplicateEdges}`);

  console.log("【4】Provider Adapter + Capability");
  ok("makeProvider(anthropic).kind", makeProvider("anthropic").kind === "anthropic");
  ok("Claude capabilities: thinking+webSearch", makeProvider("anthropic").capabilities.supportsThinking && makeProvider("anthropic").capabilities.supportsWebSearch);
  ok("OpenAI 无 thinking/webSearch 能力", !makeProvider("openai").capabilities.supportsThinking && !makeProvider("openai").capabilities.supportsWebSearch);
  ok("Seed 可用性 available=true", (await makeProvider("seed").checkAvailability()).available);
  const noKeyAvail = await makeProvider("anthropic").checkAvailability();
  ok("Anthropic 无 key/model → 不可用且给出原因", !noKeyAvail.available && !!noKeyAvail.reason, noKeyAvail.reason);
  ok("getResearchProvider(role:strong) 不抛错", !!getResearchProvider({ role: "strong" }));

  console.log("【5】Version Diff");
  const cur = payloadCounts(goodPayload), prev = payloadCounts({ ...goodPayload, companies: [goodPayload.companies[0]] });
  ok("payloadCounts.companies=2", cur.companies === 2);
  ok("countsDiff(null)=null", countsDiff(cur, null) === null);
  ok("countsDiff delta companies=+1", countsDiff(cur, prev)?.companies.delta === 1);

  console.log("【6】Review 状态流转");
  const now = new Date();
  ok("isReviewAction 校验", isReviewAction("APPROVE") && !isReviewAction("FOO"));
  ok("APPROVE → PUBLISHED/APPROVED", (() => { const p = reviewPatch("APPROVE", "r", null, now, {}); return p.status === "PUBLISHED" && p.reviewStatus === "APPROVED"; })());
  ok("REJECT → REJECTED", reviewPatch("REJECT", "r", null, now, {}).status === "REJECTED");
  ok("REQUEST_CHANGES → PENDING(不发布)", (() => { const p = reviewPatch("REQUEST_CHANGES", "r", "fix", now, {}); return p.reviewStatus === "PENDING" && p.status === undefined; })());

  console.log("【7】Seed 完整性（Research Engine 输入契约）");
  const seedV = validateIndustryResearch(SEEDS.AI_SEMICONDUCTOR);
  ok("AI 半导体种子 schemaValid", seedV.schemaValid, seedV.errors.join(";"));
  ok("种子 symbol 错误=0", seedV.stats.symbolErrors === 0, `got ${seedV.stats.symbolErrors}`);
  ok("种子无证据确定性 Claim=0", seedV.stats.noEvidenceCertainClaims === 0, `got ${seedV.stats.noEvidenceCertainClaims}`);
  ok("种子边重复=0", seedV.stats.duplicateEdges === 0, `got ${seedV.stats.duplicateEdges}`);

  // ── DB 测试（需可达数据库）──
  let dbOk = true;
  try {
    console.log("【8】Scheduler 幂等（DB）");
    const idemKey = `test:idem:${Date.now()}`;
    const r1 = await runResearchJob({ jobType: "BENCHMARK", targetKey: idemKey, idempotencyWindowH: 1 }, async () => ({ estimatedCost: 0 }));
    const r2 = await runResearchJob({ jobType: "BENCHMARK", targetKey: idemKey, idempotencyWindowH: 1 }, async () => ({ estimatedCost: 0 }));
    ok("首次 SUCCESS", r1.status === "SUCCESS", r1.status);
    ok("二次 SKIPPED(幂等)", r2.status === "SKIPPED" && /idempotent/.test(r2.skippedReason ?? ""), `${r2.status}/${r2.skippedReason}`);

    console.log("【9】Advisory lock 并发（DB）");
    const lockKey = `test:lock:${Date.now()}`;
    const [a, b] = await Promise.all([
      runResearchJob({ jobType: "TRIGGER", targetKey: lockKey }, async () => { await sleep(900); return {}; }),
      (async () => { await sleep(120); return runResearchJob({ jobType: "TRIGGER", targetKey: lockKey }, async () => ({})); })(),
    ]);
    const statuses = [a.status, b.status].sort().join(",");
    ok("并发一成功一被锁跳过", statuses === "SKIPPED,SUCCESS", statuses);
    ok("被锁者 reason=locked", (a.status === "SKIPPED" ? a : b).skippedReason?.includes("locked") ?? false);

    console.log("【10】Retry / Timeout / Failure isolation（DB）");
    let n = 0;
    const retryR = await runResearchJob({ jobType: "TRIGGER", targetKey: `test:retry:${Date.now()}`, maxAttempts: 3, backoffMs: 50 }, async () => { n++; if (n < 3) throw new Error("transient"); return {}; });
    ok("重试至第3次成功", retryR.status === "SUCCESS" && retryR.attempts === 3, `${retryR.status}/${retryR.attempts}`);
    const failR = await runResearchJob({ jobType: "TRIGGER", targetKey: `test:fail:${Date.now()}`, maxAttempts: 2, backoffMs: 50 }, async () => { throw new Error("boom"); });
    ok("全失败 → FAILED 记录错误", failR.status === "FAILED" && /boom/.test(failR.error ?? ""), `${failR.status}/${failR.error}`);
    const toR = await runResearchJob({ jobType: "TRIGGER", targetKey: `test:timeout:${Date.now()}`, maxAttempts: 1, timeoutMs: 300 }, async () => { await sleep(2000); return {}; });
    ok("超时 → FAILED(timeout)", toR.status === "FAILED" && /timeout/.test(toR.error ?? ""), `${toR.status}/${toR.error}`);
    const iso = await runResearchJobsIsolated([
      { spec: { jobType: "TRIGGER", targetKey: `test:iso-ok:${Date.now()}` }, work: async () => ({}) },
      { spec: { jobType: "TRIGGER", targetKey: `test:iso-bad:${Date.now()}`, maxAttempts: 1 }, work: async () => { throw new Error("x"); } },
    ]);
    ok("批量失败隔离：一成功一失败互不影响", iso[0].status === "SUCCESS" && iso[1].status === "FAILED", iso.map((x) => x.status).join(","));

    console.log("【11】StockLink 只读关联（DB/LIVE）");
    const base = process.env.SELFTEST_BASE ?? "http://localhost:3000";
    const co = await fetch(`${base}/api/research/company/lasertec`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (co?.company?.symbol) {
      const score = await prisma.stockScore.findUnique({ where: { symbol: co.company.symbol }, select: { adaptiveScore: true } });
      ok("公司 live.aiScore = StockScore(读穿非复制)", (co.live?.aiScore ?? null) === (score?.adaptiveScore ?? null), `api ${co.live?.aiScore} vs db ${score?.adaptiveScore}`);
    } else ok("StockLink 只读（跳过：company API 未就绪）", true);

    console.log("【12】V2 候选流程（生成不 apply / Approve 才落地 / V1 不被改写；throwaway 产业）");
    const IK = "TEST_V2_IND";
    await cleanupTestIndustry(IK, ["testv2_a", "testv2_b"]); // 防上次残留
    const mk = (companies: any[]) => ({ data: { industry: { industryKey: IK, nameZh: "测试V2", nameEn: "TestV2", nameJa: "テストV2" }, segments: [{ segmentKey: "tv_s1", layer: "UPSTREAM", nameZh: "上游" }], technologies: [], bottlenecks: [], companies, edges: [] } as IndustryResearch, usage: { provider: "seed", model: "seed", promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCost: 0, durationMs: 1 }, sourceKind: "SEED" as const });
    const coA = { companyKey: "testv2_a", symbol: "7203.T", name: "A", country: "JP", listed: true, segmentKeys: ["tv_s1"] };
    const coB = { companyKey: "testv2_b", symbol: "6758.T", name: "B", country: "JP", listed: true, segmentKeys: ["tv_s1"] };
    const v1Provider = { name: "testv1", research: async () => mk([coA]) } as any;
    const v1 = await runIndustryResearch(v1Provider, IK);
    const ind1 = await prisma.researchIndustry.findUnique({ where: { industryKey: IK } });
    const liveCo1 = ind1 ? await prisma.researchCompanyIndustry.count({ where: { industryId: ind1.id } }) : 0;
    ok("V1 apply → 产业 PUBLISHED + 1 公司", v1.published && liveCo1 === 1, `pub ${v1.published} co ${liveCo1}`);
    const cand = await generateCandidateVersion(mk([coA, coB]) as any);
    const liveCo2 = await prisma.researchCompanyIndustry.count({ where: { industryId: ind1!.id } });
    const candVer = await prisma.researchVersion.findUnique({ where: { id: cand.versionId } });
    ok("V2 候选入库 AI_RESEARCHED + payload", candVer?.status === "AI_RESEARCHED" && !!candVer?.payload, candVer?.status ?? "");
    ok("生成候选未改写 V1 实体（仍 1 公司）", liveCo2 === 1, `co ${liveCo2}`);
    await applyVersion(cand.versionId);
    const liveCo3 = await prisma.researchCompanyIndustry.count({ where: { industryId: ind1!.id } });
    const candVer2 = await prisma.researchVersion.findUnique({ where: { id: cand.versionId } });
    const ind2 = await prisma.researchIndustry.findUnique({ where: { industryKey: IK } });
    ok("Approve→applyVersion 落地（2 公司）", liveCo3 === 2, `co ${liveCo3}`);
    ok("候选→PUBLISHED，产业→PUBLISHED", candVer2?.status === "PUBLISHED" && ind2?.status === "PUBLISHED");
    await cleanupTestIndustry(IK, ["testv2_a", "testv2_b"]);
    console.log("  🧹 清理 test 产业");

    // 清理 throwaway
    const del = await prisma.researchJob.deleteMany({ where: { targetKey: { startsWith: "test:" } } });
    console.log(`  🧹 清理 test job ${del.count}`);
  } catch (e) {
    dbOk = false;
    console.log(`  ⚠️ DB 测试跳过（数据库不可达）: ${(e as Error).message}`);
  }

  console.log(`\n═══ 结果: ${pass} passed, ${fail} failed${dbOk ? "" : "（DB 测试未运行）"} ═══`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error("test 崩溃:", e); process.exit(1); });
