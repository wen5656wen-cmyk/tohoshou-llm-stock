/**
 * TOHOSHOU AI Agent — LINE text handler
 *
 * STRICT_REAL_DATA 模式：
 * - 所有股票名称/代码/评分均来自 StockScore DB
 * - GPT 仅负责格式化已有 DB 数据（深度分析）
 * - 禁止 GPT 自由生成任何股票推荐
 * - buildGeneralReply 不再调用 GPT，直接返回使用指南
 * - 已删除 upProb"上涨概率"（伪造指标）
 */

import OpenAI from "openai";
import { prisma } from "@/lib/prisma";

const STRICT = process.env.STRICT_REAL_DATA === "true";

// ── AI Client ─────────────────────────────────────────────────────────────────

const AI_KEY = process.env.OPENAI_API_KEY ?? process.env.DEEPSEEK_API_KEY ?? "";
const AI_BASE_URL = process.env.OPENAI_API_KEY
  ? "https://api.openai.com/v1"
  : (process.env.OPENAI_BASE_URL ?? "https://api.deepseek.com");
const AI_MODEL = process.env.OPENAI_API_KEY
  ? (process.env.OPENAI_MODEL ?? "gpt-4o-mini")
  : (process.env.AI_MODEL ?? "deepseek-chat");

let _client: OpenAI | null = null;
function aiClient(): OpenAI | null {
  if (!AI_KEY) return null;
  _client ??= new OpenAI({ apiKey: AI_KEY, baseURL: AI_BASE_URL });
  return _client;
}

// temperature 0.2 — 降低随机性，防止 GPT 自由发挥
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
      temperature: 0.2,
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
  | { type: "unknown" };

export function parseIntent(raw: string): Intent {
  const t = raw.trim();

  if (/^(你好|嗨|hi|hello|\/start|哈喽|早安|晚安)$/i.test(t)) return { type: "greeting" };
  if (/^(帮助|help|\/help|指令|使用方法|怎么用|命令)$/i.test(t)) return { type: "help" };

  // 分析XXXX
  const analysisMatch = t.match(/^分析\s*(\d{4})/);
  if (analysisMatch) return { type: "analysis", code: analysisMatch[1] };

  // 纯4位代码
  const codeMatch = t.match(/^(\d{4})$/);
  if (codeMatch) return { type: "stock", code: codeMatch[1] };

  // 推荐（含"再推荐"/"推荐五只"/"推荐十只"等所有变体）
  if (/推荐|精选|top10?|picks/i.test(t)) return { type: "picks" };

  // 新闻
  if (/新闻|资讯|news|头条/i.test(t)) return { type: "news" };

  // 不支持的查询 — 不调用 GPT
  return { type: "unknown" };
}

// ── Formatters ────────────────────────────────────────────────────────────────

function pct(v: number | null | undefined): string {
  if (v == null) return "—";
  return (v >= 0 ? "▲+" : "▼") + Math.abs(v).toFixed(1) + "%";
}

function recLabel(r: string | null | undefined): string {
  const m: Record<string, string> = {
    STRONG_BUY: "强烈买入 🔥",
    BUY:        "买入 🟢",
    HOLD:       "持有 🟡",
    WATCH:      "关注 🟠",
    AVOID:      "回避 🔴",
  };
  return m[r ?? ""] ?? (r ?? "—");
}

function maTrendLabel(t: string | null | undefined): string {
  const m: Record<string, string> = {
    GOLDEN:  "黄金叉 ↑↑↑",
    BULLISH: "偏强 ↑",
    NEUTRAL: "中性整理",
    BEARISH: "偏弱 ↓",
    DEAD:    "死亡叉 ↓↓↓",
  };
  return m[t ?? ""] ?? (t ?? "—");
}

function rsiNote(rsi: number | null | undefined): string {
  if (rsi == null) return "";
  if (rsi >= 80) return "（严重超买⚠️）";
  if (rsi >= 70) return "（超买区）";
  if (rsi <= 20) return "（极度超卖）";
  if (rsi <= 30) return "（超卖区）";
  return "";
}

