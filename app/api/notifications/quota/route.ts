import { NextResponse } from "next/server";
import { isConfigured, lineGet } from "@/lib/line";

type LineQuota = { type: string; value?: number };
type LineUsage = { totalUsage: number };

export async function GET() {
  if (!isConfigured()) {
    return NextResponse.json({ error: "LINE not configured" }, { status: 503 });
  }
  try {
    const [quota, usage] = await Promise.all([
      lineGet<LineQuota>("/message/quota"),
      lineGet<LineUsage>("/message/quota/consumption"),
    ]);

    const isLimited = quota.type === "limited";
    const value = isLimited ? (quota.value ?? 0) : null;
    const totalUsage = usage.totalUsage;
    const remaining = value !== null ? Math.max(0, value - totalUsage) : null;
    const pct = value ? Math.min(100, Math.round((totalUsage / value) * 100)) : 0;
    const exhausted = isLimited && remaining === 0;

    const planLabel =
      quota.type === "limited"
        ? `免費版 (${value} 通/月)`
        : quota.type === "unlimited"
        ? "有料版 (無制限)"
        : "不支持推送";

    return NextResponse.json({ type: quota.type, planLabel, value, totalUsage, remaining, pct, exhausted });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
