type Props = {
  price: number;
  change?: number | null;
  changeRate?: number | null;
  size?: "sm" | "md" | "lg";
};

export default function PriceChange({
  price,
  change,
  changeRate,
  size = "md",
}: Props) {
  const isUp = (changeRate ?? change ?? 0) >= 0;
  const color = isUp ? "text-[#e74c3c]" : "text-[#2980b9]";
  const priceSize =
    size === "lg" ? "text-3xl" : size === "md" ? "text-xl" : "text-sm";
  const changeSize = size === "lg" ? "text-base" : "text-xs";

  return (
    <div className="flex items-baseline gap-2">
      <span className={`font-bold tabular-nums ${priceSize} text-slate-900`}>
        ¥{price.toLocaleString()}
      </span>
      {(change !== null && change !== undefined) ||
      (changeRate !== null && changeRate !== undefined) ? (
        <span className={`${color} ${changeSize} font-medium tabular-nums`}>
          {isUp ? "▲" : "▼"}
          {changeRate !== null && changeRate !== undefined
            ? `${Math.abs(changeRate).toFixed(2)}%`
            : change !== null && change !== undefined
              ? `¥${Math.abs(change).toLocaleString()}`
              : ""}
        </span>
      ) : null}
    </div>
  );
}
