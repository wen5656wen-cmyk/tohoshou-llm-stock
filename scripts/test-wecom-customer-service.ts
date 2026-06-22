#!/usr/bin/env npx tsx
/**
 * TOHOSHOU AI — 企业微信 VIP 私信通道测试（v12.1）
 *
 * 验证：
 *   1. token 获取
 *   2. VIP 客户查询（白名单：温老头 / 深山老林）
 *   3. add_msg_template 任务创建（员工确认后消息发出）
 *   4. 打印完整 errcode / errmsg / msgid
 */

import "dotenv/config";
import { getWecomToken, findVipContacts, sendToVipCustomers, VIP_NAMES } from "../lib/notify/wecom-customer-service";

const TEST_CONTENT = `TOHOSHOU AI 研究院
VIP 私信通道验证

本条消息为系统通道测试。

确认收到后，后续将通过此方式接收：
• 晨间策略报告（08:00）
• 盘中策略更新（11:30，重大信号）
• 每日收盘复盘（15:30）

TOHOSHOU AI 研究院`;

async function main() {
  console.log("══════════════════════════════════════════════");
  console.log("  企业微信 VIP 私信通道测试 v12.1");
  console.log("══════════════════════════════════════════════\n");

  // ── Step 1: token ─────────────────────────────────────────────────────────
  console.log("── Step 1: gettoken ──────────────────────────");
  const token = await getWecomToken();
  console.log("  ✅ token 获取成功\n");

  // ── Step 2: VIP 客户查询 ──────────────────────────────────────────────────
  console.log("── Step 2: VIP 客户查询 ──────────────────────");
  console.log(`  白名单: ${VIP_NAMES.join(" / ")}\n`);
  const vips = await findVipContacts(token);
  if (vips.length === 0) {
    console.log("  ⚠️  未找到白名单客户（请确认客户已添加为企业微信外部联系人）\n");
  } else {
    for (const v of vips) {
      console.log(`  ✅ ${v.name}  external_userid=${v.external_userid}`);
    }
  }
  const notFound = VIP_NAMES.filter(n => !vips.find(v => v.name === n));
  if (notFound.length > 0) {
    console.log(`  ⚠️  未找到: ${notFound.join(", ")}`);
  }
  console.log();

  // ── Step 3: add_msg_template ──────────────────────────────────────────────
  console.log("── Step 3: add_msg_template ──────────────────");
  const result = await sendToVipCustomers(TEST_CONTENT, token);
  console.log();
  console.log("  ── API 响应 ────────────────────────────────");
  console.log(`  errcode  : ${result.errcode}`);
  console.log(`  errmsg   : ${result.errmsg}`);
  console.log(`  msgid    : ${result.msgid ?? "(无)"}`);
  console.log(`  VIP 数量 : ${result.vipCount}`);
  console.log(`  VIP 名单 : ${result.vipNames.join(", ") || "(无)"}`);
  console.log();

  // ── 总结 ──────────────────────────────────────────────────────────────────
  console.log("══════════════════════════════════════════════");
  console.log("  测试总结");
  console.log("══════════════════════════════════════════════");
  if (result.errcode === 0) {
    console.log(`  ✅ 发送任务创建成功`);
    console.log(`  ✅ 请在企业微信 App → 客户群发 → 确认发送`);
  } else {
    console.log(`  ❌ 失败 errcode=${result.errcode}: ${result.errmsg}`);
    const hints: Record<number, string> = {
      40001: "Secret 错误",
      60011: "应用无「客户联系」API 权限",
      40096: "sender 不是有效员工",
      41048: "external_userid 不属于本企业客户",
    };
    if (hints[result.errcode]) console.log(`  提示: ${hints[result.errcode]}`);
  }
  console.log(`\n  发送通道  : add_msg_template（人工确认）`);
  console.log(`  白名单    : ${VIP_NAMES.join(" / ")}`);
  console.log(`  KF 通道   : 已停用`);
  console.log();
}

main().catch(err => {
  console.error("❌ 错误:", err.message);
  process.exit(1);
});
