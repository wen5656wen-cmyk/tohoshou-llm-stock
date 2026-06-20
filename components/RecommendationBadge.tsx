type Rec =
  | "STRONG_BUY"
  | "BUY"
  | "WATCH"
  | "HOLD"
  | "AVOID"
  | "SELL"
  | "STRONG_SELL"
  | null
  | undefined;

const config: Record<string, { label: string; color: string }> = {
  STRONG_BUY:  { label: "强烈买入", color: "bg-emerald-600 text-white" },
  BUY:         { label: "买入",     color: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300" },
  WATCH:       { label: "关注",     color: "bg-yellow-100 text-yellow-800 ring-1 ring-yellow-300" },
  HOLD:        { label: "持有",     color: "bg-slate-100 text-slate-700 ring-1 ring-slate-300" },
  AVOID:       { label: "回避",     color: "bg-blue-100 text-blue-700 ring-1 ring-blue-300" },
  SELL:        { label: "卖出",     color: "bg-red-100 text-red-700 ring-1 ring-red-300" },
  STRONG_SELL: { label: "强烈卖出", color: "bg-red-600 text-white" },
};

type Props = { recommendation: Rec };

export default function RecommendationBadge({ recommendation }: Props) {
  if (!recommendation) return <span className="text-slate-400 text-xs">—</span>;

  const c = config[recommendation] ?? config.HOLD;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-bold ${c.color}`}
    >
      {c.label}
    </span>
  );
}
