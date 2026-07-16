// P7-02B-3：主题/产业链已并入股票研究。旧 URL 保留并应用内重定向到对应 Tab。
// 叶子页 /ai-theme/[theme] 不受影响，继续独立可达。
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function AiThemeRedirect() {
  redirect("/screener?tab=themes");
}
