/**
 * lib/line-flex-v79.ts — LINE Flex Message Builders V7.9
 *
 * Chat-response Flex cards for the new NLP-driven LINE handler.
 * All URLs via app-url.ts — never hardcode localhost.
 * Version: TOHOSHOU AI V7.9
 */

import type {
  FlexBubble, FlexCarousel, FlexBox, FlexText, FlexComponent,
  LineFlexMessage,
} from "./line";
import { flexMsg } from "./line";
import { getStockDisplayName, getStockSubName, type StockNameFields } from "./stock-display-name";
import {
  stockUrl, aiPicksUrl, aiThemeUrl, screenerUrl,
  syncUrl, getBaseUrl,
} from "./app-url";

// ── Color constants ──────────────────────────────────────────��─────────────────

const C = {
  STRONG_BUY: "#1565C0",
  BUY:        "#27AE60",
  HOLD:       "#2980B9",
  WATCH:      "#E67E22",
  AVOID:      "#C0392B",
  NEUTRAL:    "#7F8C8D",
  HEADER:     "#0F1629",
  CARD:       "#16213E",
  BUTTON:     "#3B82F6",
  WHITE:      "#FFFFFF",
  SUB:        "#A0AEC0",
  SEP:        "#2D3748",
  UP:         "#E53E3E",
  DOWN:       "#3182CE",
  GOLD:       "#F6AD55",
  GREEN:      "#4ADE80",
  BLUE:       "#60A5FA",
  PURPLE:     "#A78BFA",
  TEAL:       "#2DD4BF",
} as const;

// ── Primitive helpers ──────────────────────────────────────────────────────────

function txt(text: string, opts: Partial<Omit<FlexText, "type" | "text">> = {}): FlexText {
  return { type: "text", text, ...opts };
}

function box(layout: FlexBox["layout"], contents: FlexComponent[], opts: Partial<Omit<FlexBox, "type" | "layout" | "contents">> = {}): FlexBox {
  return { type: "box", layout, contents, ...opts };
}

function sep(): FlexComponent {
  return { type: "separator", color: C.SEP };
}

function uriBtn(label: string, uri: string, color = C.BUTTON): FlexComponent {
  return {
    type: "button",
    style: "primary",
    color,
    height: "sm",
    action: { type: "uri", label, uri },
  };
}

function recColor(rec: string | null | undefined): string {
  return ({ STRONG_BUY: C.STRONG_BUY, BUY: C.BUY, HOLD: C.HOLD, WATCH: C.WATCH, AVOID: C.AVOID } as Record<string, string>)[rec ?? ""] ?? C.NEUTRAL;
}

function recLabel(rec: string | null | undefined): string {
  return ({ STRONG_BUY: "強力買推薦", BUY: "買推薦", HOLD: "HOLD", WATCH: "観察", AVOID: "回避" } as Record<string, string>)[rec ?? ""] ?? "未評価";
}

function pctText(v: number | null | undefined): string {
  if (v == null) return "—";
  return (v >= 0 ? "▲" : "▼") + Math.abs(v).toFixed(1) + "%";
}

function pctColor(v: number | null | undefined): string {
  if (v == null) return C.SUB;
  return v >= 0 ? C.UP : C.DOWN;
}

function priceText(v: number | null | undefined): string {
  if (v == null) return "—";
  return "¥" + v.toLocaleString("ja-JP");
}

const STYLE_LABEL: Record<string, string> = {
  VALUE_DEFENSIVE:      "価値防御",
  GROWTH_MOMENTUM:      "成長動能",
  QUALITY_COMPOUNDER:   "優質複利",
  SPECULATIVE_MOMENTUM: "投機動能",
  CYCLICAL_EXPORTER:    "周期輸出",
  DOMESTIC_DEFENSIVE:   "内需防御",
};

const TEMP_EMOJI: Record<string, string> = {
  HOT:          "🔥 過熱",
  WARM:         "☀️ 偏暖",
  NEUTRAL:      "🌤 中性",
  COLD:         "❄️ 冷",
  EXTREME_COLD: "🌨 極冷",
};

// ── buildRealReason: derive factual 1-line reason from DB fields ───────────────

export type RealReasonInput = {
  dividendScore?: number | null;
  dividendYield?: number | null;
  shortSellingRatio?: number | null;
  shortSellingSource?: string | null;
  catalystScore?: number | null;
  moneyFlowScore?: number | null;
  newsSentimentScore?: number | null;
  highRiskFlag?: boolean;
  stockStyle?: string | null;
  return20d?: number | null;
  rsi14?: number | null;
};

export function buildRealReason(s: RealReasonInput): string {
  const tags: string[] = [];

  if (s.highRiskFlag) tags.push("⚠高風险");
  if ((s.dividendScore ?? 0) >= 7) tags.push(`高配当★${s.dividendScore}`);
  else if ((s.dividendYield ?? 0) >= 3) tags.push(`配当${s.dividendYield?.toFixed(1)}%`);

  if (s.shortSellingSource === "jpx_real" && (s.shortSellingRatio ?? 100) < 35) {
    tags.push("低空売り");
  }
  if ((s.catalystScore ?? 0) >= 7) tags.push("TDnet触媒");
  if ((s.moneyFlowScore ?? 0) >= 16) tags.push("機関資金流入");
  if ((s.newsSentimentScore ?? 0) >= 12) tags.push("好ニュース");
  if (s.stockStyle === "GROWTH_MOMENTUM" && (s.return20d ?? 0) >= 5) tags.push("成長モメンタム");
  if (s.stockStyle === "VALUE_DEFENSIVE") tags.push("防御バリュー");
  if ((s.rsi14 ?? 50) <= 35) tags.push("売られ過ぎ反発期待");

  return tags.slice(0, 3).join(" · ") || "";
}

