import { SkeletonLine, SkeletonTableRows } from "@/components/Skeleton";

export default function ScreenerLoading() {
  return (
    <div className="p-6 max-w-7xl space-y-4">
      {/* Title */}
      <div className="space-y-1">
        <SkeletonLine w="220px" h={36} />
        <SkeletonLine w="300px" h={14} />
      </div>

      {/* Stats bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex gap-4 flex-wrap">
        {[140, 80, 100, 90, 110].map((w, i) => (
          <SkeletonLine key={i} w={`${w}px`} h={14} />
        ))}
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 flex-wrap">
        {[60, 80, 70, 90, 65, 75].map((w, i) => (
          <div key={i} className="skeleton rounded-full" style={{ width: w, height: 32 }} />
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <SkeletonLine w="100px" h={14} />
        </div>
        <table className="w-full">
          <tbody>
            <SkeletonTableRows rows={12} cols={7} />
          </tbody>
        </table>
      </div>
    </div>
  );
}
