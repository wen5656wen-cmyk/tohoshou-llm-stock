/**
 * LINE Chat Agent for TOHOSHOU AI
 * All responses in Chinese.
 */

import { prisma } from "@/lib/prisma";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

// ── Chinese→Japanese name mappings ────────────────────────────────────────

const CN_JP_MAP: Record<string, string> = {
  丰田: "トヨタ",
  索尼: "ソニー",
  软银: "ソフトバンク",
  本田: "ホンダ",
  马自达: "マツダ",
  松下: "パナソニック",
  日立: "日立",
  富士通: "富士通",
  夏普: "シャープ",
  三菱: "三菱",
  东芝: "東芝",
  佳能: "キヤノン",
  电装: "デンソー",
  丰田纺织: "豊田紡織",
};

function cnToJp(text: string): string {
  let result = text;
  for (const [cn, jp] of Object.entries(CN_JP_MAP)) {
    if (result.includes(cn)) result = result.replace(cn, jp);
  }
  return result;
}

// ── Intent types ───────────────────────────────────────────────────────────

type Intent =
  | { type: "stock_code"; symbol: string }
  | { type: "stock_name"; query: string }
  | { type: "today_picks" }
  | { type: "news" }
  | { type: "analysis"; symbol?: string; useContext: boolean }
  | { type: "help" }
  | { type: "start" }
  | { type: "unknown"; text: string };

// ── Intent parser ──────────────────────────────────────────────────────────

export function parseIntent(text: string): Intent {
  const t = text.trim();

  if (t === "/start") return { type: "start" };
  if (t === "/help" || /ヘルプ|help|帮助|怎么用/i.test(t)) return { type: "help" };

  // TOP10 / 今日推荐
  if (/^(\/picks|\/top10?)$/i.test(t)) return { type: "today_picks" };
  if (
    /今[日天][のは]?(おすすめ|推奨|推薦|推荐|ランキング)|おすすめ銘柄|今日推|top10?|picks/i.test(t)
  ) return { type: "today_picks" };

  // News
  if (/^\/news$/i.test(t)) return { type: "news" };
  if (
    /ニュース|ニュ|news|新闻|今日のニュース|今天新闻/i.test(t) &&
    !/銘柄|コード|\d{4}/.test(t)
  ) return { type: "news" };

  // Detailed analysis / "why" follow-up
  const whyPattern = /なぜ|なんで|why|为什么|理由|どうして|教えて|explain|为何/i;
  const analysisPrefix = /^(分析|解析|詳細|くわしく|analyze|analysis)\s*/i;
  if (whyPattern.test(t) && !/\d{4}/.test(t)) {
    return { type: "analysis", useContext: true };
  }
  if (analysisPrefix.test(t)) {
    const stripped = t.replace(analysisPrefix, "").trim();
    const codeMatch = stripped.match(/^(\d{4})(\.T)?$/i);
    if (codeMatch) {
      return { type: "analysis", symbol: `${codeMatch[1]}.T`, useContext: false };
    }
    if (stripped) {
      return { type: "analysis", symbol: undefined, useContext: false };
    }
    return { type: "analysis", useContext: true };
  }

  // 4-digit stock code
  const codeMatch = t.match(/^(\d{4})(\.T)?$/i);
  if (codeMatch) {
    return { type: "stock_code", symbol: `${codeMatch[1]}.T` };
  }

  // Company name search
  if (
    t.length >= 2 &&
    !/^[0-9\s\W]+$/.test(t) &&
    !/^(\/|https?:)/.test(t) &&
    !/^(買|売|株|円|%|上|下|高|安)/.test(t)
  ) {
    const mapped = cnToJp(t);
    if (/[゠-ヿ一-鿿぀-ゟa-zA-Z]/.test(mapped)) {
      return { type: "stock_name", query: mapped };
    }
  }

  return { type: "unknown", text: t };
}

// ── Formatting helpers ─────────────────────────────────────────────────────

