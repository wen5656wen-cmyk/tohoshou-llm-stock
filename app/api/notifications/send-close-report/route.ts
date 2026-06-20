import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isConfigured } from "@/lib/line";
import { pushToAll } from "@/lib/line-push";
import { buildCloseReportFlex } from "@/lib/line-flex";

export async function POST() {
  if (!isConfigured()) {
    return NextResponse.json({ error: "LINE not configured" }, { status: 503 });
  }

  const now = new Date();
  const tokyoDate = new Date(now.getTime() + 9 * 3600000);
  const dateStr = tokyoDate.toISOString().split("T")[0];
  const dow = ["日", "月", "火", "水", "木", "金", "土"][tokyoDate.getUTCDay()];

  const [total, strongBuy, buy, hold, watch, avoid, avgAgg, topPerformers, fishingCandidates] =
    await Promise.all([
      prisma.stockScore.count({ where: { priceCount: { gte: 20 } } }),
      prisma.stockScore.count({ where: { recommendation: "STRONG_BUY", priceCount: { gte: 20 } } }),
      prisma.stockScore.count({ where: { recommendation: "BUY", priceCount: { gte: 20 } } }),
      prisma.stockScore.count({ where: { recommendation: "HOLD", priceCount: { gte: 20 } } }),
      prisma.stockScore.count({ where: { recommendation: "WATCH", priceCount: { gte: 20 } } }),
      prisma.stockScore.count({ where: { recommendation: "AVOID", priceCount: { gte: 20 } } }),
      prisma.stockScore.aggregate({ _avg: { totalScore: true }, where: { priceCount: { gte: 20 } } }),
      prisma.stockScore.findMany({
        where: { priceCount: { gte: 20 }, recommendation: { in: ["STRONG_BUY", "BUY", "HOLD"] }, totalScore: { gte: 65 } },
        orderBy: { totalScore: "desc" },
        take: 5,
        select: { symbol: true, name: true, nameZh: true, totalScore: true, recommendation: true, return5d: true },
      }),
      prisma.stockScore.findMany({
        where: { priceCount: { gte: 20 }, rsi14: { gte: 35, lte: 52 }, fundamentalScore: { gte: 18 }, totalScore: { gte: 55 }, return5d: { lte: -1 } },
        orderBy: { fundamentalScore: "desc" },
        take: 3,
        select: { symbol: true, name: true, nameZh: true, totalScore: true, rsi14: true, return5d: true },
      }),
    ]);

  const flexMessage = buildCloseReportFlex({ dateStr, dowLabel: dow, total, strongBuy, buy, hold, watch, avoid, avgScore: Math.round(avgAgg._avg.totalScore ?? 0), topPerformers, fishingCandidates });

  try {
    const groupIds = await prisma.lineGroup
      .findMany({ where: { isActive: true }, select: { groupId: true } })
      .then((gs) => gs.map((g) => g.groupId));

    const result = await pushToAll([flexMessage], groupIds);

    if (result.quotaExceeded) {
      await prisma.notificationLog.create({
        data: {
          type: "CLOSE_REPORT",
          title: `大引けまとめ ${dateStr} [QUOTA_EXCEEDED]`,
          content: "LINE 月額度已耗尽（429）",
          symbols: topPerformers.map((p) => p.symbol),
          status: "QUOTA_EXCEEDED",
          errorMessage: "LINE monthly quota exhausted (HTTP 429). Resets on the 1st of next month.",
        },
      }).catch(() => {});
      return NextResponse.json({ error: "LINE quota exhausted", quotaExceeded: true }, { status: 429 });
    }

    await prisma.notificationLog.create({
      data: {
        type: "CLOSE_REPORT",
        title: `大引けまとめ ${dateStr}`,
        content: `BUY:${buy} HOLD:${hold} AVOID:${avoid}`,
        symbols: topPerformers.map((p) => p.symbol),
        status: "SUCCESS",
        sentAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true, groups: result.groups });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await prisma.notificationLog.create({
      data: { type: "CLOSE_REPORT", title: `大引けまとめ失敗 ${dateStr}`, content: errMsg, symbols: [], status: "FAILED", errorMessage: errMsg },
    }).catch(() => {});
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