function macdLabel(sig: string | null | undefined): string {
  if (sig === "BUY")  return "买入信号 ↑";
  if (sig === "SELL") return "卖出信号 ↓";
  return "中性";
}

function scoreTag(s: number | null): string {
  if (s == null) return "—";
  if (s >= 80) return `${s}分 🔥`;
  if (s >= 65) return `${s}分 🟡`;
  if (s >= 50) return `${s}分 🟠`;
  return `${s}分 🔴`;
}

function jstnow(): string {
  return new Date(Date.now() + 9 * 3600000)
    .toISOString().replace("T", " ").substring(0, 16) + " JST";
}

// ── Response builders ─────────────────────────────────────────────────────────

function buildGreeting(): string {
  return [
    "你好，我是 TOHOSHOU AI 🤖",
    "",
    "支持的查询：",
    "",
    "1️⃣  查询个股",
    "   → 发送4位代码，如：7203",
    "",
    "2️⃣  深度分析",
    "   → 发送：分析7203",
    "",
    "3️⃣  AI推荐",
    "   → 发送：推荐",
    "",
    "4️⃣  最新新闻",
    "   → 发送：新闻",
    "",
    "5️⃣  帮助",
    "   → 发送：帮助",
    "",
    "⚠ 所有数据来自真实数据库",
    "不是投资建议",
  ].join("\n");
}

function buildHelp(): string {
  return [
    "📖 TOHOSHOU AI 使用指南",
    "━━━━━━━━━━",
    "",
    "🔍 个股查询",
    "  7203 → 丰田汽车股价/评分",
    "  分析7203 → 完整基本面+技术面",
    "",
    "🏆 AI推荐",
    "  推荐 / 推荐十只",
    "  → REAL评分 TOP10（真实DB数据）",
    "",
    "📰 市场新闻",
    "  新闻 → 最新5条资讯",
    "",
    "━━━━━━━━━━",
    "⚠ STRICT_REAL_DATA 模式已开启",
    "所有数据来自真实数据库",
    "非投资建议",
  ].join("\n");
}

async function buildStockReply(code: string): Promise<string> {
  const symbol = code + ".T";
  const score = await prisma.stockScore.findUnique({ where: { symbol } });

  if (!score?.latestClose) {
    return [
      `❌ 未找到股票代码 ${code} 的数据`,
      "",
      "• 请确认为4位东证代码（如 7203）",
      "• 该代码可能不在3716只监控范围内",
    ].join("\n");
  }

  // summaryReason 来自 compute-scores.ts 规则引擎，非 GPT 编造
  const reason = score.summaryReason
    ? score.summaryReason.slice(0, 120)
    : "暂无评分说明（请重新运行 compute-scores）";

  return [
    `📊 ${score.nameZh ?? score.name}（${code}.T）`,
    `━━━━━━━━━━`,
    ``,
    `最新股价：¥${score.latestClose.toLocaleString()}`,
    `5日涨跌：${pct(score.return5d)}`,
    `20日涨跌：${pct(score.return20d)}`,
    ``,
    `━━━━━━━━━━`,
    `AI评分：${scoreTag(score.totalScore)}`,
    `评级：${recLabel(score.recommendation)}`,
    ``,
    `技术面：${score.technicalScore ?? "—"}/30`,
    `基本面：${score.fundamentalScore ?? "—"}/25`,
    `资金面：${score.moneyFlowScore ?? "—"}/20`,
    `情绪面：${score.newsSentimentScore ?? "—"}/15`,
    `全球：${score.globalTrendScore ?? "—"}/10`,
    ``,
    `━━━━━━━━━━`,
    `RSI(14)：${score.rsi14?.toFixed(1) ?? "—"}${rsiNote(score.rsi14)}`,
    `MACD：${macdLabel(score.macdSignalLabel)}`,
    `均线趋势：${maTrendLabel(score.maTrend)}`,
    ``,
    `━━━━━━━━━━`,
    `📝 评分说明`,
    reason,
    ``,
    `📊 数据来源：J-Quants / TOHOSHOU AI V7.5`,
    `⏰ ${jstnow()}`,
    ``,
    `⚠ 非投资建议`,
  ].join("\n");
}

