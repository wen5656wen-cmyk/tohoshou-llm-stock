/**
 * LINE Messaging API Webhook
 *
 * POST /api/line/webhook
 *   Line → Webhook → Auth check → AI Agent → replyMessage()
 *
 * Events handled:
 *   message  → AI chat (authorized user only)
 *   follow   → greeting (authorized user only)
 *   unfollow → deactivate user
 *   join     → capture groupId + group greeting
 *   leave    → deactivate group
 */

import { NextRequest, NextResponse } from "next/server";
import {
  verifySignature,
  replyMessage,
  textMsg,
  getUserId,
  type LineWebhookBody,
  type LineEvent,
  type LineTextEvent,
  type LineFollowEvent,
  type LineUnfollowEvent,
  type LineJoinEvent,
  type LineLeaveEvent,
} from "@/lib/line";
import {
  deactivateLineUser,
  upsertLineGroup,
  deactivateLineGroup,
} from "@/lib/line-agent";
import { handleLineChat, buildWelcomeFlexV79, buildGroupJoinFlexV79 } from "@/lib/line-chat";

export const runtime = "nodejs";

// LINE needs to be able to reach this — no auth guard
export async function GET() {
  return NextResponse.json({ status: "LINE webhook active", version: "ai-chat" });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();
  const signature = req.headers.get("x-line-signature") ?? "";

  if (!verifySignature(rawBody, signature)) {
    console.warn("[webhook] invalid signature");
    return NextResponse.json({ ok: false }, { status: 200 });
  }

  let body: LineWebhookBody;
  try {
    body = JSON.parse(rawBody) as LineWebhookBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 200 });
  }

  for (const event of body.events) {
    try {
      await processEvent(event);
    } catch (err) {
      console.error("[webhook] event error:", err);
    }
  }

  return NextResponse.json({ ok: true });
}

// ── Event handlers ────────────────────────────────────────────────────────────

async function processEvent(event: LineEvent): Promise<void> {
  switch (event.type) {
    case "message":  return onMessage(event as LineTextEvent);
    case "follow":   return onFollow(event as LineFollowEvent);
    case "unfollow": return onUnfollow(event as LineUnfollowEvent);
    case "join":     return onJoin(event as LineJoinEvent);
    case "leave":    return onLeave(event as LineLeaveEvent);
  }
}

async function onMessage(event: LineTextEvent): Promise<void> {
  if (event.message.type !== "text") return;

  const text   = event.message.text.trim();
  const userId = getUserId(event.source);

  console.log(`[webhook] message from ${userId ?? "anon"}: "${text.slice(0, 50)}"`);

  // 20s timeout guard — prevents hanging on slow AI responses
  const messages = await Promise.race([
    handleLineChat(text, userId, event.source),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 20000)),
  ]);

  if (messages == null) return; // unauthorized or timeout

  await replyMessage(event.replyToken, messages.slice(0, 5));
}

async function onFollow(event: LineFollowEvent): Promise<void> {
  const userId = getUserId(event.source);
  console.log(`[webhook] follow from userId=${userId}`);

  const ownerId = process.env.LINE_OWNER_USER_ID;
  if (ownerId && userId !== ownerId) return;

  await replyMessage(event.replyToken, [buildWelcomeFlexV79()]);
}

async function onUnfollow(event: LineUnfollowEvent): Promise<void> {
  const userId = getUserId(event.source);
  if (userId) await deactivateLineUser(userId).catch(() => {});
  console.log(`[webhook] unfollow userId=${userId}`);
}

async function onJoin(event: LineJoinEvent): Promise<void> {
  if (event.source.type !== "group") return;

  const groupId = event.source.groupId;
  console.log(`[webhook] ✅ Bot 加入群组 groupId=${groupId}`);

  await upsertLineGroup(groupId).catch(() => {});
  await replyMessage(event.replyToken, [buildGroupJoinFlexV79()]).catch(() => {});
}

async function onLeave(event: LineLeaveEvent): Promise<void> {
  if (event.source.type !== "group") return;
  const groupId = event.source.groupId;
  await deactivateLineGroup(groupId).catch(() => {});
  console.log(`[webhook] Bot 退出群组 groupId=${groupId}`);
}