function pct(v: number | null | undefined): string {
  if (v == null) return "—";
  return (v >= 0 ? "▲" : "▼") + Math.abs(v).toFixed(1) + "%";
}

function yen(v: number | null | undefined): string {
  if (v == null) return "—";
  return "¥" + v.toLocaleString("ja-JP");
}

function starsOf(score: number): string {
  const s = score >= 90 ? 5 : score >= 80 ? 4 : score >= 65 ? 3 : score >= 50 ? 2 : 1;
  return "★".repeat(s) + "☆".repeat(5 - s);
}

function recLabel(r: string | null): string {
  const map: Record<string, string> = {
    STRONG_BUY: "强烈买入 🔥",
    BUY:        "买入 ✅",
    WATCH:      "关注 👀",
    HOLD:       "持有 ⏸",
    AVOID:      "回避 ❌",
  };
  return map[r ?? ""] ?? (r ?? "—");
}

function upProb(total: number, tech: number): number {
  return Math.min(92, Math.max(20, Math.round(total * 0.7 * 0.88 + tech * 0.3 * 0.88)));
}

function rsiNote(rsi: number | null): string {
  if (rsi == null) return "";
  if (rsi >= 80) return " ⚠️超买";
  if (rsi >= 70) return " 注意追高";
  if (rsi <= 20) return " 🟢超卖";
  if (rsi <= 30) return " 有反弹空间";
  return "";
}

function macdArrow(sig: string | null): string {
  if (sig === "BUY")  return "买入信号↑";
  if (sig === "SELL") return "卖出信号↓";
  return "中性";
}

function maTrendLabel(t: string | null): string {
  const m: Record<string, string> = {
    GOLDEN:  "多头趋势↑↑",
    BULLISH: "偏强↑",
    NEUTRAL: "中性整理",
    BEARISH: "偏弱↓",
    DEAD:    "空头趋势↓↓",
  };
  return m[t ?? ""] ?? (t ?? "—");
}

// ── Stock query handler ────────────────────────────────────────────────────

async function handleStockCode(symbol: string, userId: string | null): Promise<string> {
  if (userId) {
    await prisma.lineUser.updateMany({
      where: { userId },
      data: { lastSymbol: symbol, lastSeenAt: new Date() },
    });
  }

  const score = await prisma.stockScore.findUnique({ where: { symbol } });
  const stock = await prisma.stock.findUnique({ where: { symbol } });

  if (!stock && !score) {
    return [
      `❌ 未找到股票代码「${symbol.replace(".T", "")}」`,
      ``,
      `请输入4位代码（例：7203、9984）`,
    ].join("\n");
  }

  const name = score?.nameZh ?? score?.name ?? stock?.nameZh ?? stock?.name ?? symbol;
  const market = score?.market ?? stock?.market ?? "";

  if (!score) {
    return [
      `📊 ${name} (${symbol})`,
      market,
      ``,
      `⚠️ 暂无AI评分（价格数据不足）`,
      ``,
      `🔗 ${APP_URL}/stocks/${encodeURIComponent(symbol)}`,
    ].join("\n");
  }

  const total = score.totalScore ?? 0;
  const tech  = score.technicalScore ?? 0;
  const prob  = upProb(total, tech);

  const latestNews = await prisma.news.findFirst({
    where: { stockId: stock?.id },
    orderBy: { publishedAt: "desc" },
    select: { title: true, publishedAt: true },
  });

  const lines = [
    `📊 ${name} (${symbol})`,
    market ? `${market}` : "",
    ``,
    `──────────────────`,
    `💴 现价：${yen(score.latestClose)}`,
    `   5日 ${pct(score.return5d)}　20日 ${pct(score.return20d)}`,
    ``,
    `──────────────────`,
    `🤖 AI评分：${total}/100 ${starsOf(total)}`,
    `   推荐：${recLabel(score.recommendation)}`,
    `   上涨概率：${prob}%`,
    ``,
    `──────────────────`,
    `📉 技术指标`,
    `   均线趋势：${maTrendLabel(score.maTrend)}`,
    `   RSI(14)：${score.rsi14?.toFixed(1) ?? "—"}${rsiNote(score.rsi14)}`,
    `   MACD：${macdArrow(score.macdSignalLabel)}`,
    `   20日涨跌：${pct(score.return20d)}`,
    `   60日涨跌：${pct(score.return60d)}`,
    ``,
    `──────────────────`,
    `💡 AI分析理由`,
    score.summaryReason ?? "暂无数据",
    ``,
    latestNews ? `📰 ${latestNews.title.slice(0, 60)}` : "",
    ``,
    `🔗 详情：${APP_URL}/stocks/${encodeURIComponent(symbol)}`,
  ].filter(Boolean);

  return lines.join("\n");
}

