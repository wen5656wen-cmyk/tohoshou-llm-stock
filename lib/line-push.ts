/**
 * Unified LINE push helper
 *
 * pushToAll() sends messages to:
 *   1. All active LINE groups (via pushMessage)
 *   2. All individual followers (via broadcastMessage)
 *
 * For scripts, import pushToAll instead of broadcastMessage directly.
 */

import { pushMessage, broadcastMessage, QuotaExceededError, type LineMessage } from "./line";

export { textMsg, flexMsg } from "./line";
export { QuotaExceededError } from "./line";
export type { LineMessage };

export type PushResult = {
  groups: number;
  broadcast: boolean;
  quotaExceeded?: boolean;
};

/** Push to all active LINE groups and broadcast to individual followers. */
export async function pushToAll(
  messages: LineMessage[],
  groupIds: string[]
): Promise<PushResult> {
  let groups = 0;

  for (const gid of groupIds) {
    try {
      await pushMessage(gid, messages);
      groups++;
      console.log(`[line-push] ✅ 群组推送成功 groupId=${gid}`);
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        console.error(`[line-push] ⚠️ LINE 月額度已耗尽 (429)`, err.rawBody);
        return { groups, broadcast: false, quotaExceeded: true };
      }
      console.error(`[line-push] ❌ 群组推送失败 groupId=${gid}:`, err);
    }
  }

  try {
    await broadcastMessage(messages);
    console.log("[line-push] ✅ 广播推送完成（覆盖个人关注者）");
    return { groups, broadcast: true };
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      console.error(`[line-push] ⚠️ LINE 月額度已耗尽 (429)`, (err as QuotaExceededError).rawBody);
      return { groups, broadcast: false, quotaExceeded: true };
    }
    console.error("[line-push] ❌ 广播推送失败:", err);
    return { groups, broadcast: false };
  }
}
