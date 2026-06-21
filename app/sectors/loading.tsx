import { SkeletonLine, SkeletonTableRows } from "@/components/Skeleton";

export default function SectorsLoading() {
  return (
    <div className="p-6 max-w-7xl space-y-5">
      {/* Title */}
      <div className="space-y-1">
        <SkeletonLine w="200px" h={36} />
        <SkeletonLine w="160px" h={14} />
      </div>

      {/* Sort chips */}
      <div className="flex gap-2">
        {[80, 90, 85, 75].map((w, i) => (
          <div key={i} className="skeleton rounded-full" style={{ width: w, height: 30 }} />
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <SkeletonLine w="100px" h={14} />
        </div>
        <table className="w-full">
          <tbody>
            <SkeletonTableRows rows={15} cols={6} />
          </tbody>
        </table>
      </div>
    </div>
  );
}
