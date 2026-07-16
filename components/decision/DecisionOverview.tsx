"use client";

// ── 决策中心 · 今日总览（P7-02B-2）────────────────────────────────────────────
// 纯聚合展示层：只读复用 GET /api/admin/closing-decision + GET /api/admin/decision-center
// 的现有字段，禁止新增算法或自行推导新结论。「查看详情」切换到对应 Tab（不整页刷新）。

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import {
  AppCard, AppKpiCard, AppKpiGrid, AppButton, AppLoading, AppEmptyState, AppBadge, COLORS,
} from "@/components/ui";

interface Top1 { symbol: string; name: string | null; aiScore: number | null; gptScore: number | null; confidence: string | null; holdPeriod: string | null; entryLow: number | null; entryHigh: number | null; }
interface Leg { symbol: string; name: string | null; sector: string | null; weight: number; }
interface ClosingApi {
  ok: boolean; empty?: boolean; date?: string; decidedAtJst?: string | null;
  verdict?: "BUY_TODAY" | "WATCH_ONLY" | "STAY_CASH"; verdictReason?: string | null;
  market?: { regime: string | null; volatility: number | null; opportunity: number | null };
  top1?: Top1 | null; portfolio?: Leg[]; summary?: string | null;
}
interface DcApi {
  ok: boolean; dateJst?: string;
  market?: { regime: string | null; riskLevel: string | null; volatility: number | null };
  decision?: { top5: number; strongBuy: number; buy: number; watchlist: number };
  topPicks?: { picks: { rank: number; symbol: string; name: string | null; returnPct: number | null }[]; portfolioReturn: number | null; alpha: number | null };
  system?: { health: { critical: number | null; warning: number | null; status: string | null }; version: string | null };
}

const VERDICT_TONE: Record<string, "green" | "amber" | "red"> = { BUY_TODAY: "green", WATCH_ONLY: "amber", STAY_CASH: "red" };
const VERDICT_ICON: Record<string, string> = { BUY_TODAY: "✅", WATCH_ONLY: "⚠️", STAY_CASH: "❌" };
function pct(v: number | null | undefined): string { return v == null ? "—" : `${v > 0 ? "+" : ""}${Math.round(v * 10) / 10}%`; }

