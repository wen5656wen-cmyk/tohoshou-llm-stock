#!/usr/bin/env npx tsx
// Deep Research · 运行一条产业线的深研（Golden Path/LLM）
// 用法: npx tsx scripts/research/run-industry.ts AI_SEMICONDUCTOR         (seed)
//       npx tsx scripts/research/run-industry.ts AI_DATACENTER --llm      (LLM)
import "dotenv/config";
import { runIndustryResearch } from "../../lib/research/engine";
import { SeedResearchProvider } from "../../lib/research/provider-seed";
import { OpenAiResearchProvider } from "../../lib/research/llm";

async function main() {
  const industryKey = process.argv[2] || "AI_SEMICONDUCTOR";
  const useLlm = process.argv.includes("--llm");
  const provider = useLlm ? new OpenAiResearchProvider() : new SeedResearchProvider();
  console.log(`▶ Deep Research: ${industryKey} · provider=${provider.name}`);
  const t0 = Date.now();
  const summary = await runIndustryResearch(provider, industryKey);
  console.log(`✅ 完成 (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}
main().catch((e) => { console.error("❌ 失败:", e?.message ?? e); process.exit(1); });
