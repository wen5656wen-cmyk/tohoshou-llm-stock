#!/usr/bin/env npx tsx
/**
 * KF 消息轮询 — 检测订阅触发词并激活 VIP 客户（v12.0）
 *
 * 轮询 KF sync_msg 队列，检测"开始接收AI策略"触发词。
 * 仅允许白名单客户（温老头 / 深山老林）激活。
 *
 * 用法：
 *   npx tsx scripts/kf-poll-messages.ts
 *   # 由 cron 每10分钟调用（工作日）
 */

import "dotenv/config";
import { getWecomToken, pollAndActivate, loadSubscribers, WHITELIST_NAMES, TRIGGER_PHRASE } from "../lib/notify/wecom-customer-service";

async function main() {
  const openKfId = process.env.WECOM_KF_ID ?? "";
  if (!openKfId) {
    console.warn("[kf-poll] WECOM_KF_ID 未配置，跳过");
    return;
  }

  console.log("[kf-poll] 开始轮询 KF 消息");
  console.log(`[kf-poll] 触发词: "${TRIGGER_PHRASE}"`);
  console.log(`[kf-poll] 白名单: ${WHITELIST_NAMES.join(" / ")}`);

  const token = await getWecomToken();
  const { activated, rejected } = await pollAndActivate(token, openKfId);

  console.log(`[kf-poll] 完成: 激活=${activated} 拒绝=${rejected}`);

  // 打印当前订阅者列表
  const subscribers = loadSubscribers();
  if (subscribers.length > 0) {
    console.log(`[kf-poll] 当前订阅者（${subscribers.length}）：`);
    for (const s of subscribers) {
      console.log(`  - ${s.name} (${s.external_userid}) 激活于 ${s.activated_at}`);
    }
  } else {
    console.log("[kf-poll] 暂无订阅者");
  }
}

main().catch(err => {
  console.error("[kf-poll] 错误:", err.message);
  process.exit(1);
});
