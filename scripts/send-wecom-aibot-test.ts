#!/usr/bin/env npx tsx
/**
 * 企业微信智能机器人长连接推送测试（v11.4）
 *
 * 前提：tohoshou-wecom-aibot worker 已在后台运行
 *   pm2 start "npx tsx scripts/wecom-aibot-worker.ts" --name tohoshou-wecom-aibot
 *
 * 使用：
 *   npx tsx scripts/send-wecom-aibot-test.ts
 *   npm run wecom:aibot:test
 */

import "dotenv/config";
import { sendViaWorker, isAibotConfigured } from "../lib/notify/wecom-aibot";

async function main() {
  console.log("=== TOHOSHOU AI 企业微信长连接推送测试 ===\n");

  if (!isAibotConfigured()) {
    console.warn(
      "⚠️  WECOM_AIBOT_ID / WECOM_AIBOT_SECRET / WECOM_AIBOT_CHAT_ID 未完整配置。\n" +
      "   请先在 .env 中配置后再运行此测试。"
    );
    process.exit(1);
  }

  // 检查 worker 状态
  console.log("检查 worker 状态（http://127.0.0.1:3977/status）...");
  try {
    const statusRes = await fetch("http://127.0.0.1:3977/status", {
      signal: AbortSignal.timeout(3000),
    });
    const status = (await statusRes.json()) as { ok: boolean; subscribed: boolean; chatId: string | null };
    console.log(`  Worker 运行中：ok=${status.ok}, subscribed=${status.subscribed}, chatId=${status.chatId ?? "(未配置)"}`);
    if (!status.subscribed) {
      console.warn("  ⚠️  Worker 尚未完成 WebSocket 订阅，消息可能发送失败。");
    }
  } catch {
    console.error("  ❌ Worker 未运行或无法访问，请先启动：");
    console.error('     pm2 start "npx tsx scripts/wecom-aibot-worker.ts" --name tohoshou-wecom-aibot');
    process.exit(1);
  }

  // 构建测试消息
  const nowJst = new Date(Date.now() + 9 * 3600000);
  const timeStr = nowJst.toISOString().replace("T", " ").slice(0, 19) + " JST";

  const content = [
    "## ✅ TOHOSHOU AI 长连接推送测试",
    "---",
    "企业微信智能机器人 WebSocket 长连接工作正常。",
    "",
    `**时间：** ${timeStr}`,
    `**版本：** v11.4`,
    "",
    "_如果你看到这条消息，说明推送链路完全正常。_",
  ].join("\n");

  console.log("\n发送测试消息...");
  const res = await sendViaWorker(content);

  if (res.ok) {
    console.log("✅ 测试推送成功！请在企业微信群中确认消息。");
  } else {
    console.error("❌ 测试推送失败:", res.errmsg);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("致命错误:", err);
  process.exit(1);
});
