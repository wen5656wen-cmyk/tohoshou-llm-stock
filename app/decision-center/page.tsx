// P7-02B-2：决策中心 Tab 容器页。useSearchParams 需 Suspense 边界。
import { Suspense } from "react";
import DecisionCenterHub from "@/components/decision/DecisionCenterHub";

export const dynamic = "force-dynamic";

export default function DecisionCenterPage() {
  return (
    <Suspense>
      <DecisionCenterHub />
    </Suspense>
  );
}
