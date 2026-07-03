// freeze.ts — V3 Shadow Freeze 配置（P3-T4）
// 冻结期：停止一切算法修改，仅自动收集真实前向证据。到期做最终上线评审。

export const FREEZE = {
  version: "V3 Shadow Freeze v1",
  commit: "ca95896",
  startDate: "2026-07-03", // Freeze 开始（本次部署）
  endDate: "2026-07-10",   // 下周五 最终评审
  targetReadiness: 90,
} as const;

// 距 startDate 的第几天（含当天=第1天）。needs a "now" ISO from caller (server side).
export function freezeDay(nowIso: string): number {
  const start = new Date(`${FREEZE.startDate}T00:00:00.000Z`).getTime();
  const now = new Date(nowIso).getTime();
  return Math.max(1, Math.floor((now - start) / 86400000) + 1);
}
export function freezeTotalDays(): number {
  const s = new Date(`${FREEZE.startDate}T00:00:00.000Z`).getTime();
  const e = new Date(`${FREEZE.endDate}T00:00:00.000Z`).getTime();
  return Math.round((e - s) / 86400000);
}
export function isFreezeOver(nowIso: string): boolean {
  return new Date(nowIso).getTime() >= new Date(`${FREEZE.endDate}T00:00:00.000Z`).getTime();
}
