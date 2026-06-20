export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isConfigured as jquantsConfigured, configStatus as jquantsConfigStatus } from "@/lib/jquants";

async function safeJsonFetch(url: string, init?: RequestInit): Promise<unknown> {
  const r = await fetch(url, init);
  const text = await r.text();
  if (!text) return { error: "空响应", httpStatus: r.status };
  try {
    return JSON.parse(text);
  } catch {
    return { error: `非JSON响应: ${text.slice(0, 200)}`, httpStatus: r.status };
  }
}

export async function GET() {
  const [recentLogs, counts] = await Promise.all([
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
  ]);

  const lastSync = {
    yahoo:   recentLogs.find((l) => l.source === "yahoo")   ?? null,
    jquants: recentLogs.find((l) => l.source === "jquants") ?? null,
    tdnet:   recentLogs.find((l) => l.source === "tdnet")   ?? null,
    news:    recentLogs.find((l) => l.source === "news")    ?? null,
  };

  const jqCfg = jquantsConfigStatus();

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
  });
}

export async function POST() {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
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
