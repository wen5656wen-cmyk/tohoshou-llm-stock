// P7-02B-3：行业已并入股票研究。旧 URL 保留并应用内重定向到对应 Tab。
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function SectorsRedirect() {
  redirect("/screener?tab=sectors");
}
