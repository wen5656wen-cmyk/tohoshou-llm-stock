// P7-05：已并入研究综合 Hub。旧 URL 保留并应用内重定向到对应 Tab。
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default function Redirect() { redirect("/admin/research?tab=experiments"); }