// ── Type definitions for stock data ───────────────────────────────────────────

export type TopPickStock = StockNameFields & {
  totalScore?: number | null;
  adaptiveScore?: number | null;
  recommendation?: string | null;
  recommendationV2?: string | null;
  percentileRank?: number | null;
  marketRank?: number | null;
  opportunityScore?: number | null;
  latestClose?: number | null;
  return5d?: number | null;
  return20d?: number | null;
  rsi14?: number | null;
  technicalScore?: number | null;
  fundamentalScore?: number | null;
  moneyFlowScore?: number | null;
  newsSentimentScore?: number | null;
  globalTrendScore?: number | null;
  stockStyle?: string | null;
  highRiskFlag?: boolean;
  catalystScore?: number | null;
  dividendScore?: number | null;
  dividendYield?: number | null;
  shortSellingRatio?: number | null;
  shortSellingSource?: string | null;
};

export type StockCardV79Data = TopPickStock & {
  scoreSource?: string | null;
  latestDate?: string | null;
  recommendationReason?: string | null;
  opportunityLabel?: string | null;
  payoutRatio?: number | null;
  dividendAnn?: number | null;
  shortSellingDate?: string | null;
};

// ── 1. buildTopPicksFlexV79 ────────────────────────────────────────────────────

export function buildTopPicksFlexV79(
  stocks: TopPickStock[],
  dateStr: string,
  limit = 10,
): LineFlexMessage {
  const top = stocks.slice(0, limit);
  const first5 = top.slice(0, 5);
  const next5  = top.slice(5, 10);

  function pickRow(s: TopPickStock, rank: number): FlexComponent {
    const name = getStockDisplayName(s);
    const sym  = s.symbol.replace(".T", "");
    const rec  = s.recommendationV2 ?? s.recommendation;
    const score = s.adaptiveScore != null ? s.adaptiveScore.toFixed(0) : (s.totalScore ?? "—");
    const reason = buildRealReason(s);
    const styleLabel = s.stockStyle ? STYLE_LABEL[s.stockStyle]?.slice(0, 4) ?? "" : "";
    const riskIcon = s.highRiskFlag ? "⚠" : "";

    return box("vertical", [
      box("horizontal", [
        txt(`${rank}`, { size: "xs", color: rank <= 3 ? C.GOLD : C.SUB, flex: 0 }),
        box("vertical", [
          txt(`${riskIcon}${name}`, {
            size: "sm", weight: "bold",
            color: s.highRiskFlag ? C.WATCH : C.WHITE, wrap: true,
          }),
          txt(`${sym}.T${styleLabel ? "  " + styleLabel : ""}`, { size: "xxs", color: C.SUB }),
        ], { flex: 3, margin: "xs" }),
        box("vertical", [
          txt(String(score), { size: "lg", weight: "bold", color: recColor(rec), align: "end" }),
          txt(recLabel(rec), { size: "xxs", color: recColor(rec), align: "end" }),
          txt(pctText(s.return5d), { size: "xxs", weight: "bold", color: pctColor(s.return5d), align: "end" }),
        ], { flex: 2, alignItems: "flex-end" }),
      ], { margin: "sm" }),
      ...(s.percentileRank != null || s.opportunityScore != null ? [
        box("horizontal", [
          s.percentileRank != null ? txt(`前${s.percentileRank.toFixed(1)}%`, { size: "xxs", color: C.GOLD, flex: 1 }) : txt("", { size: "xxs", flex: 1 }),
          s.opportunityScore != null ? txt(`機会${s.opportunityScore.toFixed(0)}`, { size: "xxs", color: C.TEAL, flex: 1, align: "end" }) : txt("", { size: "xxs", flex: 1 }),
          txt(priceText(s.latestClose), { size: "xxs", color: C.SUB, align: "end", flex: 2 }),
        ], { margin: "xs" }),
      ] : []),
      ...(reason ? [txt(reason, { size: "xxs", color: C.BLUE, wrap: true, margin: "xs" })] : []),
    ], { margin: "sm" });
  }

  function makeBubble(items: TopPickStock[], startRank: number, isLast: boolean): FlexBubble {
    const bodyContents: FlexComponent[] = [];
    items.forEach((s, i) => {
      if (i > 0) bodyContents.push(sep());
      bodyContents.push(pickRow(s, startRank + i));
    });

    return {
      type: "bubble",
      size: "mega",
      styles: {
        header: { backgroundColor: C.HEADER },
        body:   { backgroundColor: C.CARD },
        footer: { backgroundColor: C.HEADER },
      },
      header: box("vertical", [
        box("horizontal", [
          txt("📈", { size: "xl", flex: 0 }),
          box("vertical", [
            txt(`AI推薦 TOP${top.length}`, { size: "lg", weight: "bold", color: C.WHITE }),
            txt(`${dateStr} · TOHOSHOU AI V7.9`, { size: "xs", color: C.SUB }),
          ], { margin: "sm" }),
        ]),
      ], { paddingAll: "16px" }),
      body:   box("vertical", bodyContents, { paddingAll: "16px", spacing: "sm" }),
      footer: isLast
        ? box("vertical", [
            uriBtn("📊 完整分析報告を見る", aiPicksUrl()),
          ], { paddingAll: "12px" })
        : undefined,
    };
  }

  if (next5.length === 0) {
    return flexMsg(`AI推薦 TOP${top.length} ${dateStr}`, makeBubble(first5, 1, true));
  }

  const carousel: FlexCarousel = {
    type: "carousel",
    contents: [makeBubble(first5, 1, false), makeBubble(next5, 6, true)],
  };
  return flexMsg(`AI推薦 TOP${top.length} ${dateStr}`, carousel);
}

