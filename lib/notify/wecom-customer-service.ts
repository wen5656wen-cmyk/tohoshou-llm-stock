/**
 * 企业微信 VIP 客户私信服务（v12.0）
 *
 * 推送双通道：
 *   Channel A: KF send_msg（48h 会话窗口，无需确认）
 *              — 需客户先发消息 + KF 账号配置「智能助手」接待模式
 *   Channel B: add_msg_template（需员工手动确认）— 保底通道
 *
 * 订阅激活：
 *   客户通过 KF 发送"开始接收AI策略" → 检查白名单 → 记录 external_userid
 *
 * 白名单（名称）：温老头 / 深山老林
 *
 * 环境变量：
 *   WECOM_CORP_ID           企业 ID
 *   WECOM_CUSTOMER_SECRET   客户联系应用 Secret
 *   WECOM_KF_ID             微信客服账号 open_kfid（wk 开头）
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const BASE = "https://qyapi.weixin.qq.com";

export const WHITELIST_NAMES = ["温老头", "深山老林"];
export const TRIGGER_PHRASE = "开始接收AI策略";

const SUBSCRIBERS_PATH = join(process.cwd(), "data", "kf-subscribers.json");

// ── Subscriber Storage ────────────────────────────────────────────────────────

export interface Subscriber {
  external_userid: string;
  name: string;
  follow_userid: string;
  activated_at: string;
}

export function loadSubscribers(): Subscriber[] {
  try {
    if (!existsSync(SUBSCRIBERS_PATH)) return [];
    const raw = JSON.parse(readFileSync(SUBSCRIBERS_PATH, "utf-8"));
    return Array.isArray(raw.subscribers) ? raw.subscribers : [];
  } catch { return []; }
}

export function saveSubscribers(list: Subscriber[]): void {
  mkdirSync(join(process.cwd(), "data"), { recursive: true });
  writeFileSync(SUBSCRIBERS_PATH, JSON.stringify({ subscribers: list }, null, 2), "utf-8");
}

export function upsertSubscriber(sub: Subscriber): void {
  const list = loadSubscribers();
  const idx = list.findIndex(s => s.external_userid === sub.external_userid);
  if (idx >= 0) list[idx] = sub; else list.push(sub);
  saveSubscribers(list);
}

// ── Token ─────────────────────────────────────────────────────────────────────

export async function getWecomToken(): Promise<string> {
  const corpId = process.env.WECOM_CORP_ID ?? "";
  const secret = process.env.WECOM_CUSTOMER_SECRET ?? "";
  if (!corpId || !secret) throw new Error("缺少 WECOM_CORP_ID 或 WECOM_CUSTOMER_SECRET");
  const r = await fetch(
    `${BASE}/cgi-bin/gettoken?corpid=${encodeURIComponent(corpId)}&corpsecret=${encodeURIComponent(secret)}`
  );
  const d = await r.json() as { errcode?: number; errmsg?: string; access_token?: string };
  if (d.errcode !== 0 || !d.access_token) throw new Error(`gettoken errcode=${d.errcode} ${d.errmsg}`);
  return d.access_token;
}

// ── WeChat Work API Helpers ───────────────────────────────────────────────────

async function apiPost<T>(token: string, path: string, body: object): Promise<T> {
  const r = await fetch(`${BASE}${path}?access_token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  try { return JSON.parse(text) as T; } catch { return { _raw: text.slice(0, 300) } as T; }
}

async function apiGet<T>(token: string, path: string, params: Record<string, string> = {}): Promise<T> {
  const qs = new URLSearchParams({ access_token: token, ...params }).toString();
  const r = await fetch(`${BASE}${path}?${qs}`);
  return r.json() as Promise<T>;
}

// ── KF Types & Functions ──────────────────────────────────────────────────────

export interface KfAccount {
  open_kfid: string;
  name: string;
  avatar: string;
  type: number;
}

export interface KfMsg {
  msgid: string;
  open_kfid: string;
  external_userid: string;
  send_time: number;
  origin: number;      // 3 = 客户主动消息
  msgtype: string;
  text?: { content: string };
}

export interface KfListResult   { errcode: number; errmsg: string; account_list: KfAccount[]; }
export interface KfSyncResult   { errcode: number; errmsg: string; next_cursor?: string; has_more?: number; msg_list?: KfMsg[]; }
export interface KfSendResult   { errcode: number; errmsg: string; msgid?: string; }
export interface MsgTplResult   { errcode: number; errmsg: string; msgid?: string; fail_list?: string[]; }
export interface ExternalContact { external_userid: string; name: string; type: number; }
export interface FollowUser      { userid: string; }

export async function listKfAccounts(token: string): Promise<KfListResult> {
  return apiGet<KfListResult>(token, "/cgi-bin/kf/account/list");
}

export async function syncKfMessages(token: string, openKfid: string, cursor = ""): Promise<KfSyncResult> {
  return apiPost<KfSyncResult>(token, "/cgi-bin/kf/sync_msg", { open_kfid: openKfid, cursor, limit: 100 });
}

export async function sendKfMsg(
  token: string,
  touser: string,
  openKfid: string,
  content: string,
): Promise<KfSendResult> {
  return apiPost<KfSendResult>(token, "/cgi-bin/kf/send_msg", {
    touser,
    open_kfid: openKfid,
    msgtype: "text",
    text: { content },
  });
}

// ── add_msg_template ──────────────────────────────────────────────────────────

/** 群发助手（需员工手动确认）— 永远可用的保底通道 */
export async function sendAddMsgTemplate(
  token: string,
  content: string,
  externalUserIds: string[],
  sender: string,
): Promise<MsgTplResult> {
  return apiPost<MsgTplResult>(token, "/cgi-bin/externalcontact/add_msg_template", {
    chat_type: "single",
    external_userid: externalUserIds,
    sender,
    text: { content },
  });
}

