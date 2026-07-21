"use client";

// ── P18 · AI Mission Lab（M3-v1 · 接管 /decision-v2?tab=portfolio「模拟持仓」）──
// 真实前向实验（Forward Test）：每日 AI 自动决策 → 用户可看可跟随。只读 /api/mission-lab。
// 数据从 2026-07-21（首个交易日）起累计；无数据显精致空态/引导，绝不伪造。
//
// M1.1 实时行情（展示层增强）：交易时段（09:00–11:30 / 12:30–15:30 JST）每 30 秒轮询
// 只读 /api/mission-lab/quotes，仅覆盖「行情/市值/浮盈/NAV/KPI/基准」等展示值；
// 成本价·成交价·成交时间·Signal Time·Explain·建议成交区间 永远取自 /api/mission-lab，
// 不参与刷新、不被覆盖。收盘后停止轮询并保留最后一次行情。
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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

// ── M1.1 实时行情载荷（只读 /api/mission-lab/quotes；均为展示投影，不落库）──
type LivePos = { symbol: string; status: "LIVE" | "STALE"; lastPrice: number; previousClose: number | null; todayChange: number | null; todayChangePct: number | null; marketValue: number; unrealizedPnl: number; unrealizedPct: number; quoteAt: string | null };
type LiveMission = { id: string; missionType: string; live: { equityJpy: number; positionsValue: number; cashJpy: number; realizedPnl: number; returnPct: number; todayPnl: number; todayPct: number; todayBaseline: string; alpha: number | null; topixCumPct: number | null; nikkeiCumPct: number | null; positionCount: number; quotedCount: number }; positions: LivePos[] };
type LivePayload = { asOf: string; session: string; marketOpen: boolean; tradingDay: boolean; dateIso: string; pollMs: number; priceSource: string; marketPriceAt: string | null; quoteAgeSec: number | null; noQuote: boolean; quoteError: string | null; benchmarks: { topix: Bench | null; nikkei: Bench | null }; missions: LiveMission[] };
type Bench = { level: number; changePct: number | null; at: string | null; live: boolean };

const ACTION_TONE: Record<string, Tone> = { BUY: "green", ADD: "green", SELL: "red", SL: "red", REDUCE: "amber", TP: "blue", HOLD: "neutral", NO_ACTION: "neutral" };
const fmtClock = (iso: string | null | undefined) => { if (!iso) return "—"; return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)); };
const fmtStamp = (iso: string | null | undefined) => { if (!iso) return "—"; return `${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(iso)).replace(",", "")} JST`; };
const fmtHm = (iso: string | null | undefined) => { if (!iso) return "—"; return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)); };

// JST 交易时段判定（客户端轮询闸门：收盘期间零请求，09:00 到点自动恢复）
const jstNow = () => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).split(":").map(Number);
const jstToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
function jstSessionOpen(): boolean {
  const [h, mi] = jstNow();
  const t = h * 60 + mi;
  return (t >= 9 * 60 && t < 11 * 60 + 30) || (t >= 12 * 60 + 30 && t <= 15 * 60 + 30);
}

/** 交易时段每 30 秒拉一次实时行情；失败保留上一笔并提示重试；收盘不发请求。
 *  refreshAgeSec = 距上次**成功**刷新的秒数（>90 秒 = 轮询异常 → 黄色告警）。 */
