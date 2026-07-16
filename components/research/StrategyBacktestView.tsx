"use client";

// ── AI Backtest Intelligence (AI 历史回测分析中心) ─────────────────────────────
// Display-only. Reads existing read-only APIs (learning-report / backtest summary /
// mission-control / backtest strategy). No backtest engine / calc / write mutation.

import { useEffect, useState, useCallback } from "react";
import { useI18n } from "@/lib/i18n";
import {
  B, type BtRow, type Readiness, type McStratBt,
  BacktestHeader, BacktestHero, BacktestNotice, HorizonStatusCards,
  BacktestMatrixTable, MaturityTimeline, StrategyBacktestPanel, BacktestEmptyState,
} from "@/components/backtest/parts";

export default function BacktestPage() {
  const { t } = useI18n();
  const [rows, setRows] = useState<BtRow[]>([]);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [cohortCount, setCohortCount] = useState<number | null>(null);
  const [mc, setMc] = useState<McStratBt | null>(null);
  const [hasStrategyStats, setHasStrategyStats] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState("");

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [lr, sm, mcRes, st] = await Promise.all([
        fetch("/api/admin/learning-report").then((r) => r.ok ? r.json() : null).catch(() => null),
        fetch("/api/backtest/summary").then((r) => r.ok ? r.json() : null).catch(() => null),
        fetch("/api/admin/mission-control").then((r) => r.ok ? r.json() : null).catch(() => null),
        fetch("/api/backtest/strategy").then((r) => r.ok ? r.json() : null).catch(() => null),
      ]);
      if (lr) { setRows(lr.backtestSummary ?? []); setReadiness(lr.dataReadiness ?? null); }
      if (sm) setCohortCount(sm.cohortCount ?? null);
      if (mcRes?.backtest) setMc(mcRes.backtest as McStratBt);
      setHasStrategyStats(!!(st && st.totalRows > 0 && st.stats));
      setUpdatedAt(new Date().toISOString().slice(11, 16) + " UTC");
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); const id = setInterval(load, 60_000); return () => clearInterval(id); }, [load]);

  return (
    <div className="min-h-screen dash-font" style={{ background: B.bg }}>
      <div className="mx-auto max-w-[1600px] px-6 lg:px-10 py-8 dash-in">
        <BacktestHeader t={t} onRefresh={load} refreshing={refreshing} updatedAt={updatedAt} />
        {loading ? (
          <div className="py-24 text-center text-[14px]" style={{ color: B.faint }}><span className="animate-pulse">{t("common.loading")}</span></div>
        ) : rows.length === 0 ? (
          <BacktestEmptyState t={t} />
        ) : (
          <>
            <BacktestHero t={t} rows={rows} cohortCount={cohortCount} />
            <BacktestNotice t={t} />
            <HorizonStatusCards t={t} rows={rows} />
            <BacktestMatrixTable t={t} rows={rows} readiness={readiness} />
            <MaturityTimeline t={t} rows={rows} readiness={readiness} />
            <StrategyBacktestPanel t={t} mc={mc} hasStats={hasStrategyStats} />
          </>
        )}
      </div>
    </div>
  );
}
