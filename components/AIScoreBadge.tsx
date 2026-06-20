type Props = {
  score: number | null | undefined;
  size?: "sm" | "md";
};

export default function AIScoreBadge({ score, size = "md" }: Props) {
  if (score == null)
    return (
      <span className="text-slate-400 text-xs">—</span>
    );

  const color =
    score >= 80
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : score >= 65
        ? "bg-blue-50 text-blue-700 ring-blue-200"
        : score >= 50
          ? "bg-amber-50 text-amber-700 ring-amber-200"
          : "bg-red-50 text-red-700 ring-red-200";

  const label =
    score >= 80
      ? "高"
      : score >= 65
        ? "中高"
        : score >= 50
          ? "中"
          : "低";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${color} ${size === "sm" ? "text-[11px]" : ""}`}
    >
      {score}
      <span className="opacity-60">{label}</span>
    </span>
  );
}
