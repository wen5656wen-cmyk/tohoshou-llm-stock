import { starsToString } from "@/lib/scoring";

type Props = {
  scoreGrowth?: number | null;
  scoreValuation?: number | null;
  scoreProfitability?: number | null;
  scoreCapitalFlow?: number | null;
  scoreSentiment?: number | null;
  total?: number | null;
  stars?: number | null;
  grade?: string | null;
  recommendation?: string | null;
  targetPrice?: number | null;
  upsideRate?: number | null;
};

const dimensions = [
  { key: "scoreGrowth",       label: "成长性",   en: "Growth" },
  { key: "scoreValuation",    label: "估值",     en: "Valuation" },
  { key: "scoreProfitability",label: "盈利能力", en: "Profitability" },
  { key: "scoreCapitalFlow",  label: "资金面",   en: "Capital Flow" },
  { key: "scoreSentiment",    label: "新闻情绪", en: "Sentiment" },
] as const;

const gradeConfig: Record<string, { label: string; color: string; bg: string }> = {
  STRONG_BUY:  { label: "强烈买入", color: "text-emerald-700", bg: "bg-emerald-600" },
  BUY:         { label: "买入",     color: "text-emerald-600", bg: "bg-emerald-500" },
  WATCH:       { label: "关注",     color: "text-amber-600",   bg: "bg-amber-500" },
  AVOID:       { label: "回避",     color: "text-red-600",     bg: "bg-red-500" },
  STRONG_AVOID:{ label: "强烈回避", color: "text-red-700",     bg: "bg-red-600" },
};

function ScoreBar({ value }: { value: number | null | undefined }) {
  const v = value ?? 0;
  const color =
    v >= 75 ? "bg-emerald-500"
    : v >= 60 ? "bg-blue-500"
    : v >= 45 ? "bg-amber-500"
    : "bg-red-500";

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${v}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-slate-600 w-7 text-right">{v}</span>
    </div>
  );
}

export default function ScoreBreakdown({
  scoreGrowth,
  scoreValuation,
  scoreProfitability,
  scoreCapitalFlow,
  scoreSentiment,
  total,
  stars,
  grade,
  targetPrice,
  upsideRate,
}: Props) {
  const cfg = gradeConfig[grade || "WATCH"] ?? gradeConfig.WATCH;
  const starsStr = starsToString(stars ?? 0);

  return (
    <div className="space-y-4">
      {/* Overall Score */}
      <div className="bg-slate-50 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-2xl text-amber-500 leading-none tracking-wider">
              {starsStr}
            </div>
            <div className={`text-lg font-bold mt-1 ${cfg.color}`}>
              {cfg.label}
            </div>
          </div>
          <div className="text-right">
            <div className="text-4xl font-bold text-slate-900 tabular-nums">
              {total ?? "—"}
            </div>
            <div className="text-xs text-slate-400">/ 100分</div>
          </div>
        </div>

        {targetPrice && (
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-200">
            <div>
              <div className="text-xs text-slate-400">目标价格</div>
              <div className="font-bold text-slate-900">
                ¥{targetPrice.toLocaleString()}
              </div>
            </div>
            {upsideRate != null && (
              <div>
                <div className="text-xs text-slate-400">上涨空间</div>
                <div
                  className={`font-bold ${upsideRate >= 0 ? "text-[#e74c3c]" : "text-[#2980b9]"}`}
                >
                  {upsideRate >= 0 ? "+" : ""}
                  {upsideRate.toFixed(1)}%
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5-Dimension Breakdown */}
      <div className="space-y-2.5">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          五维评分（各20%）
        </div>
        {dimensions.map(({ key, label }) => {
          const val =
            key === "scoreGrowth" ? scoreGrowth
            : key === "scoreValuation" ? scoreValuation
            : key === "scoreProfitability" ? scoreProfitability
            : key === "scoreCapitalFlow" ? scoreCapitalFlow
            : scoreSentiment;
          return (
            <div key={key}>
              <div className="flex justify-between mb-0.5">
                <span className="text-xs text-slate-600">{label}</span>
              </div>
              <ScoreBar value={val} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
