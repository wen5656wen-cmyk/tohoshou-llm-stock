// ─────────────────────────────────────────────────────────────────────────────
// P26 Phase 3 · Strategy Registry 读取（#3）。CURRENT 策略从 registry.json 读，**不硬编码**。
// 换 CURRENT 策略即换 strategyId/version/historyKey，运行时无需改动。
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from "fs";
import { join } from "path";

export interface StrategyEntry {
  id: string;
  name: string;
  nameJa?: string;
  version: string;
  isCurrent?: boolean;
  researchStatus: string;
  validationStatus: string;
  dataset?: string;
  historyKey?: string;
  targetPct?: number;
}

const REGISTRY_PATH = join(process.cwd(), "research", "minute", "core_daily", "registry.json");

export function loadRegistry(): StrategyEntry[] {
  const raw = JSON.parse(readFileSync(REGISTRY_PATH, "utf-8")) as { strategies: StrategyEntry[] };
  return raw.strategies;
}

/** 当前 CURRENT 策略（全局唯一 isCurrent=true）。找不到则抛错（禁默认硬编码）。 */
export function getCurrentStrategy(): StrategyEntry {
  const cur = loadRegistry().find((s) => s.isCurrent === true);
  if (!cur) throw new Error("REGISTRY_NO_CURRENT_STRATEGY");
  return cur;
}
