// 🔒 P21-P0-API-G1 · 访问级别：AUTHENTICATED（个人资产 / 决策数据）
//
// 逻辑分类是 AUTHENTICATED —— 属于账户主人，而非运维。本轮技术上暂与 ADMIN_ONLY
// 共用 admin_session Cookie / x-admin-token（系统单租户，尚无普通用户体系）。
// **凭证相同不等于分类相同**：后续拆权限等级时，本文件应归入用户级而非管理员级。
//
// 封闭前状态：未登录公网可读写（P21-P0-API 审计实测 200）。
// ── GET /api/decision/briefing（P19-T2 · 今日简报 · 只读聚合）─────────────────────
// 回答：今天系统运行到哪里、接下来要做什么、今天需要关注什么。
//
// ⚠️ 硬边界（P19-T2 设计批准项）：
//   · **零写入**，只 SELECT；零 Schema / 零评分 / 零交易 / 零 Cron 变更
//   · **不新增统计体系**：所有数值直取已有表/字段，本路由只做「存在性判定 + 比价 + 计数」
//   · 时间轴状态以**当日数据是否真实产出**为唯一判据，**不读** logs/pipeline-runs.jsonl
//     （实测该文件与落库不一致：mission-control 显示 compute_scores 2026-07-04，
//      而 StockScore.computedAt 实为 2026-07-21 07:08 JST）
//   · 状态词统一 PRODUCED / RUNNING / PENDING / SKIPPED —— 前端一律译为
//     「已产出 / 进行中 / 未产出 / 已跳过」，**禁止**使用「已执行」（判据是数据存在性，
//      而非 cron 日志；实测 15:15 未到时 PortfolioNavSnapshot 当日已有行）
//   · 每块自带 asOf，前端不得把不同口径混排到同一时间标签下
//   · 系统健康不在本路由（前端另取既有 /api/health/status，保持其独立 asOf）
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getJPXTradingDayStatus } from "@/lib/trading-calendar/jpx";
import { guardAdminRoute } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const TDNET_WINDOW_H = 48;   // TDnet 窗口：今日常为 0 条，放宽到 48h 才有意义（实测）
const CAL_WINDOW_D = 14;     // 研究日历窗口
const EXDIV_WINDOW_D = 14;   // 除权息展示窗口（未来 N 天）
const NEAR_PCT = 3;          // 距止盈/止损 ≤3% 视为「接近」

type NodeState = "PRODUCED" | "RUNNING" | "PENDING" | "SKIPPED";
const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);
const ymd = (d: Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : null);

function jstMinutes(now: Date): number {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  const [h, m] = p.split(":").map(Number);
  return h * 60 + m;
}
function sessionOf(now: Date, tradingDay: boolean) {
  if (!tradingDay) return "HOLIDAY" as const;
  const t = jstMinutes(now);
  if (t < 540) return "PRE" as const;
  if (t < 690) return "MORNING" as const;
  if (t < 750) return "LUNCH" as const;
  if (t <= 930) return "AFTERNOON" as const;
  return "CLOSED" as const;
}

