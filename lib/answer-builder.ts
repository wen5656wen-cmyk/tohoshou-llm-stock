/**
 * lib/answer-builder.ts — Answer Builder V7.9.1
 *
 * Builds the final response from DbQueryResult — no GPT calls.
 *   buildWebAnswer()   → formatted text for /api/chat (Web UI)
 *   buildLineMessages() → LINE messages (Flex cards + text)
 *
 * Forbidden phrases: "表现稳定", "建议关注", "预计上涨", "可能涨", "估计", "应该"
 * All content derives only from dbData fields.
 */

import type { LineMessage } from "@/lib/line";
import { textMsg } from "@/lib/line";
import type { DbQueryResult, StockSummary } from "@/lib/intent-schema";
import {
  buildTopPicksFlexV79,
  buildStockCardV79,
  buildMarketOverviewFlexV79,
  buildSectorFlexV79,
  buildHelpFlexV79,
  buildDataSourceFlexV79,
  type StockCardV79Data,
  type TopPickStock,
  type SectorStock,
} from "@/lib/line-flex-v79";
import { buildAiThemeChatFlex } from "@/lib/line-flex";
import { aiPicksUrl } from "@/lib/app-url";

// ── Shared text formatters ────────────────────────────────────────────────────

function fmtPct(v: number | null | undefined): string {
  if (v == null) return "—";
  return (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
}

function progressBar(val: number | null | undefined, max: number, width = 10): string {
  if (val == null) return "░".repeat(width);
  const filled = Math.max(0, Math.min(width, Math.round((val / max) * width)));
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function recEmoji(rec: string | null | undefined): string {
  return ({
    STRONG_BUY: "🔥 强烈买入",
    BUY: "🟢 买入",
    HOLD: "🟡 持有",
    WATCH: "🟠 关注",
    AVOID: "🔴 回避",
  } as Record<string, string>)[rec ?? ""] ?? "未评级";
}

function vixLabel(vix: number | null | undefined): string {
  if (vix == null) return "—";
  if (vix < 20) return "低恐慌";
  if (vix < 30) return "中等";
  return "高恐慌";
}

function styleLabel(s: string | null | undefined): string {
  return ({
    VALUE_DEFENSIVE: "价值防御",
    GROWTH_MOMENTUM: "成长动能",
    QUALITY_COMPOUNDER: "优质复利",
    SPECULATIVE_MOMENTUM: "投机动能",
    CYCLICAL_EXPORTER: "周期出口",
    DOMESTIC_DEFENSIVE: "内需防御",
  } as Record<string, string>)[s ?? ""] ?? (s ?? "—");
}

const SEP = "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";
const FOOTER = `\n${SEP}\n📊 数据来源\n✓ J-Quants  ✓ Yahoo Finance JP  ✓ TOHOSHOU AI V7.9.1`;

// ── toStockCardData adapter ───────────────────────────────────────────────────

function toCard(s: StockSummary): StockCardV79Data {
  return s as unknown as StockCardV79Data;
}

// ── WEB ANSWER BUILDERS ───────────────────────────────────────────────────────

function webTopPicks(data: DbQueryResult): string {
  const stocks = data.stocks ?? [];
  const limit = stocks.length;

  if (!limit) {
    return "⚠️ 暂无真实数据\n\n数据库中当前没有 scoreSource=REAL 的评分记录。\n\n请先执行：npm run compute-scores";
  }

  const ordinals = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫", "⑬", "⑭", "⑮", "⑯", "⑰", "⑱", "⑲", "⑳"];

  const header = [
    `🏆 今日AI推荐 TOP${limit}`,
    `📅 ${data.dateStr} JST | scoreSource=REAL`,
    SEP,
  ].join("\n");

  const cards = stocks.map((s, i) => {
    const name = s.nameZh ?? s.name;
    const sym = s.symbol.replace(".T", "");
    const score = s.adaptiveScore?.toFixed(0) ?? s.totalScore?.toFixed(0) ?? "—";
    const rec = recEmoji(s.recommendationV2 ?? s.recommendation);
    const price = s.latestClose != null ? `¥${s.latestClose.toLocaleString()}` : "暂无";

    const riskNote = s.highRiskFlag ? "⚠ 高风险标记：是" : "波动率正常";

    return [
      `${ordinals[i] ?? `(${i + 1})`} ${name}（${sym}）`,
      `AI评分  ${score}/100`,
      `评级    ${rec}`,
      s.percentileRank != null ? `市场排名  前${s.percentileRank.toFixed(1)}%（第${s.marketRank ?? "—"}位）` : "",
      `风格    ${styleLabel(s.stockStyle)}`,
      `最新股价  ${price}  5日 ${fmtPct(s.return5d)}  20日 ${fmtPct(s.return20d)}`,
      s.dividendYield != null ? `股息率    ${s.dividendYield.toFixed(1)}%` : "",
      `五维评分  技术${s.technicalScore ?? "—"}/30 基本${s.fundamentalScore ?? "—"}/25 资金${s.moneyFlowScore ?? "—"}/20 情绪${s.newsSentimentScore ?? "—"}/15 全球${s.globalTrendScore ?? "—"}/10`,
      `风险    ${riskNote}`,
    ].filter(Boolean).join("\n");
  });

  return [header, ...cards.map((c) => `${c}\n${SEP}`), FOOTER].join("\n\n");
}

function webStockAnalysis(data: DbQueryResult): string {
  const stocks = data.stocks ?? [];

  if (!stocks.length || data.error === "SYMBOL_NOT_FOUND") {
    const names = data.unresolvedNames?.join("、") ?? "";
    return [
      `❌ 未找到该股票数据`,
      names ? `\n「${names}」不在当前监控范围。` : "",
      "\n可能原因：",
      "• 该代码不在当前3716只TSE监控范围",
      "• 请输入4位数字代码（如 7203）",
    ].filter(Boolean).join("\n");
  }

  return stocks.map((s) => {
    const name = s.nameZh ?? s.name;
    const sym = s.symbol.replace(".T", "");
    const score = s.adaptiveScore?.toFixed(1) ?? "—";
    const rec = recEmoji(s.recommendationV2 ?? s.recommendation);

    const techBar = progressBar(s.technicalScore, 30);
    const fundBar = progressBar(s.fundamentalScore, 25);
    const mfBar = progressBar(s.moneyFlowScore, 20);
    const sentBar = progressBar(s.newsSentimentScore, 15);
    const globBar = progressBar(s.globalTrendScore, 10);

    const lines = [
      `📊 ${name}（${sym}）`,
      "",
      `AI评分  ${score}/100`,
      `评级    ${rec}`,
      s.percentileRank != null ? `市场排名  前${s.percentileRank.toFixed(1)}%（第${s.marketRank ?? "—"}位）` : "",
      s.opportunityScore != null ? `机会分    ${s.opportunityScore.toFixed(0)}` : "",
      s.highRiskFlag ? "⚠ 高风险标记：是" : "",
      SEP,
      "",
      "五维评分",
      `技术面  ${techBar}  ${s.technicalScore ?? "—"}/30`,
      `基本面  ${fundBar}  ${s.fundamentalScore ?? "—"}/25`,
      `资金面  ${mfBar}  ${s.moneyFlowScore ?? "—"}/20`,
      `情绪面  ${sentBar}  ${s.newsSentimentScore ?? "—"}/15`,
      `全球    ${globBar}  ${s.globalTrendScore ?? "—"}/10`,
      SEP,
      "",
      "📈 关键数据",
      `最新股价    ${s.latestClose != null ? "¥" + s.latestClose.toLocaleString() : "暂无"}`,
      `5日涨跌    ${fmtPct(s.return5d)}`,
      `20日涨跌   ${fmtPct(s.return20d)}`,
      `60日涨跌   ${fmtPct(s.return60d)}`,
      `RSI(14)    ${s.rsi14?.toFixed(1) ?? "—"}`,
      `均线趋势   ${s.maTrend ?? "—"}`,
      `MACD信号   ${s.macdSignalLabel ?? "—"}`,
      `催化剂分   ${s.catalystScore?.toFixed(1) ?? "—"}/10`,
      `股票风格   ${styleLabel(s.stockStyle)}`,
      s.dividendYield != null ? `股息率     ${s.dividendYield.toFixed(1)}%` : "",
      s.dividendScore != null ? `配当评分   ${s.dividendScore}/10` : "",
      s.shortSellingRatio != null
        ? `空売り比率 ${s.shortSellingRatio.toFixed(1)}%（${s.shortSellingSource ?? "—"}）`
        : "",
    ].filter(Boolean);

    return lines.join("\n");
  }).join(`\n\n${SEP}\n\n`) + FOOTER;
}

function webStockCompare(data: DbQueryResult): string {
  const [s1, s2] = data.compareStocks ?? [];

  if (!s1 || !s2) {
    if (data.error === "NEED_TWO_SYMBOLS") {
      return "请提供两只股票进行比较，例如：「丰田和伊藤忠比」";
    }
    const unresolved = data.unresolvedNames?.join("、") ?? "";
    return `❌ 未找到股票「${unresolved}」，请使用股票代码（如 7203）或支持的公司名称。`;
  }

  const name1 = s1.nameZh ?? s1.name;
  const name2 = s2.nameZh ?? s2.name;
  const sym1 = s1.symbol.replace(".T", "");
  const sym2 = s2.symbol.replace(".T", "");

  function row(label: string, v1: string, v2: string): string {
    return `${label.padEnd(10)} ${v1.padStart(12)}  vs  ${v2.padStart(12)}`;
  }

  const lines = [
    `⚖ 股票对比`,
    `${name1}（${sym1}）vs ${name2}（${sym2}）`,
    `📅 ${data.dateStr} JST`,
    SEP,
    row("AI评分", (s1.adaptiveScore?.toFixed(0) ?? "—") + "/100", (s2.adaptiveScore?.toFixed(0) ?? "—") + "/100"),
    row("评级", recEmoji(s1.recommendationV2 ?? s1.recommendation), recEmoji(s2.recommendationV2 ?? s2.recommendation)),
    row("市场排名", s1.percentileRank != null ? `前${s1.percentileRank.toFixed(1)}%` : "—", s2.percentileRank != null ? `前${s2.percentileRank.toFixed(1)}%` : "—"),
    row("股价", s1.latestClose != null ? `¥${s1.latestClose.toLocaleString()}` : "—", s2.latestClose != null ? `¥${s2.latestClose.toLocaleString()}` : "—"),
    row("5日涨跌", fmtPct(s1.return5d), fmtPct(s2.return5d)),
    row("20日涨跌", fmtPct(s1.return20d), fmtPct(s2.return20d)),
    row("技术面", `${s1.technicalScore ?? "—"}/30`, `${s2.technicalScore ?? "—"}/30`),
    row("基本面", `${s1.fundamentalScore ?? "—"}/25`, `${s2.fundamentalScore ?? "—"}/25`),
    row("资金面", `${s1.moneyFlowScore ?? "—"}/20`, `${s2.moneyFlowScore ?? "—"}/20`),
    row("情绪面", `${s1.newsSentimentScore ?? "—"}/15`, `${s2.newsSentimentScore ?? "—"}/15`),
    row("全球趋势", `${s1.globalTrendScore ?? "—"}/10`, `${s2.globalTrendScore ?? "—"}/10`),
    row("催化剂分", `${s1.catalystScore?.toFixed(1) ?? "—"}/10`, `${s2.catalystScore?.toFixed(1) ?? "—"}/10`),
    row("股息率", s1.dividendYield != null ? `${s1.dividendYield.toFixed(1)}%` : "—", s2.dividendYield != null ? `${s2.dividendYield.toFixed(1)}%` : "—"),
    row("风格", styleLabel(s1.stockStyle), styleLabel(s2.stockStyle)),
    row("高风险", s1.highRiskFlag ? "⚠ 是" : "否", s2.highRiskFlag ? "⚠ 是" : "否"),
  ];

  // Score-based conclusion (no GPT speculation)
  const score1 = s1.adaptiveScore ?? 0;
  const score2 = s2.adaptiveScore ?? 0;
  if (Math.abs(score1 - score2) >= 5) {
    const winner = score1 > score2 ? `${name1}（${sym1}）` : `${name2}（${sym2})`;
    lines.push(SEP, `📊 综合评分：${winner} 当前分数领先 ${Math.abs(score1 - score2).toFixed(0)} 分`);
  } else {
    lines.push(SEP, "📊 综合评分：两者分数接近，暂无明显差距");
  }

  lines.push(FOOTER);
  return lines.join("\n");
}

function webThemeRank(data: DbQueryResult): string {
  const stocks = data.stocks ?? [];
  const gm = data.marketData;

  const header = [
    `⚡ 科技/AI主题板块`,
    `📅 ${data.dateStr} JST`,
  ];

  if (gm) {
    header.push(
      SEP,
      "🌐 全球市场环境",
      `NASDAQ：${fmtPct(gm.nasdaqChange)}  日经225：${fmtPct(gm.nikkeiChange)}`,
      `VIX：${gm.vix?.toFixed(1) ?? "—"}（${vixLabel(gm.vix)}）  USD/JPY：${gm.usdjpy?.toFixed(2) ?? "—"}`,
    );
  }

  header.push(SEP, `🏆 主题TOP${stocks.length}（TOHOSHOU DB 真实数据）`);

  const ordinals = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];
  const rows = stocks.map((s, i) => {
    const name = s.nameZh ?? s.name;
    const sym = s.symbol.replace(".T", "");
    return `${ordinals[i] ?? `(${i + 1})`} ${name}（${sym}）  ${s.adaptiveScore?.toFixed(0) ?? "—"}分  ${recEmoji(s.recommendationV2 ?? s.recommendation)}  5日${fmtPct(s.return5d)}`;
  });

  return [...header, ...rows, FOOTER].join("\n");
}

function webSectorOutlook(data: DbQueryResult): string {
  const stocks = data.stocks ?? [];
  const gm = data.marketData;
  const label = data.sectorLabel ?? "板块";

  const lines = [
    `⚡ ${label}板块分析`,
    `📅 ${data.dateStr} JST`,
  ];

  if (gm) {
    lines.push(
      SEP,
      "🌐 全球市场环境",
      `NASDAQ：${fmtPct(gm.nasdaqChange)}  日经225：${fmtPct(gm.nikkeiChange)}`,
      `VIX：${gm.vix?.toFixed(1) ?? "—"}（${vixLabel(gm.vix)}）  全球评分：${gm.score ?? "—"}/10`,
    );
  }

  if (data.instFlow) {
    const flow = data.instFlow;
    const net = flow.netAmount;
    const flowStr = net != null ? `${net >= 0 ? "+" : ""}${net.toFixed(1)}億円（${net >= 0 ? "净流入" : "净流出"}）` : "—";
    lines.push(`外资净买入：${flowStr}`);
  }

  if (!stocks.length) {
    lines.push(SEP, `❌ 数据库中暂无${label}相关股票的真实评分（scoreSource=REAL）`);
  } else {
    lines.push(SEP, `🏆 ${label}TOP${stocks.length}（真实评分排序）`);
    const ordinals = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧"];
    stocks.forEach((s, i) => {
      const name = s.nameZh ?? s.name;
      const sym = s.symbol.replace(".T", "");
      lines.push(`${ordinals[i] ?? `(${i + 1})`} ${name}（${sym}）  ${s.adaptiveScore?.toFixed(0) ?? "—"}分  ${recEmoji(s.recommendationV2 ?? s.recommendation)}  5日${fmtPct(s.return5d)}`);
    });
  }

  lines.push(FOOTER);
  return lines.join("\n");
}

function webMarketOverview(data: DbQueryResult): string {
  const gm = data.marketData;
  const dist = data.distribution;
  const top1 = data.top1;
  const temp = data.marketTemperature ?? "—";

  const tempEmoji: Record<string, string> = {
    HOT: "🔥 过热", WARM: "☀️ 偏暖", NEUTRAL: "🌤 中性", COLD: "❄️ 冷", EXTREME_COLD: "🌨 极冷",
  };

  const lines = [
    "🌐 全球市场概况",
    `📅 ${data.dateStr} JST`,
    SEP,
  ];

  if (gm) {
    lines.push(
      "📊 指数表现",
      `NASDAQ：${gm.nasdaq?.toFixed(0) ?? "—"}  涨幅：${fmtPct(gm.nasdaqChange)}`,
      `日经225：${gm.nikkei?.toFixed(0) ?? "—"}  涨幅：${fmtPct(gm.nikkeiChange)}`,
      `VIX：${gm.vix?.toFixed(1) ?? "—"}（${vixLabel(gm.vix)}）`,
      `美元/日元：${gm.usdjpy?.toFixed(2) ?? "—"}`,
      `全球评分：${gm.score ?? "—"}/10`,
    );
  } else {
    lines.push("⚠️ 全球市场数据暂无（请运行 fetch-global-market）");
  }

  if (data.instFlow) {
    const net = data.instFlow.netAmount;
    const flowStr = net != null ? `${net >= 0 ? "+" : ""}${net.toFixed(1)}億円（${net >= 0 ? "外资净流入" : "外资净流出"}）` : "—";
    lines.push(SEP, "💹 机构资金", `外资净买入：${flowStr}（${data.instFlow.source}）`);
  }

  if (data.shortSellRatio != null) {
    lines.push(`市场空売り比率：${data.shortSellRatio.toFixed(1)}%（${data.shortSellSource ?? "—"}）`);
  }

  lines.push(SEP, `🌡 市场温度：${tempEmoji[temp] ?? temp}`);

  if (dist) {
    lines.push(
      `评级分布（共${dist.total}只有效评分）：`,
      `强烈买入${dist.strongBuy} / 买入${dist.buy} / 持有${dist.hold} / 关注${dist.watch} / 回避${dist.avoid}`,
    );
  }

  if (top1) {
    const sym = top1.symbol.replace(".T", "");
    lines.push(SEP, `🏆 当前最高分`, `${top1.nameZh ?? top1.name}（${sym}）  ${top1.adaptiveScore?.toFixed(0) ?? "—"}分`);
  }

  lines.push(FOOTER);
  return lines.join("\n");
}

function webRiskAnalysis(data: DbQueryResult): string {
  const stocks = data.stocks ?? [];
  const gm = data.marketData;

  if (!stocks.length) {
    return "请告知需要分析风险的股票，例如：「7203 风险分析」";
  }

  const lines = [`⚠️ 风险分析`, `📅 ${data.dateStr} JST`, SEP];

  if (gm?.vix != null) {
    lines.push(`🌐 全球风险环境`, `VIX：${gm.vix.toFixed(1)}（${vixLabel(gm.vix)}）`);
  }

  stocks.forEach((s) => {
    const name = s.nameZh ?? s.name;
    const sym = s.symbol.replace(".T", "");
    lines.push(
      SEP,
      `📊 ${name}（${sym}）`,
      `高风险标记：${s.highRiskFlag ? "⚠ 是" : "否"}`,
      `RSI(14)：${s.rsi14?.toFixed(1) ?? "—"}${s.rsi14 != null ? (s.rsi14 > 70 ? "（超买区间）" : s.rsi14 < 30 ? "（超卖区间）" : "（正常区间）") : ""}`,
      s.shortSellingRatio != null ? `空売り比率：${s.shortSellingRatio.toFixed(1)}%（${s.shortSellingSource ?? "—"}）` : "空売り比率：暂无",
      `均线趋势：${s.maTrend ?? "—"}`,
      `MACD信号：${s.macdSignalLabel ?? "—"}`,
      `20日涨跌：${fmtPct(s.return20d)}`,
      `AI评分：${s.adaptiveScore?.toFixed(0) ?? "—"}/100  评级：${recEmoji(s.recommendationV2 ?? s.recommendation)}`,
    );
  });

  lines.push(FOOTER);
  return lines.join("\n");
}

function webReasonExplain(data: DbQueryResult): string {
  const stocks = data.stocks ?? [];

  if (!stocks.length) {
    return "请告知需要解释的股票，例如：「为什么推荐7203」";
  }

  const lines = [`🧠 评级依据解释`, `📅 ${data.dateStr} JST`];

  stocks.forEach((s) => {
    const name = s.nameZh ?? s.name;
    const sym = s.symbol.replace(".T", "");
    const rec = s.recommendationV2 ?? s.recommendation;
    const score = s.adaptiveScore?.toFixed(0) ?? "—";

    const stockLines = [
      SEP,
      `${name}（${sym}）`,
      `评级：${recEmoji(rec)}  AI评分：${score}/100`,
      s.percentileRank != null ? `市场排名：前${s.percentileRank.toFixed(1)}%（全市场第${s.marketRank ?? "—"}位）` : "",
      SEP,
      "评分构成（系统自动计算，非人工推荐）：",
      `技术面   ${progressBar(s.technicalScore, 30)}  ${s.technicalScore ?? "—"}/30`,
      `基本面   ${progressBar(s.fundamentalScore, 25)}  ${s.fundamentalScore ?? "—"}/25`,
      `资金面   ${progressBar(s.moneyFlowScore, 20)}  ${s.moneyFlowScore ?? "—"}/20`,
      `情绪面   ${progressBar(s.newsSentimentScore, 15)}  ${s.newsSentimentScore ?? "—"}/15`,
      `全球趋势 ${progressBar(s.globalTrendScore, 10)}  ${s.globalTrendScore ?? "—"}/10`,
      "",
      `催化剂分：${s.catalystScore?.toFixed(1) ?? "—"}/10`,
      s.dividendScore != null ? `配当评分：${s.dividendScore}/10` : "",
      s.highRiskFlag ? "⚠ 高风险标记：已触发（波动率或基本面异常）" : "高风险：否",
      s.shortSellingRatio != null ? `空売り比率：${s.shortSellingRatio.toFixed(1)}%（越低越好）` : "",
    ].filter(Boolean);
    lines.push(...stockLines);
  });

  lines.push(FOOTER);
  return lines.filter(Boolean).join("\n");
}

function webDataSource(): string {
  return [
    "📊 TOHOSHOU AI 数据来源",
    SEP,
    "✓ J-Quants（JPX）— 股价/财务数据，覆盖3716只TSE上市股",
    "✓ Yahoo Finance JP — 全球市场指数（NASDAQ/VIX/日经225/USD/JPY）",
    "✓ JPX 机构投资者资金流向 — 每日外资净买卖",
    "✓ Kabutan新闻 — 个股情绪分析（置信度≥70算作相关）",
    "✓ TDnet官方披露 — 上市公司公告（催化剂事件）",
    "✓ JPX空売り比率 — 市场空头压力指标",
    SEP,
    "🤖 AI评分算法（V7.9）",
    "总分100分 = 技术面30 + 基本面25 + 资金面20 + 情绪面15 + 全球趋势10",
    "",
    "评级门槛：",
    "STRONG_BUY ≥78 + 前2%  |  BUY ≥70 + 前10%",
    "HOLD ≥60  |  WATCH ≥45  |  AVOID <45",
    SEP,
    "⚠️ 免责声明：本系统数据来自公开信息源，仅供参考，不构成投资建议。",
    `⏰ ${new Date(Date.now() + 9 * 3600000).toISOString().replace("T", " ").substring(0, 16)} JST`,
  ].join("\n");
}

function webHelp(): string {
  return [
    "🤖 TOHOSHOU AI 使用指南",
    SEP,
    "📊 AI推荐",
    "• 今天买什么？",
    "• 推荐十只股票",
    "• 高股息低风险的推荐",
    "",
    "🔍 个股分析",
    "• 分析7203  |  7203怎么样？",
    "• 伊藤忠怎么样？（支持公司名）",
    "",
    "⚖ 股票对比",
    "• 丰田和伊藤忠比",
    "• 7203 vs 8001",
    "",
    "⚡ 板块分析",
    "• 科技股谁最强？",
    "• 半导体还能买吗？",
    "",
    "🌐 市场概况",
    "• 今天市场怎么样？",
    "• 日经怎么样？",
    "",
    "🔄 追问（记忆30分钟）",
    "• 还有其他的吗？",
    "• 风险呢？",
    "• 为什么？",
    SEP,
    `🌐 网页版：${aiPicksUrl()}`,
  ].join("\n");
}

// ── buildWebAnswer ─────────────────────────────────────────────────────────────

export function buildWebAnswer(data: DbQueryResult): string {
  switch (data.intent) {
    case "top_picks":
    case "recommend_more":
      return webTopPicks(data);
    case "stock_analysis":
      return webStockAnalysis(data);
    case "stock_compare":
      return webStockCompare(data);
    case "theme_rank":
      return webThemeRank(data);
    case "sector_outlook":
      return webSectorOutlook(data);
    case "market_overview":
      return webMarketOverview(data);
    case "risk_analysis":
      return webRiskAnalysis(data);
    case "reason_explain":
      return webReasonExplain(data);
    case "data_source":
      return webDataSource();
    case "help":
    case "unknown":
    default:
      return webHelp();
  }
}

// ── buildLineMessages ─────────────────────────────────────────────────────────

export function buildLineMessages(data: DbQueryResult): LineMessage[] {
  const stocks = data.stocks ?? [];

  switch (data.intent) {
    case "top_picks":
    case "recommend_more": {
      if (!stocks.length) {
        return [textMsg("⚠️ 暂无真实评分数据，请稍后重试。")];
      }
      return [buildTopPicksFlexV79(stocks as TopPickStock[], data.dateStr ?? "", stocks.length)];
    }

    case "stock_analysis": {
      if (!stocks.length || data.error === "SYMBOL_NOT_FOUND") {
        const names = data.unresolvedNames?.join("、") ?? "";
        return [textMsg(`❌ 未找到「${names}」的数据。请使用4位代码（如 7203）或发送「帮助」查看支持的公司名称。`)];
      }
      return stocks.map((s) => buildStockCardV79(toCard(s)));
    }

    case "stock_compare": {
      const [s1, s2] = data.compareStocks ?? [];
      if (!s1 || !s2) {
        const err = data.error === "NEED_TWO_SYMBOLS"
          ? "请提供两只股票进行比较，例如：「丰田和伊藤忠比」"
          : `❌ 未找到「${data.unresolvedNames?.join("、") ?? ""}」的数据`;
        return [textMsg(err)];
      }
      // Return two stock cards side by side
      return [buildStockCardV79(toCard(s1)), buildStockCardV79(toCard(s2))];
    }

    case "theme_rank": {
      if (!stocks.length) {
        return [textMsg("⚠️ 科技股主题数据暂无，请稍后重试。")];
      }
      // buildAiThemeChatFlex requires { theme: string } — use default for LINE display
      const themedStocks = stocks.map((s) => ({ ...s, theme: "AI/科技" }));
      return [buildAiThemeChatFlex(themedStocks as unknown as Parameters<typeof buildAiThemeChatFlex>[0], data.dateStr ?? "")];
    }

    case "sector_outlook": {
      if (!stocks.length) {
        return [textMsg(`⚠️ 数据库中暂无${data.sectorLabel ?? ""}板块的真实评分数据。`)];
      }
      return [buildSectorFlexV79(stocks as SectorStock[], data.sectorLabel ?? "板块", data.dateStr ?? "", data.marketTemperature)];
    }

    case "market_overview": {
      const gm = data.marketData;
      const dist = data.distribution;
      const overviewData = {
        dateStr: data.dateStr ?? "",
        marketTemperature: data.marketTemperature ?? "NEUTRAL",
        strongBuy: dist?.strongBuy ?? 0,
        buy: dist?.buy ?? 0,
        hold: dist?.hold ?? 0,
        watch: dist?.watch ?? 0,
        avoid: dist?.avoid ?? 0,
        total: dist?.total ?? 0,
        top1: data.top1 ?? null,
        globalMarket: gm
          ? { nasdaqChange: gm.nasdaqChange, vix: gm.vix, nikkeiChange: gm.nikkeiChange, topixChange: null, usdjpy: gm.usdjpy, score: gm.score }
          : null,
        instFlow: data.instFlow
          ? { investorType: "foreigners", netAmount: data.instFlow.netAmount, date: data.instFlow.date, source: data.instFlow.source }
          : null,
        shortSellRatio: data.shortSellRatio ?? null,
        shortSellSource: data.shortSellSource ?? null,
        shortSellDate: data.shortSellDate ?? null,
      };
      return [buildMarketOverviewFlexV79(overviewData)];
    }

    case "risk_analysis": {
      if (!stocks.length) {
        return [textMsg("请告知需要分析风险的股票，例如：「7203 风险分析」")];
      }
      const s = stocks[0];
      const gm = data.marketData;
      const name = s.nameZh ?? s.name;
      const sym = s.symbol.replace(".T", "");
      const vix = gm?.vix;
      const lines = [
        `⚠️ 风险分析 — ${name}（${sym}）`,
        `高风险标记：${s.highRiskFlag ? "⚠ 是（波动率/基本面异常）" : "否"}`,
        `RSI(14)：${s.rsi14?.toFixed(1) ?? "—"}${s.rsi14 != null ? (s.rsi14 > 70 ? "（超买）" : s.rsi14 < 30 ? "（超卖）" : "（正常）") : ""}`,
        s.shortSellingRatio != null ? `空売り比率：${s.shortSellingRatio.toFixed(1)}% (${s.shortSellingSource ?? "—"})` : "空売り比率：暂无",
        vix != null ? `VIX：${vix.toFixed(1)}（${vixLabel(vix)}）` : "VIX：暂无",
        `均线趋势：${s.maTrend ?? "—"}`,
        `20日涨跌：${fmtPct(s.return20d)}`,
        `AI评分：${s.adaptiveScore?.toFixed(0) ?? "—"}/100（${recEmoji(s.recommendationV2 ?? s.recommendation)}）`,
      ];
      return [textMsg(lines.join("\n"))];
    }

    case "reason_explain": {
      if (!stocks.length) {
        return [textMsg("请告知需要解释的股票，例如：「为什么推荐7203」")];
      }
      const s = stocks[0];
      const name = s.nameZh ?? s.name;
      const sym = s.symbol.replace(".T", "");
      const lines = [
        `🧠 评级依据 — ${name}（${sym}）`,
        `评级：${recEmoji(s.recommendationV2 ?? s.recommendation)}  得分：${s.adaptiveScore?.toFixed(0) ?? "—"}/100`,
        s.percentileRank != null ? `市场排名：前${s.percentileRank.toFixed(1)}%（第${s.marketRank ?? "—"}位）` : "",
        "",
        `技术面${s.technicalScore ?? "—"}/30 | 基本面${s.fundamentalScore ?? "—"}/25 | 资金面${s.moneyFlowScore ?? "—"}/20 | 情绪面${s.newsSentimentScore ?? "—"}/15 | 全球${s.globalTrendScore ?? "—"}/10`,
        s.catalystScore != null ? `催化剂分：${s.catalystScore.toFixed(1)}/10` : "",
        s.dividendScore != null ? `配当评分：${s.dividendScore}/10` : "",
        s.highRiskFlag ? "⚠ 高风险标记已触发" : "",
      ].filter(Boolean);
      return [textMsg(lines.join("\n"))];
    }

    case "data_source":
      return [buildDataSourceFlexV79()];

    case "help":
    case "unknown":
    default:
      return [buildHelpFlexV79()];
  }
}
