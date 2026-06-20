import { NextRequest, NextResponse } from "next/server";
import { sendMarkdown, sendText, isWebhookConfigured } from "@/lib/wechat";
import { buildDailyPicksReport } from "@/lib/daily-picks-report";

export const dynamic = "force-dynamic";
// 生产环境推送可能超过默认超时，延长至 60s
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  // 简单的 token 鉴权（可选）
  const auth = req.headers.get("x-cron-secret");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isWebhookConfigured()) {
    return NextResponse.json(
      { error: "WECHAT_WORK_WEBHOOK_URL 未设置" },
      { status: 400 }
    );
  }

  const startAt = new Date().toISOString();

  try {
    const report = await buildDailyPicksReport();

    // 优先发 Markdown，失败降级发纯文本
    const mdResult = await sendMarkdown(report.markdown);
    if (!mdResult.ok) {
      console.warn("Markdown 发送失败，降级为纯文本:", mdResult.errmsg);
      const txtResult = await sendText(report.text);
      if (!txtResult.ok) {
        return NextResponse.json(
          {
            ok: false,
            startAt,
            finishedAt: new Date().toISOString(),
            error: txtResult.errmsg,
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      startAt,
      finishedAt: new Date().toISOString(),
      date: report.date,
      top3: report.top3.map((s) => ({
        symbol: s.symbol,
        name: s.name,
        totalScore: s.totalScore,
        recommendation: s.recommendation,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[daily-picks cron]", msg);
    return NextResponse.json(
      { ok: false, startAt, finishedAt: new Date().toISOString(), error: msg },
      { status: 500 }
    );
  }
}

// GET 用于手动触发测试（不鉴权）
export async function GET() {
  if (!isWebhookConfigured()) {
    return NextResponse.json({ error: "WECHAT_WORK_WEBHOOK_URL 未设置" }, { status: 400 });
  }

  try {
    const report = await buildDailyPicksReport();
    const mdResult = await sendMarkdown(report.markdown);
    if (!mdResult.ok) {
      await sendText(report.text);
    }
    return NextResponse.json({
      ok: true,
      date: report.date,
      markdownPreview: report.markdown,
      top3: report.top3.map((s) => ({
        symbol: s.symbol, name: s.name,
        totalScore: s.totalScore, recommendation: s.recommendation,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
