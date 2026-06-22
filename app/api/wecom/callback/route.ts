/**
 * 企业微信回调 URL（v12.0 — bot 已下线）
 *
 * GET  /api/wecom/callback — 企业微信 URL 验证（验签 + 解密 echostr）
 * POST /api/wecom/callback — 消息回调（仅日志，不处理）
 *
 * ⚠️ 关键：URL 参数必须用原始 query string + decodeURIComponent 解析。
 *    URLSearchParams.get() 会把 base64 的 "+" 解码成空格，导致 AES 解密失败。
 *
 * 所需环境变量：
 *   WECOM_TOKEN       — 企业微信后台填写的 Token
 *   WECOM_AES_KEY     — EncodingAESKey（43 字符，不含末尾 "="）
 */

import { NextRequest } from "next/server";
import crypto from "crypto";

// ── 原始 query string 解析 ────────────────────────────────────────────────────
// 不能用 URLSearchParams（它把 "+" 解码成空格，破坏 base64）。
// decodeURIComponent 只解码 %XX，不处理 "+"，保留 base64 正确字符。

function rawParam(req: NextRequest, name: string): string {
  const search = new URL(req.url).search; // 例如 "?msg_signature=xxx&echostr=abc+def"
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const re = new RegExp(`(?:^|&)${name}=([^&]*)`);
  const m = raw.match(re);
  return m ? decodeURIComponent(m[1]) : "";
}

// ── AES 工具 ──────────────────────────────────────────────────────────────────

/**
 * 解密企业微信 AES-256-CBC 密文
 * 结构：16B random | 4B msg_len (big-endian) | msg | receiveid — PKCS7 padded
 * key = base64decode(WECOM_AES_KEY + "=")，iv = key[0:16]
 */
function decryptMsg(encryptedBase64: string): string {
  const aesKeyRaw = process.env.WECOM_AES_KEY ?? "";
  if (aesKeyRaw.length !== 43) {
    throw new Error(`WECOM_AES_KEY 长度 ${aesKeyRaw.length} != 43`);
  }

  const key = Buffer.from(aesKeyRaw + "=", "base64");
  if (key.length !== 32) {
    throw new Error(`AES key 长度 ${key.length} != 32`);
  }

  const iv = key.slice(0, 16);
  const cipherBuf = Buffer.from(encryptedBase64, "base64");
  if (cipherBuf.length === 0) throw new Error("ciphertext 为空（base64 解码失败？）");
  if (cipherBuf.length % 16 !== 0) throw new Error(`ciphertext 长度 ${cipherBuf.length} 不是 16 的倍数`);

  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  decipher.setAutoPadding(false);
  const raw = Buffer.concat([decipher.update(cipherBuf), decipher.final()]);

  // PKCS7 unpadding — 企业微信 PKCS7 block_size=32（非 AES 的 16），padLen 合法范围 1-32
  const padLen = raw[raw.length - 1];
  if (padLen < 1 || padLen > 32) throw new Error(`无效 PKCS7 padding: ${padLen}`);
  const unpadded = raw.slice(0, raw.length - padLen);
  if (unpadded.length < 20) throw new Error(`解密后内容过短: ${unpadded.length}B（key 可能错误）`);

  // 解析结构：16B random + 4B msg_len + msg + receiveid
  const msgLen = unpadded.readUInt32BE(16);
  if (20 + msgLen > unpadded.length) throw new Error(`msgLen ${msgLen} 超出 buffer ${unpadded.length}`);

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
  const re = new RegExp(`<${field}>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))</${field}>`);
  const m = xml.match(re);
  return (m?.[1] ?? m?.[2] ?? "").trim();
}

