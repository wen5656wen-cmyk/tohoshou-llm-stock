/**
 * LINE Chat Handler V2 — TOHOSHOU AI V7.3
 *
 * Authorization guard + V2 intent routing → Flex Message or text reply.
 * Returns LineMessage[] (can be flex or text), or null if unauthorized.
 */

import { prisma } from "@/lib/prisma";
import { textMsg, type LineMessage } from "@/lib/line";
import { processMessage } from "@/lib/ai-agent";
import { upsertLineUser, upsertLineGroup } from "@/lib/line-agent";
import type { LineEventSource } from "@/lib/line";
import {
  buildAiPicksChatFlex,
  buildAiThemeChatFlex,
  buildMarketSummaryFlex,
  buildNotificationStatusFlex,
  buildHelpFlex,
  buildWelcomeFlex,
} from "@/lib/line-flex";
import { newsUrl, portfolioUrl } from "@/lib/app-url";

// ── Authorization ─────────────────────────────────────────────────────────────

function isAuthorized(userId: string | null): boolean {
  const ownerId = process.env.LINE_OWNER_USER_ID;
  if (!ownerId) return true;
  return userId === ownerId;
}

// ── V2 Intent Parser ──────────────────────────────────────────────────────────

type V2Intent =
  | "welcome"
  | "ai_picks"
  | "ai_theme"
  | "market"
  | "news"
  | "notifications"
  | "portfolio"
  | "help";

function parseV2Intent(text: string): V2Intent | null {
  const t = text.trim();

  if (/^(\/start|start)$/i.test(t)) return "welcome";

  // AI推荐
  if (/^(ai推荐|ai推薦|今日推荐|今日推薦|推荐|推薦|top10?|picks)$/i.test(t)) return "ai_picks";
  if (/今[日天][的]?(推荐|推薦)/i.test(t)) return "ai_picks";

  // 科技股
  if (/^(科技股|ai产业链|ai産業チェーン|半导体|机器人|数据中心|テーマ株)$/i.test(t)) return "ai_theme";

  // 全市场
  if (/^(全市场|全市場|股票排行|筛选|スクリーナー|screener|市场概况)$/i.test(t)) return "market";
  if (/全市[场場]/i.test(t)) return "market";

  // 新闻
  if (/^(新闻|新聞|资讯|資訊|tdnet|公告|ニュース|news)$/i.test(t)) return "news";
  if (/今[天日]的?(新闻|资讯)/i.test(t)) return "news";

  // 通知
  if (/^(通知|通知管理|通知設定|设置|notifications)$/i.test(t)) return "notifications";

  // 持仓
  if (/^(持仓|持倉|我的持仓|portfolio|持ち株)$/i.test(t)) return "portfolio";

  // 帮助
  if (/^(帮助|幫助|使用指南|菜单|功能|help|\/help|ガイド|使い方|ヘルプ)$/i.test(t)) return "help";

  return null;
}

// ── V2 Handlers ───────────────────────────────────────────────────────────────

async function handleAiPicks(): Promise<LineMessage[]> {
  const now = new Date();
  const tokyoDate = new Date(now.getTime() + 9 * 3600000);
  const dateStr = tokyoDate.toISOString().split("T")[0];

  const scores = await prisma.stockScore.findMany({
    where: { priceCount: { gte: 20 } },
    orderBy: { totalScore: "desc" },
    take: 10,
    select: {
      symbol: true, name: true, nameZh: true,
      totalScore: true, recommendation: true,
      latestClose: true, return5d: true, summaryReason: true,
      technicalScore: true, fundamentalScore: true,
      moneyFlowScore: true, newsSentimentScore: true, globalTrendScore: true,
    },
  });

  if (scores.length === 0) {
    return [textMsg("⚠️ 暂无评分数据，请稍后再试。")];
  }

  return [buildAiPicksChatFlex(scores, dateStr)];
}

