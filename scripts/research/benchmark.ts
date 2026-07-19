// ── Deep Research · 强模型质量基准（P17 Track 2）─────────────────────────────
// 三个产业在【同一 source pack · 同一 schema · 同一审核口径】下对比可用强模型：
//   AI 半导体（对人工核验种子做真值比对）· AI HBM · AI 医疗。
// 12 指标 + 合格门槛。自动指标由本脚本算；人审指标标 PENDING → Review Center 终判。
// ⚠️ 未达门槛禁 Phase 5 批量。达标后选质量最佳且成本可接受者作 RESEARCH_STRONG_MODEL。
// 用法: npx tsx scripts/research/benchmark.ts [--providers=anthropic,openai] [--industry=AI_HBM]
//   密钥仅从 .env 读取；不打印密钥。
import "dotenv/config";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { makeProvider, type ProviderKind, type ProviderRunResult } from "../../lib/research/providers";
import { SEEDS } from "../../lib/research/provider-seed";
import type { IndustryResearch } from "../../lib/research/types";

// 基准产业 + source pack（同一份，公平；先留占位，接强模型/填证据源前基准仅验证管线）。
// hasSeedRef=true 的产业用人工核验种子作真值比对（AI 半导体质量对比）。
const BENCH: { key: string; label: string; sourcePack: string; seedRef?: boolean }[] = [
  { key: "AI_SEMICONDUCTOR", label: "AI 半导体（对种子真值）", sourcePack: "", seedRef: true },
  { key: "AI_HBM", label: "AI HBM（高带宽存储）", sourcePack: "" },
  { key: "AI_MEDICAL", label: "AI 医疗", sourcePack: "" },
];

const MATERIAL_TYPES = new Set(["SHARE", "MOAT", "CHOKEPOINT", "ROADMAP", "CAPACITY"]);
type Claim = { claimType?: string; importance?: number; confidence?: string; evidence?: unknown[]; statement?: string };
type Co = { symbol?: string | null; listed?: boolean; companyKey?: string };
const isMaterial = (c: Claim) => (c.importance ?? 0) >= 7 || MATERIAL_TYPES.has(String(c.claimType ?? "").toUpperCase());
function allClaims(d: IndustryResearch): Claim[] {
  const out: Claim[] = [];
  const push = (arr?: { claims?: Claim[] }[]) => { for (const x of arr ?? []) for (const c of x.claims ?? []) out.push(c); };
  push(d.companies as { claims?: Claim[] }[]); push(d.technologies as { claims?: Claim[] }[]); push(d.bottlenecks as { claims?: Claim[] }[]);
  return out;
}

// AI 半导体：候选 vs 种子真值 → 实体召回/代码正确/多出实体(幻觉代理)
function compareToSeed(cand: IndustryResearch, seed: IndustryResearch) {
  const seedSyms = new Set((seed.companies as Co[]).filter((c) => c.listed && c.symbol).map((c) => c.symbol!));
  const candSyms = new Set((cand.companies as Co[]).filter((c) => c.listed && c.symbol).map((c) => c.symbol!));
  const recalled = [...seedSyms].filter((s) => candSyms.has(s)).length;
  const extra = [...candSyms].filter((s) => !seedSyms.has(s)).length; // 种子外的上市代码 → 需人审确认非幻觉
  return {
    seedListed: seedSyms.size, candListed: candSyms.size,
    entityRecall: seedSyms.size ? +(recalled / seedSyms.size * 100).toFixed(1) : null,
    extraListedVsSeed: extra,
  };
}

function computeMetrics(r: ProviderRunResult, seedRef?: IndustryResearch) {
  const d = r.data, v = r.validation, claims = allClaims(d);
  const material = claims.filter(isMaterial);
  const materialWithEv = material.filter((c) => (c.evidence?.length ?? 0) > 0).length;
  const stmts = claims.map((c) => (c.statement ?? "").trim()).filter(Boolean);
  const dupStmts = stmts.length - new Set(stmts).size;
  return {
    "01_实体识别准确率": seedRef ? compareToSeed(d, seedRef).entityRecall : "PENDING(reviewer)",
    "02_Claim可验证率": "PENDING(reviewer)",
    "03_Evidence覆盖率(重大Claim)": material.length ? +(materialWithEv / material.length * 100).toFixed(1) : null,
    "04_无证据确定性Claim比例": v.stats.claims ? +(v.stats.noEvidenceCertainClaims / v.stats.claims * 100).toFixed(1) : 0,
    "05_公司技术关系准确率": "PENDING(reviewer)",
    "06_重复内容比例": { edgeDupRate: v.stats.edges ? +(v.stats.duplicateEdges / v.stats.edges * 100).toFixed(1) : 0, claimDupRate: stmts.length ? +(dupStmts / stmts.length * 100).toFixed(1) : 0 },
    "07_幻觉数量": seedRef ? { extraListedVsSeed: compareToSeed(d, seedRef).extraListedVsSeed, note: "需人审确认是否幻觉" } : "PENDING(reviewer)",
    "08_Reviewer修改量": "PENDING(reviewer)",
    "09_Token": r.usage.totalTokens,
    "10_成本USD": r.usage.estimatedCost,
    "11_总耗时ms": r.usage.durationMs,
    "12_最终可发布率": "PENDING(reviewer,审核后)",
    _seedCompare: seedRef ? compareToSeed(d, seedRef) : undefined,
    _capabilitiesEnabled: r.enabled,
    _stats: v.stats,
  };
}

