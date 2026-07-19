#!/usr/bin/env npx tsx
// Deep Research · 9 产业壳 seed（首页九卡）。AI 半导体已有完整深研数据，此处仅确保 9 行存在。
// 不覆盖已有 status/currentVer（保留 AI 半导体 PUBLISHED）。
import "dotenv/config";
import { prisma } from "../../lib/prisma";

const NINE = [
  { industryKey: "AI_SEMICONDUCTOR", nameZh: "AI 半导体", nameEn: "AI Semiconductor", nameJa: "AI 半導体", oneLiner: "先进制程、设备、材料、检测及先进封装", sortOrder: 1 },
  { industryKey: "AI_DATACENTER", nameZh: "AI 数据中心", nameEn: "AI Data Center", nameJa: "AI データセンター", oneLiner: "服务器、散热液冷、网络与数据中心建设", sortOrder: 2 },
  { industryKey: "AI_POWER", nameZh: "AI 电力", nameEn: "AI Power", nameJa: "AI 電力", oneLiner: "电网、变压器、电源、SiC 功率与储能", sortOrder: 3 },
  { industryKey: "AI_OPTICAL", nameZh: "AI 光模块", nameEn: "AI Optical", nameJa: "AI 光モジュール", oneLiner: "光收发、CPO、光芯片与高速连接器", sortOrder: 4 },
  { industryKey: "AI_HBM", nameZh: "AI HBM", nameEn: "AI HBM", nameJa: "AI HBM", oneLiner: "高带宽存储、TSV、先进封装与混合键合", sortOrder: 5 },
  { industryKey: "AI_ROBOTICS", nameZh: "AI 机器人", nameEn: "AI Robotics", nameJa: "AI ロボット", oneLiner: "伺服、谐波减速器、传感器与协作臂", sortOrder: 6 },
  { industryKey: "AI_AUTONOMOUS", nameZh: "AI 自动驾驶", nameEn: "AI Autonomous", nameJa: "AI 自動運転", oneLiner: "车载传感、LiDAR、SoC、图像传感与域控", sortOrder: 7 },
  { industryKey: "AI_AGENT", nameZh: "AI Agent", nameEn: "AI Agent", nameJa: "AI エージェント", oneLiner: "大模型、推理、Agent 框架与企业软件", sortOrder: 8 },
  { industryKey: "AI_MEDICAL", nameZh: "AI 医疗", nameEn: "AI Medical", nameJa: "AI 医療", oneLiner: "影像 AI、诊断、制药 AI 与手术机器人", sortOrder: 9 },
];

async function main() {
  for (const it of NINE) {
    await prisma.researchIndustry.upsert({
      where: { industryKey: it.industryKey },
      create: { ...it, status: "DRAFT" }, // 未深研=DRAFT(研究中)
      update: { nameZh: it.nameZh, nameEn: it.nameEn, nameJa: it.nameJa, oneLiner: it.oneLiner, sortOrder: it.sortOrder }, // 不动 status/currentVer
    });
  }
  const n = await prisma.researchIndustry.count();
  console.log(`✅ 9 产业壳 upsert 完成; 现有产业 ${n}`);
  process.exit(0);
}
main().catch((e) => { console.error("❌", e?.message ?? e); process.exit(1); });
