// Deep Research · 审核中心（P17 Track 1）
import { Suspense } from "react";
import ReviewCenter from "@/components/research/deep/ReviewCenter";

export const dynamic = "force-dynamic";

export default function ResearchReviewPage() {
  return (
    <Suspense>
      <ReviewCenter />
    </Suspense>
  );
}