// ── 2. buildStockCardV79 ───────────────────────────────────────────────────────

export function buildStockCardV79(stock: StockCardV79Data): LineFlexMessage {
  const displayName = getStockDisplayName(stock);
  const subName = getStockSubName(stock);
  const rec = stock.recommendationV2 ?? stock.recommendation;
  const score = stock.adaptiveScore?.toFixed(0) ?? String(stock.totalScore ?? "—");
  const code = stock.symbol.replace(".T", "");
  const reason = buildRealReason(stock);

  const dims: Array<[string, number | null | undefined, number]> = [
    ["技術面", stock.technicalScore, 30],
    ["基本面", stock.fundamentalScore, 25],
    ["資金面", stock.moneyFlowScore, 20],
    ["情绪面", stock.newsSentimentScore, 15],
    ["全球趋势", stock.globalTrendScore, 10],
  ];

  const dimItems: FlexComponent[] = [];
  dims.forEach(([label, val, max]) => {
    if (val == null) return;
    const filled = Math.round((val / max) * 5);
    const bar = "█".repeat(filled) + "░".repeat(5 - filled);
    dimItems.push(
      box("horizontal", [
        txt(label, { size: "xxs", color: C.SUB, flex: 3 }),
        txt(`${val}/${max}`, { size: "xxs", color: C.WHITE, flex: 2, align: "end" }),
        txt(bar, { size: "xxs", color: C.BLUE, margin: "sm" }),
      ], { margin: "xs" })
    );
  });

  const bodyContents: FlexComponent[] = [
    // Name + score
    box("horizontal", [
      box("vertical", [
        txt(displayName, { size: "lg", weight: "bold", color: C.WHITE, wrap: true }),
        txt(`${code}.T  ${subName}`, { size: "xxs", color: C.SUB }),
      ], { flex: 3 }),
      box("vertical", [
        txt(score, { size: "3xl", weight: "bold", color: recColor(rec), align: "end" }),
        txt("AI風格分/100", { size: "xxs", color: C.SUB, align: "end" }),
      ], { flex: 2, alignItems: "flex-end" }),
    ], { margin: "sm" }),

    sep(),

    // Price + returns
    box("horizontal", [
      box("vertical", [
        txt(priceText(stock.latestClose), { size: "md", weight: "bold", color: C.WHITE }),
        txt("最新株価", { size: "xxs", color: C.SUB }),
      ], { flex: 1 }),
      box("horizontal", [
        box("vertical", [
          txt(pctText(stock.return5d), { size: "sm", weight: "bold", color: pctColor(stock.return5d), align: "center" }),
          txt("5日", { size: "xxs", color: C.SUB, align: "center" }),
        ], { flex: 1 }),
        box("vertical", [
          txt(pctText(stock.return20d), { size: "sm", weight: "bold", color: pctColor(stock.return20d), align: "center" }),
          txt("20日", { size: "xxs", color: C.SUB, align: "center" }),
        ], { flex: 1 }),
      ], { flex: 2 }),
    ], { margin: "sm" }),

    sep(),

    // V7.7 rating row
    box("horizontal", [
      box("vertical", [
        txt(recLabel(rec), { size: "sm", weight: "bold", color: recColor(rec) }),
        txt("評価V2（双閾値）", { size: "xxs", color: C.SUB }),
      ], { flex: 2 }),
      ...(stock.percentileRank != null ? [
        box("vertical", [
          txt(`前${stock.percentileRank.toFixed(1)}%`, { size: "sm", weight: "bold", color: C.GOLD, align: "center" }),
          txt(`第${stock.marketRank ?? "—"}位`, { size: "xxs", color: C.SUB, align: "center" }),
        ], { flex: 1 }),
      ] : []),
      ...(stock.opportunityScore != null ? [
        box("vertical", [
          txt(stock.opportunityScore.toFixed(0), { size: "sm", weight: "bold", color: C.TEAL, align: "end" }),
          txt("機会分", { size: "xxs", color: C.SUB, align: "end" }),
        ], { flex: 1 }),
      ] : []),
    ], { margin: "sm" }),

    // Style + risk
    box("horizontal", [
      ...(stock.stockStyle ? [
        txt(STYLE_LABEL[stock.stockStyle] ?? stock.stockStyle, { size: "xxs", color: C.PURPLE, flex: 2 }),
      ] : []),
      ...(stock.highRiskFlag ? [
        txt("⚠ 高風险", { size: "xxs", color: C.WATCH, align: "end" }),
      ] : []),
    ], { margin: "xs" }),

    // 5-dim bar chart
    ...(dimItems.length > 0 ? [
      sep(),
      txt("五維評分", { size: "xxs", weight: "bold", color: C.SUB, margin: "sm" }),
      ...dimItems,
    ] : []),

    // V7.8: Dividend + ShortSelling
    sep(),
    txt("📊 配当・空売り（V7.8）", { size: "xxs", weight: "bold", color: C.SUB, margin: "sm" }),
    box("horizontal", [
      box("vertical", [
        txt(stock.dividendScore != null ? `★ ${stock.dividendScore}/10` : "—", {
          size: "sm", weight: "bold",
          color: (stock.dividendScore ?? 0) >= 7 ? C.GOLD : C.WHITE,
        }),
        txt("配当スコア", { size: "xxs", color: C.SUB }),
      ], { flex: 1 }),
      box("vertical", [
        txt(stock.dividendYield != null ? `${stock.dividendYield.toFixed(1)}%` : "—", {
          size: "sm", weight: "bold", color: C.GREEN, align: "center",
        }),
        txt("配当利回り", { size: "xxs", color: C.SUB, align: "center" }),
      ], { flex: 1 }),
      box("vertical", [
        txt(stock.shortSellingRatio != null ? `${stock.shortSellingRatio.toFixed(1)}%` : "—", {
          size: "sm", weight: "bold",
          color: (stock.shortSellingRatio ?? 100) < 35 ? C.GREEN : C.WATCH,
          align: "end",
        }),
        txt(stock.shortSellingSource === "jpx_real" ? "空売比率 ✅REAL" : "空売比率", { size: "xxs", color: C.SUB, align: "end" }),
      ], { flex: 1 }),
    ], { margin: "xs" }),

    // Real reason
    ...(reason ? [txt(`💡 ${reason}`, { size: "xxs", color: C.BLUE, wrap: true, margin: "xs" })] : []),

    sep(),

    // Data source footer
    box("horizontal", [
      txt(stock.scoreSource === "REAL" ? "✅ REAL DATA" : (stock.scoreSource ?? "—"), {
        size: "xxs", color: stock.scoreSource === "REAL" ? C.GREEN : C.WATCH,
      }),
      txt(`更新: ${stock.latestDate ?? "—"}`, { size: "xxs", color: C.SUB, align: "end" }),
    ], { margin: "xs" }),
    txt("J-Quants · TDnet · JPX · TOHOSHOU AI V7.9", { size: "xxs", color: C.SUB, margin: "xs" }),
  ];

  const bubble: FlexBubble = {
    type: "bubble",
    size: "mega",
    styles: {
      header: { backgroundColor: recColor(rec) },
      body:   { backgroundColor: C.CARD },
      footer: { backgroundColor: C.HEADER },
    },
    header: box("vertical", [
      txt("TOHOSHOU AI V7.9 株式評価", { size: "xs", color: "#FFFFFF99" }),
    ], { paddingAll: "12px" }),
    body:   box("vertical", bodyContents, { paddingAll: "16px", spacing: "sm" }),
    footer: box("vertical", [
      box("horizontal", [
        { type: "button", style: "primary", color: C.BUTTON, height: "sm",
          action: { type: "uri", label: "詳細分析", uri: stockUrl(stock.symbol) }, flex: 2 },
        { type: "button", style: "secondary", height: "sm",
          action: { type: "uri", label: "AI推薦", uri: aiPicksUrl() }, flex: 1 },
        { type: "button", style: "secondary", height: "sm",
          action: { type: "uri", label: "全市場", uri: screenerUrl() }, flex: 1 },
      ], { spacing: "xs" }),
    ], { paddingAll: "12px" }),
  };

  return flexMsg(`${displayName} AI評価 ${score}点 ${recLabel(rec)}`, bubble);
}

