/**
 * 企业微信 微信客服 (KF) 消息通道（v11.7）
 *
 * 无需人工确认的私信通道：
 *   客户主动消息 → 开启 48h 会话窗口 → POST /cgi-bin/kf/send_msg 直接回复
 *
 * ⚠️ 与 外部联系人(externalcontact) 的区别：
 *   - 外部联系人 add_msg_template：需员工在企业微信 App 手动确认
 *   - 微信客服 kf/send_msg：客户先主动发消息后 48h 内无需确认
 *
 * 前置条件（需管理员在企业微信后台完成）：
 *   1. 企业微信后台 → 微信客服 → 创建客服账号 → 获取 open_kfid
 *   2. 客户联系 应用 → 开启「微信客服」API 权限（或创建独立应用）
 *   3. 设置 KF 消息回调 URL → 接收客户消息 → 获取会话 token
 *
 * 环境变量：
 *   WECOM_CORP_ID           企业 ID
 *   WECOM_CUSTOMER_SECRET   客户联系应用 Secret（需有 KF 权限）
 *   WECOM_KF_ID             微信客服账号 open_kfid（wk 开头）
 */

const BASE = "https://qyapi.weixin.qq.com";

export interface KfAccount {
  open_kfid: string;
  name: string;
  avatar: string;
  type: number;         // 1=内部员工 2=外部联系人
}

export interface KfMsg {
  msgid: string;
  open_kfid: string;
  external_userid: string;  // 客户的 external_userid（与 外部联系人 相同）
  send_time: number;        // UNIX 时间戳
  origin: number;           // 3=客户主动消息
  msgtype: string;
  text?: { content: string };
}

export interface KfSendResult {
  errcode: number;
  errmsg: string;
  msgid?: string;
}

export interface KfListResult {
  errcode: number;
  errmsg: string;
  account_list: KfAccount[];
}

export interface KfSyncResult {
  errcode: number;
  errmsg: string;
  next_cursor?: string;
  has_more?: number;
  msg_list?: KfMsg[];
}

/** 获取 access_token（复用 WECOM_CORP_ID + WECOM_CUSTOMER_SECRET） */
export async function getWecomToken(): Promise<string> {
  const corpId = process.env.WECOM_CORP_ID ?? "";
  const secret = process.env.WECOM_CUSTOMER_SECRET ?? "";
  if (!corpId || !secret) throw new Error("缺少 WECOM_CORP_ID 或 WECOM_CUSTOMER_SECRET");

  const r = await fetch(`${BASE}/cgi-bin/gettoken?corpid=${encodeURIComponent(corpId)}&corpsecret=${encodeURIComponent(secret)}`);
  const d = await r.json() as { errcode?: number; errmsg?: string; access_token?: string };
  if (d.errcode !== 0 || !d.access_token) throw new Error(`gettoken errcode=${d.errcode} ${d.errmsg}`);
  return d.access_token;
}

/** 列出企业微信客服账号（需 KF API 权限） */
export async function listKfAccounts(token: string): Promise<KfListResult> {
  const r = await fetch(`${BASE}/cgi-bin/kf/account/list?access_token=${token}`);
  return r.json() as Promise<KfListResult>;
}

/** 拉取最近客户发送的 KF 消息（获取活跃会话） */
export async function syncKfMessages(token: string, openKfid: string, cursor = ""): Promise<KfSyncResult> {
  const r = await fetch(`${BASE}/cgi-bin/kf/sync_msg?access_token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ open_kfid: openKfid, cursor, limit: 100 }),
  });
  return r.json() as Promise<KfSyncResult>;
}

/**
 * 在 48h 会话窗口内向客户发送消息（无需人工确认）
 *
 * @param token        access_token
 * @param touser       客户的 external_userid（从 kf/sync_msg 获取）
 * @param openKfid     微信客服账号 ID（wk 开头）
 * @param content      消息文本
 * @param servicerUid  客服员工 userid（可选，不填则系统默认分配）
 */
export async function sendKfMsg(
  token: string,
  touser: string,
  openKfid: string,
  content: string,
  servicerUid?: string
): Promise<KfSendResult> {
  const body: Record<string, unknown> = {
    touser,
    open_kfid: openKfid,
    msgtype: "text",
    text: { content },
  };
  if (servicerUid) body.servicer_userid = servicerUid;

  const r = await fetch(`${BASE}/cgi-bin/kf/send_msg?access_token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json() as Promise<KfSendResult>;
}

/** errcode → 人类可读说明 */
export function kfErrHint(errcode: number): string {
  const hints: Record<number, string> = {
    0:      "成功",
    48002:  "API 未授权 → 需在企业微信后台「微信客服」页面为应用开启 API 权限",
    300018: "无效 open_kfid → 客服账号 ID 不存在或未创建",
    300029: "会话不存在或已过 48h → 需客户重新主动发消息",
    300020: "无效 external_userid → 用户不在此企业的外部联系人列表",
    40014:  "access_token 无效",
    40001:  "Secret 错误",
  };
  return hints[errcode] ?? `未知错误（errcode=${errcode}）`;
}
