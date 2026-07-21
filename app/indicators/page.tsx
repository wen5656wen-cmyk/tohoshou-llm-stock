// P21-T2：技术指标 Tab 已下线（与 /stocks 同 API 重复；均线热力图因 /api/indicators
// 硬编码 ma5/ma20/ma60=null 恒为死功能）。旧 URL 保留，重定向到股票研究 Hub，不留 404。
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default function Redirect() { redirect("/screener"); }