// ── 3. buildMarketOverviewFlexV79 ─────────────────────────────────────────────

export type MarketOverviewData = {
  dateStr: string;
  marketTemperature: string;
  strongBuy: number;
  buy: number;
  hold: number;
  watch: number;
  avoid: number;
  total: number;
  top1?: { symbol: string; name: string; adaptiveScore?: number | null; recommendationV2?: string | null; percentileRank?: number | null } | null;
  globalMarket?: {
    nasdaqChange?: number | null;
    sp500Change?: number | null;
    vix?: number | null;
    nikkeiChange?: number | null;
    topixChange?: number | null;
    usdjpy?: number | null;
    score?: number | null;
  } | null;
  instFlow?: {
    investorType: string;
    netAmount?: number | null;
    date: Date | string;
    source: string;
  } | null;
  shortSellRatio?: number | null;
  shortSellSource?: string | null;
  shortSellDate?: string | null;
};

export function buildMarketOverviewFlexV79(d: MarketOverviewData): LineFlexMessage {
  const bullCount = d.strongBuy + d.buy;
  const bullRate = d.total > 0 ? Math.round((bullCount / d.total) * 100) : 0;
  const tempLabel = TEMP_EMOJI[d.marketTemperature] ?? d.marketTemperature;

  const bodyContents: FlexComponent[] = [
    // Market temperature
    box("horizontal", [
      txt("市場温度", { size: "xs", color: C.SUB, flex: 1 }),
      txt(tempLabel, { size: "sm", weight: "bold", color: C.WHITE }),
      txt(`買推薦 ${bullCount}(${bullRate}%)`, { size: "xs", color: bullRate >= 10 ? C.BUY : C.WATCH, margin: "md" }),
    ], { margin: "sm" }),

    // Rating distribution
    sep(),
    txt("📊 評価分布", { size: "xs", weight: "bold", color: C.SUB, margin: "sm" }),
    box("horizontal", [
      box("vertical", [txt(String(d.strongBuy), { size: "lg", weight: "bold", color: C.STRONG_BUY }), txt("強BUY", { size: "xxs", color: C.SUB })], { flex: 1 }),
      box("vertical", [txt(String(d.buy), { size: "lg", weight: "bold", color: C.BUY }), txt("BUY", { size: "xxs", color: C.SUB })], { flex: 1 }),
      box("vertical", [txt(String(d.hold), { size: "lg", weight: "bold", color: C.HOLD }), txt("HOLD", { size: "xxs", color: C.SUB })], { flex: 1 }),
      box("vertical", [txt(String(d.watch), { size: "lg", weight: "bold", color: C.WATCH }), txt("WATCH", { size: "xxs", color: C.SUB })], { flex: 1 }),
      box("vertical", [txt(String(d.avoid), { size: "lg", weight: "bold", color: C.AVOID }), txt("AVOID", { size: "xxs", color: C.SUB })], { flex: 1 }),
    ], { margin: "xs" }),

    // Top1
    ...(d.top1 ? [
      sep(),
      txt("🏆 AI総合1位", { size: "xs", weight: "bold", color: C.SUB, margin: "sm" }),
      box("horizontal", [
        box("vertical", [
          txt(d.top1.name, { size: "sm", weight: "bold", color: C.WHITE, wrap: true }),
          txt(d.top1.symbol.replace(".T", ""), { size: "xxs", color: C.SUB }),
        ], { flex: 3 }),
        box("vertical", [
          txt(d.top1.adaptiveScore?.toFixed(0) ?? "—", { size: "xl", weight: "bold", color: recColor(d.top1.recommendationV2), align: "end" }),
          d.top1.percentileRank != null ? txt(`前${d.top1.percentileRank.toFixed(1)}%`, { size: "xxs", color: C.GOLD, align: "end" }) : txt("", { size: "xxs" }),
        ], { flex: 2, alignItems: "flex-end" }),
      ], { margin: "xs" }),
    ] : []),

    // Global market
    ...(d.globalMarket ? [
      sep(),
      txt("🌏 グローバル市場", { size: "xs", weight: "bold", color: C.SUB, margin: "sm" }),
      box("horizontal", [
        box("vertical", [
          txt(d.globalMarket.nasdaqChange != null ? pctText(d.globalMarket.nasdaqChange) : "—", { size: "sm", weight: "bold", color: pctColor(d.globalMarket.nasdaqChange) }),
          txt("NASDAQ", { size: "xxs", color: C.SUB }),
        ], { flex: 1 }),
        box("vertical", [
          txt(d.globalMarket.vix != null ? d.globalMarket.vix.toFixed(1) : "—", {
            size: "sm", weight: "bold",
            color: (d.globalMarket.vix ?? 0) > 25 ? C.WATCH : C.GREEN,
            align: "center",
          }),
          txt("VIX", { size: "xxs", color: C.SUB, align: "center" }),
        ], { flex: 1 }),
        box("vertical", [
          txt(d.globalMarket.nikkeiChange != null ? pctText(d.globalMarket.nikkeiChange) : "—", { size: "sm", weight: "bold", color: pctColor(d.globalMarket.nikkeiChange), align: "center" }),
          txt("日経", { size: "xxs", color: C.SUB, align: "center" }),
        ], { flex: 1 }),
        box("vertical", [
          txt(d.globalMarket.usdjpy != null ? d.globalMarket.usdjpy.toFixed(1) : "—", { size: "sm", weight: "bold", color: C.WHITE, align: "end" }),
          txt("USD/JPY", { size: "xxs", color: C.SUB, align: "end" }),
        ], { flex: 1 }),
      ], { margin: "xs" }),
    ] : []),

    // Institutional flow
    ...(d.instFlow && d.instFlow.netAmount != null ? [
      sep(),
      box("horizontal", [
        txt("外資動向", { size: "xs", color: C.SUB, flex: 2 }),
        txt(`${d.instFlow.netAmount >= 0 ? "+" : ""}${d.instFlow.netAmount.toFixed(0)}億円`, {
          size: "sm", weight: "bold",
          color: d.instFlow.netAmount >= 0 ? C.BUY : C.AVOID,
        }),
        txt(d.instFlow.source === "jquants_investor_types" ? "✅REAL" : "合成", { size: "xxs", color: C.SUB, margin: "sm" }),
      ], { margin: "sm" }),
    ] : []),

    // Short selling ratio
    ...(d.shortSellRatio != null ? [
      box("horizontal", [
        txt("空売り比率", { size: "xs", color: C.SUB, flex: 2 }),
        txt(`${d.shortSellRatio.toFixed(1)}%`, {
          size: "sm", weight: "bold",
          color: d.shortSellRatio < 35 ? C.GREEN : C.WATCH,
        }),
        txt(d.shortSellSource === "jpx_real" ? "✅JPX REAL" : "—", { size: "xxs", color: C.SUB, margin: "sm" }),
      ], { margin: "xs" }),
    ] : []),

    sep(),
    txt(`データ更新日 ${d.dateStr}`, { size: "xxs", color: C.SUB, margin: "sm" }),
  ];

  const bubble: FlexBubble = {
    type: "bubble",
    size: "mega",
    styles: {
      header: { backgroundColor: "#0A1628" },
      body:   { backgroundColor: C.CARD },
      footer: { backgroundColor: C.HEADER },
    },
    header: box("vertical", [
      box("horizontal", [
        txt("🌏", { size: "xl", flex: 0 }),
        box("vertical", [
          txt("全市場 AI評価サマリー", { size: "md", weight: "bold", color: C.WHITE }),
          txt("TOHOSHOU AI V7.9 · 全銘柄スキャン", { size: "xs", color: C.SUB }),
        ], { margin: "sm" }),
      ]),
    ], { paddingAll: "16px" }),
    body:   box("vertical", bodyContents, { paddingAll: "16px", spacing: "sm" }),
    footer: box("vertical", [
      box("horizontal", [
        { type: "button", style: "primary", color: C.BUTTON, height: "sm",
          action: { type: "uri", label: "AI推薦", uri: aiPicksUrl() }, flex: 1 },
        { type: "button", style: "secondary", height: "sm",
          action: { type: "uri", label: "全市場", uri: screenerUrl() }, flex: 1 },
        { type: "button", style: "secondary", height: "sm",
          action: { type: "uri", label: "同期状態", uri: syncUrl() }, flex: 1 },
      ], { spacing: "xs" }),
    ], { paddingAll: "12px" }),
  };

  return flexMsg(`全市場AIサマリー V7.9 ${d.dateStr}`, bubble);
}

