export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

  // If a job is already running, return it instead of creating a duplicate
  const existingJob = await prisma.syncJob.findFirst({
    where: { source: "jquants", status: { in: ["PENDING", "RUNNING"] } },
    orderBy: { createdAt: "desc" },
  });
  if (existingJob) {
    return NextResponse.json({
      success: true,
      jobId: existingJob.id,
      status: existingJob.status,
      message: "已有正在运行的 J-Quants 同步任务",
      total: existingJob.total,
      processed: existingJob.processed,
    });
  }

  // Determine stocks to sync (Top 200 by score)
  const scored = await prisma.stockScore.findMany({
    select: { symbol: true },
    orderBy: { adaptiveScore: "desc" },
    take: 200,
  });

  // Create job record
  const job = await prisma.syncJob.create({
    data: {
      source: "jquants",
      status: "PENDING",
      total: scored.length,
    },
  });

  // Start background sync — fire-and-forget (runs in Node.js event loop after response)
  void runJQuantsSync(job.id, scored.map((s) => s.symbol));

  return NextResponse.json({
    success: true,
    jobId: job.id,
    status: "RUNNING",
    message: `J-Quants 同步任务已开始，共 ${scored.length} 只股票`,
    total: scored.length,
    processed: 0,
    syncedAt,
  });
}

// ── Background sync function ─────────────────────────────────────────────────
async function runJQuantsSync(jobId: string, symbols: string[]) {
  const BATCH_SIZE = 10;
  const BATCH_DELAY_MS = 300;

  try {
    await prisma.syncJob.update({
      where: { id: jobId },
      data: { status: "RUNNING", startedAt: new Date() },
    });

    // Load stock rows
    const stockRows = await prisma.stock.findMany({
      where: { symbol: { in: symbols } },
      select: { id: true, symbol: true, name: true },
    });
    const stockMap = new Map(stockRows.map((s) => [s.symbol, s]));

    const to = new Date().toISOString().split("T")[0];
    const from = new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0];

    let successCount = 0;
    let failedCount = 0;
    const logLines: string[] = [];

    for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
      const batch = symbols.slice(i, i + BATCH_SIZE);

      for (const symbol of batch) {
        const stock = stockMap.get(symbol);
        if (!stock) continue;

        try {
          const jqCode = toJQuantsCode(stock.symbol);
          console.log(`[jquants] syncing ${symbol} (${jqCode})`);

          // 1) Stock master info
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

          // 2) Daily price bars (last 90 days)
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

          // 3) Financial summary
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
                where: {
                  stockId_fiscalYear_quarter: {
                    stockId: stock.id,
                    fiscalYear: parsed.fiscalYear,
                    quarter: parsed.quarter,
                  },
                },
                create: { stockId: stock.id, fiscalYear: parsed.fiscalYear, quarter: parsed.quarter, ...finData },
                update: finData,
              });
            }
            finCount++;
          }

          successCount++;
          logLines.push(`✓ ${symbol}: ${priceCount}日分株価 / ${finCount}件財務`);
        } catch (e) {
          failedCount++;
          const msg = (e as Error).message;
          console.error(`[jquants] error ${symbol}:`, msg);
          logLines.push(`✗ ${symbol}: ${msg.slice(0, 100)}`);
        }
      }

      // Update progress after each batch
      await prisma.syncJob.update({
        where: { id: jobId },
        data: {
          processed: Math.min(i + BATCH_SIZE, symbols.length),
          successCount,
          failedCount,
        },
      });

      // Polite delay between batches
      if (i + BATCH_SIZE < symbols.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      }
    }

    const finalStatus = failedCount === 0 ? "SUCCESS" : successCount > 0 ? "SUCCESS" : "FAILED";

    await prisma.syncJob.update({
      where: { id: jobId },
      data: {
        status: finalStatus,
        processed: symbols.length,
        successCount,
        failedCount,
        finishedAt: new Date(),
        errorMessage: failedCount > 0 ? `${failedCount} 只股票失败` : null,
      },
    });

    // Write to SyncLog for the /sync page history
    await prisma.syncLog.create({
      data: {
        source: "jquants",
        status: finalStatus,
        message: logLines.slice(0, 80).join("\n"),
        itemCount: successCount,
        durationMs: null,
      },
    });
  } catch (e) {
    const msg = (e as Error).message;
    console.error("[jquants] background sync fatal error:", msg);
    await prisma.syncJob
      .update({
        where: { id: jobId },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          errorMessage: msg.slice(0, 500),
        },
      })
      .catch(() => {});
  }
}