function useLiveQuotes() {
  const [live, setLive] = useState<LivePayload | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshAgeSec, setRefreshAgeSec] = useState<number | null>(null);
  const stateRef = useRef<{ tradingDay: boolean; dateIso: string } | null>(null);
  const okAtRef = useRef<number | null>(null);

  useEffect(() => {
    let on = true;
    const pull = async () => {
      try {
        const r = await fetch("/api/mission-lab/quotes", { cache: "no-store" });
        const j = (await r.json()) as LivePayload & { error?: string };
        if (!on) return;
        if (!r.ok || j.error) { setFailed(true); return; } // 不清空数据
        stateRef.current = { tradingDay: !!j.tradingDay, dateIso: j.dateIso };
        okAtRef.current = Date.now();
        setLive(j); setFailed(false); setRefreshAgeSec(0);
      } catch { if (on) setFailed(true); }
    };
    pull(); // 首屏一次（无论开收盘），用于确定交易日与最后行情
    const timer = setInterval(() => {
      if (okAtRef.current != null) setRefreshAgeSec(Math.round((Date.now() - okAtRef.current) / 1000));
      const s = stateRef.current;
      if (!s || s.dateIso !== jstToday()) { pull(); return; } // 跨日 → 重新确认交易日状态
      if (s.tradingDay && jstSessionOpen()) pull();           // 非交易时间：停止轮询
    }, 30_000);
    return () => { on = false; clearInterval(timer); };
  }, []);

  return { live, failed, refreshAgeSec };
}

