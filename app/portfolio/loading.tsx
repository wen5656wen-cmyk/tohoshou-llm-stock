import { SkeletonLine, SkeletonTableRows } from "@/components/Skeleton";

export default function PortfolioLoading() {
  return (
    <div className="p-6 max-w-7xl space-y-5">
      {/* Title */}
      <div className="space-y-1">
        <SkeletonLine w="200px" h={36} />
        <SkeletonLine w="160px" h={14} />
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {[80, 90, 70, 85].map((w, i) => (
          <div key={i} className={`skeleton rounded-lg ${i === 0 ? "bg-white" : ""}`} style={{ width: w, height: 32 }} />
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
            <SkeletonLine w="50%" h={12} />
            <SkeletonLine w="60%" h={24} />
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <SkeletonLine w="120px" h={14} />
        </div>
        <table className="w-full">
          <tbody>
            <SkeletonTableRows rows={8} cols={7} />
          </tbody>
        </table>
      </div>
    </div>
  );
}
