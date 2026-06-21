export function SkeletonLine({ w = "100%", h = 16 }: { w?: string; h?: number }) {
  return <div className="skeleton" style={{ width: w, height: h }} />;
}

export function SkeletonCard({ children }: { children?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
      {children ?? (
        <>
          <SkeletonLine w="40%" h={14} />
          <SkeletonLine w="60%" h={28} />
          <SkeletonLine w="30%" h={12} />
        </>
      )}
    </div>
  );
}

export function SkeletonTableRows({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b border-slate-50">
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="px-4 py-3">
              <SkeletonLine w={j === 0 ? "70%" : "50%"} h={14} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function SkeletonStat() {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2">
      <SkeletonLine w="50%" h={12} />
      <SkeletonLine w="35%" h={28} />
    </div>
  );
}

export function SkeletonNewsCard() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
      <div className="flex gap-2">
        <SkeletonLine w="50px" h={18} />
        <SkeletonLine w="80px" h={18} />
      </div>
      <SkeletonLine w="90%" h={16} />
      <SkeletonLine w="75%" h={16} />
      <SkeletonLine w="40%" h={12} />
    </div>
  );
}
