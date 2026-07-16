// P7-02B-3：股票研究 Hub（7 Tab）。/screener 为主入口，默认选股 Tab。
// useSearchParams 需 Suspense 边界。
import { Suspense } from "react";
import StockResearchHub from "@/components/research/StockResearchHub";

export const dynamic = "force-dynamic";

export default function StockResearchPage() {
  return (
    <Suspense>
      <StockResearchHub />
    </Suspense>
  );
}
