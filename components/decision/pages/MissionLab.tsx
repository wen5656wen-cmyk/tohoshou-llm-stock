"use client";

// ── P18 · AI Mission Lab（M3-v1 · 接管 /decision-v2?tab=portfolio「模拟持仓」）──
// 真实前向实验（Forward Test）：每日 AI 自动决策 → 用户可看可跟随。只读 /api/mission-lab。
// 数据从 2026-07-21（首个交易日）起累计；无数据显精致空态/引导，绝不伪造。
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { AppCard, AppBadge, AppLoading, AppEmptyState, AppTimeline, COLORS, RADIUS } from "@/components/ui";
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
const fmtClock = (iso: string | null | undefined) => { if (!iso) return "—"; return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)); };

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

  const daysLeft = m ? Math.max(0, Math.ceil((new Date(m.endDate).getTime() - Date.now()) / 864e5)) : 0;
  const ret = m?.summary.returnPct ?? 0;
  const target = m?.summary.targetPct ?? 1;
  const progress = Math.max(0, Math.min(100, (ret / target) * 100));

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 flex flex-col gap-4">
      {/* ── 描述 + 分段切换（标题由工作区顶部承载=AI Mission Lab，避免重复）── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs" style={{ color: COLORS.textMuted }}>{t("ml.subtitle")}</p>
        <div className="flex p-0.5 gap-0.5 shrink-0" style={{ background: COLORS.track, borderRadius: RADIUS.lg }}>
          {(["WEEKLY", "MONTHLY"] as const).map((k) => (
            <button key={k} onClick={() => setSel(k)} className="px-4 py-1.5 text-sm font-medium transition-all" style={sel === k ? { background: COLORS.card, color: COLORS.text, borderRadius: RADIUS.md, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" } : { background: "transparent", color: COLORS.textMuted, borderRadius: RADIUS.md }}>{t(`ml.type.${k}`)}</button>
          ))}
        </div>
      </div>

      {!m ? (
        <AppEmptyState icon="🎯" title={t("ml.empty.title")} desc={t("ml.empty.desc")} />
      ) : (
        <>
          {/* ── ① Hero：总资产 + 收益 + 目标进度条 ── */}
          <AppCard padding={22}>
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold" style={{ color: COLORS.text }}>{tx(`ml.type.${m.missionType}`)}</span>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: COLORS.tile, color: COLORS.textSecondary }}>{m.periodLabel}</span>
                <AppBadge tone={m.status === "ACTIVE" ? "green" : "neutral"}>{tx(`ml.status.${m.status}`)}</AppBadge>
              </div>
              <span className="text-xs" style={{ color: COLORS.textMuted }}>{t("ml.hero.remain")} {daysLeft} {t("ml.unit.day")}</span>
            </div>
            <div className="flex items-end gap-4 flex-wrap">
              <div>
                <div className="text-[11px]" style={{ color: COLORS.textMuted }}>{t("ml.tile.equity")}</div>
                <div className="text-[30px] font-bold tabular-nums leading-tight" style={{ color: COLORS.text }}>{fmtJpy(m.summary.equityJpy)}</div>
              </div>
              <div className="pb-1 flex items-baseline gap-1.5">
                <span className="text-lg font-semibold tabular-nums" style={{ color: upDownColor(ret) }}>{fmtPct(ret)}</span>
                <span className="text-xs" style={{ color: COLORS.textFaint }}>/ {t("ml.target.line")} +{m.summary.targetPct}%</span>
              </div>
            </div>
            {/* 目标进度条 */}
            <div className="mt-3">
              <div className="h-2 w-full rounded-full overflow-hidden" style={{ background: COLORS.track }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: ret >= 0 ? COLORS.success : COLORS.danger }} />
              </div>
              <div className="flex justify-between mt-1 text-[10px] tabular-nums" style={{ color: COLORS.textFaint }}>
                <span>{fmtJpy(m.summary.initialCapital)}</span>
                <span>{t("ml.tile.progress")} {Math.round(progress)}%</span>
                <span>+{m.summary.targetPct}%</span>
              </div>
            </div>
            {/* KPI 网格 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px mt-4 rounded-xl overflow-hidden" style={{ background: COLORS.border }}>
              <Kpi label={t("ml.tile.cash")} value={fmtJpy(m.summary.cashJpy)} />
              <Kpi label={t("ml.tile.mv")} value={fmtJpy(m.summary.positionsValue)} sub={`${m.summary.positionCount} ${t("ml.holdings.title")}`} />
              <Kpi label={t("ml.tile.realized")} value={fmtJpy(m.summary.realizedPnl)} color={upDownColor(m.summary.realizedPnl)} />
              <Kpi label={t("ml.tile.drawdown")} value={fmtPct(m.summary.drawdownPct)} color={upDownColor(m.summary.drawdownPct)} />
            </div>
            <p className="text-[11px] mt-3" style={{ color: COLORS.textFaint }}>{t("ml.disclaimer")}</p>
          </AppCard>

          {/* ── 宽屏两列（今日待跟单/持仓 · 曲线/日志），窄屏单列 ── */}
          <div className="grid xl:grid-cols-2 gap-4 items-start">
          {/* ── ② 今日待跟单 ── */}
          <AppCard padding={0} header={<CardTitle icon="📌" title={t("ml.today.title")} right={m.latestDay ?? undefined} />}>
            <div className="p-5">
              {m.todayDecisions.length === 0 ? (
                <div className="flex flex-col items-center text-center py-4">
                  <div className="text-3xl mb-2">🗓️</div>
                  <div className="text-sm font-medium" style={{ color: COLORS.text }}>{t("ml.today.start")}</div>
                  <div className="mt-4 w-full max-w-md text-left">
                    <div className="text-xs font-semibold mb-2" style={{ color: COLORS.textSecondary }}>{t("ml.how.title")}</div>
                    <AppTimeline steps={[
                      { label: t("ml.how.s1"), state: "current" },
                      { label: t("ml.how.s2"), state: "waiting" },
                      { label: t("ml.how.s3"), state: "waiting" },
                    ]} />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {m.todayDecisions.map((d) => (
                    <div key={d.id} className="rounded-xl p-3" style={{ background: COLORS.tile }}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <AppBadge tone={ACTION_TONE[d.action] ?? "neutral"}>{tx(`ml.act.${d.action}`)}</AppBadge>
                        <span className="font-semibold" style={{ color: COLORS.text }}>{d.name ?? d.symbol ?? "—"}</span>
                        {d.qty ? <span className="text-sm" style={{ color: COLORS.textMuted }}>× {d.qty.toLocaleString()}</span> : null}
                        <span className="ml-auto text-xs text-right">
                          {d.executionPrice != null
                            ? <span style={{ color: COLORS.success }}>{t("ml.follow.filled")} {fmtJpy(d.executionPrice)}<br /><b>{t("ml.follow.range")} {fmtJpy(d.followablePriceLow)}~{fmtJpy(d.followablePriceHigh)}</b></span>
                            : d.status === "READY_FOR_OPEN" ? <span style={{ color: COLORS.primary }}>{t("ml.follow.pending")} · {t("ml.follow.ref")} {fmtJpy(d.refPrice)}</span>
                            : d.status === "SKIPPED" ? <span style={{ color: COLORS.textFaint }}>{t("ml.follow.skipped")}</span>
                            : <span style={{ color: COLORS.textFaint }}>{tx(`ml.dstatus.${d.status}`)}</span>}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-[11px]" style={{ color: COLORS.textFaint }}>
                        <span>{t("ml.f.signal")} {fmtClock(d.signalTime)}</span>
                        {d.marketPriceAt ? <span>{t("ml.f.quote")} {fmtClock(d.marketPriceAt)}</span> : null}
                        <button className="ml-auto hover:underline" style={{ color: COLORS.primary }} onClick={() => setOpenEx((s) => ({ ...s, [d.id]: !s[d.id] }))}>{openEx[d.id] ? t("ml.why.hide") : t("ml.why.show")}</button>
                      </div>
                      {openEx[d.id] ? <p className="mt-2 text-xs rounded-lg p-2.5" style={{ color: COLORS.textSecondary, background: COLORS.card }}>{d.explainWhy}</p> : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </AppCard>

          {/* ── ③ 持仓 ── */}
          <AppCard padding={0} header={<CardTitle icon="📊" title={t("ml.holdings.title")} right={m.positions.length ? String(m.summary.positionCount) : undefined} />}>
            <div className="p-5">
              {m.positions.length === 0 ? <EmptyLine text={t("ml.holdings.empty")} /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead><tr style={{ color: COLORS.textFaint }} className="text-[11px] text-left">
                      <th className="pb-2 font-medium">{t("ml.h.name")}</th><Rth>{t("ml.h.qty")}</Rth><Rth>{t("ml.h.cost")}</Rth><Rth>{t("ml.h.last")}</Rth><Rth>{t("ml.h.pnl")}</Rth><Rth>{t("ml.h.mv")}</Rth><Rth>TP/SL</Rth>
                    </tr></thead>
                    <tbody>
                      {m.positions.map((p) => (
                        <tr key={p.symbol} style={{ borderTop: `1px solid ${COLORS.borderSoft}` }}>
                          <td className="py-2" style={{ color: COLORS.text }}>{p.name}<span className="text-xs ml-1" style={{ color: COLORS.textFaint }}>{p.symbol}</span></td>
                          <td className="text-right tabular-nums">{p.qty.toLocaleString()}</td>
                          <td className="text-right tabular-nums">{fmtJpy(p.avgCost)}</td>
                          <td className="text-right tabular-nums">{fmtJpy(p.lastPrice)}</td>
                          <td className="text-right tabular-nums font-medium" style={{ color: upDownColor(p.unrealizedPct) }}>{fmtPct(p.unrealizedPct)}</td>
                          <td className="text-right tabular-nums">{fmtJpy(p.marketValue)}</td>
                          <td className="text-right text-xs tabular-nums" style={{ color: COLORS.textFaint }}>{fmtJpy(p.takeProfitPrice)}/{fmtJpy(p.stopLossPrice)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </AppCard>

          {/* ── ④ 收益曲线 ── */}
          <AppCard padding={0} header={<CardTitle icon="📈" title={t("ml.curve.title")} />}>
            <div className="p-5">
              {m.nav.length < 2 ? <EmptyLine text={t("ml.curve.empty")} /> : <NavCurve nav={m.nav} navLabel={t("ml.curve.nav")} />}
            </div>
          </AppCard>

          {/* ── ⑤ 历史日志 ── */}
          <AppCard padding={0} header={<CardTitle icon="🗒️" title={t("ml.log.title")} />}>
            <div className="p-5">
              {m.log.length === 0 ? <EmptyLine text={t("ml.log.empty")} /> : (
                <div className="flex flex-col max-h-[420px] overflow-y-auto">
                  {m.log.map((l, i) => (
                    <div key={i} className="py-2 flex items-center gap-2 text-sm flex-wrap" style={{ borderTop: i ? `1px solid ${COLORS.borderSoft}` : undefined }}>
                      <span className="text-[11px] w-24 shrink-0 tabular-nums" style={{ color: COLORS.textFaint }}>{fmtClock(l.at)}</span>
                      <AppBadge tone={l.kind === "trade" ? "blue" : "neutral"}>{l.kind === "trade" ? t("ml.log.trade") : t("ml.log.decision")}</AppBadge>
                      <AppBadge tone={ACTION_TONE[l.action] ?? "neutral"}>{tx(`ml.act.${l.action}`)}</AppBadge>
                      <span style={{ color: COLORS.text }}>{l.name ?? l.symbol ?? "—"}</span>
                      {l.qty ? <span className="text-xs tabular-nums" style={{ color: COLORS.textMuted }}>×{l.qty.toLocaleString()}</span> : null}
                      {l.kind === "trade" && l.price != null ? <span className="text-xs tabular-nums" style={{ color: COLORS.textMuted }}>@{fmtJpy(l.price)}</span> : null}
                      {l.realizedPnl != null ? <span className="text-xs ml-auto tabular-nums" style={{ color: upDownColor(l.realizedPnl) }}>{fmtJpy(l.realizedPnl)} ({fmtPct(l.returnPct)})</span> : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </AppCard>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: COLORS.card, padding: 14 }}>
      <div className="text-[11px]" style={{ color: COLORS.textMuted }}>{label}</div>
      <div className="text-[15px] font-semibold tabular-nums mt-1" style={color ? { color } : { color: COLORS.text }}>{value}</div>
      {sub ? <div className="text-[10px] mt-0.5" style={{ color: COLORS.textFaint }}>{sub}</div> : null}
    </div>
  );
}
function CardTitle({ icon, title, right }: { icon: string; title: string; right?: string }) {
  return <div className="flex items-center gap-2"><span className="text-sm font-semibold" style={{ color: COLORS.text }}>{icon} {title}</span>{right ? <span className="ml-auto text-xs" style={{ color: COLORS.textFaint }}>{right}</span> : null}</div>;
}
function Rth({ children }: { children: ReactNode }) { return <th className="pb-2 font-medium text-right">{children}</th>; }
function EmptyLine({ text }: { text: string }) { return <p className="text-sm py-3 text-center" style={{ color: COLORS.textFaint }}>{text}</p>; }

// 纯 SVG NAV 曲线（无新依赖）：Mission 收益% vs TOPIX/Nikkei，带面积填充与零基线。
function NavCurve({ nav, navLabel }: { nav: NavPt[]; navLabel: string }): ReactNode {
  const W = 640, H = 190, P = 26;
  const series = [
    { key: "nav", color: COLORS.primary, w: 2, vals: nav.map((n) => n.returnPct) },
    { key: "topix", color: "#94A3B8", w: 1.2, vals: nav.map((n) => n.topixReturn ?? null) },
    { key: "nikkei", color: "#CBD5E1", w: 1.2, vals: nav.map((n) => n.nikkeiReturn ?? null) },
  ];
  const all = series.flatMap((s) => s.vals).filter((v): v is number => v != null);
  const lo = Math.min(0, ...all), hi = Math.max(0, ...all);
  const x = (i: number) => P + (nav.length <= 1 ? 0 : (i / (nav.length - 1)) * (W - 2 * P));
  const y = (v: number) => H - P - (hi === lo ? 0.5 : (v - lo) / (hi - lo)) * (H - 2 * P);
  const line = (vals: (number | null)[]) => vals.map((v, i) => (v == null ? "" : `${i && vals[i - 1] != null ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)).join(" ");
  const navVals = series[0].vals;
  const area = `${line(navVals)} L${x(nav.length - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[520px]" style={{ maxHeight: 210 }}>
        <defs><linearGradient id="mlNav" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={COLORS.primary} stopOpacity="0.16" /><stop offset="100%" stopColor={COLORS.primary} stopOpacity="0" /></linearGradient></defs>
        <line x1={P} y1={y(0)} x2={W - P} y2={y(0)} stroke={COLORS.border} strokeDasharray="3 3" />
        <path d={area} fill="url(#mlNav)" stroke="none" />
        {series.map((s) => <path key={s.key} d={line(s.vals)} fill="none" stroke={s.color} strokeWidth={s.w} strokeLinejoin="round" />)}
      </svg>
      <div className="flex gap-4 text-[11px] mt-1" style={{ color: COLORS.textMuted }}>
        <Leg c={COLORS.primary} label={navLabel} /><Leg c="#94A3B8" label="TOPIX" /><Leg c="#CBD5E1" label="Nikkei" />
      </div>
    </div>
  );
}
function Leg({ c, label }: { c: string; label: string }) { return <span className="flex items-center gap-1"><i className="inline-block w-3 h-0.5" style={{ background: c }} />{label}</span>; }
