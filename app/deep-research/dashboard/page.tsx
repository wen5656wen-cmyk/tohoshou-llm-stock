// Deep Research · 运营看板（P17 Track 1）
import { Suspense } from "react";
import ResearchDashboard from "@/components/research/deep/ResearchDashboard";

export const dynamic = "force-dynamic";

export default function ResearchDashboardPage() {
  return (
    <Suspense>
      <ResearchDashboard />
    </Suspense>
  );
}
