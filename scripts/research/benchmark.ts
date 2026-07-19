// ── Deep Research · 强模型质量基准（P17 Track 2）─────────────────────────────
// 两个差异明显的产业（AI HBM / AI 医疗）在【同一 source pack · 同一 schema · 同一审核口径】下
// 对比可用强模型，产出 12 项指标 + 合格门槛判定。自动指标由本脚本算；人审指标标 PENDING，待 Review Center。
// ⚠️ 未达门槛禁批量生成其余产业。达标后选质量最佳且成本可接受者作 RESEARCH_STRONG_MODEL。
// 用法: npx tsx scripts/research/benchmark.ts [--providers=anthropic,openai] [--industry=AI_HBM]
//   密钥仅从 .env 读取；不打印密钥。
import "dotenv/config";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { makeProvider, validateIndustryResearch, type ProviderKind, type ProviderRunResult } from "../../lib/research/providers";
import type { IndustryResearch } from "../../lib/research/types";

// ── 基准产业 + source pack（同一份，保证公平；先留占位，接强模型前由人工/检索填充）──
const BENCH: { key: string; label: string; sourcePack: string }[] = [
  { key: "AI_HBM", label: "AI HBM（高带宽存储）", sourcePack: "" },
  { key: "AI_MEDICAL", label: "AI 医疗", sourcePack: "" },
];

const MATERIAL_TYPES = new Set(["SHARE", "MOAT", "CHOKEPOINT", "ROADMAP", "CAPACITY"]);
function isMaterial(cl: { claimType?: string; importance?: number }): boolean {
  return (cl.importance ?? 0) >= 7 || MATERIAL_TYPES.has(String(cl.claimType ?? "").toUpperCase());
}
function allClaims(d: IndustryResearch): { claimType?: string; importance?: number; confidence?: string; evidence?: unknown[]; statement?: string }[] {
  const out: { claimType?: string; importance?: number; confidence?: string; evidence?: unknown[]; statement?: string }[] = [];
  const push = (arr?: { claims?: typeof out }[]) => { for (const x of arr ?? []) for (const c of x.claims ?? []) out.push(c); };
  push(d.companies); push(d.technologies); push(d.bottlenecks);
  return out;
}

// ── 12 项指标（自动可算=数值；人审=PENDING）──
function computeMetrics(r: ProviderRunResult) {
  const d = r.data; const v = r.validation; const claims = allClaims(d);
  const material = claims.filter(isMaterial);
  const materialWithEv = material.filter((c) => (c.evidence?.length ?? 0) > 0).length;
  const stmts = claims.map((c) => (c.statement ?? "").trim()).filter(Boolean);
  const dupStmts = stmts.length - new Set(stmts).size;
  return {
    // 自动
    "01_实体识别准确率": "PENDING(reviewer)",
    "02_Claim可验证率": "PENDING(reviewer)",
    "03_Evidence覆盖率(重大Claim)": material.length ? +(materialWithEv / material.length * 100).toFixed(1) : null,
    "04_无证据确定性Claim比例": v.stats.claims ? +(v.stats.noEvidenceCertainClaims / v.stats.claims * 100).toFixed(1) : 0,
    "05_公司技术关系准确率": "PENDING(reviewer)",
    "06_重复内容比例": {
      edgeDupRate: v.stats.edges ? +(v.stats.duplicateEdges / v.stats.edges * 100).toFixed(1) : 0,
      claimDupRate: stmts.length ? +(dupStmts / stmts.length * 100).toFixed(1) : 0,
    },
    "07_幻觉数量": "PENDING(reviewer)",
    "08_Reviewer修改量": "PENDING(reviewer)",
    "09_Token": r.usage.totalTokens,
    "10_成本USD": r.usage.estimatedCost,
    "11_总耗时ms": r.usage.durationMs,
    "12_最终可发布率": "PENDING(reviewer,审核后)",
    _stats: v.stats,
  };
}

// ── 合格门槛（自动项判定；人审项 PENDING 不阻塞基础设施，接强模型后由 Review Center 终判）──
function gate(r: ProviderRunResult) {
  const d = r.data; const v = r.validation; const claims = allClaims(d);
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
    if (!ind.sourcePack) console.log(`⚠️  ${ind.key} source pack 为空——接强模型/填充证据源前，基准结果不作数（仅验证管线）。`);
    for (const kind of kinds) {
      const prov = makeProvider(kind);
      const avail = await prov.checkAvailability();
      if (!avail.available) {
        console.log(`⏭  [${ind.key}] ${kind} 不可用: ${avail.reason}`);
        report.push({ industry: ind.key, provider: kind, model: avail.model, skipped: true, reason: avail.reason });
        continue;
      }
      console.log(`▶  [${ind.key}] ${kind}:${avail.model} 生成中…`);
      try {
        const r = await prov.run(ind.key, { sourcePack: ind.sourcePack });
        const metrics = computeMetrics(r);
        const gates = gate(r);
        const autoFail = gates.filter((g) => g.auto && g.pass === false);
        console.log(`   ✅ 完成 | tokens ${r.usage.totalTokens} | $${r.usage.estimatedCost} | ${(r.usage.durationMs / 1000).toFixed(1)}s | 自动门槛: ${autoFail.length ? "❌ " + autoFail.map((g) => g.name).join(",") : "全过"}`);
        report.push({ industry: ind.key, provider: kind, model: avail.model, metrics, gates, usage: r.usage, validation: r.validation, rawLength: r.raw.length });
      } catch (e) {
        // 任务失败隔离：单产业/单 provider 失败不影响其它
        console.log(`   ❌ 失败(隔离): ${(e as Error).message}`);
        report.push({ industry: ind.key, provider: kind, model: avail.model, error: (e as Error).message });
      }
    }
  }
  const dir = join(process.cwd(), "reports"); mkdirSync(dir, { recursive: true });
  const path = join(dir, `research-benchmark-${industries.map((i) => i.key).join("_")}.json`);
  writeFileSync(path, JSON.stringify({ generatedAt: new Date().toISOString(), report }, null, 2));
  console.log(`\n📄 报告: ${path}`);
  console.log("提示: 人审指标(实体准确率/可验证率/关系准确率/幻觉/修改量/可发布率)由 Review Center 终判。");
}

main().catch((e) => { console.error("benchmark 失败:", e); process.exit(1); });
