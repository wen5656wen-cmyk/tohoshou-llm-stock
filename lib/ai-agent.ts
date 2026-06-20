/**
 * TOHOSHOU AI Agent
 *
 * Parses user intent → queries DB → calls AI API → returns Chinese response.
 * Works without AI key (template fallback). With AI key: richer analysis.
 */

import OpenAI from "openai";
import { prisma } from "@/lib/prisma";

// ── AI Client ─────────────────────────────────────────────────────────────────

const AI_KEY = process.env.OPENAI_API_KEY ?? process.env.DEEPSEEK_API_KEY ?? "";
const AI_BASE_URL = process.env.OPENAI_BASE_URL ?? "https://api.deepseek.com";
const AI_MODEL = process.env.AI_MODEL ?? "deepseek-chat";

let _client: OpenAI | null = null;
function aiClient(): OpenAI | null {
  if (!AI_KEY) return null;
  _client ??= new OpenAI({ apiKey: AI_KEY, baseURL: AI_BASE_URL });
  return _client;
}

async function callAI(system: string, user: string, maxTokens = 400): Promise<string> {
  const c = aiClient();
  if (!c) return "";
  try {
    const res = await c.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
    });
    return res.choices[0]?.message?.content?.trim() ?? "";
  } catch (err) {
    console.error("[ai-agent] AI call failed:", err);
    return "";
  }
}

// ── Intent ────────────────────────────────────────────────────────────────────

type Intent =
  | { type: "greeting" }
  | { type: "help" }
  | { type: "stock"; code: string }
  | { type: "analysis"; code: string }
  | { type: "picks" }
  | { type: "news" }
  | { type: "general"; text: string };

function parseIntent(raw: string): Intent {
  const t = raw.trim();

  if (/^(你好|嗨|hi|hello|\/start|哈喽|早安|晚安)$/i.test(t)) return { type: "greeting" };
  if (/^(帮助|help|\/help|指令|使用方法|怎么用|命令)$/i.test(t)) return { type: "help" };

  // 分析XXXX
  const analysisMatch = t.match(/^分析\s*(\d{4})/);
  if (analysisMatch) return { type: "analysis", code: analysisMatch[1] };

  // 纯4位代码
  const codeMatch = t.match(/^(\d{4})$/);
  if (codeMatch) return { type: "stock", code: codeMatch[1] };

  // 推荐
  if (/今[日天][的]?推荐|今日精选|今天推荐|推荐股|TOP10?|top10?|picks/i.test(t))
    return { type: "picks" };

  // 新闻
  if (/新闻|资讯|news|头条/i.test(t)) return { type: "news" };

  return { type: "general", text: t };
}

// ── Formatters ────────────────────────────────────────────────────────────────

function pct(v: number | null | undefined): string {
  if (v == null) return "—";
  return (v >= 0 ? "▲+" : "▼") + Math.abs(v).toFixed(1) + "%";
}

function recLabel(r: string | null | undefined): string {
  const m: Record<string, string> = {
    STRONG_BUY: "强烈买入 🔥",
    BUY: "买入 ✅",
    WATCH: "关注 👀",
    HOLD: "持有 ⏸",
    AVOID: "回避 ❌",
  };
  return m[r ?? ""] ?? (r ?? "—");
}

function maTrendLabel(t: string | null | undefined): string {
  const m: Record<string, string> = {
    GOLDEN:  "多头趋势↑↑",
    BULLISH: "偏强↑",
    NEUTRAL: "中性整理",
    BEARISH: "偏弱↓",
    DEAD:    "空头趋势↓↓",
  };
  return m[t ?? ""] ?? (t ?? "—");
}

function rsiNote(rsi: number | null | undefined): string {
  if (rsi == null) return "";
  if (rsi >= 80) return "（超买⚠️）";
  if (rsi >= 70) return "（偏高）";
  if (rsi <= 20) return "（超卖🟢）";
  if (rsi <= 30) return "（偏低）";
  return "";
}

function macdLabel(sig: string | null | undefined): string {
  if (sig === "BUY")  return "买入信号 ↑";
  if (sig === "SELL") return "卖出信号 ↓";
  return "中性";
}