// ── 4. buildSectorFlexV79 ─────────────────────────────────────────────────────

export type SectorStock = StockNameFields & {
  adaptiveScore?: number | null;
  totalScore?: number | null;
  recommendationV2?: string | null;
  recommendation?: string | null;
  return5d?: number | null;
  return20d?: number | null;
  latestClose?: number | null;
  stockStyle?: string | null;
  percentileRank?: number | null;
};

export function buildSectorFlexV79(
  stocks: SectorStock[],
  sectorLabel: string,
  dateStr: string,
  marketTemp?: string,
): LineFlexMessage {
  const top = stocks.slice(0, 8);

  const bodyContents: FlexComponent[] = [
    txt(`${top.length}銘柄 · ${dateStr}`, { size: "xxs", color: C.SUB }),
    ...(marketTemp ? [
      txt(`市場温度: ${TEMP_EMOJI[marketTemp] ?? marketTemp}`, { size: "xs", color: C.WHITE, margin: "xs" }),
    ] : []),
    sep(),
    ...top.flatMap((s, i): FlexComponent[] => {
      const rec = s.recommendationV2 ?? s.recommendation;
      const score = s.adaptiveScore?.toFixed(0) ?? String(s.totalScore ?? "—");
      return [
        ...(i > 0 ? [sep() as FlexComponent] : []),
        box("horizontal", [
          box("vertical", [
            txt(getStockDisplayName(s), { size: "sm", weight: "bold", color: C.WHITE, wrap: true }),
            txt(`${s.symbol.replace(".T", "")}.T`, { size: "xxs", color: C.SUB }),
          ], { flex: 3 }),
          box("vertical", [
            txt(score, { size: "lg", weight: "bold", color: recColor(rec), align: "end" }),
            txt(recLabel(rec), { size: "xxs", color: recColor(rec), align: "end" }),
          ], { flex: 2, alignItems: "flex-end" }),
        ], { margin: "xs" }),
        box("horizontal", [
          s.percentileRank != null ? txt(`前${s.percentileRank.toFixed(1)}%`, { size: "xxs", color: C.GOLD, flex: 1 }) : txt("", { size: "xxs", flex: 1 }),
          txt(pctText(s.return5d), { size: "xxs", weight: "bold", color: pctColor(s.return5d), flex: 1, align: "center" }),
          txt(pctText(s.return20d), { size: "xxs", color: pctColor(s.return20d), flex: 1, align: "end" }),
        ], { margin: "xs" }),
      ];
    }),
  ];

  const bubble: FlexBubble = {
    type: "bubble",
    size: "mega",
    styles: {
      header: { backgroundColor: "#0D1B2A" },
      body:   { backgroundColor: C.CARD },
      footer: { backgroundColor: C.HEADER },
    },
    header: box("vertical", [
      box("horizontal", [
        txt("⚡", { size: "xl", flex: 0 }),
        box("vertical", [
          txt(`${sectorLabel} セクター分析`, { size: "md", weight: "bold", color: C.WHITE }),
          txt("TOHOSHOU AI V7.9", { size: "xs", color: C.BLUE }),
        ], { margin: "sm" }),
      ]),
    ], { paddingAll: "16px" }),
    body:   box("vertical", bodyContents, { paddingAll: "16px", spacing: "sm" }),
    footer: box("vertical", [
      box("horizontal", [
        { type: "button", style: "primary", color: C.BUTTON, height: "sm",
          action: { type: "uri", label: "AI推薦", uri: aiPicksUrl() }, flex: 1 },
        { type: "button", style: "secondary", height: "sm",
          action: { type: "uri", label: "全市場", uri: screenerUrl() }, flex: 1 },
      ], { spacing: "xs" }),
    ], { paddingAll: "12px" }),
  };

  return flexMsg(`${sectorLabel} セクター TOP${top.length}`, bubble);
}

