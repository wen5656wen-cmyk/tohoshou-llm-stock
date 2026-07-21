"use client";

// ── AI 战绩档案 Track Record（P19-T1 · /decision-v2?tab=history）─────────────────
// 全站**唯一**业绩验证入口，回答「AI 到底准不准、凭什么信它」。
// 三条**口径不同、绝不合并**的业绩线：
//   ① 信号线 = AI 推荐 TOP10 前瞻表现（纸面，未扣成本）
//   ② 实验线 = Mission Lab 每期战绩（前向实验，含滑点）
//   ③ 账户线 = 我的真实账户平仓战绩（真实，含手续费）
//
// 数据 SSOT = GET /api/decision/track-record（后端聚合，前端零指标计算）。
// 硬规则：每笔收益/Alpha 一律来自落库字段；样本 < sampleRule.minSample 一律灰显 + 标样本量 +
// 不给结论；三线口径徽章常驻；绝不出现合并后的「总胜率」。
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { AppCard, AppBadge, AppLoading } from "@/components/ui";
import type { Tone } from "@/lib/design-tokens";
import { COLORS, fmtJpy, fmtPct, fmtScore, upDownColor } from "@/lib/decision/ds";
import StockDetailModal, { type ReportTarget } from "@/components/decision/StockDetailModal";

const HORIZONS = ["1d", "3d", "5d", "7d", "10d"] as const;
type Horizon = (typeof HORIZONS)[number];
type SliceTab = "byScore" | "byStyle" | "bySector" | "byHorizon";

type Stat = { n: number; hitRate: number | null; avgReturn: number | null; medianReturn: number | null; alpha: number | null; sufficient: boolean };
type SliceRow = Stat & { key: string; label: string };
type Extreme = { symbol: string; name: string | null; returnPct: number } | null;
type SigRec = { date: string | null; symbol: string; name: string; buyPrice: number | null; returnPct: number | null; alpha: number | null; win: boolean | null; aiScore: number | null; style: string | null; sector: string | null; recommendation: string | null; status: "SETTLED" | "PENDING" };
type Signal = {
  available: boolean; error?: string; horizon: Horizon;
  horizonsAvailable: { horizon: Horizon; settled: number; cohortDays: number }[];
  summary: { settled: number; pending: number; cohortDays: number; hitRate: number | null; avgReturn: number | null; medianReturn: number | null; alpha: number | null; best: Extreme; worst: Extreme; sufficient: boolean };
  byCohort: (Stat & { date: string; count: number; settled: number })[];
  slices: Record<SliceTab, SliceRow[]>;
  coverage: { total: number; withStyle: number; withSector: number; settled: number; settledWithStyle: number; settledWithSector: number };
  records: SigRec[];
  footnote: { totalRecommendations: number; note: string };
};
type MissionRow = { id: string; missionType: string; periodLabel: string; status: string; startDate: string | null; endDate: string | null; daysLeft: number | null; initialCapital: number; equityJpy: number; returnPct: number | null; targetPct: number; achievedPct: number | null; maxDrawdownPct: number | null; topixReturn: number | null; nikkeiReturn: number | null; alpha: number | null; trades: number; closedTrades: number; winRate: number | null; navDays: number };
type Experiment = { available: boolean; error?: string; missions: MissionRow[]; aggregate: { total: number; active: number; finished: number; achieved: number; achieveRate: number | null; avgReturn: number | null; avgAlpha: number | null; sufficient: boolean } };
type AccRec = { tradeDate: string | null; symbol: string; name: string; shares: number; price: number; returnPct: number | null; realizedPnl: number | null; holdingDays: number | null; benchTopixPct: number | null; excessPct: number | null; reason: string | null };
type Account = { available: boolean; error?: string; summary: { closed: number; openHoldings: number; winRate: number | null; avgReturn: number | null; medianReturn: number | null; avgHoldingDays: number | null; profitFactor: number | null; beatTopixRate: number | null; realizedPnlTotal: number; sufficient: boolean }; records: AccRec[] };
type Payload = { asOf: string; sampleRule: { minSample: number; note: string }; signal?: Signal; experiment?: Experiment; account?: Account; comparison: { renderable: boolean; reason: string | null; rows: { line: string; basis: string; n: number; rate: number | null; avgReturn: number | null; alpha: number | null; benchmark: string }[]; note: string } };

