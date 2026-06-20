/**
 * LINE Flex Message 构建器
 * 所有 LINE 推送的卡片格式在此定义
 */

import type {
  FlexBubble, FlexCarousel, FlexBox, FlexText, FlexComponent,
  LineFlexMessage,
} from "./line";
import { flexMsg } from "./line";
import { getStockDisplayName, getStockSubName, type StockNameFields } from "./stock-display-name";
import {
  getBaseUrl, stockUrl, aiPicksUrl, aiThemeUrl, screenerUrl,
  newsUrl, notificationsUrl, portfolioUrl,
} from "./app-url";

// Keep for existing code that references APP_URL inline
const APP_URL = getBaseUrl();

// ── 颜色常量 ─────────────────────────────────────────────────────────────────

const COLOR = {
  STRONG_BUY: "#1565C0",
  BUY:        "#27AE60",
  HOLD:       "#2980B9",
  WATCH:      "#E67E22",
  AVOID:      "#C0392B",
  NEUTRAL:    "#7F8C8D",
  HEADER_BG:  "#0F1629",
  CARD_BG:    "#16213E",
  BUTTON:     "#3B82F6",
  TEXT_MAIN:  "#FFFFFF",
  TEXT_SUB:   "#A0AEC0",
  TEXT_DARK:  "#1A202C",
  SEPARATOR:  "#2D3748",
  UP:         "#E53E3E",   // 日本：涨红
  DOWN:       "#3182CE",   // 日本：跌蓝
} as const;

// ── 工具函数 ─────────────────────────────────────────────────────────────────

function recColor(rec: string | null | undefined): string {
  return { STRONG_BUY: COLOR.STRONG_BUY, BUY: COLOR.BUY, HOLD: COLOR.HOLD, WATCH: COLOR.WATCH, AVOID: COLOR.AVOID }[rec ?? ""] ?? COLOR.NEUTRAL;
}

function recLabel(rec: string | null | undefined): string {
  return { STRONG_BUY: "強力買推薦", BUY: "買推薦", HOLD: "HOLD", WATCH: "要観察", AVOID: "回避" }[rec ?? ""] ?? "未評価";
}

function pctText(v: number | null | undefined): string {
  if (v == null) return "—";
  return (v >= 0 ? "▲" : "▼") + Math.abs(v).toFixed(1) + "%";
}

function pctColor(v: number | null | undefined): string {
  if (v == null) return COLOR.TEXT_SUB;
  return v >= 0 ? COLOR.UP : COLOR.DOWN;
}

function priceText(v: number | null | undefined): string {
  if (v == null) return "—";
  return "¥" + v.toLocaleString("ja-JP");
}

function txt(text: string, opts: Partial<Omit<FlexText, "type" | "text">> = {}): FlexText {
  return { type: "text", text, ...opts };
}

function box(layout: FlexBox["layout"], contents: FlexComponent[], opts: Partial<Omit<FlexBox, "type" | "layout" | "contents">> = {}): FlexBox {
  return { type: "box", layout, contents, ...opts };
}

function sep(color = COLOR.SEPARATOR): FlexComponent {
  return { type: "separator", color };
}

function uriBtn(label: string, uri: string, color = COLOR.BUTTON): FlexComponent {
  return {
    type: "button",
    style: "primary",
    color,
    height: "sm",
    action: { type: "uri", label, uri },
  };
}

// ── 单只股票评分行（供列表使用）─────────────────────────────────────────────

function stockRow(
  rank: number,
  stock: StockNameFields & { totalScore?: number | null; recommendation?: string | null; latestClose?: number | null; return5d?: number | null; summaryReason?: string | null }
): FlexComponent[] {
  const displayName = getStockDisplayName(stock);
  const subName = getStockSubName(stock);
  const rec = stock.recommendation;
  const score = stock.totalScore ?? 0;
  const reasonRaw = stock.summaryReason?.replace(/\[.*?\]/g, "").trim() ?? "";
  const reason = reasonRaw.slice(0, 50);

  const components: FlexComponent[] = [
    box("horizontal", [
      txt(`${rank}`, { size: "sm", color: COLOR.TEXT_SUB, flex: 0, margin: "none" }),
      box("vertical", [
        txt(displayName, { size: "md", weight: "bold", color: COLOR.TEXT_MAIN, wrap: true }),
        txt(subName, { size: "xxs", color: COLOR.TEXT_SUB }),
      ], { flex: 3, margin: "sm" }),
      box("vertical", [
        txt(String(score), { size: "xl", weight: "bold", color: recColor(rec), align: "end" }),
        txt(recLabel(rec), { size: "xxs", color: recColor(rec), align: "end" }),
      ], { flex: 2, alignItems: "flex-end" }),
    ], { margin: "sm" }),
  ];

  if (reason) {
    components.push(txt(`💡 ${reason}`, { size: "xxs", color: COLOR.TEXT_SUB, wrap: true, margin: "xs" }));
  }

  const ret5 = stock.return5d;
  if (ret5 != null || stock.latestClose != null) {
    components.push(
      box("horizontal", [
        txt(priceText(stock.latestClose), { size: "xs", color: COLOR.TEXT_SUB, flex: 1 }),
        txt(pctText(ret5), { size: "xs", color: pctColor(ret5), align: "end" }),
      ], { margin: "xs" })
    );
  }

  return components;
}

// ── 1. buildMorningReportFlex ─────────────────────────────────────────────────

export type MorningReportStock = StockNameFields & {
  totalScore?: number | null;
  recommendation?: string | null;
  latestClose?: number | null;
  return5d?: number | null;
  summaryReason?: string | null;
};

export function buildMorningReportFlex(
  stocks: MorningReportStock[],
  dateStr: string,
  dowLabel: string,
): LineFlexMessage {
  const top = stocks.slice(0, 5);

  const bodyContents: FlexComponent[] = [
    txt("今日 AI推薦 TOP" + top.length, { size: "sm", weight: "bold", color: COLOR.TEXT_SUB, margin: "none" }),
  ];

  top.forEach((s, i) => {
    if (i > 0) bodyContents.push(sep());
    bodyContents.push(...stockRow(i + 1, s));
  });

  const bubble: FlexBubble = {
    type: "bubble",
    size: "mega",
    styles: {
      header: { backgroundColor: COLOR.HEADER_BG },
      body: { backgroundColor: COLOR.CARD_BG },
      footer: { backgroundColor: COLOR.HEADER_BG },
    },
    header: box("vertical", [
      box("horizontal", [
        txt("📈", { size: "xl", flex: 0 }),
        box("vertical", [
          txt("AI日本株 朝報", { size: "lg", weight: "bold", color: COLOR.TEXT_MAIN }),
          txt(`${dateStr} (${dowLabel}) · 09:00 開場`, { size: "xs", color: COLOR.TEXT_SUB }),
        ], { margin: "sm" }),
      ]),
    ], { paddingAll: "16px" }),
    body: box("vertical", bodyContents, { paddingAll: "16px", spacing: "sm" }),
    footer: box("vertical", [
      uriBtn("📊 完整報告を見る", `${APP_URL}/ai-picks`),
    ], { paddingAll: "12px" }),
  };

  return flexMsg("AI日本株 朝報 - 今日推薦TOP" + top.length, bubble);
}

