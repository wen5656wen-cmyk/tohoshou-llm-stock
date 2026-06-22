#!/usr/bin/env npx tsx
/**
 * 企业微信问答接口测试脚本（v11.2）
 * 直接调用 lib/wecom-chat.ts，无需运行 HTTP 服务器。
 */

import "dotenv/config";
import { handleWecomQuery } from "../lib/wecom-chat";

const QUESTIONS = [
  "7203",
  "7203能买吗？",
  "今日推荐",
  "最近有哪些STRONG BUY",
  "回测结果",
];

async function main() {
  console.log("=== TOHOSHOU AI 企业微信问答接口测试 ===\n");

  let passed = 0;
  let failed = 0;

  for (const q of QUESTIONS) {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`❓ 问题：「${q}」`);

    try {
      const res = await handleWecomQuery(q);
      if (res.ok && res.text) {
        console.log(`✅ type: ${res.type}`);
        console.log(`📝 text:\n${res.text}`);
        passed++;
      } else {
        console.log(`⚠️  ok=${res.ok}, text: ${res.text}`);
        if (!res.ok) failed++;
        else passed++;
      }
    } catch (err) {
      console.error(`❌ 异常：${err instanceof Error ? err.message : err}`);
      failed++;
    }

    console.log("");
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`测试结果：${passed}/${QUESTIONS.length} 通过，${failed} 失败`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("致命错误:", err);
  process.exit(1);
});
