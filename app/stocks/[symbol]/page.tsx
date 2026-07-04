"use client";

import { useEffect, useState, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { getBackLabel } from "@/lib/navigation/back";
import {
  C, Skel, AiUniverseControl,
  type IntelData,
} from "@/components/stock-detail/ui";
import { Toolbar, Hero, MetricStrip, DecisionPanel, RiskPanel, CompanyPanel } from "@/components/stock-detail/panels";
import { ChartTabs, CHART_PERIODS, type TabKey } from "@/components/stock-detail/ChartTabs";
import type { PricePoint, Financial } from "@/components/stock-detail/ui";

export default function StockDetailPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = use(params);
  const decoded = decodeURIComponent(symbol);
  const { t, lang } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const source = searchParams.get("source");
  const backLabel = getBackLabel(source, lang);

  const [data, setData] = useState<IntelData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watched, setWatched] = useState(false);
  const [watchLoading, setWatchLoading] = useState(false);
  const [tab, setTab] = useState<TabKey>("price");
  const [chartFull, setChartFull] = useState<PricePoint[]>([]);
  const [chartPeriod, setChartPeriod] = useState<string>("1Y");
  const [financials, setFinancials] = useState<Financial[]>([]);
  const [finLoading, setFinLoading] = useState(false);

  // ── Fetch: intelligence + watchlist (unchanged endpoints) ──────────────────
  useEffect(() => {
    Promise.all([
      fetch(`/api/stocks/${encodeURIComponent(decoded)}/intelligence`).then((r) => r.json()),
      fetch("/api/watchlist").then((r) => r.json()).then((list: { symbol: string }[]) => setWatched(list.some((w) => w.symbol === decoded))).catch(() => null),
    ]).then(([d]) => { if (d.error) setError(d.error); else setData(d as IntelData); }).catch((e) => setError(e.message));
  }, [decoded]);

  // Chart series (lazy — loaded once the price tab is viewed; price is default)
  useEffect(() => {
    if (tab !== "price" || chartFull.length > 0) return;
    fetch(`/api/stocks/${encodeURIComponent(decoded)}/indicators`).then((r) => r.json())
      .then((d) => { if (d.series) setChartFull(d.series.all ?? []); }).catch(() => null);
  }, [tab, decoded, chartFull.length]);

  // Financials (lazy — loaded when the financials tab is viewed)
  useEffect(() => {
    if (tab !== "fin" || financials.length > 0) return;
    setFinLoading(true);
    fetch(`/api/financials/${encodeURIComponent(decoded)}`).then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setFinancials(d); }).catch(() => null).finally(() => setFinLoading(false));
  }, [tab, decoded, financials.length]);

  const toggleWatch = async () => {
    if (!data) return;
    setWatchLoading(true);
    const { stock } = data;
    if (watched) { await fetch(`/api/watchlist?symbol=${encodeURIComponent(stock.symbol)}`, { method: "DELETE" }); setWatched(false); }
    else { await fetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: stock.symbol, name: stock.name, sector: stock.sector, market: stock.market }) }); setWatched(true); }
    setWatchLoading(false);
  };

  const onBack = () => {
    if (returnTo) router.push(returnTo);
    else if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/screener");
  };
  const onShare = async () => {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    const title = data ? data.stock.nameZh ?? data.stock.name : decoded;
    try { if (navigator.share) await navigator.share({ title, url }); else await navigator.clipboard?.writeText(url); } catch { /* user cancelled */ }
  };
  const onReport = () => setTab("ai");

  // ── Error / loading ────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen dash-font" style={{ background: "#FAFAFA" }}>
        <div className="mx-auto max-w-[1600px] px-5 lg:px-8 py-8">
          <div className="dash-card p-5 text-[14px]" style={{ color: C.red }}>{t("stock.load_error")}：{error}</div>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="min-h-screen dash-font" style={{ background: "#FAFAFA" }}>
        <div className="mx-auto max-w-[1600px] px-5 lg:px-8 py-4 space-y-4">
          <Skel className="h-9 w-40 rounded-lg" />
          <Skel className="h-[130px] w-full rounded-[22px]" />
          <Skel className="h-[70px] w-full rounded-[22px]" />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <Skel className="lg:col-span-8 h-[440px] rounded-[22px]" />
            <Skel className="lg:col-span-4 h-[440px] rounded-[22px]" />
          </div>
        </div>
      </div>
    );
  }

  const { stock, score, indicators: ind, gpt, news, strategy, riskAnalysis, sectorComparison } = data;
  const latestClose = ind?.latestClose ?? score?.latestClose ?? 0;
  const latestDate = ind?.latestDate ?? score?.latestDate ?? "";
  const stratC = strategy.classification;
  const stratKey = (stratC?.strategyType ?? "SWING");

  const aiConclusion = (lang === "ja-JP" && gpt?.summaryJa) ? gpt.summaryJa
    : (lang === "en-US" && gpt?.summaryEn) ? gpt.summaryEn
    : gpt?.summaryZh ?? score?.recommendationReason ?? score?.summaryReason ?? null;
  const topReasons = [...(score?.actionReasons ?? []), ...(gpt?.strengths ?? []).filter((s) => !(score?.actionReasons ?? []).includes(s))].slice(0, 5);
  const topRisks = [...(score?.actionWarnings ?? []), ...(gpt?.risks ?? []).filter((r) => !(score?.actionWarnings ?? []).includes(r))].slice(0, 5);

  const period = CHART_PERIODS.find((p) => p.key === chartPeriod) ?? CHART_PERIODS[3];
  const chartData = chartFull.slice(-period.n);

  return (
    <div className="min-h-screen dash-font" style={{ background: "#FAFAFA" }}>
      <div className="mx-auto max-w-[1600px] px-5 lg:px-8 py-4 space-y-3.5">
        <Toolbar backLabel={backLabel} onBack={onBack} watched={watched} watchLoading={watchLoading} onToggleWatch={toggleWatch} onShare={onShare} onReport={onReport} />

        <div className="dash-in space-y-3.5" style={{ animationDelay: "20ms" }}>
          <Hero stock={stock} score={score} ind={ind} latestClose={latestClose} latestDate={latestDate} stratKey={stratKey} hasStrat={!!stratC} />
          <MetricStrip score={score} ind={ind} stock={stock} latestClose={latestClose} />
          <AiUniverseControl
            symbol={stock.symbol}
            aiEnabled={stock.aiEnabled ?? true}
            excludeReason={stock.excludeReason ?? null}
            aiExcludeSource={stock.aiExcludeSource ?? null}
            aiExcludeRule={stock.aiExcludeRule ?? null}
            aiExcludeUpdatedAt={stock.aiExcludeUpdatedAt ?? null}
            onUpdate={(aiEnabled, excludeReason, aiExcludeSource, aiExcludeRule, aiExcludeUpdatedAt) =>
              setData((prev) => prev ? { ...prev, stock: { ...prev.stock, aiEnabled, excludeReason, aiExcludeSource, aiExcludeRule, aiExcludeUpdatedAt } } : prev)}
          />
        </div>

        {/* Left main + right AI decision rail */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 dash-in" style={{ animationDelay: "60ms" }}>
          <div className="lg:col-span-8 min-w-0">
            <ChartTabs
              tab={tab} setTab={setTab} ind={ind} score={score}
              chartData={chartData} chartPeriod={chartPeriod} setChartPeriod={setChartPeriod} chartLoading={chartFull.length === 0}
              financials={financials} financialsLoading={finLoading}
              news={news} symbol={stock.symbol} latestClose={latestClose} latestDate={latestDate}
            />
          </div>
          <div className="lg:col-span-4 min-w-0">
            <div className="lg:sticky lg:top-4 space-y-3.5">
              <DecisionPanel score={score} gpt={gpt} stratC={stratC} stratKey={stratKey} aiConclusion={aiConclusion} topReasons={topReasons} topRisks={topRisks} latestClose={latestClose} />
              <RiskPanel risk={riskAnalysis} />
              <CompanyPanel stock={stock} sectorComparison={sectorComparison} />
            </div>
          </div>
        </div>

        <div className="text-center text-[11px] pb-4" style={{ color: C.faint }}>{t("ai_action.disclaimer")}</div>
      </div>
    </div>
  );
}
