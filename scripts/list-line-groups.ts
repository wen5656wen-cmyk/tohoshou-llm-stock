#!/usr/bin/env npx tsx
/** 查看已注册 LINE 群组：npm run line:groups */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

async function main() {
  const groups = await prisma.lineGroup.findMany({ orderBy: { firstSeenAt: "desc" } });

  if (groups.length === 0) {
    console.log("❌ 没有已注册的 LINE 群组");
    console.log("→ 请先将 Bot (@903zdoup) 邀请进你的 LINE 群，然后启动 ngrok 捕获 groupId");
  } else {
    console.log(`✅ 共 ${groups.length} 个 LINE 群组:\n`);
    for (const g of groups) {
      const status = g.isActive ? "✅ 活跃" : "❌ 已退出";
      console.log(`${status}  ${g.groupId}`);
      if (g.name) console.log(`   名称：${g.name}`);
      console.log(`   首次：${g.firstSeenAt.toLocaleString("zh-CN", { timeZone: "Asia/Tokyo" })}`);
      console.log(`   最近：${g.lastSeenAt?.toLocaleString("zh-CN", { timeZone: "Asia/Tokyo" }) ?? "—"}`);
      console.log();
    }
  }

  await prisma.$disconnect();
}

main().catch(console.error);
