"use client";

// ── Executive Dashboard · 老板驾驶舱（P13-DECISION-07）─────────────────────────
// 系统第一眼。整页只回答一件事：今天，我要不要交易。
// 7 section：今日决策(Hero) / 今日推荐 / 今日组合 / 市场快照 / AI近期表现 / 今日风险 / 快速进入。
// 纯展示层：只读复用 closing-decision + decision-center + ai-theme + indicators；
// AI 表现经 lib/decision/outcome.ts 统一评估（无 done → 等待验证，禁止伪造）。
// 禁止长列表 / 后台表格 / 重复股票。不改任何评分/推荐/API/Schema。

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { AppCard, AppBadge, AppLoading, COLORS } from "@/components/ui";
import { getThemeLabel } from "@/lib/i18n/theme-labels";
import ExplainReportButton from "@/components/explain/ExplainReportButton";
import { evaluateOutcome, summarizeOutcomes, type OutcomeSummary } from "@/lib/decision/outcome";

interface Top1 { symbol: string; name: string | null; aiScore: number | null; gptScore: number | null; confidence: string | null; price: number | null; changePct: number | null; entryLow: number | null; entryHigh: number | null; target1: number | null; target2: number | null; stopLoss: number | null; holdPeriod: string | null }
interface Leg { symbol: string; name: string | null; weight: number }
interface Top10R { symbol: string; name: string | null; riskLevel?: string | null; newsSentiment?: number | null; inBuyZone?: boolean | null }
interface ClosingApi { empty?: boolean; date?: string; decidedAtJst?: string | null; verdict?: "BUY_TODAY" | "WATCH_ONLY" | "STAY_CASH"; verdictReason?: string | null; summary?: string | null; market?: { regime: string | null; volatility: number | null; qualifiedCount?: number | null }; top1?: Top1 | null; portfolio?: Leg[]; top10?: Top10R[] }
interface DcApi { ok?: boolean; market?: { regime: string | null; riskLevel: string | null; volatility: number | null; topix: number | null; topixChange: number | null; nikkei: number | null; nikkeiChange: number | null } }
interface ThemeStock { symbol: string; theme: string; return5d: number | null; scored: boolean }
interface ThemeApi { stocks?: ThemeStock[]; themes?: { theme: string }[] }

