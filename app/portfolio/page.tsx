// P14-UI-03：持仓入口去重。「我的持仓」并入「模拟持仓」（Decision V2）。
// 旧 /portfolio 链接保留可用 → 安全重定向到 /decision-v2?tab=portfolio（不 404）。
// 旧 Paper Trading Cockpit 组件（components/paper-trading/parts）仍在库内，未删除。
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function PortfolioPage() {
  redirect("/decision-v2?tab=portfolio");
}
