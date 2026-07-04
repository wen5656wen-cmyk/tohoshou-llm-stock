"use client";

// ── Paper Trading Cockpit (AI Paper Broker) ───────────────────────────────────
// Display-only. All data read from /api/portfolio/paper (read-only aggregation).
// No engine / paper / schema mutation. Insufficient-data states surfaced, never faked.

import { useEffect, useState, useCallback } from "react";
import {
  M, type PaperData, type Strat,
  PaperTradingHeader, PaperModeBanner, TradingHero, TradingBrief,
  StrategyCapitalPools, PortfolioPositionsTable, TradingTimeline, TradingRiskPanel,
  ExplainDrawer,
} from "@/components/paper-trading/parts";

export default function PortfolioPage() {
  const [data, setData] = useState<PaperData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [explain, setExplain] = useState<{ strategyType: Strat; symbol: string } | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/portfolio/paper");
      if (!res.ok) throw new Error(String(res.status));
      setData(await res.json());
      setError(false);
    } catch { setError(true); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  const shell = (inner: React.ReactNode) => (
    <div className="min-h-screen dash-font" style={{ background: M.bg, color: M.ink }}>
      <div className="mx-auto max-w-[1600px] px-6 lg:px-10 py-8 dash-in">{inner}</div>
    </div>
  );

  if (loading) return shell(<div className="py-24 text-center text-[14px]" style={{ color: M.faint }}><span className="animate-pulse">Loading paper account…</span></div>);
  if (error || !data || !data.initialized) return shell(<div className="rounded-2xl p-6 text-[14px]" style={{ background: M.card, border: `1px solid ${M.border}`, color: M.faint }}>{error ? "Failed to load — please retry" : "Paper Broker not initialized"}</div>);

  return shell(
    <>
      <PaperTradingHeader data={data} onRefresh={load} refreshing={refreshing} />
      <PaperModeBanner />
      <TradingHero data={data} />
      <TradingBrief data={data} />
      <StrategyCapitalPools data={data} />
      <PortfolioPositionsTable data={data} onExplain={(strategyType, symbol) => setExplain({ strategyType, symbol })} />
      <TradingTimeline data={data} />
      <TradingRiskPanel data={data} />
      {explain && <ExplainDrawer strategyType={explain.strategyType} symbol={explain.symbol} onClose={() => setExplain(null)} />}
    </>
  );
}
