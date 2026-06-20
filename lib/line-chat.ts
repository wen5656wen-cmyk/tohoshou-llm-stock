/**
 * LINE Chat Handler
 *
 * Authorization guard + routes LINE events to AI agent.
 *
 * Env:
 *   LINE_OWNER_USER_ID  – only this userId can chat.
 *                         If unset: all users allowed (open mode, logs userId for setup).
 */

import { processMessage } from "@/lib/ai-agent";
import { upsertLineUser, upsertLineGroup } from "@/lib/line-agent";
import type { LineEventSource } from "@/lib/line";

// ── Authorization ─────────────────────────────────────────────────────────────

function isAuthorized(userId: string | null): boolean {
  const ownerId = process.env.LINE_OWNER_USER_ID;
  if (!ownerId) return true; // open mode
  return userId === ownerId;
}

// ── Main handler ──────────────────────────────────────────────────────────────

/**
 * Handle a LINE text message.
 * Returns the reply string, or null if the user is not authorized (no reply).
 */
export async function handleLineChat(
  text: string,
  userId: string | null,
  source: LineEventSource
): Promise<string | null> {
  // First-time setup guidance: log userId so owner can configure .env
  if (userId && !process.env.LINE_OWNER_USER_ID) {
    console.log(`[line-chat] ⚠️  LINE_OWNER_USER_ID 未配置`);
    console.log(`[line-chat] → 请在 .env 中添加：LINE_OWNER_USER_ID=${userId}`);
  }

  // Silently reject unauthorized users
  if (!isAuthorized(userId)) {
    console.log(`[line-chat] 拒绝未授权用户 userId=${userId ?? "unknown"}`);
    return null;
  }

  // Track in DB (best-effort)
  if (userId) {
    await upsertLineUser(userId).catch(() => {});
  }
  if (source.type === "group") {
    await upsertLineGroup(source.groupId).catch(() => {});
  }

  // Route to AI agent
  return processMessage(text);
}
