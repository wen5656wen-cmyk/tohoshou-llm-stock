"use client";

import { useI18n } from "@/lib/i18n";
import LightweightStockChart, { type ChartBar } from "@/components/charts/LightweightStockChart";
import { fmtJpy, fmtPct } from "@/lib/rec-config";
import { C, retColor } from "./ui";
import type { IndicatorData } from "./ui";

export type TabKey = "price" | "tech";
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
  tab, setTab, ind, chartData, chartPeriod, setChartPeriod, chartLoading, latestClose, latestDate,
}: {
  tab: TabKey; setTab: (t: TabKey) => void; ind: IndicatorData | null;
  chartData: ChartBar[]; chartPeriod: string; setChartPeriod: (k: string) => void; chartLoading: boolean;
  latestClose: number; latestDate: string;
}) {
  const { t } = useI18n();
  const TABS: { key: TabKey; label: string }[] = [{ key: "price", label: "价格走势" }, { key: "tech", label: "技术指标" }];
  const rsi = ind?.rsi14 ?? null;
  const volRatio = (ind?.latestVolume != null && ind?.avgVolume20d != null && ind.avgVolume20d > 0) ? ind.latestVolume / ind.avgVolume20d : null;

  return (
    <div className="dash-card overflow-hidden">
      <div className="flex items-center gap-1 px-4 pt-2.5" style={{ borderBottom: `1px solid ${C.line}` }}>
        {TABS.map((tb) => {
          const on = tb.key === tab;
          return (
            <button key={tb.key} onClick={() => setTab(tb.key)} className="relative px-3.5 py-2.5 text-[13px] font-semibold whitespace-nowrap transition-colors" style={{ color: on ? C.ink : C.faint }}>
              {tb.label}
              {on && <span className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full" style={{ background: C.blue }} />}
            </button>
          );
        })}
      </div>

      <div className="p-5">
        {tab === "price" && (
          <div>
            <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
              <div className="inline-flex p-1 rounded-full" style={{ background: "#F0F0F3", border: `1px solid ${C.line}` }}>
                {CHART_PERIODS.map((p) => {
                  const on = p.key === chartPeriod;
                  return (
                    <button key={p.key} onClick={() => setChartPeriod(p.key)} className="px-3 h-7 rounded-full text-[12px] font-semibold transition-all" style={on ? { background: "#fff", color: C.ink, boxShadow: "0 1px 2px rgba(0,0,0,0.1)" } : { color: C.sub }}>
                      {p.key === "MAX" ? t("common.all") || "最大" : p.key}
                    </button>
                  );
                })}
              </div>
              <span className="text-[11px]" style={{ color: C.faint }}>J-Quants · {latestDate}</span>
            </div>
            {chartLoading || chartData.length === 0 ? (
              <div className="h-[320px] flex items-center justify-center text-[13px]" style={{ color: C.faint }}><span className="animate-pulse">{t("common.loading")}</span></div>
            ) : (
              <>
                <LightweightStockChart data={chartData} height={320} theme="light" />
                <div className="mt-4 pt-3 flex flex-wrap gap-5 text-[12px]" style={{ borderTop: `1px solid ${C.line}`, color: C.faint }}>
                  {[["MA5", ind?.ma5], ["MA20", ind?.ma20], ["MA60", ind?.ma60]].map(([k, v]) => (
                    <span key={k as string}>{k} <b className="tabular-nums" style={{ color: C.sub }}>{v ? `¥${(v as number).toLocaleString()}` : "—"}</b></span>
                  ))}
                  <span>RSI <b className="tabular-nums" style={{ color: C.sub }}>{rsi?.toFixed(1) ?? "—"}</b></span>
                </div>
              </>
            )}
          </div>
        )}

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
                  {rsi != null && <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: "#EEEEF1" }}><div className="h-full rounded-full" style={{ width: `${rsi}%`, background: rsi >= 70 ? C.red : rsi <= 30 ? C.green : C.faint }} /></div>}
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
      </div>
    </div>
  );
}