// ── Stock name search ──────────────────────────────────────────────────────

async function handleStockName(query: string, userId: string | null): Promise<string> {
  const results = await prisma.stock.findMany({
    where: {
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { nameZh: { contains: query } },
        { nameEn: { contains: query, mode: "insensitive" } },
        { symbol: { contains: query.replace(/\.T$/i, ""), mode: "insensitive" } },
      ],
    },
    take: 5,
    select: { symbol: true, name: true, nameZh: true },
  });

  if (results.length === 0) {
    return [
      `❌ 未找到「${query}」相关股票`,
      ``,
      `搜索提示：`,
      `・4位代码：7203`,
      `・日文名：トヨタ、ソニー、任天堂`,
      `・中文名：丰田、索尼、软银`,
      `・英文名：Toyota、Sony`,
    ].join("\n");
  }

  if (results.length === 1) {
    return handleStockCode(results[0].symbol, userId);
  }

  const lines = [
    `🔍 「${query}」搜索结果 ${results.length}条`,
    ``,
    ...results.map((r, i) => `${i + 1}. ${r.nameZh || r.name}\n   → 发送 ${r.symbol.replace(".T", "")} 查看详情`),
    ``,
    `请输入代码查看详细分析`,
  ];
  return lines.join("\n");
}

// ── Today's TOP10 picks ────────────────────────────────────────────────────

async function handleTodayPicks(): Promise<string> {
  const scores = await prisma.stockScore.findMany({
    where: { priceCount: { gte: 20 } },
    orderBy: { totalScore: "desc" },
    take: 10,
    select: {
      symbol: true, name: true, nameZh: true, market: true,
      totalScore: true, recommendation: true, starsLabel: true,
      technicalScore: true, return20d: true, summaryReason: true,
    },
  });

  if (scores.length === 0) {
    return [
      `⚠️ 暂无评分数据`,
      ``,
      `请运行以下命令生成数据：`,
      `npm run compute-scores`,
    ].join("\n");
  }

  const now = new Date();
  const tokyoDate = new Date(now.getTime() + 9 * 3600000);
  const dateStr = tokyoDate.toISOString().split("T")[0];

  const medals = ["🥇", "🥈", "🥉"];
  const lines = [
    `🇯🇵 TOHOSHOU AI 今日推荐`,
    `📅 ${dateStr}`,
    `━━━━━━━━━━━━━━━━`,
  ];

  for (let i = 0; i < scores.length; i++) {
    const s = scores[i];
    const total = s.totalScore ?? 0;
    const tech  = s.technicalScore ?? 0;
    const prob  = upProb(total, tech);
    const prefix = medals[i] ?? `${i + 1}.`;

    if (i < 3) {
      lines.push(
        ``,
        `${prefix} ${s.nameZh || s.name} (${s.symbol.replace(".T", "")})`,
        `   AI：${total}分 ${starsOf(total)}`,
        `   推荐：${recLabel(s.recommendation)}`,
        `   上涨概率：${prob}%　20日：${pct(s.return20d)}`,
        i === 2 ? `────────────────` : ""
      );
    } else {
      if (i === 3) lines.push(``, `【第4〜10名】`);
      lines.push(
        `${i + 1}. ${s.nameZh || s.name}（${s.symbol.replace(".T", "")}）${total}分 ${recLabel(s.recommendation).split(" ")[0]}`
      );
    }
  }

  lines.push(``, `━━━━━━━━━━━━━━━━`, `🔗 ${APP_URL}/ai-picks`);
  return lines.filter((l) => l !== undefined).join("\n");
}

