"use client";

// ── P18 · AI Mission Lab（M3-v1 · 接管 /decision-v2?tab=portfolio「模拟持仓」）──
// 真实前向实验（Forward Test）：每日 AI 自动决策 → 用户可看可跟随。只读 /api/mission-lab。
// 数据从 2026-07-21（首个交易日）起累计；无数据显空态，绝不伪造。旧 Paper Broker 页(DecisionPortfolioV2)前端下线。
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { AppCard, AppBadge, AppLoading, AppEmptyState } from "@/components/ui";
import type { Tone } from "@/lib/design-tokens";
import { fmtJpy, fmtPct, upDownColor } from "@/lib/decision/ds";

type Decision = { id: string; action: string; symbol: string | null; name: string | null; qty: number | null; status: string; refPrice: number | null; aiScore: number | null; recommendation: string | null; riskLevel: string | null; executionPrice: number | null; followablePriceLow: number | null; followablePriceHigh: number | null; marketPriceAt: string | null; priceSource: string | null; executionWindow: string | null; signalTime: string; decidedAt: string; explainWhy: string };
type Position = { symbol: string; name: string; qty: number; avgCost: number; lastPrice: number | null; marketValue: number; unrealizedPnl: number; unrealizedPct: number; maxUnrealizedGain: number; maxDrawdownPct: number; takeProfitPrice: number | null; stopLossPrice: number | null; openedAt: string };
type NavPt = { date: string; equity: number; returnPct: number; topixReturn: number | null; nikkeiReturn: number | null; alpha: number | null; drawdownPct: number };
type LogItem = { kind: "decision" | "trade"; at: string; action: string; symbol: string | null; name: string | null; qty: number | null; status?: string; price?: number | null; followLow?: number | null; followHigh?: number | null; realizedPnl?: number | null; returnPct?: number | null; isWin?: boolean | null; explainWhy?: string };
type MissionView = {
  id: string; missionType: string; periodLabel: string; status: string; startDate: string; endDate: string; strategyVersion: string;
  summary: { initialCapital: number; cashJpy: number; positionsValue: number; equityJpy: number; realizedPnl: number; returnPct: number; targetPct: number; drawdownPct: number; positionCount: number };
  todayDecisions: Decision[]; latestDay: string | null; positions: Position[]; nav: NavPt[]; log: LogItem[];
};

const ACTION_TONE: Record<string, Tone> = { BUY: "green", ADD: "green", SELL: "red", SL: "red", REDUCE: "amber", TP: "blue", HOLD: "neutral", NO_ACTION: "neutral" };
const fmtClock = (iso: string | null | undefined) => { if (!iso) return "—"; const d = new Date(iso); return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(d); };