// ── 2. buildMiddayFlex ────────────────────────────────────────────────────────

export type MiddayStock = StockNameFields & {
  totalScore?: number | null;
  recommendation?: string | null;
  latestClose?: number | null;
  return5d?: number | null;
  technicalScore?: number | null;
  macdSignalLabel?: string | null;
  rsi14?: number | null;
};

export function buildMiddayFlex(
  surgers: MiddayStock[],
  fallers: MiddayStock[],
  macdSignals: MiddayStock[],
  dateStr: string,
): LineFlexMessage {
  const bodyContents: FlexComponent[] = [];

  if (surgers.length > 0) {
    bodyContents.push(txt("🚀 急騰株（5日+5%以上）", { size: "sm", weight: "bold", color: "#27AE60" }));
    surgers.slice(0, 5).forEach((s, i) => {
      if (i > 0) bodyContents.push(sep());
      bodyContents.push(
        box("horizontal", [
          box("vertical", [
            txt(getStockDisplayName(s), { size: "sm", weight: "bold", color: COLOR.TEXT_MAIN, wrap: true }),
            txt(getStockSubName(s), { size: "xxs", color: COLOR.TEXT_SUB }),
          ], { flex: 3 }),
          box("vertical", [
            txt(pctText(s.return5d), { size: "md", weight: "bold", color: COLOR.UP, align: "end" }),
            txt(`AI ${s.totalScore ?? "—"}`, { size: "xxs", color: COLOR.TEXT_SUB, align: "end" }),
          ], { flex: 2, alignItems: "flex-end" }),
        ], { margin: "sm" })
      );
    });
  }

  if (macdSignals.length > 0) {
    if (bodyContents.length > 0) bodyContents.push(sep());
    bodyContents.push(txt("📡 MACD 買転換シグナル", { size: "sm", weight: "bold", color: "#3B82F6", margin: "md" }));
    macdSignals.slice(0, 3).forEach((s) => {
      bodyContents.push(
        box("horizontal", [
          txt(getStockDisplayName(s), { size: "sm", color: COLOR.TEXT_MAIN, flex: 3, wrap: true }),
          txt(`技術 ${s.technicalScore ?? "—"}/30`, { size: "xs", color: COLOR.TEXT_SUB, align: "end" }),
        ], { margin: "xs" })
      );
    });
  }

  if (fallers.length > 0) {
    if (bodyContents.length > 0) bodyContents.push(sep());
    bodyContents.push(txt("🔻 急落株（5日-5%以下）", { size: "sm", weight: "bold", color: "#E74C3C", margin: "md" }));
    fallers.slice(0, 3).forEach((s) => {
      bodyContents.push(
        box("horizontal", [
          txt(getStockDisplayName(s), { size: "sm", color: COLOR.TEXT_MAIN, flex: 3, wrap: true }),
          txt(pctText(s.return5d), { size: "sm", weight: "bold", color: COLOR.DOWN, align: "end" }),
        ], { margin: "xs" })
      );
    });
  }

  if (bodyContents.length === 0) {
    bodyContents.push(txt("本日注目銘柄なし", { size: "md", color: COLOR.TEXT_SUB, align: "center" }));
  }

  const bubble: FlexBubble = {
    type: "bubble",
    size: "mega",
    styles: {
      header: { backgroundColor: COLOR.HEADER_BG },
      body: { backgroundColor: COLOR.CARD_BG },
      footer: { backgroundColor: COLOR.HEADER_BG },
    },
    header: box("vertical", [
      box("horizontal", [
        txt("⚡", { size: "xl", flex: 0 }),
        box("vertical", [
          txt("午間速報", { size: "lg", weight: "bold", color: COLOR.TEXT_MAIN }),
          txt(`${dateStr} 12:30 JST`, { size: "xs", color: COLOR.TEXT_SUB }),
        ], { margin: "sm" }),
      ]),
    ], { paddingAll: "16px" }),
    body: box("vertical", bodyContents, { paddingAll: "16px", spacing: "sm" }),
    footer: box("vertical", [
      uriBtn("全市場を見る", `${APP_URL}/screener`),
    ], { paddingAll: "12px" }),
  };

  return flexMsg("AI午間速報 - 市場異動", bubble);
}

// ── 3. buildCloseReportFlex ───────────────────────────────────────────────────

export type CloseReportSummary = {
  dateStr: string;
  dowLabel: string;
  total: number;
  strongBuy: number;
  buy: number;
  hold: number;
  watch: number;
  avoid: number;
  avgScore: number;
  topPerformers: (StockNameFields & { totalScore?: number | null; recommendation?: string | null; return5d?: number | null })[];
  fishingCandidates: (StockNameFields & { totalScore?: number | null; rsi14?: number | null; return5d?: number | null })[],
};

