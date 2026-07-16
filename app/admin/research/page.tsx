// P7-05：研究工作区唯一入口 = 研究综合 Hub（7 顶级 Tab）。useSearchParams 需 Suspense。
import { Suspense } from "react";
import ResearchWorkspaceHub from "@/components/research/ResearchWorkspaceHub";

export const dynamic = "force-dynamic";

export default function ResearchPage() {
  return (
    <Suspense>
      <ResearchWorkspaceHub />
    </Suspense>
  );
}