async function handleAiTheme(): Promise<LineMessage[]> {
  const now = new Date();
  const tokyoDate = new Date(now.getTime() + 9 * 3600000);
  const dateStr = tokyoDate.toISOString().split("T")[0];

  const themes = await prisma.aITheme.findMany({
    select: { symbol: true, theme: true },
  });

  if (themes.length === 0) {
    return [textMsg("⚠️ 科技股主题数据暂无，请稍后再试。")];
  }

  const symbolSet = new Set(themes.map((t) => t.symbol));
  const scores = await prisma.stockScore.findMany({
    where: { symbol: { in: [...symbolSet] } },
    select: {
      symbol: true, name: true, nameZh: true,
      totalScore: true, recommendation: true, return5d: true,
    },
  });

  const scoreMap = new Map(scores.map((s) => [s.symbol, s]));
  const themeStocks = themes
    .map((t) => {
      const s = scoreMap.get(t.symbol);
      return s ? { ...s, theme: t.theme } : null;
    })
    .filter(Boolean) as Array<typeof scores[number] & { theme: string }>;

  // Sort by score within each theme
  themeStocks.sort((a, b) => (b.totalScore ?? 0) - (a.totalScore ?? 0));

  if (themeStocks.length === 0) {
    return [textMsg("⚠️ 科技股评分数据加载中，请稍后再试。")];
  }

  return [buildAiThemeChatFlex(themeStocks.slice(0, 20), dateStr)];
}

