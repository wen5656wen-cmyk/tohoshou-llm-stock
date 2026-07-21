export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { guardAdminRoute } from "@/lib/admin-auth";
import { ADMIN_TOKEN_HEADER } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { isConfigured as jquantsConfigured, configStatus as jquantsConfigStatus } from "@/lib/jquants";

// P21-S1：本路由会以 HTTP 自调其它 /api/sync/* 端点，而这些端点现受 middleware 保护。
// token 从**服务端环境**读取并注入 header —— 绝不经过客户端、绝不写入 URL。
function internalAuthHeaders(): Record<string, string> {
  const t = process.env.ADMIN_TOKEN;
  return t ? { [ADMIN_TOKEN_HEADER]: t } : {};
}

async function safeJsonFetch(url: string, init?: RequestInit): Promise<unknown> {
  const r = await fetch(url, {
    ...init,
    headers: { ...(init?.headers as Record<string, string> | undefined), ...internalAuthHeaders() },
  });
  const text = await r.text();
  if (!text) return { error: "空响应", httpStatus: r.status };
  try {
    return JSON.parse(text);
  } catch {
    return { error: `非JSON响应: ${text.slice(0, 200)}`, httpStatus: r.status };
  }
}

export async function GET(req: Request) {
  // P21-S2 纵深防御：middleware 之外的第二道闸门，必须先于任何副作用。
  const denied = await guardAdminRoute(req);
  if (denied) return denied;
  const REAL_FLOW_SOURCES = ["jquants_investor_types", "jpx", "jpx_file", "jpx_manual"];

  const [recentLogs, counts, globalMarket, latestRealFlow, latestAnyFlow, scoreSourceCounts] = await Promise.all([
    prisma.syncLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    Promise.all([
      prisma.dailyPrice.count(),
      prisma.disclosure.count(),
      prisma.dividend.count(),
      prisma.stock.count({ where: { lastSyncAt: { not: null } } }),
      prisma.news.count(),
    ]),
    // V3.1: GlobalMarket latest
    prisma.globalMarket.findFirst({
      orderBy: { date: "desc" },
      select: { date: true, source: true, score: true, vix: true, nasdaqChange: true },
    }),
    // V3.1: InstitutionalFlow — prefer real sources first
    prisma.institutionalFlow.findFirst({
      where: { source: { in: REAL_FLOW_SOURCES } },
      orderBy: { date: "desc" },
      select: { date: true, source: true, investorType: true, netAmount: true },
    }),
    // V3.1: InstitutionalFlow — any (fallback)
    prisma.institutionalFlow.findFirst({
      orderBy: { date: "desc" },
      select: { date: true, source: true, investorType: true, netAmount: true },
    }),
    // V3.1: StockScore source distribution
    prisma.stockScore.groupBy({
      by: ["scoreSource"],
      _count: { scoreSource: true },
    }),
  ]);

  const latestFlow = latestRealFlow ?? latestAnyFlow;

  const lastSync = {
    yahoo:   recentLogs.find((l) => l.source === "yahoo")   ?? null,
    jquants: recentLogs.find((l) => l.source === "jquants") ?? null,
    tdnet:   recentLogs.find((l) => l.source === "tdnet")   ?? null,
    news:    recentLogs.find((l) => l.source === "news")    ?? null,
  };

  const jqCfg = jquantsConfigStatus();

  // V3.1: scoreSource distribution as plain object
  const scoreSourceDist: Record<string, number> = {};
  for (const g of scoreSourceCounts) {
    scoreSourceDist[g.scoreSource ?? "UNKNOWN"] = g._count.scoreSource;
  }

  // V3.1: global market age in days (null if no data)
  const globalMarketAgeDays = globalMarket
    ? Math.round((Date.now() - new Date(globalMarket.date).getTime()) / 86400000)
    : null;
  const flowAgeDays = latestFlow
    ? Math.round((Date.now() - new Date(latestFlow.date).getTime()) / 86400000)
    : null;

  return NextResponse.json({
    configured: {
      yahoo:   true,
      jquants: jqCfg.ok,
      tdnet:   true,
      news:    true,
    },
    jquantsMethod: jqCfg.method,
    counts: {
      dailyPrices:  counts[0],
      disclosures:  counts[1],
      dividends:    counts[2],
      syncedStocks: counts[3],
      news:         counts[4],
    },
    lastSync,
    recentLogs,
    // V3.1: data authority status
    dataAuthority: {
      globalMarket: globalMarket
        ? { date: globalMarket.date, source: globalMarket.source, ageDays: globalMarketAgeDays, score: globalMarket.score, vix: globalMarket.vix }
        : null,
      institutionalFlow: latestFlow
        ? { date: latestFlow.date, source: latestFlow.source, ageDays: flowAgeDays }
        : null,
      scoreSourceDist,
    },
  });
}

export async function POST(req: Request) {
  // P21-S2 纵深防御：middleware 之外的第二道闸门，必须先于任何副作用。
  const denied = await guardAdminRoute(req);
  if (denied) return denied;
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://aitohoshou.com";
  const results: Record<string, unknown> = {};

  try {
    results.yahoo = await safeJsonFetch(`${base}/api/sync/yahoo`, { method: "POST" });
  } catch (e) {
    results.yahoo = { success: false, error: (e as Error).message };
  }

  try {
    results.tdnet = await safeJsonFetch(`${base}/api/sync/tdnet`, { method: "POST" });
  } catch (e) {
    results.tdnet = { success: false, error: (e as Error).message };
  }

  if (jquantsConfigured()) {
    try {
      results.jquants = await safeJsonFetch(`${base}/api/sync/jquants`, { method: "POST" });
    } catch (e) {
      results.jquants = { success: false, error: (e as Error).message };
    }
  } else {
    results.jquants = { skipped: "Not configured" };
  }

  try {
    results.news = await safeJsonFetch(`${base}/api/sync/news`, { method: "POST" });
  } catch (e) {
    results.news = { success: false, error: (e as Error).message };
  }

  return NextResponse.json({ results });
}
