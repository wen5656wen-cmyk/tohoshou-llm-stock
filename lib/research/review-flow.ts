// ── Deep Research · Review 状态流转（P17 收尾）· 纯函数，供 review API 与测试复用 ──
// APPROVE → PUBLISHED（唯有人审通过才发布，防幻觉）；REJECT → REJECTED；REQUEST_CHANGES → 退回 PENDING。
export type ReviewAction = "APPROVE" | "REJECT" | "REQUEST_CHANGES";
export const REVIEW_ACTIONS: ReviewAction[] = ["APPROVE", "REJECT", "REQUEST_CHANGES"];
export function isReviewAction(x: unknown): x is ReviewAction { return REVIEW_ACTIONS.includes(x as ReviewAction); }

export interface ReviewPatch { reviewStatus: string; status?: string; reviewer: string; reviewedAt: Date; publishedAt?: Date; changeReason?: string | null; }

export function reviewPatch(action: ReviewAction, reviewer: string, comment: string | null, now: Date, cur: { publishedAt?: Date | null; changeReason?: string | null }): ReviewPatch {
  if (action === "APPROVE") return { reviewStatus: "APPROVED", status: "PUBLISHED", reviewer, reviewedAt: now, publishedAt: cur.publishedAt ?? now };
  if (action === "REJECT") return { reviewStatus: "REJECTED", status: "REJECTED", reviewer, reviewedAt: now };
  return { reviewStatus: "PENDING", changeReason: comment ?? cur.changeReason ?? null, reviewer, reviewedAt: now };
}