// ── Latest news ────────────────────────────────────────────────────────────

async function handleNews(): Promise<string> {
  const news = await prisma.news.findMany({
    orderBy: { publishedAt: "desc" },
    take: 8,
    select: { title: true, source: true, publishedAt: true, sentiment: true, summary: true },
  });

  const now = new Date();
  const tokyoDate = new Date(now.getTime() + 9 * 3600000);
  const dateStr = tokyoDate.toISOString().split("T")[0];

  if (news.length === 0) {
    return [
      `📰 暂无新闻数据`,
      ``,
      `同步 TDnet / Yahoo Finance 后即可查看`,
      `🔗 ${APP_URL}/news`,
    ].join("\n");
  }

  const sentimentEmoji = (s: string | null) =>
    s === "POSITIVE" ? "🟢" : s === "NEGATIVE" ? "🔴" : "⚪";

  const lines = [
    `📰 最新市场新闻`,
    `📅 ${dateStr}`,
    `━━━━━━━━━━━━━━━━`,
    ``,
  ];

  for (const n of news) {
    const ago = Math.round(
      (now.getTime() - new Date(n.publishedAt).getTime()) / (1000 * 60 * 60)
    );
    const agoStr = ago < 1 ? "刚刚" : ago < 24 ? `${ago}小时前` : `${Math.floor(ago / 24)}天前`;
    lines.push(
      `${sentimentEmoji(n.sentiment)} ${n.title.slice(0, 55)}`,
      `   ${n.source}  ${agoStr}`,
      ``
    );
  }

  lines.push(`━━━━━━━━━━━━━━━━`, `🔗 ${APP_URL}/news`);
  return lines.join("\n");
}

// ── Detailed analysis ──────────────────────────────────────────────────────

