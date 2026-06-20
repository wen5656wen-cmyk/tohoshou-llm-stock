/**
 * 企业微信群机器人推送
 * 文档：https://developer.work.weixin.qq.com/document/path/91770
 * 环境变量：WECHAT_WORK_WEBHOOK_URL
 */

import { appendFileSync } from "fs";
import { join } from "path";

const LOG_FILE = join(process.cwd(), "logs", "wechat-push.log");

function writeLog(level: "INFO" | "ERROR", msg: string, extra?: string) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] ${msg}${extra ? " | " + extra : ""}\n`;
  try {
    appendFileSync(LOG_FILE, line, "utf-8");
  } catch {
    // ignore log write errors
  }
  if (level === "ERROR") {
    console.error(line.trim());
  } else {
    console.log(line.trim());
  }
}

async function postToWebhook(
  payload: object,
  attempt = 1
): Promise<{ ok: boolean; errcode?: number; errmsg?: string }> {
  const url = process.env.WECHAT_WORK_WEBHOOK_URL;
  if (!url) {
    throw new Error("WECHAT_WORK_WEBHOOK_URL 环境变量未设置");
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = (await res.json()) as { errcode: number; errmsg: string };
    if (data.errcode !== 0) {
      throw new Error(`微信API错误 errcode=${data.errcode} errmsg=${data.errmsg}`);
    }

    writeLog("INFO", `推送成功 (第${attempt}次)`, `errcode=0`);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    writeLog("ERROR", `推送失败 (第${attempt}次/${3}次重试)`, msg);

    if (attempt < 3) {
      // 指数退避：1s → 2s → 4s
      await new Promise((r) => setTimeout(r, 1000 * attempt));
      return postToWebhook(payload, attempt + 1);
    }

    return { ok: false, errmsg: msg };
  }
}

/**
 * 发送文本消息
 */
export async function sendText(
  content: string,
  mentionedList?: string[]
): Promise<{ ok: boolean; errmsg?: string }> {
  writeLog("INFO", "发送文本消息", content.slice(0, 80));
  const payload: Record<string, unknown> = {
    msgtype: "text",
    text: {
      content,
      ...(mentionedList ? { mentioned_list: mentionedList } : {}),
    },
  };
  return postToWebhook(payload);
}

/**
 * 发送 Markdown 消息（企业微信群机器人支持的 Markdown 子集）
 */
export async function sendMarkdown(
  content: string
): Promise<{ ok: boolean; errmsg?: string }> {
  writeLog("INFO", "发送 Markdown 消息", content.slice(0, 80));
  const payload = {
    msgtype: "markdown",
    markdown: { content },
  };
  return postToWebhook(payload);
}

/**
 * 验证 Webhook 是否已配置
 */
export function isWebhookConfigured(): boolean {
  return !!process.env.WECHAT_WORK_WEBHOOK_URL;
}
