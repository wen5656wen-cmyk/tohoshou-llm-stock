// Deep Research · 研究库（P17 Track 1）
import { Suspense } from "react";
import BetaAccessGate from "@/components/beta/BetaAccessGate";
import LibraryView from "@/components/research/deep/LibraryView";

export const dynamic = "force-dynamic";

export default function ResearchLibraryPage() {
  return (
    <BetaAccessGate>
      <Suspense>
        <LibraryView />
      </Suspense>
    </BetaAccessGate>
  );
}
