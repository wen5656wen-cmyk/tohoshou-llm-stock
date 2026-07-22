// Deep Research · 审核中心（P17 Track 1）
import { Suspense } from "react";
import BetaAccessGate from "@/components/beta/BetaAccessGate";
import ReviewCenter from "@/components/research/deep/ReviewCenter";

export const dynamic = "force-dynamic";

export default function ResearchReviewPage() {
  return (
    <BetaAccessGate>
      <Suspense>
        <ReviewCenter />
      </Suspense>
    </BetaAccessGate>
  );
}
