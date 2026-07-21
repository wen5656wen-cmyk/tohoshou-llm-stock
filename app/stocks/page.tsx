// P21-T2：/stocks（零入链孤儿页）已下线 —— 与 indicators Tab 同一 /api/indicators，
// 且「财报数」列因 API 硬编码 finCount:0 恒为 0。唯一权威入口收敛到股票中心。
// 其唯一不可替代的能力（AI Universe 排除股视图）已迁至内部页 /admin/universe。
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default function Redirect() { redirect("/decision-v2?tab=recommendations"); }
