"use client";

// ── 决策中心 · AI 今日投资日报（P8-2）───────────────────────────────────────
// 老板 09:00 打开决策中心第一眼。纯聚合展示：只读复用 closing-decision + decision-center
// + watchlist/daily 现有 API，禁止重算/新增算法/改评分/改 DB。风格对齐 Explain 2.0。
// 固定 7 段：①今日市场 ②第一推荐 ③建议组合 ④操作建议 ⑤今日风险 ⑥今日关注 ⑦一句话总结。

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { AppCard, AppButton, AppLoading, AppEmptyState, AppBadge, COLORS } from "@/components/ui";
import ExplainReportButton from "@/components/explain/ExplainReportButton";

interface Top1 { symbol: string; name: string | null; aiScore: number | null; gptScore: number | null; confidence: string | null; }
interface Leg { symbol: string; name: string | null; weight: number; }
interface ClosingApi {
  ok: boolean; empty?: boolean; date?: string; decidedAtJst?: string | null;
  verdict?: "BUY_TODAY" | "WATCH_ONLY" | "STAY_CASH"; verdictReason?: string | null;
  market?: { regime: string | null; volatility: number | null; newsRiskCount?: number | null };
  top1?: Top1 | null; portfolio?: Leg[]; summary?: string | null;
}
interface DcApi {
  ok: boolean; dateJst?: string;
  market?: { regime: string | null; riskLevel: string | null; volatility: number | null; trendScore: number | null };
  system?: { version: string | null };
}
interface WItem { symbol: string; name: string | null; score: number | null; rank: number | null; returnPctFromEntry?: number | null; }

const VERDICT_TONE: Record<string, "green" | "amber" | "red"> = { BUY_TODAY: "green", WATCH_ONLY: "amber", STAY_CASH: "red" };
const VERDICT_ICON: Record<string, string> = { BUY_TODAY: "✅", WATCH_ONLY: "⚠️", STAY_CASH: "❌" };
const ACT_KEY: Record<string, string> = { BUY_TODAY: "db.actBuy", WATCH_ONLY: "db.actWatch", STAY_CASH: "db.actCash" };
const SUM_KEY: Record<string, string> = { BUY_TODAY: "db.sum.buy", WATCH_ONLY: "db.sum.watch", STAY_CASH: "db.sum.cash" };
const jpy = (v: number | null | undefined) => v == null ? "—" : `¥${Math.round(v).toLocaleString()}`;
const pct = (v: number | null | undefined) => v == null ? "—" : `${v > 0 ? "+" : ""}${Math.round(v * 10) / 10}%`;

