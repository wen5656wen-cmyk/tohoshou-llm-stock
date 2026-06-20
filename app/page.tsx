import { prisma } from "@/lib/prisma";
import Link from "next/link";

async function getDashboardData() {
  const [stockCount, priceCount, finCount, latestPrice, scores, scoreCount] =
    await Promise.all([
      prisma.stock.count(),
      prisma.dailyPrice.count(),
      prisma.financial.count(),
      prisma.dailyPrice.findFirst({ orderBy: { date: "desc" }, select: { date: true } }),
      prisma.stockScore.findMany({
        where: { priceCount: { gte: 20 } },
        orderBy: { totalScore: "desc" },
        select: {
          symbol: true, name: true, market: true, sector: true,
          latestClose: true, latestDate: true,
          return5d: true, return20d: true, return60d: true,
          rsi14: true, maTrend: true, macdSignalLabel: true,
          technicalScore: true, fundamentalScore: true, riskScore: true,
          totalScore: true, recommendation: true, starsLabel: true, summaryReason: true,
        },
      }),
      prisma.stockScore.count({ where: { priceCount: { gte: 20 } } }),
    ]);

  return { stockCount, priceCount, finCount, latestPrice, scores, top3: scores.slice(0, 3), scoreCount };
}

function ReturnBadge({ val }: { val: number | null | undefined }) {
  if (val == null) return <span className="text-slate-300 text-xs">—</span>;
  const up = val >= 0;
  return (
    <span className={`text-xs font-medium tabular-nums ${up ? "text-[#e74c3c]" : "text-[#2980b9]"}`}>
      {up ? "▲" : "▼"}{Math.abs(val).toFixed(2)}%
    </span>
  );
}

