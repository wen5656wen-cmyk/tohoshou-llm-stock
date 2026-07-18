"use client";

// ── Decision Overview V2（P14-DEV-02 · /decision-v2?tab=overview）─────────────────
// 回答：今天是否值得交易，当前最重要的机会与风险是什么。
// 数据：useDecision()(共享 closing/market/theme) + 页内一次拉取 market-data/news/disclosures。
// 无新增 API、无重复请求；缺失字段一律 — / 暂无可靠信号，禁止伪造。
// Top10 SSOT = closing.top10（15:15 GPT 重排的唯一权威决策清单，非 AiTopPick/watchlist）。
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { AppLoading } from "@/components/ui";
import type { Tone } from "@/lib/design-tokens";
import { fmtJpy, fmtPct, fmtJstClock, riskTone } from "@/lib/decision/ds";
import { useDecision } from "@/lib/decision/provider";
import { deriveLiveStatus, LIVE_STATUS_META } from "@/lib/decision/live-status";
import { themeMomentum } from "@/lib/decision/themes";
import { VerdictHero, MarketSnapshot, Top10Preview, OpportunityRadar, RiskPanel, NewsCatalystPanel,
  type MktItem, type TopRow, type RadarCat, type RiskItem, type NewsItem, type CatItem } from "@/components/decision/ds/panels";

interface Extra {
  gm: { nikkei?: number | null; nikkeiChange?: number | null; topix?: number | null; topixChange?: number | null; usdjpy?: number | null; vix?: number | null; nasdaq?: number | null; nasdaqChange?: number | null; date?: string | null } | null;
  news: { id: number; title: string; source: string | null; publishedAt: string; sentiment: string | null; importance: number | null; symbol?: string | null; stock?: { symbol?: string } | null }[];
  disc: { id: number | string; symbol: string; title: string; category: string | null; sentiment: string | null; publishedAt: string; stock?: { symbol?: string; name?: string | null } | null }[];
}
const DISC_LABEL: Record<string, string> = { EARNINGS: "财报", FORECAST_REVISION: "业绩修正", EQUITY: "增发", BUYBACK: "回购", MATERIAL: "重大", DIVIDEND: "分红", OTHER: "披露" };

