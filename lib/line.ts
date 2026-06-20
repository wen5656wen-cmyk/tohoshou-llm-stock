/**
 * LINE Messaging API Client
 *
 * Env vars required:
 *   LINE_CHANNEL_SECRET          – for webhook signature verification
 *   LINE_CHANNEL_ACCESS_TOKEN    – for sending messages
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const BASE = "https://api.line.me/v2/bot";

export type LineTextMessage = { type: "text"; text: string };
export type LineMessage = LineTextMessage;

// ── Config helpers ─────────────────────────────────────────────────────────

export function isConfigured(): boolean {
  return !!(
    process.env.LINE_CHANNEL_ACCESS_TOKEN &&
    process.env.LINE_CHANNEL_SECRET
  );
}

function token(): string {
  const t = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!t) throw new Error("LINE_CHANNEL_ACCESS_TOKEN not set");
  return t;
}

// ── Signature verification ─────────────────────────────────────────────────

/**
 * Verify LINE webhook signature using HMAC-SHA256.
 * LINE sends 'x-line-signature' header with base64-encoded HMAC.
 */
export function verifySignature(rawBody: string, signature: string): boolean {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret || !signature) return false;
  try {
    const expected = createHmac("sha256", secret)
      .update(rawBody, "utf-8")
      .digest("base64");
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

// ── Message builders ───────────────────────────────────────────────────────

/** Create a text message (max 5000 chars per LINE spec) */
export function textMsg(text: string): LineTextMessage {
  return { type: "text", text: text.slice(0, 4999) };
}

// ── API helpers ────────────────────────────────────────────────────────────

async function linePost(path: string, body: unknown, retries = 3): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify(body),
      });
      if (res.ok) return;
      const errText = await res.text().catch(() => "");
      if (i === retries - 1) {
        throw new Error(`LINE API ${path} → ${res.status}: ${errText}`);
      }
    } catch (e) {
      if (i === retries - 1) throw e;
    }
    await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
  }
}

// ── Public send functions ──────────────────────────────────────────────────

/**
 * Reply to a specific event (uses replyToken, single-use, 30s TTL).
 * LINE allows up to 5 messages per reply.
 */
export async function replyMessage(
  replyToken: string,
  messages: LineMessage[]
): Promise<void> {
  await linePost("/message/reply", {
    replyToken,
    messages: messages.slice(0, 5),
  });
}

/**
 * Push message to a specific user/group/room.
 */
export async function pushMessage(
  to: string,
  messages: LineMessage[]
): Promise<void> {
  await linePost("/message/push", {
    to,
    messages: messages.slice(0, 5),
  });
}

/**
 * Broadcast to ALL followers of the LINE channel.
 * Use for daily reports and market alerts.
 */
export async function broadcastMessage(messages: LineMessage[]): Promise<void> {
  await linePost("/message/broadcast", {
    messages: messages.slice(0, 5),
  });
}

// ── LINE event types (subset) ──────────────────────────────────────────────

export type LineEventSource =
  | { type: "user"; userId: string }
  | { type: "group"; groupId: string; userId?: string }
  | { type: "room"; roomId: string; userId?: string };

export type LineTextEvent = {
  type: "message";
  mode: "active" | "standby";
  timestamp: number;
  source: LineEventSource;
  replyToken: string;
  message: { type: "text"; id: string; text: string };
};

export type LineFollowEvent = {
  type: "follow";
  mode: "active";
  timestamp: number;
  source: LineEventSource;
  replyToken: string;
};

export type LineUnfollowEvent = {
  type: "unfollow";
  mode: "active";
  timestamp: number;
  source: LineEventSource;
};

export type LineJoinEvent = {
  type: "join";
  mode: "active";
  timestamp: number;
  source: LineEventSource;
  replyToken: string;
};

export type LineLeaveEvent = {
  type: "leave";
  mode: "active";
  timestamp: number;
  source: LineEventSource;
};

export type LineEvent = LineTextEvent | LineFollowEvent | LineUnfollowEvent | LineJoinEvent | LineLeaveEvent | { type: string };

export type LineWebhookBody = {
  destination: string;
  events: LineEvent[];
};

/** Extract userId from event source (returns null for anonymous sources) */
export function getUserId(source: LineEventSource): string | null {
  if (source.type === "user") return source.userId;
  if (source.type === "group" && source.userId) return source.userId;
  if (source.type === "room" && source.userId) return source.userId;
  return null;
}
