// P14-RELEASE-01：旧版 Decision（决策中心 Hub）兼容入口。
// Decision V2 已接管正式入口 /decision-v2；旧版完整保留于 /decision-center 作回退，
// 本路由为其显式「/decision-legacy」别名（保留 ?tab= 深链），不删除旧页面。
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DecisionLegacyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" ? sp.tab : null;
  redirect(tab ? `/decision-center?tab=${encodeURIComponent(tab)}` : "/decision-center");
}
