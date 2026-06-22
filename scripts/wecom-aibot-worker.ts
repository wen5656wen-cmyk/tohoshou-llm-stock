#!/usr/bin/env npx tsx
/**
 * 企业微信智能机器人 WebSocket 长连接 Worker（v11.4）
 *
 * 职责：
 *   1. 建立并维护唯一 WebSocket 长连接到企业微信开放平台
 *   2. 订阅（aibot_subscribe）→ 30s ping 保活 → 自动重连
 *   3. 在 127.0.0.1:3977 暴露本地 HTTP 端点
 *      POST /send   { content: string } — 由 cron 脚本调用，转发 Markdown 到群
 *      GET  /status                     — 健康检查
 *
 * 启动（PM2）：
 *   pm2 start "npx tsx scripts/wecom-aibot-worker.ts" --name tohoshou-wecom-aibot
 *
 * 必须环境变量：
 *   WECOM_AIBOT_ID          智能机器人 ID
 *   WECOM_AIBOT_SECRET      智能机器人 Secret
 *
 * 可选环境变量：
 *   WECOM_AIBOT_CHAT_ID      目标群聊 chatid（未配置时 /send 返回 503）
 *   WECOM_AIBOT_CHAT_TYPE    默认 2（群聊）
 *   WECOM_AIBOT_INTERNAL_TOKEN  本地 HTTP 鉴权 Token（可选；配置后 /send 需 X-Internal-Token header）
 */

import "dotenv/config";
import http from "http";
import { WecomAiBot } from "../lib/notify/wecom-aibot";

const PORT = 3977;

// ── 检查必须的环境变量 ────────────────────────────────────────────────────────

const botId = process.env.WECOM_AIBOT_ID;
const secret = process.env.WECOM_AIBOT_SECRET;

if (!botId || !secret) {
  console.error(
    "[wecom-aibot-worker] ❌ WECOM_AIBOT_ID 或 WECOM_AIBOT_SECRET 未配置，退出。\n" +
    "  请在 .env 中配置后重启。"
  );
  process.exit(1);
}

const chatId = process.env.WECOM_AIBOT_CHAT_ID ?? "";
const chatType = parseInt(process.env.WECOM_AIBOT_CHAT_TYPE ?? "2", 10);
const internalToken = process.env.WECOM_AIBOT_INTERNAL_TOKEN ?? "";

if (!chatId) {
  console.warn(
    "[wecom-aibot-worker] ⚠️  WECOM_AIBOT_CHAT_ID 未配置。\n" +
    "  请在群里 @机器人，worker 日志会打印 chatid，写入 .env 后重启。\n" +
    "  在此之前 /send 请求将返回 503。"
  );
}

// ── 启动 WebSocket 长连接 ─────────────────────────────────────────────────────

const bot = new WecomAiBot(botId, secret, chatId, chatType);

bot.on("subscribed", () => {
  console.log("[wecom-aibot-worker] ✅ WebSocket 已订阅，chatId =", chatId || "(未配置)");
});

bot.on("disconnected", () => {
  console.log("[wecom-aibot-worker] ⚠️  连接断开，等待自动重连...");
});

bot.on("ping_ok", () => {
  // 正常 ping 不打印，避免日志刷屏；如需调试请取消注释：
  // console.log("[wecom-aibot-worker] ping ok");
});

bot.on("message", (body: unknown) => {
  console.log("[wecom-aibot-worker] 收到消息回调:", JSON.stringify(body));
});

bot.on("event", (body: unknown) => {
  console.log("[wecom-aibot-worker] 收到事件回调:", JSON.stringify(body));
});

bot.connect();

// ── 本地 HTTP 服务 ────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  // ── GET /status — 健康检查 ─────────────────────────────────────────────────
  if (req.method === "GET" && req.url === "/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        subscribed: bot.subscribed,
        chatId: bot.chatId || null,
      })
    );
    return;
  }

  // ── POST /send — 发送 Markdown ─────────────────────────────────────────────
  if (req.method === "POST" && req.url === "/send") {
    // 鉴权
    if (internalToken) {
      const authVal = req.headers["x-internal-token"];
      if (authVal !== internalToken) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, errmsg: "unauthorized" }));
        return;
      }
    }

    let body = "";
    req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
    req.on("end", () => {
      let content: string;
      try {
        const parsed = JSON.parse(body) as Record<string, unknown>;
        content = String(parsed.content ?? "").trim();
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, errmsg: "JSON 解析失败" }));
        return;
      }

      if (!content) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, errmsg: "content 不能为空" }));
        return;
      }

      const result = bot.sendMarkdown(content);
      const status = result.ok ? 200 : 503;
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    });
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[wecom-aibot-worker] HTTP 服务监听 http://127.0.0.1:${PORT}`);
  console.log(`[wecom-aibot-worker]   POST /send   { content } — 推送 Markdown`);
  console.log(`[wecom-aibot-worker]   GET  /status            — 健康检查`);
});

// ── 优雅退出 ──────────────────────────────────────────────────────────────────

function shutdown(signal: string) {
  console.log(`[wecom-aibot-worker] 收到 ${signal}，正在关闭...`);
  bot.disconnect();
  server.close(() => {
    console.log("[wecom-aibot-worker] HTTP 服务已关闭");
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
