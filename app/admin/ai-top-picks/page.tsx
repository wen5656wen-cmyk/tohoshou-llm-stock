// P7-02B-2：AI 五选已并入决策中心。旧 URL 保留并应用内重定向到对应 Tab。
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function AiTopPicksRedirect() {
  redirect("/decision-center?tab=top-picks");
}
