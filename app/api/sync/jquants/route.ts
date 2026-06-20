export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  isConfigured,
  configStatus,
  getDailyBars,
  getFinSummary,
  parseFinSummary,
  getListedInfo,
  toJQuantsCode,
} from "@/lib/jquants";

export async function GET() {
  const cfg = configStatus();
  return NextResponse.json({
    configured: cfg.ok,
    method: cfg.method,
    envHint: "设置 JQUANTS_EMAIL + JQUANTS_PASSWORD（或 JQUANTS_REFRESH_TOKEN / JQUANTS_API_KEY）",
  });
}

export async function POST() {
  const cfg = configStatus();
  const syncedAt = new Date().toISOString();

  if (!isConfigured()) {
    return NextResponse.json(
      {
        success: false,
        source: "jquants",
        error: cfg.missing ?? "未配置 J-Quants 账号",
        hint: "在 .env 中设置 JQUANTS_EMAIL + JQUANTS_PASSWORD 或 JQUANTS_API_KEY",
        docs: "https://jpx-jquants.com/",
        syncedAt,
      },
      { status: 400 }
    );
  }

  const startMs = Date.now();
  let synced = 0;
  let errors = 0;
  const log: string[] = [];

  // Limit to top 200 scored stocks to complete within timeout
  const scored = await prisma.stockScore.findMany({
    select: { symbol: true },
    orderBy: { totalScore: "desc" },
    take: 200,
  });

  const symbols = scored.map((s) => s.symbol);
  const stockRows = await prisma.stock.findMany({
    where: { symbol: { in: symbols } },
    select: { id: true, symbol: true, name: true },
  });
  const stockMap = new Map(stockRows.map((s) => [s.symbol, s]));

  // Only last 90 days of price data (not 365) for speed
  const to = new Date().toISOString().split("T")[0];
  const from = new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0];

  for (const { symbol } of scored) {
    const stock = stockMap.get(symbol);
    if (!stock) continue;

    try {
      const jqCode = toJQuantsCode(stock.symbol);
      console.log(`[jquants] syncing ${symbol} (${jqCode})`);

      // ── 1) Stock master info ──────────────────────────────────────────
      const infos = await getListedInfo(jqCode);
      if (infos.length > 0) {
        const info = infos[0];
        await prisma.stock.update({
          where: { id: stock.id },
          data: {
            nameEn: info.CoNameEn || undefined,
            market: info.MktNm || undefined,
            sector: info.S17Nm || undefined,
            industry: info.S33Nm || undefined,
          },
        });
      }

      // ── 2) Daily price bars (recent 90 days) ─────────────────────────
      const bars = await getDailyBars(stock.symbol, from, to);
      let priceCount = 0;
      for (const b of bars) {
        if (!b.Date || !b.C) continue;
        const date = new Date(b.Date);
        await prisma.dailyPrice.upsert({
          where: { symbol_date: { symbol: stock.symbol, date } },
          create: {
            symbol: stock.symbol,
            date,
            open: b.O,
            high: b.H,
            low: b.L,
            close: b.C,
            volume: b.Vo,
            adjClose: b.AdjC ?? null,
            source: "jquants",
          },
          update: {
            open: b.O,
            high: b.H,
            low: b.L,
            close: b.C,
            volume: b.Vo,
            adjClose: b.AdjC ?? null,
          },
        });
        priceCount++;
      }

      if (bars.length > 0) {
        const latest = bars[bars.length - 1];
        const prev = bars.length > 1 ? bars[bars.length - 2] : null;
        const change = prev ? latest.C - prev.C : 0;
        const changeRate = prev && prev.C ? (change / prev.C) * 100 : 0;
        const closes = bars.map((b) => b.C);
        await prisma.stock.update({
          where: { id: stock.id },
          data: {
            price: latest.C,
            change,
            changeRate,
            high52w: Math.max(...closes),
            low52w: Math.min(...closes),
            volume: latest.Vo,
            lastSyncAt: new Date(),
          },
        });
      }

      // ── 3) Financial summary ──────────────────────────────────────────
      const statements = await getFinSummary(stock.symbol);
      let finCount = 0;
      for (const s of statements.slice(0, 8)) {
        const parsed = parseFinSummary(s);
        const finData = {
          revenue: parsed.revenue ?? undefined,
          operatingProfit: parsed.operatingProfit ?? undefined,
          ordinaryProfit: parsed.ordinaryProfit ?? undefined,
          netProfit: parsed.netProfit ?? undefined,
          eps: parsed.eps ?? undefined,
          bps: parsed.bps ?? undefined,
          totalAssets: parsed.totalAssets ?? undefined,
          equity: parsed.equity ?? undefined,
          equityRatio: parsed.equityRatio ?? undefined,
          roe: parsed.roe ?? undefined,
          reportedAt: parsed.disclosedDate,
          source: "jquants",
        };
        if (parsed.quarter === null) {
          const existing = await prisma.financial.findFirst({
            where: { stockId: stock.id, fiscalYear: parsed.fiscalYear, quarter: null },
          });
          if (existing) {
            await prisma.financial.update({ where: { id: existing.id }, data: finData });
          } else {
            await prisma.financial.create({
              data: { stockId: stock.id, fiscalYear: parsed.fiscalYear, quarter: null, ...finData },
            });
          }
        } else {
          await prisma.financial.upsert({
            where: { stockId_fiscalYear_quarter: { stockId: stock.id, fiscalYear: parsed.fiscalYear, quarter: parsed.quarter } },
            create: { stockId: stock.id, fiscalYear: parsed.fiscalYear, quarter: parsed.quarter, ...finData },
            update: finData,
          });
        }
        finCount++;
      }

      synced++;
      log.push(`✓ ${symbol}: ${priceCount}日分株価 / ${finCount}件財務`);
    } catch (e) {
      errors++;
      const msg = (e as Error).message;
      console.error(`[jquants] error ${symbol}:`, msg);
      log.push(`✗ ${symbol}: ${msg.slice(0, 120)}`);
    }
  }

  const durationMs = Date.now() - startMs;
  const status = errors === 0 ? "SUCCESS" : synced > 0 ? "PARTIAL" : "ERROR";
  const count = synced;

  await prisma.syncLog.create({
    data: {
      source: "jquants",
      status,
      message: log.slice(0, 80).join("\n"),
      itemCount: synced,
      durationMs,
    },
  });

  if (status === "ERROR") {
    return NextResponse.json(
      {
        success: false,
        source: "jquants",
        error: `全部 ${errors} 只股票同步失败`,
        detail: log.slice(0, 5).join("\n"),
        syncedAt,
        durationMs,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    source: "jquants",
    status,
    count,
    synced,
    errors,
    durationMs,
    message: `同步成功: ${count}条`,
    syncedAt,
    log: log.slice(0, 30),
  });
}
