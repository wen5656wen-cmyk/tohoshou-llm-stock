/**
 * lib/llm/router.ts — LLM-powered intent router
 *
 * Routes natural language queries to typed intents using GPT-4o-mini.
 * Falls back gracefully when OPENAI_API_KEY is not set.
 *
 * Examples:
 *   今天买什么？       → { type: "today_picks" }
 *   丰田怎么样？       → { type: "stock_query", entity: "丰田" }
 *   科技股谁最强？     → { type: "theme_query", theme: "科技股" }
 */

import { llmClient, LLM_MODEL, isLLMConfigured } from "./client";

export type LLMIntent =
  | { type: "today_picks" }
  | { type: "stock_query"; entity: string }
  | { type: "theme_query"; theme: string }
  | { type: "market_overview" }
  | { type: "news" }
  | { type: "greeting" }
  | { type: "help" }
  | { type: "unknown"; raw: string };

// Fast regex pre-classification — avoids LLM for unambiguous inputs
function quickParse(text: string): LLMIntent | null {
  const t = text.trim();
  if (/^\d{4}$/.test(t))                                     return { type: "stock_query", entity: t };
  if (/^(你好|嗨|hi|hello|早安|晚安|こんにちは)$/i.test(t)) return { type: "greeting" };
  if (/^(帮助|help|\/help|使い方|ヘルプ)$/i.test(t))         return { type: "help" };
  if (/^(新闻|资讯|news|ニュース|公告)$/i.test(t))           return { type: "news" };
  return null;
}

const SYSTEM_PROMPT = `你是日本股市问答路由器。分析用户输入，返回 JSON 格式意图分类。

type 枚举：
- "today_picks"    问今天买什么 / AI推荐 / TOP10
- "stock_query"    询问某只股票，entity = 公司名或4位代码（如"丰田"、"7203"）
- "theme_query"    询问某类/主题股票，theme = 主题词（如"科技股"、"半导体"、"机器人"）
- "market_overview" 问市场整体行情/概况
- "news"           问新闻/资讯/公告
- "help"           求助/不知道怎么用
- "greeting"       打招呼
- "unknown"        无法归类

只返回 JSON，不加任何解释。

示例：
用户：今天买什么？      → {"type":"today_picks"}
用户：丰田怎么样？      → {"type":"stock_query","entity":"丰田"}
用户：帮我分析一下本田  → {"type":"stock_query","entity":"本田"}
用户：7203             → {"type":"stock_query","entity":"7203"}
用户：科技股谁最强？    → {"type":"theme_query","theme":"科技股"}
用户：半导体最近怎样？  → {"type":"theme_query","theme":"半导体"}
用户：今天市场如何？    → {"type":"market_overview"}
用户：有什么新闻？      → {"type":"news"}`;

export async function routeIntent(text: string): Promise<LLMIntent> {
  const quick = quickParse(text);
  if (quick) return quick;

  if (!isLLMConfigured()) {
    return { type: "unknown", raw: text };
  }

  try {
    const res = await llmClient().chat.completions.create({
      model: LLM_MODEL(),
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
      max_tokens: 80,
      temperature: 0,
      response_format: { type: "json_object" },
    });

    const raw = res.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Record<string, string>;
    const type = parsed.type as LLMIntent["type"];

    switch (type) {
      case "today_picks":     return { type: "today_picks" };
      case "stock_query":     return { type: "stock_query", entity: parsed.entity ?? text };
      case "theme_query":     return { type: "theme_query", theme: parsed.theme ?? text };
      case "market_overview": return { type: "market_overview" };
      case "news":            return { type: "news" };
      case "help":            return { type: "help" };
      case "greeting":        return { type: "greeting" };
      default:                return { type: "unknown", raw: text };
    }
  } catch (err) {
    console.error("[llm/router] routing failed:", err);
    return { type: "unknown", raw: text };
  }
}
