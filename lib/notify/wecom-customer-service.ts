/**
 * 企业微信 VIP 客户私信服务（v12.1 — 最终架构）
 *
 * 唯一发送通道：add_msg_template（需员工在企业微信 App 手动确认）
 * VIP 白名单：温老头 / 深山老林（仅允许这两位）
 *
 * 环境变量：
 *   WECOM_CORP_ID           企业 ID
 *   WECOM_CUSTOMER_SECRET   客户联系应用 Secret
 */

const BASE = "https://qyapi.weixin.qq.com";

export const VIP_NAMES = ["温老头", "深山老林"];
const SENDER_UID = "WenZhiYong";

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

// ── VIP 客户查询 ──────────────────────────────────────────────────────────────

export interface VipContact {
  external_userid: string;
  name: string;
}

/**
 * 动态查询所有客户，筛选白名单 VIP。
 * 每次调用约耗时 2-5s（4 个客户 × API 调用）。
 */
export async function findVipContacts(token: string): Promise<VipContact[]> {
  // 获取跟进员工列表
  const fr = await fetch(`${BASE}/cgi-bin/externalcontact/get_follow_user_list?access_token=${token}`);
  const fd = await fr.json() as { errcode: number; follow_user?: string[] };
  if (fd.errcode !== 0) throw new Error(`get_follow_user_list errcode=${fd.errcode}`);

  const results: VipContact[] = [];
  const seen = new Set<string>();

  for (const userId of fd.follow_user ?? []) {
    let cursor = "";
    do {
      const params = new URLSearchParams({ access_token: token, userid: userId });
      if (cursor) params.set("cursor", cursor);
      const lr = await fetch(`${BASE}/cgi-bin/externalcontact/list?${params}`);
      const ld = await lr.json() as { errcode: number; external_userid?: string[]; next_cursor?: string };
      if (ld.errcode !== 0) break;

      for (const eid of ld.external_userid ?? []) {
        if (seen.has(eid)) continue;
        seen.add(eid);
        const gr = await fetch(`${BASE}/cgi-bin/externalcontact/get?access_token=${token}&external_userid=${eid}`);
        const gd = await gr.json() as { errcode: number; external_contact?: { external_userid: string; name: string } };
        if (gd.errcode === 0 && gd.external_contact) {
          const { name, external_userid } = gd.external_contact;
          if (VIP_NAMES.includes(name)) {
            results.push({ external_userid, name });
          }
        }
      }
      cursor = ld.next_cursor ?? "";
    } while (cursor);
  }

  return results;
}

// ── add_msg_template ──────────────────────────────────────────────────────────

export interface SendResult {
  errcode: number;
  errmsg: string;
  msgid?: string;
  vipCount: number;
  vipNames: string[];
}

/**
 * 向 VIP 白名单客户发送 add_msg_template。
 * 员工在企业微信 App 确认后消息发出。
 *
 * @param content  消息正文（纯文本）
 * @param token    可选，不传则自动获取
 */
export async function sendToVipCustomers(
  content: string,
  token?: string,
): Promise<SendResult> {
  const tk = token ?? await getWecomToken();
  const vips = await findVipContacts(tk);

  if (vips.length === 0) {
    console.log("[wecom-vip] 未找到 VIP 客户，跳过");
    return { errcode: -1, errmsg: "no vip contacts found", vipCount: 0, vipNames: [] };
  }

  const externalIds = vips.map(v => v.external_userid);
  const names = vips.map(v => v.name);
  console.log(`[wecom-vip] 发送对象: ${names.join(", ")} (${externalIds.length} 人)`);

  const r = await fetch(
    `${BASE}/cgi-bin/externalcontact/add_msg_template?access_token=${tk}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_type: "single",
        external_userid: externalIds,
        sender: SENDER_UID,
        text: { content },
      }),
    }
  );
  const d = await r.json() as { errcode: number; errmsg: string; msgid?: string };

  if (d.errcode === 0) {
    console.log(`[wecom-vip] ✅ 任务创建成功 msgid=${d.msgid} — 请在企业微信 App 确认发送`);
  } else {
    console.error(`[wecom-vip] ❌ errcode=${d.errcode} ${d.errmsg}`);
  }

  return { ...d, vipCount: vips.length, vipNames: names };
}