async function handleAnalysis(symbol: string, userId: string | null): Promise<string> {
  if (userId) {
    await prisma.lineUser.updateMany({
      where: { userId },
      data: { lastSymbol: symbol, lastSeenAt: new Date() },
    });
  }

  const [score, stock] = await Promise.all([
    prisma.stockScore.findUnique({ where: { symbol } }),
    prisma.stock.findUnique({ where: { symbol }, include: {
      financials: { orderBy: [{ fiscalYear: "desc" }, { quarter: "asc" }], take: 4 },
      news: { orderBy: { publishedAt: "desc" }, take: 3, select: { title: true } },
    }}),
  ]);

  if (!score && !stock) {
    return `❌ 未找到 ${symbol} 的数据`;
  }

  const name = score?.nameZh ?? score?.name ?? stock?.nameZh ?? stock?.name ?? symbol;
  const fins = stock?.financials ?? [];
  const bestFin = fins[0];

  const total = score?.totalScore ?? 0;
  const tech  = score?.technicalScore ?? 0;
  const fund  = score?.fundamentalScore ?? 0;
  const risk  = score?.moneyFlowScore ?? score?.riskScore ?? 0;
  const prob  = upProb(total, tech);

  const formatBillion = (v: number | null | undefined) => {
    if (v == null) return "—";
    const abs = Math.abs(Number(v));
    if (abs >= 1e12) return (Number(v) / 1e12).toFixed(1) + "万亿日元";
    if (abs >= 1e8)  return (Number(v) / 1e8).toFixed(1) + "亿日元";
    return Number(v).toLocaleString("ja-JP") + "日元";
  };

  const opMargin = bestFin?.revenue && bestFin?.operatingProfit && Number(bestFin.revenue) > 0
    ? ((Number(bestFin.operatingProfit) / Number(bestFin.revenue)) * 100).toFixed(1) + "%"
    : "—";

  const roe = bestFin?.netProfit && bestFin?.equity && Number(bestFin.equity) > 0
    ? ((Number(bestFin.netProfit) / Number(bestFin.equity)) * 100).toFixed(1) + "%"
    : "—";

  const lines = [
    `🔍 ${name} (${symbol}) 深度分析`,
    score?.market ? score.market : "",
    `━━━━━━━━━━━━━━━━`,
    ``,
    `🤖 AI综合评分：${total}/100 ${starsOf(total)}`,
    `   推荐：${recLabel(score?.recommendation ?? null)}`,
    `   上涨概率：${prob}%`,
    ``,
    `📊 评分拆解`,
    `   技术指标：${tech}分`,
    `   基本面　：${fund}分`,
    `   資金面　：${risk}分`,
    ``,
    `──────────────────`,
    `📉 技术指标详情`,
    `   现价　　：${yen(score?.latestClose)}（${score?.latestDate ?? "—"}）`,
    `   均线趋势：${maTrendLabel(score?.maTrend ?? null)}`,
    `   RSI(14)：${score?.rsi14?.toFixed(1) ?? "—"}${rsiNote(score?.rsi14 ?? null)}`,
    `   MACD　：${macdArrow(score?.macdSignalLabel ?? null)}`,
    `   5日涨跌：${pct(score?.return5d)}`,
    `   20日涨跌：${pct(score?.return20d)}`,
    `   60日涨跌：${pct(score?.return60d)}`,
    ``,
    ...(bestFin ? [
      `──────────────────`,
      `💰 财务状况（最近期）`,
      `   营业收入：${formatBillion(bestFin.revenue)}`,
      `   营业利润：${formatBillion(bestFin.operatingProfit)}（${opMargin}）`,
      `   净利润　：${formatBillion(bestFin.netProfit)}`,
      `   ROE　　：${roe}`,
      `   EPS　　：¥${bestFin.eps != null ? Number(bestFin.eps).toFixed(0) : "—"}`,
      `   自有资本比率：${bestFin.equityRatio != null ? (Number(bestFin.equityRatio) * 100).toFixed(1) + "%" : "—"}`,
      ``,
    ] : []),
    `──────────────────`,
    `💡 AI综合评价`,
    score?.summaryReason ?? "数据不足，暂时无法分析",
    ``,
    ...(stock?.news?.length ? [
      `──────────────────`,
      `📰 相关新闻`,
      ...stock.news.map((n) => `・${n.title.slice(0, 55)}`),
      ``,
    ] : []),
    `🔗 ${APP_URL}/stocks/${encodeURIComponent(symbol)}`,
  ].filter((l) => l !== undefined) as string[];

  return lines.join("\n");
}

// ── Help text ──────────────────────────────────────────────────────────────

function helpText(): string {
  return [
    `🤖 TOHOSHOU AI 使用指南`,
    `━━━━━━━━━━━━━━━━`,
    ``,
    `【股票代码查询】`,
    `  7203 → 丰田汽车分析`,
    `  9984 → 软银集团分析`,
    `  6758 → 索尼集团分析`,
    ``,
    `【公司名称搜索】`,
    `  任天堂 → 任天堂股票分析`,
    `  ソニー → 索尼集团分析`,
    `  丰田 → 丰田汽车分析`,
    ``,
    `【今日推荐】`,
    `  今天推荐 → AI推荐TOP10`,
    `  TOP10 → 排行榜`,
    ``,
    `【市场信息】`,
    `  新闻 → 最新市场新闻`,
    ``,
    `【深度分析】`,
    `  分析7203 → 财务+技术+AI解析`,
    `  为什么推荐？ → 上条股票详细理由`,
    ``,
    `━━━━━━━━━━━━━━━━`,
    `每天早上8:30 JST 自动发送AI日报`,
    `🔗 ${APP_URL}/ai-picks`,
  ].join("\n");
}

