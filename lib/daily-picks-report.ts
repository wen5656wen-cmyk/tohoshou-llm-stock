/**
 * AI日报内容生成器（独立于推送渠道）
 * 供 API route 和 script 共用
 */

import { prisma } from "@/lib/prisma";
import { calcIndicators } from "@/lib/indicators";
import { calcAiScore, type ScoreInput, type AiScoreResult } from "@/lib/ai-score";

const REC_LABEL: Record<string, string> = {
  STRONG_BUY: "强烈买入 🔥",
  BUY:        "买入 ✅",
  WATCH:      "关注 👀",
  HOLD:       "持有 ⏸",
  AVOID:      "回避 ❌",
};

function upProb(score: AiScoreResult): number {
  // 基于总分+技术分推算上涨概率（仅供参考）
  const raw = score.totalScore * 0.7 + score.technicalScore * 0.3;
  return Math.min(92, Math.max(20, Math.round(raw * 0.88)));
}

export type DailyPicksReport = {
  date: string;
  top3: AiScoreResult[];
  markdown: string;
  text: string;
};

export async function buildDailyPicksReport(): Promise<DailyPicksReport> {
  const now = new Date();
  // 东京时间日期（UTC+9）
  const tokyoDate = new Date(now.getTime() + 9 * 3600 * 1000);
  const dateStr = tokyoDate.toISOString().split("T")[0];
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  const weekday = weekdays[tokyoDate.getUTCDay()];

  const stocks = await prisma.stock.findMany({
    select: { id: true, symbol: true, name: true },
    orderBy: { symbol: "asc" },
  });

  const scores: AiScoreResult[] = [];

  for (const stock of stocks) {
    const pricesDesc = await prisma.dailyPrice.findMany({
      where: { symbol: stock.symbol },
      orderBy: { date: "desc" },
      select: { date: true, close: true },
      take: 300,
    });
    if (pricesDesc.length === 0) continue;

    const prices = pricesDesc.reverse().map((p) => ({
      date: p.date.toISOString().split("T")[0],
      close: Number(p.close),
    }));
    const ind = calcIndicators(stock.symbol, prices);

    const fins = await prisma.financial.findMany({
      where: { stockId: stock.id },
      orderBy: [{ fiscalYear: "desc" }, { quarter: "asc" }],
      take: 4,
      select: {
        revenue: true, operatingProfit: true, netProfit: true,
        totalAssets: true, equity: true, eps: true, equityRatio: true,
      },
    });
    const best = fins.find((f) => f.revenue !== null && f.netProfit !== null) ?? fins[0] ?? null;
    const div = await prisma.dividend.findFirst({
      where: { symbol: stock.symbol }, orderBy: { year: "desc" },
      select: { dividend: true, yieldRate: true },
    });

    const input: ScoreInput = {
      symbol: stock.symbol, name: stock.name,
      latestClose: ind.latestClose, latestDate: ind.latestDate,
      ma5: ind.ma5, ma20: ind.ma20, ma60: ind.ma60,
      rsi14: ind.rsi14, macd: ind.macd, macdSignal: ind.macdSignal, macdHist: ind.macdHist,
      return5d: ind.return5d, return20d: ind.return20d, return60d: ind.return60d,
      maTrend: ind.maTrend, macdSignalLabel: ind.macdSignalLabel,
      revenue: best ? Number(best.revenue ?? 0) || null : null,
      operatingProfit: best ? Number(best.operatingProfit ?? 0) || null : null,
      netProfit: best ? Number(best.netProfit ?? 0) || null : null,
      totalAssets: best ? Number(best.totalAssets ?? 0) || null : null,
      equity: best ? Number(best.equity ?? 0) || null : null,
      eps: best ? Number(best.eps ?? 0) || null : null,
      equityRatio: best ? Number(best.equityRatio ?? 0) || null : null,
      financialCount: fins.length,
      divAnn: div ? Number(div.dividend) : null,
      divYieldRate: div?.yieldRate ? Number(div.yieldRate) : null,
    };

    scores.push(calcAiScore(input));
  }

  const top3 = scores.sort((a, b) => b.totalScore - a.totalScore).slice(0, 3);
  const medals = ["🥇", "🥈", "🥉"];

  // ── Markdown 版本（企业微信格式）──────────────────────────────────────
  const sections = top3.map((s, i) => {
    const prob = upProb(s);
    const recLabel = REC_LABEL[s.recommendation] ?? s.recommendation;
    // 取第一条技术理由作为推荐理由（最简短）
    const reason = s.technicalReasons[0] ?? s.summaryReason.split("。")[1] ?? "—";

    return [
      `**${medals[i]} TOP${i + 1} · ${s.name}**`,
      `> 代码：\`${s.symbol}\`　现价：¥${s.latestClose.toLocaleString()}`,
      `> AI评分：<font color="warning">**${s.totalScore}分**</font>　${s.starsLabel}`,
      `> 推荐：${recLabel}`,
      `> 上涨概率：${prob}%`,
      `> 理由：${reason}`,
    ].join("\n");
  });

  const markdown = [
    `# 🇯🇵 日本AI选股日报`,
    `**日期：${dateStr}（周${weekday}）**`,
    `技术40% + 基本面40% + 安全性20%`,
    ``,
    sections.join("\n\n━━━━━━━━\n\n"),
    ``,
    `━━━━━━━━`,
    `[查看完整排行榜 →](http://localhost:3000/ai-picks)`,
  ].join("\n");

  // ── 纯文本版本（兜底）────────────────────────────────────────────────
  const textSections = top3.map((s, i) => {
    const prob = upProb(s);
    const recLabel = REC_LABEL[s.recommendation]?.replace(/ [^ ]+$/, "") ?? s.recommendation;
    const reason = s.technicalReasons[0] ?? "—";
    return [
      `${medals[i]} TOP${i + 1}`,
      `股票：${s.name}`,
      `代码：${s.symbol}`,
      `现价：¥${s.latestClose.toLocaleString()}`,
      `AI评分：${s.totalScore}分  ${s.starsLabel}`,
      `推荐：${recLabel}`,
      `上涨概率：${prob}%`,
      `推荐理由：${reason}`,
    ].join("\n");
  });

  const text = [
    `🇯🇵 日本AI选股日报`,
    `日期：${dateStr}（周${weekday}）`,
    ``,
    textSections.join("\n\n━━━━━━━━\n\n"),
    ``,
    `━━━━━━━━`,
    `查看详情：http://localhost:3000/ai-picks`,
  ].join("\n");

  return { date: dateStr, top3, markdown, text };
}
