// P22-S1：Production Monitor 独立路由。
// 不挂进 sidebar / 不改任何现有 IA —— 通过独立 URL 访问，AuthGate 保护。
import AuthGate from "@/components/auth/AuthGate";
import ProductionMonitor from "@/components/monitor/ProductionMonitor";

export const dynamic = "force-dynamic";

export default function ProductionMonitorPage() {
  return (
    <AuthGate titleKey="pm.title">
      <ProductionMonitor />
    </AuthGate>
  );
}
