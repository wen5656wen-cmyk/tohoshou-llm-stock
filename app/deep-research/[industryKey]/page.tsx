// Deep Research 产业详情 · P17 Phase 4b
import { Suspense } from "react";
import IndustryDetail from "@/components/research/deep/IndustryDetail";

export const dynamic = "force-dynamic";

export default function IndustryDetailPage() {
  return (
    <Suspense>
      <IndustryDetail />
    </Suspense>
  );
}
