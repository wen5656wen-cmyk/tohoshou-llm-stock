import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const setting = await prisma.notificationSetting.findFirst();
  return NextResponse.json(setting ?? {
    enabled: true,
    morningReportEnabled: true,
    middayReportEnabled: true,
    closeReportEnabled: true,
    realtimeAlertEnabled: true,
    portfolioAlertEnabled: false,
    minScoreChange: 10,
    minPriceChangePct: 5.0,
    minVolumeRatio: 2.0,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const setting = await prisma.notificationSetting.upsert({
    where: { id: 1 },
    update: body,
    create: { id: 1, ...body },
  });
  return NextResponse.json(setting);
}
