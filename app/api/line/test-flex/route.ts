import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isConfigured } from "@/lib/line";
import { pushToAll } from "@/lib/line-push";
import { buildTestFlex, buildMorningReportFlex, buildStockCard } from "@/lib/line-flex";

export async function POST(req: NextRequest) {
  if (!isConfigured()) {
    return NextResponse.json({ error: "LINE not configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const type = body.type ?? "test";
  const message = body.message as string | undefined;

  let flexMessage;

  if (type === "morning") {
    const picks = await prisma.stockScore.findMany({
      where: { priceCount: { gte: 20 }, recommendation: { in: ["STRONG_BUY", "BUY", "HOLD"] }, totalScore: { gte: 65 } },
      orderBy: [{ totalScore: "desc" }],
      take: 5,
      select: { symbol: true, name: true, nameZh: true, totalScore: true, recommendation: true, latestClose: true, return5d: true, summaryReason: true },
    });
    const now = new Date();
    const tokyoDate = new Date(now.getTime() + 9 * 3600000);
    const dateStr = tokyoDate.toISOString().split("T")[0];
    const dow = ["日", "月", "火", "水", "木", "金", "土"][tokyoDate.getUTCDay()];
    flexMessage = buildMorningReportFlex(picks.length > 0 ? picks : [{ symbol: "TEST.T", name: "テスト株式", nameZh: "测试股票", totalScore: 72, recommendation: "HOLD", latestClose: 1234, return5d: 2.1, summaryReason: "テスト送信" }], dateStr, dow);
  } else if (type === "stock") {
    const symbol = body.symbol ?? "8035.T";
    const stock = await prisma.stockScore.findUnique({
      where: { symbol },
      select: { symbol: true, name: true, nameZh: true, totalScore: true, recommendation: true, latestClose: true, return5d: true, return20d: true, summaryReason: true, technicalScore: true, fundamentalScore: true, moneyFlowScore: true, newsSentimentScore: true, globalTrendScore: true },
    });
    if (!stock) return NextResponse.json({ error: `Symbol ${symbol} not found` }, { status: 404 });
    flexMessage = buildStockCard(stock);
  } else {
    flexMessage = buildTestFlex(message);
  }

  try {
    // Send to groups + broadcast
    const groupIds = await prisma.lineGroup
      .findMany({ where: { isActive: true }, select: { groupId: true } })
      .then((gs) => gs.map((g) => g.groupId));

    const result = await pushToAll([flexMessage], groupIds);

    if (result.quotaExceeded) {
      await prisma.notificationLog.create({
        data: {
          type: "TEST",
          title: `テスト送信 [QUOTA_EXCEEDED] (${type})`,
          content: "LINE 月額度已耗尽（429）",
          symbols: [],
          status: "QUOTA_EXCEEDED",
          errorMessage: "LINE monthly quota exhausted (HTTP 429). Resets on the 1st of next month.",
        },
      }).catch(() => {});
      return NextResponse.json({ error: "LINE quota exhausted", quotaExceeded: true }, { status: 429 });
    }

    await prisma.notificationLog.create({
      data: {
        type: "TEST",
        title: `テスト送信 (${type})`,
        content: message ?? type,
        symbols: [],
        status: "SUCCESS",
        sentAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true, type, groups: result.groups });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await prisma.notificationLog.create({
      data: {
        type: "TEST",
        title: `テスト送信失敗 (${type})`,
        content: errMsg,
        symbols: [],
        status: "FAILED",
        errorMessage: errMsg,
      },
    }).catch(() => {});
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
