#!/usr/bin/env npx tsx
/**
 * 企业微信「客户联系」一对一私信群发测试（v11.6）
 *
 * 全自动：gettoken → get_follow_user_list → externalcontact/list
 *        → 打印客户昵称 → 取第一个客户发测试私信
 *
 * 必须环境变量：
 *   WECOM_CORP_ID             企业ID
 *   WECOM_CUSTOMER_SECRET     「客户联系」应用 Secret
 */

import "dotenv/config";

const BASE = "https://qyapi.weixin.qq.com";

interface TokenResp   { errcode?: number; errmsg?: string; access_token?: string; expires_in?: number; }
interface FollowResp  { errcode: number; errmsg: string; follow_user?: string[]; }
interface ListResp    { errcode: number; errmsg: string; external_userid?: string[]; next_cursor?: string; }
interface Contact     { external_userid: string; name: string; type: number; }
interface GetResp     { errcode: number; errmsg: string; external_contact?: Contact; }
interface MsgResp     { errcode: number; errmsg: string; msgid?: string; fail_list?: string[]; invalid_external_userid?: string[]; }

async function wecomGet<T extends { errcode: number; errmsg: string }>(
  path: string, token: string, params: Record<string, string> = {}
): Promise<T> {
  const qs = new URLSearchParams({ access_token: token, ...params }).toString();
  const res = await fetch(`${BASE}${path}?${qs}`);
  const data = await res.json() as T;
  if (data.errcode !== 0) throw new Error(`${path} errcode=${data.errcode} ${data.errmsg}`);
  return data;
}

async function main() {
  const corpId = process.env.WECOM_CORP_ID ?? "";
  const secret = process.env.WECOM_CUSTOMER_SECRET ?? "";

  if (!corpId || !secret) {
    console.error("❌ 缺少 WECOM_CORP_ID 或 WECOM_CUSTOMER_SECRET");
    process.exit(1);
  }
  console.log(`corpId  = ${corpId}`);
  console.log(`secret  = ${secret.slice(0, 8)}…\n`);

  // ── Step 1: gettoken ──────────────────────────────────────────────────────
  console.log("── Step 1: gettoken ─────────────────────────────────────────");
  const tokenRes = await fetch(
    `${BASE}/cgi-bin/gettoken?corpid=${encodeURIComponent(corpId)}&corpsecret=${encodeURIComponent(secret)}`
  );
  const tokenData = await tokenRes.json() as TokenResp;
  console.log("响应:", JSON.stringify(tokenData));

  if (tokenData.errcode !== 0 || !tokenData.access_token) {
    console.error(`❌ gettoken 失败 errcode=${tokenData.errcode} ${tokenData.errmsg}`);
    if (tokenData.errcode === 40013) console.error("  → WECOM_CORP_ID 错误");
    if (tokenData.errcode === 40001) console.error("  → Secret 错误或无效");
    process.exit(1);
  }
  const token = tokenData.access_token;
  console.log(`✅ token = ${token.slice(0, 20)}… (expires ${tokenData.expires_in}s)\n`);

  // ── Step 2: get_follow_user_list ──────────────────────────────────────────
  console.log("── Step 2: get_follow_user_list ─────────────────────────────");
  const followData = await wecomGet<FollowResp>("/cgi-bin/externalcontact/get_follow_user_list", token);
  const followUsers = followData.follow_user ?? [];
  console.log(`✅ 员工列表: ${JSON.stringify(followUsers)}`);

  if (followUsers.length === 0) {
    console.error("❌ 没有员工配置了客户联系，请在企业微信中确认权限。");
    process.exit(1);
  }
  const staffId = followUsers[0];
  console.log(`   → 使用: ${staffId}\n`);

  // ── Step 3: externalcontact/list（分页）──────────────────────────────────
  console.log("── Step 3: externalcontact/list ─────────────────────────────");
  const allIds: string[] = [];
  let cursor = "";
  do {
    const params: Record<string, string> = { userid: staffId };
    if (cursor) params.cursor = cursor;
    const listData = await wecomGet<ListResp>("/cgi-bin/externalcontact/list", token, params);
    const ids = listData.external_userid ?? [];
    allIds.push(...ids);
    cursor = listData.next_cursor ?? "";
    console.log(`   本页 ${ids.length} 个，cursor=${cursor || "结束"}`);
  } while (cursor);

  console.log(`✅ 共 ${allIds.length} 个客户\n`);
  if (allIds.length === 0) {
    console.error("❌ 该员工暂无客户，无法测试。");
    process.exit(1);
  }

  // ── Step 4: 打印客户昵称 ──────────────────────────────────────────────────
  console.log("── Step 4: 客户昵称列表 ─────────────────────────────────────");
  const printN = Math.min(allIds.length, 20);
  for (let i = 0; i < printN; i++) {
    const eid = allIds[i];
    try {
      const d = await wecomGet<GetResp>("/cgi-bin/externalcontact/get", token, { external_userid: eid });
      const c = d.external_contact!;
      console.log(`  [${i + 1}] name="${c.name}"  type=${c.type === 1 ? "微信" : "企微"}  id=${c.external_userid}`);
    } catch (e) {
      console.log(`  [${i + 1}] id=${eid}  (详情获取失败: ${e})`);
    }
  }
  if (allIds.length > 20) console.log(`  … 共 ${allIds.length} 个，仅显示前 20`);

  // ── Step 5: add_msg_template ──────────────────────────────────────────────
  const targetId = allIds[0];
  console.log(`\n── Step 5: add_msg_template → ${targetId} ────────────────────`);

  const body = {
    chat_type: "single",
    external_userid: [targetId],
    sender: staffId,
    text: { content: "🤖 TOHOSHOU AI 私信测试" },
  };
  console.log("请求 body:", JSON.stringify(body, null, 2));

  const msgRes = await fetch(
    `${BASE}/cgi-bin/externalcontact/add_msg_template?access_token=${token}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );
  const msgData = await msgRes.json() as MsgResp;

  console.log("\n── 完整响应 ─────────────────────────────────────────────────");
  console.log(JSON.stringify(msgData, null, 2));
  console.log(`\nerrcode                 = ${msgData.errcode}`);
  console.log(`errmsg                  = ${msgData.errmsg}`);
  console.log(`msgid                   = ${msgData.msgid ?? "(无)"}`);
  console.log(`fail_list               = ${JSON.stringify(msgData.fail_list ?? [])}`);
  console.log(`invalid_external_userid = ${JSON.stringify(msgData.invalid_external_userid ?? [])}`);

  const hints: Record<number, string> = {
    40001: "Secret 错误，必须用「客户联系」应用 Secret",
    40014: "access_token 无效",
    60011: "该应用无「客户联系」API 权限，需在权限配置里添加应用",
    40058: "external_userid 格式错误",
    41048: "external_userid 不属于本企业客户",
    43009: "企业未开通客户联系功能",
    40096: "sender 不是有效员工",
    41011: "sender 必填",
    40003: "external_userid 无效",
  };

  if (msgData.errcode === 0) {
    console.log("\n✅ 群发任务创建成功！成员在企业微信客户端确认后消息发出。");
  } else {
    console.error(`\n❌ 失败 errcode=${msgData.errcode}: ${msgData.errmsg}`);
    if (hints[msgData.errcode]) console.error(`   提示：${hints[msgData.errcode]}`);
  }
}

main().catch(err => {
  console.error("❌ 未捕获异常:", err);
  process.exit(1);
});
