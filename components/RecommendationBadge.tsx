import { getRec } from "@/lib/rec-config";

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

type Props = { recommendation: Rec };

export default function RecommendationBadge({ recommendation }: Props) {
  if (!recommendation) return <span className="text-slate-400 text-[11px]">—</span>;
  const c = getRec(recommendation);
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold ${c.solid}`}>
      {c.label}
    </span>
  );
}
