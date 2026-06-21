import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { HomeTop3, HomeScoreTable } from "./HomeStockDisplay";

export const dynamic = "force-dynamic";

async function getDashboardData() {
  const [stockCount, priceCount, finCount, latestPrice, scores, scoreCount] =
    await Promise.all([
      prisma.stock.count(),
      prisma.dailyPrice.count(),
      prisma.financial.count(),
      prisma.dailyPrice.findFirst({ orderBy: { date: "desc" }, select: { date: true } }),
      prisma.stockScore.findMany({
        where: { priceCount: { gte: 20 }, adaptiveScore: { not: null } },
        orderBy: { adaptiveScore: "desc" },
        select: {
          symbol: true, name: true, nameZh: true, market: true, sector: true,
          latestClose: true, latestDate: true,
          return5d: true, return20d: true, return60d: true,
          rsi14: true, maTrend: true, macdSignalLabel: true,
          technicalScore: true, fundamentalScore: true, moneyFlowScore: true, riskScore: true,
          totalScore: true, adaptiveScore: true,
          recommendation: true, recommendationV2: true,
          starsLabel: true, summaryReason: true,
          percentileRank: true, opportunityScore: true, stockStyle: true,
        },
      }),
      prisma.stockScore.count({ where: { priceCount: { gte: 20 } } }),
    ]);

  return { stockCount, priceCount, finCount, latestPrice, scores, top3: scores.slice(0, 3), scoreCount };
}

export default async function DashboardPage() {
  const { stockCount, priceCount, finCount, latestPrice, scores, top3, scoreCount } =
    await getDashboardData();

  const latestDateStr = latestPrice ? latestPrice.date.toISOString().split("T")[0] : "—";
  const buyCount   = scores.filter((s) => s.recommendationV2 === "STRONG_BUY" || s.recommendationV2 === "BUY").length;
  const watchCount = scores.filter((s) => s.recommendationV2 === "WATCH").length;

  return (
    <div className="p-4 md:p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-[32px] font-bold text-slate-900 leading-tight">仪表盘</h1>
        <p className="text-sm font-medium text-slate-500 mt-1">
          J-Quants 实时数据 · 最后同步：{latestDateStr}
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        {[
          { label: "数据库股票",  value: stockCount.toLocaleString(),  unit: "只",  icon: "◉", cls: "text-slate-900" },
          { label: "已计算评分", value: scoreCount.toLocaleString(),  unit: "只",  icon: "✦", cls: "text-blue-700" },
          { label: "买入推荐",   value: buyCount.toLocaleString(),    unit: "只",  icon: "▲", cls: "text-emerald-600" },
          { label: "日线价格",   value: priceCount.toLocaleString(),  unit: "条",  icon: "◈", cls: "text-slate-700" },
          { label: "最后同步",   value: latestDateStr,                unit: "",    icon: "⟳", cls: "text-slate-600" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-slate-400 text-sm">{s.icon}</span>
              <span className="text-xs font-medium text-slate-500">{s.label}</span>
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
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl p-5 mb-6 border border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-yellow-400 text-lg">✦</span>
            <h2 className="font-bold text-[15px] text-white">AI Picks — TOP 3</h2>
          </div>
          <Link href="/ai-picks" className="text-xs text-slate-400 hover:text-white transition-colors">
            Full ranking →
          </Link>
        </div>
        {top3.length === 0 ? (
          <div className="bg-slate-700/40 rounded-2xl p-6 text-center text-slate-400 text-sm">
            暂无评分数据，请运行
            <code className="text-xs bg-slate-700 px-1 rounded ml-1">npm run compute-scores</code>
          </div>
        ) : (
          <HomeTop3 top3={top3} />
        )}
      </div>

      {/* Score distribution */}
      {scores.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Link href="/ai-picks?filter=BUY" className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 hover:border-emerald-300 transition-colors">
            <div className="text-xs font-medium text-emerald-600 mb-1">BUY Picks</div>
            <div className="text-3xl font-bold text-emerald-700 tabular-nums">{buyCount}</div>
            <div className="text-xs text-emerald-500 mt-1">STRONG BUY + BUY</div>
          </Link>
          <Link href="/ai-picks?filter=WATCH" className="bg-amber-50 border border-amber-100 rounded-2xl p-4 hover:border-amber-300 transition-colors">
            <div className="text-xs font-medium text-amber-600 mb-1">WATCH</div>
            <div className="text-3xl font-bold text-amber-600 tabular-nums">{watchCount}</div>
            <div className="text-xs text-amber-500 mt-1">监控中</div>
          </Link>
          <Link href="/screener" className="bg-slate-50 border border-slate-200 rounded-2xl p-4 hover:border-slate-300 transition-colors">
            <div className="text-xs font-medium text-slate-500 mb-1">Screener</div>
            <div className="text-3xl font-bold text-slate-700 tabular-nums">{scoreCount}</div>
            <div className="text-xs text-slate-400 mt-1">已计算评分</div>
          </Link>
        </div>
      )}

      {/* Scored Stocks Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-[15px] text-slate-900">
            AI 评分排行
            <span className="text-sm font-normal text-slate-400 ml-2">({scores.length}只)</span>
          </h2>
          <Link href="/screener" className="text-xs text-blue-600 hover:underline">
            筛选排序 →
          </Link>
        </div>
        {scores.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-sm">
            暂无评分数据，请运行
            <code className="bg-slate-100 px-1 rounded text-xs ml-1">npm run compute-scores</code>
          </div>
        ) : (
          <HomeScoreTable scores={scores} />
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