function MaTrendBadge({ trend }: { trend: string | null }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    GOLDEN:  { label: "多头趋势", cls: "bg-amber-100 text-amber-700" },
    BULLISH: { label: "偏强",     cls: "bg-green-100 text-green-700" },
    NEUTRAL: { label: "中性",     cls: "bg-slate-100 text-slate-500" },
    BEARISH: { label: "偏弱",     cls: "bg-blue-100 text-blue-700" },
    DEAD:    { label: "空头趋势", cls: "bg-red-100 text-red-600" },
  };
  const c = cfg[trend ?? ""] ?? cfg.NEUTRAL;
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${c.cls}`}>{c.label}</span>
  );
}

const REC_CFG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  STRONG_BUY: { label: "强烈买入", bg: "bg-red-50",    text: "text-red-700",    border: "border-red-200" },
  BUY:        { label: "买入",     bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
  WATCH:      { label: "关注",     bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-200" },
  HOLD:       { label: "持有",     bg: "bg-slate-50",  text: "text-slate-600",  border: "border-slate-200" },
  AVOID:      { label: "回避",     bg: "bg-blue-50",   text: "text-blue-600",   border: "border-blue-200" },
};

export default async function DashboardPage() {
  const { stockCount, priceCount, finCount, latestPrice, scores, top3, scoreCount } =
    await getDashboardData();

  const latestDateStr = latestPrice ? latestPrice.date.toISOString().split("T")[0] : "—";

  const buyCount   = scores.filter((s) => s.recommendation === "STRONG_BUY" || s.recommendation === "BUY").length;
  const watchCount = scores.filter((s) => s.recommendation === "WATCH").length;

  return (
    <div className="p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">仪表盘</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          J-Quants 实时数据　最后同步：{latestDateStr}
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {[
          { label: "数据库股票总数", value: stockCount.toLocaleString(),  unit: "只",  icon: "◉", cls: "text-slate-900" },
          { label: "已计算评分",     value: scoreCount.toLocaleString(),  unit: "只",  icon: "✦", cls: "text-blue-700" },
          { label: "买入推荐",       value: buyCount.toLocaleString(),    unit: "只",  icon: "▲", cls: "text-red-600" },
          { label: "日线价格数",     value: priceCount.toLocaleString(),  unit: "条",  icon: "◈", cls: "text-slate-700" },
          { label: "最后同步",       value: latestDateStr,                unit: "",    icon: "⟳", cls: "text-slate-600" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-slate-400 text-sm">{s.icon}</span>
              <span className="text-xs text-slate-500">{s.label}</span>
            </div>
            <div className={`text-2xl font-bold tabular-nums ${s.cls}`}>
              {s.value}
              {s.unit && (
                <span className="text-sm font-normal text-slate-400 ml-1">{s.unit}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* AI TOP3 */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl p-5 mb-6 border border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-yellow-400 text-lg">✦</span>
            <h2 className="font-semibold text-white">AI推荐 TOP 3</h2>
            <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded">
              技术40% + 基本面40% + 安全性20%
            </span>
          </div>
          <Link href="/ai-picks" className="text-xs text-slate-400 hover:text-white transition-colors">
            完整排行 →
          </Link>
        </div>
        {top3.length === 0 ? (
          <div className="bg-slate-700/40 rounded-xl p-6 text-center text-slate-400 text-sm">
            暂无评分数据，请运行
            <code className="text-xs bg-slate-700 px-1 rounded ml-1">npm run compute-scores</code>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {top3.map((s, i) => {
              const rec = REC_CFG[s.recommendation ?? "HOLD"] ?? REC_CFG.HOLD;
              return (
                <Link
                  key={s.symbol}
                  href={`/stocks/${encodeURIComponent(s.symbol)}`}
                  className="bg-white/10 hover:bg-white/20 transition-colors rounded-xl p-4 block"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-lg">{["🥇", "🥈", "🥉"][i]}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${rec.bg} ${rec.text}`}>
                      {rec.label}
                    </span>
                  </div>
                  <div className="font-semibold text-white text-sm truncate">{s.name}</div>
                  <div className="text-slate-400 text-xs mb-2">{s.symbol}</div>
                  <div className="flex items-end gap-2">
                    <div className="text-2xl font-bold text-white tabular-nums">{s.totalScore}</div>
                    <div className="text-slate-300 text-xs mb-1">分　{s.starsLabel}</div>
                  </div>
                  <div className="mt-1.5 grid grid-cols-3 gap-1 text-[10px]">
                    <div className="text-center">
                      <div className="text-blue-300 font-bold">{s.technicalScore}</div>
                      <div className="text-slate-500">技术</div>
                    </div>
                    <div className="text-center">
                      <div className="text-emerald-300 font-bold">{s.fundamentalScore}</div>
                      <div className="text-slate-500">基本面</div>
                    </div>
                    <div className="text-center">
                      <div className="text-violet-300 font-bold">{s.riskScore}</div>
                      <div className="text-slate-500">安全性</div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Score distribution */}
      {scores.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Link href="/ai-picks?filter=BUY" className="bg-red-50 border border-red-100 rounded-xl p-4 hover:border-red-300 transition-colors">
            <div className="text-xs text-red-500 mb-1">买入推荐</div>
            <div className="text-3xl font-bold text-red-600 tabular-nums">{buyCount}</div>
            <div className="text-xs text-red-400 mt-1">强烈买入 + 买入</div>
          </Link>
          <Link href="/ai-picks?filter=WATCH" className="bg-yellow-50 border border-yellow-100 rounded-xl p-4 hover:border-yellow-300 transition-colors">
            <div className="text-xs text-yellow-600 mb-1">值得关注</div>
            <div className="text-3xl font-bold text-yellow-600 tabular-nums">{watchCount}</div>
            <div className="text-xs text-yellow-500 mt-1">关注</div>
          </Link>
          <Link href="/screener" className="bg-slate-50 border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors">
            <div className="text-xs text-slate-500 mb-1">前往筛选器</div>
            <div className="text-3xl font-bold text-slate-700 tabular-nums">{scoreCount}</div>
            <div className="text-xs text-slate-400 mt-1">已计算评分</div>
          </Link>
        </div>
      )}

      {/* Scored Stocks Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">
            AI评分排行
            <span className="text-sm font-normal text-slate-400 ml-2">({scores.length}只)</span>
          </h2>
          <Link href="/screener" className="text-xs text-blue-600 hover:underline">
            筛选与排序 →
          </Link>
        </div>
        {scores.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-sm">
            暂无评分数据，请运行
            <code className="bg-slate-100 px-1 rounded text-xs ml-1">npm run compute-scores</code>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-3 font-medium w-6 text-center">#</th>
                  <th className="px-4 py-3 font-medium">股票</th>
                  <th className="px-3 py-3 font-medium text-right">现价</th>
                  <th className="px-3 py-3 font-medium text-right">5日</th>
                  <th className="px-3 py-3 font-medium text-right">20日</th>
                  <th className="px-3 py-3 font-medium text-right">RSI</th>
                  <th className="px-3 py-3 font-medium">均线</th>
                  <th className="px-3 py-3 font-medium text-right">技术</th>
                  <th className="px-3 py-3 font-medium text-right">基本面</th>
                  <th className="px-3 py-3 font-medium text-right">AI综合</th>
                  <th className="px-3 py-3 font-medium text-center">推荐</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {scores.slice(0, 100).map((s, i) => {
                  const rec = REC_CFG[s.recommendation ?? "HOLD"] ?? REC_CFG.HOLD;
                  const rsiColor =
                    s.rsi14 == null ? "text-slate-400"
                    : s.rsi14 >= 70 ? "text-red-500"
                    : s.rsi14 <= 30 ? "text-blue-500"
                    : "text-slate-700";
                  return (
                    <tr key={s.symbol} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-2 text-center text-xs text-slate-300 tabular-nums">{i + 1}</td>
                      <td className="px-4 py-2">
                        <Link href={`/stocks/${encodeURIComponent(s.symbol)}`} className="block group">
                          <div className="font-medium text-sm text-slate-900 group-hover:text-blue-600 leading-tight">
                            {s.name}
                          </div>
                          <div className="text-xs text-slate-400 font-mono">{s.symbol}</div>
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium text-sm text-slate-900">
                        {s.latestClose ? `¥${s.latestClose.toLocaleString()}` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <ReturnBadge val={s.return5d} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <ReturnBadge val={s.return20d} />
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums text-xs ${rsiColor}`}>
                        {s.rsi14 != null ? s.rsi14.toFixed(1) : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <MaTrendBadge trend={s.maTrend} />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs text-blue-600 font-medium">
                        {s.technicalScore ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs text-emerald-600 font-medium">
                        {s.fundamentalScore ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className={`text-sm font-bold tabular-nums ${rec.text}`}>
                          {s.totalScore ?? "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${rec.bg} ${rec.text}`}>
                          {rec.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {scores.length > 100 && (
          <div className="px-5 py-3 border-t border-slate-100 text-xs text-slate-400 text-center">
            仅显示前100条。
            <Link href="/screener" className="text-blue-600 hover:underline ml-1">
              前往筛选器查看全部 →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