export default function MissionLab() {
  const { t } = useI18n();
  const tx = t as (k: string) => string; // 动态键（来自 API 字符串字段）
  const [data, setData] = useState<MissionView[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<"WEEKLY" | "MONTHLY">("WEEKLY");
  const [openEx, setOpenEx] = useState<Record<string, boolean>>({});
  const { live, failed, refreshAgeSec } = useLiveQuotes();

  useEffect(() => {
    let on = true;
    fetch("/api/mission-lab").then((r) => r.json()).then((j) => { if (on) { setData(j.missions ?? []); setLoading(false); } }).catch(() => { if (on) { setData([]); setLoading(false); } });
    return () => { on = false; };
  }, []);

  const m = useMemo(() => (data ?? []).find((x) => x.missionType === sel) ?? null, [data, sel]);
  // 实时覆盖层：仅展示值，历史/成交/Explain 一律不参与
  const lm = useMemo(() => (m && live ? live.missions.find((x) => x.id === m.id) ?? null : null), [m, live]);
  const livePos = useMemo(() => new Map((lm?.positions ?? []).map((p) => [p.symbol, p])), [lm]);
  if (loading) return <AppLoading label={t("ml.loading")} />;

  const daysLeft = m ? Math.max(0, Math.ceil((new Date(m.endDate).getTime() - Date.now()) / 864e5)) : 0;
  const equity = lm?.live.equityJpy ?? m?.summary.equityJpy ?? 0;
  const ret = lm?.live.returnPct ?? m?.summary.returnPct ?? 0;
  const cashJpy = lm?.live.cashJpy ?? m?.summary.cashJpy ?? 0;
  const mvJpy = lm?.live.positionsValue ?? m?.summary.positionsValue ?? 0;
  const target = m?.summary.targetPct ?? 1;
  const progress = Math.max(0, Math.min(100, (ret / target) * 100));

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 flex flex-col gap-4">
      {/* ── 行情状态条 + 分段切换合并为一行（标题由工作区顶部承载，避免重复）── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <QuoteStatusBar live={live} failed={failed} refreshAgeSec={refreshAgeSec} t={tx} />
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
                <div className="text-[30px] font-bold tabular-nums leading-tight" style={{ color: COLORS.text }}>{fmtJpy(equity)}</div>
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
              <Kpi label={t("ml.tile.today")} value={lm ? fmtJpy(lm.live.todayPnl) : "—"} sub={lm ? fmtPct(lm.live.todayPct, 2) : undefined} color={upDownColor(lm?.live.todayPnl)} />
              {/* 首日（无昨日 NAV）累计收益必然 == 今日收益 → 换成互补信息「距目标」，次日起自动恢复 */}
              {lm?.live.todayBaseline === "INITIAL"
                ? <Kpi label={t("ml.tile.toTarget")} value={fmtPct(target - ret, 2)} sub={`${t("ml.target.line")} +${m.summary.targetPct}%`} />
                : <Kpi label={t("ml.tile.return")} value={fmtPct(ret, 2)} sub={fmtJpy(equity - m.summary.initialCapital)} color={upDownColor(ret)} />}
              <Kpi label={t("ml.tile.cash")} value={fmtJpy(cashJpy)} />
              <Kpi label={t("ml.tile.mv")} value={fmtJpy(mvJpy)} sub={`${m.summary.positionCount} ${t("ml.holdings.title")}`} />
              <Kpi label={t("ml.tile.alpha")} value={fmtPct(lm?.live.alpha ?? null, 2)} color={upDownColor(lm?.live.alpha)} />
              <Kpi label="TOPIX" value={fmtPct(lm?.live.topixCumPct ?? null, 2)} sub={live?.benchmarks.topix ? `${live.benchmarks.topix.level.toLocaleString("en-US")} (${fmtPct(live.benchmarks.topix.changePct, 2)})` : undefined} color={upDownColor(lm?.live.topixCumPct)} />
              <Kpi label="Nikkei225" value={fmtPct(lm?.live.nikkeiCumPct ?? null, 2)} sub={live?.benchmarks.nikkei ? `${live.benchmarks.nikkei.level.toLocaleString("en-US")} (${fmtPct(live.benchmarks.nikkei.changePct, 2)})` : undefined} color={upDownColor(lm?.live.nikkeiCumPct)} />
              <Kpi label={t("ml.tile.realized")} value={fmtJpy(m.summary.realizedPnl)} sub={`${t("ml.tile.drawdown")} ${fmtPct(m.summary.drawdownPct, 2)}`} color={upDownColor(m.summary.realizedPnl)} />
            </div>
            {/* 描述与免责合并为一行小字（顶部让位给行情状态条） */}
            <p className="text-[11px] mt-3" style={{ color: COLORS.textFaint }}>{t("ml.subtitle")} · {t("ml.disclaimer")}</p>
          </AppCard>

          {/* ── 宽屏两列瀑布流（按高度自动平衡，避免「待跟单很高 / 持仓很矮」导致右下大片留白）；窄屏单列按 DOM 顺序 ── */}
          <div className="flex flex-col gap-4 xl:block xl:columns-2 xl:gap-4 xl:[&>*]:mb-4 xl:[&>*]:break-inside-avoid">
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
                  <table className="w-full text-[13px] min-w-[520px] whitespace-nowrap">
                    <thead><tr style={{ color: COLORS.textFaint }} className="text-[11px] text-left">
                      <th className="pb-2 font-medium">{t("ml.h.name")}</th><Rth>{`${t("ml.h.qty")} / ${t("ml.h.cost")}`}</Rth><Rth>{`${t("ml.h.last")} / ${t("ml.h.at")}`}</Rth><Rth>{t("ml.h.today")}</Rth><Rth>{t("ml.h.upnl")}</Rth><Rth>{t("ml.h.mv")}</Rth><Rth>TP/SL</Rth>
                    </tr></thead>
                    <tbody>
                      {m.positions.map((p) => {
                        const q = livePos.get(p.symbol);                       // 有实时则用实时，无则保留最后一笔
                        const halted = q?.status === "STALE";                  // 停牌 / 无报价 → 灰色
                        const last = q?.lastPrice ?? p.lastPrice;
                        const uPnl = q?.unrealizedPnl ?? p.unrealizedPnl;
                        const uPct = q?.unrealizedPct ?? p.unrealizedPct;
                        const mv = q?.marketValue ?? p.marketValue;
                        const dayPct = q?.todayChangePct ?? null;
                        const grey = COLORS.textFaint;
                        return (
                          <tr key={p.symbol} style={{ borderTop: `1px solid ${COLORS.borderSoft}` }}>
                            <td className="py-2 max-w-[118px]" style={{ color: COLORS.text }}>
                              <span className="block truncate">{p.name}</span>
                              <span className="block text-[10px]" style={{ color: COLORS.textFaint }}>{p.symbol}</span>
                            </td>
                            {/* 数量 × 成本价：永不参与行情刷新 */}
                            <td className="text-right tabular-nums">
                              {p.qty.toLocaleString()}
                              <span className="block text-[10px]" style={{ color: COLORS.textFaint }}>{fmtJpy(p.avgCost)}</span>
                            </td>
                            <td className="text-right tabular-nums font-medium" style={{ color: halted ? grey : COLORS.text }}>
                              {fmtJpy(last)}
                              <span className="block text-[10px] font-normal" style={{ color: halted ? grey : COLORS.textFaint }}>{halted ? t("ml.rt.halt") : fmtHm(q?.quoteAt)}</span>
                            </td>
                            <td className="text-right tabular-nums" style={{ color: halted ? grey : upDownColor(dayPct) }}>
                              {halted || dayPct == null ? "—" : <>{fmtPct(dayPct, 2)}<span className="block text-[10px]">{fmtJpy(q?.todayChange)}</span></>}
                            </td>
                            <td className="text-right tabular-nums font-medium" style={{ color: halted ? grey : upDownColor(uPct) }}>
                              {fmtJpy(uPnl)}<span className="block text-[10px]">{fmtPct(uPct, 2)}</span>
                            </td>
                            <td className="text-right tabular-nums" style={{ color: halted ? grey : undefined }}>{fmtJpy(mv)}</td>
                            {/* 止盈/止损上下两行，避免窄栏下被裁 */}
                            <td className="text-right text-[10px] leading-tight tabular-nums" style={{ color: COLORS.textFaint }}>
                              <span className="block" style={{ color: COLORS.success }}>{fmtJpy(p.takeProfitPrice)}</span>
                              <span className="block" style={{ color: COLORS.danger }}>{fmtJpy(p.stopLossPrice)}</span>
                            </td>
                          </tr>
                        );
                      })}
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

// ── M1.1 行情状态条：状态点 + 最后更新时间(JST) + 数据源；刷新超时/失败告警 ──
// 「最后更新」显示 Yahoo 真实报价戳；Yahoo 免费源对日股约延迟 15 分钟 → 如实标注 (延迟 N 分)。
function QuoteStatusBar({ live, failed, refreshAgeSec, t }: { live: LivePayload | null; failed: boolean; refreshAgeSec: number | null; t: (k: string) => string }) {
  const open = !!live?.marketOpen;
  const staleRefresh = open && (live?.noQuote || (refreshAgeSec != null && refreshAgeSec > 90)); // 轮询卡住
  const state = failed ? "fail" : !live ? "idle" : !open ? "closed" : staleRefresh ? "delay" : "live";
  const cfg: Record<string, { dot: string; text: string; bg: string; label: string }> = {
    live: { dot: COLORS.success, text: COLORS.success, bg: "transparent", label: t("ml.rt.live") },
    delay: { dot: COLORS.warning, text: COLORS.warning, bg: `${COLORS.warning}14`, label: t("ml.rt.delay") },
    fail: { dot: COLORS.danger, text: COLORS.danger, bg: `${COLORS.danger}14`, label: t("ml.rt.fail") },
    closed: { dot: COLORS.textFaint, text: COLORS.textMuted, bg: "transparent", label: t("ml.rt.closed") },
    idle: { dot: COLORS.textFaint, text: COLORS.textMuted, bg: "transparent", label: t("ml.rt.closed") },
  };
  const c = cfg[state];
  return (
    <div className="flex items-center gap-2 flex-wrap text-[11px] px-3 py-2 rounded-lg" style={{ background: c.bg === "transparent" ? COLORS.tile : c.bg, color: COLORS.textMuted }}>
      <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: c.dot }} />
      <span className="font-medium" style={{ color: c.text }}>{c.label}</span>
      <span style={{ color: COLORS.textFaint }}>·</span>
      <span>{t("ml.rt.updated")} <b className="tabular-nums font-medium" style={{ color: COLORS.textSecondary }}>{fmtStamp(live?.marketPriceAt ?? live?.asOf ?? null)}</b></span>
      {live?.quoteAgeSec != null && live.quoteAgeSec >= 60 ? (
        <span style={{ color: COLORS.textFaint }}>（{t("ml.rt.lag")} {Math.round(live.quoteAgeSec / 60)} {t("ml.rt.min")}）</span>
      ) : null}
      <span style={{ color: COLORS.textFaint }}>·</span>
      <span>{t("ml.rt.source")} {live?.priceSource ?? "Yahoo Finance"}</span>
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