export async function GET(req: Request) {
  const denied = await guardAdminRoute(req);
  if (denied) return denied;

  const now = new Date();
  const st = getJPXTradingDayStatus(now);
  const jstDate = st.date;
  const dayStart = new Date(`${jstDate}T00:00:00+09:00`);
  const dateOnly = new Date(`${jstDate}T00:00:00.000Z`); // @db.Date 列的比较基准
  const session = sessionOf(now, st.isTradingDay);
  const nowMin = jstMinutes(now);

  try {
    const [
      score, scoreCount, missions, missionNavToday, decisionRows, tradeRows, skippedToday,
      closing, regime, gm, reviewsToday, pfNavToday, disclosures, calendar, exDivCount,
      holdings, missionReady, top10Rows, earningsRows, exDivRows, universeCount,
    ] = await Promise.all([
      prisma.stockScore.findFirst({ orderBy: { computedAt: "desc" }, select: { computedAt: true } }),
      prisma.stockScore.count({ where: { computedAt: { gte: dayStart } } }),
      prisma.aiMission.findMany({ where: { status: "ACTIVE" }, select: { id: true, missionType: true, periodLabel: true, status: true, initialCapital: true, equityJpy: true, targetPct: true, endDate: true, lastPrepareDate: true, lastExecuteDate: true } }),
      prisma.aiMissionNav.findMany({ where: { date: dateOnly }, select: { missionId: true, returnPct: true, alpha: true } }),
      prisma.aiMissionDecision.findMany({ where: { decidedAt: { gte: dayStart } }, orderBy: { decidedAt: "asc" }, select: { decidedAt: true } }),
      prisma.aiMissionTrade.findMany({ where: { executedAt: { gte: dayStart } }, orderBy: { executedAt: "asc" }, select: { executedAt: true } }),
      prisma.aiMissionDecision.count({ where: { decidedAt: { gte: dayStart }, status: "SKIPPED" } }),
      prisma.closingDecision.findFirst({ orderBy: { date: "desc" } }),
      prisma.marketRegime.findFirst({ orderBy: { date: "desc" }, select: { date: true, regime: true, volatility: true, ma120: true } }),
      prisma.globalMarket.findFirst({ orderBy: { date: "desc" }, select: { date: true } }),
      prisma.tradeDecisionHistory.count({ where: { decidedAt: { gte: dayStart }, source: "DAILY_REVIEW" } }),
      prisma.portfolioNavSnapshot.count({ where: { date: dateOnly } }),
      prisma.disclosure.findMany({
        where: { publishedAt: { gte: new Date(now.getTime() - TDNET_WINDOW_H * 3600_000) } },
        orderBy: [{ importance: "desc" }, { publishedAt: "desc" }], take: 12,
        select: { symbol: true, title: true, category: true, publishedAt: true, importance: true, sentiment: true, url: true },
      }),
      prisma.researchCalendarEvent.findMany({
        where: { status: "SCHEDULED", scheduledAt: { gte: dayStart, lte: new Date(now.getTime() + CAL_WINDOW_D * 864e5) } },
        orderBy: { scheduledAt: "asc" }, take: 10,
        select: { title: true, eventType: true, scheduledAt: true, companyKey: true },
      }),
      prisma.dividend.count({ where: { exDivDate: { not: null } } }),
      prisma.userHolding.findMany({ select: { symbol: true, name: true, shares: true, avgCost: true } }),
      prisma.aiMissionDecision.count({ where: { status: "READY_FOR_OPEN" } }),
      // ── P20 · 今日事件数据源 ────────────────────────────────────────────
      // 财报预定：范围 = 持仓 ∪ 今日 TOP10（见 scripts/sync-earnings-schedule.ts 的范围说明）
      prisma.dailyRecommendation.findMany({ where: { date: dateOnly, gptRank: { lte: 10 } }, select: { symbol: true } }),
      prisma.earningsSchedule.findMany({
        where: { earningsDate: { gte: dateOnly } },
        orderBy: { earningsDate: "asc" },
        select: { symbol: true, earningsDate: true, confirmed: true, fetchedAt: true },
      }),
      // 除权息：全市场，未来 EXDIV_WINDOW_D 天内
      prisma.dividend.findMany({
        where: { exDivDate: { gte: dateOnly, lte: new Date(dateOnly.getTime() + EXDIV_WINDOW_D * 864e5) } },
        orderBy: { exDivDate: "asc" }, take: 40,
        select: { symbol: true, exDivDate: true },
      }),
      prisma.stockScore.count(),
    ]);

    // ── ① 今日执行时间轴（判据 = 当日数据是否已产出；绝不读 cron 日志）──
    const scoreToday = !!score && score.computedAt >= dayStart;
    const prepared = missions.length > 0 && missions.every((m) => m.lastPrepareDate === jstDate);
    const executed = missions.length > 0 && missions.every((m) => m.lastExecuteDate === jstDate);
    const closingToday = !!closing && ymd(closing.date) === jstDate;
    // ⚠️ 归因必须精确：missionNav 由 09:30 Phase2 写入，**不是** 15:15 收盘链路的产出，
    // 不能拿它证明 15:15 节点已产出。本节点只认收盘链路自身的输出 PortfolioNavSnapshot。
    const reviewNavProduced = pfNavToday > 0;
    const decisionsToday = decisionRows.length;
    const tradesToday = tradeRows.length;

    const mk = (key: string, schedule: string, atMin: number, state: NodeState, producedAt: string | null, detail: Record<string, unknown>, evidence: string) => ({
      key, schedule, state, producedAt, detail, evidence,
      etaMinutes: state === "PENDING" && atMin > nowMin ? atMin - nowMin : null,
    });
    const skip = (s: NodeState): NodeState => (st.isTradingDay ? s : "SKIPPED");

    const nodes = [
      mk("ai_score", "07:30", 450, skip(scoreToday ? "PRODUCED" : "PENDING"), scoreToday ? iso(score!.computedAt) : null,
        { count: scoreCount }, "StockScore.computedAt"),
      mk("mission_prepare", "08:20", 500, skip(prepared ? "PRODUCED" : "PENDING"),
        decisionRows.length ? iso(decisionRows[0].decidedAt) : null,
        { decisions: decisionsToday, missions: missions.length }, "AiMission.lastPrepareDate"),
      mk("mission_execute", "09:30", 570, skip(executed ? "PRODUCED" : "PENDING"),
        tradeRows.length ? iso(tradeRows[0].executedAt) : null,
        { trades: tradesToday, skipped: skippedToday }, "AiMission.lastExecuteDate + AiMissionTrade"),
      mk("intraday_quotes", "09:00-15:30", 540,
        skip(session === "MORNING" || session === "AFTERNOON" ? "RUNNING" : session === "CLOSED" ? "PRODUCED" : "PENDING"),
        null, { session }, "Yahoo quote (M1.1)"),
      mk("closing_decision", "15:15", 915, skip(closingToday ? "PRODUCED" : "PENDING"),
        // ⚠️ producedAt 全节点必须是 ISO 时间戳（前端统一用 Intl 按 JST 渲染）。
        // 曾经这里返回 `"2026-07-21 15:15 JST"` 这种展示串 → new Date() 得到 Invalid Date
        // → Intl.format 抛 RangeError → 整页崩溃（且只在收盘后复现）。禁止在此返回展示文案。
        closingToday ? iso(closing!.computedAt) : null,
        { verdict: closingToday ? closing!.verdict : null, latestDate: ymd(closing?.date) }, "ClosingDecision.date"),
      mk("review_nav", "15:15+", 920, skip(reviewNavProduced ? "PRODUCED" : "PENDING"), null,
        // missionNav 仅作上下文展示，不参与本节点的产出判定（归因见上）
        { reviews: reviewsToday, portfolioNav: pfNavToday, missionNavContext: missionNavToday.length },
        "TradeDecisionHistory / PortfolioNavSnapshot / AiMissionNav"),
    ];
    const produced = nodes.filter((n) => n.state === "PRODUCED").length;
    const nextNode = nodes.find((n) => n.state === "PENDING") ?? null;

    // ── ② 今日状态（每块自带 asOf）──
    const navById = new Map(missionNavToday.map((n) => [n.missionId, n]));
    const status = {
      market: {
        regime: regime?.regime ?? null,
        riskLevel: regime?.volatility != null ? (regime.volatility >= 25 ? "HIGH" : regime.volatility >= 15 ? "MEDIUM" : "LOW") : null,
        trendDegraded: regime ? regime.ma120 == null : null,
        asOf: ymd(regime?.date), marketDataAsOf: ymd(gm?.date),
      },
      mission: {
        active: missions.length,
        rows: missions.map((m) => ({
          periodLabel: m.periodLabel, missionType: m.missionType,
          returnPct: navById.get(m.id)?.returnPct ?? (m.initialCapital > 0 ? +((m.equityJpy / m.initialCapital - 1) * 100).toFixed(2) : null),
          targetPct: m.targetPct,
          daysLeft: Math.max(0, Math.ceil((new Date(m.endDate).getTime() - now.getTime()) / 864e5)),
          preparedToday: m.lastPrepareDate === jstDate, executedToday: m.lastExecuteDate === jstDate,
        })),
        asOf: navById.size ? jstDate : null,
      },
      recommendation: {
        verdict: closing?.verdict ?? null,
        portfolioCount: Array.isArray(closing?.portfolio) ? (closing!.portfolio as unknown[]).length : null,
        isToday: closingToday,
        asOf: closing ? `${ymd(closing.date)} ${closing.decidedAtJst ?? ""} JST` : null,
      },
    };

    // ── ③ 今日事件（诚实：无源即标未接入，绝不推测）──
    const heldSet = new Set(holdings.map((h) => h.symbol));
    const top10Set = new Set(top10Rows.map((r) => r.symbol));
    const events = {
      tdnet: {
        available: true, windowHours: TDNET_WINDOW_H,
        items: disclosures.map((d) => ({
          symbol: d.symbol, title: d.title, category: d.category, sentiment: d.sentiment,
          publishedAt: iso(d.publishedAt), importance: d.importance, url: d.url, held: heldSet.has(d.symbol),
        })),
        asOf: disclosures.length ? iso(disclosures[0].publishedAt) : null,
      },
      research: {
        available: true, windowDays: CAL_WINDOW_D,
        items: calendar.map((c) => ({ title: c.title, eventType: c.eventType, scheduledAt: ymd(c.scheduledAt), companyKey: c.companyKey })),
      },
      // ── P20 · 财报発表予定（范围 = 持仓 ∪ 今日 TOP10，**不是全市场**）────────
      // ⚠️ 只回传结构化标识与数值，展示文案一律由前端 i18n 渲染（API 禁返展示文案）
      // ⚠️ state=NO_CONFIRMED_DATA 时前端必须显示「当前数据源未确认」，
      //    **禁止**显示「今日 0 家」——本范围无确认日期 ≠ 全市场今日无财报。
      earnings: (() => {
        const scope = new Set<string>([...heldSet, ...top10Set]);
        const items = earningsRows
          .filter((r) => scope.has(r.symbol))
          .map((r) => ({
            symbol: r.symbol, date: ymd(r.earningsDate), confirmed: r.confirmed,
            held: heldSet.has(r.symbol), inTop10: top10Set.has(r.symbol),
          }));
        const fetched = earningsRows.filter((r) => scope.has(r.symbol)).map((r) => r.fetchedAt.getTime());
        return {
          available: true, scope: "HOLDINGS_AND_TOP10", scopeCount: scope.size,
          coverage: { queried: scope.size, withDate: items.length, confirmed: items.filter((i) => i.confirmed).length },
          items,
          asOf: fetched.length ? iso(new Date(Math.max(...fetched))) : null,
          state: items.length ? "OK" : "NO_CONFIRMED_DATA",
        };
      })(),
      // ── P20 · 除权除息（全市场，但覆盖率非 100%，必须回传 pct 供展示）────────
      exDividend: (() => {
        const items = exDivRows.map((r) => ({ symbol: r.symbol, date: ymd(r.exDivDate), held: heldSet.has(r.symbol) }));
        return {
          available: true, scope: "MARKET_WIDE", windowDays: EXDIV_WINDOW_D,
          coverage: {
            universe: universeCount, withExDiv: exDivCount,
            pct: universeCount ? +((exDivCount / universeCount) * 100).toFixed(1) : 0,
          },
          items,
          asOf: null, // 除权息按周/日同步，Dividend 表无逐行写入时间列（禁改其结构）
          state: exDivCount ? "OK" : "NO_CONFIRMED_DATA",
        };
      })(),
    };

    // ── ④ 今日待办（TP/SL = 与已落库的 target1/stopLoss 比价，不重算策略）──
    const syms = holdings.map((h) => h.symbol);
    const scores = syms.length
      ? await prisma.stockScore.findMany({ where: { symbol: { in: syms } }, select: { symbol: true, name: true, nameZh: true, latestClose: true, target1: true, stopLoss: true } })
      : [];
    const sMap = new Map(scores.map((s) => [s.symbol, s]));
    const tpSl: { symbol: string; name: string; kind: string; price: number; target: number | null; stop: number | null; gapPct: number }[] = [];
    for (const h of holdings) {
      const s = sMap.get(h.symbol);
      const px = s?.latestClose ?? null;
      if (px == null) continue;
      const tp = s?.target1 ?? null, sl = s?.stopLoss ?? null;
      if (tp != null && px >= tp) tpSl.push({ symbol: h.symbol, name: s?.nameZh ?? s?.name ?? h.name, kind: "HIT_TP", price: px, target: tp, stop: sl, gapPct: 0 });
      else if (sl != null && px <= sl) tpSl.push({ symbol: h.symbol, name: s?.nameZh ?? s?.name ?? h.name, kind: "HIT_SL", price: px, target: tp, stop: sl, gapPct: 0 });
      else if (tp != null && ((tp - px) / px) * 100 <= NEAR_PCT) tpSl.push({ symbol: h.symbol, name: s?.nameZh ?? s?.name ?? h.name, kind: "NEAR_TP", price: px, target: tp, stop: sl, gapPct: +(((tp - px) / px) * 100).toFixed(2) });
      else if (sl != null && ((px - sl) / px) * 100 <= NEAR_PCT) tpSl.push({ symbol: h.symbol, name: s?.nameZh ?? s?.name ?? h.name, kind: "NEAR_SL", price: px, target: tp, stop: sl, gapPct: +(((px - sl) / px) * 100).toFixed(2) });
    }
    const riskAlerts: { key: string; level: string }[] = [];
    if (regime && regime.ma120 == null) riskAlerts.push({ key: "trend_degraded", level: "INFO" });
    if (regime?.regime === "BEAR") riskAlerts.push({ key: "bear_regime", level: "WARNING" });
    if (!closingToday && st.isTradingDay && nowMin > 915) riskAlerts.push({ key: "closing_missing", level: "WARNING" });

    const todo = {
      missionPending: { count: missionReady, asOf: jstDate },
      tpSlAlerts: { count: tpSl.length, holdings: holdings.length, items: tpSl, asOf: ymd(gm?.date) },
      riskAlerts: { count: riskAlerts.length, items: riskAlerts, asOf: ymd(regime?.date) },
    };

    // ── ⑤ 今日关注机会（直接读 ClosingDecision.top10 的已有标记，不新增评分/推荐逻辑）──
    type T10 = { symbol: string; name?: string | null; aiScore?: number | null; breakout?: boolean | null; inBuyZone?: boolean | null; changePct?: number | null; newsSentiment?: number | null; ma5?: number | null; ma20?: number | null; riskLevel?: string | null; sector?: string | null };
    const top10 = (Array.isArray(closing?.top10) ? closing!.top10 : []) as unknown as T10[];
    const cat = (key: string, pred: (r: T10) => boolean) => {
      const g = top10.filter(pred).sort((a, b) => (b.aiScore ?? 0) - (a.aiScore ?? 0));
      return { key, count: g.length, top: g[0] ? { symbol: g[0].symbol, name: g[0].name ?? g[0].symbol, aiScore: g[0].aiScore ?? null, riskLevel: g[0].riskLevel ?? null } : null,
        symbols: g.slice(0, 5).map((r) => r.symbol) };
    };
    const opportunities = {
      available: top10.length > 0,
      asOf: closing ? `${ymd(closing.date)} ${closing.decidedAtJst ?? ""} JST` : null,
      isToday: closingToday,
      total: top10.length,
      categories: [
        cat("breakout", (r) => r.breakout === true),
        cat("pullback", (r) => r.inBuyZone === true && (r.changePct ?? 0) < 0),
        cat("news", (r) => (r.newsSentiment ?? 0) > 0),
        cat("trend", (r) => r.ma5 != null && r.ma20 != null && r.ma5 > r.ma20),
        cat("buyzone", (r) => r.inBuyZone === true),
      ],
      note: "读取收盘决策 TOP10 的既有标记分组，不新增评分/推荐逻辑",
    };

    return NextResponse.json({
      asOf: iso(now), jstDate, tradingDay: st.isTradingDay, nonTradingReason: st.isTradingDay ? null : st.reason,
      session, nowJstMinutes: nowMin,
      timeline: { producedCount: produced, totalCount: nodes.length, nextNodeKey: nextNode?.key ?? null, nodes,
        note: "状态基于当日数据是否已产出，非 cron 执行日志" },
      status, events, todo, opportunities,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, asOf: iso(now), jstDate, tradingDay: st.isTradingDay }, { status: 500 });
  }
}
