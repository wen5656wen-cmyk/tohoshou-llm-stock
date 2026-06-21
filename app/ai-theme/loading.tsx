import { SkeletonLine } from "@/components/Skeleton";

function ThemeCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
      <div className="flex justify-between">
        <SkeletonLine w="120px" h={20} />
        <SkeletonLine w="60px" h={20} />
      </div>
      <SkeletonLine w="80%" h={12} />
      <div className="flex gap-2 mt-2">
        {[60, 50, 70].map((w, i) => (
          <div key={i} className="skeleton rounded-full" style={{ width: w, height: 22 }} />
        ))}
      </div>
      <div className="flex gap-3 pt-1">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex-1 bg-slate-50 rounded-xl p-2 space-y-1">
            <SkeletonLine w="60%" h={12} />
            <SkeletonLine w="80%" h={14} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AiThemeLoading() {
  return (
    <div className="p-6 max-w-7xl space-y-5">
      {/* Header */}
      <div className="space-y-1">
        <SkeletonLine w="240px" h={36} />
        <SkeletonLine w="180px" h={14} />
      </div>

      {/* Tab row */}
      <div className="flex gap-2 flex-wrap">
        {[80, 100, 90, 110, 85, 95, 75].map((w, i) => (
          <div key={i} className="skeleton rounded-full" style={{ width: w, height: 32 }} />
        ))}
      </div>

      {/* Theme cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => <ThemeCardSkeleton key={i} />)}
      </div>
    </div>
  );
}