// ── GET — URL 验证 ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<Response> {
  // 必须用原始 query string 解析，避免 URLSearchParams 把 "+" 解码成空格
  const msgSig = rawParam(req, "msg_signature");
  const timestamp = rawParam(req, "timestamp");
  const nonce = rawParam(req, "nonce");
  const echostr = rawParam(req, "echostr");

  const token = process.env.WECOM_TOKEN ?? "";
  const aesKeyRaw = process.env.WECOM_AES_KEY ?? "";

  console.log(
    `[wecom-callback] GET: sig=${msgSig.slice(0, 8)}… ts=${timestamp} nonce=${nonce} echostr_len=${echostr.length}`
  );

  // 环境变量校验
  if (!token) {
    console.error("[wecom-callback] GET: WECOM_TOKEN 未配置");
    return new Response("server error: WECOM_TOKEN not set", { status: 500 });
  }
  if (!aesKeyRaw) {
    console.error("[wecom-callback] GET: WECOM_AES_KEY 未配置");
    return new Response("server error: WECOM_AES_KEY not set", { status: 500 });
  }
  if (aesKeyRaw.length !== 43) {
    console.error(`[wecom-callback] GET: WECOM_AES_KEY 长度 ${aesKeyRaw.length} 不是 43`);
    return new Response(`server error: WECOM_AES_KEY length ${aesKeyRaw.length} != 43`, { status: 500 });
  }

  // 必要参数
  if (!msgSig || !timestamp || !nonce || !echostr) {
    console.warn("[wecom-callback] GET: 缺少必要参数", { msgSig: !!msgSig, timestamp: !!timestamp, nonce: !!nonce, echostr: !!echostr });
    return new Response("missing params", { status: 400 });
  }

  // 验签
  if (!verifySig(token, timestamp, nonce, echostr, msgSig)) {
    console.warn("[wecom-callback] GET: 签名校验失败");
    return new Response("signature mismatch", { status: 403 });
  }

  // 解密 echostr（失败返回 403，不返回 400）
  try {
    const plaintext = decryptMsg(echostr);
    console.log("[wecom-callback] GET: ✅ URL 验证成功，返回明文 echostr");
    return new Response(plaintext, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[wecom-callback] GET: 解密失败 —", msg);
    return new Response("decryption failed: " + msg, { status: 403 });
  }
}

// ── POST — 消息回调 ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<Response> {
  const msgSig = rawParam(req, "msg_signature");
  const timestamp = rawParam(req, "timestamp");
  const nonce = rawParam(req, "nonce");
  const token = process.env.WECOM_TOKEN ?? "";

  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return ok();
  }

  // 提取加密字段
  const encrypted = xmlField(rawBody, "Encrypt");
  if (!encrypted) {
    console.warn("[wecom-callback] POST: body 中无 Encrypt 字段");
    return ok();
  }

  // 验签（未配置 token 时跳过）
  if (token && !verifySig(token, timestamp, nonce, encrypted, msgSig)) {
    console.warn("[wecom-callback] POST: 签名校验失败");
    return ok(); // 返回 200 避免企业微信重试
  }

  // 解密
  let plainXml: string;
  try {
    plainXml = decryptMsg(encrypted);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[wecom-callback] POST: 解密失败 —", msg);
    return ok();
  }

  console.log("[wecom-callback] POST 解密内容:", plainXml.slice(0, 300));

  // 解析消息字段
  const msgType = xmlField(plainXml, "MsgType");
  const content = xmlField(plainXml, "Content");
  const chatId = xmlField(plainXml, "ChatId");
  const fromUser = xmlField(plainXml, "FromUserName");

  console.log(`[wecom-callback] msgType=${msgType} chatId=${chatId || "(无)"} from=${fromUser}`);
  if (chatId) console.log(`[wecom-callback] 💡 可配置 WECOM_AIBOT_CHAT_ID=${chatId}`);

  // 企业微信 Bot 已下线 — 仅记录日志，不处理消息
  if (msgType === "text" && content) {
    console.log(`[wecom-callback] 文本消息（已忽略）: "${content.slice(0, 50)}"`);
  }

  return ok();
}

function ok(): Response {
  return new Response("", { status: 200 });
}
