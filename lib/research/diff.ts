// ── Deep Research · 版本 Diff（P17 收尾）· 共享纯函数，供 version API 与测试复用 ──
export type PayloadCounts = { segments: number; technologies: number; companies: number; bottlenecks: number; edges: number };

export function payloadCounts(payload: unknown): PayloadCounts {
  const d = (payload ?? {}) as Record<string, unknown[]>;
  const n = (k: string) => (Array.isArray(d[k]) ? d[k].length : 0);
  return { segments: n("segments"), technologies: n("technologies"), companies: n("companies"), bottlenecks: n("bottlenecks"), edges: n("edges") };
}

export function countsDiff(cur: PayloadCounts, prev: PayloadCounts | null): Record<string, { prev: number; cur: number; delta: number }> | null {
  if (!prev) return null;
  return Object.fromEntries((Object.keys(cur) as (keyof PayloadCounts)[]).map((k) => [k, { prev: prev[k], cur: cur[k], delta: cur[k] - prev[k] }]));
}
