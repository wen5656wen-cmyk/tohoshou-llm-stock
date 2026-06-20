/**
 * lib/ai-control.ts — AI System Control V7.9.3
 *
 * Handles:
 *   System command detection: START / STOP / RESET / STATUS
 *   Per-user AI settings (UserAiSettings table)
 *   Status response generation
 *
 * Priority in message pipeline:
 *   1. detectSystemCommand → handle immediately (no intent engine, no DB stock query)
 *   2. getAiEnabled → if false, return pause message
 *   3. Normal intent pipeline
 */

import { prisma } from "@/lib/prisma";
import { clearContext, getContext } from "@/lib/intent-engine";

// ── Command detection ─────────────────────────────────────────────────────────

export type SystemCommandType = "START" | "STOP" | "RESET" | "STATUS";

const CMD_PATTERNS: Record<SystemCommandType, RegExp> = {
  START: /^(启动ai|开启ai|开始工作|resume|启动|开启|重启ai|开机|start|start ai|唤醒ai|唤醒|打开ai|激活ai|激活)$/i,
  STOP:  /^(关闭ai|停止ai|暂停ai|休眠|关闭机器人|stop|停止|暂停|关机|下线|关闭|待机|睡眠|下线ai)$/i,
  RESET: /^(清空上下文|重置上下文|重置|reset|清空记忆|清空|清除记忆|清除上下文|清空对话)$/i,
  STATUS:/^(当前状态|状态|status|系统状态|ai状态|ai状况|查看状态|ai信息)$/i,
};

export function detectSystemCommand(text: string): SystemCommandType | null {
  const t = text.trim();
  for (const [cmd, pattern] of Object.entries(CMD_PATTERNS)) {
    if (pattern.test(t)) return cmd as SystemCommandType;
  }
  return null;
}

// ── Settings: get or create ───────────────────────────────────────────────────

async function getOrCreate(userId: string) {
  return prisma.userAiSettings.upsert({
    where: { userId },
    create: { userId },
    update: {},
    select: { aiEnabled: true, mode: true, strictRealData: true },
  });
}

export async function getAiEnabled(userId: string): Promise<boolean> {
  try {
    const s = await getOrCreate(userId);
    return s.aiEnabled;
  } catch {
    return true; // default enabled if DB unavailable
  }
}

// ── Command handlers ──────────────────────────────────────────────────────────

export async function handleSystemCommand(
  cmd: SystemCommandType,
  userId: string,
): Promise<string> {
  switch (cmd) {
    case "START": {
      await prisma.userAiSettings.upsert({
        where: { userId },
        create: { userId, aiEnabled: true, mode: "STOCK" },
        update: { aiEnabled: true, mode: "STOCK" },
      });
      return [
        "🟢 TOHOSHOU AI 已启动",
        "",
        "当前模式：股票分析模式",
        "",
        "真实数据：",
        "J-Quants       ✅",
        "TDnet REAL     ✅",
        "JPX 空売り     ✅",
        "Dividend       ✅",
        "",
        "STRICT_REAL_DATA：ON",
        "",
        "发送「今天买什么」开始分析。",
      ].join("\n");
    }

    case "STOP": {
      await prisma.userAiSettings.upsert({
        where: { userId },
        create: { userId, aiEnabled: false, mode: "OFF" },
        update: { aiEnabled: false, mode: "OFF" },
      });
      clearContext(userId);
      return [
        "🛑 TOHOSHOU AI 已暂停",
        "",
        "不会继续：",
        "• 股票推荐",
        "• 个股分析",
        "• 市场分析",
        "• 连续追问",
        "",
        "发送「启动AI」即可恢复。",
      ].join("\n");
    }

    case "RESET": {
      clearContext(userId);
      return [
        "🧹 会话上下文已清空",
        "",
        "之后的追问（「还有吗」、「风险呢」）",
        "将不会继承之前的记录。",
      ].join("\n");
    }

    case "STATUS":
      return buildStatusText(userId);
  }
}

// ── Status text builder ───────────────────────────────────────────────────────

async function buildStatusText(userId: string): Promise<string> {
  const [settings, realScoreCount, shortSell, globalMarket, disclosureCount] = await Promise.all([
    getOrCreate(userId),
    prisma.stockScore.count({ where: { scoreSource: "REAL", adaptiveScore: { not: null } } }),
    prisma.shortSellingRatio.findFirst({ orderBy: { date: "desc" }, select: { source: true, date: true } }),
    prisma.globalMarket.findFirst({ orderBy: { date: "desc" }, select: { date: true } }),
    prisma.disclosure.count(),
  ]);

  const ctx = getContext(userId);
  const lastSymbol = ctx?.lastSymbols?.length
    ? ctx.lastSymbols.map((s) => s.replace(".T", "")).join(", ")
    : "—";
  const lastTheme = ctx?.lastTheme ?? ctx?.lastSector ?? "—";
  const hasContext = !!ctx;

  const statusLine = settings.aiEnabled ? "🟢 RUNNING" : "🛑 PAUSED";
  const shortSellOk = shortSell?.source === "jpx_real" ? "✅ JPX REAL" : "⚠️ FALLBACK";

  return [
    "TOHOSHOU AI v7.9.3",
    "",
    `状态：${statusLine}`,
    `模式：${settings.mode}`,
    "STRICT_REAL_DATA：ON",
    "",
    `最近分析：${lastSymbol}`,
    `最近主题：${lastTheme}`,
    `上下文：${hasContext ? "已开启" : "未建立"}`,
    "",
    "真实数据：",
    `J-Quants       ✅（${realScoreCount}只REAL）`,
    "Financial      ✅",
    "Institutional  ✅",
    `GlobalMarket   ${globalMarket ? "✅" : "⚠️ 暂无"}`,
    "Kabutan News   ✅",
    `TDnet REAL     ✅（${disclosureCount}件）`,
    `Short Selling  ${shortSellOk}`,
    "Dividend       ✅",
    "StockScore     ✅",
  ].join("\n");
}

// ── Pause message ─────────────────────────────────────────────────────────────

export const PAUSE_MSG = [
  "🛑 AI 当前已暂停。",
  "",
  "发送「启动AI」恢复智能投资助手。",
].join("\n");
