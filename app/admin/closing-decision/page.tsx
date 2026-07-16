// P7-02B-2：收盘决策已并入决策中心。旧 URL 保留并应用内重定向到对应 Tab。
import { redirect } from "next/navigation";

export default function ClosingDecisionRedirect() {
  redirect("/decision-center?tab=closing");
}