// ── 5. buildHelpFlexV79 ───────────────────────────────────────────────────────

export function buildHelpFlexV79(): LineFlexMessage {
  const items: Array<[string, string, string]> = [
    ["📈 AI推薦",   "今天买什么？/ 推荐十只",      "AI TOP10 真实评分"],
    ["🔍 个股分析", "丰田怎么样？/ 分析7203",       "个股深度卡片"],
    ["⚡ 科技股",   "科技股谁最强？",              "AI产业链 TOP"],
    ["🏭 板块分析", "半导体还能买吗？/ 汽车股如何",  "行业TOP + 市场温度"],
    ["🌏 市场概况", "市场怎么样？/ 日经如何",        "温度+分布+全球指数"],
    ["📊 数据来源", "数据哪里来的？",              "9个REAL数据源说明"],
    ["📊 代码查询", "7203 / 9984 / 8001",         "直接输入4位代码"],
  ];

  const bodyContents: FlexComponent[] = [
    txt("TOHOSHOU AI V7.9 · 全機能", { size: "xs", color: C.SUB }),
    sep(),
    ...items.flatMap(([icon, trigger, desc], i): FlexComponent[] => [
      ...(i > 0 ? [sep() as FlexComponent] : []),
      box("vertical", [
        txt(icon, { size: "sm", weight: "bold", color: C.WHITE }),
        txt(trigger, { size: "xs", color: C.BLUE, wrap: true }),
        txt(desc, { size: "xxs", color: C.SUB }),
      ], { margin: "xs" }),
    ]),
    sep(),
    txt("• 自然语言识别：丰田、伊藤忠、软银…", { size: "xs", color: C.SUB, margin: "sm", wrap: true }),
    txt("• 毎日08:00 JST 朝報自動配信 📊", { size: "xxs", color: C.SUB, margin: "xs" }),
    txt("• 全データ100% REAL（GPT無編造）", { size: "xxs", color: C.GREEN, margin: "xs" }),
  ];

  const bubble: FlexBubble = {
    type: "bubble",
    size: "mega",
    styles: {
      header: { backgroundColor: "#1A2A1A" },
      body:   { backgroundColor: C.CARD },
      footer: { backgroundColor: C.HEADER },
    },
    header: box("vertical", [
      txt("📘 TOHOSHOU AI 使用ガイド", { size: "md", weight: "bold", color: C.GREEN }),
      txt("日本AI選株システム V7.9", { size: "xs", color: "#86EFAC" }),
    ], { paddingAll: "16px" }),
    body:   box("vertical", bodyContents, { paddingAll: "16px", spacing: "sm" }),
    footer: box("vertical", [
      box("horizontal", [
        { type: "button", style: "primary", color: C.BUTTON, height: "sm",
          action: { type: "uri", label: "AI推薦", uri: aiPicksUrl() }, flex: 1 },
        { type: "button", style: "secondary", height: "sm",
          action: { type: "uri", label: "科技株", uri: aiThemeUrl() }, flex: 1 },
        { type: "button", style: "secondary", height: "sm",
          action: { type: "uri", label: "全市場", uri: screenerUrl() }, flex: 1 },
      ], { spacing: "xs" }),
    ], { paddingAll: "12px" }),
  };

  return flexMsg("TOHOSHOU AI V7.9 使用ガイド", bubble);
}