export default function DecisionHistoryV2() {
  const { t } = useI18n();
  const tx = t as (k: string) => string;
  const router = useRouter();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [horizon, setHorizon] = useState<Horizon>("7d");
  const [slice, setSlice] = useState<SliceTab>("byScore");
  const [target, setTarget] = useState<ReportTarget | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/decision/track-record?horizon=${horizon}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (alive) { setData(j); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [horizon]);

  const openDetail = useCallback((symbol: string, name?: string) => setTarget({ symbol, name: name ?? symbol }), []);
  const minN = data?.sampleRule.minSample ?? 20;
  const sig = data?.signal, exp = data?.experiment, acc = data?.account;

  // 已结算样本内的 feat_* 覆盖（决定风格/行业切片是否可用；与全池覆盖率是两回事）
  const sliceUsable = useMemo(() => ({
    byScore: true, byHorizon: true,
    byStyle: (sig?.coverage.settledWithStyle ?? 0) > 0,
    bySector: (sig?.coverage.settledWithSector ?? 0) > 0,
  }), [sig]);

  if (loading && !data) return <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-10"><AppLoading label={t("tr.loading")} /></div>;

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 space-y-3">
      {/* 口径条 */}
      <div className="flex items-center gap-2 flex-wrap text-[11px] px-3 py-2 rounded-lg" style={{ background: COLORS.tile, color: COLORS.textMuted }}>
        <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ background: COLORS.textFaint }} />
        <b style={{ color: COLORS.textSecondary }}>{t("tr.asOf")} {data?.asOf ?? "—"}</b>
        <span>·</span><span>{t("tr.l.signal")} {sig?.summary.cohortDays ?? 0} {t("tr.unit.cohort")}</span>
        <span>·</span><span>{t("tr.l.experiment")} {exp?.aggregate.total ?? 0} {t("tr.unit.period")}</span>
        <span>·</span><span>{t("tr.l.account")} {acc?.summary.closed ?? 0} {t("tr.unit.closed")}</span>
      </div>

      {/* ① 三线总览 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <LineCard
          title={t("tr.l.signal")} basis={t("tr.basis.signal")} tone="blue"
          main={{ label: t("tr.m.hitRate"), value: sig?.summary.hitRate != null ? `${Math.round(sig.summary.hitRate)}%` : "—" }}
          rows={[
            { k: t("tr.f.settled"), v: `${sig?.summary.settled ?? 0} ${t("tr.unit.trade")} / ${sig?.summary.cohortDays ?? 0} ${t("tr.unit.cohort")}` },
            { k: t("tr.f.avgReturn"), v: fmtPct(sig?.summary.avgReturn ?? null, 2), tone: upDownColor(sig?.summary.avgReturn) },
            { k: "Alpha", v: fmtPct(sig?.summary.alpha ?? null, 2), tone: upDownColor(sig?.summary.alpha) },
          ]}
          state={sig?.summary.sufficient ? { kind: "ok", text: `${t("tr.enough")} N=${sig.summary.settled}` } : { kind: "warn", text: `${t("tr.notEnough")} N=${sig?.summary.settled ?? 0}<${minN}` }}
          onClick={() => document.getElementById("tr-signal")?.scrollIntoView({ behavior: "smooth", block: "start" })}
        />
        <LineCard
          title={t("tr.l.experiment")} basis={t("tr.basis.experiment")} tone="green"
          main={{ label: t("tr.m.achieve"), value: exp?.aggregate.achieveRate != null ? `${Math.round(exp.aggregate.achieveRate)}%` : "—" }}
          rows={[
            { k: t("tr.f.period"), v: `${exp?.aggregate.active ?? 0} ${t("tr.f.active")} / ${exp?.aggregate.finished ?? 0} ${t("tr.f.finished")}` },
            ...(exp?.missions ?? []).slice(0, 2).map((m) => ({ k: m.periodLabel, v: `${fmtPct(m.returnPct, 2)} / +${m.targetPct}%`, tone: upDownColor(m.returnPct) })),
          ]}
          state={(exp?.aggregate.finished ?? 0) > 0 ? { kind: "ok", text: `${t("tr.f.finished")} ${exp!.aggregate.finished}` } : { kind: "pending", text: t("tr.exp.running") }}
          onClick={() => document.getElementById("tr-exp")?.scrollIntoView({ behavior: "smooth", block: "start" })}
        />
        <LineCard
          title={t("tr.l.account")} basis={t("tr.basis.account")} tone="amber"
          main={{ label: t("tr.m.winRate"), value: acc?.summary.winRate != null && acc.summary.closed > 0 ? `${Math.round(acc.summary.winRate)}%` : "—" }}
          rows={[
            { k: t("tr.f.closed"), v: `${acc?.summary.closed ?? 0} ${t("tr.unit.trade")}` },
            { k: t("tr.f.avgReturn"), v: fmtPct(acc?.summary.avgReturn ?? null, 2), tone: upDownColor(acc?.summary.avgReturn) },
            { k: t("tr.f.avgDays"), v: acc?.summary.avgHoldingDays != null ? `${acc.summary.avgHoldingDays} ${t("tr.unit.day")}` : "—" },
          ]}
          state={acc?.summary.sufficient ? { kind: "ok", text: `${t("tr.enough")} N=${acc.summary.closed}` } : { kind: "warn", text: `${t("tr.notEnough")} N=${acc?.summary.closed ?? 0}<${minN}` }}
          onClick={() => document.getElementById("tr-acc")?.scrollIntoView({ behavior: "smooth", block: "start" })}
        />
      </div>

      {/* ② 信号线详情 */}
      <div id="tr-signal">
        <AppCard header={
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="flex items-center gap-2">
              <span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>📶 {t("tr.l.signal")}</span>
              <AppBadge tone="blue">{t("tr.basis.signal")}</AppBadge>
            </span>
            {/* 持有期切换：默认 7d；切换后所有统计随之改变，标签常显当前口径，禁止混算 */}
            <span className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px]" style={{ color: COLORS.textFaint }}>{t("tr.horizon")}</span>
              {HORIZONS.map((h) => {
                const meta = sig?.horizonsAvailable.find((x) => x.horizon === h);
                const on = horizon === h;
                return (
                  <button key={h} onClick={() => setHorizon(h)} className="h-6 px-2 rounded-full text-[11px] tabular-nums"
                    style={{ background: on ? COLORS.text : COLORS.tile, color: on ? "#fff" : COLORS.textSecondary }}>
                    {h}<span className="ml-1 opacity-70">{meta?.settled ?? 0}</span>
                  </button>
                );
              })}
            </span>
          </div>}>
          {!sig?.available ? <Empty text={t("tr.empty.signal")} /> : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                <Stat k={t("tr.f.settled")} v={`${sig.summary.settled}`} sub={`${sig.summary.cohortDays} ${t("tr.unit.cohort")} · ${t("tr.f.pending")} ${sig.summary.pending}`} />
                <Stat k={t("tr.m.hitRate")} v={sig.summary.hitRate != null ? `${sig.summary.hitRate}%` : "—"} dim={!sig.summary.sufficient} />
                <Stat k={t("tr.f.avgReturn")} v={fmtPct(sig.summary.avgReturn, 2)} tone={upDownColor(sig.summary.avgReturn)} dim={!sig.summary.sufficient} />
                <Stat k={t("tr.f.median")} v={fmtPct(sig.summary.medianReturn, 2)} tone={upDownColor(sig.summary.medianReturn)} dim={!sig.summary.sufficient} />
                <Stat k="Alpha vs TOPIX" v={fmtPct(sig.summary.alpha, 2)} tone={upDownColor(sig.summary.alpha)} dim={!sig.summary.sufficient} />
                <Stat k={t("tr.f.bestWorst")} v={sig.summary.best ? fmtPct(sig.summary.best.returnPct, 1) : "—"} tone={COLORS.success}
                  sub={sig.summary.worst ? `${fmtPct(sig.summary.worst.returnPct, 1)} ${sig.summary.worst.symbol}` : undefined} />
              </div>
              <div className="text-[10px] mt-2 flex items-center gap-2 flex-wrap" style={{ color: COLORS.textFaint }}>
                <span>{t("tr.horizonNote").replace("{h}", horizon)}</span>
                {!sig.summary.sufficient && <AppBadge tone="amber">{t("tr.notEnough")} N={sig.summary.settled}&lt;{minN}</AppBadge>}
              </div>

              {/* 按决策日的 TOP10 平均收益 */}
              <div className="mt-3">
                <div className="text-[11px] mb-1.5" style={{ color: COLORS.textSecondary }}>{t("tr.byCohort")}</div>
                <CohortBars rows={sig.byCohort} pendingLabel={t("tr.f.pending")} />
              </div>

              {/* 切片 */}
              <div className="mt-4">
                <div className="flex items-center gap-1.5 flex-wrap mb-2">
                  <span className="text-[11px]" style={{ color: COLORS.textSecondary }}>{t("tr.slices")}</span>
                  {(["byScore", "byStyle", "bySector", "byHorizon"] as const).map((s) => (
                    <button key={s} onClick={() => setSlice(s)} className="h-6 px-2.5 rounded-full text-[11px]"
                      style={{ background: slice === s ? COLORS.text : COLORS.tile, color: slice === s ? "#fff" : COLORS.textSecondary, opacity: sliceUsable[s] ? 1 : 0.5 }}>
                      {tx(`tr.slice.${s}`)}
                    </button>
                  ))}
                </div>
                {!sliceUsable[slice] ? (
                  <div className="text-[11px] rounded-lg p-3" style={{ background: COLORS.tile, color: COLORS.textMuted }}>
                    {t("tr.slice.unavailable")}
                    <div className="mt-1 text-[10px]" style={{ color: COLORS.textFaint }}>
                      {t("tr.slice.coverage")
                        .replace("{a}", String(slice === "byStyle" ? sig.coverage.settledWithStyle : sig.coverage.settledWithSector))
                        .replace("{b}", String(sig.coverage.settled))
                        .replace("{c}", String(slice === "byStyle" ? sig.coverage.withStyle : sig.coverage.withSector))
                        .replace("{d}", String(sig.coverage.total))}
                    </div>
                  </div>
                ) : <SliceTable rows={sig.slices[slice]} minN={minN} t={t} />}
              </div>

              {/* 决策记录 */}
              <div className="mt-4">
                <div className="text-[11px] mb-1.5" style={{ color: COLORS.textSecondary }}>{t("tr.records")} <span style={{ color: COLORS.textFaint }}>({sig.records.length})</span></div>
                <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                  <table className="w-full text-[12px] min-w-[720px]">
                    <thead><tr className="text-[10px] text-left" style={{ color: COLORS.textFaint }}>
                      <th className="pb-1.5 font-medium">{t("tr.c.date")}</th><th className="pb-1.5 font-medium">{t("tr.c.stock")}</th>
                      <Rth>{t("tr.c.buyPrice")}</Rth><Rth>{t("tr.c.return")}</Rth><Rth>Alpha</Rth><Rth>AI</Rth>
                      <th className="pb-1.5 font-medium px-2">{t("tr.c.status")}</th>
                    </tr></thead>
                    <tbody>
                      {sig.records.map((r, i) => (
                        <tr key={`${r.date}-${r.symbol}-${i}`} onClick={() => openDetail(r.symbol, r.name)} className="cursor-pointer" style={{ borderTop: `1px solid ${COLORS.borderSoft}` }}>
                          <td className="py-1.5 tabular-nums" style={{ color: COLORS.textMuted }}>{r.date}</td>
                          <td className="py-1.5"><span style={{ color: COLORS.text }}>{r.name}</span><span className="ml-1 text-[10px] font-mono" style={{ color: COLORS.textFaint }}>{r.symbol}</span></td>
                          <td className="py-1.5 px-2 text-right tabular-nums">{fmtJpy(r.buyPrice)}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums font-medium" style={{ color: upDownColor(r.returnPct) }}>{r.returnPct != null ? fmtPct(r.returnPct, 1) : "—"}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums" style={{ color: upDownColor(r.alpha) }}>{r.alpha != null ? fmtPct(r.alpha, 1) : "—"}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums">{fmtScore(r.aiScore)}</td>
                          <td className="py-1.5 px-2">{r.status === "SETTLED"
                            ? <AppBadge tone={r.win ? "green" : "red"}>{r.win ? t("tr.hit") : t("tr.miss")}</AppBadge>
                            : <AppBadge tone="neutral">{t("tr.f.pending")}</AppBadge>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </AppCard>
      </div>

      {/* ③ 实验线详情 */}
      <div id="tr-exp">
        <AppCard header={
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="flex items-center gap-2">
              <span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>🧪 {t("tr.l.experiment")}</span>
              <AppBadge tone="green">{t("tr.basis.experiment")}</AppBadge>
            </span>
            <span className="text-[10px]" style={{ color: COLORS.textFaint }}>{t("tr.f.active")} {exp?.aggregate.active ?? 0} · {t("tr.f.finished")} {exp?.aggregate.finished ?? 0}</span>
          </div>}>
          {!exp?.available || !exp.missions.length ? <Empty text={t("tr.empty.experiment")} /> : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px] min-w-[820px]">
                  <thead><tr className="text-[10px] text-left" style={{ color: COLORS.textFaint }}>
                    <th className="pb-1.5 font-medium">{t("tr.c.period")}</th><th className="pb-1.5 font-medium">{t("tr.c.status")}</th>
                    <Rth>{t("tr.c.equity")}</Rth><Rth>{t("tr.c.retTarget")}</Rth><Rth>{t("tr.c.achieve")}</Rth>
                    <Rth>{t("tr.c.dd")}</Rth><Rth>vs TOPIX</Rth><Rth>{t("tr.c.trades")}</Rth><th className="pb-1.5 font-medium px-2"></th>
                  </tr></thead>
                  <tbody>
                    {exp.missions.map((m) => (
                      <tr key={m.id} style={{ borderTop: `1px solid ${COLORS.borderSoft}` }}>
                        <td className="py-2">
                          <span style={{ color: COLORS.text }}>{tx(`ml.type.${m.missionType}`)}</span>
                          <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full tabular-nums" style={{ background: COLORS.tile, color: COLORS.textSecondary }}>{m.periodLabel}</span>
                          {m.status === "ACTIVE" && m.daysLeft != null ? <span className="block text-[10px] mt-0.5" style={{ color: COLORS.textFaint }}>{t("ml.hero.remain")} {m.daysLeft} {t("tr.unit.day")}</span> : null}
                        </td>
                        <td className="py-2"><AppBadge tone={m.status === "ACTIVE" ? "green" : "neutral"}>{tx(`ml.status.${m.status}`)}</AppBadge></td>
                        <td className="py-2 px-2 text-right tabular-nums">{fmtJpy(m.equityJpy)}<span className="block text-[10px]" style={{ color: COLORS.textFaint }}>{fmtJpy(m.initialCapital)}</span></td>
                        <td className="py-2 px-2 text-right tabular-nums font-medium" style={{ color: upDownColor(m.returnPct) }}>{fmtPct(m.returnPct, 2)}<span className="block text-[10px] font-normal" style={{ color: COLORS.textFaint }}>/ +{m.targetPct}%</span></td>
                        <td className="py-2 px-2 text-right tabular-nums">
                          {m.achievedPct != null ? `${Math.round(m.achievedPct)}%` : "—"}
                          <span className="block mt-1 h-1 rounded-full overflow-hidden" style={{ background: COLORS.track }}>
                            <span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, m.achievedPct ?? 0))}%`, background: COLORS.success }} />
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums" style={{ color: upDownColor(m.maxDrawdownPct) }}>{fmtPct(m.maxDrawdownPct, 2)}</td>
                        <td className="py-2 px-2 text-right tabular-nums" style={{ color: upDownColor(m.alpha) }}>
                          {fmtPct(m.alpha, 2)}
                          {m.navDays < 2 ? <span className="block text-[10px]" style={{ color: COLORS.textFaint }}>{t("tr.exp.navShort")}</span> : null}
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums">{m.trades}<span className="block text-[10px]" style={{ color: COLORS.textFaint }}>{t("tr.c.closed")} {m.closedTrades}</span></td>
                        <td className="py-2 px-2 text-right">
                          <button onClick={() => router.push(`/decision-v2?tab=portfolio&mission=${encodeURIComponent(m.periodLabel)}`)}
                            className="text-[11px] hover:underline" style={{ color: COLORS.primary }}>{t("tr.toMission")} →</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="text-[10px] mt-2" style={{ color: COLORS.textFaint }}>
                {exp.aggregate.finished > 0
                  ? `${t("tr.exp.agg")}：${t("tr.f.finished")} ${exp.aggregate.finished} · ${t("tr.m.achieve")} ${exp.aggregate.achieveRate}% · ${t("tr.f.avgReturn")} ${fmtPct(exp.aggregate.avgReturn, 2)}`
                  : t("tr.exp.noArchive")}
              </div>
            </>
          )}
        </AppCard>
      </div>

      {/* ④ 账户线详情 */}
      <div id="tr-acc">
        <AppCard header={
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="flex items-center gap-2">
              <span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>💼 {t("tr.l.account")}</span>
              <AppBadge tone="amber">{t("tr.basis.account")}</AppBadge>
            </span>
            <button onClick={() => router.push("/decision-v2?tab=overview")} className="text-[11px] hover:underline" style={{ color: COLORS.primary }}>
              {t("tr.acc.holdings")} {acc?.summary.openHoldings ?? 0} → {t("tr.toOverview")}
            </button>
          </div>}>
          {!acc?.available ? <Empty text={t("tr.empty.account")} /> : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                <Stat k={t("tr.f.closed")} v={`${acc.summary.closed}`} />
                <Stat k={t("tr.m.winRate")} v={acc.summary.winRate != null && acc.summary.closed ? `${acc.summary.winRate}%` : "—"} dim={!acc.summary.sufficient} />
                <Stat k={t("tr.f.avgReturn")} v={fmtPct(acc.summary.avgReturn, 2)} tone={upDownColor(acc.summary.avgReturn)} dim={!acc.summary.sufficient} />
                <Stat k={t("tr.f.avgDays")} v={acc.summary.avgHoldingDays != null ? `${acc.summary.avgHoldingDays}` : "—"} dim={!acc.summary.sufficient} />
                <Stat k={t("tr.f.pf")} v={acc.summary.profitFactor != null ? `${acc.summary.profitFactor}` : "—"} dim={!acc.summary.sufficient} />
                <Stat k={t("tr.f.beatTopix")} v={acc.summary.beatTopixRate != null ? `${acc.summary.beatTopixRate}%` : "—"} dim={!acc.summary.sufficient} />
              </div>
              {!acc.summary.sufficient && (
                <div className="text-[10px] mt-2"><AppBadge tone="amber">{t("tr.notEnough")} N={acc.summary.closed}&lt;{minN}</AppBadge></div>
              )}
              {acc.records.length > 0 && (
                <div className="overflow-x-auto mt-3">
                  <table className="w-full text-[12px] min-w-[720px]">
                    <thead><tr className="text-[10px] text-left" style={{ color: COLORS.textFaint }}>
                      <th className="pb-1.5 font-medium">{t("tr.c.date")}</th><th className="pb-1.5 font-medium">{t("tr.c.stock")}</th>
                      <Rth>{t("tr.c.shares")}</Rth><Rth>{t("tr.c.sellPrice")}</Rth><Rth>{t("tr.c.return")}</Rth>
                      <Rth>{t("tr.c.pnl")}</Rth><Rth>{t("tr.c.days")}</Rth><Rth>vs TOPIX</Rth><th className="pb-1.5 font-medium px-2">{t("tr.c.reason")}</th>
                    </tr></thead>
                    <tbody>
                      {acc.records.map((r, i) => (
                        <tr key={`${r.tradeDate}-${r.symbol}-${i}`} onClick={() => openDetail(r.symbol, r.name)} className="cursor-pointer" style={{ borderTop: `1px solid ${COLORS.borderSoft}` }}>
                          <td className="py-1.5 tabular-nums" style={{ color: COLORS.textMuted }}>{r.tradeDate}</td>
                          <td className="py-1.5"><span style={{ color: COLORS.text }}>{r.name}</span><span className="ml-1 text-[10px] font-mono" style={{ color: COLORS.textFaint }}>{r.symbol}</span></td>
                          <td className="py-1.5 px-2 text-right tabular-nums">{r.shares.toLocaleString()}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums">{fmtJpy(r.price)}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums font-medium" style={{ color: upDownColor(r.returnPct) }}>{fmtPct(r.returnPct, 2)}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums" style={{ color: upDownColor(r.realizedPnl) }}>{fmtJpy(r.realizedPnl)}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums">{r.holdingDays ?? "—"}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums" style={{ color: upDownColor(r.excessPct) }}>{fmtPct(r.excessPct, 2)}</td>
                          <td className="py-1.5 px-2 text-[11px]" style={{ color: COLORS.textMuted }}>{r.reason ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </AppCard>
      </div>

      {/* ⑤ 三线对照（≥2 条线样本充足才渲染） */}
      {data?.comparison.renderable ? (
        <AppCard header={<span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>⚖ {t("tr.cmp.title")}</span>}>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] min-w-[640px]">
              <thead><tr className="text-[10px] text-left" style={{ color: COLORS.textFaint }}>
                <th className="pb-1.5 font-medium">{t("tr.cmp.line")}</th><th className="pb-1.5 font-medium">{t("tr.cmp.basis")}</th>
                <Rth>{t("tr.cmp.n")}</Rth><Rth>{t("tr.cmp.rate")}</Rth><Rth>{t("tr.f.avgReturn")}</Rth><Rth>Alpha</Rth><th className="pb-1.5 font-medium px-2">{t("tr.cmp.bench")}</th>
              </tr></thead>
              <tbody>
                {data.comparison.rows.map((r) => (
                  <tr key={r.line} style={{ borderTop: `1px solid ${COLORS.borderSoft}` }}>
                    <td className="py-1.5" style={{ color: COLORS.text }}>{tx(`tr.l.${r.line}`)}</td>
                    <td className="py-1.5 text-[11px]" style={{ color: COLORS.textMuted }}>{r.basis}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{r.n}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{r.rate != null ? `${r.rate}%` : "—"}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums" style={{ color: upDownColor(r.avgReturn) }}>{fmtPct(r.avgReturn, 2)}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums" style={{ color: upDownColor(r.alpha) }}>{fmtPct(r.alpha, 2)}</td>
                    <td className="py-1.5 px-2 text-[11px]" style={{ color: COLORS.textMuted }}>{r.benchmark}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] mt-2" style={{ color: COLORS.warning }}>⚠ {data.comparison.note}</p>
        </AppCard>
      ) : (
        <div className="text-[11px] px-3 py-2 rounded-lg" style={{ background: COLORS.tile, color: COLORS.textFaint }}>
          ⚖ {t("tr.cmp.title")} — {data?.comparison.reason ?? "—"}
        </div>
      )}

      {/* ⑥ 口径页脚 */}
      <div className="text-[10px] leading-relaxed px-3 py-2.5 rounded-lg" style={{ background: COLORS.tile, color: COLORS.textFaint }}>
        <div>{t("tr.foot.rule").replace("{n}", String(minN))}</div>
        <div>{t("tr.foot.basis")}</div>
        <div>{t("tr.foot.source")}</div>
        {sig?.footnote ? <div>{t("tr.foot.total").replace("{n}", String(sig.footnote.totalRecommendations))}</div> : null}
      </div>

      <StockDetailModal report={target} onClose={() => setTarget(null)} />
    </div>
  );
}

// ── 子组件 ────────────────────────────────────────────────────────────────────
function LineCard({ title, basis, tone, main, rows, state, onClick }: {
  title: string; basis: string; tone: Tone; main: { label: string; value: string };
  rows: { k: string; v: string; tone?: string }[];
  state: { kind: "ok" | "warn" | "pending"; text: string }; onClick: () => void;
}) {
  const stateTone: Record<string, Tone> = { ok: "green", warn: "amber", pending: "neutral" };
  return (
    <AppCard hover onClick={onClick}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{title}</span>
        <AppBadge tone={tone}>{basis}</AppBadge>
      </div>
      <div className="text-[10px]" style={{ color: COLORS.textMuted }}>{main.label}</div>
      <div className="text-[26px] font-bold tabular-nums leading-tight" style={{ color: COLORS.text }}>{main.value}</div>
      <div className="mt-2 space-y-1">
        {rows.map((r, i) => (
          <div key={i} className="flex justify-between text-[11px]">
            <span style={{ color: COLORS.textMuted }}>{r.k}</span>
            <span className="tabular-nums" style={{ color: r.tone ?? COLORS.textSecondary }}>{r.v}</span>
          </div>
        ))}
      </div>
      <div className="mt-2"><AppBadge tone={stateTone[state.kind]}>{state.text}</AppBadge></div>
    </AppCard>
  );
}

function Stat({ k, v, sub, tone, dim }: { k: string; v: string; sub?: string; tone?: string; dim?: boolean }) {
  return (
    <div className="rounded-lg px-2.5 py-2" style={{ background: COLORS.tile, opacity: dim ? 0.55 : 1 }}>
      <div className="text-[10px]" style={{ color: COLORS.textFaint }}>{k}</div>
      <div className="text-[15px] font-bold tabular-nums" style={{ color: tone ?? COLORS.text }}>{v}</div>
      {sub ? <div className="text-[9px] truncate" style={{ color: COLORS.textFaint }}>{sub}</div> : null}
    </div>
  );
}

/** 每根 = 一个决策日的 TOP10 平均收益；未结算灰色。纯 SVG，无新依赖。 */
function CohortBars({ rows, pendingLabel }: { rows: (Stat & { date: string; count: number; settled: number })[]; pendingLabel: string }) {
  if (!rows.length) return <div className="text-[11px]" style={{ color: COLORS.textFaint }}>—</div>;
  const data = [...rows].reverse();
  const vals = data.map((r) => r.avgReturn ?? 0);
  const mx = Math.max(1, ...vals.map((v) => Math.abs(v)));
  return (
    <div className="flex items-end gap-1 overflow-x-auto pb-1" style={{ height: 92 }}>
      {data.map((r) => {
        const v = r.avgReturn;
        const h = v == null ? 6 : Math.max(3, (Math.abs(v) / mx) * 34);
        const settled = r.settled > 0;
        return (
          <div key={r.date} className="flex flex-col items-center shrink-0" style={{ width: 26 }} title={`${r.date} · ${settled ? `${r.settled}/${r.count} · ${v?.toFixed(2)}%` : `${pendingLabel} ${r.count}`}`}>
            <div className="flex flex-col justify-end" style={{ height: 38 }}>
              {v != null && v > 0 ? <div style={{ height: h, width: 12, background: COLORS.success, borderRadius: 2 }} /> : null}
            </div>
            <div style={{ height: 1, width: 18, background: COLORS.border }} />
            <div className="flex flex-col justify-start" style={{ height: 38 }}>
              {v != null && v <= 0 ? <div style={{ height: h, width: 12, background: settled ? COLORS.danger : COLORS.borderSoft, borderRadius: 2 }} /> : null}
              {v == null ? <div style={{ height: 6, width: 12, background: COLORS.borderSoft, borderRadius: 2 }} /> : null}
            </div>
            <span className="text-[8px] tabular-nums mt-0.5" style={{ color: COLORS.textFaint }}>{r.date.slice(5)}</span>
          </div>
        );
      })}
    </div>
  );
}

function SliceTable({ rows, minN, t }: { rows: SliceRow[]; minN: number; t: (k: never) => string }) {
  const tt = t as unknown as (k: string) => string;
  if (!rows.length) return <div className="text-[11px]" style={{ color: COLORS.textFaint }}>—</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px] min-w-[520px]">
        <thead><tr className="text-[10px] text-left" style={{ color: COLORS.textFaint }}>
          <th className="pb-1.5 font-medium">{tt("tr.c.group")}</th><Rth>{tt("tr.cmp.n")}</Rth><Rth>{tt("tr.m.hitRate")}</Rth><Rth>{tt("tr.f.avgReturn")}</Rth><Rth>Alpha</Rth>
        </tr></thead>
        <tbody>
          {rows.map((r) => {
            const dim = !r.sufficient;
            return (
              <tr key={r.key} style={{ borderTop: `1px solid ${COLORS.borderSoft}`, opacity: dim ? 0.55 : 1 }}>
                <td className="py-1.5" style={{ color: COLORS.text }}>
                  {r.label}
                  {dim ? <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: COLORS.tile, color: COLORS.textFaint }}>{tt("tr.notEnough")} &lt;{minN}</span> : null}
                </td>
                <td className="py-1.5 px-2 text-right tabular-nums">{r.n}</td>
                {/* 样本不足 → 不给结论，一律 — */}
                <td className="py-1.5 px-2 text-right tabular-nums">{r.sufficient && r.hitRate != null ? `${r.hitRate}%` : "—"}</td>
                <td className="py-1.5 px-2 text-right tabular-nums" style={{ color: r.sufficient ? upDownColor(r.avgReturn) : COLORS.textFaint }}>{r.sufficient ? fmtPct(r.avgReturn, 2) : "—"}</td>
                <td className="py-1.5 px-2 text-right tabular-nums" style={{ color: r.sufficient ? upDownColor(r.alpha) : COLORS.textFaint }}>{r.sufficient ? fmtPct(r.alpha, 2) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Rth({ children }: { children: ReactNode }) { return <th className="pb-1.5 font-medium text-right px-2">{children}</th>; }
function Empty({ text }: { text: string }) { return <div className="text-[12px] py-6 text-center" style={{ color: COLORS.textFaint }}>{text}</div>; }
