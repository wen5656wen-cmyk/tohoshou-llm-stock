// Deep Research（深度研究）首页 · P17 Phase 4
import { Suspense } from "react";
import DeepResearchHome from "@/components/research/deep/DeepResearchHome";

export const dynamic = "force-dynamic";

export default function DeepResearchPage() {
  return (
    <Suspense>
      <DeepResearchHome />
    </Suspense>
  );
}