// ── 6. buildDataSourceFlexV79 ─────────────────────────────────────────────────

export function buildDataSourceFlexV79(lastScoreDate?: string): LineFlexMessage {
  const sources: Array<[string, string, string]> = [
    ["J-Quants DailyPrice",       "7.9M+条", "3716只日線OHLCV"],
    ["J-Quants Financial",        "35,986条", "財務報告・EPS・ROE"],
    ["J-Quants InstitutionalFlow","216条",    "JPX機関投資家資金フロー"],
    ["Yahoo Finance GlobalMarket","毎日",     "NASDAQ/VIX/日経/USD/JPY"],
    ["Kabutan News",              "1,590+条", "市場ニュース・センチメント"],
    ["TDnet Disclosure REAL",     "4,691件",  "適時開示・Cookie認証"],
    ["JPX 空売り比率",            "毎週金曜", "PDF→pdftotext解析 REAL"],
    ["J-Quants Dividend",         "32,315条", "3,693只配当履歴・yield"],
    ["TOHOSHOU AI StockScore",    "3,714只",  "V7.9 adaptiveScore 5次元"],
  ];

  const bodyContents: FlexComponent[] = [
    txt("全データ100% REAL · GPT無編造", { size: "xs", weight: "bold", color: C.GREEN }),
    sep(),
    ...sources.map(([name, count, desc]): FlexComponent =>
      box("vertical", [
        box("horizontal", [
          txt("✅", { size: "xxs", flex: 0 }),
          txt(name, { size: "xs", weight: "bold", color: C.WHITE, flex: 1, margin: "xs" }),
          txt(count, { size: "xxs", color: C.GOLD, align: "end" }),
        ], { margin: "xs" }),
        txt(desc, { size: "xxs", color: C.SUB, margin: "none" }),
      ])
    ),
    sep(),
    ...(lastScoreDate ? [
      txt(`最終スコア計算: ${lastScoreDate}`, { size: "xxs", color: C.SUB, margin: "sm" }),
    ] : []),
    txt("評分算法: lib/ai-score.ts V7.8", { size: "xxs", color: C.SUB }),
  ];

  const bubble: FlexBubble = {
    type: "bubble",
    size: "mega",
    styles: {
      header: { backgroundColor: "#0A2010" },
      body:   { backgroundColor: C.CARD },
      footer: { backgroundColor: C.HEADER },
    },
    header: box("vertical", [
      txt("📡 データソース一覧", { size: "md", weight: "bold", color: C.GREEN }),
      txt("TOHOSHOU AI V7.9 · 9種REAL DATA", { size: "xs", color: "#86EFAC" }),
    ], { paddingAll: "16px" }),
    body:   box("vertical", bodyContents, { paddingAll: "16px", spacing: "sm" }),
    footer: box("vertical", [
      uriBtn("🔄 同期ステータスを見る", syncUrl()),
    ], { paddingAll: "12px" }),
  };

  return flexMsg("TOHOSHOU AI データソース一覧", bubble);
}

