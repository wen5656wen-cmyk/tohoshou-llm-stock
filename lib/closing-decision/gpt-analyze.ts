// ── TOHOSHOU AI · Closing Decision · GPT 分析 Top20（P6-T12）─────────────────
// 对实时重排的 Top20 做一次 GPT 复核，输出每股 gptScore(0-100) + 简短中文 note。
// 与 rerank-top500 的 GPT overlay 同源思路：**GPT 仅基于我方提供的 DB 事实做可交易性
// 评估与排序复核，不虚构价格/名称/新闻**。model=OPENAI_MODEL（默认 gpt-4o-mini）。
// 强健回退：GPT 未配置 / 报错 / JSON 解析失败 → 全部 gptScore=null（决策仍由规则引擎产出）。
// 计量写 logs/gpt-runtime-<JST>.jsonl（复用 gpt-runtime）。

import { openaiClient, GPT_MODEL, isOpenAIConfigured } from "../openai";
import { newGptStat, flushGptRun, classifyGptError } from "../gpt-runtime";

export interface GptFact {
  symbol: string;
  name: string | null;
  sector: string | null;
  aiScore: number | null;
  price: number | null;
  changePct: number | null;
  rsi14: number | null;
  macdHist: number | null;
  ma5: number | null;
  ma20: number | null;
  return20d: number | null;
  newsSentiment: number | null;
  riskLevel: string | null;
  inBuyZone: boolean;
  breakout: boolean;
}

export interface GptVerdict {
  gptScore: number | null; // 0-100
  note: string | null;
}

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

/** 分析 Top20，返回 symbol → {gptScore, note}。失败整体回退空 Map（调用方视为无 GPT）。 */
export async function analyzeTop20WithGpt(facts: GptFact[]): Promise<Map<string, GptVerdict>> {
  const out = new Map<string, GptVerdict>();
  if (!facts.length || !isOpenAIConfigured()) return out;

  const stat = newGptStat("closing-decision-top20", GPT_MODEL);
  const t0 = Date.now();
  try {
    const client = openaiClient();
    const table = facts.map((f, i) =>
      `${i + 1}. ${f.symbol} ${f.name ?? ""}｜行业:${f.sector ?? "?"}｜AI分:${f.aiScore ?? "?"}｜现价:${f.price ?? "?"}｜今日:${f.changePct?.toFixed(1) ?? "?"}%｜RSI:${f.rsi14?.toFixed(0) ?? "?"}｜MACD柱:${f.macdHist?.toFixed(1) ?? "?"}｜MA5/20:${f.ma5?.toFixed(0) ?? "?"}/${f.ma20?.toFixed(0) ?? "?"}｜20日:${f.return20d?.toFixed(0) ?? "?"}%｜新闻情绪:${f.newsSentiment ?? "?"}/15｜风险:${f.riskLevel ?? "?"}｜${f.inBuyZone ? "现价在买区内" : f.breakout ? "已突破买区(追高)" : "低于买区"}`,
    ).join("\n");

    const sys = "你是日本股票短线交易的风控复核 AI。只依据用户提供的事实数据，评估每只股票【今日收盘前建仓】的可交易性，输出 0-100 的 gptScore（越高越适合今日买入）与一句≤30字中文 note。禁止虚构任何价格、名称、新闻或事实。追高（已突破买区且RSI偏高）应降分；买区内、量价健康、风险低应加分。只返回 JSON。";
    const user = `以下是今日实时重排的候选（Top${facts.length}），请逐只复核：\n${table}\n\n严格返回 JSON：{"scores":[{"symbol":"XXXX.T","gptScore":0-100,"note":"简短中文"}]}，覆盖全部 ${facts.length} 只。`;

    const resp = await client.chat.completions.create({
      model: GPT_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
    });

    stat.calls += 1;
    stat.ok += 1;
    stat.totalMs += Date.now() - t0;
    const usage = resp.usage;
    if (usage) {
      stat.promptTokens += usage.prompt_tokens ?? 0;
      stat.completionTokens += usage.completion_tokens ?? 0;
    }

    const content = resp.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as { scores?: Array<{ symbol: string; gptScore: number; note?: string }> };
    for (const s of parsed.scores ?? []) {
      if (!s?.symbol) continue;
      out.set(String(s.symbol), {
        gptScore: typeof s.gptScore === "number" ? clamp(s.gptScore) : null,
        note: typeof s.note === "string" ? s.note.slice(0, 40) : null,
      });
    }
  } catch (e) {
    const { is429, isQuota } = classifyGptError(e);
    stat.calls += 1;
    stat.fail += 1;
    if (is429) stat.err429 += 1;
    if (isQuota) stat.quota += 1;
    console.error("[closing-decision] GPT 分析失败，回退无 GPT：", (e as Error)?.message);
    out.clear(); // 整体回退——决策改由规则引擎独立产出
  } finally {
    flushGptRun(stat);
  }
  return out;
}