// ── VIP Push: KF → add_msg_template fallback ──────────────────────────────────

export interface VipPushDetail {
  name: string;
  external_userid: string;
  channel: "KF" | "add_msg_template" | "error";
  errcode: number;
  errmsg: string;
}

/**
 * 向所有 VIP 订阅者推送消息。
 * Channel A: KF send_msg（无需确认，但需客户 48h 内发过消息 + KF 智能助手模式）
 * Channel B: add_msg_template fallback（需员工在企业微信 App 手动确认）
 */
export async function sendToVipSubscribers(
  content: string,
  token?: string,
  openKfId: string = process.env.WECOM_KF_ID ?? "",
): Promise<VipPushDetail[]> {
  const subscribers = loadSubscribers();
  if (subscribers.length === 0) {
    console.log("[vip-push] 无订阅者");
    return [];
  }

  const tk = token ?? await getWecomToken();
  const results: VipPushDetail[] = [];
  const needFallback: Subscriber[] = [];

  // Channel A: KF send_msg（per-subscriber）
  for (const sub of subscribers) {
    if (!openKfId) {
      console.log(`[vip-push] KF 未配置，跳过 ${sub.name}`);
      needFallback.push(sub);
      continue;
    }
    const r = await sendKfMsg(tk, sub.external_userid, openKfId, content);
    if (r.errcode === 0) {
      console.log(`[vip-push] KF ✅ ${sub.name}`);
      results.push({ name: sub.name, external_userid: sub.external_userid, channel: "KF", errcode: 0, errmsg: "ok" });
    } else {
      console.log(`[vip-push] KF ❌ ${sub.name} errcode=${r.errcode} (${kfErrHint(r.errcode)}) → fallback`);
      needFallback.push(sub);
    }
  }

  // Channel B: add_msg_template（批量，有人失败时）
  if (needFallback.length > 0) {
    const ids = needFallback.map(s => s.external_userid);
    const sender = needFallback[0].follow_userid;
    const r = await sendAddMsgTemplate(tk, content, ids, sender);
    for (const sub of needFallback) {
      if (r.errcode === 0) {
        console.log(`[vip-push] add_msg_template ✅ ${sub.name} (需员工确认)`);
        results.push({ name: sub.name, external_userid: sub.external_userid, channel: "add_msg_template", errcode: 0, errmsg: "pending confirmation" });
      } else {
        console.log(`[vip-push] add_msg_template ❌ ${sub.name} errcode=${r.errcode}`);
        results.push({ name: sub.name, external_userid: sub.external_userid, channel: "error", errcode: r.errcode, errmsg: r.errmsg });
      }
    }
  }

  return results;
}