function welcomeText(): string {
  return [
    `🎉 欢迎使用 TOHOSHOU AI！`,
    ``,
    `日本股票AI分析服务`,
    ``,
    `📊 使用方法：`,
    `  7203 → 丰田股价+AI分析`,
    `  今天推荐 → AI推荐TOP10`,
    `  新闻 → 最新市场资讯`,
    `  帮助 → 全部命令列表`,
    ``,
    `每天早上8:30 JST 自动推送AI日报 🇯🇵`,
    ``,
    `🔗 ${APP_URL}`,
  ].join("\n");
}

// ── Main dispatcher ────────────────────────────────────────────────────────

export async function handleMessage(
  text: string,
  userId: string | null
): Promise<string> {
  const intent = parseIntent(text);

  try {
    switch (intent.type) {
      case "start":
        return welcomeText();

      case "help":
        return helpText();

      case "stock_code":
        return await handleStockCode(intent.symbol, userId);

      case "stock_name":
        return await handleStockName(intent.query, userId);

      case "today_picks":
        return await handleTodayPicks();

      case "news":
        return await handleNews();

      case "analysis": {
        let sym = intent.symbol;

        if (!sym && intent.useContext && userId) {
          const user = await prisma.lineUser.findUnique({ where: { userId } });
          sym = user?.lastSymbol ?? undefined;
        }

        if (!sym) {
          return [
            `🔍 请问您要分析哪只股票？`,
            ``,
            `例：分析7203　或　丰田`,
          ].join("\n");
        }

        return await handleAnalysis(sym, userId);
      }

      case "unknown": {
        if (intent.text.length >= 2 && intent.text.length <= 20) {
          const mapped = cnToJp(intent.text);
          const found = await prisma.stock.findFirst({
            where: {
              OR: [
                { name: { contains: mapped, mode: "insensitive" } },
                { nameEn: { contains: mapped, mode: "insensitive" } },
              ],
            },
            select: { symbol: true, name: true },
          });
          if (found) {
            return handleStockCode(found.symbol, userId);
          }
        }

        return [
          `🤔 未能识别「${intent.text.slice(0, 30)}」`,
          ``,
          `请输入股票代码（4位数字）或公司名称`,
          `发送「帮助」查看使用指南`,
        ].join("\n");
      }
    }
  } catch (e) {
    console.error("[line-agent] error:", e);
    return `❌ 发生错误，请稍后重试`;
  }
}

// ── User management ────────────────────────────────────────────────────────

export async function upsertLineUser(
  userId: string,
  displayName?: string,
  pictureUrl?: string
): Promise<void> {
  await prisma.lineUser.upsert({
    where: { userId },
    update: { displayName, pictureUrl, isActive: true, lastSeenAt: new Date() },
    create: { userId, displayName, pictureUrl, isActive: true, firstSeenAt: new Date() },
  });
}

export async function deactivateLineUser(userId: string): Promise<void> {
  await prisma.lineUser.updateMany({
    where: { userId },
    data: { isActive: false },
  });
}

// ── LINE Group management ──────────────────────────────────────────────────

export async function upsertLineGroup(groupId: string, name?: string): Promise<void> {
  await prisma.lineGroup.upsert({
    where: { groupId },
    update: { isActive: true, lastSeenAt: new Date(), ...(name ? { name } : {}) },
    create: { groupId, name, isActive: true, firstSeenAt: new Date() },
  });
}

export async function deactivateLineGroup(groupId: string): Promise<void> {
  await prisma.lineGroup.updateMany({
    where: { groupId },
    data: { isActive: false },
  });
}

export async function getActiveGroupIds(): Promise<string[]> {
  const groups = await prisma.lineGroup.findMany({
    where: { isActive: true },
    select: { groupId: true },
  });
  return groups.map((g) => g.groupId);
}
