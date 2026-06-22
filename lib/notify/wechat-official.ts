/**
 * 微信服务号模板消息推送
 * 文档：https://developers.weixin.qq.com/doc/offiaccount/Message_Management/Template_Message_Interface.html
 *
 * 环境变量（全部必填）：
 *   WECHAT_OFFICIAL_APP_ID                  服务号 AppID
 *   WECHAT_OFFICIAL_APP_SECRET              服务号 AppSecret
 *   WECHAT_OFFICIAL_TEMPLATE_ID_STOCK_ALERT 模板消息 ID
 *   WECHAT_OFFICIAL_TOUSER_OPENID           接收者在该服务号下的 openid
 *
 * ⚠️ 普通微信号不能直接推送 — 必须是已关注该服务号的用户的 openid。
 *    小程序 openid ≠ 服务号 openid（除非通过开放平台 unionid 关联）。
 */

const API_BASE = "https://api.weixin.qq.com/cgi-bin";

// ─── Access Token 内存缓存 ────────────────────────────────────────────────────
// 微信 access_token 有效期 7200s；提前 60s 刷新
let _token: string | null = null;
let _tokenExpiry = 0;

async function getAccessToken(): Promise<string> {
  if (_token && Date.now() < _tokenExpiry) return _token;

  const appId     = process.env.WECHAT_OFFICIAL_APP_ID!;
  const appSecret = process.env.WECHAT_OFFICIAL_APP_SECRET!;
  const url       = `${API_BASE}/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`;

  const res  = await fetch(url);
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?:   number;
    errcode?:      number;
    errmsg?:       string;
  };

  if (!data.access_token) {
    throw new Error(`[wechat-official] access_token 获取失败: errcode=${data.errcode} ${data.errmsg}`);
  }

  _token       = data.access_token;
  _tokenExpiry = Date.now() + (data.expires_in ?? 7200) * 1000 - 60_000;
  return _token;
}

// ─── 模板消息数据结构 ─────────────────────────────────────────────────────────
/**
 * 通用自选股风险提醒模板字段。
 * 对应模板（建议在微信公众平台申请如下格式）：
 *
 *   {{first.DATA}}
 *   股票：{{keyword1.DATA}}
 *   风险类型：{{keyword2.DATA}}
 *   当前价格：{{keyword3.DATA}}
 *   检测日期：{{keyword4.DATA}}
 *   {{remark.DATA}}
 */
export interface StockAlertPayload {
  stockName:  string;   // "丰田汽车 (7203.T)"
  alertTypes: string;   // "⚠️ RSI过热 | ⛔ 跌破MA20"
  price:      string;   // "¥2,845  +1.23%"
  date:       string;   // "2026-06-22"
  detail:     string;   // 详细说明 + 链接（remark 字段，≤200字符）
  url?:       string;   // 点击消息跳转 URL（可选）
}

export interface SendResult {
  ok:       boolean;
  msgid?:   number;
  errcode?: number;
  errmsg?:  string;
}

/** 发送单条股票提醒（每只股票独立一条消息）*/
export async function sendStockAlert(payload: StockAlertPayload): Promise<SendResult> {
  const token      = await getAccessToken();
  const touser     = process.env.WECHAT_OFFICIAL_TOUSER_OPENID!;
  const templateId = process.env.WECHAT_OFFICIAL_TEMPLATE_ID_STOCK_ALERT!;

  const body = {
    touser,
    template_id: templateId,
    url:         payload.url ?? "",
    topcolor:    "#1A4329",
    data: {
      first:    { value: "【TOHOSHOU AI】自选股风险提醒", color: "#1A4329" },
      keyword1: { value: payload.stockName,  color: "#111111" },
      keyword2: { value: payload.alertTypes, color: "#C62828" },
      keyword3: { value: payload.price,      color: "#111111" },
      keyword4: { value: payload.date,       color: "#888888" },
      remark:   { value: payload.detail,     color: "#666666" },
    },
  };

  const res    = await fetch(`${API_BASE}/message/template/send?access_token=${token}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body:    JSON.stringify(body),
  });
  const result = (await res.json()) as { errcode: number; errmsg: string; msgid?: number };

  if (result.errcode !== 0) {
    return { ok: false, errcode: result.errcode, errmsg: result.errmsg };
  }
  return { ok: true, msgid: result.msgid };
}

/** 检查所有必填环境变量是否已配置 */
export function isConfigured(): boolean {
  return !!(
    process.env.WECHAT_OFFICIAL_APP_ID &&
    process.env.WECHAT_OFFICIAL_APP_SECRET &&
    process.env.WECHAT_OFFICIAL_TEMPLATE_ID_STOCK_ALERT &&
    process.env.WECHAT_OFFICIAL_TOUSER_OPENID
  );
}

/** 返回当前配置状态摘要（调试用）*/
export function configStatus(): string {
  const vars = [
    "WECHAT_OFFICIAL_APP_ID",
    "WECHAT_OFFICIAL_APP_SECRET",
    "WECHAT_OFFICIAL_TEMPLATE_ID_STOCK_ALERT",
    "WECHAT_OFFICIAL_TOUSER_OPENID",
  ];
  return vars
    .map((v) => `  ${process.env[v] ? "✓" : "✗"} ${v}`)
    .join("\n");
}
