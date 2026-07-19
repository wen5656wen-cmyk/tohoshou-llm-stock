// Deep Research · 研究日历（P17 Track 1）
import { Suspense } from "react";
import ResearchCalendar from "@/components/research/deep/ResearchCalendar";

export const dynamic = "force-dynamic";

export default function ResearchCalendarPage() {
  return (
    <Suspense>
      <ResearchCalendar />
    </Suspense>
  );
}
