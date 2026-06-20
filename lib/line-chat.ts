/**
 * lib/line-chat.ts — LINE Chat Handler V7.9.1
 *
 * Unified pipeline (shared with /api/chat):
 *   parseUserIntent(text, context)
 *   → queryDatabase(intent)
 *   → buildLineMessages(intent, dbData)
 *
 * Rules:
 *   • Zero GPT in answer building — all data from DB
 *   • UNKNOWN → HELP (never "不支持该查询")
 *   • All URLs via app-url.ts
 *   • Context: 30-min TTL per userId
 */

import type { LineMessage } from "@/lib/line";
import { textMsg } from "@/lib/line";
import { upsertLineUser, upsertLineGroup } from "@/lib/line-agent";
import type { LineEventSource } from "@/lib/line";
import { parseUserIntent, getContext, setContext } from "@/lib/intent-engine";
import { queryDatabase } from "@/lib/query-engine";
import { buildLineMessages } from "@/lib/answer-builder";
import { buildWelcomeFlex, buildGroupJoinFlex } from "@/lib/line-flex";
import { buildWelcomeFlexV79, buildGroupJoinFlexV79 } from "@/lib/line-flex-v79";
import { detectSystemCommand, handleSystemCommand, getAiEnabled, PAUSE_MSG } from "@/lib/ai-control";

// ── Authorization ─────────────────────────────────────────────────────────────

function isAuthorized(userId: string | null): boolean {
  const ownerId = process.env.LINE_OWNER_USER_ID;
  if (!ownerId) return true;
  return userId === ownerId;
}

// ── Main handler ───────────────────────────────────────────────────────────────

export async function handleLineChat(
  text: string,
  userId: string | null,
  source: LineEventSource,
): Promise<LineMessage[] | null> {
  if (!isAuthorized(userId)) {
    console.log(`[line-chat] 拒绝未授权用户 userId=${userId ?? "unknown"}`);
    return null;
  }

  // Track in DB (best-effort)
  if (userId) await upsertLineUser(userId).catch(() => {});
  if (source.type === "group") await upsertLineGroup((source as { groupId: string }).groupId).catch(() => {});

  const contextKey = userId ?? "line_anon";
  const context = getContext(contextKey);

  try {
    // 1. System commands — highest priority, bypass entire pipeline
    const sysCmd = detectSystemCommand(text);
    if (sysCmd) {
      const response = await handleSystemCommand(sysCmd, contextKey);
      return [textMsg(response)];
    }

    // 2. AI enabled check — if paused, return one-line message
    const aiEnabled = await getAiEnabled(contextKey);
    if (!aiEnabled) {
      return [textMsg(PAUSE_MSG)];
    }

    // 3. Parse intent (regex-first, GPT fallback for complex queries)
    const intent = await parseUserIntent(text, context);
    console.log(`[line-chat] intent=${intent.intent} userId=${userId ?? "anon"} text="${text.slice(0, 50)}"`);

    // 2. Query DB
    const dbData = await queryDatabase(intent);

    // 3. Build LINE messages from DB data
    const messages = buildLineMessages(dbData);

    // 4. Update conversation context
    const nextCtx: Parameters<typeof setContext>[1] = {
      channel: "LINE",
      lastIntent: intent.intent,
    };
    if (dbData.stocks?.length) {
      nextCtx.lastSymbols = dbData.stocks.map((s) => s.symbol);
      nextCtx.lastResults = dbData.stocks.map((s) => s.symbol);
    } else if (dbData.compareStocks) {
      const syms = dbData.compareStocks.filter(Boolean).map((s) => s!.symbol);
      nextCtx.lastSymbols = syms;
      nextCtx.lastResults = syms;
    }
    if (intent.theme) nextCtx.lastTheme = intent.theme;
    if (intent.sector) nextCtx.lastSector = intent.sector;
    if (intent.sectors) nextCtx.lastSector = intent.sectors.join(",");
    if (intent.dividendPreference || intent.riskPreference) {
      nextCtx.lastFilters = {
        dividendPreference: intent.dividendPreference,
        riskPreference: intent.riskPreference,
      };
    }
    setContext(contextKey, nextCtx);

    return messages;
  } catch (err) {
    console.error(`[line-chat] error:`, err);
    return [textMsg("❌ 处理时发生错误，请稍后重试。")];
  }
}

// ── Re-export helpers used by webhook and scheduled pushes ────────────────────
export { buildWelcomeFlex, buildGroupJoinFlex };
export { buildWelcomeFlexV79, buildGroupJoinFlexV79 };
