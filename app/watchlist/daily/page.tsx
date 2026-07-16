// P7-02B-2：每日关注池已并入决策中心。旧 URL 保留并应用内重定向到对应 Tab。
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function DailyWatchlistRedirect() {
  redirect("/decision-center?tab=watchlist");
}
