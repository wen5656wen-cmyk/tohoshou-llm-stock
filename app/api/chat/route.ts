/**
 * POST /api/chat — GPT-4o-mini chat endpoint (DB-grounded, Phase 1)
 *
 * GPT responsibilities:
 *   1. Understand user intent
 *   2. Receive structured DB data as context
 *   3. Format a concise Chinese reply
 *
 * GPT NEVER generates: stock prices, AI scores, news content, investment advice
 * All facts come from: StockScore, Stock, News, Disclosure, InstitutionalFlow, GlobalMarket
 *
 * Supported intents (Phase 1):
 *   今天买什么？     → top_picks
 *   分析7203        → stock_analysis
 *   科技股谁最强？   → theme_best
 *   半导体还能买吗？ → theme_outlook
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { openaiClient, GPT_MODEL, isOpenAIConfigured } from "@/lib/openai";

export const dynamic = "force-dynamic";

// ── Intent classification (regex fast-path) ───────────────────────────────────

type Intent =
  | { type: "top_picks" }
  | { type: "stock_analysis"; code: string }
  | { type: "theme_best"; theme: string }
  | { type: "theme_outlook"; theme: string }
  | { type: "unknown" };

const THEME_KEYWORDS: Record<string, string[]> = {
  "科技股":    ["情報通信・サービスその他", "電機・精密"],
  "半导体":    ["電機・精密"],
  "AI股":      ["情報通信・サービスその他"],
  "汽车股":    ["自動車・輸送機"],
  "机器人":    ["機械", "電機・精密"],
  "数据中心":  ["情報通信・サービスその他"],
};

function classifyIntent(text: string): Intent {
  const t = text.trim();

  // today picks
  if (/今天?买什么|今日推荐|AI推荐|推荐股|买什么好|top\s*10/i.test(t)) {
    return { type: "top_picks" };
  }

  // stock analysis: "分析7203" / "7203怎么样" / "7203" / "分析丰田"
  const codeMatch = t.match(/^分析?\s*(\d{4})/i) ?? t.match(/^(\d{4})\s*(怎么样|如何|分析)?$/);
  if (codeMatch) return { type: "stock_analysis", code: codeMatch[1] };

  // theme_best: 科技股谁最强 / 半导体哪个好
  for (const theme of Object.keys(THEME_KEYWORDS)) {
    if (t.includes(theme)) {
      if (/谁最强|哪个好|最好|最强|领涨|推荐|哪只|买哪/.test(t)) {
        return { type: "theme_best", theme };
      }
      if (/还能买|能买吗|可以买|值得|前景|怎么样|如何/.test(t)) {
        return { type: "theme_outlook", theme };
      }
      // default: show best
      return { type: "theme_best", theme };
    }
  }

  return { type: "unknown" };
}

// ── DB data fetchers ───────────────────────────────────────────────────────────

async function fetchTopPicks() {
  return prisma.stockScore.findMany({
    where: { priceCount: { gte: 20 }, totalScore: { not: null } },
    orderBy: { totalScore: "desc" },
    take: 10,
    select: {
      symbol: true, name: true, nameZh: true,
      totalScore: true, adaptiveScore: true, recommendation: true,
      return5d: true, return20d: true,
      technicalScore: true, fundamentalScore: true, moneyFlowScore: true,
      summaryReason: true, stockStyle: true, fxSensitivity: true,
    },
  });
}

async function fetchStockData(code: string) {
  const symbol = code.includes(".") ? code : `${code}.T`;
  const [score, stock, fins, recentNews] = await Promise.all([
    prisma.stockScore.findUnique({
      where: { symbol },
      select: {
        symbol: true, name: true, nameZh: true,
        totalScore: true, adaptiveScore: true, recommendation: true,
        technicalScore: true, fundamentalScore: true, moneyFlowScore: true, newsSentimentScore: true, globalTrendScore: true,
        return5d: true, return20d: true, return60d: true,
        rsi14: true, maTrend: true, macdSignalLabel: true, latestClose: true,
        summaryReason: true, stockStyle: true, fxSensitivity: true, catalystScore: true, highRiskFlag: true,
      },
    }),
    prisma.stock.findUnique({
      where: { symbol },
      select: { sector: true, marketCap: true, per: true, pbr: true },
    }),
    prisma.financial.findMany({
      where: { stock: { symbol } },
      orderBy: [{ fiscalYear: "desc" }, { quarter: "asc" }],
      take: 1,
      select: { fiscalYear: true, revenue: true, operatingProfit: true, netProfit: true, eps: true, roe: true },
    }),
    prisma.news.findMany({
      where: {
        stock: { symbol },
        relatedSymbolConfidence: { gte: 70 },
        publishedAt: { gte: new Date(Date.now() - 7 * 86400000) },
      },
      orderBy: { publishedAt: "desc" },
      take: 3,
      select: { title: true, sentiment: true, publishedAt: true },
    }),
  ]);
  return { score, stock, fin: fins[0] ?? null, recentNews };
}

async function fetchThemeStocks(theme: string) {
  const sectors = THEME_KEYWORDS[theme] ?? [];
  const [themeStocks, globalMarket, instFlow] = await Promise.all([
    prisma.stockScore.findMany({
      where: {
        priceCount: { gte: 20 },
        totalScore: { not: null },
        ...(sectors.length ? { sector: { in: sectors } } : {}),
      },
      orderBy: { totalScore: "desc" },
      take: 8,
      select: {
        symbol: true, name: true, nameZh: true,
        totalScore: true, adaptiveScore: true, recommendation: true,
        return5d: true, return20d: true, sector: true,
        summaryReason: true, fxSensitivity: true,
      },
    }),
    prisma.globalMarket.findFirst({
      orderBy: { date: "desc" },
      select: { date: true, nasdaqChange: true, vix: true, nikkeiChange: true, score: true },
    }),
    prisma.institutionalFlow.findFirst({
      where: { source: { in: ["jquants_investor_types", "jpx"] } },
      orderBy: { date: "desc" },
      select: { date: true, investorType: true, netAmount: true, source: true },
    }),
  ]);
  return { themeStocks, globalMarket, instFlow };
}

// ── GPT call with DB context ──────────────────────────────────────────────────

const SYSTEM_PROMPT = `你是 TOHOSHOU AI，日本股市分析助手。

规则（严格遵守）：
1. 只使用 [DB数据] 中提供的真实数据进行分析
2. 禁止自行生成或猜测任何股价、评分、新闻内容
3. 如果 [DB数据] 为空或字段为 null，说明"暂无真实数据"
4. 回复用中文，简洁专业，200字以内
5. 引用数据时直接说出具体数字（如"AI评分73分"，"5日涨幅+2.1%"）
6. 不要说"根据AI分析"等虚假权威，直接说"根据数据库数据"

推荐标签：STRONG_BUY=强烈买入 / BUY=买入 / HOLD=持有 / WATCH=关注 / AVOID=回避`;

async function callGPT(userQuestion: string, dbContext: string): Promise<string> {
  const client = openaiClient();
  const res = await client.chat.completions.create({
    model: GPT_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `用户问题：${userQuestion}\n\n[DB数据]\n${dbContext}`,
      },
    ],
    max_tokens: 500,
    temperature: 0.3,
  });
  return res.choices[0]?.message?.content?.trim() ?? "暂无真实数据";
}

// ── Context builders ──────────────────────────────────────────────────────────

function buildTopPicksContext(picks: Awaited<ReturnType<typeof fetchTopPicks>>) {
  if (!picks.length) return "数据库暂无评分数据。";
  const now = new Date();
  const dateStr = new Date(now.getTime() + 9 * 3600000).toISOString().split("T")[0];
  const rows = picks.map((p, i) =>
    `${i + 1}. ${p.nameZh ?? p.name}（${p.symbol.replace(".T", "")}）` +
    ` 总分${p.totalScore} 动态分${p.adaptiveScore ?? "—"} ${p.recommendation}` +
    ` 5日${p.return5d != null ? (p.return5d >= 0 ? "+" : "") + p.return5d.toFixed(1) + "%" : "—"}` +
    ` 风格:${p.stockStyle ?? "—"}`
  );
  return `日期：${dateStr}\nTOP${picks.length} AI推荐：\n${rows.join("\n")}`;
}

function buildStockContext(data: Awaited<ReturnType<typeof fetchStockData>>) {
  const { score, stock, fin, recentNews } = data;
  if (!score) return "数据库中未找到该股票数据。";
  const lines = [
    `股票：${score.nameZh ?? score.name}（${score.symbol}）`,
    `现价：¥${score.latestClose?.toLocaleString() ?? "—"}`,
    `AI总分：${score.totalScore ?? "—"} 动态分：${score.adaptiveScore ?? "—"}`,
    `推荐：${score.recommendation ?? "—"}`,
    `维度分：技术${score.technicalScore} 基本面${score.fundamentalScore} 資金${score.moneyFlowScore} 情绪${score.newsSentimentScore} 全球${score.globalTrendScore}`,
    `涨跌：5日${score.return5d != null ? (score.return5d >= 0 ? "+" : "") + score.return5d.toFixed(1) + "%" : "—"} 20日${score.return20d != null ? (score.return20d >= 0 ? "+" : "") + score.return20d.toFixed(1) + "%" : "—"}`,
    `RSI(14)：${score.rsi14?.toFixed(1) ?? "—"} MACD：${score.macdSignalLabel ?? "—"} 均线：${score.maTrend ?? "—"}`,
    `风格：${score.stockStyle ?? "—"} FX敏感度：${score.fxSensitivity ?? "—"} 催化剂：${score.catalystScore ?? "—"}/10`,
    stock?.sector ? `行业：${stock.sector} 市值：${stock.marketCap ? stock.marketCap.toFixed(0) + "億円" : "—"} PER：${stock.per?.toFixed(1) ?? "—"} PBR：${stock.pbr?.toFixed(1) ?? "—"}` : "",
    fin ? `最新财务：${fin.fiscalYear}年 收入${fin.revenue ? (fin.revenue / 1e8).toFixed(0) + "億" : "—"} 营业利润${fin.operatingProfit ? (fin.operatingProfit / 1e8).toFixed(0) + "億" : "—"} EPS${fin.eps?.toFixed(0) ?? "—"}円 ROE${fin.roe?.toFixed(1) ?? "—"}%` : "",
    score.summaryReason ? `系统评语：${score.summaryReason.slice(0, 100)}` : "",
    score.highRiskFlag ? "⚠ 高风险标记" : "",
  ].filter(Boolean);

  if (recentNews.length) {
    lines.push(`近7日新闻（${recentNews.length}条）：`);
    recentNews.forEach((n) => lines.push(`  [${n.sentiment ?? "NEUTRAL"}] ${n.title}`));
  }
  return lines.join("\n");
}

function buildThemeContext(data: Awaited<ReturnType<typeof fetchThemeStocks>>, theme: string) {
  const { themeStocks, globalMarket, instFlow } = data;
  const lines: string[] = [`主题：${theme}`];

  if (globalMarket) {
    lines.push(
      `全球市场（${globalMarket.date.toISOString().split("T")[0]}）：` +
      `NASDAQ${globalMarket.nasdaqChange != null ? (globalMarket.nasdaqChange >= 0 ? "+" : "") + globalMarket.nasdaqChange.toFixed(1) + "%" : "—"}` +
      ` VIX=${globalMarket.vix?.toFixed(1) ?? "—"}` +
      ` 日经${globalMarket.nikkeiChange != null ? (globalMarket.nikkeiChange >= 0 ? "+" : "") + globalMarket.nikkeiChange.toFixed(1) + "%" : "—"}` +
      ` 全球评分${globalMarket.score ?? "—"}/10`
    );
  }
  if (instFlow) {
    lines.push(`机构资金（${instFlow.date.toISOString().split("T")[0]}）：${instFlow.investorType} 净${instFlow.netAmount != null ? (instFlow.netAmount >= 0 ? "+" : "") + instFlow.netAmount.toFixed(1) + "億円" : "—"}`);
  }

  if (!themeStocks.length) {
    lines.push("数据库中未找到该主题相关股票数据。");
  } else {
    lines.push(`${theme}相关股票（按评分）：`);
    themeStocks.forEach((s, i) => {
      lines.push(
        `${i + 1}. ${s.nameZh ?? s.name}（${s.symbol.replace(".T", "")}）` +
        ` 总分${s.totalScore} ${s.recommendation}` +
        ` 5日${s.return5d != null ? (s.return5d >= 0 ? "+" : "") + s.return5d.toFixed(1) + "%" : "—"}`
      );
    });
  }
  return lines.filter(Boolean).join("\n");
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: { message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const message = (body.message ?? "").trim();
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  if (!isOpenAIConfigured()) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured", reply: "AI服务未配置，请联系管理员。" },
      { status: 503 }
    );
  }

  const intent = classifyIntent(message);

  try {
    let dbContext: string;
    let question = message;

    switch (intent.type) {
      case "top_picks": {
        const picks = await fetchTopPicks();
        dbContext = buildTopPicksContext(picks);
        question = "根据以上数据，给出今日AI推荐TOP5分析，说明推荐理由。";
        break;
      }
      case "stock_analysis": {
        const data = await fetchStockData(intent.code);
        dbContext = buildStockContext(data);
        question = `用户问：${message}。根据以上数据，对该股票进行简洁分析，包括评分、技术面、基本面要点和操作建议。`;
        break;
      }
      case "theme_best": {
        const data = await fetchThemeStocks(intent.theme);
        dbContext = buildThemeContext(data, intent.theme);
        question = `用户问：${message}。根据以上数据，指出${intent.theme}中评分最高的股票并说明理由。`;
        break;
      }
      case "theme_outlook": {
        const data = await fetchThemeStocks(intent.theme);
        dbContext = buildThemeContext(data, intent.theme);
        question = `用户问：${message}。根据以上数据，结合全球市场和机构资金数据，给出${intent.theme}当前是否适合买入的判断。`;
        break;
      }
      default: {
        return NextResponse.json({
          intent: "unknown",
          reply: `暂不支持该问题类型。\n\n支持的查询：\n• 今天买什么？\n• 分析7203（股票代码）\n• 科技股谁最强？\n• 半导体还能买吗？`,
        });
      }
    }

    const reply = await callGPT(question, dbContext);

    return NextResponse.json({
      intent: intent.type,
      ...(intent.type === "stock_analysis" ? { code: intent.code } : {}),
      ...(intent.type === "theme_best" || intent.type === "theme_outlook" ? { theme: (intent as { theme: string }).theme } : {}),
      reply,
      dbContext,
    });
  } catch (err) {
    console.error("[api/chat] error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg, reply: "服务暂时不可用，请稍后再试。" }, { status: 500 });
  }
}
