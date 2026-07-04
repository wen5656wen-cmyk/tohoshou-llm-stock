import { ComingSoonView } from "@/components/dashboard/ComingSoonView";

export const dynamic = "force-dynamic";

export default async function ComingSoonPage({
  searchParams,
}: {
  searchParams: Promise<{ feature?: string }>;
}) {
  const { feature } = await searchParams;
  return <ComingSoonView feature={feature ?? null} />;
}