function upProb(totalScore: number | null, techScore: number | null): number {
  const t = techScore ?? totalScore ?? 50;
  const s = totalScore ?? 50;
  return Math.min(99, Math.max(1, Math.round(t * 0.6 + s * 0.4)));
}

function scoreTag(s: number | null): string {
  if (s == null) return "—";
  if (s >= 80) return `${s}分 🔥`;
  if (s >= 65) return `${s}分 ✅`;
  if (s >= 45) return `${s}分 👀`;
  return `${s}分`;
}

// ── Response builders ─────────────────────────────────────────────────────────

function buildGreeting(): string {
  return [
    "你好，我是 TOHOSHOU AI 🤖",
    "",
    "可以帮你：",
    "",
    "1️⃣  分析股票",
    "   → 发送4位代码，如：7203",
    "",
    "2️⃣  查看今日推荐",
    "   → 发送：今日推荐",
    "",
    "3️⃣  查看新闻",
    "   → 发送：新闻",
    "",
    "4️⃣  深度分析",
    "   → 发送：分析7203",
    "",
    "5️⃣  帮助",
    "   → 发送：帮助",
    "",
    "请输入指令 👇",
  ].join("\n");
}

function buildHelp(): string {
  return [
    "📖 TOHOSHOU AI 使用指南",
    "━━━━━━━━━━━━━━━━",
    "",
    "🔍 股票查询",
    "  7203",
    "  → 股价、评分、RSI、MACD",
    "",
    "📊 深度分析",
    "  分析7203",
    "  → 完整基本面+技术面",
    "",
    "🏆 今日推荐",
    "  今日推荐",
    "  → AI精选 TOP10",
    "",
    "📰 市场新闻",
    "  新闻",
    "  → 最新财经资讯",
    "",
    "每天 08:30 JST 自动推送日报 🇯🇵",
  ].join("\n");
}

async function buildStockReply(code: string): Promise<string> {
  const symbol = code + ".T";
  const score = await prisma.stockScore.findUnique({ where: { symbol } });

  if (!score?.latestClose) {
    return [
      `未找到股票代码 ${code} 的数据。`,
      "",
      "请确认：",
      "• 东证4位数字代码（如 7203）",
      "• 数据库中已有该股票",
    ].join("\n");
  }

  const prob = upProb(score.totalScore, score.technicalScore);

  // AI理由：优先 summaryReason，其次调 AI 生成
  let reason = score.summaryReason ?? "";
  if (!reason) {
    reason = await callAI(
      "你是专业日本股市分析师，用中文回复，2句话，简洁专业。",
      `${score.name}（${code}），技术指标：RSI=${score.rsi14?.toFixed(0)}，MACD=${macdLabel(score.macdSignalLabel)}，均线=${maTrendLabel(score.maTrend)}，AI评分=${score.totalScore}，5日涨跌=${score.return5d?.toFixed(1)}%。请说明当前投资逻辑。`,
      150
    );
    reason = reason || "基于技术指标综合分析。";
  }

  return [
    `【${score.name}】`,
    `代码：${code}`,
    `━━━━━━━━━━━━━━━━`,
    ``,
    `现价：`,
    `¥${score.latestClose.toLocaleString()}`,
    ``,
    `5日涨跌：${pct(score.return5d)}`,
    `20日涨跌：${pct(score.return20d)}`,
    ``,
    `━━━━━━━━━━━━`,
    `AI评分：`,
    `${scoreTag(score.totalScore)}`,
    ``,
    `推荐：`,
    recLabel(score.recommendation),
    ``,
    `上涨概率：`,
    `${prob}%`,
    ``,
    `━━━━━━━━━━━━`,
    `RSI(14)：`,
    `${score.rsi14?.toFixed(1) ?? "—"}${rsiNote(score.rsi14)}`,
    ``,
    `MACD：`,
    macdLabel(score.macdSignalLabel),
    ``,
    `均线趋势：`,
    maTrendLabel(score.maTrend),
    ``,
    `━━━━━━━━━━━━`,
    `理由：`,
    reason,
  ].join("\n");
}

