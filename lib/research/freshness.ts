// ── Deep Research · Research Freshness（P17 补充2）───────────────────────────
// 纯派生：据最近验证时间/审阅状态算新鲜度分 + 下次复核/过期时间。不改数据库计算逻辑。

export interface FreshnessInput {
  lastVerifiedAt?: Date | null;
  status?: string | null; // PUBLISHED 更保鲜
  now?: Date;
}
export interface FreshnessOutput {
  freshnessScore: number; // 0-100
  nextReviewAt: Date; // 建议下次复核（每周）
  staleAfter: Date; // 超过此时间视为 STALE
}

const DAY = 86_400_000;

export function computeFreshness(input: FreshnessInput): FreshnessOutput {
  const now = input.now ?? new Date();
  const verified = input.lastVerifiedAt ?? now;
  const ageDays = Math.max(0, (now.getTime() - verified.getTime()) / DAY);
  // 7 天内近满分，之后线性衰减，30 天封底 0；已发布 +10 保鲜
  let score = Math.round(100 - (ageDays / 30) * 100);
  if (input.status === "PUBLISHED") score += 10;
  score = Math.max(0, Math.min(100, score));
  return {
    freshnessScore: score,
    nextReviewAt: new Date(now.getTime() + 7 * DAY), // Weekly Review
    staleAfter: new Date(verified.getTime() + 30 * DAY),
  };
}
