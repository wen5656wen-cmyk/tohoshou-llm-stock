// P21-T5-4B：Mission 审计已并入系统工作区「③ 系统维护」。旧 URL 保留并重定向，不留 404。
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default function Redirect() { redirect("/admin/mission-control?tab=maintenance&sub=audit"); }