async function buildPicksReply(): Promise<string> {
  const picks = await prisma.stockScore.findMany({
    where: { priceCount: { gte: 20 } },
    orderBy: { totalScore: "desc" },
    take: 10,
    select: {
      symbol: true, name: true,
      totalScore: true, recommendation: true, return5d: true,
    },
  });

  if (picks.length === 0) return "暂无推荐数据，请稍后再试。";

  const now = new Date();
  const tokyoDate = new Date(now.getTime() + 9 * 3600000);
  const dateStr = tokyoDate.toISOString().split("T")[0];
  const nums = ["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣","🔟"];

  const lines = [
    `🏆 AI推荐 TOP${picks.length}`,
    `📅 ${dateStr}`,
    `━━━━━━━━━━━━━━━━`,
    ``,
  ];

  for (let i = 0; i < picks.length; i++) {
    const p = picks[i];
    const code = p.symbol.replace(".T", "");
    lines.push(
      `${nums[i]} ${p.name}（${code}）`,
      `   ${scoreTag(p.totalScore)}  ${pct(p.return5d)}`,
      ``
    );
  }

  lines.push(`发送代码查看详情，如：${picks[0].symbol.replace(".T", "")}`);
  return lines.join("\n");
}

async function buildNewsReply(): Promise<string> {
  const news = await prisma.news.findMany({
    orderBy: { publishedAt: "desc" },
    take: 5,
    select: { title: true, sentiment: true, publishedAt: true, source: true },
  });

  if (news.length === 0) return "暂无最新新闻。";

  const sentIcon = (s: string | null) =>
    s === "POSITIVE" ? "🟢" : s === "NEGATIVE" ? "🔴" : "⚪";

  const timeAgo = (d: Date): string => {
    const mins = Math.floor((Date.now() - d.getTime()) / 60000);
    if (mins < 60)   return `${mins}分钟前`;
    if (mins < 1440) return `${Math.floor(mins / 60)}小时前`;
    return `${Math.floor(mins / 1440)}天前`;
  };

  const lines = [`📰 最新市场资讯`, `━━━━━━━━━━━━━━━━`, ``];
  for (const n of news) {
    lines.push(
      `${sentIcon(n.sentiment)} ${n.title}`,
      `   ${timeAgo(n.publishedAt)} · ${n.source}`,
      ``
    );
  }

  return lines.join("\n").trimEnd();
}