export default function MissionLab() {
  const { t } = useI18n();
  const tx = t as (k: string) => string; // 动态键（来自 API 字符串字段）
  const [data, setData] = useState<MissionView[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<"WEEKLY" | "MONTHLY">("WEEKLY");
  const [openEx, setOpenEx] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let on = true;
    fetch("/api/mission-lab").then((r) => r.json()).then((j) => { if (on) { setData(j.missions ?? []); setLoading(false); } }).catch(() => { if (on) { setData([]); setLoading(false); } });
    return () => { on = false; };
  }, []);

  const m = useMemo(() => (data ?? []).find((x) => x.missionType === sel) ?? null, [data, sel]);

  if (loading) return <AppLoading label={t("ml.loading")} />;

  return (
    <div className="flex flex-col gap-4">
      {/* Header + 免责 + Weekly/Monthly 切换 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">🎯 {t("ml.title")}</h1>
          <p className="text-xs text-neutral-500 mt-0.5">{t("ml.subtitle")}</p>
        </div>
        <div className="flex rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden text-sm">
          {(["WEEKLY", "MONTHLY"] as const).map((k) => (
            <button key={k} onClick={() => setSel(k)} className={`px-4 py-1.5 ${sel === k ? "bg-blue-600 text-white" : "bg-transparent text-neutral-500"}`}>{t(`ml.type.${k}`)}</button>
          ))}
        </div>
      </div>

      {!m ? (
        <AppEmptyState icon="🎯" title={t("ml.empty.title")} desc={t("ml.empty.desc")} />
      ) : (
        <>
          {/* ① 汇总 */}
          <AppCard>
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium">{tx(`ml.type.${m.missionType}`)} · {m.periodLabel}</div>
              <AppBadge tone={m.status === "ACTIVE" ? "green" : "neutral"}>{tx(`ml.status.${m.status}`)}</AppBadge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Tile label={t("ml.tile.equity")} value={fmtJpy(m.summary.equityJpy)} />
              <Tile label={t("ml.tile.cash")} value={fmtJpy(m.summary.cashJpy)} />
              <Tile label={t("ml.tile.return")} value={fmtPct(m.summary.returnPct)} color={upDownColor(m.summary.returnPct)} />
              <Tile label={t("ml.tile.target")} value={`+${m.summary.targetPct}%`} sub={progressLabel(tx, m.summary.returnPct, m.summary.targetPct)} />
              <Tile label={t("ml.tile.drawdown")} value={fmtPct(m.summary.drawdownPct)} color={upDownColor(m.summary.drawdownPct)} />
            </div>
            <p className="text-[11px] text-neutral-400 mt-3">{t("ml.disclaimer")}</p>
          </AppCard>

          {/* ② 今日待跟单 */}
          <AppCard>
            <div className="text-sm font-medium mb-2">📌 {t("ml.today.title")} {m.latestDay ? <span className="text-neutral-400 font-normal">· {m.latestDay}</span> : null}</div>
            {m.todayDecisions.length === 0 ? (
              <p className="text-sm text-neutral-400 py-3">{t("ml.today.empty")}</p>
            ) : (
              <div className="flex flex-col divide-y divide-neutral-100 dark:divide-neutral-800">
                {m.todayDecisions.map((d) => (
                  <div key={d.id} className="py-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <AppBadge tone={ACTION_TONE[d.action] ?? "neutral"}>{tx(`ml.act.${d.action}`)}</AppBadge>
                      <span className="font-medium">{d.name ?? d.symbol ?? "—"}</span>
                      {d.qty ? <span className="text-sm text-neutral-500">× {d.qty.toLocaleString()}</span> : null}
                      <span className="ml-auto text-xs">
                        {d.executionPrice != null
                          ? <span className="text-green-600">{t("ml.follow.filled")} {fmtJpy(d.executionPrice)} · {t("ml.follow.range")} {fmtJpy(d.followablePriceLow)}~{fmtJpy(d.followablePriceHigh)}</span>
                          : d.status === "READY_FOR_OPEN" ? <span className="text-blue-600">{t("ml.follow.pending")} · {t("ml.follow.ref")} {fmtJpy(d.refPrice)}</span>
                          : d.status === "SKIPPED" ? <span className="text-neutral-400">{t("ml.follow.skipped")}</span>
                          : <span className="text-neutral-400">{tx(`ml.dstatus.${d.status}`)}</span>}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-neutral-400">
                      <span>{t("ml.f.signal")} {fmtClock(d.signalTime)}</span>
                      {d.marketPriceAt ? <span>{t("ml.f.quote")} {fmtClock(d.marketPriceAt)}{d.priceSource ? ` (${d.priceSource})` : ""}</span> : null}
                      <button className="text-blue-500 hover:underline ml-auto" onClick={() => setOpenEx((s) => ({ ...s, [d.id]: !s[d.id] }))}>{openEx[d.id] ? t("ml.why.hide") : t("ml.why.show")}</button>
                    </div>
                    {openEx[d.id] ? <p className="mt-1.5 text-xs text-neutral-600 dark:text-neutral-300 bg-neutral-50 dark:bg-neutral-800/50 rounded p-2">{d.explainWhy}</p> : null}
                  </div>
                ))}
              </div>
            )}
          </AppCard>

          {/* ③ 持仓 */}
          <AppCard>
            <div className="text-sm font-medium mb-2">📊 {t("ml.holdings.title")} · {m.summary.positionCount}</div>
            {m.positions.length === 0 ? <p className="text-sm text-neutral-400 py-3">{t("ml.holdings.empty")}</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead><tr className="text-xs text-neutral-400 text-left">
                    <th className="py-1 font-normal">{t("ml.h.name")}</th><th className="font-normal text-right">{t("ml.h.qty")}</th><th className="font-normal text-right">{t("ml.h.cost")}</th><th className="font-normal text-right">{t("ml.h.last")}</th><th className="font-normal text-right">{t("ml.h.pnl")}</th><th className="font-normal text-right">{t("ml.h.mv")}</th><th className="font-normal text-right">TP/SL</th>
                  </tr></thead>
                  <tbody>
                    {m.positions.map((p) => (
                      <tr key={p.symbol} className="border-t border-neutral-100 dark:border-neutral-800">
                        <td className="py-1.5">{p.name}<span className="text-neutral-400 text-xs ml-1">{p.symbol}</span></td>
                        <td className="text-right">{p.qty.toLocaleString()}</td>
                        <td className="text-right">{fmtJpy(p.avgCost)}</td>
                        <td className="text-right">{fmtJpy(p.lastPrice)}</td>
                        <td className="text-right" style={{ color: upDownColor(p.unrealizedPct) }}>{fmtPct(p.unrealizedPct)}</td>
                        <td className="text-right">{fmtJpy(p.marketValue)}</td>
                        <td className="text-right text-xs text-neutral-400">{fmtJpy(p.takeProfitPrice)}/{fmtJpy(p.stopLossPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </AppCard>

          {/* ④ 收益曲线 + 基准 */}
          <AppCard>
            <div className="text-sm font-medium mb-2">📈 {t("ml.curve.title")}</div>
            {m.nav.length < 2 ? <p className="text-sm text-neutral-400 py-3">{t("ml.curve.empty")}</p> : <NavCurve nav={m.nav} labels={{ nav: t("ml.curve.nav"), topix: "TOPIX", nikkei: "Nikkei" }} />}
          </AppCard>

          {/* ⑤ 历史决策/成交日志 */}
          <AppCard>
            <div className="text-sm font-medium mb-2">🗒️ {t("ml.log.title")}</div>
            {m.log.length === 0 ? <p className="text-sm text-neutral-400 py-3">{t("ml.log.empty")}</p> : (
              <div className="flex flex-col divide-y divide-neutral-100 dark:divide-neutral-800 max-h-[420px] overflow-y-auto">
                {m.log.map((l, i) => (
                  <div key={i} className="py-2 flex items-center gap-2 text-sm flex-wrap">
                    <span className="text-[11px] text-neutral-400 w-24 shrink-0">{fmtClock(l.at)}</span>
                    <AppBadge tone={l.kind === "trade" ? "blue" : "neutral"}>{l.kind === "trade" ? t("ml.log.trade") : t("ml.log.decision")}</AppBadge>
                    <AppBadge tone={ACTION_TONE[l.action] ?? "neutral"}>{tx(`ml.act.${l.action}`)}</AppBadge>
                    <span>{l.name ?? l.symbol ?? "—"}</span>
                    {l.qty ? <span className="text-neutral-500 text-xs">×{l.qty.toLocaleString()}</span> : null}
                    {l.kind === "trade" && l.price != null ? <span className="text-xs text-neutral-500">@{fmtJpy(l.price)}</span> : null}
                    {l.realizedPnl != null ? <span className="text-xs ml-auto" style={{ color: upDownColor(l.realizedPnl) }}>{fmtJpy(l.realizedPnl)} ({fmtPct(l.returnPct)})</span> : null}
                  </div>
                ))}
              </div>
            )}
          </AppCard>
        </>
      )}
    </div>
  );
}

function Tile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div>
      <div className="text-[11px] text-neutral-400">{label}</div>
      <div className="text-base font-semibold" style={color ? { color } : undefined}>{value}</div>
      {sub ? <div className="text-[11px] text-neutral-400 mt-0.5">{sub}</div> : null}
    </div>
  );
}

function progressLabel(t: (k: string) => string, ret: number, target: number): string {
  const pct = target > 0 ? Math.max(0, Math.min(100, Math.round((ret / target) * 100))) : 0;
  return `${t("ml.tile.progress")} ${pct}%`;
}

// 纯 SVG NAV 曲线（无新依赖）：Mission 收益% vs TOPIX/Nikkei。
function NavCurve({ nav, labels }: { nav: NavPt[]; labels: { nav: string; topix: string; nikkei: string } }): ReactNode {
  const W = 640, H = 180, P = 24;
  const series = [
    { key: "nav", color: "#2563EB", vals: nav.map((n) => n.returnPct) },
    { key: "topix", color: "#94A3B8", vals: nav.map((n) => n.topixReturn ?? null) },
    { key: "nikkei", color: "#CBD5E1", vals: nav.map((n) => n.nikkeiReturn ?? null) },
  ];
  const all = series.flatMap((s) => s.vals).filter((v): v is number => v != null);
  const lo = Math.min(0, ...all), hi = Math.max(0, ...all);
  const x = (i: number) => P + (nav.length <= 1 ? 0 : (i / (nav.length - 1)) * (W - 2 * P));
  const y = (v: number) => H - P - (hi === lo ? 0.5 : (v - lo) / (hi - lo)) * (H - 2 * P);
  const path = (vals: (number | null)[]) => vals.map((v, i) => (v == null ? "" : `${i && vals[i - 1] != null ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)).join(" ");
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[520px]" style={{ maxHeight: 200 }}>
        <line x1={P} y1={y(0)} x2={W - P} y2={y(0)} stroke="#E5E7EB" strokeDasharray="3 3" />
        {series.map((s) => <path key={s.key} d={path(s.vals)} fill="none" stroke={s.color} strokeWidth={s.key === "nav" ? 2 : 1.2} />)}
      </svg>
      <div className="flex gap-4 text-[11px] text-neutral-500 mt-1">
        <span className="flex items-center gap-1"><i className="inline-block w-3 h-0.5 bg-[#2563EB]" />{labels.nav}</span>
        <span className="flex items-center gap-1"><i className="inline-block w-3 h-0.5 bg-[#94A3B8]" />{labels.topix}</span>
        <span className="flex items-center gap-1"><i className="inline-block w-3 h-0.5 bg-[#CBD5E1]" />{labels.nikkei}</span>
      </div>
    </div>
  );
}
