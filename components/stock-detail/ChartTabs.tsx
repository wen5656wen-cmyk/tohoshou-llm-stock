"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import PriceChart from "@/components/PriceChart";
import { fmtJpy, fmtPct } from "@/lib/rec-config";
import { ROUTES } from "@/lib/routes";
import { C, ScoreBar, retColor } from "./ui";
import type { PricePoint, IndicatorData, ScoreData, NewsItem, Financial } from "./ui";

export type TabKey = "price" | "tech" | "fin" | "news" | "ai";
export const CHART_PERIODS = [
  { key: "1M", n: 22 }, { key: "3M", n: 66 }, { key: "6M", n: 132 },
  { key: "1Y", n: 250 }, { key: "3Y", n: 750 }, { key: "MAX", n: 99999 },
] as const;

function maTrendLabel(trend: string, t: (k: string) => string): { label: string; color: string; detail: string } {
  const m: Record<string, { key: string; detail: string; color: string }> = {
    GOLDEN: { key: "trend.golden", detail: "MA5>MA20>MA60", color: C.amber },
    BULLISH: { key: "trend.bullish", detail: "MA5>MA20", color: C.green },
    NEUTRAL: { key: "trend.neutral", detail: "", color: C.faint },
    BEARISH: { key: "trend.bearish", detail: "MA5<MA20", color: C.sub },
    DEAD: { key: "trend.dead", detail: "MA5<MA20<MA60", color: C.red },
  };
  const c = m[trend] ?? m.NEUTRAL;
  return { label: t(c.key as never), color: c.color, detail: c.detail };
}

