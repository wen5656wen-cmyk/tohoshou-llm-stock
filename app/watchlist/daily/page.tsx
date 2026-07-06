// P6-T7 — Daily AI Watchlist page (每日 AI 关注池).
// Thin CJK-free wrapper; all Chinese labels live in the view component under
// components/ (keeps app/ free of hardcoded CJK per the i18n lint rule).
import DailyWatchlistView from "@/components/watchlist-daily/DailyWatchlistView";

export const dynamic = "force-dynamic";

export default function DailyWatchlistPage() {
  return <DailyWatchlistView />;
}
