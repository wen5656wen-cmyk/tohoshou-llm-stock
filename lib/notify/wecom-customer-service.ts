/**
 * 企业微信 VIP 客户私信服务（v12.2 — 最终架构）
 *
 * 唯一发送通道：add_msg_template（需员工在企业微信 App 手动确认）
 * VIP 白名单：温老头 / 深山老林（仅允许这两位）
 *
 * 环境变量：
 *   WECOM_CORP_ID           企业 ID
 *   WECOM_CUSTOMER_SECRET   客户联系应用 Secret
 *   WECOM_VIP_UIDS          逗号分隔的 VIP external_userid（快速路径，跳过 API 查询）
 */

const BASE = "https://qyapi.weixin.qq.com";

export const VIP_NAMES = ["温老头", "深山老林"];
const SENDER_UID = "WenZhiYong";

// 已确认的 VIP external_userid（避免每次推送都查询 externalcontact API）
const HARDCODED_VIPS: VipContact[] = [
  { external_userid: "wmR_snIgAA-YjrtMl3tsw9uRvuEtkGTA", name: "温老头" },
  { external_userid: "wmR_snIgAASOVTxH1XxRJwXBdyOEVLlg", name: "深山老林" },
];

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
export async function findVipContacts(_token: string): Promise<VipContact[]> {
  // 优先使用 WECOM_VIP_UIDS env（逗号分隔）；不存在则 fallback 到代码内置列表
  const envUids = process.env.WECOM_VIP_UIDS;
  if (envUids) {
    const pairs = envUids.split(",").map(s => s.trim()).filter(Boolean);
    // 格式：uid:name,uid:name
    return pairs.map(p => {
      const [external_userid, name] = p.split(":").map(s => s.trim());
      return { external_userid, name: name ?? "" };
    }).filter(v => VIP_NAMES.includes(v.name));
  }
  return HARDCODED_VIPS;
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