async function handleMarket(): Promise<LineMessage[]> {
  const now = new Date();
  const tokyoDate = new Date(now.getTime() + 9 * 3600000);
  const dateStr = tokyoDate.toISOString().split("T")[0];

  const [total, realCount, strongBuy, buy, hold, watch, avoid, avgAgg, top1] = await Promise.all([
    prisma.stockScore.count({ where: { priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { priceCount: { gte: 20 }, scoreSource: { in: ["REAL", "PARTIAL"] } } }),
    prisma.stockScore.count({ where: { recommendation: "STRONG_BUY", priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { recommendation: "BUY", priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { recommendation: "HOLD", priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { recommendation: "WATCH", priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { recommendation: "AVOID", priceCount: { gte: 20 } } }),
    prisma.stockScore.aggregate({ _avg: { totalScore: true }, where: { priceCount: { gte: 20 } } }),
    prisma.stockScore.findFirst({
      where: { priceCount: { gte: 20 } },
      orderBy: { totalScore: "desc" },
      select: { symbol: true, name: true, nameZh: true, totalScore: true, recommendation: true },
    }),
  ]);

  return [buildMarketSummaryFlex({
    total, realCount, strongBuy, buy, hold, watch, avoid,
    avgScore: Math.round(avgAgg._avg.totalScore ?? 0),
    topSymbol: top1?.symbol,
    topName: top1?.nameZh ?? top1?.name ?? top1?.symbol,
    topScore: top1?.totalScore ?? undefined,
    topRec: top1?.recommendation ?? undefined,
    dateStr,
  })];
}

async function handleNotifications(): Promise<LineMessage[]> {
  // Fetch quota from LINE API
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  let quotaType = "unknown";
  let quotaValue: number | null = null;
  let totalUsage = 0;

  if (token) {
    try {
      const [q, u] = await Promise.all([
        fetch("https://api.line.me/v2/bot/message/quota", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
        fetch("https://api.line.me/v2/bot/message/quota/consumption", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      ]);
      quotaType = q.type ?? "unknown";
      quotaValue = q.value ?? null;
      totalUsage = u.totalUsage ?? 0;
    } catch {
      // ignore
    }
  }

  const remaining = quotaValue !== null ? Math.max(0, quotaValue - totalUsage) : null;
  const pct = quotaValue ? Math.min(100, Math.round((totalUsage / quotaValue) * 100)) : 0;
  const exhausted = quotaType === "limited" && remaining === 0;

  const [settings, lastLog] = await Promise.all([
    prisma.notificationSetting.findFirst(),
    prisma.notificationLog.findFirst({
      where: { status: { in: ["SUCCESS", "FAILED", "QUOTA_EXCEEDED"] } },
      orderBy: { createdAt: "desc" },
      select: { title: true, status: true },
    }),
  ]);

  return [buildNotificationStatusFlex({
    quotaType,
    quotaValue,
    totalUsage,
    remaining,
    pct,
    exhausted,
    morningEnabled: settings?.morningReportEnabled,
    middayEnabled: settings?.middayReportEnabled,
    closeEnabled: settings?.closeReportEnabled,
    alertEnabled: settings?.realtimeAlertEnabled,
    lastLogTitle: lastLog?.title,
    lastLogStatus: lastLog?.status,
  })];
}

async function handlePortfolio(): Promise<LineMessage[]> {
  return [textMsg([
    "💼 持仓管理",
    "",
    "请访问持仓管理页面：",
    portfolioUrl(),
    "",
    "支持功能：",
    "・添加持仓记录",
    "・查看持仓收益",
    "・AI评分实时跟踪",
  ].join("\n"))];
}

async function handleNews(): Promise<LineMessage[]> {
  const news = await prisma.news.findMany({
    orderBy: { publishedAt: "desc" },
    take: 5,
    select: { title: true, source: true, publishedAt: true, sentiment: true },
  });

  const now = new Date();
  const sentimentEmoji = (s: string | null) =>
    s === "POSITIVE" ? "🟢" : s === "NEGATIVE" ? "🔴" : "⚪";

  const lines = [
    "📰 最新市場资讯",
    `📅 ${new Date(now.getTime() + 9 * 3600000).toISOString().split("T")[0]}`,
    "━━━━━━━━━━━━━━━━",
    "",
  ];

  if (news.length === 0) {
    lines.push("暂无新闻数据，请稍后再试。");
  } else {
    for (const n of news) {
      const ago = Math.round((now.getTime() - new Date(n.publishedAt).getTime()) / (1000 * 60 * 60));
      const agoStr = ago < 1 ? "刚刚" : ago < 24 ? `${ago}小时前` : `${Math.floor(ago / 24)}天前`;
      lines.push(`${sentimentEmoji(n.sentiment)} ${n.title.slice(0, 55)}`);
      lines.push(`   ${n.source}  ${agoStr}`);
      lines.push("");
    }
  }

  lines.push("━━━━━━━━━━━━━━━━", `🔗 ${newsUrl()}`);
  return [textMsg(lines.join("\n"))];
}

// ── Main handler ──────────────────────────────────────────────────────────────

/**
 * Handle a LINE text message.
 * Returns LineMessage[] (flex or text), or null if unauthorized/timeout.
 */
export async function handleLineChat(
  text: string,
  userId: string | null,
  source: LineEventSource,
): Promise<LineMessage[] | null> {
  if (userId && !process.env.LINE_OWNER_USER_ID) {
    console.log(`[line-chat] ⚠️  LINE_OWNER_USER_ID 未配置 → ${userId}`);
  }

  if (!isAuthorized(userId)) {
    console.log(`[line-chat] 拒绝未授权用户 userId=${userId ?? "unknown"}`);
    return null;
  }

  // Track in DB
  if (userId) await upsertLineUser(userId).catch(() => {});
  if (source.type === "group") await upsertLineGroup(source.groupId).catch(() => {});

  const v2Intent = parseV2Intent(text);
  if (v2Intent) {
    console.log(`[line-chat] V2 intent: ${v2Intent}`);
    try {
      switch (v2Intent) {
        case "welcome":       return [buildWelcomeFlex()];
        case "ai_picks":      return await handleAiPicks();
        case "ai_theme":      return await handleAiTheme();
        case "market":        return await handleMarket();
        case "news":          return await handleNews();
        case "notifications": return await handleNotifications();
        case "portfolio":     return await handlePortfolio();
        case "help":          return [buildHelpFlex()];
      }
    } catch (err) {
      console.error(`[line-chat] V2 handler error (${v2Intent}):`, err);
      return [textMsg("❌ 发生错误，请稍后重试")];
    }
  }

  // Fall back to text handler for stock codes / company names / analysis
  try {
    const textReply = await processMessage(text);
    return [textMsg(textReply)];
  } catch (err) {
    console.error("[line-chat] processMessage error:", err);
    return [textMsg("❌ 发生错误，请稍后重试")];
  }
}