async function buildPicksReply(): Promise<string> {
  // STRICT：必须 scoreSource='REAL'，按 adaptiveScore DESC 排序
  const picks = await prisma.stockScore.findMany({
    where: {
      scoreSource: "REAL",
      priceCount: { gte: 20 },
      adaptiveScore: { not: null },
    },
    orderBy: { adaptiveScore: "desc" },
    take: 10,
    select: {
      symbol: true,
      name: true,
      nameZh: true,
      totalScore: true,
      adaptiveScore: true,
      recommendation: true,
      return5d: true,
      latestClose: true,
      stockStyle: true,
    },
  });

  if (picks.length === 0) {
    return [
      "⚠️ 暂无符合条件的真实评分数据",
      "",
      "数据库中当前没有 scoreSource=REAL 的评分记录。",
      "请先执行：npm run compute-scores",
    ].join("\n");
  }

  const nums = ["①","②","③","④","⑤","⑥","⑦","⑧","⑨","⑩"];
  const lines = [
    `🏆 AI推荐 TOP${picks.length}`,
    `⏰ ${jstnow()}`,
    `（scoreSource=REAL，adaptiveScore排序）`,
    `━━━━━━━━━━`,
    "",
  ];

  for (let i = 0; i < picks.length; i++) {
    const p = picks[i];
    const code = p.symbol.replace(".T", "");
    const name = p.nameZh ?? p.name;
    const score = p.adaptiveScore?.toFixed(0) ?? p.totalScore ?? "—";
    const price = p.latestClose != null ? `¥${p.latestClose.toLocaleString()}` : "—";
    lines.push(
      `${nums[i]} ${name}（${code}）`,
      `   评分：${score}  ${recLabel(p.recommendation)}`,
      `   股价：${price}  5日：${pct(p.return5d)}`,
      `   风格：${p.stockStyle ?? "—"}`,
      ""
    );
  }

  lines.push(
    `━━━━━━━━━━`,
    `📊 数据来源：J-Quants / TOHOSHOU AI V7.5`,
    `⚠ 非投资建议`
  );

  return lines.join("\n");
}

async function buildNewsReply(): Promise<string> {
  const news = await prisma.news.findMany({
    orderBy: { publishedAt: "desc" },
    take: 5,
    select: { title: true, sentiment: true, publishedAt: true, source: true },
  });

  if (news.length === 0) return "📰 暂无最新新闻，请稍后再试。";

  const sentIcon = (s: string | null) =>
    s === "POSITIVE" ? "🟢" : s === "NEGATIVE" ? "🔴" : "⚪";

  const timeAgo = (d: Date): string => {
    const mins = Math.floor((Date.now() - d.getTime()) / 60000);
    if (mins < 60)   return `${mins}分钟前`;
    if (mins < 1440) return `${Math.floor(mins / 60)}小时前`;
    return `${Math.floor(mins / 1440)}天前`;
  };

  const lines = [`📰 最新市场资讯`, `⏰ ${jstnow()}`, `━━━━━━━━━━`, ""];
  for (const n of news) {
    lines.push(
      `${sentIcon(n.sentiment)} ${n.title.slice(0, 60)}`,
      `   ${timeAgo(n.publishedAt)} · ${n.source}`,
      ""
    );
  }
  return lines.join("\n").trimEnd();
}

