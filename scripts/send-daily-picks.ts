#!/usr/bin/env npx tsx
/**
 * 手动测试推送脚本
 * 用法：npm run send-daily
 *       npx tsx scripts/send-daily-picks.ts
 *
 * 环境变量：
 *   WECHAT_WORK_WEBHOOK_URL   企业微信群机器人 Webhook URL（必填）
 *   DRY_RUN=1                 仅预览，不实际发送
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { aiPicksUrl } from "../lib/app-url";
import { appendFileSync, mkdirSync } from "fs";
import { join } from "path";

// ── Prisma 初始化 ──────────────────────────────────────────────────────────
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ── 日志 ───────────────────────────────────────────────────────────────────
const LOG_DIR = join(process.cwd(), "logs");
const LOG_FILE = join(LOG_DIR, "wechat-push.log");
try { mkdirSync(LOG_DIR, { recursive: true }); } catch { /* already exists */ }

function log(level: "INFO" | "ERROR", msg: string) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] [send-daily-picks] ${msg}`;
  appendFileSync(LOG_FILE, line + "\n", "utf-8");
  console.log(line);
}

// ── 工具函数 ───────────────────────────────────────────────────────────────
function parseNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

// ── 惰性导入（避免循环依赖，脚本直接引用库文件）──────────────────────────
// 以下函数是 lib/ai-score.ts 的内联精简版，避免 tsconfig paths 问题

// MA 计算
function sma(arr: number[], n: number): number | null {
  if (arr.length < n) return null;
  return arr.slice(-n).reduce((a, b) => a + b, 0) / n;
}
function ema(arr: number[], n: number): number[] {
  const k = 2 / (n + 1);
  const result: number[] = [];
  for (let i = 0; i < arr.length; i++) {
    if (i === 0) { result.push(arr[0]); continue; }
    result.push(arr[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

type Ind = {
  maTrend: string; macdSignalLabel: string;
  rsi14: number | null; macd: number | null; macdHist: number | null;
  return5d: number | null; return20d: number | null; return60d: number | null;
  latestClose: number; latestDate: string;
  ma5: number | null; ma20: number | null; ma60: number | null;
  macdSignal: number | null;
};

function calcInd(symbol: string, prices: { date: string; close: number }[]): Ind {
  const closes = prices.map((p) => p.close);
  const n = closes.length;
  const latest = closes[n - 1];

  const ma5Val = sma(closes, 5);
  const ma20Val = sma(closes, 20);
  const ma60Val = sma(closes, 60);

  let maTrend = "NEUTRAL";
  if (ma5Val && ma20Val && ma60Val) {
    if (ma5Val > ma20Val && ma20Val > ma60Val) maTrend = "GOLDEN";
    else if (ma5Val < ma20Val && ma20Val < ma60Val) maTrend = "DEAD";
    else if (ma5Val > ma20Val) maTrend = "BULLISH";
    else maTrend = "BEARISH";
  }

  // RSI
  let rsi14: number | null = null;
  if (n >= 15) {
    let gainSum = 0, lossSum = 0;
    for (let i = n - 14; i < n; i++) {
      const d = closes[i] - closes[i - 1];
      if (d > 0) gainSum += d; else lossSum += Math.abs(d);
    }
    const avgGain = gainSum / 14, avgLoss = lossSum / 14;
    rsi14 = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }

  // MACD
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = ema(macdLine, 9);
  const macdVal = macdLine[n - 1];
  const signalVal = signalLine[n - 1];
  const histVal = macdVal - signalVal;
  const macdSignalLabel =
    macdVal > signalVal ? "BUY" : macdVal < signalVal ? "SELL" : "NEUTRAL";

  const ret = (offset: number) =>
    n > offset ? ((latest - closes[n - 1 - offset]) / closes[n - 1 - offset]) * 100 : null;

  return {
    maTrend, macdSignalLabel,
    rsi14: rsi14 !== null ? parseFloat(rsi14.toFixed(2)) : null,
    macd: parseFloat(macdVal.toFixed(4)),
    macdHist: parseFloat(histVal.toFixed(4)),
    macdSignal: parseFloat(signalVal.toFixed(4)),
    return5d: ret(5), return20d: ret(20), return60d: ret(60),
    latestClose: latest,
    latestDate: prices[n - 1].date,
    ma5: ma5Val, ma20: ma20Val, ma60: ma60Val,
  };
}

// 评分（精简版，与 lib/ai-score.ts 逻辑一致）
function score(ind: Ind, best: Record<string, number | null>, finCount: number) {
  const trendS = { GOLDEN:25, BULLISH:18, NEUTRAL:12, BEARISH:6, DEAD:0 }[ind.maTrend] ?? 12;
  const macdS = ind.macdSignalLabel === "BUY" ? 20 : ind.macdSignalLabel === "SELL" ? 0 : 10;
  const rsi = ind.rsi14;
  const rsiS = rsi === null ? 10 : rsi >= 80 ? 3 : rsi >= 70 ? 8 : rsi >= 60 ? 18 : rsi >= 40 ? 25 : rsi >= 30 ? 18 : rsi >= 20 ? 8 : 3;
  const r20 = ind.return20d;
  const r20S = r20 === null ? 7 : r20 > 15 ? 15 : r20 > 8 ? 13 : r20 > 2 ? 10 : r20 > -3 ? 7 : r20 > -8 ? 4 : 0;
  const r60 = ind.return60d;
  const r60S = r60 === null ? 7 : r60 > 30 ? 15 : r60 > 15 ? 13 : r60 > 5 ? 10 : r60 > -5 ? 7 : r60 > -15 ? 4 : 0;
  const tech = trendS + macdS + rsiS + r20S + r60S;

  const rev = best.revenue ?? 0; const op = best.operatingProfit ?? 0;
  const opM = rev > 0 ? (op / rev) * 100 : null;
  const opMS = opM === null ? 0 : opM > 30 ? 25 : opM > 20 ? 22 : opM > 15 ? 18 : opM > 10 ? 13 : opM > 5 ? 8 : opM > 0 ? 4 : 0;
  const np = best.netProfit ?? 0; const eq = best.equity ?? 0;
  const roe = np && eq ? (np / eq) * 100 : null;
  const roeS = roe === null ? 0 : roe > 25 ? 25 : roe > 18 ? 22 : roe > 12 ? 18 : roe > 8 ? 13 : roe > 3 ? 7 : roe > 0 ? 3 : 0;
  const eps = best.eps;
  const epsS = !eps ? 0 : eps < 0 ? 0 : eps > 500 ? 25 : eps > 200 ? 22 : eps > 100 ? 18 : eps > 50 ? 14 : eps > 10 ? 10 : 7;
  const eqAR = best.equityRatio;
  const eqS = eqAR === null ? 0 : (eqAR * 100) > 60 ? 25 : (eqAR * 100) > 50 ? 22 : (eqAR * 100) > 40 ? 18 : (eqAR * 100) > 30 ? 13 : (eqAR * 100) > 20 ? 8 : (eqAR * 100) > 10 ? 4 : 1;
  const fund = opMS + roeS + epsS + eqS;

  const abs60 = Math.abs(r60 ?? 0);
  const volS = r60 === null ? 20 : abs60 < 5 ? 30 : abs60 < 10 ? 25 : abs60 < 20 ? 18 : abs60 < 30 ? 10 : abs60 < 50 ? 5 : 1;
  const rsiSfS = rsi === null ? 15 : rsi >= 80 ? 2 : rsi >= 70 ? 8 : rsi >= 60 ? 18 : rsi >= 40 ? 25 : rsi >= 30 ? 18 : rsi >= 20 ? 8 : 2;
  const max5_20 = Math.max(Math.abs(ind.return5d ?? 0), Math.abs(r20 ?? 0));
  const movS = max5_20 < 3 ? 25 : max5_20 < 6 ? 20 : max5_20 < 10 ? 14 : max5_20 < 15 ? 8 : 3;
  const present = [best.revenue, best.operatingProfit, best.netProfit, best.equity, best.eps].filter(v => v !== null).length;
  const dataS = present === 5 && finCount >= 4 ? 20 : present >= 4 ? 16 : present >= 3 ? 11 : present >= 1 ? 5 : 0;
  const riskS = volS + rsiSfS + movS + dataS;

  const total = Math.min(100, Math.round(tech * 0.4 + fund * 0.4 + riskS * 0.2));
  const rec = total >= 90 ? "STRONG_BUY" : total >= 80 ? "BUY" : total >= 65 ? "WATCH" : total >= 50 ? "HOLD" : "AVOID";
  const stars = total >= 90 ? 5 : total >= 80 ? 4 : total >= 65 ? 3 : total >= 50 ? 2 : 1;

  return { tech, fund, riskS, total, rec, stars, starsLabel: "★".repeat(stars) + "☆".repeat(5 - stars) };
}

// ── 企业微信推送 ───────────────────────────────────────────────────────────
async function pushToWeChat(content: string, isMarkdown = true): Promise<boolean> {
  const url = process.env.WECHAT_WORK_WEBHOOK_URL!;
  const payload = isMarkdown
    ? { msgtype: "markdown", markdown: { content } }
    : { msgtype: "text", text: { content } };

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { errcode: number; errmsg: string };
      if (data.errcode === 0) {
        log("INFO", `推送成功 (第${attempt}次)`);
        return true;
      }
      throw new Error(`errcode=${data.errcode} errmsg=${data.errmsg}`);
    } catch (err) {
      log("ERROR", `推送失败 (第${attempt}次): ${err instanceof Error ? err.message : err}`);
      if (attempt < 3) await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  return false;
}

// ── 主流程 ─────────────────────────────────────────────────────────────────
async function main() {
  const DRY_RUN = process.env.DRY_RUN === "1";
  const WEBHOOK = process.env.WECHAT_WORK_WEBHOOK_URL;

  log("INFO", `启动 | DRY_RUN=${DRY_RUN} | WEBHOOK=${WEBHOOK ? "已配置" : "未配置"}`);

  if (!WEBHOOK && !DRY_RUN) {
    log("ERROR", "WECHAT_WORK_WEBHOOK_URL 未设置，退出");
    process.exit(1);
  }

  // 计算东京时间日期
  const now = new Date();
  const tokyoDate = new Date(now.getTime() + 9 * 3600 * 1000);
  const dateStr = tokyoDate.toISOString().split("T")[0];
  const weekdays = ["日","一","二","三","四","五","六"];
  const weekday = weekdays[tokyoDate.getUTCDay()];

  log("INFO", `日报日期：${dateStr}（周${weekday}）`);

  const stocks = await prisma.stock.findMany({
    select: { id: true, symbol: true, name: true },
    orderBy: { symbol: "asc" },
  });
  log("INFO", `共 ${stocks.length} 只股票`);

  const results: Array<{
    symbol: string; name: string;
    total: number; rec: string; stars: number; starsLabel: string;
    tech: number; fund: number; riskS: number;
    latestClose: number; latestDate: string;
    maTrend: string; rsi14: number | null; return20d: number | null;
  }> = [];

  for (const stock of stocks) {
    const pricesDesc = await prisma.dailyPrice.findMany({
      where: { symbol: stock.symbol },
      orderBy: { date: "desc" },
      select: { date: true, close: true },
      take: 300,
    });
    if (pricesDesc.length === 0) { log("INFO", `${stock.symbol} 无价格数据，跳过`); continue; }

    const prices = pricesDesc.reverse().map((p) => ({
      date: p.date.toISOString().split("T")[0], close: Number(p.close),
    }));
    const ind = calcInd(stock.symbol, prices);

    const fins = await prisma.financial.findMany({
      where: { stockId: stock.id },
      orderBy: [{ fiscalYear: "desc" }, { quarter: "asc" }],
      take: 4,
      select: { revenue: true, operatingProfit: true, netProfit: true, totalAssets: true, equity: true, eps: true, equityRatio: true },
    });
    const best = fins[0] ?? {};
    const bestMap: Record<string, number | null> = {
      revenue: parseNum(best.revenue), operatingProfit: parseNum(best.operatingProfit),
      netProfit: parseNum(best.netProfit), totalAssets: parseNum(best.totalAssets),
      equity: parseNum(best.equity), eps: parseNum(best.eps), equityRatio: parseNum(best.equityRatio),
    };

    const s = score(ind, bestMap, fins.length);
    results.push({ symbol: stock.symbol, name: stock.name, ...s, ...ind });
  }

  const top3 = results.sort((a, b) => b.total - a.total).slice(0, 3);
  log("INFO", `TOP3：${top3.map((s) => `${s.name}(${s.total})`).join("、")}`);

  const medals = ["🥇","🥈","🥉"];
  const REC_LABEL: Record<string, string> = {
    STRONG_BUY: "强烈买入 🔥", BUY: "买入 ✅",
    WATCH: "关注 👀", HOLD: "持有 ⏸", AVOID: "回避 ❌",
  };

  const sections = top3.map((s, i) => {
    const prob = Math.min(92, Math.max(20, Math.round(s.total * 0.7 * 0.88 + s.tech * 0.3 * 0.88)));
    const trendLabel: Record<string, string> = { GOLDEN:"黄金叉↑", BULLISH:"上升中↑", NEUTRAL:"横盘", BEARISH:"下降中↓", DEAD:"死亡叉↓" };
    return [
      `**${medals[i]} TOP${i + 1} · ${s.name}**`,
      `> 代码：\`${s.symbol}\`　现价：¥${s.latestClose.toLocaleString()}`,
      `> AI评分：<font color="warning">**${s.total}分**</font>　${s.starsLabel}`,
      `> 推荐：${REC_LABEL[s.rec] ?? s.rec}`,
      `> 上涨概率：${prob}%`,
      `> 理由：${trendLabel[s.maTrend] ?? s.maTrend}，RSI=${s.rsi14?.toFixed(1) ?? "N/A"}，20日${(s.return20d ?? 0) >= 0 ? "涨" : "跌"}${Math.abs(s.return20d ?? 0).toFixed(1)}%`,
    ].join("\n");
  });

  const markdown = [
    `# 🇯🇵 日本AI选股日报`,
    `**日期：${dateStr}（周${weekday}）**`,
    `技术40% + 基本面40% + 安全性20%`,
    ``,
    sections.join("\n\n━━━━━━━━\n\n"),
    ``,
    `━━━━━━━━`,
    `[查看完整排行榜 →](${aiPicksUrl()})`,
  ].join("\n");

  const textSections = top3.map((s, i) => {
    const prob = Math.min(92, Math.max(20, Math.round(s.total * 0.7 * 0.88 + s.tech * 0.3 * 0.88)));
    return [
      `${medals[i]} TOP${i + 1}`,
      `股票：${s.name}`,
      `代码：${s.symbol}`,
      `现价：¥${s.latestClose.toLocaleString()}`,
      `AI评分：${s.total}分  ${s.starsLabel}`,
      `推荐：${(REC_LABEL[s.rec] ?? s.rec).replace(/ [^ ]+$/, "")}`,
      `上涨概率：${prob}%`,
    ].join("\n");
  });
  const textContent = [
    `🇯🇵 日本AI选股日报`,
    `日期：${dateStr}（周${weekday}）`,
    ``,
    textSections.join("\n\n━━━━━━━━\n\n"),
    ``,
    `━━━━━━━━`,
    `查看详情：${aiPicksUrl()}`,
  ].join("\n");

  console.log("\n========== Markdown 预览 ==========\n");
  console.log(markdown);
  console.log("\n====================================\n");

  log("INFO", `Markdown 内容长度：${markdown.length} 字符`);

  if (DRY_RUN) {
    log("INFO", "DRY_RUN=1，跳过实际推送");
    await prisma.$disconnect();
    return;
  }

  const mdOk = await pushToWeChat(markdown, true);
  if (!mdOk) {
    log("INFO", "Markdown 发送失败，降级为纯文本");
    await pushToWeChat(textContent, false);
  }

  await prisma.$disconnect();
  log("INFO", "完成");
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  const ts = new Date().toISOString();
  try {
    const { appendFileSync } = require("fs");
    appendFileSync(join(process.cwd(), "logs", "wechat-push.log"), `[${ts}] [ERROR] CRASH: ${msg}\n`);
  } catch { /* ignore */ }
  console.error("CRASH:", msg);
  process.exit(1);
});
