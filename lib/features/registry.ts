// ── TOHOSHOU AI · Feature Registry（P6-T1）──────────────────────────────────
// 对 FEATURE_CATALOG 的只读查询/聚合。**不参与任何计算、不影响任何评分/推荐**。
// 复杂度均为线性扫描——对 200+ Feature 完全够用；若未来到数千级可加 Map 索引（预留）。

import { FEATURE_CATALOG } from "./catalog";
import {
  type Feature, type FeatureCategory, type FeatureSource, type FeatureStatus,
  FEATURE_CATEGORIES, FEATURE_SOURCES,
} from "./types";

/** 全部已登记 Feature。 */
export function getAllFeatures(): Feature[] {
  return FEATURE_CATALOG;
}

/** 按 id 精确查找。 */
export function getFeatureById(id: string): Feature | undefined {
  return FEATURE_CATALOG.find((f) => f.id === id);
}

export function getByCategory(category: FeatureCategory): Feature[] {
  return FEATURE_CATALOG.filter((f) => f.category === category);
}

export function getByStatus(status: FeatureStatus): Feature[] {
  return FEATURE_CATALOG.filter((f) => f.status === status);
}

export function getBySource(source: FeatureSource): Feature[] {
  return FEATURE_CATALOG.filter((f) => f.source === source);
}

/** 状态汇总（供 KPI 卡）。 */
export interface FeatureSummary {
  total: number;
  production: number;
  shadow: number;
  disabled: number;
  categories: number;
  sources: number;
}

export function getSummary(): FeatureSummary {
  const s: FeatureSummary = { total: FEATURE_CATALOG.length, production: 0, shadow: 0, disabled: 0, categories: 0, sources: 0 };
  const cats = new Set<string>();
  const srcs = new Set<string>();
  for (const f of FEATURE_CATALOG) {
    if (f.status === "PRODUCTION") s.production++;
    else if (f.status === "SHADOW") s.shadow++;
    else if (f.status === "DISABLED") s.disabled++;
    cats.add(f.category);
    srcs.add(f.source);
  }
  s.categories = cats.size;
  s.sources = srcs.size;
  return s;
}

/** 分布条目 {key,count}，按数量降序。 */
export interface Distribution {
  key: string;
  count: number;
}

/** 分类分布（含 0 计数的分类，保证 UI 稳定顺序）。 */
export function categoryDistribution(): Distribution[] {
  return FEATURE_CATEGORIES
    .map((c) => ({ key: c as string, count: getByCategory(c).length }))
    .filter((d) => d.count > 0)
    .sort((a, b) => b.count - a.count);
}

/** 来源分布。 */
export function sourceDistribution(): Distribution[] {
  return FEATURE_SOURCES
    .map((s) => ({ key: s as string, count: getBySource(s).length }))
    .filter((d) => d.count > 0)
    .sort((a, b) => b.count - a.count);
}
