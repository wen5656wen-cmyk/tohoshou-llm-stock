// P7-02B-2：收盘决策已并入决策中心。旧 URL 保留并应用内重定向到对应 Tab。
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic"; // 发真正的 307，不被预渲染/长缓存钉死目标

export default function ClosingDecisionRedirect() {
  redirect("/decision-center?tab=closing");
}
