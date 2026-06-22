/**
 * 企业微信智能机器人问答核心逻辑（v11.2）
 * 数据来源：Stock / StockScore / GPTScore / DailyRecommendation / BacktestResult / News
 * 无 GPT 调用，所有回答均来自 DB。
 */

import { prisma } from "./prisma";

export type QueryType =
  | "stock"
  | "recommendations"
  | "strong_buy"
  | "backtest"
  | "help";

export interface ChatResponse {
  ok: boolean;
  type: QueryType | "error";
  text: string;
  data?: unknown;
}

const DISCLAIMER = "\n\n⚠️ 以上为AI模型评估，不构成投资建议，投资有风险。";

// ── 意图检测 ──────────────────────────────────────────────────────────────────

function detectQueryType(msg: string): QueryType {
  const m = msg.toLowerCase();

  // 推荐类（优先匹配，防止"今日推荐"被数字误识别）
  if (/今日推荐|今天推荐|有哪些推荐|今天买什么|推荐什么|今日买入|每日推荐/.test(msg)) {
    return "recommendations";
  }

  // 强力买入类
  if (/strong\s*buy|强烈买入|强烈推荐|高评分股票|强力买入|高分股票/.test(m)) {
    return "strong_buy";
  }

  // 回测类
  if (/回测|backtest|历史表现|胜率|历史收益/.test(m)) {
    return "backtest";
  }

  // 股票代码（3-4位数字，可选 .T / A后缀）
  if (/\d{3,4}[A-Za-z]?/.test(msg)) {
    return "stock";
  }

  // 帮助
  return "help";
}

// ── 工具函数 ──────────────────────────────────────────────────────────────────

function fmtScore(v: number | null | undefined) {
  return v != null ? v.toFixed(1) : "—";
}

