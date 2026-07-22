// P22-S2：AI Quality Dashboard 独立路由。
// 不挂进 sidebar / 不改任何现有 IA —— 通过独立 URL 访问，AuthGate 保护。
import AuthGate from "@/components/auth/AuthGate";
import AIQualityDashboard from "@/components/monitor/AIQualityDashboard";

export const dynamic = "force-dynamic";

export default function AIQualityPage() {
  return (
    <AuthGate titleKey="quality.title">
      <AIQualityDashboard />
    </AuthGate>
  );
}