function gate(r: ProviderRunResult) {
  const claims = allClaims(r.data), v = r.validation;
  const material = claims.filter(isMaterial);
  const cov = material.length ? material.filter((c) => (c.evidence?.length ?? 0) > 0).length / material.length * 100 : 0;
  const edgeDup = v.stats.edges ? v.stats.duplicateEdges / v.stats.edges * 100 : 0;
  return [
    { name: "重大Claim证据覆盖率≥95%", pass: cov >= 95, value: `${cov.toFixed(1)}%`, auto: true },
    { name: "无证据确定性Claim=0", pass: v.stats.noEvidenceCertainClaims === 0, value: String(v.stats.noEvidenceCertainClaims), auto: true },
    { name: "公司股票代码错误=0", pass: v.stats.symbolErrors === 0, value: String(v.stats.symbolErrors), auto: true },
    { name: "Schema validation=100%", pass: v.schemaValid, value: v.schemaValid ? "100%" : `errors: ${v.errors.join("; ")}`, auto: true },
    { name: "关系边重复率<2%", pass: edgeDup < 2, value: `${edgeDup.toFixed(1)}%`, auto: true },
    { name: "明确事实幻觉=0", pass: null, value: "PENDING(reviewer)", auto: false },
    { name: "人审后可发布Claim≥85%", pass: null, value: "PENDING(reviewer)", auto: false },
  ];
}

async function main() {
  const args = process.argv.slice(2);
  const provArg = args.find((a) => a.startsWith("--providers="))?.split("=")[1];
  const indArg = args.find((a) => a.startsWith("--industry="))?.split("=")[1];
  const kinds = (provArg?.split(",") ?? [process.env.RESEARCH_PROVIDER ?? "anthropic"]) as ProviderKind[];
  const industries = indArg ? BENCH.filter((b) => b.key === indArg) : BENCH;

  console.log("═══ Deep Research 强模型质量基准 ═══");
  console.log(`产业: ${industries.map((i) => i.key).join(", ")}  |  providers: ${kinds.join(", ")}\n`);

  const report: Record<string, unknown>[] = [];
  for (const ind of industries) {
    if (!ind.sourcePack) console.log(`⚠️  ${ind.key} source pack 为空——接强模型/填证据源前基准仅验证管线，不作数。`);
    for (const kind of kinds) {
      const prov = makeProvider(kind);
      console.log(`   capabilities[${kind}]: ${JSON.stringify(prov.capabilities)}`);
      const avail = await prov.checkAvailability();
      if (!avail.available) { console.log(`⏭  [${ind.key}] ${kind} 不可用: ${avail.reason}`); report.push({ industry: ind.key, provider: kind, model: avail.model, skipped: true, reason: avail.reason }); continue; }
      console.log(`▶  [${ind.key}] ${kind}:${avail.model} 生成中…`);
      try {
        const r = await prov.run(ind.key, { sourcePack: ind.sourcePack });
        const metrics = computeMetrics(r, ind.seedRef ? SEEDS[ind.key] : undefined);
        const gates = gate(r);
        const autoFail = gates.filter((g) => g.auto && g.pass === false);
        console.log(`   ✅ tokens ${r.usage.totalTokens} | $${r.usage.estimatedCost} | ${(r.usage.durationMs / 1000).toFixed(1)}s | thinking:${r.enabled.thinking} search:${r.enabled.webSearch} | 自动门槛: ${autoFail.length ? "❌ " + autoFail.map((g) => g.name).join(",") : "全过"}`);
        report.push({ industry: ind.key, provider: kind, model: avail.model, capabilities: prov.capabilities, metrics, gates, usage: r.usage, validation: r.validation, rawLength: r.raw.length });
      } catch (e) { console.log(`   ❌ 失败(隔离): ${(e as Error).message}`); report.push({ industry: ind.key, provider: kind, model: avail.model, error: (e as Error).message }); }
    }
  }
  const dir = join(process.cwd(), "reports"); mkdirSync(dir, { recursive: true });
  const path = join(dir, `research-benchmark-${industries.map((i) => i.key).join("_")}.json`);
  writeFileSync(path, JSON.stringify({ generatedAt: new Date().toISOString(), report }, null, 2));
  console.log(`\n📄 报告: ${path}`);
  console.log("提示: 人审指标(可验证率/关系准确率/可发布率)由 Review Center 终判。");
}
main().catch((e) => { console.error("benchmark 失败:", e); process.exit(1); });
