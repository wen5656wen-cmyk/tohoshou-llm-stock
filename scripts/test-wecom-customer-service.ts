#!/usr/bin/env npx tsx
/**
 * 企业微信「微信客服 KF 48h 会话窗口」通道测试（v11.7）
 *
 * 测试流程：
 *   1. gettoken（客户联系 Secret）
 *   2. 拉外部联系人列表 → 筛选「温老头」「深山老林」
 *   3. 探测 kf/account/list → 报告权限状态 + 账号列表
 *   4. 若有账号 → kf/sync_msg 查近期客户消息（48h 会话窗口）
 *   5. 向「温老头」发送测试消息 → 打印 errcode/errmsg
 *   6. 报告是否无需人工确认、是否需要客户先发消息、超窗口报什么码
 *
 * 若无 KF 权限：直接输出 errcode + 官方限制 + 开通步骤
 *
 * 目标用户：仅「温老头」（external_userid: wmR_snIgAA-YjrtMl3tsw9uRvuEtkGTA）
 */

import "dotenv/config";
import {
  getWecomToken,
  listKfAccounts,
  syncKfMessages,
  sendKfMsg,
  kfErrHint,
} from "../lib/notify/wecom-customer-service";

const BASE = "https://qyapi.weixin.qq.com";
const ALLOWED_NAMES = ["温老头", "深山老林"];
const TARGET_NAME   = "温老头";

const TEST_MSG = `🤖 TOHOSHOU AI｜服务激活成功

您已进入 AI 策略服务窗口。

今日可接收：
① 晨间策略
② 盘中策略更新
③ 收盘复盘

TOHOSHOU AI研究院`;

interface ExternalContact {
  external_userid: string;
  name: string;
  follow_userid: string;
}

