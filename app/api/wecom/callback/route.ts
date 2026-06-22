/**
 * 企业微信智能机器人回调 URL（v11.5）
 *
 * GET  /api/wecom/callback — 企业微信 URL 验证（验签 + 解密 echostr）
 * POST /api/wecom/callback — 消息回调（解密 → 解析 → 调用 wecom-chat → 通过 worker 回复）
 *
 * 所需环境变量：
 *   WECOM_TOKEN       — 企业微信后台填写的 Token
 *   WECOM_AES_KEY     — EncodingAESKey（43 字符 base64）
 *   WECOM_BOT_ID      — 智能机器人 ID（仅记录日志，不强制校验）
 */

import { NextRequest } from "next/server";
import crypto from "crypto";
import { handleWecomQuery } from "@/lib/wecom-chat";
import { sendViaWorker } from "@/lib/notify/wecom-aibot";

// ── AES 工具 ──────────────────────────────────────────────────────────────────

function getAesKey(): Buffer {
  // EncodingAESKey 是 43 位 base64，加 "=" 补位后解码为 32 字节
  return Buffer.from((process.env.WECOM_AES_KEY ?? "") + "=", "base64");
}

/**
 * 解密企业微信 AES-256-CBC 密文
 * 明文结构：16B random | 4B msg_len (big-endian) | msg | receiveid — PKCS7 padding
 */
function decryptMsg(encryptedBase64: string): string {
  const key = getAesKey();
  const iv = key.slice(0, 16);
  const cipherBuf = Buffer.from(encryptedBase64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  decipher.setAutoPadding(false);
  const raw = Buffer.concat([decipher.update(cipherBuf), decipher.final()]);
  // 去除 PKCS7 padding
  const padLen = raw[raw.length - 1];
  const unpadded = raw.slice(0, raw.length - padLen);
  // 解析结构
  const msgLen = unpadded.readUInt32BE(16);
  return unpadded.slice(20, 20 + msgLen).toString("utf8");
}

// ── 签名验证 ──────────────────────────────────────────────────────────────────

function verifySig(
  token: string,
  timestamp: string,
  nonce: string,
  data: string,
  signature: string
): boolean {
  const sorted = [token, timestamp, nonce, data].sort().join("");
  const computed = crypto.createHash("sha1").update(sorted).digest("hex");
  return computed === signature;
}

// ── XML 字段提取（支持 CDATA 和纯文本）────────────────────────────────────────

function xmlField(xml: string, field: string): string {
  const re = new RegExp(
    `<${field}>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))</${field}>`
  );
  const m = xml.match(re);
  return (m?.[1] ?? m?.[2] ?? "").trim();
}

// ── GET — URL 验证 ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<Response> {
  const sp = req.nextUrl.searchParams;
  const msgSig = sp.get("msg_signature") ?? "";
  const timestamp = sp.get("timestamp") ?? "";
  const nonce = sp.get("nonce") ?? "";
  const echostr = sp.get("echostr") ?? "";

  const token = process.env.WECOM_TOKEN ?? "";
  const aesKeySet = !!process.env.WECOM_AES_KEY;

  if (!token || !aesKeySet) {
    console.error("[wecom-callback] GET: WECOM_TOKEN / WECOM_AES_KEY 未配置");
    return new Response("server error", { status: 500 });
  }

  if (!verifySig(token, timestamp, nonce, echostr, msgSig)) {
    console.warn("[wecom-callback] GET: 签名校验失败 — 请确认 WECOM_TOKEN 与企业微信配置一致");
    return new Response("signature mismatch", { status: 403 });
  }

  try {
    const plaintext = decryptMsg(echostr);
    console.log("[wecom-callback] GET: URL 验证成功，echostr 已解密");
    return new Response(plaintext, { status: 200 });
  } catch (err) {
    console.error("[wecom-callback] GET: 解密失败 —", err);
    return new Response("decryption error", { status: 500 });
  }
}

// ── POST — 消息回调 ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<Response> {
  const sp = req.nextUrl.searchParams;
  const msgSig = sp.get("msg_signature") ?? "";
  const timestamp = sp.get("timestamp") ?? "";
  const nonce = sp.get("nonce") ?? "";
  const token = process.env.WECOM_TOKEN ?? "";

  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return ok();
  }

  // 1. 提取加密字段
  const encrypted = xmlField(rawBody, "Encrypt");
  if (!encrypted) {
    console.warn("[wecom-callback] POST: body 中无 Encrypt 字段");
    return ok();
  }

  // 2. 验签（未配置 token 时跳过，开发模式）
  if (token && !verifySig(token, timestamp, nonce, encrypted, msgSig)) {
    console.warn("[wecom-callback] POST: 签名校验失败");
    return ok(); // 返回 200 避免企业微信重试
  }

  // 3. 解密
  let plainXml: string;
  try {
    plainXml = decryptMsg(encrypted);
  } catch (err) {
    console.error("[wecom-callback] POST: 解密失败 —", err);
    return ok();
  }

  console.log("[wecom-callback] POST 解密内容:", plainXml.slice(0, 300));

  // 4. 解析消息字段
  const msgType = xmlField(plainXml, "MsgType");
  const content = xmlField(plainXml, "Content");
  const chatId = xmlField(plainXml, "ChatId");
  const fromUser = xmlField(plainXml, "FromUserName");
  const createTime = xmlField(plainXml, "CreateTime");

  console.log(
    `[wecom-callback] msgType=${msgType} chatId=${chatId || "(无)"} from=${fromUser} createTime=${createTime}`
  );

  // 首次回调时打印 chatId，便于配置 WECOM_AIBOT_CHAT_ID
  if (chatId) {
    console.log(`[wecom-callback] 💡 可配置 WECOM_AIBOT_CHAT_ID=${chatId}`);
  }

  // 5. 处理文本消息 → 调用 AI 问答 → 通过 worker 回复
  if (msgType === "text" && content) {
    // 去除群聊中的 @机器人 前缀
    const query = content.replace(/^@\S+\s*/, "").trim();

    if (query) {
      console.log(`[wecom-callback] 收到查询: "${query}"`);
      try {
        const result = await handleWecomQuery(query);
        console.log(`[wecom-callback] 查询结果: type=${result.type} ok=${result.ok}`);

        if (result.ok && result.text) {
          const replyTarget = chatId || process.env.WECOM_AIBOT_CHAT_ID || "";
          if (replyTarget) {
            const sendRes = await sendViaWorker(result.text, replyTarget);
            if (sendRes.ok) {
              console.log("[wecom-callback] ✅ 回复已发送至", replyTarget);
            } else {
              console.warn("[wecom-callback] ⚠️ 回复失败（worker 未运行？）:", sendRes.errmsg);
            }
          } else {
            console.warn("[wecom-callback] 无 chatId，无法回复（消息内容已记录到日志）");
            console.log("[wecom-callback] 回复内容:", result.text.slice(0, 200));
          }
        }
      } catch (err) {
        console.error("[wecom-callback] 查询/回复异常:", err);
      }
    }
  }

  return ok();
}

function ok(): Response {
  return new Response("", { status: 200 });
}
