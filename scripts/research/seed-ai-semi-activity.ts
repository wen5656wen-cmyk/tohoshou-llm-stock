#!/usr/bin/env npx tsx
// AI 半导体活动种子：Daily Update / Timeline(Historical+Forecast) / Calendar(Planned)。真实公开信息。
import "dotenv/config";
import { prisma } from "../../lib/prisma";
const DAY = 86400000;
async function main() {
  const ind = await prisma.researchIndustry.findUnique({ where: { industryKey: "AI_SEMICONDUCTOR" } });
  if (!ind) throw new Error("industry missing");
  const now = new Date();
  await prisma.researchDailyUpdate.deleteMany({ where: { industryId: ind.id } });
  await prisma.researchTimelineEvent.deleteMany({ where: { entityType: "INDUSTRY", entityId: ind.id } });
  await prisma.researchCalendarEvent.deleteMany({ where: { industryId: ind.id } });

  await prisma.researchDailyUpdate.createMany({ data: [
    { industryId: ind.id, companyKey: "tel", category: "EARNINGS", title: "东京电子上修 AI 相关设备订单指引", summary: "AI/HBM 相关前道设备需求强劲，指引上修", confidence: "MID", occurredAt: now },
    { industryId: ind.id, category: "EXPORT_CTRL", title: "传对华先进半导体设备出口限制或升级", summary: "波及先进设备/材料对华出口，需持续跟踪", confidence: "LOW", occurredAt: now },
    { industryId: ind.id, companyKey: "lasertec", category: "ORDER", title: "Lasertec 获某大厂 High-NA 检测新订单", summary: "先进节点扩产带动 EUV 检测需求", confidence: "MID", occurredAt: now },
  ] });

  await prisma.researchTimelineEvent.createMany({ data: [
    { entityType: "INDUSTRY", entityId: ind.id, kind: "HISTORICAL", eventType: "MILESTONE", title: "Lasertec EUV 掩膜检测放量，确立近乎独家地位", impact: "POSITIVE", occurredAt: new Date(now.getTime() - 400 * DAY) },
    { entityType: "INDUSTRY", entityId: ind.id, kind: "HISTORICAL", eventType: "POLICY", title: "日本半导体材料/设备成为地缘政治焦点", impact: "NEUTRAL", occurredAt: new Date(now.getTime() - 200 * DAY) },
    { entityType: "INDUSTRY", entityId: ind.id, kind: "FORECAST", eventType: "TECH", title: "AI 推断：High-NA EUV 检测 2026-2027 放量", summary: "先进节点导入 High-NA，检测设备需求扩张（AI 推断）", impact: "POSITIVE", occurredAt: new Date(now.getTime() + 200 * DAY) },
    { entityType: "INDUSTRY", entityId: ind.id, kind: "FORECAST", eventType: "CAPACITY", title: "AI 推断：Rapidus 2nm 2027 量产将改变代工格局", summary: "若成功打破先进代工垄断（AI 推断，执行风险高）", impact: "POSITIVE", occurredAt: new Date(now.getTime() + 500 * DAY) },
  ] });

  await prisma.researchCalendarEvent.createMany({ data: [
    { industryId: ind.id, companyKey: "tel", eventType: "EARNINGS", title: "东京电子 下季度财报", scheduledAt: new Date(now.getTime() + 25 * DAY), status: "SCHEDULED" },
    { industryId: ind.id, eventType: "REVIEW", title: "AI 半导体 周度复核", scheduledAt: ind.nextReviewAt ?? new Date(now.getTime() + 7 * DAY), status: "SCHEDULED" },
    { industryId: ind.id, companyKey: "advantest", eventType: "EARNINGS", title: "爱德万测试 财报", scheduledAt: new Date(now.getTime() + 32 * DAY), status: "SCHEDULED" },
  ] });
  console.log("✅ AI 半导体活动种子: daily 3 / timeline 4(2H+2F) / calendar 3");
  process.exit(0);
}
main().catch((e) => { console.error("❌", e?.message ?? e); process.exit(1); });