export function buildCloseReportFlex(s: CloseReportSummary): LineFlexMessage {
  const bullCount = s.strongBuy + s.buy;
  const bullRate = s.total > 0 ? Math.round((bullCount / s.total) * 100) : 0;
  const moodLabel =
    bullRate >= 20 ? "強気 🟢" :
    bullRate >= 10 ? "中立 🟡" :
    "弱気 🔴";

  const scoreBarFull = Math.round(s.avgScore / 10);
  const scoreBar = "█".repeat(Math.min(scoreBarFull, 10)) + "░".repeat(Math.max(0, 10 - scoreBarFull));

  const bodyContents: FlexComponent[] = [
    // Market overview
    txt("📊 本日市場総括", { size: "sm", weight: "bold", color: COLOR.TEXT_SUB }),
    box("horizontal", [
      box("vertical", [
        txt(String(s.total), { size: "xl", weight: "bold", color: COLOR.TEXT_MAIN }),
        txt("対象銘柄", { size: "xxs", color: COLOR.TEXT_SUB }),
      ], { flex: 1 }),
      box("vertical", [
        txt(String(bullCount), { size: "xl", weight: "bold", color: COLOR.BUY }),
        txt("買推薦", { size: "xxs", color: COLOR.TEXT_SUB }),
      ], { flex: 1 }),
      box("vertical", [
        txt(String(s.hold), { size: "xl", weight: "bold", color: COLOR.HOLD }),
        txt("HOLD", { size: "xxs", color: COLOR.TEXT_SUB }),
      ], { flex: 1 }),
      box("vertical", [
        txt(String(s.avoid), { size: "xl", weight: "bold", color: COLOR.AVOID }),
        txt("回避", { size: "xxs", color: COLOR.TEXT_SUB }),
      ], { flex: 1 }),
    ], { margin: "sm" }),
    txt(`平均AI評分 ${s.avgScore}点 [${scoreBar}]  ${moodLabel}`, { size: "xs", color: COLOR.TEXT_SUB, margin: "sm" }),

    // Top performers
    ...(s.topPerformers.length > 0 ? [
      sep(),
      txt("🏆 今日 AI推薦TOP" + s.topPerformers.length, { size: "sm", weight: "bold", color: COLOR.TEXT_SUB, margin: "md" }),
      ...s.topPerformers.slice(0, 3).flatMap((p, i): FlexComponent[] => [
        ...(i > 0 ? [sep() as FlexComponent] : []),
        box("horizontal", [
          box("vertical", [
            txt(getStockDisplayName(p), { size: "sm", weight: "bold", color: COLOR.TEXT_MAIN, wrap: true }),
            txt(getStockSubName(p), { size: "xxs", color: COLOR.TEXT_SUB }),
          ], { flex: 3 }),
          box("vertical", [
            txt(`AI ${p.totalScore ?? "—"}`, { size: "sm", weight: "bold", color: recColor(p.recommendation), align: "end" }),
            txt(pctText(p.return5d), { size: "xs", color: pctColor(p.return5d), align: "end" }),
          ], { flex: 2, alignItems: "flex-end" }),
        ], { margin: "xs" }),
      ] as FlexComponent[]),
    ] : []),

    // Fishing candidates
    ...(s.fishingCandidates.length > 0 ? [
      sep(),
      txt("🎣 翌日注目候補（底打ちサイン）", { size: "sm", weight: "bold", color: COLOR.TEXT_SUB, margin: "md" }),
      ...s.fishingCandidates.slice(0, 3).map((c): FlexComponent =>
        box("horizontal", [
          txt(getStockDisplayName(c), { size: "xs", color: COLOR.TEXT_MAIN, flex: 3, wrap: true }),
          txt(`RSI ${c.rsi14?.toFixed(0) ?? "—"}  ${pctText(c.return5d)}`, { size: "xs", color: COLOR.TEXT_SUB, align: "end" }),
        ], { margin: "xs" })
      ),
    ] : []),
  ];

  const bubble: FlexBubble = {
    type: "bubble",
    size: "mega",
    styles: {
      header: { backgroundColor: COLOR.HEADER_BG },
      body: { backgroundColor: COLOR.CARD_BG },
      footer: { backgroundColor: COLOR.HEADER_BG },
    },
    header: box("vertical", [
      box("horizontal", [
        txt("🔔", { size: "xl", flex: 0 }),
        box("vertical", [
          txt("大引けまとめ", { size: "lg", weight: "bold", color: COLOR.TEXT_MAIN }),
          txt(`${s.dateStr} (${s.dowLabel}) · 大引後`, { size: "xs", color: COLOR.TEXT_SUB }),
        ], { margin: "sm" }),
      ]),
    ], { paddingAll: "16px" }),
    body: box("vertical", bodyContents, { paddingAll: "16px", spacing: "sm" }),
    footer: box("vertical", [
      uriBtn("📈 AI推薦を見る", `${APP_URL}/ai-picks`),
    ], { paddingAll: "12px" }),
  };

  return flexMsg("大引けまとめ - AI市場評価", bubble);
}

// ── 4. buildAlertFlex ─────────────────────────────────────────────────────────

export type AlertData = {
  stock: StockNameFields & { totalScore?: number | null; recommendation?: string | null; latestClose?: number | null };
  alertType: string;
  reasons: string[];
  priceChange?: number | null;
  scoreChange?: number | null;
  riskNote?: string;
};

export function buildAlertFlex(alert: AlertData): LineFlexMessage {
  const { stock, reasons, priceChange, scoreChange, riskNote } = alert;
  const displayName = getStockDisplayName(stock);
  const subName = getStockSubName(stock);
  const rec = stock.recommendation;

  const bodyContents: FlexComponent[] = [
    txt(displayName, { size: "xl", weight: "bold", color: COLOR.TEXT_MAIN, wrap: true }),
    txt(subName, { size: "xs", color: COLOR.TEXT_SUB }),
    sep(),
    ...reasons.map((r): FlexComponent =>
      txt(`⚡ ${r}`, { size: "sm", color: COLOR.TEXT_MAIN, wrap: true, margin: "xs" })
    ),
  ];

  if (priceChange != null) {
    bodyContents.push(
      box("horizontal", [
        txt("価格変化", { size: "xs", color: COLOR.TEXT_SUB, flex: 1 }),
        txt(pctText(priceChange), { size: "sm", weight: "bold", color: pctColor(priceChange) }),
      ], { margin: "sm" })
    );
  }

  if (stock.totalScore != null) {
    bodyContents.push(
      box("horizontal", [
        txt("AI評分", { size: "xs", color: COLOR.TEXT_SUB, flex: 1 }),
        txt(`${stock.totalScore}点`, { size: "sm", weight: "bold", color: recColor(rec) }),
        txt(recLabel(rec), { size: "xs", color: recColor(rec), margin: "sm" }),
      ], { margin: "xs" })
    );
  }

  if (scoreChange != null && Math.abs(scoreChange) >= 1) {
    bodyContents.push(
      txt(`スコア変化 ${scoreChange > 0 ? "+" : ""}${scoreChange}点`, { size: "xs", color: scoreChange > 0 ? COLOR.BUY : COLOR.AVOID, margin: "xs" })
    );
  }

  if (riskNote) {
    bodyContents.push(sep());
    bodyContents.push(txt(`⚠️ ${riskNote}`, { size: "xs", color: COLOR.WATCH, wrap: true, margin: "sm" }));
  }

  const bubble: FlexBubble = {
    type: "bubble",
    size: "mega",
    styles: {
      header: { backgroundColor: "#7B0000" },
      body: { backgroundColor: COLOR.CARD_BG },
      footer: { backgroundColor: COLOR.HEADER_BG },
    },
    header: box("vertical", [
      txt("🚨 異動提醒", { size: "lg", weight: "bold", color: "#FF6B6B" }),
    ], { paddingAll: "16px" }),
    body: box("vertical", bodyContents, { paddingAll: "16px", spacing: "sm" }),
    footer: box("vertical", [
      uriBtn("📊 詳細を見る", `${APP_URL}/stocks/${encodeURIComponent(stock.symbol)}`),
    ], { paddingAll: "12px" }),
  };

  return flexMsg(`異動提醒 ${displayName}`, bubble);
}

// ── 5. buildRiskAlertFlex ─────────────────────────────────────────────────────