// Pure structured analysis — no GPT. All data from DB only.
// (LINE will use buildStockCard Flex for stock queries; this is web/text fallback)
async function buildAnalysisReply(code: string): Promise<string> {
  const symbol = code + ".T";
  const [score, stock, financials] = await Promise.all([
    prisma.stockScore.findUnique({ where: { symbol } }),
    prisma.stock.findUnique({
      where: { symbol },
      select: { sector: true, marketCap: true, per: true, pbr: true },
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

  if (!score) {
    return [
      `❌ 未找到股票 ${code}.T 的数据`,
      "",
      "• 请确认为4位东证代码（如 7203）",
      "• 该代码可能不在3716只监控范围内",
    ].join("\n");
  }

  const f = financials[0];
  const STYLE_LABEL: Record<string, string> = {
    VALUE_DEFENSIVE: "价值防御型", GROWTH_MOMENTUM: "成长动能型",
    QUALITY_COMPOUNDER: "优质复利型", SPECULATIVE_MOMENTUM: "投机动能型",
    CYCLICAL_EXPORTER: "周期出口型", DOMESTIC_DEFENSIVE: "内需防御型",
  };

  return [
    `📊 ${score.nameZh ?? score.name}（${code}.T）`,
    `━━━━━━━━━━`,
    ``,
    `【基本信息】`,
    `行业：${stock?.sector ?? "—"}`,
    `最新股价：¥${score.latestClose?.toLocaleString() ?? "—"}`,
    `数据日期：${score.latestDate ?? "—"}`,
    ``,
    `【AI评分】`,
    `总分：${scoreTag(score.totalScore)}`,
    `风格评分(adaptiveScore)：${score.adaptiveScore?.toFixed(1) ?? "—"}/100`,
    `风格(stockStyle)：${score.stockStyle ? (STYLE_LABEL[score.stockStyle] ?? score.stockStyle) : "—"}`,
    `评级：${recLabel(score.recommendation)}`,
    `数据质量：${score.scoreSource === "REAL" ? "✅ REAL" : score.scoreSource ?? "—"}`,
    ``,
    `【五维评分】`,
    `技术面：${score.technicalScore ?? "—"}/30`,
    `基本面：${score.fundamentalScore ?? "—"}/25`,
    `资金面：${score.moneyFlowScore ?? "—"}/20`,
    `情绪面：${score.newsSentimentScore ?? "—"}/15`,
    `全球趋势：${score.globalTrendScore ?? "—"}/10`,
    ``,
    `【技术指标】`,
    `RSI(14)：${score.rsi14?.toFixed(1) ?? "—"}${rsiNote(score.rsi14)}`,
    `MACD：${macdLabel(score.macdSignalLabel)}`,
    `均线趋势：${maTrendLabel(score.maTrend)}`,
    `5日：${pct(score.return5d)}  20日：${pct(score.return20d)}  60日：${pct(score.return60d)}`,
    ``,
    ...(f ? [
      `【财务（${f.fiscalYear}年度）】`,
      `营收：${f.revenue ? (f.revenue/1e8).toFixed(1)+"億円" : "—"}`,
      `营业利润：${f.operatingProfit ? (f.operatingProfit/1e8).toFixed(1)+"億円" : "—"}`,
      `EPS：${f.eps?.toFixed(0) ?? "—"}円  ROE：${f.roe?.toFixed(1) ?? "—"}%`,
      `自有资本率：${f.equityRatio?.toFixed(1) ?? "—"}%`,
      `PER：${stock?.per?.toFixed(1) ?? "—"}倍  PBR：${stock?.pbr?.toFixed(1) ?? "—"}倍`,
      ``,
    ] : []),
    `━━━━━━━━━━`,
    `📊 数据来源：J-Quants / TOHOSHOU AI V7.6`,
    `⏰ ${jstnow()}`,
    `⚠ 非投资建议`,
  ].join("\n");
}

// ── Main Export ───────────────────────────────────────────────────────────────

export async function processMessage(text: string): Promise<string> {
  const intent = parseIntent(text);
  console.log(`[ai-agent] intent=${intent.type} text="${text.slice(0, 40)}" strict=${STRICT}`);

  switch (intent.type) {
    case "greeting":  return buildGreeting();
    case "help":      return buildHelp();
    case "stock":     return buildStockReply(intent.code);
    case "analysis":  return buildAnalysisReply(intent.code);
    case "picks":     return buildPicksReply();
    case "news":      return buildNewsReply();
    case "unknown":
      // STRICT 模式：不调用 GPT，直接返回使用指南
      return [
        `🤖 TOHOSHOU AI`,
        ``,
        `不支持该查询："${text.slice(0, 30)}"`,
        ``,
        `支持的指令：`,
        `• 7203 → 个股查询`,
        `• 分析7203 → 深度分析`,
        `• 推荐 → AI TOP10（真实数据）`,
        `• 新闻 → 最新资讯`,
        `• 帮助 → 使用指南`,
      ].join("\n");
  }
}

