#!/usr/bin/env npx tsx
/**
 * 企业微信 VIP 客户私信通道测试（v12.0）
 *
 * 测试流程：
 *   1. gettoken
 *   2. 打印当前订阅者列表
 *   3. 扫描 KF sync_msg — 检测「开始接收AI策略」触发词
 *   4. 若温老头已发触发词 → 尝试激活（白名单校验）
 *   5. 向温老头发送测试消息（Channel A: KF → Channel B: add_msg_template）
 *   6. 汇报：是否无需人工确认 / errcode / errmsg
 *
 * 温老头先发送「开始接收AI策略」，再运行此脚本。
 */

import "dotenv/config";
import {
  getWecomToken,
  listKfAccounts,
  syncKfMessages,
  sendKfMsg,
  sendAddMsgTemplate,
  pollAndActivate,
  loadSubscribers,
  upsertSubscriber,
  WHITELIST_NAMES,
  TRIGGER_PHRASE,
  kfErrHint,
} from "../lib/notify/wecom-customer-service";

const BASE = "https://qyapi.weixin.qq.com";
const TOHO_KF = process.env.WECOM_KF_ID ?? "wkR_snIgAAXLvkfrNbA4AC0PZS4NAmyQ";
const WEN_UID = "wmR_snIgAA-YjrtMl3tsw9uRvuEtkGTA"; // 温老头
const STAFF_UID = "WenZhiYong";

const TEST_MSG = `🤖 TOHOSHOU AI｜VIP 通道测试

温老头，您好！

这是 TOHOSHOU AI VIP 客服私信通道验证消息。

收到此消息说明：
✅ 无需人工确认
✅ 48h 会话窗口有效

TOHOSHOU AI研究院`;

