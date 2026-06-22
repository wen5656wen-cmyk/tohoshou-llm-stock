/**
 * 企业微信智能机器人 — WebSocket 长连接客户端（v11.4）
 *
 * 仅供 scripts/wecom-aibot-worker.ts 使用；不得在 Next.js 路由中 import。
 * push 脚本通过 sendViaWorker() 调用本地 HTTP 端点，无需持有 WebSocket 连接。
 */

import { EventEmitter } from "events";
import WebSocket from "ws";

const WS_URL = "wss://openws.work.weixin.qq.com";
const PING_MS = 30_000;
const RECONNECT_MS = 5_000;
const HTTP_TIMEOUT_MS = 5_000;

let _seq = 0;
function reqId(): string {
  return `ts_${Date.now()}_${++_seq}`;
}

// ── WebSocket 长连接客户端 ────────────────────────────────────────────────────

export class WecomAiBot extends EventEmitter {
  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnTimer: ReturnType<typeof setTimeout> | null = null;
  private _subscribed = false;
  private _active = false;

  constructor(
    private readonly botId: string,
    private readonly secret: string,
    public chatId: string,
    public chatType: number = 2
  ) {
    super();
  }

  get subscribed(): boolean { return this._subscribed; }

  connect(): void {
    this._active = true;
    this._connect();
  }

  disconnect(): void {
    this._active = false;
    this._stopPing();
    if (this.reconnTimer) { clearTimeout(this.reconnTimer); this.reconnTimer = null; }
    if (this.ws) { this.ws.close(); this.ws = null; }
  }

  // 发送 Markdown 消息；返回 ok=false 表示连接未就绪，需调用方处理
  sendMarkdown(content: string): { ok: boolean; errmsg?: string } {
    if (!this._subscribed || this.ws?.readyState !== WebSocket.OPEN) {
      return { ok: false, errmsg: "未连接或未订阅，请检查 wecom-aibot worker 状态" };
    }
    if (!this.chatId) {
      return {
        ok: false,
        errmsg: "WECOM_AIBOT_CHAT_ID 未配置。请在群里 @机器人，worker 日志会打印 chatid，写入 .env 后重启 worker。",
      };
    }
    this._send({
      cmd: "aibot_send_msg",
      headers: { req_id: reqId() },
      body: {
        chatid: this.chatId,
        chat_type: this.chatType,
        msgtype: "markdown",
        markdown: { content },
      },
    });
    return { ok: true };
  }

  // ── 私有方法 ───────────────────────────────────────────────────────────────

  private _connect(): void {
    console.log("[wecom-aibot] connecting to", WS_URL);
    this.ws = new WebSocket(WS_URL);

    this.ws.on("open", () => {
      console.log("[wecom-aibot] connected, subscribing...");
      this._send({
        cmd: "aibot_subscribe",
        headers: { req_id: reqId() },
        body: { bot_id: this.botId, secret: this.secret },
      });
    });

    this.ws.on("message", (data: WebSocket.RawData) => {
      const raw = Buffer.isBuffer(data)
        ? data.toString("utf8")
        : ArrayBuffer.isView(data)
        ? Buffer.from(data.buffer as ArrayBuffer, data.byteOffset, data.byteLength).toString("utf8")
        : String(data);
      try {
        this._handleMsg(JSON.parse(raw) as Record<string, unknown>);
      } catch { /* ignore unparseable frames */ }
    });

    this.ws.on("close", (code, reason) => {
      const why = reason?.toString() || "";
      console.log(`[wecom-aibot] disconnected (code=${code}${why ? " reason=" + why : ""})`);
      this._subscribed = false;
      this._stopPing();
      this.emit("disconnected");
      if (this._active) {
        this.reconnTimer = setTimeout(() => {
          console.log("[wecom-aibot] reconnecting...");
          this._connect();
        }, RECONNECT_MS);
      }
    });

    this.ws.on("error", (err) => {
      console.error("[wecom-aibot] WebSocket error:", err.message);
    });
  }

  private _handleMsg(msg: Record<string, unknown>): void {
    const cmd = msg.cmd as string;
    const body = (msg.body ?? {}) as Record<string, unknown>;

    switch (cmd) {
      case "aibot_subscribe_resp": {
        const code = body.errcode as number;
        if (code === 0) {
          console.log("[wecom-aibot] ✅ subscribed ok");
          this._subscribed = true;
          this._startPing();
          this.emit("subscribed");
        } else {
          console.error("[wecom-aibot] ❌ subscribe failed:", JSON.stringify(body));
          this.emit("subscribe_failed", body);
        }
        break;
      }
      case "ping_resp":
        console.log("[wecom-aibot] ping ok");
        this.emit("ping_ok");
        break;

      case "aibot_send_msg_resp":
        this.emit("send_resp", body);
        break;

      case "aibot_msg_callback":
      case "aibot_event_callback": {
        // 从回调中提取 chatid — 有助于用户首次配置
        const chatid =
          (body.chatid as string | undefined) ??
          ((body.chat_info as Record<string, unknown> | undefined)?.chatid as string | undefined) ??
          "";
        const userid =
          ((body.from as Record<string, unknown> | undefined)?.userid as string | undefined) ?? "";
        const text =
          ((body.text as Record<string, unknown> | undefined)?.content as string | undefined) ?? "";
        if (chatid) {
          console.log(`[wecom-aibot] ${cmd} — chatid: ${chatid}, from: ${userid}, text: "${text}"`);
          console.log(`[wecom-aibot] 💡 将此 chatid 写入 .env → WECOM_AIBOT_CHAT_ID=${chatid}`);
        }
        this.emit(cmd === "aibot_msg_callback" ? "message" : "event", body);
        break;
      }

      default:
        // 未知指令静默忽略
        break;
    }
  }

  private _startPing(): void {
    this._stopPing();
    this.pingTimer = setInterval(() => {
      this._send({ cmd: "ping", headers: { req_id: reqId() } });
    }, PING_MS);
  }

  private _stopPing(): void {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
  }

  private _send(payload: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }
}

// ── HTTP 客户端（供 push 脚本调用 worker 的本地 endpoint）──────────────────

/**
 * 通过本地 worker HTTP 端点发送 Markdown 内容。
 * 如果 worker 未运行，返回 { ok: false, errmsg: "ECONNREFUSED" }，调用方可降级为日志输出。
 */
export async function sendViaWorker(
  content: string
): Promise<{ ok: boolean; errmsg?: string }> {
  const token = process.env.WECOM_AIBOT_INTERNAL_TOKEN;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await fetch("http://127.0.0.1:3977/send", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "X-Internal-Token": token } : {}),
      },
      body: JSON.stringify({ content }),
    });
    clearTimeout(timer);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, errmsg: `HTTP ${res.status}${text ? ": " + text : ""}` };
    }
    return { ok: true };
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, errmsg: msg.includes("abort") ? "请求超时" : msg };
  }
}

/** 检查企业微信 aibot 所需环境变量是否已配置 */
export function isAibotConfigured(): boolean {
  return !!(
    process.env.WECOM_AIBOT_ID &&
    process.env.WECOM_AIBOT_SECRET &&
    process.env.WECOM_AIBOT_CHAT_ID
  );
}
