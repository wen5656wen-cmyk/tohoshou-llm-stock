#!/usr/bin/env npx tsx
/**
 * 企业微信「客户联系」一对一私信群发测试（v11.6）
 *
 * 全自动流程：
 *   1. gettoken
 *   2. get_follow_user_list  → 拿到配置了客户联系的员工 userid 列表
 *   3. externalcontact/list  → 拿到第一个员工的全部客户 external_userid
 *   4. externalcontact/get   → 打印每位客户昵称 + external_userid
 *   5. add_msg_template       → 用第一个客户发送测试私信
 *
 * 必须环境变量：
 *   WECOM_CORP_ID             企业ID（CorpID）
 *   WECOM_CUSTOMER_SECRET     「客户联系」Secret（非自建应用 Secret）
 *
 * 运行：
 *   npx tsx scripts/send-wecom-private-test.ts
 */

import "dotenv/config";

const BASE = "https://qyapi.weixin.qq.com";

// ── 类型定义 ──────────────────────────────────────────────────────────────────

interface TokenResp {
  errcode?: number;
  errmsg?: string;
  access_token?: string;
  expires_in?: number;
}

interface FollowUserResp {
  errcode: number;
  errmsg: string;
  follow_user?: string[];
}

interface ExtListResp {
  errcode: number;
  errmsg: string;
  external_userid?: string[];
  next_cursor?: string;
}

interface ExtContact {
  external_userid: string;
  name: string;
  type: number;       // 1=微信用户 2=企业微信用户
  gender?: number;
  avatar?: string;
  unionid?: string;
}

interface ExtGetResp {
  errcode: number;
  errmsg: string;
  external_contact?: ExtContact;
  follow_user?: unknown[];
}

interface MsgTemplateResp {
  errcode: number;
  errmsg: string;
  msgid?: string;
  fail_list?: string[];
  invalid_external_userid?: string[];
}

// ── 工具：带错误检测的 API 调用 ────────────────────────────────────────────────

async function wecomGet<T extends { errcode: number; errmsg: string }>(
  path: string,
  token: string,
  params: Record<string, string> = {}
): Promise<T> {
  const qs = new URLSearchParams({ access_token: token, ...params }).toString();
  const res = await fetch(`${BASE}${path}?${qs}`);
  const data = await res.json() as T;
  if (data.errcode !== 0) {
    throw new Error(`${path} 失败 errcode=${data.errcode} errmsg=${data.errmsg}`);
  }
  return data;
}

// ── 1. 读取环境变量 ───────────────────────────────────────────────────────────

const corpId = process.env.WECOM_CORP_ID ?? "";
const secret = process.env.WECOM_CUSTOMER_SECRET ?? "";

if (!corpId || !secret) {
  console.error("❌ 缺少环境变量，请在 .env 中配置：");
  console.error("   WECOM_CORP_ID=<企业ID>");
  console.error("   WECOM_CUSTOMER_SECRET=<客户联系Secret>");
  process.exit(1);
}

console.log(`corpId        = ${corpId}`);
console.log(`secret_prefix = ${secret.slice(0, 8)}…\n`);

// ── 2. 获取 access_token ─────────────────────────────────────────────────────

console.log("── Step 1: gettoken ─────────────────────────────────────────");
const tokenRes = await fetch(
  `${BASE}/cgi-bin/gettoken?corpid=${encodeURIComponent(corpId)}&corpsecret=${encodeURIComponent(secret)}`
);
const tokenData = await tokenRes.json() as TokenResp;

if (tokenData.errcode !== 0 || !tokenData.access_token) {
  console.error("❌ gettoken 失败:", JSON.stringify(tokenData, null, 2));
  console.error("\n提示：");
  console.error("  errcode=40013 → WECOM_CORP_ID 错误");
  console.error("  errcode=40001 → WECOM_CUSTOMER_SECRET 错误，或不是「客户联系」Secret");
  process.exit(1);
}

const token = tokenData.access_token;
console.log(`✅ access_token = ${token.slice(0, 20)}… (expires_in=${tokenData.expires_in}s)\n`);

// ── 3. 获取配置了客户联系的员工列表 ─────────────────────────────────────────

console.log("── Step 2: get_follow_user_list ─────────────────────────────");
const followData = await wecomGet<FollowUserResp>(
  "/cgi-bin/externalcontact/get_follow_user_list", token
);

const followUsers = followData.follow_user ?? [];
console.log(`✅ 配置客户联系的员工: ${JSON.stringify(followUsers)}`);