export type RiskStock = StockNameFields & {
  totalScore?: number | null;
  rsi14?: number | null;
  macdSignalLabel?: string | null;
  return5d?: number | null;
  latestClose?: number | null;
};

export function buildRiskAlertFlex(stocks: RiskStock[], dateStr: string): LineFlexMessage {
  const bodyContents: FlexComponent[] = [
    txt(`計 ${stocks.length} 銘柄でリスク指標が発動`, { size: "sm", color: COLOR.TEXT_SUB }),
    sep(),
    ...stocks.slice(0, 8).flatMap((r, i): FlexComponent[] => {
      const warns: string[] = [];
      if (r.rsi14 && r.rsi14 > 80) warns.push(`RSI ${r.rsi14.toFixed(0)}`);
      if (r.macdSignalLabel === "SELL") warns.push("MACD売転換");
      if (r.totalScore != null && r.totalScore < 30) warns.push(`AI ${r.totalScore}点`);
      if (r.return5d != null && r.return5d <= -7) warns.push(`5日${pctText(r.return5d)}`);

      return [
        ...(i > 0 ? [sep() as FlexComponent] : []),
        box("horizontal", [
          box("vertical", [
            txt(getStockDisplayName(r), { size: "sm", weight: "bold", color: COLOR.TEXT_MAIN, wrap: true }),
            txt(getStockSubName(r), { size: "xxs", color: COLOR.TEXT_SUB }),
          ], { flex: 3 }),
          box("vertical", [
            txt(pctText(r.return5d), { size: "sm", weight: "bold", color: pctColor(r.return5d), align: "end" }),
            txt(priceText(r.latestClose), { size: "xxs", color: COLOR.TEXT_SUB, align: "end" }),
          ], { flex: 2, alignItems: "flex-end" }),
        ], { margin: "xs" }),
        txt(`⚠️ ${warns.join(" | ")}`, { size: "xxs", color: COLOR.WATCH, wrap: true }),
      ];
    }),
  ];

  const bubble: FlexBubble = {
    type: "bubble",
    size: "mega",
    styles: {
      header: { backgroundColor: "#4A1010" },
      body: { backgroundColor: COLOR.CARD_BG },
      footer: { backgroundColor: COLOR.HEADER_BG },
    },
    header: box("vertical", [
      txt("🚨 リスク警告", { size: "lg", weight: "bold", color: "#FF6B6B" }),
      txt(`${dateStr} 16:35 JST`, { size: "xs", color: "#FF9999" }),
    ], { paddingAll: "16px" }),
    body: box("vertical", bodyContents, { paddingAll: "16px", spacing: "sm" }),
    footer: box("vertical", [
      uriBtn("スクリーナーを見る", `${APP_URL}/screener`),
    ], { paddingAll: "12px" }),
  };

  return flexMsg(`リスク警告 ${stocks.length}銘柄`, bubble);
}

// ── 6. buildStockCard ─────────────────────────────────────────────────────────

export type StockCardData = StockNameFields & {
  totalScore?: number | null;
  recommendation?: string | null;
  latestClose?: number | null;
  return5d?: number | null;
  return20d?: number | null;
  summaryReason?: string | null;
  technicalScore?: number | null;
  fundamentalScore?: number | null;
  moneyFlowScore?: number | null;
  newsSentimentScore?: number | null;
  globalTrendScore?: number | null;
};

export function buildStockCard(stock: StockCardData): LineFlexMessage {
  const displayName = getStockDisplayName(stock);
  const subName = getStockSubName(stock);
  const rec = stock.recommendation;
  const score = stock.totalScore ?? 0;
  const reasonRaw = stock.summaryReason?.replace(/\[.*?\]/g, "").trim() ?? "";

  const scoreItems: FlexComponent[] = [];
  const dims: Array<[string, number | null | undefined, number]> = [
    ["技術", stock.technicalScore, 30],
    ["基本", stock.fundamentalScore, 25],
    ["資金", stock.moneyFlowScore, 20],
    ["ニュース", stock.newsSentimentScore, 15],
    ["グローバル", stock.globalTrendScore, 10],
  ];
  dims.forEach(([label, val, max]) => {
    if (val == null) return;
    const pct = Math.round((val / max) * 100);
    scoreItems.push(
      box("horizontal", [
        txt(label, { size: "xxs", color: COLOR.TEXT_SUB, flex: 3 }),
        txt(`${val}/${max}`, { size: "xxs", color: COLOR.TEXT_MAIN, flex: 2, align: "end" }),
        txt(`(${pct}%)`, { size: "xxs", color: COLOR.TEXT_SUB }),
      ], { margin: "xs" })
    );
  });

  const bodyContents: FlexComponent[] = [
    txt(displayName, { size: "xl", weight: "bold", color: COLOR.TEXT_MAIN, wrap: true }),
    txt(subName, { size: "sm", color: COLOR.TEXT_SUB }),
    sep(),
    box("horizontal", [
      box("vertical", [
        txt(String(score), { size: "4xl", weight: "bold", color: recColor(rec) }),
        txt("AI 評分", { size: "xxs", color: COLOR.TEXT_SUB }),
      ], { flex: 1 }),
      box("vertical", [
        txt(recLabel(rec), { size: "md", weight: "bold", color: recColor(rec) }),
        txt(priceText(stock.latestClose), { size: "sm", color: COLOR.TEXT_MAIN, margin: "sm" }),
        box("horizontal", [
          txt("5日", { size: "xxs", color: COLOR.TEXT_SUB }),
          txt(pctText(stock.return5d), { size: "xs", weight: "bold", color: pctColor(stock.return5d), margin: "xs" }),
          txt("20日", { size: "xxs", color: COLOR.TEXT_SUB, margin: "sm" }),
          txt(pctText(stock.return20d), { size: "xs", weight: "bold", color: pctColor(stock.return20d), margin: "xs" }),
        ]),
      ], { flex: 2, margin: "sm" }),
    ], { margin: "sm" }),
    ...(scoreItems.length > 0 ? [sep(), txt("スコア内訳", { size: "xs", color: COLOR.TEXT_SUB, margin: "sm" }), ...scoreItems] : []),
    ...(reasonRaw ? [sep(), txt(`💡 ${reasonRaw.slice(0, 80)}`, { size: "xs", color: COLOR.TEXT_SUB, wrap: true, margin: "sm" })] : []),
  ];

  const bubble: FlexBubble = {
    type: "bubble",
    size: "mega",
    styles: {
      header: { backgroundColor: recColor(rec) },
      body: { backgroundColor: COLOR.CARD_BG },
      footer: { backgroundColor: COLOR.HEADER_BG },
    },
    header: box("vertical", [
      txt("TOHOSHOU AI 株式評価", { size: "xs", color: "#FFFFFF99" }),
    ], { paddingAll: "12px" }),
    body: box("vertical", bodyContents, { paddingAll: "16px", spacing: "sm" }),
    footer: box("vertical", [
      uriBtn("📊 詳細分析を見る", `${APP_URL}/stocks/${encodeURIComponent(stock.symbol)}`),
    ], { paddingAll: "12px" }),
  };

  return flexMsg(`${displayName} AI評価 ${score}点 ${recLabel(rec)}`, bubble);
}

