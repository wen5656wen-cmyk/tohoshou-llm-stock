// ─────────────────────────────────────────────────────────────────────────────
// P26 Phase 2 · Core Daily Runtime Log（#6）。结构化机器日志，便于排查。
// 运行元数据（开始/结束/耗时/策略版本/数据版本/状态/失败原因）另落 CoreDailyRun 表。
// ─────────────────────────────────────────────────────────────────────────────

export function nowMs(): number {
  return Date.now();
}

export function logCoreDaily(stage: string, data: Record<string, unknown>): void {
  console.log(`[CORE_DAILY] ${stage} ${JSON.stringify(data)}`);
}
