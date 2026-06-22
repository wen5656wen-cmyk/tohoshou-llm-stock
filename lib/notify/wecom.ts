/**
 * 企业微信群机器人推送（v11.2）
 * 文档：https://developer.work.weixin.qq.com/document/path/91770
 * 环境变量：WECOM_WEBHOOK_URL
 * 区别于 lib/wechat.ts（使用 WECHAT_WORK_WEBHOOK_URL），本模块使用独立 WECOM_WEBHOOK_URL。
 */

const RETRY = 3;

async function post(
  payload: object,
  attempt = 1
): Promise<{ ok: boolean; errmsg?: string }> {
  const url = process.env.WECOM_WEBHOOK_URL;
  if (!url) throw new Error("WECOM_WEBHOOK_URL 未配置");

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { errcode: number; errmsg: string };
    if (data.errcode !== 0)
      throw new Error(`errcode=${data.errcode} errmsg=${data.errmsg}`);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (attempt < RETRY) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
      return post(payload, attempt + 1);
    }
    return { ok: false, errmsg: msg };
  }
}

export async function sendText(
  content: string
): Promise<{ ok: boolean; errmsg?: string }> {
  return post({ msgtype: "text", text: { content } });
}

export async function sendMarkdown(
  content: string
): Promise<{ ok: boolean; errmsg?: string }> {
  return post({ msgtype: "markdown", markdown: { content } });
}

export function isConfigured(): boolean {
  return !!process.env.WECOM_WEBHOOK_URL;
}