// ── 7. buildTestFlex ──────────────────────────────────────────────────────────

export function buildTestFlex(message?: string): LineFlexMessage {
  const bubble: FlexBubble = {
    type: "bubble",
    size: "kilo",
    styles: {
      header: { backgroundColor: "#1A4329" },
      body: { backgroundColor: COLOR.CARD_BG },
    },
    header: box("vertical", [
      txt("✅ TOHOSHOU AI テスト", { size: "md", weight: "bold", color: "#4ADE80" }),
    ], { paddingAll: "12px" }),
    body: box("vertical", [
      txt(message ?? "Flex Message 正常動作確認", { size: "sm", color: COLOR.TEXT_MAIN, wrap: true }),
      txt(new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }), { size: "xxs", color: COLOR.TEXT_SUB, margin: "md" }),
    ], { paddingAll: "16px" }),
  };

  return flexMsg("TOHOSHOU AI テスト送信", bubble);
}

// ── V2 Chat Response Builders ─────────────────────────────────────────────────

// Theme label map (covers both old and new naming conventions)
const THEME_LABEL: Record<string, string> = {
  SEMICONDUCTOR:  "半导体设备",
  ELECTRONICS:    "电子精密",
  SOFTWARE_AI:    "软件AI云",
  INDUSTRIAL_AUTO:"工业自动化",
  TELECOM_DC:     "通信DC",
  TECH_SERVICES:  "科技服务",
  AI_SOFTWARE:    "AI软件",
  ROBOTICS:       "机器人",
  DATACENTER:     "数据中心",
  AI_CONCEPT:     "AI概念",
};

// ── 8. buildAiPicksChatFlex ────────────────────────────────────────────────────

export type AiPicksStock = StockNameFields & {
  totalScore?: number | null;
  recommendation?: string | null;
  latestClose?: number | null;
  return5d?: number | null;
  summaryReason?: string | null;
  technicalScore?: number | null;
  fundamentalScore?: number | null;
  moneyFlowScore?: number | null;
  newsSentimentScore?: number | null;
  globalTrendScore?: number | null;
};