const VERDICT_ICON: Record<string, string> = { BUY_TODAY: "🟢", WATCH_ONLY: "🟡", STAY_CASH: "⚪" };
const VERDICT_TONE: Record<string, "green" | "amber" | "red"> = { BUY_TODAY: "green", WATCH_ONLY: "amber", STAY_CASH: "red" };
const jpy = (v: number | null | undefined) => (v == null ? "—" : `¥${Math.round(v).toLocaleString()}`);
const pct1 = (v: number | null | undefined) => (v == null ? "—" : `${v > 0 ? "+" : ""}${(Math.round(v * 10) / 10).toFixed(1)}%`);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export default function ExecutiveDashboard() {
  const { t, lang } = useI18n();
  const [c, setC] = useState<ClosingApi | null>(null);
  const [dc, setDc] = useState<DcApi | null>(null);
  const [th, setTh] = useState<ThemeApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [perf, setPerf] = useState<OutcomeSummary | null | "loading">("loading");

  useEffect(() => {
    let alive = true;
    const get = (u: string) => fetch(u, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    (async () => {
      const [cj, dj, tj] = await Promise.all([get("/api/admin/closing-decision"), get("/api/admin/decision-center"), get("/api/ai-theme")]);
      if (!alive) return;
      setC(cj && !cj.empty ? cj : null); setDc(dj); setTh(tj); setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  // AI 近期表现（最近 20 次第一推荐 · 经 outcome SSOT 评估，懒加载不阻塞决策）
  useEffect(() => {
    let alive = true;
    (async () => {
      const get = (u: string) => fetch(u, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      const first = await get("/api/admin/closing-decision");
      const dates: string[] = Array.isArray(first?.availableDates) ? first.availableDates.slice(0, 20) : [];
      const outs = await Promise.all(dates.map(async (d) => {
        const j = d === first?.date ? first : await get(`/api/admin/closing-decision?date=${d}`);
        if (!j?.top1) return null;
        const ind = await get(`/api/stocks/${encodeURIComponent(j.top1.symbol)}/indicators`);
        const bars = Array.isArray(ind?.series?.all) ? ind.series.all : [];
        return evaluateOutcome(bars, j.date, j.top1.target1, j.top1.target2, j.top1.stopLoss);
      }));
      if (alive) setPerf(summarizeOutcomes(outs));
    })();
    return () => { alive = false; };
  }, []);

  if (loading) return <div style={{ background: COLORS.background, minHeight: "100vh" }}><AppLoading label={t("ed.today")} /></div>;

  const verdict = c?.verdict ?? null;
  const top1 = c?.top1 ?? null;
  const legs = c?.portfolio ?? [];
  const alts = legs.filter((l) => l.symbol !== (top1?.symbol ?? ""));
  const regime = dc?.market?.regime ?? c?.market?.regime ?? null;
  const regimeLabel = regime && ["BULL", "SIDEWAYS", "BEAR"].includes(regime) ? t(`dc.regime.${regime}` as Parameters<typeof t>[0]) : (regime ?? "—");
  const riskLevel = dc?.market?.riskLevel ?? null;
  const vol = dc?.market?.volatility ?? c?.market?.volatility ?? null;
  const m = dc?.market ?? null;
  const aiLine = (c?.summary || c?.verdictReason || "").trim().split(/[。\n｜]/).map((s) => s.trim()).filter(Boolean)[0] || "";

  // 第一推荐仓位（在组合内则取权重）
  const top1Leg = top1 ? legs.find((l) => l.symbol === top1.symbol) : undefined;
  const expReturn = top1?.target1 != null && top1?.price ? ((top1.target1 - top1.price) / top1.price) * 100 : null;

  // 今日组合表现（组合腿现价需 top1 数据里没有 → 用 closing top10 的现价近似不可得，故仅展示权重+推荐；
  //   收益类留给盯盘实时页，这里只给结构与第一推荐执行计划，避免伪造）
  // 市场快照热点主题
  const stocks = th?.stocks ?? []; const themes = th?.themes ?? [];
  const hotThemes = themes
    .map((x) => { const g = stocks.filter((s) => s.theme === x.theme && s.scored); return { theme: x.theme, label: getThemeLabel(x.theme, lang), r5: avg(g.map((s) => s.return5d).filter((v): v is number => v != null)) }; })
    .filter((x) => x.r5 != null).sort((a, b) => (b.r5 ?? 0) - (a.r5 ?? 0)).slice(0, 4);

  // 今日风险（最大风险，一句）
  const riskNote = verdict === "STAY_CASH" ? (c?.verdictReason ?? null) : regime === "BEAR" ? t("dc.regime.BEAR") : null;
  const riskStock = (c?.top10 ?? []).filter((r) => r.symbol !== (top1?.symbol ?? "")).find((r) => (r.newsSentiment ?? 0) < 0 || String(r.riskLevel ?? "").toUpperCase() === "HIGH" || r.inBuyZone === false);

  const QuickBtn = ({ href, label, icon }: { href: string; label: string; icon: string }) => (
    <Link href={href} className="flex items-center justify-center gap-2 h-12 rounded-2xl text-[14px] font-semibold transition-transform active:scale-[0.98]" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.text }}>
      <span>{icon}</span>{label}
    </Link>
  );

  return (
    <div className="dash-font" style={{ background: COLORS.background, minHeight: "100vh" }}>
      <div className="max-w-[1000px] mx-auto px-4 sm:px-6 py-6 space-y-3">

        {/* ═══ SECTION 1 · 今日决策（Hero）═══ */}
        <AppCard>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="text-5xl">{verdict ? VERDICT_ICON[verdict] : "—"}</span>
              <div>
                <div className="text-[11px] font-medium" style={{ color: COLORS.textFaint }}>{t("ed.tagline")}</div>
                <div className="text-[30px] font-bold tracking-tight leading-none mt-0.5" style={{ color: COLORS.text }}>
                  {verdict ? t(`dc.verdict.${verdict}` as Parameters<typeof t>[0]) : t("dc.ov.noData")}
                </div>
                <div className="text-[11px] mt-1" style={{ color: COLORS.textFaint }}>{c?.date ?? "—"} {c?.decidedAtJst ?? ""} JST</div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <AppBadge tone={verdict ? VERDICT_TONE[verdict] : "neutral"}>{regimeLabel}</AppBadge>
              {vol != null && <span className="text-[12px]" style={{ color: COLORS.textSecondary }}>{t("db.riskLevel")} {riskLevel ?? Math.round(vol * 10) / 10}</span>}
              {c?.market?.qualifiedCount != null && <span className="text-[12px]" style={{ color: COLORS.textSecondary }}>{t("dc.ov.oppCount")} <b style={{ color: COLORS.primary }}>{c.market.qualifiedCount}</b></span>}
            </div>
          </div>
          {aiLine && <p className="text-[13px] mt-3 pt-3 leading-relaxed" style={{ color: COLORS.textSecondary, borderTop: `1px solid ${COLORS.borderSoft}` }}>{aiLine}</p>}
        </AppCard>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* ═══ SECTION 2 · 今日推荐（仅第一推荐）═══ */}
          <AppCard header={
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>⭐ {t("ed.rec")}</span>
              <Link href="/decision-center?tab=today" className="text-[11px]" style={{ color: COLORS.primary }}>{t("ed.viewFull")} →</Link>
            </div>
          }>
            {top1 ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[18px] font-bold" style={{ color: COLORS.text }}>{top1.name ?? top1.symbol}</span>
                  <span className="text-[11px] font-mono" style={{ color: COLORS.textFaint }}>{top1.symbol}</span>
                  {top1.confidence && <AppBadge tone="blue">{t("dc.ov.confidence")} {top1.confidence}</AppBadge>}
                  <span className="text-[12px]" style={{ color: COLORS.textSecondary }}>AI {top1.aiScore ?? "—"} · GPT {top1.gptScore ?? "—"}</span>
                  <ExplainReportButton symbol={top1.symbol} name={top1.name} size="xs" />
                </div>
                <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-[12px]">
                  <KV k={t("dc.ov.currentPrice")} v={`${jpy(top1.price)} (${pct1(top1.changePct)})`} />
                  <KV k={t("dc.ov.entryRange")} v={top1.entryLow != null ? `${jpy(top1.entryLow)}~${jpy(top1.entryHigh)}` : "—"} />
                  <KV k={t("dc.ov.target")} v={top1.target1 != null ? `${jpy(top1.target1)}${top1.target2 != null ? ` → ${jpy(top1.target2)}` : ""}` : "—"} />
                  <KV k={t("dc.ov.stopLossP")} v={jpy(top1.stopLoss)} tone={COLORS.danger} />
                  <KV k={t("dc.td.position")} v={top1Leg ? `${Math.round(top1Leg.weight)}%` : t("dc.td.positionSeeAlts")} tone={COLORS.primary} />
                  <KV k={t("dc.ov.expReturn")} v={expReturn != null ? pct1(expReturn) : "—"} tone={(expReturn ?? 0) >= 0 ? COLORS.success : COLORS.danger} />
                </div>
              </div>
            ) : <div className="text-[13px]" style={{ color: COLORS.textFaint }}>{t("dc.ov.noData")}</div>}
          </AppCard>

          {/* ═══ SECTION 3 · 今日组合 ═══ */}
          <AppCard header={
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("ed.portfolio")}</span>
              <Link href="/decision-center?tab=live" className="text-[11px]" style={{ color: COLORS.primary }}>{t("wl.title")} →</Link>
            </div>
          }>
            {alts.length ? (
              <div className="space-y-1.5">
                {alts.map((l) => (
                  <div key={l.symbol} className="flex items-center justify-between gap-2">
                    <span className="text-[13px] truncate" style={{ color: COLORS.text }}>{l.name ?? l.symbol} <span className="text-[10px] font-mono" style={{ color: COLORS.textFaint }}>{l.symbol}</span></span>
                    <div className="flex items-center gap-2 shrink-0 w-1/2">
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: COLORS.tile }}><div className="h-full rounded-full" style={{ width: `${Math.min(100, l.weight)}%`, background: COLORS.primary }} /></div>
                      <span className="text-[12px] font-bold tabular-nums w-9 text-right" style={{ color: COLORS.primary }}>{Math.round(l.weight)}%</span>
                    </div>
                  </div>
                ))}
                <div className="text-[10px] pt-1" style={{ color: COLORS.textFaint }}>{t("db.holdCount")} {alts.length} · {t("wl.title")}</div>
              </div>
            ) : <div className="text-[13px]" style={{ color: COLORS.textFaint }}>{t("wl.portfolioNA")}</div>}
          </AppCard>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* ═══ SECTION 4 · 市场快照 ═══ */}
          <AppCard header={<span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("ed.market")}</span>}>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <AppBadge tone={regime === "BULL" ? "green" : regime === "BEAR" ? "red" : "amber"}>{regimeLabel}</AppBadge>
              <span className="text-[11px]" style={{ color: COLORS.textSecondary }}>{t("db.riskLevel")} <b style={{ color: COLORS.text }}>{riskLevel ?? "—"}</b></span>
            </div>
            {m?.topix != null && <div className="text-[12px] tabular-nums" style={{ color: COLORS.textSecondary }}>TOPIX <b style={{ color: (m.topixChange ?? 0) >= 0 ? COLORS.success : COLORS.danger }}>{Math.round(m.topix * 10) / 10} ({pct1(m.topixChange)})</b></div>}
            {hotThemes.length > 0 && (
              <div className="mt-2 pt-2" style={{ borderTop: `1px solid ${COLORS.borderSoft}` }}>
                <div className="text-[10px] mb-1" style={{ color: COLORS.textFaint }}>{t("dc.ck.hotTheme")}</div>
                <div className="flex flex-wrap gap-1">
                  {hotThemes.map((h) => <span key={h.theme} className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: COLORS.tile, color: COLORS.text }}>{h.label} <b style={{ color: (h.r5 ?? 0) >= 0 ? COLORS.success : COLORS.danger }}>{pct1(h.r5)}</b></span>)}
                </div>
              </div>
            )}
          </AppCard>

          {/* ═══ SECTION 5 · AI 近期表现 ═══ */}
          <AppCard header={<span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("ed.perf")}</span>}>
            {perf === "loading" ? (
              <div className="text-[12px]" style={{ color: COLORS.textFaint }}>…</div>
            ) : perf ? (
              <div className="space-y-2">
                <div className="text-[10px]" style={{ color: COLORS.textFaint }}>{t("dc.h.recent")} {perf.n}</div>
                <div className="grid grid-cols-3 gap-2">
                  <PerfTile k={t("dc.h.successRate")} v={`${Math.round(perf.successRate)}%`} tone={perf.successRate >= 50 ? COLORS.success : COLORS.danger} />
                  <PerfTile k={t("dc.h.avgReturn")} v={pct1(perf.avgReturn)} tone={perf.avgReturn >= 0 ? COLORS.success : COLORS.danger} />
                  <PerfTile k={t("dc.h.t1Rate")} v={`${Math.round(perf.t1Rate)}%`} tone={COLORS.primary} />
                </div>
              </div>
            ) : (
              <div className="text-[12px]" style={{ color: COLORS.textFaint }}>⚪ {t("dc.h.waiting")}</div>
            )}
          </AppCard>

          {/* ═══ SECTION 6 · 今日风险 ═══ */}
          <AppCard header={<span className="text-[13px] font-semibold" style={{ color: COLORS.danger }}>⚠️ {t("ed.risk")}</span>}>
            <div className="flex items-center gap-2 mb-1.5">
              <AppBadge tone={riskLevel === "HIGH" ? "red" : riskLevel === "MEDIUM" ? "amber" : "green"}>{t("db.riskLevel")} {riskLevel ?? "—"}</AppBadge>
              {vol != null && <span className="text-[11px] tabular-nums" style={{ color: COLORS.textSecondary }}>Vol {Math.round(vol * 10) / 10}</span>}
            </div>
            {riskNote ? (
              <div className="text-[12px]" style={{ color: COLORS.textSecondary }}>{riskNote}</div>
            ) : riskStock ? (
              <div className="text-[12px]" style={{ color: COLORS.textSecondary }}>⚠ {riskStock.name ?? riskStock.symbol} <span className="text-[10px] font-mono" style={{ color: COLORS.textFaint }}>{riskStock.symbol}</span></div>
            ) : (
              <div className="text-[12px]" style={{ color: COLORS.success }}>✓ {t("ed.riskNone")}</div>
            )}
          </AppCard>
        </div>

        {/* ═══ SECTION 7 · 快速进入 ═══ */}
        <div>
          <div className="text-[11px] font-medium mb-1.5 px-1" style={{ color: COLORS.textFaint }}>{t("ed.quick")}</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <QuickBtn href="/decision-center?tab=today" label={t("dc.tab.today")} icon="◎" />
            <QuickBtn href="/decision-center?tab=live" label={t("dc.tab.live")} icon="🟢" />
            <QuickBtn href="/decision-center?tab=review" label={t("dc.tab.review")} icon="↺" />
            <QuickBtn href="/admin/research" label={t("ed.goResearch")} icon="🔬" />
          </div>
        </div>
      </div>
    </div>
  );
}

function KV({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between py-0.5" style={{ borderBottom: `1px solid ${COLORS.borderSoft}` }}>
      <span style={{ color: COLORS.textSecondary }}>{k}</span>
      <span className="font-semibold tabular-nums ml-2 text-right" style={{ color: tone ?? COLORS.text }}>{v}</span>
    </div>
  );
}
function PerfTile({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div className="rounded-lg px-2 py-2" style={{ background: COLORS.tile }}>
      <div className="text-[10px] leading-tight" style={{ color: COLORS.textFaint }}>{k}</div>
      <div className="text-[16px] font-bold tabular-nums mt-0.5" style={{ color: tone ?? COLORS.text }}>{v}</div>
    </div>
  );
}
