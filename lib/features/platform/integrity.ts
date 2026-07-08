// ── TOHOSHOU AI · Production Integrity Check（P6-T10 · T10.4）───────────────
// 每日检查 Feature Platform 链路：Registry → Shadow → Backtest → Factor Alpha →
// Promotion → Production，检测 Missing / Duplicate / Broken Link / Missing Alpha /
// Stale，输出 Integrity Score（0-100）。**纯函数 · 只读 · 不修改任何数据/评分。**

import { FEATURE_STATUSES, FEATURE_CATEGORIES, type Feature } from "../types";
import { FEATURE_TO_ALPHA_COLUMN, FEATURE_TO_ALPHA_FACTOR } from "../promotion/factor-map";
import type { EvaluatedFeature } from "./evaluate";

export type IntegritySeverity = "CRITICAL" | "WARNING" | "INFO";
export interface IntegrityIssue {
  code: string;            // DUPLICATE_ID / MISSING_FIELD / BROKEN_LINK / MISSING_ALPHA / STALE_ALPHA / NO_RECOMMENDATION
  severity: IntegritySeverity;
  detail: string;
}

export interface IntegrityResult {
  integrityScore: number;  // 0-100
  issues: IntegrityIssue[];
  checks: { name: string; ok: boolean; note: string }[];
  chain: { registry: number; shadow: number; backtest: number; factorAlpha: number; promotion: number; production: number };
}

const DEDUCT: Record<IntegritySeverity, number> = { CRITICAL: 20, WARNING: 6, INFO: 1 };

/**
 * @param features Registry 全量
 * @param rows 统一评估行（evaluateFeatures 产出）
 * @param opts.factorAlphaFreshDays FactorAlphaResult 新鲜阈值（天）；超过 → STALE_ALPHA
 * @param opts.factorAlphaAgeDays 实测 FactorAlphaResult 距今天数（null=无数据）
 */
export function checkIntegrity(
  features: Feature[],
  rows: EvaluatedFeature[],
  opts: { factorAlphaAgeDays: number | null; factorAlphaFreshDays?: number } = { factorAlphaAgeDays: null },
): IntegrityResult {
  const issues: IntegrityIssue[] = [];
  const checks: { name: string; ok: boolean; note: string }[] = [];
  const add = (name: string, ok: boolean, note: string, issue?: IntegrityIssue) => {
    checks.push({ name, ok, note });
    if (!ok && issue) issues.push(issue);
  };

  // 1) Registry：重复 id
  const ids = new Map<string, number>();
  for (const f of features) ids.set(f.id, (ids.get(f.id) ?? 0) + 1);
  const dups = [...ids.entries()].filter(([, n]) => n > 1).map(([id]) => id);
  add("Registry 无重复 id", dups.length === 0, dups.length ? `重复: ${dups.join(",")}` : `${features.length} 个唯一 id`,
    dups.length ? { code: "DUPLICATE_ID", severity: "CRITICAL", detail: `重复 Feature id: ${dups.join(",")}` } : undefined);

  // 2) Registry：字段完整 + 枚举合法
  const bad = features.filter((f) => !f.id || !f.name || !FEATURE_CATEGORIES.includes(f.category) || !FEATURE_STATUSES.includes(f.status) || !f.source);
  add("Registry 字段完整", bad.length === 0, bad.length ? `异常: ${bad.map((b) => b.id).join(",")}` : "全部合法",
    bad.length ? { code: "MISSING_FIELD", severity: "CRITICAL", detail: `字段缺失/非法: ${bad.map((b) => b.id).join(",")}` } : undefined);

  // 3) Broken Link：factor-map 引用的因子必须存在于 Registry
  const idSet = new Set(features.map((f) => f.id));
  const brokenLinks = [...Object.keys(FEATURE_TO_ALPHA_FACTOR), ...Object.keys(FEATURE_TO_ALPHA_COLUMN)].filter((k) => !idSet.has(k));
  const uniqBroken = [...new Set(brokenLinks)];
  add("Factor-map 无断链", uniqBroken.length === 0, uniqBroken.length ? `断链: ${uniqBroken.join(",")}` : "全部指向有效因子",
    uniqBroken.length ? { code: "BROKEN_LINK", severity: "CRITICAL", detail: `factor-map 引用不存在的因子: ${uniqBroken.join(",")}` } : undefined);

  // 4) Missing Alpha：应可回测（有 factor-map 映射）的因子必须有 FactorAlphaResult
  const mappable = features.filter((f) => FEATURE_TO_ALPHA_COLUMN[f.id] != null);
  const missingAlpha = mappable.filter((f) => {
    const r = rows.find((x) => x.id === f.id);
    return !r || r.factorAlpha == null;
  });
  add("可回测因子均有 Factor Alpha", missingAlpha.length === 0, missingAlpha.length ? `缺 alpha: ${missingAlpha.map((f) => f.id).join(",")}` : `${mappable.length}/${mappable.length} 有回测`,
    missingAlpha.length ? { code: "MISSING_ALPHA", severity: "WARNING", detail: `映射因子缺 FactorAlphaResult: ${missingAlpha.map((f) => f.id).join(",")}` } : undefined);

  // 5) Factor Alpha 新鲜度（T10.1 自动化的健康信号）
  const freshDays = opts.factorAlphaFreshDays ?? 2;
  const age = opts.factorAlphaAgeDays;
  const fresh = age != null && age <= freshDays;
  add("Factor Alpha 新鲜", fresh, age == null ? "无 FactorAlphaResult" : `距今 ${age} 天`,
    !fresh ? { code: "STALE_ALPHA", severity: age == null ? "CRITICAL" : "WARNING", detail: age == null ? "FactorAlphaResult 为空（cron 未运行？）" : `FactorAlphaResult 距今 ${age} 天 > ${freshDays}（cron 可能漏跑）` } : undefined);

  // 6) Promotion：非 pending 的影子/停用因子必须有 recommendation；pending 必须有原因码
  const noRec = rows.filter((r) => r.status !== "PRODUCTION" && !r.pending && r.recommendation == null);
  add("非 pending 候选均有建议", noRec.length === 0, noRec.length ? `无建议: ${noRec.map((r) => r.id).join(",")}` : "全部有建议",
    noRec.length ? { code: "NO_RECOMMENDATION", severity: "WARNING", detail: `缺 recommendation: ${noRec.map((r) => r.id).join(",")}` } : undefined);
  const noReason = rows.filter((r) => r.pending && !r.pendingReasonCode);
  add("Pending 均有原因码", noReason.length === 0, noReason.length ? `缺原因: ${noReason.map((r) => r.id).join(",")}` : "全部有原因码",
    noReason.length ? { code: "MISSING_PENDING_REASON", severity: "INFO", detail: `pending 缺原因码: ${noReason.map((r) => r.id).join(",")}` } : undefined);

  const integrityScore = Math.max(0, Math.round((100 - issues.reduce((s, i) => s + DEDUCT[i.severity], 0)) * 10) / 10);

  const chain = {
    registry: features.length,
    shadow: rows.filter((r) => r.status === "SHADOW").length,
    backtest: rows.filter((r) => r.factorAlpha != null).length,
    factorAlpha: mappable.length - missingAlpha.length,
    promotion: rows.filter((r) => r.recommendation != null).length,
    production: rows.filter((r) => r.status === "PRODUCTION").length,
  };

  return { integrityScore, issues, checks, chain };
}
