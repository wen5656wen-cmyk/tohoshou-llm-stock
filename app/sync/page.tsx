// P7-06：已并入 Mission Control Hub。旧 URL 保留并应用内重定向到对应 Tab。
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default function Redirect() { redirect("/admin/mission-control?tab=sync"); }
