/**
 * POST /api/chat — V7.9.1 Unified Intent Engine
 *
 * Pipeline:
 *   parseUserIntent (regex + GPT intent-only)
 *   → queryDatabase (DB only, no GPT)
 *   → buildWebAnswer (formatted text, no GPT)
 *
 * GPT role: intent classification JSON only.
 * Answer: 100% from DB via answer-builder.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import { parseUserIntent, getContext, setContext } from "@/lib/intent-engine";
import { queryDatabase } from "@/lib/query-engine";
import { buildWebAnswer } from "@/lib/answer-builder";
import { detectSystemCommand, handleSystemCommand, getAiEnabled, PAUSE_MSG } from "@/lib/ai-control";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { message?: string; userId?: string; conversationContext?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const message = (body.message ?? "").trim();
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  // Per-session context (web users pass a stable sessionId as userId)
  const userId = (body.userId as string | undefined) ?? "web_anon";
  const context = getContext(userId);

  try {
    // 1. System commands — bypass entire pipeline
    const sysCmd = detectSystemCommand(message);
    if (sysCmd) {
      const reply = await handleSystemCommand(sysCmd, userId);
      return NextResponse.json({ intent: `system_${sysCmd.toLowerCase()}`, answerSource: "SYSTEM", reply });
    }

    // 2. AI enabled check
    const aiEnabled = await getAiEnabled(userId);
    if (!aiEnabled) {
      return NextResponse.json({ intent: "system_paused", answerSource: "SYSTEM", reply: PAUSE_MSG });
    }

    // 3. Parse intent (regex-first, GPT fallback)
    const intent = await parseUserIntent(message, context);
    console.log(`[api/chat] intent=${intent.intent} userId=${userId} text="${message.slice(0, 50)}"`);

    // 2. Query DB
    const dbData = await queryDatabase(intent);

    // 3. Build answer from DB (no GPT)
    const reply = buildWebAnswer(dbData);

    // 4. Update conversation context
    const nextCtx: Parameters<typeof setContext>[1] = {
      channel: "WEB",
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
    if (intent.dividendPreference || intent.riskPreference) {
      nextCtx.lastFilters = {
        dividendPreference: intent.dividendPreference,
        riskPreference: intent.riskPreference,
      };
    }
    setContext(userId, nextCtx);

    return NextResponse.json({
      intent: intent.intent,
      answerSource: "DB",
      hallucination: false,
      reply,
    });
  } catch (err) {
    console.error("[api/chat] error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: msg, reply: "服务暂时不可用，请稍后再试。" },
      { status: 500 }
    );
  }
}