// ── 7. buildWelcomeFlexV79 ────────────────────────────────────────────────────

export function buildWelcomeFlexV79(): LineFlexMessage {
  const features: Array<[string, string]> = [
    ["✅ 3714只 REAL評分", "J-Quants真実資金流 · V7.9"],
    ["✅ 配当スコア",       "0-10評価 · 年配当率 · 性向"],
    ["✅ 空売り比率 JPX",   "JPX PDF REAL 38.8%(2026-06-19)"],
    ["✅ 自然語言理解",     "丰田/伊藤忠/7203…全て認識"],
    ["✅ Flex推送",         "朝報/午間/大引け自動配信"],
  ];

  const bodyContents: FlexComponent[] = [
    txt("🇯🇵 日本AI選株システム V7.9", { size: "md", weight: "bold", color: C.WHITE }),
    sep(),
    ...features.map(([title, sub]): FlexComponent =>
      box("horizontal", [
        txt(title, { size: "xs", weight: "bold", color: C.GREEN, flex: 2 }),
        txt(sub, { size: "xxs", color: C.SUB, flex: 3, wrap: true }),
      ], { margin: "xs" }),
    ),
    sep(),
    txt("こんな感じで話しかけてください：", { size: "xs", color: C.SUB, margin: "sm" }),
    box("vertical", [
      txt("📈 今天买什么？/ ��荐十只", { size: "xs", color: C.BLUE, wrap: true }),
      txt("🔍 丰田怎么样？/ 分析7203", { size: "xs", color: C.BLUE, wrap: true, margin: "xs" }),
      txt("⚡ 科技股谁最强？/ 半导体还能买吗？", { size: "xs", color: C.BLUE, wrap: true, margin: "xs" }),
      txt("🌏 市场怎么样？/ 数据哪里来的？", { size: "xs", color: C.BLUE, wrap: true, margin: "xs" }),
    ]),
  ];

  const bubble: FlexBubble = {
    type: "bubble",
    size: "mega",
    styles: {
      header: { backgroundColor: "#0D2818" },
      body:   { backgroundColor: C.CARD },
      footer: { backgroundColor: C.HEADER },
    },
    header: box("vertical", [
      txt("🤖 TOHOSHOU AI V7.9", { size: "xl", weight: "bold", color: C.GREEN }),
      txt("ようこそ · Welcome · 歡迎", { size: "xs", color: "#86EFAC" }),
    ], { paddingAll: "16px" }),
    body:   box("vertical", bodyContents, { paddingAll: "16px", spacing: "sm" }),
    footer: box("vertical", [
      uriBtn("📊 AI推薦 TOP10 を見る", aiPicksUrl()),
    ], { paddingAll: "12px" }),
  };

  return flexMsg("TOHOSHOU AI V7.9 へようこそ", bubble);
}

// ── 8. buildGroupJoinFlexV79 ──────────────────────────────────────────────────

export function buildGroupJoinFlexV79(): LineFlexMessage {
  const bodyContents: FlexComponent[] = [
    txt("🇯🇵 日本AI選株システム V7.9", { size: "md", weight: "bold", color: C.WHITE }),
    sep(),
    txt("📊 話しかけ方", { size: "sm", weight: "bold", color: C.SUB, margin: "sm" }),
    box("vertical", [
      txt("今天买什么？ → AI推薦TOP10",      { size: "xs", color: C.BLUE }),
      txt("丰田怎么样？→ 个股評価カード",    { size: "xs", color: C.BLUE, margin: "xs" }),
      txt("科技股谁最强？→ テーマ株TOP",     { size: "xs", color: C.BLUE, margin: "xs" }),
      txt("7203 → 丰田 AI分析",              { size: "xs", color: C.BLUE, margin: "xs" }),
      txt("帮助 → 完整使用ガイド",           { size: "xs", color: C.BLUE, margin: "xs" }),
    ]),
    sep(),
    txt("毎日08:00 JST 朝報自動配信 📊", { size: "xs", color: C.SUB, margin: "sm" }),
    txt("全データ100% REAL · GPT無編造", { size: "xxs", color: C.GREEN }),
  ];

  const bubble: FlexBubble = {
    type: "bubble",
    size: "mega",
    styles: {
      header: { backgroundColor: "#0D2818" },
      body:   { backgroundColor: C.CARD },
      footer: { backgroundColor: C.HEADER },
    },
    header: box("vertical", [
      txt("🤖 TOHOSHOU AI V7.9 が参加しました", { size: "md", weight: "bold", color: C.GREEN }),
    ], { paddingAll: "16px" }),
    body:   box("vertical", bodyContents, { paddingAll: "16px", spacing: "sm" }),
    footer: box("vertical", [
      uriBtn("📊 AI推薦TOP10を開く", aiPicksUrl()),
    ], { paddingAll: "12px" }),
  };

  return flexMsg("TOHOSHOU AI V7.9 が参加しました", bubble);
}

// ── Re-export getBaseUrl for any inline usage ─────────────────────────────────
export { getBaseUrl };
