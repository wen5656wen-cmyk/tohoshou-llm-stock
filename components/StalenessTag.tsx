"use client";

/**
 * Shows data freshness relative to a given timestamp.
 * ≤5min → LIVE (green), ≤60min → Xm ago (blue),
 * ≤3h   → Xh ago (amber), >3h → stale (red/gray)
 */

type Props = {
  date: string | Date | null | undefined;
  className?: string;
};

function getLabel(date: string | Date | null | undefined): { text: string; cls: string } | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return null; // future date
  const diffMin = Math.floor(diffMs / 60000);
  const diffH   = Math.floor(diffMs / 3600000);

  if (diffMin < 5)   return { text: "LIVE",         cls: "bg-emerald-100 text-emerald-700 border-emerald-200" };
  if (diffMin < 60)  return { text: `${diffMin}m ago`, cls: "bg-blue-50 text-blue-600 border-blue-200" };
  if (diffH   < 3)   return { text: `${diffH}h ago`,   cls: "bg-amber-50 text-amber-600 border-amber-200" };
  return               { text: "stale",             cls: "bg-slate-100 text-slate-400 border-slate-200" };
}

export function StalenessTag({ date, className = "" }: Props) {
  const info = getLabel(date);
  if (!info) return null;
  return (
    <span
      className={`inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded border tracking-wide ${info.cls} ${className}`}
    >
      {info.text}
    </span>
  );
}