function fmtRet(v: number | null | undefined) {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function fmtPrice(v: number | null | undefined) {
  if (v == null) return "暂无";
  return `¥${v.toLocaleString("ja-JP")}`;
}

function recZh(r: string | null | undefined) {
  switch (r) {
    case "STRONG_BUY": return "强烈买入 🔴";
    case "BUY":        return "买入 🟢";
    case "HOLD":       return "持有 ⚪";
    case "WATCH":      return "观察 🟡";
    case "AVOID":      return "回避 ⚫";
    default:           return r ?? "—";
  }
}

function actionZh(a: string | null | undefined) {
  switch (a) {
    case "BUY_NOW":       return "✅ 当前可考虑买入（信号较强）";
    case "WAIT_PULLBACK": return "⏳ 等待回调后低吸";
    case "HOLD":          return "⚪ 暂时持有观望";
    case "TAKE_PROFIT":   return "💰 可考虑获利了结";
    case "SELL":          return "🔴 建议减仓离场";
    case "AVOID":         return "⛔ 当前建议回避";
    default:              return "暂无明确建议";
  }
}

// ── 股票查询 ──────────────────────────────────────────────────────────────────

async function handleStockQuery(msg: string): Promise<ChatResponse> {
  // 提取股票代码
  const codeMatch = msg.match(/(\d{3,4}[A-Za-z]?)(?:\.T)?/);
  let symbol: string | null = null;
  let nameSearch: string | null = null;

  if (codeMatch) {
    const raw = codeMatch[1].toUpperCase();
    // 尝试 raw + .T 和 raw 两种形式
    symbol = raw.endsWith(".T") ? raw : `${raw}.T`;
  } else {
    // 提取中文/日文公司名称
    const cjk = msg
      .replace(/能买吗|怎么样|如何|值得买吗|分析一下|查查|查一下|好吗|行吗|怎么看/g, "")
      .match(/[一-龥぀-ゟ゠-ヿ]+/);
    if (cjk) nameSearch = cjk[0];
  }

  // 查询 StockScore
  let score = symbol
    ? await prisma.stockScore.findUnique({ where: { symbol } })
    : null;

  // fallback：去掉 .T 后缀再试
  if (!score && symbol) {
    const bareCode = symbol.replace(/\.T$/, "");
    score = await prisma.stockScore.findUnique({ where: { symbol: bareCode } });
    if (score) symbol = bareCode;
  }

  // 按名称搜索
  if (!score && nameSearch) {
    const stockByName = await prisma.stock.findFirst({
      where: {
        OR: [
          { nameZh: { contains: nameSearch } },
          { name: { contains: nameSearch } },
        ],
      },
      select: { symbol: true },
    });
    if (stockByName) {
      symbol = stockByName.symbol;
      score = await prisma.stockScore.findUnique({ where: { symbol } });
    }
  }

  if (!score || !symbol) {
    const queryDesc = symbol ?? nameSearch ?? msg.slice(0, 20);
    return {
      ok: true,
      type: "stock",
      text: `暂未找到「${queryDesc}」的相关数据。\n\n请确认股票代码格式（如 7203 或 7203.T），或检查公司名称是否正确。`,
    };
  }

  // GPTScore（可能没有）
  const gpt = await prisma.gPTScore.findUnique({ where: { symbol } }).catch(() => null);

  // 最近新闻（2条）
  const stockRow = await prisma.stock.findUnique({
    where: { symbol },
    select: { id: true },
  });
  const news = stockRow
    ? await prisma.news.findMany({
        where: { stockId: stockRow.id, relatedSymbolConfidence: { gte: 50 } },
        orderBy: { publishedAt: "desc" },
        take: 2,
        select: { title: true, publishedAt: true, sentiment: true },
      })
    : [];

  const displayName = score.nameZh ?? score.name;
  const risks: string[] = gpt?.risks ? (gpt.risks as string[]).slice(0, 2) : [];
  const riskLine = risks.length > 0
    ? risks.map((r) => `・${r}`).join("\n")
    : "暂无GPT风险分析数据";

  const newsLines =
    news.length > 0
      ? news
          .map((n) => {
            const d = n.publishedAt.toISOString().slice(0, 10);
            const senti =
              n.sentiment === "POSITIVE" ? "📈" : n.sentiment === "NEGATIVE" ? "📉" : "📰";
            return `${senti} [${d}] ${n.title}`;
          })
          .join("\n")
      : "暂无近期新闻";

  const gptSummary = gpt?.summaryZh ? `\n\n💬 AI点评：${gpt.summaryZh.slice(0, 100)}…` : "";

  const text = [
    `📊 **${displayName}**（${symbol}）`,
    `━━━━━━━━━━━━━━━━`,
    `最新价格：${fmtPrice(score.latestClose)}（5日：${fmtRet(score.return5d)}）`,
    `AI综合评分：${fmtScore(score.adaptiveScore)} / 100`,
    `评级：${recZh(score.recommendationV2)}`,
    `AI建议：${actionZh(score.tradingAction)}`,
    ``,
    `⚠️ 主要风险：`,
    riskLine,
    ``,
    `📰 最近新闻：`,
    newsLines,
    gptSummary,
    DISCLAIMER,
  ].join("\n");

  return {
    ok: true,
    type: "stock",
    text,
    data: {
      symbol,
      name: score.nameZh ?? score.name,
      latestClose: score.latestClose,
      return5d: score.return5d,
      adaptiveScore: score.adaptiveScore,
      recommendationV2: score.recommendationV2,
      tradingAction: score.tradingAction,
    },
  };
}

// ── 今日推荐 ──────────────────────────────────────────────────────────────────

async function handleRecommendationsQuery(): Promise<ChatResponse> {
  // 取最新日期的 DailyRecommendation
  const latest = await prisma.dailyRecommendation.findFirst({
    orderBy: { date: "desc" },
    select: { date: true },
  });

  if (!latest) {
    return {
      ok: true,
      type: "recommendations",
      text: "暂无今日推荐数据。AI推荐每日 08:30 JST 更新，请稍后再查询。",
    };
  }

  const recs = await prisma.dailyRecommendation.findMany({
    where: { date: latest.date },
    orderBy: { gptRank: "asc" },
    take: 5,
    select: {
      symbol: true,
      gptRank: true,
      finalScore: true,
      gptRating: true,
      summaryZh: true,
      buyPrice: true,
    },
  });

  if (recs.length === 0) {
    return {
      ok: true,
      type: "recommendations",
      text: "今日推荐数据处理中，请稍后再查询。",
    };
  }

  // 批量补充 StockScore 姓名
  const symbols = recs.map((r) => r.symbol);
  const scores = await prisma.stockScore.findMany({
    where: { symbol: { in: symbols } },
    select: { symbol: true, name: true, nameZh: true, adaptiveScore: true, recommendationV2: true },
  });
  const scoreMap = new Map(scores.map((s) => [s.symbol, s]));

  const dateStr = latest.date.toISOString().slice(0, 10);
  const lines = recs.map((r, i) => {
    const sc = scoreMap.get(r.symbol);
    const name = sc?.nameZh ?? sc?.name ?? r.symbol;
    const rating = recZh(r.gptRating ?? sc?.recommendationV2);
    const summary = r.summaryZh ? r.summaryZh.slice(0, 60) + "…" : "暂无摘要";
    return `${i + 1}. **${name}**（${r.symbol}）\n   评分 ${fmtScore(r.finalScore)} | ${rating}\n   ${summary}`;
  });

  const text = [
    `📈 **今日AI推荐 Top5**（${dateStr}）`,
    `━━━━━━━━━━━━━━━━`,
    lines.join("\n\n"),
    DISCLAIMER,
  ].join("\n");

  return {
    ok: true,
    type: "recommendations",
    text,
    data: { date: dateStr, count: recs.length },
  };
}

// ── STRONG BUY 查询 ──────────────────────────────────────────────────────────

async function handleStrongBuyQuery(): Promise<ChatResponse> {
  const stocks = await prisma.stockScore.findMany({
    where: {
      OR: [
        { recommendationV2: "STRONG_BUY" },
        { adaptiveScore: { gte: 80 } },
      ],
      priceCount: { gte: 20 },
    },
    orderBy: [{ recommendationV2: "asc" }, { adaptiveScore: "desc" }],
    take: 10,
    select: {
      symbol: true,
      name: true,
      nameZh: true,
      adaptiveScore: true,
      recommendationV2: true,
      tradingAction: true,
      latestClose: true,
      return5d: true,
    },
  });

  if (stocks.length === 0) {
    return {
      ok: true,
      type: "strong_buy",
      text: "当前市场评级偏低，暂无 STRONG BUY 或评分 ≥80 的股票。\n建议关注市场情绪回暖后的机会。",
    };
  }

  const lines = stocks.map((s, i) => {
    const name = s.nameZh ?? s.name;
    const action = s.tradingAction === "BUY_NOW" ? " 🎯" : "";
    return `${i + 1}. **${name}**（${s.symbol}）\n   评分 ${fmtScore(s.adaptiveScore)} | ${recZh(s.recommendationV2)}${action} | ${fmtPrice(s.latestClose)}（${fmtRet(s.return5d)}）`;
  });

  const text = [
    `🔴 **STRONG BUY / 高评分 Top${stocks.length}**`,
    `━━━━━━━━━━━━━━━━`,
    lines.join("\n\n"),
    DISCLAIMER,
  ].join("\n");

  return {
    ok: true,
    type: "strong_buy",
    text,
    data: stocks.map((s) => ({
      symbol: s.symbol,
      name: s.nameZh ?? s.name,
      adaptiveScore: s.adaptiveScore,
      recommendationV2: s.recommendationV2,
    })),
  };
}

// ── 回测查询 ──────────────────────────────────────────────────────────────────

async function handleBacktestQuery(): Promise<ChatResponse> {
  const latest = await prisma.backtestResult.findFirst({
    where: { portfolioSize: "TOP10", horizon: "7d", winRate: { not: null } },
    orderBy: { date: "desc" },
    select: { date: true },
  });

  if (!latest) {
    return {
      ok: true,
      type: "backtest",
      text: "暂无可展示回测数据。\n\n回测需要积累 7 个交易日以上的历史价格数据，通常推荐发布后 2 周内开始产生统计结果。",
    };
  }

  const results = await prisma.backtestResult.findMany({
    where: { date: latest.date, portfolioSize: { in: ["TOP10", "ALL"] } },
    select: {
      horizon: true,
      portfolioSize: true,
      winRate: true,
      avgReturn: true,
      medianReturn: true,
      filled: true,
      benchmarkNikkeiReturn: true,
      excessVsNikkei: true,
    },
  });

  if (results.length === 0) {
    return {
      ok: true,
      type: "backtest",
      text: "暂无可展示回测数据。",
    };
  }

  const dateStr = latest.date.toISOString().slice(0, 10);
  const byHorizon = new Map<string, typeof results[0][]>();
  for (const r of results) {
    const arr = byHorizon.get(r.horizon) ?? [];
    arr.push(r);
    byHorizon.set(r.horizon, arr);
  }

  function summarizeHorizon(h: string, label: string): string {
    const rows = byHorizon.get(h) ?? [];
    const top10 = rows.find((r) => r.portfolioSize === "TOP10");
    const all = rows.find((r) => r.portfolioSize === "ALL");
    if (!top10 && !all) return "";
    const r = top10 ?? all!;
    const excess = r.excessVsNikkei != null ? `（超额 ${fmtRet(r.excessVsNikkei)}）` : "";
    return `${label}：胜率 ${r.winRate != null ? r.winRate.toFixed(1) + "%" : "—"} | 均收益 ${fmtRet(r.avgReturn)}${excess}`;
  }

  const lines = [
    summarizeHorizon("7d", "7日"),
    summarizeHorizon("30d", "30日"),
    summarizeHorizon("90d", "90日"),
  ].filter(Boolean);

  const text = [
    `📊 **AI回测结果**（最新：${dateStr}）`,
    `━━━━━━━━━━━━━━━━`,
    lines.length > 0 ? lines.join("\n") : "数据积累中…",
    ``,
    `_数据基于每日 AI Top10 推荐的历史模拟，不代表真实交易结果。_`,
    DISCLAIMER,
  ].join("\n");

  return {
    ok: true,
    type: "backtest",
    text,
    data: { date: dateStr, results },
  };
}

// ── 帮助 ──────────────────────────────────────────────────────────────────────

function helpResponse(): ChatResponse {
  return {
    ok: true,
    type: "help",
    text: [
      `🤖 **TOHOSHOU AI 使用指南**`,
      `━━━━━━━━━━━━━━━━`,
      `支持以下查询类型：`,
      ``,
      `📊 **股票查询**`,
      `「7203」「7203.T」「7203能买吗」「丰田怎么样」`,
      ``,
      `📈 **今日推荐**`,
      `「今日推荐」「今天买什么」「有哪些推荐」`,
      ``,
      `🔴 **强烈买入**`,
      `「STRONG BUY」「强烈买入」「高评分股票」`,
      ``,
      `📊 **回测结果**`,
      `「回测结果」「历史表现」「胜率」`,
    ].join("\n"),
  };
}

// ── 主入口 ────────────────────────────────────────────────────────────────────

export async function handleWecomQuery(message: string): Promise<ChatResponse> {
  const type = detectQueryType(message);

  switch (type) {
    case "stock":
      return handleStockQuery(message);
    case "recommendations":
      return handleRecommendationsQuery();
    case "strong_buy":
      return handleStrongBuyQuery();
    case "backtest":
      return handleBacktestQuery();
    default:
      return helpResponse();
  }
}