export function buildAiPicksChatFlex(
  stocks: AiPicksStock[],
  dateStr: string,
): LineFlexMessage {
  const top = stocks.slice(0, 10);
  const first5 = top.slice(0, 5);
  const next5 = top.slice(5, 10);

  function compactRow(s: AiPicksStock, rank: number): FlexComponent {
    const name = getStockDisplayName(s);
    const sym = s.symbol.replace(".T", "");
    const score = s.totalScore ?? 0;
    const rec = s.recommendation;
    const dims = [
      s.technicalScore != null ? `技${s.technicalScore}` : null,
      s.fundamentalScore != null ? `基${s.fundamentalScore}` : null,
      s.moneyFlowScore != null ? `資${s.moneyFlowScore}` : null,
      s.newsSentimentScore != null ? `話${s.newsSentimentScore}` : null,
      s.globalTrendScore != null ? `G${s.globalTrendScore}` : null,
    ].filter(Boolean).join(" ");

    return box("vertical", [
      box("horizontal", [
        txt(`${rank}`, { size: "xs", color: COLOR.TEXT_SUB, flex: 0, margin: "none" }),
        box("vertical", [
          txt(name, { size: "sm", weight: "bold", color: COLOR.TEXT_MAIN, wrap: true }),
          txt(sym, { size: "xxs", color: COLOR.TEXT_SUB }),
        ], { flex: 3, margin: "xs" }),
        box("vertical", [
          txt(String(score), { size: "lg", weight: "bold", color: recColor(rec), align: "end" }),
          txt(recLabel(rec), { size: "xxs", color: recColor(rec), align: "end" }),
          txt(pctText(s.return5d), { size: "xxs", weight: "bold", color: pctColor(s.return5d), align: "end" }),
        ], { flex: 2, alignItems: "flex-end" }),
      ], { margin: "sm" }),
      ...(dims ? [txt(dims, { size: "xxs", color: COLOR.TEXT_SUB, margin: "xs", wrap: true })] : []),
    ], { margin: "sm" });
  }

  function makeBubble(items: AiPicksStock[], startRank: number, isLast: boolean): FlexBubble {
    const bodyContents: FlexComponent[] = [];
    items.forEach((s, i) => {
      if (i > 0) bodyContents.push(sep());
      bodyContents.push(compactRow(s, startRank + i));
    });

    return {
      type: "bubble",
      size: "mega",
      styles: {
        header: { backgroundColor: COLOR.HEADER_BG },
        body: { backgroundColor: COLOR.CARD_BG },
        footer: { backgroundColor: COLOR.HEADER_BG },
      },
      header: box("vertical", [
        box("horizontal", [
          txt("📈", { size: "xl", flex: 0 }),
          box("vertical", [
            txt(`AI推薦 TOP${top.length}`, { size: "lg", weight: "bold", color: COLOR.TEXT_MAIN }),
            txt(`${dateStr} · TOHOSHOU AI V7.3`, { size: "xs", color: COLOR.TEXT_SUB }),
          ], { margin: "sm" }),
        ]),
      ], { paddingAll: "16px" }),
      body: box("vertical", bodyContents, { paddingAll: "16px", spacing: "sm" }),
      footer: isLast ? box("vertical", [
        uriBtn("📊 完整分析報告を見る", aiPicksUrl()),
      ], { paddingAll: "12px" }) : undefined,
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

// ── 9. buildAiThemeChatFlex ───────────────────────────────────────────────────

export type AiThemeStock = StockNameFields & {
  theme: string;
  totalScore?: number | null;
  recommendation?: string | null;
  return5d?: number | null;
};

export function buildAiThemeChatFlex(
  stocks: AiThemeStock[],
  dateStr: string,
): LineFlexMessage {
  // Group by theme
  const groups = new Map<string, AiThemeStock[]>();
  for (const s of stocks) {
    const g = groups.get(s.theme) ?? [];
    g.push(s);
    groups.set(s.theme, g);
  }

  const bodyContents: FlexComponent[] = [
    txt(`${stocks.length}銘柄 · ${dateStr}`, { size: "xxs", color: COLOR.TEXT_SUB }),
  ];

  let first = true;
  for (const [theme, items] of groups) {
    if (!first) bodyContents.push(sep());
    first = false;
    const label = THEME_LABEL[theme] ?? theme;
    bodyContents.push(
      txt(`◆ ${label}`, { size: "xs", weight: "bold", color: "#60A5FA", margin: "md" }),
    );
    items.slice(0, 5).forEach((s) => {
      bodyContents.push(
        box("horizontal", [
          box("vertical", [
            txt(getStockDisplayName(s), { size: "sm", weight: "bold", color: COLOR.TEXT_MAIN, wrap: true }),
            txt(getStockSubName(s), { size: "xxs", color: COLOR.TEXT_SUB }),
          ], { flex: 4 }),
          box("vertical", [
            txt(String(s.totalScore ?? "—"), { size: "sm", weight: "bold", color: recColor(s.recommendation), align: "end" }),
            txt(pctText(s.return5d), { size: "xxs", color: pctColor(s.return5d), align: "end" }),
          ], { flex: 2, alignItems: "flex-end" }),
        ], { margin: "xs" }),
      );
    });
  }

  const bubble: FlexBubble = {
    type: "bubble",
    size: "mega",
    styles: {
      header: { backgroundColor: "#0D1B2A" },
      body: { backgroundColor: COLOR.CARD_BG },
      footer: { backgroundColor: COLOR.HEADER_BG },
    },
    header: box("vertical", [
      box("horizontal", [
        txt("⚡", { size: "xl", flex: 0 }),
        box("vertical", [
          txt("科技株・AIサプライチェーン", { size: "md", weight: "bold", color: COLOR.TEXT_MAIN }),
          txt("日本テーマ株 TOP20", { size: "xs", color: "#93C5FD" }),
        ], { margin: "sm" }),
      ]),
    ], { paddingAll: "16px" }),
    body: box("vertical", bodyContents, { paddingAll: "16px", spacing: "sm" }),
    footer: box("vertical", [
      uriBtn("⚡ 科技株テーマページ", aiThemeUrl()),
    ], { paddingAll: "12px" }),
  };

  return flexMsg(`日本科技株・AI産業チェーン TOP${stocks.length}`, bubble);
}

// ── 10. buildMarketSummaryFlex ────────────────────────────────────────────────

export type MarketSummaryData = {
  total: number;
  realCount: number;
  strongBuy: number;
  buy: number;
  hold: number;
  watch: number;
  avoid: number;
  avgScore: number;
  topSymbol?: string;
  topName?: string;
  topScore?: number;
  topRec?: string;
  dateStr: string;
};

export function buildMarketSummaryFlex(d: MarketSummaryData): LineFlexMessage {
  const bullCount = d.strongBuy + d.buy;
  const bullRate = d.total > 0 ? Math.round((bullCount / d.total) * 100) : 0;
  const moodLabel = bullRate >= 20 ? "強気 🟢" : bullRate >= 10 ? "中立 🟡" : "弱気 🔴";
  const realRate = d.total > 0 ? Math.round((d.realCount / d.total) * 100) : 0;

  const bodyContents: FlexComponent[] = [
    // Stats grid
    box("horizontal", [
      box("vertical", [
        txt(String(d.total), { size: "xl", weight: "bold", color: COLOR.TEXT_MAIN }),
        txt("対象銘柄", { size: "xxs", color: COLOR.TEXT_SUB }),
      ], { flex: 1 }),
      box("vertical", [
        txt(String(d.realCount), { size: "xl", weight: "bold", color: "#60A5FA" }),
        txt(`REAL(${realRate}%)`, { size: "xxs", color: COLOR.TEXT_SUB }),
      ], { flex: 1 }),
      box("vertical", [
        txt(String(bullCount), { size: "xl", weight: "bold", color: COLOR.BUY }),
        txt("買推薦", { size: "xxs", color: COLOR.TEXT_SUB }),
      ], { flex: 1 }),
    ], { margin: "sm" }),
    sep(),
    // Rating breakdown
    txt("📊 評価内訳", { size: "xs", weight: "bold", color: COLOR.TEXT_SUB, margin: "sm" }),
    box("horizontal", [
      box("vertical", [txt(String(d.strongBuy), { size: "lg", weight: "bold", color: COLOR.STRONG_BUY }), txt("強BUY", { size: "xxs", color: COLOR.TEXT_SUB })], { flex: 1 }),
      box("vertical", [txt(String(d.buy), { size: "lg", weight: "bold", color: COLOR.BUY }), txt("BUY", { size: "xxs", color: COLOR.TEXT_SUB })], { flex: 1 }),
      box("vertical", [txt(String(d.hold), { size: "lg", weight: "bold", color: COLOR.HOLD }), txt("HOLD", { size: "xxs", color: COLOR.TEXT_SUB })], { flex: 1 }),
      box("vertical", [txt(String(d.watch), { size: "lg", weight: "bold", color: COLOR.WATCH }), txt("WATCH", { size: "xxs", color: COLOR.TEXT_SUB })], { flex: 1 }),
      box("vertical", [txt(String(d.avoid), { size: "lg", weight: "bold", color: COLOR.AVOID }), txt("AVOID", { size: "xxs", color: COLOR.TEXT_SUB })], { flex: 1 }),
    ], { margin: "xs" }),
    sep(),
    // Market mood
    box("horizontal", [
      txt("平均AI評分", { size: "xs", color: COLOR.TEXT_SUB, flex: 2 }),
      txt(`${d.avgScore}点`, { size: "sm", weight: "bold", color: COLOR.TEXT_MAIN }),
      txt(moodLabel, { size: "xs", color: COLOR.TEXT_MAIN, margin: "md" }),
    ], { margin: "sm" }),
    ...(d.topSymbol ? [
      sep(),
      txt("🏆 本日 AI総合1位", { size: "xs", weight: "bold", color: COLOR.TEXT_SUB, margin: "sm" }),
      box("horizontal", [
        box("vertical", [
          txt(d.topName ?? d.topSymbol, { size: "md", weight: "bold", color: COLOR.TEXT_MAIN, wrap: true }),
          txt(d.topSymbol.replace(".T", ""), { size: "xxs", color: COLOR.TEXT_SUB }),
        ], { flex: 3 }),
        box("vertical", [
          txt(String(d.topScore ?? "—"), { size: "xl", weight: "bold", color: recColor(d.topRec), align: "end" }),
          txt(recLabel(d.topRec), { size: "xxs", color: recColor(d.topRec), align: "end" }),
        ], { flex: 2, alignItems: "flex-end" }),
      ], { margin: "xs" }),
    ] : []),
    sep(),
    txt(`データ更新日 ${d.dateStr}`, { size: "xxs", color: COLOR.TEXT_SUB, margin: "sm" }),
  ];

  const bubble: FlexBubble = {
    type: "bubble",
    size: "mega",
    styles: {
      header: { backgroundColor: "#0A1628" },
      body: { backgroundColor: COLOR.CARD_BG },
      footer: { backgroundColor: COLOR.HEADER_BG },
    },
    header: box("vertical", [
      box("horizontal", [
        txt("🌏", { size: "xl", flex: 0 }),
        box("vertical", [
          txt("全市場 AI評価サマリー", { size: "md", weight: "bold", color: COLOR.TEXT_MAIN }),
          txt("TOHOSHOU AI · 全銘柄スキャン", { size: "xs", color: COLOR.TEXT_SUB }),
        ], { margin: "sm" }),
      ]),
    ], { paddingAll: "16px" }),
    body: box("vertical", bodyContents, { paddingAll: "16px", spacing: "sm" }),
    footer: box("vertical", [
      uriBtn("🌏 スクリーナーを開く", screenerUrl()),
    ], { paddingAll: "12px" }),
  };

  return flexMsg(`全市場AIサマリー ${d.dateStr}`, bubble);
}

// ── 11. buildNotificationStatusFlex ──────────────────────────────────────────

export type NotificationStatusData = {
  quotaType: string;
  quotaValue: number | null;
  totalUsage: number;
  remaining: number | null;
  pct: number;
  exhausted: boolean;
  morningEnabled?: boolean;
  middayEnabled?: boolean;
  closeEnabled?: boolean;
  alertEnabled?: boolean;
  lastLogTitle?: string;
  lastLogStatus?: string;
};

export function buildNotificationStatusFlex(d: NotificationStatusData): LineFlexMessage {
  const planLabel = d.quotaType === "limited"
    ? `免費版 (${d.quotaValue ?? 0}通/月)`
    : d.quotaType === "unlimited" ? "有料版 (無制限)" : "不明";

  const quotaBarFull = Math.min(10, Math.round(d.pct / 10));
  const quotaBar = (d.exhausted ? "█" : "▓").repeat(quotaBarFull) + "░".repeat(10 - quotaBarFull);

  const toggle = (on: boolean | undefined) => on ? "✅ ON" : "⬜ OFF";

  const bodyContents: FlexComponent[] = [
    txt("📊 LINE配額", { size: "sm", weight: "bold", color: COLOR.TEXT_SUB }),
    box("horizontal", [
      box("vertical", [
        txt(`${d.totalUsage}`, { size: "xl", weight: "bold", color: d.exhausted ? COLOR.AVOID : COLOR.TEXT_MAIN }),
        txt("使用済み", { size: "xxs", color: COLOR.TEXT_SUB }),
      ], { flex: 1 }),
      box("vertical", [
        txt(d.remaining !== null ? String(d.remaining) : "∞", { size: "xl", weight: "bold", color: d.exhausted ? COLOR.AVOID : COLOR.BUY }),
        txt("残り", { size: "xxs", color: COLOR.TEXT_SUB }),
      ], { flex: 1 }),
      box("vertical", [
        txt(`${d.pct}%`, { size: "xl", weight: "bold", color: d.exhausted ? COLOR.AVOID : COLOR.TEXT_MAIN }),
        txt(planLabel, { size: "xxs", color: COLOR.TEXT_SUB }),
      ], { flex: 2 }),
    ], { margin: "xs" }),
    txt(quotaBar, { size: "xxs", color: d.exhausted ? COLOR.AVOID : "#60A5FA", margin: "xs" }),
    ...(d.exhausted ? [txt("⚠️ 月額度已耗尽 — 来月1日リセット", { size: "xs", color: COLOR.AVOID, wrap: true, margin: "sm" })] : []),
    sep(),
    txt("🔔 推送設定", { size: "sm", weight: "bold", color: COLOR.TEXT_SUB, margin: "sm" }),
    box("horizontal", [
      txt("朝報", { size: "xs", color: COLOR.TEXT_SUB, flex: 1 }),
      txt(toggle(d.morningEnabled), { size: "xs", color: COLOR.TEXT_MAIN }),
      txt("午間", { size: "xs", color: COLOR.TEXT_SUB, flex: 1, margin: "md" }),
      txt(toggle(d.middayEnabled), { size: "xs", color: COLOR.TEXT_MAIN }),
    ], { margin: "xs" }),
    box("horizontal", [
      txt("大引け", { size: "xs", color: COLOR.TEXT_SUB, flex: 1 }),
      txt(toggle(d.closeEnabled), { size: "xs", color: COLOR.TEXT_MAIN }),
      txt("アラート", { size: "xs", color: COLOR.TEXT_SUB, flex: 1, margin: "md" }),
      txt(toggle(d.alertEnabled), { size: "xs", color: COLOR.TEXT_MAIN }),
    ], { margin: "xs" }),
    ...(d.lastLogTitle ? [
      sep(),
      txt("最終送信", { size: "xxs", color: COLOR.TEXT_SUB, margin: "sm" }),
      txt(d.lastLogTitle.slice(0, 40), { size: "xs", color: COLOR.TEXT_MAIN, wrap: true }),
      txt(d.lastLogStatus ?? "", { size: "xxs", color: d.lastLogStatus === "SUCCESS" ? COLOR.BUY : COLOR.AVOID }),
    ] : []),
  ];

  const bubble: FlexBubble = {
    type: "bubble",
    size: "mega",
    styles: {
      header: { backgroundColor: d.exhausted ? "#4A0000" : COLOR.HEADER_BG },
      body: { backgroundColor: COLOR.CARD_BG },
      footer: { backgroundColor: COLOR.HEADER_BG },
    },
    header: box("vertical", [
      txt(d.exhausted ? "⚠️ 通知ステータス（配額耗尽）" : "🔔 通知ステータス", { size: "md", weight: "bold", color: d.exhausted ? "#FF9999" : COLOR.TEXT_MAIN }),
    ], { paddingAll: "16px" }),
    body: box("vertical", bodyContents, { paddingAll: "16px", spacing: "sm" }),
    footer: box("vertical", [
      uriBtn("🔔 通知管理ページを開く", notificationsUrl()),
    ], { paddingAll: "12px" }),
  };

  return flexMsg("通知ステータス", bubble);
}

// ── 12. buildHelpFlex ─────────────────────────────────────────────────────────

export function buildHelpFlex(): LineFlexMessage {
  const menuItems: [string, string, string][] = [
    ["📈 AI推薦",   "今日推荐 / AI推荐 / TOP10",    "推荐股票 AI评分"],
    ["⚡ 科技株",   "科技股 / 半导体 / 机器人",      "科技主题股 TOP20"],
    ["🌏 全市場",   "全市场 / 市场 / 筛选",          "全市场评分摘要"],
    ["📰 资讯",     "新闻 / 资讯 / TDnet",           "最新市场新闻"],
    ["🔔 通知",     "通知 / 通知管理",               "LINE推送状态"],
    ["💼 持仓",     "持仓 / portfolio",              "持仓管理"],
    ["📊 股票查询", "7203 / 输入4位代码",            "查询个股AI评分"],
  ];

  const bodyContents: FlexComponent[] = [
    txt("TOHOSHOU AI V7.3 · 全ての機能", { size: "xs", color: COLOR.TEXT_SUB }),
    sep(),
    ...menuItems.flatMap(([icon, trigger, desc], i): FlexComponent[] => [
      ...(i > 0 ? [sep() as FlexComponent] : []),
      box("vertical", [
        txt(icon, { size: "sm", weight: "bold", color: COLOR.TEXT_MAIN }),
        txt(trigger, { size: "xs", color: "#60A5FA", wrap: true }),
        txt(desc, { size: "xxs", color: COLOR.TEXT_SUB }),
      ], { margin: "xs" }),
    ]),
    sep(),
    txt("深度分析: 分析7203 / 分析丰田", { size: "xs", color: COLOR.TEXT_SUB, margin: "sm", wrap: true }),
    txt("毎日08:00 JST 朝報自動配信 📊", { size: "xxs", color: COLOR.TEXT_SUB, margin: "xs" }),
  ];

  const bubble: FlexBubble = {
    type: "bubble",
    size: "mega",
    styles: {
      header: { backgroundColor: "#1A2A1A" },
      body: { backgroundColor: COLOR.CARD_BG },
      footer: { backgroundColor: COLOR.HEADER_BG },
    },
    header: box("vertical", [
      txt("📘 TOHOSHOU AI 使用ガイド", { size: "md", weight: "bold", color: "#4ADE80" }),
      txt("日本AI選株システム V7.3", { size: "xs", color: "#86EFAC" }),
    ], { paddingAll: "16px" }),
    body: box("vertical", bodyContents, { paddingAll: "16px", spacing: "sm" }),
    footer: box("vertical", [
      uriBtn("🔗 ウェブアプリを開く", getBaseUrl()),
    ], { paddingAll: "12px" }),
  };

  return flexMsg("TOHOSHOU AI V7.3 使用ガイド", bubble);
}

// ── 13. buildWelcomeFlex ──────────────────────────────────────────────────────

export function buildWelcomeFlex(): LineFlexMessage {
  const features: [string, string][] = [
    ["✓ 3714只股票", "REAL评分 · J-Quants真实资金流"],
    ["✓ 全球市场",   "NASDAQ / VIX / 日经实时同步"],
    ["✓ AI产业链",   "日本科技股 · 半导体 · AI云"],
    ["✓ Flex推送",   "朝報 / 午間 / 大引け自动推送"],
  ];

  const bodyContents: FlexComponent[] = [
    txt("🇯🇵 日本AI选股系统", { size: "md", weight: "bold", color: COLOR.TEXT_MAIN }),
    txt("TOHOSHOU AI V7.3", { size: "xs", color: COLOR.TEXT_SUB }),
    sep(),
    ...features.map(([title, sub]): FlexComponent =>
      box("horizontal", [
        txt(title, { size: "sm", weight: "bold", color: "#4ADE80", flex: 2 }),
        txt(sub, { size: "xs", color: COLOR.TEXT_SUB, flex: 3, wrap: true }),
      ], { margin: "xs" }),
    ),
    sep(),
    txt("请发送以下指令：", { size: "xs", color: COLOR.TEXT_SUB, margin: "sm" }),
    box("vertical", [
      txt("📈 今日推荐 · ⚡ 科技股 · 🌏 全市场", { size: "xs", color: "#60A5FA", wrap: true }),
      txt("📰 新闻 · 🔔 通知 · 📘 帮助", { size: "xs", color: "#60A5FA", wrap: true, margin: "xs" }),
      txt("7203 → 丰田AI分析  9984 → 软银分析", { size: "xs", color: COLOR.TEXT_SUB, wrap: true, margin: "xs" }),
    ]),
  ];

  const bubble: FlexBubble = {
    type: "bubble",
    size: "mega",
    styles: {
      header: { backgroundColor: "#0D2818" },
      body: { backgroundColor: COLOR.CARD_BG },
      footer: { backgroundColor: COLOR.HEADER_BG },
    },
    header: box("vertical", [
      txt("🤖 TOHOSHOU AI", { size: "xl", weight: "bold", color: "#4ADE80" }),
      txt("欢迎使用 · Welcome", { size: "xs", color: "#86EFAC" }),
    ], { paddingAll: "16px" }),
    body: box("vertical", bodyContents, { paddingAll: "16px", spacing: "sm" }),
    footer: box("vertical", [
      uriBtn("📊 打开 AI推荐 TOP10", aiPicksUrl()),
    ], { paddingAll: "12px" }),
  };

  return flexMsg("欢迎使用 TOHOSHOU AI V7.3", bubble);
}

// ── 14. buildGroupJoinFlex ────────────────────────────────────────────────────

export function buildGroupJoinFlex(): LineFlexMessage {
  const bodyContents: FlexComponent[] = [
    txt("🇯🇵 日本AI选股系统", { size: "md", weight: "bold", color: COLOR.TEXT_MAIN }),
    txt("TOHOSHOU AI V7.3", { size: "xs", color: COLOR.TEXT_SUB }),
    sep(),
    txt("📊 支持指令", { size: "sm", weight: "bold", color: COLOR.TEXT_SUB, margin: "sm" }),
    box("vertical", [
      txt("今日推荐 → AI推荐TOP10",       { size: "xs", color: "#60A5FA" }),
      txt("科技股   → 科技主题TOP20",     { size: "xs", color: "#60A5FA", margin: "xs" }),
      txt("全市场   → 全市场评分摘要",    { size: "xs", color: "#60A5FA", margin: "xs" }),
      txt("7203     → 丰田个股分析",      { size: "xs", color: "#60A5FA", margin: "xs" }),
      txt("帮助     → 完整使用指南",      { size: "xs", color: "#60A5FA", margin: "xs" }),
    ]),
    sep(),
    txt("每天 08:00 JST 自動配信 朝報 📊", { size: "xs", color: COLOR.TEXT_SUB, margin: "sm" }),
  ];

  const bubble: FlexBubble = {
    type: "bubble",
    size: "mega",
    styles: {
      header: { backgroundColor: "#0D2818" },
      body: { backgroundColor: COLOR.CARD_BG },
      footer: { backgroundColor: COLOR.HEADER_BG },
    },
    header: box("vertical", [
      txt("🤖 TOHOSHOU AI が参加しました", { size: "md", weight: "bold", color: "#4ADE80" }),
    ], { paddingAll: "16px" }),
    body: box("vertical", bodyContents, { paddingAll: "16px", spacing: "sm" }),
    footer: box("vertical", [
      uriBtn("📊 打开AI推荐 TOP10", aiPicksUrl()),
    ], { paddingAll: "12px" }),
  };

  return flexMsg("TOHOSHOU AI 已加入群组", bubble);
}
