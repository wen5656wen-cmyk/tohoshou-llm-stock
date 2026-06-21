import { SkeletonStat, SkeletonTableRows, SkeletonLine } from "@/components/Skeleton";

export default function DashboardLoading() {
  return (
    <div className="p-6 max-w-7xl space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <SkeletonLine w="260px" h={32} />
        <SkeletonLine w="200px" h={14} />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => <SkeletonStat key={i} />)}
      </div>

      {/* Top 3 picks */}
      <div>
        <SkeletonLine w="180px" h={20} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
              <SkeletonLine w="60%" h={18} />
              <SkeletonLine w="40%" h={32} />
              <SkeletonLine w="80%" h={12} />
              <SkeletonLine w="70%" h={12} />
            </div>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <SkeletonLine w="120px" h={14} />
        </div>
        <table className="w-full">
          <tbody>
            <SkeletonTableRows rows={10} cols={6} />
          </tbody>
        </table>
      </div>
    </div>
  );
}