if (followUsers.length === 0) {
  console.error("❌ 没有找到任何员工，请确认该应用的「客户联系」权限已开通，且有员工使用客户联系功能。");
  process.exit(1);
}

const staffUserId = followUsers[0];
console.log(`   → 使用第一个员工: ${staffUserId}\n`);

// ── 4. 获取该员工的全部客户 external_userid（分页拉取）──────────────────────

console.log("── Step 3: externalcontact/list ─────────────────────────────");
const allExternalIds: string[] = [];
let cursor = "";

do {
  const params: Record<string, string> = { userid: staffUserId };
  if (cursor) params.cursor = cursor;

  const listData = await wecomGet<ExtListResp>(
    "/cgi-bin/externalcontact/list", token, params
  );

  const ids = listData.external_userid ?? [];
  allExternalIds.push(...ids);
  cursor = listData.next_cursor ?? "";

  console.log(`   本页 ${ids.length} 个客户，cursor=${cursor || "(结束)"}`);
} while (cursor);

console.log(`✅ 共 ${allExternalIds.length} 个客户 external_userid\n`);

if (allExternalIds.length === 0) {
  console.error("❌ 该员工没有任何客户，请换一个有客户的员工或确认客户联系数据。");
  process.exit(1);
}

// ── 5. 获取每位客户昵称并打印（最多打印前 20 个）────────────────────────────

console.log("── Step 4: 打印客户昵称 ─────────────────────────────────────");
const printCount = Math.min(allExternalIds.length, 20);

for (let i = 0; i < printCount; i++) {
  const eid = allExternalIds[i];
  try {
    const detail = await wecomGet<ExtGetResp>(
      "/cgi-bin/externalcontact/get", token, { external_userid: eid }
    );
    const c = detail.external_contact!;
    console.log(`  [${i + 1}] name="${c.name}"  external_userid=${c.external_userid}  type=${c.type === 1 ? "微信用户" : "企业微信用户"}`);
  } catch {
    console.log(`  [${i + 1}] external_userid=${eid}  (获取详情失败)`);
  }
}

if (allExternalIds.length > 20) {
  console.log(`  … 共 ${allExternalIds.length} 个，仅显示前 20 个`);
}

// ── 6. 用第一个客户发送测试私信 ──────────────────────────────────────────────

const targetId = allExternalIds[0];
console.log(`\n── Step 5: add_msg_template → 目标 ${targetId} ───────────────`);

const msgBody = {
  chat_type: "single",
  external_userid: [targetId],
  sender: staffUserId,
  text: {
    content: "🤖 TOHOSHOU AI 私信测试",
  },
};

console.log("请求 body:", JSON.stringify(msgBody, null, 2));

const msgRes = await fetch(
  `${BASE}/cgi-bin/externalcontact/add_msg_template?access_token=${token}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(msgBody),
  }
);
const msgData = await msgRes.json() as MsgTemplateResp;

console.log("\n── add_msg_template 完整响应 ────────────────────────────────");
console.log(JSON.stringify(msgData, null, 2));
console.log("────────────────────────────────────────────────────────────");

console.log(`\nerrcode                 = ${msgData.errcode}`);
console.log(`errmsg                  = ${msgData.errmsg}`);
console.log(`msgid                   = ${msgData.msgid ?? "(无)"}`);
console.log(`fail_list               = ${JSON.stringify(msgData.fail_list ?? [])}`);
console.log(`invalid_external_userid = ${JSON.stringify(msgData.invalid_external_userid ?? [])}`);

if (msgData.errcode === 0) {
  console.log("\n✅ 群发任务创建成功！成员在企业微信客户端确认后消息将发出。");
  console.log(`   msgid = ${msgData.msgid}`);
} else {
  console.error(`\n❌ add_msg_template 失败 errcode=${msgData.errcode}: ${msgData.errmsg}`);
  const hints: Record<number, string> = {
    40014: "access_token 无效",
    40001: "Secret 错误，必须用「客户联系」Secret",
    60011: "该 Secret 无「客户联系」API 权限",
    40058: "external_userid 格式错误",
    41048: "external_userid 不属于本企业客户",
    43009: "企业未开通客户联系功能",
    40096: "sender 不是有效员工 userid",
    41011: "sender 必填",
  };
  if (hints[msgData.errcode]) {
    console.error(`   提示：${hints[msgData.errcode]}`);
  }
}
