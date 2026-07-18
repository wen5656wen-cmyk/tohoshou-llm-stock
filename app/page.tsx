// ── 系统第一眼 = 老板驾驶舱（P13-DECISION-07）────────────────────────────────
// 原 CommandCenter（系统/运维仪表盘）已由 Executive Dashboard 取代为老板首页；
// CommandCenter 组件保留在库内作回滚点，本页不再挂载。
import ExecutiveDashboard from "@/components/dashboard/ExecutiveDashboard";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return <ExecutiveDashboard />;
}
