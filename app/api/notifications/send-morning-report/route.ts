import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isConfigured } from "@/lib/line";
import { pushToAll } from "@/lib/line-push";
import { buildMorningReportFlex } from "@/lib/line-flex";

export async function POST() {
  if (!isConfigured()) {
    return NextResponse.json({ error: "LINE not configured" }, { status: 503 });
  }

  const now = new Date();
  const tokyoDate = new Date(now.getTime() + 9 * 3600000);
  const dateStr = tokyoDate.toISOString().split("T")[0];
  const dow = ["日", "月", "火", "水", "木", "金", "土"][tokyoDate.getUTCDay()];

  const rawPicks = await prisma.stockScore.findMany({
    where: {
      priceCount: { gte: 20 },
      recommendationV2: { in: ["STRONG_BUY", "BUY", "HOLD"] },
      adaptiveScore: { gte: 65 },
    },
    orderBy: [{ adaptiveScore: "desc" }],
    take: 5,
    select: {
      symbol: true, name: true, nameZh: true,
      adaptiveScore: true, recommendationV2: true,
      latestClose: true, return5d: true, summaryReason: true,
    },
  });

  if (rawPicks.length === 0) {
    return NextResponse.json({ error: "推薦銘柄なし" }, { status: 404 });
  }

  const picks = rawPicks.map((p) => ({ ...p, totalScore: p.adaptiveScore, recommendation: p.recommendationV2 }));
  const flexMessage = buildMorningReportFlex(picks, dateStr, dow);

  try {
    const groupIds = await prisma.lineGroup
      .findMany({ where: { isActive: true }, select: { groupId: true } })
      .then((gs) => gs.map((g) => g.groupId));

    const result = await pushToAll([flexMessage], groupIds);

    if (result.quotaExceeded) {
      await prisma.notificationLog.create({
        data: {
          type: "MORNING_REPORT",
          title: `朝報 ${dateStr} [QUOTA_EXCEEDED]`,
          content: "LINE 月額度已耗尽（429）",
          symbols: picks.map((p) => p.symbol),
          status: "QUOTA_EXCEEDED",
          errorMessage: "LINE monthly quota exhausted (HTTP 429). Resets on the 1st of next month.",
        },
      }).catch(() => {});
      return NextResponse.json({ error: "LINE quota exhausted", quotaExceeded: true }, { status: 429 });
    }

    await prisma.notificationLog.create({
      data: {
        type: "MORNING_REPORT",
        title: `朝報 ${dateStr}`,
        content: `TOP${picks.length}推薦`,
        symbols: picks.map((p) => p.symbol),
        status: "SUCCESS",
        sentAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true, count: picks.length, groups: result.groups });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await prisma.notificationLog.create({
      data: {
        type: "MORNING_REPORT",
        title: `朝報送信失敗 ${dateStr}`,
        content: errMsg,
        symbols: [],
        status: "FAILED",
        errorMessage: errMsg,
      },
    }).catch(() => {});
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