export default function DecisionOverview({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const { t } = useI18n();
  const [c, setC] = useState<ClosingApi | null>(null);
  const [dc, setDc] = useState<DcApi | null>(null);
  const [watch, setWatch] = useState<WItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setError(null);
      try {
        const [cj, dj, wj] = await Promise.all([
          fetch("/api/admin/closing-decision", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/admin/decision-center", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/watchlist/daily", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        ]);
        if (!alive) return;
        setC(cj); setDc(dj); setWatch(Array.isArray(wj?.items) ? wj.items : []);
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : "load failed"); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  if (loading) return <AppLoading label={t("db.title")} />;
  if (error) return <AppEmptyState title={t("dc.ov.loadFail")} desc={error} />;

  const regime = dc?.market?.regime ?? c?.market?.regime ?? null;
  const regimeLabel = regime && ["BULL", "SIDEWAYS", "BEAR"].includes(regime) ? t(`dc.regime.${regime}` as Parameters<typeof t>[0]) : (regime ?? "—");
  const risk = dc?.market?.riskLevel ?? null;
  const trendLabel = regime === "BULL" ? t("db.trendUp") : regime === "BEAR" ? t("db.trendDown") : t("db.trendSide");
  const verdict = c?.verdict ?? null;
  const top1 = c?.top1 ?? null;
  const legs = c?.portfolio ?? [];
  const cashRatio = legs.length ? Math.max(0, 100 - legs.reduce((a, l) => a + (l.weight || 0), 0)) : 100;
  const focus = [...watch].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)).slice(0, 5);

  // ⑤ 今日风险：真实来源(Market/News/Risk/Explain)，去重最多3，不生成通用风险
  const risks: string[] = [];
  if ((c?.market?.newsRiskCount ?? 0) > 0) risks.push(`近期利空 ${c!.market!.newsRiskCount} 条（News）`);
  if (regime === "BEAR") risks.push("大盘熊市，系统性下行风险（Market）");
  else if (regime === "SIDEWAYS") risks.push("大盘震荡，方向不明（Market）");
  const vol = dc?.market?.volatility ?? c?.market?.volatility;
  if (vol != null && vol > 25) risks.push(`市场波动率偏高 ${Math.round(vol)}（Risk）`);
  if (verdict === "STAY_CASH" && c?.verdictReason) risks.push(c.verdictReason);
  const risks3 = [...new Set(risks)].slice(0, 3);

  const Divider = () => <div className="text-center text-[11px] tracking-widest select-none my-1" style={{ color: COLORS.border }}>━━━━━━━━━━━━</div>;
  const Title = ({ label, tab }: { label: string; tab?: string }) => (
    <div className="flex items-center justify-between">
      <span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{label}</span>
      {tab && <AppButton size="sm" variant="ghost" onClick={() => onNavigate(tab)}>{t("dc.ov.viewDetail")} →</AppButton>}
    </div>
  );

  return (
    <div className="max-w-[720px] mx-auto space-y-2">
      {/* Header */}
      <div className="rounded-xl p-4 text-center" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
        <div className="text-[16px] font-bold" style={{ color: COLORS.text }}>{t("db.title")}</div>
        <div className="text-[11px] mt-1" style={{ color: COLORS.textFaint }}>
          {t("db.updated")} {c?.date ?? dc?.dateJst ?? "—"} {c?.decidedAtJst ?? ""} JST
        </div>
      </div>

      {/* ① 今日市场 */}
      <Divider />
      <AppCard header={<Title label={t("db.s1")} tab="cockpit" />}>
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <AppBadge tone={regime === "BULL" ? "green" : regime === "BEAR" ? "red" : "amber"}>{regimeLabel}</AppBadge>
          <span style={{ color: COLORS.textSecondary }}>{t("db.riskLevel")}: <b style={{ color: COLORS.text }}>{risk ?? "—"}</b></span>
          <span style={{ color: COLORS.textSecondary }}>{t("db.trend")}: <b style={{ color: COLORS.text }}>{trendLabel}</b></span>
        </div>
      </AppCard>

      {/* ② 今日第一推荐 */}
      <Divider />
      <AppCard header={<Title label={t("db.s2")} tab="closing" />}>
        {top1 ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[15px] font-bold" style={{ color: COLORS.text }}>{top1.name ?? top1.symbol}</span>
              <span className="text-[11px] font-mono" style={{ color: COLORS.textFaint }}>{top1.symbol}</span>
              {top1.confidence && <AppBadge tone="blue">{t("dc.ov.confidence")} {top1.confidence}</AppBadge>}
              <ExplainReportButton symbol={top1.symbol} name={top1.name} />
            </div>
            <div className="text-[12px]" style={{ color: COLORS.textSecondary }}>
              AI {top1.aiScore ?? "—"} · GPT {top1.gptScore ?? "—"}
            </div>
          </div>
        ) : <div className="text-[13px]" style={{ color: COLORS.textFaint }}>{t("dc.ov.noData")}</div>}
      </AppCard>

      {/* ③ 今日建议组合 */}
      <Divider />
      <AppCard header={<Title label={t("db.s3")} tab="closing" />}>
        {legs.length ? (
          <>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {legs.map((l) => (
                <span key={l.symbol} className="px-2 py-1 rounded-md text-[12px]" style={{ background: COLORS.tile, border: `1px solid ${COLORS.border}` }}>
                  {l.name ?? l.symbol} <b style={{ color: COLORS.primary }}>{Math.round(l.weight)}%</b>
                </span>
              ))}
            </div>
            <div className="text-[12px]" style={{ color: COLORS.textSecondary }}>
              {t("db.holdCount")}: <b style={{ color: COLORS.text }}>{legs.length}</b> · {t("db.cashRatio")}: <b style={{ color: COLORS.text }}>{Math.round(cashRatio)}%</b>
            </div>
          </>
        ) : <div className="text-[13px]" style={{ color: COLORS.textFaint }}>{t("dc.ov.noData")}</div>}
      </AppCard>

      {/* ④ 今日操作建议 */}
      <Divider />
      <AppCard header={<Title label={t("db.s4")} />}>
        {verdict ? (
          <div className="flex items-center gap-3">
            <span className="text-2xl">{VERDICT_ICON[verdict]}</span>
            <div>
              <div className="text-[15px] font-bold" style={{ color: COLORS.text }}>
                {t("db.todayAction")}：{t(ACT_KEY[verdict] as Parameters<typeof t>[0])}
              </div>
              <AppBadge tone={VERDICT_TONE[verdict]}>{verdict.replace("_", " ")}</AppBadge>
            </div>
          </div>
        ) : <div className="text-[13px]" style={{ color: COLORS.textFaint }}>{t("dc.ov.noData")}</div>}
      </AppCard>

      {/* ⑤ 今日风险 */}
      <Divider />
      <AppCard header={<Title label={`${t("db.s5")}（${risks3.length}）`} />}>
        {risks3.length ? (
          <ul className="space-y-1 text-[13px]" style={{ color: COLORS.textSecondary }}>
            {risks3.map((r, i) => <li key={i} className="flex gap-1.5"><span style={{ color: COLORS.danger }}>•</span><span>{r}</span></li>)}
          </ul>
        ) : <div className="text-[13px]" style={{ color: COLORS.success }}>{t("db.noRisk")}</div>}
      </AppCard>

      {/* ⑥ 今日关注 */}
      <Divider />
      <AppCard header={<Title label={t("db.s6")} tab="watchlist" />}>
        {focus.length ? (
          <div className="space-y-1">
            <div className="text-[11px] mb-1" style={{ color: COLORS.textFaint }}>{t("db.focusTop5")}</div>
            {focus.map((w) => (
              <div key={w.symbol} className="flex items-center justify-between text-[12px] py-0.5" style={{ borderBottom: `1px solid ${COLORS.borderSoft}` }}>
                <span style={{ color: COLORS.text }}>{w.rank != null ? `#${w.rank} ` : ""}{w.name ?? w.symbol}</span>
                <span style={{ color: (w.returnPctFromEntry ?? 0) >= 0 ? COLORS.success : COLORS.danger }}>{pct(w.returnPctFromEntry)}</span>
              </div>
            ))}
          </div>
        ) : <div className="text-[13px]" style={{ color: COLORS.textFaint }}>{t("dc.ov.noData")}</div>}
      </AppCard>

      {/* ⑦ 一句话总结 */}
      <Divider />
      <AppCard>
        <div className="text-center text-[14px] font-medium" style={{ color: COLORS.text }}>
          {verdict ? t(SUM_KEY[verdict] as Parameters<typeof t>[0]) : (c?.summary ?? "—")}
        </div>
      </AppCard>
    </div>
  );
}
