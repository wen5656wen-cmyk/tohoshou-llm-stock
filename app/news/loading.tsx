import { SkeletonLine, SkeletonNewsCard } from "@/components/Skeleton";

export default function NewsLoading() {
  return (
    <div className="p-6 max-w-4xl space-y-5">
      {/* Title */}
      <div className="space-y-1">
        <SkeletonLine w="160px" h={36} />
        <SkeletonLine w="140px" h={14} />
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 flex-wrap">
        {[60, 80, 90, 70, 65, 75, 85].map((w, i) => (
          <div key={i} className="skeleton rounded-full" style={{ width: w, height: 30 }} />
        ))}
      </div>

      {/* News cards */}
      <div className="space-y-3">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => <SkeletonNewsCard key={i} />)}
      </div>
    </div>
  );
}
