#!/usr/bin/env npx tsx
/**
 * gen-v3-final-review.ts — V3 Freeze 到期最终评审生成器（P3-T4，只读）
 * 汇总 Shadow 一周（AdaptiveScoreV3Calibration 历史）+ Replay + Backtest → docs/V3_FINAL_PRODUCTION_REVIEW.md。
 * READ-ONLY。给出 Production Ready 判定 A/B/C/D。
 */
import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { FREEZE } from "../lib/scoring-v3/freeze";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const readJson = (f: string) => { try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "reports", f), "utf8")); } catch { return null; } };
const fx = (v: any, d = 2) => (v == null || isNaN(v) ? "—" : Number(v).toFixed(d));

async function main() {
  const cal = await prisma.adaptiveScoreV3Calibration.findMany({ orderBy: { date: "asc" } });
  const replay = readJson("score-v3-replay.json");
  const bt = readJson("score-v3-backtest.json");

  const latest = cal[cal.length - 1];
  const readiness = latest?.readiness ?? 0;
  const shadowDays = cal.length;
  const v3WinCells = replay?.verdict?.v3Win ?? null, cells = replay?.verdict?.cells ?? null;
  const btV3 = (p: number) => bt?.rows?.find((r: any) => r.period === p && r.strategy === "V3" && r.topN === 20 && r.holdDays === 20);
  const btV2 = (p: number) => bt?.rows?.find((r: any) => r.period === p && r.strategy === "PRODUCTION" && r.topN === 20 && r.holdDays === 20);

  // 判定
  let grade = "D", advice = "放弃 V3";
  const replayGood = cells && v3WinCells != null && v3WinCells / cells >= 0.6;
  if (readiness >= 90 && replayGood) { grade = "A"; advice = "立即上线（人工确认 + 一键回滚预案）"; }
  else if (readiness >= 75) { grade = "B"; advice = "建议继续 Shadow（缺口：前向证据/上行窗口/实盘累积）"; }
  else if (readiness >= 60) { grade = "C"; advice = "重新优化（阈值/权重/风险层）"; }

  const nowStamp = process.env.REVIEW_DATE ?? FREEZE.endDate;
  const md = `# V3 最终生产评审（Freeze 到期）

**生成日期：** ${nowStamp} · **Freeze：** ${FREEZE.version}（${FREEZE.startDate} → ${FREEZE.endDate}）· **冻结 Commit：** ${FREEZE.commit}
**判定：Grade ${grade} — ${advice}** · Production Readiness = ${fx(readiness, 1)} / 100（目标 ${FREEZE.targetReadiness}）
纯只读汇总，Production（StockScore/DailyRecommendation/Portfolio/GPT Rank）全程未变，SCORING_ENGINE=v2 未切换。

## 一、Shadow 一周统计（${shadowDays} 个标定日）
| 日期 | 市场 | Readiness | Grade | STRONG_BUY | SB占比% |
|---|---|---|---|---|---|
${cal.map((c) => { const sb = (c.sbStatsJson as any) ?? {}; return `| ${c.date.toISOString().slice(0, 10)} | ${c.regime} | ${fx(c.readiness, 1)} | ${c.readinessGrade} | ${sb.count ?? "—"} | ${sb.frac ?? "—"} |`; }).join("\n")}

## 二、Replay 前向收益（Top20，V3 vs V2）
${replay ? `窗口 ${replay.asOfRange?.join(" → ")} · ${replay.days} 日 · V3 vs V2 胜 ${v3WinCells}/${cells}

| 横期 | V2 | V3 | V3−V2 |
|---|---|---|---|
${[1, 3, 5, 10].map((h) => `| T+${h} | ${fx(replay.agg?.PRODUCTION?.[20]?.[h]?.avg)} | ${fx(replay.agg?.V3?.[20]?.[h]?.avg)} | ${fx(replay.spread?.[20]?.[h])} |`).join("\n")}` : "（无 replay 数据）"}

## 三、回测指标（Top20 · 持有20日）
| 周期 | 策略 | 累计收益% | Sharpe | 最大回撤% | 胜率% | 年化% | 换手% |
|---|---|---|---|---|---|---|---|
${[30, 90, 180].flatMap((p) => [["V2", btV2(p)], ["V3", btV3(p)]].map(([lbl, r]: any) => `| ${p}日 | ${lbl} | ${fx(r?.cumReturn)} | ${fx(r?.sharpe)} | ${fx(r?.maxDrawdown)} | ${fx(r?.winRate, 1)} | ${fx(r?.annualizedReturn)} | ${fx(r?.turnover, 1)} |`)).join("\n")}

## 四、判定
- Production Readiness = **${fx(readiness, 1)}**（${grade}）
- Replay V3 优于 V2：${replayGood ? "是" : "否"}（${v3WinCells}/${cells}）
- Shadow 累计：${shadowDays} 日

> **结论：Grade ${grade} — ${advice}。**
${grade === "A" ? "> 达到上线条件。执行上线步骤：备份 → 设 SCORING_ENGINE=v3 → 重启 → 监控 24h → 异常即回滚 v2。" : "> 未达上线条件。保持 SCORING_ENGINE=v2，按缺口继续验证后重跑本评审。"}
`;

  const dir = path.join(process.cwd(), "docs"); if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "V3_FINAL_PRODUCTION_REVIEW.md"), md);
  console.log(`✅ 生成 docs/V3_FINAL_PRODUCTION_REVIEW.md — Grade ${grade}, Readiness ${fx(readiness, 1)}, Shadow ${shadowDays}日, Replay ${v3WinCells}/${cells}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