export default function DecisionOverviewV2() {
  const { t, lang } = useI18n();
  const { closing, market, themes, loading } = useDecision();
  const [x, setX] = useState<Extra>({ gm: null, news: [], disc: [] });

  useEffect(() => {
    let alive = true;
    const g = (u: string) => fetch(u, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    (async () => {
      const [md, nw, dc] = await Promise.all([g("/api/market-data"), g("/api/news?limit=8"), g("/api/disclosures?limit=20")]);
      if (!alive) return;
      setX({ gm: md?.globalMarket ?? null, news: Array.isArray(nw) ? nw : [], disc: Array.isArray(dc) ? dc : [] });
    })();
    return () => { alive = false; };
  }, []);

  if (loading) return <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-10"><AppLoading label={t("dv.nav.overview")} /></div>;

  const cMkt = closing?.market ?? null;
  const dMkt = (market?.market ?? null) as Record<string, unknown> | null;
  const verdict = closing?.verdict ?? null;
  const verdictLabel = verdict ? t(`dc.verdict.${verdict}` as Parameters<typeof t>[0]) : t("dc.ov.noData");
  const regime = (dMkt?.regime as string) ?? cMkt?.regime ?? null;
  const regimeLabel = regime && ["BULL", "SIDEWAYS", "BEAR"].includes(regime) ? t(`dc.regime.${regime}` as Parameters<typeof t>[0]) : (regime ?? "—");
  const regimeToneV: Tone = regime === "BULL" ? "green" : regime === "BEAR" ? "red" : "amber";
  const riskLevel = (dMkt?.riskLevel as string) ?? null;
  const vol = (dMkt?.volatility as number) ?? cMkt?.volatility ?? null;
  const summary = (closing?.summary || closing?.verdictReason || "").trim().split(/[。\n｜]/).map((s) => s.trim()).filter(Boolean)[0] || "";
  const asOf = closing?.date ? `${closing.date} ${closing.decidedAtJst ?? ""} JST` : "—";

  // ── MarketSnapshot ──
  const gm = x.gm;
  const mkItems: MktItem[] = [
    { label: "日経225", value: gm?.nikkei != null ? Math.round(gm.nikkei).toLocaleString() : "—", change: gm?.nikkeiChange ?? null, pct: gm?.nikkeiChange ?? null },
    { label: "TOPIX", value: gm?.topix != null ? String(Math.round(gm.topix * 10) / 10) : "—", change: gm?.topixChange ?? null, pct: gm?.topixChange ?? null },
    { label: "USD/JPY", value: gm?.usdjpy != null ? String(Math.round(gm.usdjpy * 100) / 100) : "—", change: null, pct: null },
    { label: "VIX", value: gm?.vix != null ? String(Math.round(gm.vix * 100) / 100) : "—", change: null, pct: null },
    { label: "NASDAQ", value: gm?.nasdaq != null ? Math.round(gm.nasdaq).toLocaleString() : "—", change: gm?.nasdaqChange ?? null, pct: gm?.nasdaqChange ?? null },
  ];
  const trend = (dMkt?.trendScore as number) != null ? String(Math.round((dMkt!.trendScore as number) * 10) / 10) : "—";
  const breadth = (dMkt?.breadth as number) != null ? `${Math.round(dMkt!.breadth as number)}%` : "—";
  const volTxt = vol != null ? String(Math.round(vol * 10) / 10) : "—";

  // ── Top10（SSOT closing.top10）──
  type T10 = { rank?: number; symbol: string; name?: string | null; price?: number | null; changePct?: number | null; aiScore?: number | null; entryLow?: number | null; entryHigh?: number | null; target1?: number | null; stopLoss?: number | null; inBuyZone?: boolean | null; breakout?: boolean | null; volumeRatio?: number | null; newsSentiment?: number | null; sector?: string | null };
  const top10 = (closing?.top10 ?? []) as unknown as T10[];
  const rows: TopRow[] = top10.slice(0, 8).map((r, i) => {
    const st = deriveLiveStatus({ price: r.price ?? null, entryLow: r.entryLow ?? null, entryHigh: r.entryHigh ?? null, target: r.target1 ?? null, stop: r.stopLoss ?? null });
    const meta = LIVE_STATUS_META[st];
    return {
      rank: r.rank ?? i + 1, symbol: r.symbol, name: r.name ?? r.symbol, price: r.price ?? null,
      entry: r.entryLow != null && r.entryHigh != null ? `${fmtJpy(r.entryLow)}~${fmtJpy(r.entryHigh)}` : "—",
      target: r.target1 ?? null, stop: r.stopLoss ?? null, score: r.aiScore ?? null, changePct: r.changePct ?? null,
      statusLabel: t(meta.labelKey as Parameters<typeof t>[0]), statusTone: meta.tone as Tone,
    };
  });

  // ── OpportunityRadar（closing.top10 + themes；缺可靠字段→不可靠）──
  const mkCat = (labelKey: string, pred: (r: T10) => boolean): RadarCat => {
    const g = top10.filter(pred);
    const scored = g.map((r) => r.aiScore ?? 0);
    const top = [...g].sort((a, b) => (b.aiScore ?? 0) - (a.aiScore ?? 0))[0];
    return { labelKey, count: g.length, top: top ? (top.name ?? top.symbol) : null, avg: scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : null, riskTone: "neutral", reliable: true };
  };
  const hot = themeMomentum(themes?.stocks ?? [], themes?.themes ?? [], lang).filter((h) => (h.r5 ?? 0) > 0);
  const cats: RadarCat[] = [
    mkCat("dv.ov.rad.breakout", (r) => r.breakout === true),
    mkCat("dv.ov.rad.pullback", (r) => r.inBuyZone === true && (r.changePct ?? 0) < 0),
    mkCat("dv.ov.rad.volume", (r) => (r.volumeRatio ?? 0) >= 1.5),
    { labelKey: "dv.ov.rad.hot", count: hot.length, top: hot[0]?.label ?? null, avg: null, riskTone: "neutral", reliable: hot.length > 0 || (themes?.themes?.length ?? 0) > 0 },
    mkCat("dv.ov.rad.news", (r) => (r.newsSentiment ?? 0) > 0),
    { labelKey: "dv.ov.rad.flow", count: null, top: null, avg: null, riskTone: "neutral", reliable: false }, // 按股资金流无数据源
  ];

  // ── RiskPanel（综合=后端 riskLevel；数据完整性=真实 health/cron）──
  const sys = (market as unknown as { system?: { health?: { critical?: number; warning?: number }; cron?: { allSuccess?: boolean } } } | null)?.system ?? null;
  const dataLevel = (sys?.health?.critical ?? 0) > 0 ? "HIGH" : ((sys?.health?.warning ?? 0) > 0 || sys?.cron?.allSuccess === false) ? "MED" : "LOW";
  const negNews = top10.filter((r) => (r.newsSentiment ?? 0) < 0).length;
  // 行业集中（HHI over top10 sectors）
  const secCount = new Map<string, number>();
  top10.forEach((r) => { if (r.sector) secCount.set(r.sector, (secCount.get(r.sector) ?? 0) + 1); });
  const n = [...secCount.values()].reduce((a, b) => a + b, 0);
  const hhi = n ? [...secCount.values()].reduce((a, c) => a + (c / n) ** 2, 0) : 0;
  const secLevel = hhi >= 0.4 ? "HIGH" : hhi >= 0.25 ? "MED" : n ? "LOW" : "—";
  const idxLevel = regime === "BEAR" || (gm?.topixChange ?? 0) < -1 ? "HIGH" : (gm?.topixChange ?? 0) < 0 ? "MED" : "LOW";
  const riskItems: RiskItem[] = [
    { labelKey: "dv.ov.rk.index", level: idxLevel, tone: riskTone(idxLevel) },
    { labelKey: "dv.ov.rk.sector", level: secLevel, tone: riskTone(secLevel), note: n ? `HHI ${Math.round(hhi * 100) / 100}` : undefined },
    { labelKey: "dv.ov.rk.vol", level: riskLevel ?? "—", tone: riskTone(riskLevel), note: vol != null ? `${Math.round(vol * 10) / 10}` : undefined },
    { labelKey: "dv.ov.rk.news", level: negNews > 0 ? (negNews >= 3 ? "HIGH" : "MED") : "LOW", tone: riskTone(negNews >= 3 ? "HIGH" : negNews > 0 ? "MED" : "LOW"), note: negNews ? `${negNews}` : undefined },
    { labelKey: "dv.ov.rk.fx", level: "—", tone: "neutral", note: t("dc.ov.noData") },
    { labelKey: "dv.ov.rk.data", level: dataLevel, tone: riskTone(dataLevel) },
  ];

  // ── News / Catalysts（真实，去重）──
  const seenN = new Set<string>();
  const news: NewsItem[] = x.news.filter((n2) => { const k = n2.title.trim(); if (seenN.has(k)) return false; seenN.add(k); return true; })
    .slice(0, 6).map((n2) => ({ id: String(n2.id), title: n2.title, time: fmtJstClock(n2.publishedAt), symbol: n2.stock?.symbol ?? n2.symbol ?? null, sentiment: n2.sentiment, source: n2.source }));
  const nowMs = Date.now();
  const cats2: CatItem[] = x.disc.filter((d) => nowMs - new Date(d.publishedAt).getTime() < 2 * 86400_000)
    .slice(0, 6).map((d) => ({ id: String(d.id), category: d.category ?? "OTHER", catLabel: DISC_LABEL[d.category ?? "OTHER"] ?? DISC_LABEL.OTHER, time: fmtJstClock(d.publishedAt), target: d.stock?.name ?? d.symbol, sentiment: d.sentiment }));

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 space-y-3">
      <MarketSnapshot items={mkItems} trend={trend} breadth={breadth} vol={volTxt} regimeLabel={regimeLabel} regimeTone={regimeToneV} asOf={gm?.date ?? asOf} />
      <div className="grid grid-cols-1 lg:grid-cols-[7fr_3fr] gap-3">
        <div className="space-y-3 min-w-0">
          <VerdictHero verdict={verdict} verdictLabel={verdictLabel} summary={summary} confidence={cMkt?.avgAiScore ?? null} confTip={t("dv.ov.confTip")} risk={riskLevel ?? (vol != null ? String(Math.round(vol * 10) / 10) : "—")} asOf={asOf} goHref="/decision-v2?tab=strategy" />
          <Top10Preview rows={rows} viewAllHref="/decision-v2?tab=picks" />
        </div>
        <div className="space-y-3 min-w-0">
          <OpportunityRadar cats={cats} />
          <RiskPanel items={riskItems} overall={riskLevel ?? "—"} overallTone={riskTone(riskLevel)} />
          <NewsCatalystPanel news={news} catalysts={cats2} />
        </div>
      </div>
    </div>
  );
}