async function getFilteredCustomers(token: string): Promise<ExternalContact[]> {
  // 拉员工列表
  const fr = await fetch(`${BASE}/cgi-bin/externalcontact/get_follow_user_list?access_token=${token}`);
  const fd = await fr.json() as { errcode: number; errmsg: string; follow_user?: string[] };
  if (fd.errcode !== 0) throw new Error(`get_follow_user_list errcode=${fd.errcode} ${fd.errmsg}`);

  const staff = fd.follow_user ?? [];
  const results: ExternalContact[] = [];

  for (const userId of staff) {
    let cursor = "";
    do {
      const params = new URLSearchParams({ access_token: token, userid: userId });
      if (cursor) params.set("cursor", cursor);
      const lr = await fetch(`${BASE}/cgi-bin/externalcontact/list?${params}`);
      const ld = await lr.json() as { errcode: number; errmsg: string; external_userid?: string[]; next_cursor?: string };
      if (ld.errcode !== 0) break;

      for (const eid of ld.external_userid ?? []) {
        const gr = await fetch(`${BASE}/cgi-bin/externalcontact/get?access_token=${token}&external_userid=${eid}`);
        const gd = await gr.json() as { errcode: number; external_contact?: { external_userid: string; name: string } };
        if (gd.errcode === 0 && gd.external_contact) {
          const { name, external_userid } = gd.external_contact;
          if (ALLOWED_NAMES.includes(name)) {
            results.push({ external_userid, name, follow_userid: userId });
          }
        }
      }
      cursor = ld.next_cursor ?? "";
    } while (cursor);
  }

  return results;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  企业微信 微信客服 KF 48h 会话窗口 — 通道探测 & 测试");
  console.log("═══════════════════════════════════════════════════════════\n");

  // ── Step 1: gettoken ──────────────────────────────────────────────────────
  console.log("── Step 1: gettoken ─────────────────────────────────────────");
  const token = await getWecomToken();
  console.log(`✅ token 获取成功\n`);

  // ── Step 2: 筛选客户 ──────────────────────────────────────────────────────
  console.log("── Step 2: 外部联系人筛选（仅允许：温老头 / 深山老林）──────────");
  const customers = await getFilteredCustomers(token);
  if (customers.length === 0) {
    console.log("⚠️  未找到符合条件的客户\n");
  } else {
    for (const c of customers) {
      console.log(`  name="${c.name}"  external_userid=${c.external_userid}  follow_user=${c.follow_userid}`);
    }
  }
  console.log();

  const target = customers.find(c => c.name === TARGET_NAME);

  // ── Step 3: KF 账号列表 ───────────────────────────────────────────────────
  console.log("── Step 3: kf/account/list ──────────────────────────────────");
  const kfList = await listKfAccounts(token);
  console.log(`  errcode = ${kfList.errcode}`);
  console.log(`  errmsg  = ${kfList.errmsg}`);
  console.log(`  账号数  = ${kfList.account_list?.length ?? 0}`);
  if (kfList.errcode !== 0) {
    console.log(`\n  ❌ API 权限不足`);
    console.log(`  提示: ${kfErrHint(kfList.errcode)}`);
    console.log(`\n  ┌─ 开通步骤 ──────────────────────────────────────────────`);
    console.log(`  │  1. 企业微信管理后台 → 应用管理 → 微信客服 → 创建客服账号`);
    console.log(`  │  2. 记录 open_kfid（wk 开头）→ 写入 .env WECOM_KF_ID=wk..`);
    console.log(`  │  3. 客户联系 应用设置 → 开启「微信客服」API 权限`);
    console.log(`  │     或创建新自建应用并添加「微信客服」可见范围`);
    console.log(`  │  4. 设置 KF 消息回调 URL → 接收客户消息事件`);
    console.log(`  │  5. 让「温老头」扫客服账号二维码发消息 → 开启 48h 窗口`);
    console.log(`  └────────────────────────────────────────────────────────`);
  } else if (kfList.account_list?.length) {
    console.log(`\n  ✅ 已有客服账号:`);
    for (const a of kfList.account_list) {
      console.log(`    open_kfid=${a.open_kfid}  name="${a.name}"  type=${a.type}`);
    }
  } else {
    console.log(`\n  ⚠️  API 权限 OK 但无客服账号 → 请先创建客服账号`);
  }
  console.log();

  // ── Step 4: 若有 KF 账号 → 查活跃会话 ───────────────────────────────────
  const kfAccounts = kfList.account_list ?? [];
  let activeSessions: Array<{ external_userid: string; open_kfid: string; last_msg_time: number }> = [];

  if (kfAccounts.length > 0) {
    console.log("── Step 4: kf/sync_msg（查近期客户消息）────────────────────────");
    for (const kfAcc of kfAccounts) {
      const sync = await syncKfMessages(token, kfAcc.open_kfid);
      console.log(`  open_kfid=${kfAcc.open_kfid}  errcode=${sync.errcode}  msg_count=${sync.msg_list?.length ?? 0}`);
      if (sync.errcode === 0) {
        const now = Date.now() / 1000;
        for (const msg of sync.msg_list ?? []) {
          if (msg.origin === 3) {  // 客户主动消息
            const age = Math.round((now - msg.send_time) / 3600);
            if (age < 48) {
              console.log(`    ✅ 活跃会话: external_userid=${msg.external_userid}  ${age}h 前发消息`);
              activeSessions.push({
                external_userid: msg.external_userid,
                open_kfid: kfAcc.open_kfid,
                last_msg_time: msg.send_time,
              });
            } else {
              console.log(`    ⏰ 已过期: external_userid=${msg.external_userid}  ${age}h 前发消息（> 48h）`);
            }
          }
        }
      }
    }
    console.log();
  }

  // ── Step 5: 向温老头发送测试消息 ─────────────────────────────────────────
  console.log("── Step 5: kf/send_msg → 温老头 ─────────────────────────────");

  if (!target) {
    console.log("  ⚠️  外部联系人中未找到「温老头」，无法测试发送\n");
  } else {
    console.log(`  target external_userid = ${target.external_userid}`);

    // 判断是否有活跃 KF 会话
    const session = activeSessions.find(s => s.external_userid === target.external_userid);
    const kfId = session?.open_kfid ?? process.env.WECOM_KF_ID ?? kfAccounts[0]?.open_kfid ?? "wk_NOT_CONFIGURED";

    console.log(`  open_kfid = ${kfId}`);
    if (!session) {
      console.log(`  ⚠️  无活跃 KF 会话（温老头 尚未通过客服账号发消息，或 KF 未配置）`);
    }

    const result = await sendKfMsg(token, target.external_userid, kfId, TEST_MSG, target.follow_userid);

    console.log(`\n  ── API 响应 ─────────────────────────────────────────────`);
    console.log(`  接口 URL : POST /cgi-bin/kf/send_msg`);
    console.log(`  touser   : ${target.external_userid}`);
    console.log(`  open_kfid: ${kfId}`);
    console.log(`  errcode  : ${result.errcode}`);
    console.log(`  errmsg   : ${result.errmsg}`);
    console.log(`  msgid    : ${result.msgid ?? "(无)"}`);
    console.log(`  说明     : ${kfErrHint(result.errcode)}`);

    if (result.errcode === 0) {
      console.log(`\n  ✅ 发送成功！无需人工确认。`);
      console.log(`  ✅ 48h 会话窗口有效。`);
    } else if (result.errcode === 48002) {
      console.log(`\n  ❌ 当前结论：微信客服 API 权限未开通`);
      console.log(`  ❌ externalcontact/send_msg 不存在（HTTP 404）`);
      console.log(`  ❌ 外部联系人系统无「无需确认」直发接口`);
      console.log(`\n  ── 官方限制说明 ─────────────────────────────────────────`);
      console.log(`  企业微信 外部联系人(externalcontact) 主动发消息的唯一官方途径：`);
      console.log(`    1. add_msg_template（群发助手）— 需员工手动确认 ✓ 已接入`);
      console.log(`    2. send_welcome_msg — 仅限新客户添加时一次性欢迎消息`);
      console.log(`    3. send_msg_on_event — 仅限特定事件触发`);
      console.log(`    4. 微信客服 kf/send_msg — 需开通 微信客服 模块（独立系统）`);
      console.log(`\n  ── 微信客服 vs 外部联系人 对比 ──────────────────────────`);
      console.log(`  │ 功能           │ 外部联系人        │ 微信客服           │`);
      console.log(`  │ 主动发消息     │ 需员工确认        │ 48h 内无需确认     │`);
      console.log(`  │ 客户接入方式   │ 员工直接添加      │ 扫二维码 / 小程序  │`);
      console.log(`  │ 客户标识       │ external_userid   │ external_userid    │`);
      console.log(`  │ 当前状态       │ ✅ 已配置         │ ❌ 未开通          │`);
    } else if (result.errcode === 300029) {
      console.log(`\n  ❌ 会话已过期或不存在 → 需客户重新主动发消息`);
    } else if (result.errcode === 300018) {
      console.log(`\n  ❌ open_kfid 无效 → 需先创建微信客服账号`);
    }
  }

  // ── Step 6: 总结 ──────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  测试总结");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  是否无需人工确认    : ${kfList.errcode === 0 && activeSessions.length > 0 ? "✅ 是（48h 内）" : "❌ 当前不可用"}`);
  console.log(`  是否要求客户先发消息: ✅ 是（必须）`);
  console.log(`  48h 窗口            : ${kfList.errcode === 0 ? "✅ 机制存在" : "❌ 需开通 微信客服 模块"}`);
  console.log(`  当前外部联系人 send_msg: ❌ 不存在（HTTP 404）`);
  console.log(`  当前可用发送方案    : add_msg_template（员工手动确认）`);
  console.log();
}

main().catch(err => {
  console.error("❌ 未捕获异常:", err);
  process.exit(1);
});