export default function DecisionOverview({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const { t } = useI18n();
  const [closing, setClosing] = useState<ClosingApi | null>(null);
  const [dc, setDc] = useState<DcApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setError(null);
      try {
        const [c, d] = await Promise.all([
          fetch("/api/admin/closing-decision", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/admin/decision-center", { cache: "no-store" }).then((r) => r.json()),
        ]);
        if (!alive) return;
        setClosing(c); setDc(d);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "load failed");
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  if (loading) return <AppLoading label={t("dc.title")} />;
  if (error) return <AppEmptyState title={t("dc.ov.loadFail")} desc={error} />;

  const verdict = closing?.verdict ?? null;
  const regime = dc?.market?.regime ?? closing?.market?.regime ?? null;
  const regimeLabel = regime && ["BULL", "SIDEWAYS", "BEAR"].includes(regime)
    ? t(`dc.regime.${regime}` as Parameters<typeof t>[0]) : (regime ?? "—");
  const risk = dc?.market?.riskLevel ?? null;
  const health = dc?.system?.health;
  const top1 = closing?.top1 ?? null;
  const legs = closing?.portfolio ?? [];
  const picks = dc?.topPicks?.picks ?? [];
  const dec = dc?.decision;

  const detailBtn = (tab: string) => (
    <AppButton size="sm" variant="ghost" onClick={() => onNavigate(tab)}>{t("dc.ov.viewDetail")} →</AppButton>
  );

  return (
    <div className="space-y-4">
      {/* 1. 今日建议 + 收盘决策状态 */}
      <AppCard
        header={<div className="flex items-center justify-between"><span style={{ fontWeight: 600 }}>{t("dc.ov.verdict")}</span>{detailBtn("closing")}</div>}
      >
        {verdict ? (
          <div className="flex flex-wrap items-center gap-4">
            <div className="text-3xl">{VERDICT_ICON[verdict]}</div>
            <div>
              <AppBadge tone={VERDICT_TONE[verdict]}>{verdict.replace("_", " ")}</AppBadge>
              <div className="mt-1 text-[15px]" style={{ fontWeight: 600, color: COLORS.text }}>
                {t(`dc.verdict.${verdict}` as Parameters<typeof t>[0])}
              </div>
              {closing?.verdictReason && <div className="text-[12px] mt-0.5" style={{ color: COLORS.textSecondary }}>{closing.verdictReason}</div>}
            </div>
            <div className="ml-auto text-[11px]" style={{ color: COLORS.textFaint }}>
              {t("dc.ov.closingStatus")}: {closing?.date ?? "—"} {closing?.decidedAtJst ?? ""}
            </div>
          </div>
        ) : <AppEmptyState title={t("dc.ov.noData")} />}
      </AppCard>

      {/* 2. 今日第一推荐 + 市场风险 + 数据新鲜度 KPI */}
      <AppKpiGrid>
        <AppKpiCard
          label={t("dc.ov.firstPick")}
          value={top1 ? (top1.name ?? top1.symbol) : "—"}
          sub={top1 ? `${top1.symbol} · AI ${top1.aiScore ?? "—"}${top1.confidence ? ` · ${t("dc.ov.confidence")} ${top1.confidence}` : ""}` : undefined}
          tone={top1 ? "blue" : "neutral"}
        />
        <AppKpiCard
          label={t("dc.ov.risk")}
          value={regimeLabel}
          sub={risk ? `Risk: ${risk}` : (closing?.market?.volatility != null ? `Vol ${closing.market.volatility}` : undefined)}
          tone={regime === "BULL" ? "green" : regime === "BEAR" ? "red" : "amber"}
        />
        <AppKpiCard
          label={t("dc.ov.freshness")}
          value={health?.status ?? "—"}
          sub={dc?.system?.version ? `v ${dc.system.version} · ${dc?.dateJst ?? ""}` : dc?.dateJst}
          tone={health?.status === "PASS" ? "green" : health?.critical ? "red" : "amber"}
        />
      </AppKpiGrid>

      {/* 3. 今日建议组合 */}
      <AppCard header={<div className="flex items-center justify-between"><span style={{ fontWeight: 600 }}>{t("dc.ov.portfolio")}</span>{detailBtn("closing")}</div>}>
        {legs.length ? (
          <div className="flex flex-wrap gap-2">
            {legs.map((l) => (
              <div key={l.symbol} className="px-3 py-2 rounded-lg" style={{ background: COLORS.tile, border: `1px solid ${COLORS.border}` }}>
                <div className="text-[13px]" style={{ fontWeight: 600, color: COLORS.text }}>{l.name ?? l.symbol}</div>
                <div className="text-[11px]" style={{ color: COLORS.textSecondary }}>{l.symbol} · {Math.round(l.weight)}%{l.sector ? ` · ${l.sector}` : ""}</div>
              </div>
            ))}
          </div>
        ) : <div className="text-[13px]" style={{ color: COLORS.textFaint }}>{t("dc.ov.noData")}</div>}
      </AppCard>

      {/* 4. 早盘五选摘要 */}
      <AppCard header={<div className="flex items-center justify-between"><span style={{ fontWeight: 600 }}>{t("dc.ov.morning")}</span>{detailBtn("top-picks")}</div>}>
        <div className="flex flex-wrap items-center gap-3 mb-2 text-[12px]" style={{ color: COLORS.textSecondary }}>
          {dec && <span>Top5: {dec.top5} · {t("rating.STRONG_BUY")}: {dec.strongBuy} · {t("rating.BUY")}: {dec.buy}</span>}
          {dc?.topPicks?.portfolioReturn != null && <span style={{ color: dc.topPicks.portfolioReturn >= 0 ? COLORS.success : COLORS.danger }}>P&L {pct(dc.topPicks.portfolioReturn)}</span>}
          {dc?.topPicks?.alpha != null && <span>α {pct(dc.topPicks.alpha)}</span>}
        </div>
        {picks.length ? (
          <div className="flex flex-wrap gap-2">
            {picks.slice(0, 5).map((p) => (
              <div key={p.symbol} className="px-2.5 py-1.5 rounded-md text-[12px]" style={{ background: COLORS.tile, border: `1px solid ${COLORS.border}` }}>
                <span style={{ fontWeight: 600, color: COLORS.text }}>#{p.rank} {p.name ?? p.symbol}</span>
                {p.returnPct != null && <span className="ml-1.5" style={{ color: p.returnPct >= 0 ? COLORS.success : COLORS.danger }}>{pct(p.returnPct)}</span>}
              </div>
            ))}
          </div>
        ) : <div className="text-[13px]" style={{ color: COLORS.textFaint }}>{t("dc.ov.noData")}</div>}
      </AppCard>

      {closing?.summary && (
        <AppCard><div className="text-[13px] leading-relaxed" style={{ color: COLORS.textSecondary, whiteSpace: "pre-wrap" }}>{closing.summary}</div></AppCard>
      )}
    </div>
  );
}