async function buildAnalysisReply(code: string): Promise<string> {
  const symbol = code + ".T";

  const [score, stock, financials] = await Promise.all([
    prisma.stockScore.findUnique({ where: { symbol } }),
    prisma.stock.findUnique({
      where: { symbol },
      select: { sector: true, marketCap: true, per: true, pbr: true, roe: true },
    }),
    prisma.financial.findMany({
      where: { stock: { symbol } },
      orderBy: { fiscalYear: "desc" },
      take: 1,
      select: {
        fiscalYear: true, revenue: true, operatingProfit: true,
        netProfit: true, eps: true, roe: true, equityRatio: true,
      },
    }),
  ]);

  if (!score) return `未找到股票 ${code} 的数据。`;

  const f = financials[0];
  const maTrend = maTrendLabel(score.maTrend);
  const macd = macdLabel(score.macdSignalLabel);

  // Context for AI
  const ctx = [
    `公司：${score.name}（${code}，东京证券交易所）`,
    `板块：${stock?.sector ?? "—"}`,
    `当前价：¥${score.latestClose?.toLocaleString() ?? "—"}`,
    `AI综合评分：${score.totalScore}分（技术${score.technicalScore}，基本面${score.fundamentalScore}，資金面${score.moneyFlowScore ?? score.riskScore}）`,
    `推荐：${recLabel(score.recommendation)}`,
    `技术：RSI=${score.rsi14?.toFixed(1)}，MACD=${macd}，均线=${maTrend}`,
    `涨跌：5日=${score.return5d?.toFixed(1)}%，20日=${score.return20d?.toFixed(1)}%，60日=${score.return60d?.toFixed(1)}%`,
    ...(f ? [
      `${f.fiscalYear}年营业收入=${f.revenue ? (f.revenue/1e8).toFixed(0)+"亿円" : "—"}`,
      `营业利润=${f.operatingProfit ? (f.operatingProfit/1e8).toFixed(0)+"亿円" : "—"}`,
      `净利润=${f.netProfit ? (f.netProfit/1e8).toFixed(0)+"亿円" : "—"}`,
      `EPS=${f.eps?.toFixed(0) ?? "—"}円，ROE=${(f.roe ?? stock?.roe ?? 0).toFixed(1)}%`,
    ] : []),
    `市盈率=${stock?.per?.toFixed(1) ?? "—"}，市净率=${stock?.pbr?.toFixed(1) ?? "—"}`,
  ].join("\n");

  let aiAnalysis = await callAI(
    "你是资深日本股市分析师，用中文撰写，结构清晰，250字以内。",
    `对以下数据作投资分析，包含：①基本面评价 ②技术面分析 ③风险提示 ④综合建议\n\n${ctx}`,
    600
  );
  if (!aiAnalysis) aiAnalysis = score.summaryReason ?? "暂无AI分析，请配置 OPENAI_API_KEY 或 DEEPSEEK_API_KEY。";

  const lines = [
    `【${score.name}】完整分析`,
    `代码：${code}`,
    `━━━━━━━━━━━━━━━━`,
    ``,
    `📊 综合评分`,
    `总分：${scoreTag(score.totalScore)}`,
    `技术：${score.technicalScore ?? "—"}  基本面：${score.fundamentalScore ?? "—"}  資金面：${score.moneyFlowScore ?? score.riskScore ?? "—"}`,
    `推荐：${recLabel(score.recommendation)}`,
    ``,
    `━━━━━━━━━━━━`,
    `💹 技术面`,
    `现价：¥${score.latestClose?.toLocaleString() ?? "—"}`,
    `RSI(14)：${score.rsi14?.toFixed(1) ?? "—"}${rsiNote(score.rsi14)}`,
    `MACD：${macd}`,
    `均线趋势：${maTrend}`,
    `5日：${pct(score.return5d)}  20日：${pct(score.return20d)}  60日：${pct(score.return60d)}`,
    ``,
    ...(f ? [
      `━━━━━━━━━━━━`,
      `📈 基本面（${f.fiscalYear}年度）`,
      f.revenue        ? `营业收入：${(f.revenue/1e8).toFixed(0)}亿円`        : null,
      f.operatingProfit? `营业利润：${(f.operatingProfit/1e8).toFixed(0)}亿円` : null,
      f.netProfit      ? `净利润：${(f.netProfit/1e8).toFixed(0)}亿円`         : null,
      f.eps            ? `EPS：${f.eps.toFixed(0)}円`                          : null,
      (f.roe ?? stock?.roe) ? `ROE：${(f.roe ?? stock?.roe ?? 0).toFixed(1)}%` : null,
      f.equityRatio    ? `自有资本比率：${f.equityRatio.toFixed(1)}%`          : null,
      ``,
    ].filter((x): x is string => x !== null) : []),
    `━━━━━━━━━━━━`,
    `🤖 AI综合分析`,
    ``,
    aiAnalysis,
  ];

  return lines.join("\n");
}

async function buildGeneralReply(text: string): Promise<string> {
  if (!AI_KEY) {
    return `未识别指令："${text}"\n\n发送 帮助 查看全部指令。`;
  }

  const [topStock, scoreCount] = await Promise.all([
    prisma.stockScore.findFirst({
      where: { priceCount: { gte: 20 } },
      orderBy: { totalScore: "desc" },
      select: { name: true, totalScore: true },
    }),
    prisma.stockScore.count({ where: { priceCount: { gte: 20 } } }),
  ]);

  const marketCtx = `当前共 ${scoreCount} 只股票有AI评分。今日最高分：${topStock?.name ?? "—"}（${topStock?.totalScore ?? "—"}分）。`;

  const reply = await callAI(
    `你是TOHOSHOU AI，日本股市智能分析助手，用中文回复，简洁友好，100字以内。市场背景：${marketCtx}`,
    text,
    250
  );

  return reply || `未识别指令："${text}"\n\n发送 帮助 查看全部指令。`;
}

// ── Main Export ───────────────────────────────────────────────────────────────

export async function processMessage(text: string): Promise<string> {
  const intent = parseIntent(text);

  switch (intent.type) {
    case "greeting":  return buildGreeting();
    case "help":      return buildHelp();
    case "stock":     return buildStockReply(intent.code);
    case "analysis":  return buildAnalysisReply(intent.code);
    case "picks":     return buildPicksReply();
    case "news":      return buildNewsReply();
    case "general":   return buildGeneralReply(intent.text);
  }
}