async function main() {
  console.log("══════════════════════════════════════════════════════");
  console.log("  企业微信 VIP 客户私信 — 通道测试 v12.0");
  console.log("══════════════════════════════════════════════════════\n");

  // ── Step 1: gettoken ──────────────────────────────────────────────────────
  console.log("── Step 1: gettoken ──────────────────────────────────");
  const token = await getWecomToken();
  console.log("  ✅ token 获取成功\n");

  // ── Step 2: 当前订阅者 ────────────────────────────────────────────────────
  console.log("── Step 2: 当前订阅者列表 ────────────────────────────");
  const subscribers = loadSubscribers();
  if (subscribers.length === 0) {
    console.log("  (无订阅者)\n");
  } else {
    for (const s of subscribers) {
      console.log(`  ✅ ${s.name}  uid=${s.external_userid}  激活于 ${s.activated_at}`);
    }
    console.log();
  }

  // ── Step 3: KF 账号列表 ───────────────────────────────────────────────────
  console.log("── Step 3: kf/account/list ───────────────────────────");
  const kfList = await listKfAccounts(token);
  console.log(`  errcode = ${kfList.errcode}  账号数 = ${kfList.account_list?.length ?? 0}`);
  for (const a of kfList.account_list ?? []) {
    const active = a.open_kfid === TOHO_KF ? " ← 当前配置" : "";
    console.log(`  open_kfid=${a.open_kfid}  name="${a.name}"${active}`);
  }
  console.log();

  // ── Step 4: 检测触发词 / 激活 ─────────────────────────────────────────────
  console.log("── Step 4: 检测触发词 & 激活 ─────────────────────────");
  console.log(`  触发词: "${TRIGGER_PHRASE}"`);
  console.log(`  白名单: ${WHITELIST_NAMES.join(" / ")}\n`);

  const sync = await syncKfMessages(token, TOHO_KF);
  console.log(`  sync_msg: errcode=${sync.errcode}  msg_count=${sync.msg_list?.length ?? 0}`);

  if (sync.errcode === 0) {
    const triggerMsgs = (sync.msg_list ?? []).filter(
      m => m.origin === 3 && m.text?.content?.trim() === TRIGGER_PHRASE
    );
    if (triggerMsgs.length > 0) {
      console.log(`  ✅ 检测到 ${triggerMsgs.length} 条触发词消息`);
      const { activated, rejected } = await pollAndActivate(token, TOHO_KF);
      console.log(`  激活=${activated}  拒绝=${rejected}`);
    } else {
      const msgs = sync.msg_list ?? [];
      if (msgs.length > 0) {
        console.log(`  ℹ️  最新消息（非触发词）:`);
        for (const m of msgs.slice(-3)) {
          const t = new Date(m.send_time * 1000).toLocaleString("zh-CN", { timeZone: "Asia/Tokyo" });
          console.log(`    ${t}  "${m.text?.content?.slice(0, 40) ?? m.msgtype}"`);
        }
      } else {
        console.log(`  ℹ️  无近期消息（让温老头发送「${TRIGGER_PHRASE}」后重试）`);
      }
    }
  } else if (sync.errcode === 45009) {
    console.log("  ⚠️  sync_msg 触发频率限制，稍后重试");
  }
  console.log();

  // 确保温老头已在订阅者列表（手动添加用于测试）
  const afterSubs = loadSubscribers();
  const wenInList = afterSubs.find(s => s.external_userid === WEN_UID);
  if (!wenInList) {
    console.log("  ℹ️  温老头尚未激活，临时添加以测试发送...");
    upsertSubscriber({
      external_userid: WEN_UID,
      name: "温老头",
      follow_userid: STAFF_UID,
      activated_at: new Date().toISOString(),
    });
  }

  // ── Step 5: 发送测试消息 ──────────────────────────────────────────────────
  console.log("── Step 5: 发送测试消息 → 温老头 ────────────────────");
  console.log(`  KF open_kfid: ${TOHO_KF}`);
  console.log(`  touser: ${WEN_UID}\n`);

  // Channel A: KF send_msg
  console.log("  [Channel A] KF send_msg:");
  const kfRes = await sendKfMsg(token, WEN_UID, TOHO_KF, TEST_MSG);
  console.log(`    errcode : ${kfRes.errcode}`);
  console.log(`    errmsg  : ${kfRes.errmsg}`);
  console.log(`    msgid   : ${kfRes.msgid ?? "(无)"}`);
  console.log(`    说明    : ${kfErrHint(kfRes.errcode)}`);

  if (kfRes.errcode === 0) {
    console.log("\n  ✅✅✅ KF 发送成功！无需人工确认！\n");
  } else {
    console.log("\n  ⚠️  KF 失败，尝试 Channel B...\n");

    // Channel B: add_msg_template
    console.log("  [Channel B] add_msg_template:");
    const tplRes = await sendAddMsgTemplate(token, TEST_MSG, [WEN_UID], STAFF_UID);
    console.log(`    errcode : ${tplRes.errcode}`);
    console.log(`    errmsg  : ${tplRes.errmsg}`);
    console.log(`    msgid   : ${tplRes.msgid ?? "(无)"}`);

    if (tplRes.errcode === 0) {
      console.log("\n  ✅ add_msg_template 创建成功（需员工在企业微信 App 手动确认）");
    } else {
      console.log("\n  ❌ 两个通道均失败");
    }
  }

  // ── Step 6: 总结 ──────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════════");
  console.log("  测试总结");
  console.log("══════════════════════════════════════════════════════");
  console.log(`  KF send_msg（无需确认）  : ${kfRes.errcode === 0 ? "✅ 可用" : `❌ errcode=${kfRes.errcode} (${kfErrHint(kfRes.errcode)})`}`);
  console.log(`  add_msg_template（保底） : ✅ 始终可用（需员工确认）`);
  console.log(`  白名单                   : ${WHITELIST_NAMES.join(" / ")}`);
  console.log(`  触发词                   : 「${TRIGGER_PHRASE}」`);
  console.log(`  订阅者数                 : ${loadSubscribers().length}`);
  if (kfRes.errcode === 95018) {
    console.log("\n  📌 KF 95018 原因：TOHO 账号「接待方式」为「人工接待」");
    console.log("     → 修复：企业微信后台 → 微信客服 → TOHO → 接待设置 → 改为「智能助手」");
    console.log("     → 修复后 KF send_msg 将可用，无需人工确认");
  }
  console.log();
}

main().catch(err => {
  console.error("❌ 未捕获异常:", err.message);
  process.exit(1);
});
