// ── Deep Research V2 · 运行前只读预检 / V1 checksum（P17 V2）──────────────────
// 只读：模型可用性(models.list) + V1 状态 + V1 checksum。不生成、禁 mock、禁 fallback。
// 用法: npx tsx scripts/research/v2-preflight.ts            # 完整预检
//       npx tsx scripts/research/v2-preflight.ts --checksum # 仅打印 V1 checksum（run 前后对比）
import "dotenv/config";
import { createHash } from "crypto";
import { prisma } from "../../lib/prisma";
import { getResearchProvider } from "../../lib/research/providers";

const KEY = "AI_SEMICONDUCTOR";

// V1 live 实体确定性 checksum（证明 run 前后 V1 未变）
async function v1Checksum() {
  const ind = await prisma.researchIndustry.findUnique({ where: { industryKey: KEY } });
  if (!ind) return { exists: false as const };
  const [coLinks, techs, bns, publishedVer] = await Promise.all([
    prisma.researchCompanyIndustry.findMany({ where: { industryId: ind.id }, include: { company: { select: { id: true, companyKey: true, symbol: true } } } }),
    prisma.researchTechnology.findMany({ where: { industryId: ind.id }, select: { id: true, techKey: true } }),
    prisma.researchBottleneck.findMany({ where: { industryId: ind.id }, select: { id: true, name: true } }),
    prisma.researchVersion.findFirst({ where: { entityType: "INDUSTRY", entityId: ind.id, status: "PUBLISHED" }, orderBy: { generatedAt: "desc" }, select: { id: true, version: true, status: true } }),
  ]);
  const coIds = [...new Set(coLinks.map((c) => c.company.id))];
  const entityIds = [ind.id, ...coIds, ...techs.map((t) => t.id), ...bns.map((b) => b.id)];
  const claims = await prisma.researchClaim.findMany({ where: { entityId: { in: entityIds } }, include: { evidence: { select: { sourceTitle: true } } }, orderBy: { statement: "asc" } });
  const edges = await prisma.researchGraphEdge.count({ where: { industryId: ind.id } });
  const symbols = [...new Set(coLinks.map((c) => c.company.symbol).filter(Boolean))].sort();
  const canonical = JSON.stringify({
    status: ind.status, currentVer: ind.currentVer,
    companyKeys: [...new Set(coLinks.map((c) => c.company.companyKey))].sort(),
    symbols, techKeys: techs.map((t) => t.techKey).sort(), bottlenecks: bns.map((b) => b.name).sort(),
    claimStatements: claims.map((c) => c.statement).sort(),
    evidenceCount: claims.reduce((n, c) => n + c.evidence.length, 0), edges,
  });
  return {
    exists: true as const, status: ind.status, currentVer: ind.currentVer,
    publishedVersionId: publishedVer?.id ?? null, publishedVersion: publishedVer?.version ?? null,
    counts: { companies: coIds.length, technologies: techs.length, bottlenecks: bns.length, claims: claims.length, evidence: claims.reduce((n, c) => n + c.evidence.length, 0), edges },
    sha256: createHash("sha256").update(canonical).digest("hex"),
  };
}

async function main() {
  const checksumOnly = process.argv.includes("--checksum");
  if (checksumOnly) { console.log(JSON.stringify(await v1Checksum())); process.exit(0); }

  console.log("═══ Deep Research V2 · 运行前只读预检 ═══\n");
  console.log("① 配置（非密钥）:");
  console.log(`   RESEARCH_PROVIDER = ${process.env.RESEARCH_PROVIDER ?? "(未设)"}`);
  console.log(`   RESEARCH_STRONG_MODEL = ${process.env.RESEARCH_STRONG_MODEL ?? "(未设)"}`);
  console.log(`   OPENAI_API_KEY 已配置? ${!!process.env.OPENAI_API_KEY}`);
  console.log(`   ANTHROPIC 本轮禁用，已配置? ${!!process.env.ANTHROPIC_API_KEY}（应为 false 不影响）`);

  const provider = getResearchProvider({ role: "strong" });
  console.log(`\n② Provider Adapter: kind=${provider.kind}  model=${provider.model}`);
  if (provider.kind !== "openai") { console.log("   ❌ provider 非 openai，停止。"); process.exit(1); }
  if (provider.model !== "gpt-5.6-sol") { console.log(`   ❌ model 非 gpt-5.6-sol（实为 ${provider.model}），停止。`); process.exit(1); }

  console.log("\n③ 模型可用性（OpenAI models.list 只读）:");
  const avail = await provider.checkAvailability();
  console.log(`   available = ${avail.available}`);
  if (avail.reason) console.log(`   reason = ${avail.reason}`);
  if (avail.models) {
    const total = avail.models.length;
    const hit = avail.models.includes("gpt-5.6-sol");
    const sample = avail.models.filter((m) => /gpt-5|sol|gpt-4|o[1-9]/i.test(m)).slice(0, 25);
    console.log(`   账号可用模型数 = ${total}  |  含 gpt-5.6-sol? ${hit}`);
    console.log(`   相关模型样例 = ${JSON.stringify(sample)}`);
  }

  console.log("\n④ V1 状态 + checksum:");
  const cs = await v1Checksum();
  if (!cs.exists) { console.log("   ❌ AI_SEMICONDUCTOR 不存在，停止。"); process.exit(1); }
  console.log(`   status = ${cs.status}  currentVer = ${cs.currentVer}  publishedVersionId = ${cs.publishedVersionId}`);
  console.log(`   counts = ${JSON.stringify(cs.counts)}`);
  console.log(`   V1 sha256 = ${cs.sha256}`);

  const canRun = avail.available && cs.status === "PUBLISHED";
  console.log(`\n═══ 预检结论: ${canRun ? "✅ 可执行真实 Benchmark" : "⛔ 停止（见上）"} ═══`);
  if (!canRun) process.exit(2);
}
main().catch((e) => { console.error("preflight 崩溃:", e); process.exit(1); });
