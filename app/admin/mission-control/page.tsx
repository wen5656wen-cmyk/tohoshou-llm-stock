// P7-06：系统工作区唯一入口 = Mission Control Hub（8 Tab）。useSearchParams 需 Suspense。
import { Suspense } from "react";
import AuthGate from "@/components/auth/AuthGate";
import SystemHub from "@/components/system/SystemHub";

export const dynamic = "force-dynamic";

export default function MissionControlPage() {
  return (
    <Suspense>
      <AuthGate titleKey="ws.admin">
        <SystemHub />
      </AuthGate>
    </Suspense>
  );
}
