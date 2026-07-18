import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchQuotesBatch } from "@/lib/yahoo";

export const dynamic = "force-dynamic";

// ── GET /api/decision/recommendations（P14-DEV-04 · 只读聚合 · 不改算法/Schema）──
// 正式推荐 SSOT = ClosingDecision.top10（15:15 GPT 重排的权威执行清单）。
// 因数据分散，本端只读聚合三源：closing.top10(执行:entry/target/stop) +
// StockScore.recommendationV2(真实推荐等级) + Yahoo 实时报价(当前价/今日涨跌)。
// 实验源（AI Top Picks / Fusion / Shadow）不混入；Daily Watchlist 是关注池非正式推荐，排除。
// 每字段带来源；推荐快照与实时行情分离；缺失字段返回 null（前端显 —）。

const RECO_MAP: Record<string, "STRONG_BUY" | "BUY" | "WATCH" | "SKIP"> = {
  STRONG_BUY: "STRONG_BUY", BUY: "BUY", HOLD: "WATCH", WATCH: "WATCH", AVOID: "SKIP",
};
function withTimeout<T>(p: Promise<T>, ms: number, fb: T): Promise<T> {
  return Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fb), ms))]);
}
const num = (v: unknown): number | null => { if (v == null) return null; const n = Number(v); return Number.isFinite(n) ? n : null; };

type T10 = { rank?: number; symbol: string; name?: string | null; sector?: string | null; price?: number | null; changePct?: number | null; aiScore?: number | null; gptScore?: number | null; gptNote?: string | null; reason?: string | null; riskLevel?: string | null; newsSentiment?: number | null; inBuyZone?: boolean | null; breakout?: boolean | null; entryLow?: number | null; entryHigh?: number | null; target1?: number | null; target2?: number | null; stopLoss?: number | null };

export async function GET(req: Request) {
  const dateArg = new URL(req.url).searchParams.get("date");
  const row = dateArg
    ? await prisma.closingDecision.findUnique({ where: { date: new Date(`${dateArg}T00:00:00.000Z`) } })
    : await prisma.closingDecision.findFirst({ orderBy: { date: "desc" } });

  if (!row) return NextResponse.json({ empty: true, note: "尚无收盘决策", asOf: null });

  const top10 = ((row.top10 as unknown) as T10[]) ?? [];
  const symbols = top10.map((r) => r.symbol);
  const [scores, quotes] = await Promise.all([
    prisma.stockScore.findMany({ where: { symbol: { in: symbols } }, select: { symbol: true, recommendationV2: true, adaptiveScore: true, tradingAction: true } }),
    withTimeout(fetchQuotesBatch(symbols), 5000, []),
  ]);
  const sMap = new Map(scores.map((s) => [s.symbol, s]));
  const qMap = new Map(quotes.map((q) => [q.symbol, q]));
  const quoteLive = quotes.length > 0;

  const top1Sym = row.top1Symbol;
  const recommendations = top10.map((r, i) => {
    const q = qMap.get(r.symbol);
    const cur = q?.price ?? r.price ?? null; // 实时优先，回退 15:15 快照
    const prev = q?.previousClose ?? null;
    const todayPct = cur != null && prev != null && prev > 0 ? (cur / prev - 1) * 100 : (r.changePct ?? null);
    const level = sMap.get(r.symbol)?.recommendationV2 ?? null;
    const upside = r.target1 != null && cur ? ((r.target1 - cur) / cur) * 100 : null;
    const downside = r.stopLoss != null && cur ? ((r.stopLoss - cur) / cur) * 100 : null;
    return {
      rank: r.rank ?? i + 1, symbol: r.symbol, name: r.name ?? r.symbol, sector: r.sector ?? null,
      currentPrice: cur, todayChangePct: num(todayPct),
      entryLow: r.entryLow ?? null, entryHigh: r.entryHigh ?? null, target1: r.target1 ?? null, stopLoss: r.stopLoss ?? null,
      upside: num(upside), downside: num(downside),
      aiScore: r.aiScore ?? null, gptScore: r.gptScore ?? null, riskLevel: r.riskLevel ?? null,
      level: level ? (RECO_MAP[level] ?? "SKIP") : null,     // 真实 recommendationV2 映射
      inBuyZone: r.inBuyZone ?? null, breakout: r.breakout ?? null, newsSentiment: r.newsSentiment ?? null,
      holdPeriod: r.symbol === top1Sym ? row.top1HoldPeriod : null, // 仅 top1 有真实持有周期
      reason: r.reason ?? null, gptNote: r.gptNote ?? null,
    };
  });

  const withLevel = recommendations.filter((r) => r.level);
  const cnt = (l: string) => withLevel.filter((r) => r.level === l).length;
  const avg = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const riskRank = (r: string | null) => (r === "HIGH" ? 3 : r === "MEDIUM" ? 2 : r === "LOW" ? 1 : 0);
  const avgRiskNum = avg(recommendations.map((r) => riskRank(r.riskLevel)));
  const avgRisk = avgRiskNum == null ? null : avgRiskNum >= 2.5 ? "HIGH" : avgRiskNum >= 1.5 ? "MEDIUM" : "LOW";

  const summary = {
    total: recommendations.length,
    strongBuy: cnt("STRONG_BUY"), buy: cnt("BUY"), watch: cnt("WATCH"), skip: cnt("SKIP"),
    avgAiScore: avg(recommendations.map((r) => r.aiScore)),
    avgUpside: avg(recommendations.map((r) => r.upside)),
    avgRisk,
    totalPosition: null, // 建议总仓位无正式字段
  };

  return NextResponse.json({
    empty: false,
    summary, recommendations,
    metadata: { date: row.date.toISOString().slice(0, 10), decidedAtJst: row.decidedAtJst, gptModel: row.gptModel, versionNote: "当前模型版本 · 非历史快照" },
    asOf: `${row.date.toISOString().slice(0, 10)} ${row.decidedAtJst ?? ""} JST`,
    sourceStatus: { closing: "ok", score: scores.length ? "ok" : "missing", quote: quoteLive ? "live" : "snapshot" },
  });
}