export function ChartTabs({
  tab, setTab, ind, score, chartData, chartPeriod, setChartPeriod, chartLoading,
  financials, financialsLoading, news, symbol, latestClose, latestDate,
}: {
  tab: TabKey; setTab: (t: TabKey) => void;
  ind: IndicatorData | null; score: ScoreData | null;
  chartData: PricePoint[]; chartPeriod: string; setChartPeriod: (k: string) => void; chartLoading: boolean;
  financials: Financial[]; financialsLoading: boolean;
  news: NewsItem[]; symbol: string; latestClose: number; latestDate: string;
}) {
  const { t, lang } = useI18n();
  const TABS: { key: TabKey; label: string }[] = [
    { key: "price", label: "价格走势" }, { key: "tech", label: "技术指标" },
    { key: "fin", label: "财务数据" }, { key: "news", label: "公司新闻" }, { key: "ai", label: "AI分析" },
  ];
  const rsi = ind?.rsi14 ?? null;
  const volRatio = (ind?.latestVolume != null && ind?.avgVolume20d != null && ind.avgVolume20d > 0) ? ind.latestVolume / ind.avgVolume20d : null;

  return (
    <div className="dash-card overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-3 pt-3 pb-0 overflow-x-auto" style={{ borderBottom: `1px solid ${C.line}` }}>
        {TABS.map((tb) => {
          const on = tb.key === tab;
          return (
            <button key={tb.key} onClick={() => setTab(tb.key)}
              className="relative px-3.5 py-2.5 text-[13px] font-semibold whitespace-nowrap transition-colors"
              style={{ color: on ? C.ink : C.faint }}>
              {tb.label}
              {on && <span className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full" style={{ background: C.blue }} />}
            </button>
          );
        })}
      </div>

      <div className="p-5">
        {/* ── Price ─────────────────────────────────────────────── */}
        {tab === "price" && (
          <div>
            <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
              <div className="inline-flex p-1 rounded-full" style={{ background: "#F0F0F3", border: `1px solid ${C.line}` }}>
                {CHART_PERIODS.map((p) => {
                  const on = p.key === chartPeriod;
                  return (
                    <button key={p.key} onClick={() => setChartPeriod(p.key)}
                      className="px-3 h-7 rounded-full text-[12px] font-semibold transition-all"
                      style={on ? { background: "#fff", color: C.ink, boxShadow: "0 1px 2px rgba(0,0,0,0.1)" } : { color: C.sub }}>
                      {p.key === "MAX" ? t("common.all") || "最大" : p.key}
                    </button>
                  );
                })}
              </div>
              <span className="text-[11px]" style={{ color: C.faint }}>J-Quants · {latestDate}</span>
            </div>
            {chartLoading || chartData.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center text-[13px]" style={{ color: C.faint }}>
                <span className="animate-pulse">{t("common.loading")}</span>
              </div>
            ) : (
              <>
                <PriceChart data={chartData} height={300} showVolume />
                <div className="mt-3 pt-3 flex flex-wrap gap-4 text-[12px]" style={{ borderTop: `1px solid ${C.line}`, color: C.faint }}>
                  {[["MA5", ind?.ma5], ["MA20", ind?.ma20], ["MA60", ind?.ma60]].map(([k, v]) => (
                    <span key={k as string}>{k}: <b style={{ color: C.sub }}>{v ? `¥${(v as number).toLocaleString()}` : "—"}</b></span>
                  ))}
                  <span>RSI: <b style={{ color: C.sub }}>{rsi?.toFixed(1) ?? "—"}</b></span>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Tech ──────────────────────────────────────────────── */}
        {tab === "tech" && (ind ? (() => {
          const ma = maTrendLabel(ind.maTrend, t as (k: string) => string);
          return (
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[12px] font-semibold px-2.5 py-1 rounded-full" style={{ color: ma.color, background: `${ma.color}14` }}>{ma.label}{ma.detail ? ` · ${ma.detail}` : ""}</span>
                {ind.macdSignalLabel !== "NEUTRAL" && <span className="text-[12px] font-semibold px-2.5 py-1 rounded-full" style={{ color: ind.macdSignalLabel === "BUY" ? C.green : C.red, background: `${ind.macdSignalLabel === "BUY" ? C.green : C.red}14` }}>MACD {ind.macdSignalLabel === "BUY" ? t("macd.bullish") : t("macd.bearish")}</span>}
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {[["MA5", ind.ma5], ["MA20", ind.ma20], ["MA60", ind.ma60]].map(([k, v]) => {
                  const diff = v ? ((latestClose - (v as number)) / (v as number)) * 100 : null;
                  return (
                    <div key={k as string} className="rounded-xl p-3 text-center" style={{ background: "#F7F7F9" }}>
                      <div className="text-[10px]" style={{ color: C.faint }}>{k}</div>
                      <div className="text-[16px] font-semibold tabular-nums" style={{ color: C.ink }}>{fmtJpy(v as number)}</div>
                      {diff != null && <div className="text-[10px] font-medium tabular-nums" style={{ color: retColor(diff) }}>{fmtPct(diff)}</div>}
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <div className="rounded-xl p-3" style={{ background: "#F7F7F9" }}>
                  <div className="text-[10px]" style={{ color: C.faint }}>RSI (14)</div>
                  <div className="text-[19px] font-semibold tabular-nums" style={{ color: rsi == null ? C.faint : rsi >= 70 ? C.red : rsi <= 30 ? C.green : C.ink }}>{rsi != null ? rsi.toFixed(1) : "—"}</div>
                  {rsi != null && <div className="mt-2 h-1.5 rounded-full overflow-hidden relative" style={{ background: "#EEEEF1" }}><div className="h-full rounded-full" style={{ width: `${rsi}%`, background: rsi >= 70 ? C.red : rsi <= 30 ? C.green : C.faint }} /></div>}
                </div>
                <div className="rounded-xl p-3" style={{ background: "#F7F7F9" }}>
                  <div className="text-[10px]" style={{ color: C.faint }}>{t("ts.volume_ratio")}</div>
                  <div className="text-[19px] font-semibold tabular-nums" style={{ color: volRatio != null && volRatio >= 1.5 ? C.amber : C.ink }}>{volRatio != null ? `${volRatio.toFixed(2)}x` : "—"}</div>
                  <div className="text-[10px]" style={{ color: C.faint }}>vs 20D avg</div>
                </div>
                <div className="rounded-xl p-3" style={{ background: "#F7F7F9" }}>
                  <div className="text-[10px]" style={{ color: C.faint }}>{t("stock.60d_return")}</div>
                  <div className="text-[19px] font-semibold tabular-nums" style={{ color: retColor(ind.return60d) }}>{fmtPct(ind.return60d)}</div>
                </div>
              </div>
            </div>
          );
        })() : <p className="text-[13px]" style={{ color: C.faint }}>{t("common.no_data")}</p>)}

        {/* ── Financials ────────────────────────────────────────── */}
        {tab === "fin" && (financialsLoading ? (
          <div className="py-10 text-center text-[13px]" style={{ color: C.faint }}><span className="animate-pulse">{t("common.loading")}</span></div>
        ) : financials.length === 0 ? (
          <p className="py-8 text-center text-[13px]" style={{ color: C.faint }}>{t("stock.no_financials")}</p>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-[13px]">
              <thead><tr className="text-left text-[11px]" style={{ color: C.faint, borderBottom: `1px solid ${C.line}` }}>
                <th className="px-2 py-2 font-medium">{t("fin.period")}</th>
                <th className="px-2 py-2 font-medium text-right">{t("fin.revenue")}</th>
                <th className="px-2 py-2 font-medium text-right">{t("fin.op_profit")}</th>
                <th className="px-2 py-2 font-medium text-right">{t("fin.net_profit")}</th>
                <th className="px-2 py-2 font-medium text-right">EPS</th>
                <th className="px-2 py-2 font-medium text-right">ROE</th>
              </tr></thead>
              <tbody>
                {[...financials].sort((a, b) => b.fiscalYear - a.fiscalYear || (b.quarter ?? 99) - (a.quarter ?? 99)).map((f) => (
                  <tr key={f.id} style={{ borderBottom: `1px solid ${C.line}` }}>
                    <td className="px-2 py-2 font-medium" style={{ color: C.ink }}>{lang === "en-US" ? `FY${f.fiscalYear}${f.quarter ? ` Q${f.quarter}` : ""}` : `${f.fiscalYear}${f.quarter ? ` Q${f.quarter}` : t("fin.full_year")}`}</td>
                    <td className="px-2 py-2 text-right tabular-nums" style={{ color: C.sub }}>{f.revenue != null ? (Math.abs(f.revenue) >= 1e8 ? `${(f.revenue / 1e8).toFixed(1)}億` : f.revenue.toLocaleString()) : "—"}</td>
                    <td className="px-2 py-2 text-right tabular-nums" style={{ color: C.sub }}>{f.operatingProfit != null ? (Math.abs(f.operatingProfit) >= 1e8 ? `${(f.operatingProfit / 1e8).toFixed(1)}億` : f.operatingProfit.toLocaleString()) : "—"}</td>
                    <td className="px-2 py-2 text-right tabular-nums" style={{ color: C.sub }}>{f.netProfit != null ? (Math.abs(f.netProfit) >= 1e8 ? `${(f.netProfit / 1e8).toFixed(1)}億` : f.netProfit.toLocaleString()) : "—"}</td>
                    <td className="px-2 py-2 text-right tabular-nums" style={{ color: C.sub }}>{f.eps != null ? `¥${f.eps.toFixed(2)}` : "—"}</td>
                    <td className="px-2 py-2 text-right tabular-nums" style={{ color: C.sub }}>{f.roe != null ? `${(f.roe < 1.5 ? f.roe * 100 : f.roe).toFixed(1)}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {/* ── News ──────────────────────────────────────────────── */}
        {tab === "news" && (news.length === 0 ? (
          <p className="py-8 text-center text-[13px]" style={{ color: C.faint }}>{t("news.no_data")}</p>
        ) : (
          <div className="space-y-2">
            {news.map((item) => {
              const url = item.url.startsWith("tdnet:") ? item.url.slice(6) : item.url;
              const dot = item.sentiment === "POSITIVE" ? C.green : item.sentiment === "NEGATIVE" ? C.red : C.faint;
              return (
                <a key={item.id} href={url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-3 rounded-xl p-3 transition-colors hover:bg-[#F7F7F9]">
                  <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: dot }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium leading-snug line-clamp-2" style={{ color: C.ink }}>{item.title}</div>
                    <div className="flex items-center gap-1.5 mt-1 text-[10px]" style={{ color: C.faint }}>
                      <span>{item.source}</span>{item.publishedAt && <><span>·</span><span>{new Date(item.publishedAt).toLocaleDateString(lang, { month: "numeric", day: "numeric" })}</span></>}
                    </div>
                  </div>
                </a>
              );
            })}
            <Link href={`${ROUTES.NEWS}?symbol=${encodeURIComponent(symbol)}`} className="inline-flex items-center gap-1 text-[12px] font-medium pt-1" style={{ color: C.blue }}>{t("ne.more")} →</Link>
          </div>
        ))}

        {/* ── AI analysis ───────────────────────────────────────── */}
        {tab === "ai" && (score ? (
          <div className="space-y-4">
            <div className="space-y-3">
              <ScoreBar label={t("score.technical")} score={score.technicalScore} max={30} color={C.blue} />
              <ScoreBar label={t("score.fundamental")} score={score.fundamentalScore} max={25} color={C.green} />
              <ScoreBar label={t("score.money_flow")} score={score.moneyFlowScore} max={20} color={C.purple} />
              <ScoreBar label={t("score.sentiment")} score={score.newsSentimentScore} max={15} color={C.amber} />
              <ScoreBar label={t("score.trend")} score={score.globalTrendScore} max={10} color="#06b6d4" />
            </div>
            <div className="flex flex-wrap gap-3 pt-2 text-[12px]" style={{ borderTop: `1px solid ${C.line}` }}>
              {score.stockStyle && <span style={{ color: C.faint }}>{t("stock.style_label")}：<b style={{ color: C.sub }}>{t(`style.${score.stockStyle}` as never)}</b></span>}
              {score.overallConfidence != null && <span style={{ color: C.faint }}>{t("stock.confidence")}：<b style={{ color: score.overallConfidence >= 60 ? C.green : C.amber }}>{score.overallConfidence.toFixed(0)}%</b></span>}
            </div>
            {score.newsSummary && <div className="rounded-xl px-3.5 py-3 text-[12px] leading-relaxed" style={{ background: `${C.amber}0d`, color: C.sub }}><b style={{ color: C.amber }} className="mr-1">{t("score.news_sentiment")}</b>{score.newsSummary}</div>}
          </div>
        ) : <p className="text-[13px]" style={{ color: C.faint }}>{t("stock.no_score")}</p>)}
      </div>
    </div>
  );
}