// ── Poll & Activate Subscribers ───────────────────────────────────────────────

/**
 * 轮询 KF 消息队列，检测触发词"开始接收AI策略"。
 * 白名单客户发出后 → 记录 external_userid → 发送欢迎消息。
 */
export async function pollAndActivate(
  token: string,
  openKfId: string = process.env.WECOM_KF_ID ?? "",
): Promise<{ activated: number; rejected: number }> {
  const sync = await syncKfMessages(token, openKfId);
  if (sync.errcode !== 0) {
    console.warn(`[kf-poll] sync_msg errcode=${sync.errcode} ${sync.errmsg}`);
    return { activated: 0, rejected: 0 };
  }

  const triggerMsgs = (sync.msg_list ?? []).filter(
    m => m.origin === 3 && m.text?.content?.trim() === TRIGGER_PHRASE
  );

  let activated = 0;
  let rejected = 0;

  for (const msg of triggerMsgs) {
    // 查询客户名称和跟进员工
    const cd = await apiGet<{
      errcode: number;
      external_contact?: ExternalContact;
      follow_user?: FollowUser[];
    }>(token, "/cgi-bin/externalcontact/get", { external_userid: msg.external_userid });

    const name = cd.external_contact?.name ?? "";
    const follow_userid = cd.follow_user?.[0]?.userid ?? "";

    if (!WHITELIST_NAMES.includes(name)) {
      console.log(`[kf-poll] 拒绝: "${name}" (${msg.external_userid}) 不在白名单`);
      rejected++;
      continue;
    }

    upsertSubscriber({
      external_userid: msg.external_userid,
      name,
      follow_userid,
      activated_at: new Date().toISOString(),
    });

    // 发送欢迎消息
    const welcome = `🤖 TOHOSHOU AI｜订阅激活成功\n\n${name}，您好！\n\n已开启每日 AI 策略推送：\n① 晨间策略（08:00）\n② 盘中更新（11:30）\n③ 收盘复盘（15:30）\n\nTOHOSHOU AI研究院`;
    const kfRes = await sendKfMsg(token, msg.external_userid, openKfId, welcome);
    if (kfRes.errcode !== 0 && follow_userid) {
      await sendAddMsgTemplate(token, welcome, [msg.external_userid], follow_userid);
    }

    console.log(`[kf-poll] ✅ 激活: ${name} (${msg.external_userid})`);
    activated++;
  }

  return { activated, rejected };
}

// ── Error Hints ───────────────────────────────────────────────────────────────

export function kfErrHint(errcode: number): string {
  const hints: Record<number, string> = {
    0:      "成功",
    48002:  "API 未授权 → 需开启「微信客服」API 权限",
    95018:  "会话状态无效（session 处于 state=3 人工接待，需改为智能助手模式）",
    95016:  "不允许该状态转换",
    95013:  "会话已结束",
    300018: "无效 open_kfid",
    300029: "会话不存在或已过 48h",
    40014:  "access_token 无效",
    40001:  "Secret 错误",
  };
  return hints[errcode] ?? `未知错误（errcode=${errcode}）`;
}
