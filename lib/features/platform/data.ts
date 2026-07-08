// ── TOHOSHOU AI · Feature Platform 数据加载（P6-T10）─────────────────────────
// 统一从 DB 读取评估所需真实数据（FactorAlphaResult / 覆盖率 / 上游诊断），供
// Feature Promotion API、Platform Report 脚本、Platform API 共用（单一来源，避免漂移）。
// **只读 · 不写任何表 · 不触碰评分/推荐。** prisma 依赖注入（API 单例 / 脚本实例通用）。

import type { PrismaClient } from "@prisma/client";
import { getAllFeatures } from "../registry";
import { ALPHA_COVERAGE_COLUMNS } from "../promotion/factor-map";
import type { FactorAlphaRow } from "../promotion/factor-alpha";
import type { ShadowDiagInputs } from "../promotion/shadow-diagnostics";
import type { EvaluateDeps } from "./evaluate";

export interface PlatformMeta {
  coverageAsOf: string | null;
  factorAlphaComputedAt: string | null;
  factorAlphaAgeDays: number | null;
  factorAlphaRowCount: number;
}

/** 加载全量评估依赖 + 元信息。 */
export async function loadEvaluateDeps(prisma: PrismaClient, nowMs: number): Promise<{ deps: EvaluateDeps; meta: PlatformMeta }> {
  const features = getAllFeatures();

  // 1) Factor Alpha 真实回测行
  const rawRows = await prisma.factorAlphaResult.findMany();
  const factorRowsByFeature = new Map<string, FactorAlphaRow[]>();
  let maxComputedAt: Date | null = null;
  for (const r of rawRows) {
    const arr = factorRowsByFeature.get(r.featureId) ?? [];
    arr.push({
      featureId: r.featureId, horizon: r.horizon, alpha: r.alpha, avgReturn: r.avgReturn,
      benchReturn: r.benchReturn, hitRate: r.hitRate, rankIc: r.rankIc, cohortSize: r.cohortSize,
      sampleCount: r.sampleCount, asOfCount: r.asOfCount,
      asOfLatest: r.asOfLatest ? r.asOfLatest.toISOString().slice(0, 10) : null,
    });
    factorRowsByFeature.set(r.featureId, arr);
    if (!maxComputedAt || r.computedAt > maxComputedAt) maxComputedAt = r.computedAt;
  }

  // 2) 覆盖率（latest AlphaFactor 各列非空占比）
  const latest = await prisma.alphaFactor.findFirst({ orderBy: { date: "desc" }, select: { date: true } });
  const coverageByColumn = new Map<string, number>();
  let coverageAsOf: string | null = null;
  if (latest) {
    coverageAsOf = latest.date.toISOString().slice(0, 10);
    const total = await prisma.alphaFactor.count({ where: { date: latest.date } });
    if (total > 0) {
      const counts = await Promise.all(ALPHA_COVERAGE_COLUMNS.map((col) =>
        prisma.alphaFactor.count({ where: { date: latest.date, [col]: { not: null } } as Record<string, unknown> })));
      ALPHA_COVERAGE_COLUMNS.forEach((col, i) => coverageByColumn.set(col, Math.round((counts[i] / total) * 1000) / 10));
    }
  }

  // 3) Shadow 诊断的上游实测覆盖率
  const cutoff90 = new Date(nowMs - 90 * 86400 * 1000);
  const [aiEnabled, finStocks, instDates, tdnetN] = await Promise.all([
    prisma.stock.count({ where: { aiEnabled: true } }),
    prisma.financial.findMany({ distinct: ["stockId"], select: { stockId: true } }),
    prisma.institutionalFlow.findMany({ distinct: ["date"], select: { date: true } }),
    prisma.disclosure.count({ where: { publishedAt: { gte: cutoff90 } } }),
  ]);
  const diagInputs: ShadowDiagInputs = {
    financialCoverage: aiEnabled > 0 ? Math.min(100, Math.round((finStocks.length / aiEnabled) * 1000) / 10) : null,
    instWeeks: instDates.length,
    tdnetTriggerCount: tdnetN,
    shortSellCoverage: null,
  };

  const ageDays = maxComputedAt ? Math.floor((nowMs - maxComputedAt.getTime()) / 86400000) : null;
  return {
    deps: { features, factorRowsByFeature, coverageByColumn, diagInputs },
    meta: {
      coverageAsOf,
      factorAlphaComputedAt: maxComputedAt ? maxComputedAt.toISOString() : null,
      factorAlphaAgeDays: ageDays,
      factorAlphaRowCount: rawRows.length,
    },
  };
}
