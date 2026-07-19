import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/research/calendar?month=YYYY-MM — 研究日历（月/列表通用）。
// 与产业详情 Timeline 同源(ResearchTimelineEvent + ResearchCalendarEvent)，不维护第二套时间线；
// 另并入运营事件：Trigger / Review 时间 / Version 发布时间 / Daily·Weekly / Future Review。
export async function GET(req: Request) {
  const u = new URL(req.url);
  const monthP = u.searchParams.get("month"); // YYYY-MM
  const now = new Date();
  let from: Date, to: Date;
  if (monthP && /^\d{4}-\d{2}$/.test(monthP)) { const [y, m] = monthP.split("-").map(Number); from = new Date(y, m - 1, 1); to = new Date(y, m, 1); }
  else { from = new Date(now.getTime() - 45 * 864e5); to = new Date(now.getTime() + 60 * 864e5); }

  const inWin = { gte: from, lt: to };
  const [timeline, calendar, triggers, reviews, publishes, daily, weekly, industries, futureReview] = await Promise.all([
    prisma.researchTimelineEvent.findMany({ where: { occurredAt: inWin }, orderBy: { occurredAt: "desc" }, take: 300 }),
    prisma.researchCalendarEvent.findMany({ where: { scheduledAt: inWin }, orderBy: { scheduledAt: "asc" }, take: 300 }),
    prisma.researchTrigger.findMany({ where: { firedAt: inWin }, orderBy: { firedAt: "desc" }, take: 200 }),
    prisma.researchReview.findMany({ where: { reviewedAt: inWin }, orderBy: { reviewedAt: "desc" }, take: 200, include: { version: { select: { entityType: true, entityId: true, version: true } } } }),
    prisma.researchVersion.findMany({ where: { publishedAt: inWin }, orderBy: { publishedAt: "desc" }, take: 200, select: { id: true, entityType: true, entityId: true, version: true, publishedAt: true } }),
    prisma.researchDailyUpdate.findMany({ where: { occurredAt: inWin }, orderBy: { occurredAt: "desc" }, take: 200, select: { id: true, industryId: true, title: true, category: true, occurredAt: true } }),
    prisma.researchReport.findMany({ where: { scope: "WEEKLY", createdAt: inWin }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, title: true, refKey: true, createdAt: true } }),
    prisma.researchIndustry.findMany({ select: { id: true, industryKey: true, nameZh: true, nameJa: true, nextReviewAt: true } }),
    prisma.researchIndustry.findMany({ where: { nextReviewAt: { gte: from < now ? now : from, lt: to } }, select: { id: true, industryKey: true, nameZh: true, nameJa: true, nextReviewAt: true } }),
  ]);
  const indById = new Map(industries.map((i) => [i.id, i]));
  const nm = (id: string) => indById.get(id)?.nameZh ?? null;
  const nmJa = (id: string) => indById.get(id)?.nameJa ?? null;
  const key = (id: string) => indById.get(id)?.industryKey ?? null;

  type Ev = { id: string; date: string; kind: string; type: string; title: string; industryKey: string | null; industryName: string | null; industryNameJa: string | null; impact?: string | null };
  const iso = (d: Date | null) => (d ? new Date(d).toISOString() : new Date().toISOString());
  const events: Ev[] = [
    ...timeline.map((t) => ({ id: `tl_${t.id}`, date: iso(t.occurredAt), kind: t.kind === "FORECAST" ? "FORECAST" : "HISTORICAL", type: t.eventType, title: t.title, industryKey: t.entityType === "INDUSTRY" ? key(t.entityId) : null, industryName: t.entityType === "INDUSTRY" ? nm(t.entityId) : null, industryNameJa: t.entityType === "INDUSTRY" ? nmJa(t.entityId) : null, impact: t.impact })),
    ...calendar.map((c) => ({ id: `cal_${c.id}`, date: iso(c.scheduledAt), kind: c.eventType === "REVIEW" ? "REVIEW" : "PLANNED", type: c.eventType, title: c.title, industryKey: c.industryId ? key(c.industryId) : null, industryName: c.industryId ? nm(c.industryId) : null, industryNameJa: c.industryId ? nmJa(c.industryId) : null })),
    ...triggers.map((t) => ({ id: `trg_${t.id}`, date: iso(t.firedAt), kind: "TRIGGER", type: t.eventType, title: `${t.eventType}${t.note ? " · " + t.note.slice(0, 40) : ""}`, industryKey: key(t.industryId), industryName: nm(t.industryId), industryNameJa: nmJa(t.industryId) })),
    ...reviews.map((r) => ({ id: `rv_${r.id}`, date: iso(r.reviewedAt), kind: "REVIEW", type: r.action, title: `${r.action} · ${r.version?.version ?? ""} · ${r.reviewer}`, industryKey: r.version?.entityType === "INDUSTRY" ? key(r.version.entityId) : null, industryName: r.version?.entityType === "INDUSTRY" ? nm(r.version.entityId) : null, industryNameJa: r.version?.entityType === "INDUSTRY" ? nmJa(r.version.entityId) : null })),
    ...publishes.map((p) => ({ id: `pub_${p.id}`, date: iso(p.publishedAt), kind: "PUBLISH", type: "VERSION", title: `${p.version} PUBLISHED`, industryKey: p.entityType === "INDUSTRY" ? key(p.entityId) : null, industryName: p.entityType === "INDUSTRY" ? nm(p.entityId) : null, industryNameJa: p.entityType === "INDUSTRY" ? nmJa(p.entityId) : null })),
    ...daily.map((d) => ({ id: `dl_${d.id}`, date: iso(d.occurredAt), kind: "DAILY", type: d.category, title: d.title, industryKey: key(d.industryId), industryName: nm(d.industryId), industryNameJa: nmJa(d.industryId) })),
    ...weekly.map((w) => ({ id: `wk_${w.id}`, date: iso(w.createdAt), kind: "WEEKLY", type: "WEEKLY", title: w.title, industryKey: w.refKey, industryName: null, industryNameJa: null })),
    ...futureReview.map((i) => ({ id: `fr_${i.id}`, date: iso(i.nextReviewAt), kind: "FUTURE_REVIEW", type: "REVIEW", title: `Next Review`, industryKey: i.industryKey, industryName: i.nameZh, industryNameJa: i.nameJa })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const todayChanged = events.filter((e) => new Date(e.date) >= dayStart && new Date(e.date) <= now && ["HISTORICAL", "TRIGGER", "REVIEW", "PUBLISH", "DAILY"].includes(e.kind));
  const counts = events.reduce((a, e) => { a[e.kind] = (a[e.kind] ?? 0) + 1; return a; }, {} as Record<string, number>);

  return NextResponse.json({ window: { from: from.toISOString(), to: to.toISOString(), month: monthP ?? null }, events, counts, todayChanged });
}
