"use client";
// Strategy 模块 · Tab 容器（P4-T3）
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n";
import type { StrategyDetail, OverviewStrategy, ValidationRecord, Phase7Cond, ValidationData, ReportData, StratType } from "./types";
import { ExplainDrawer } from "./ExplainDrawer";
import { OverviewCard, LearningSection, BacktestSection, PositionsSection, TradesSection, RecommendationSection, CapitalSection, ReportSection, SystemStatusCard, TodayExecutionCard, StabilizationStatusCard } from "./sections";
import { GradeBadge, RecBadge, StatusChip, SRing, SBadge, MissionCard, StratPremiumCard } from "./primitives";
import { STRAT_COLOR, stratLabel, stratShort, returnColor, fmtPct, fmtScore, maturity, EXIT_REASON_KEYS, SM, SHADOW, STRAT_HEX, SFONT, gradeVerdict, retHex, normalizeSymbol, fill, DIM_ORDER, dimValue } from "./utils";
import { PHASE7_LABEL_MAP } from "./types";

export function StrategyTab({
  strategyType,
  overview,
  t,
}: {
  strategyType: StratType;
  overview: OverviewStrategy | null;
  t: (k: MessageKey) => string;
}) {
  const [detail, setDetail] = useState<StrategyDetail | null>(null);
  const [explainSymbol, setExplainSymbol] = useState<string | null>(null);
  const [queryInput, setQueryInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError]  = useState<string | null>(null);

  const fetchDetail = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/strategy/${strategyType}`)
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((d: StrategyDetail) => { setDetail(d); setLoading(false); })
      .catch((e) => { setError(String(e)); setLoading(false); });
  }, [strategyType]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 bg-white rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="bg-red-900/20 border border-red-700/40 rounded-xl p-6 text-red-400 text-sm">
        Error: {error ?? "No data"}
      </div>
    );
  }

  const isDayTrade = strategyType === "DAY_TRADE";

  return (
    <div className="space-y-4">
      {/* Capital stats for SWING/LONG */}
      {!isDayTrade && (
        <CapitalSection capitalLog={detail.capitalLog} snapshot={overview?.latestSnapshot ?? null} t={t} />
      )}

      {/* Recommendations (Top10) */}
      <RecommendationSection
        recs={detail.recommendations}
        strategyType={strategyType}
        t={t}
        onExplain={setExplainSymbol}
      />

      {/* Why Not Recommended — query any stock (T2 P4) */}
      <div className="bg-white rounded-lg border border-[#E8EAED] px-4 py-3">
        <h3 className="text-sm font-semibold text-[#4B5563] mb-2">{t("explain.query_title")}</h3>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const sym = normalizeSymbol(queryInput);
            if (sym) setExplainSymbol(sym);
          }}
        >
          <input
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder={t("explain.query_placeholder")}
            className="flex-1 bg-white border border-[#E8EAED] rounded-md px-3 py-1.5 text-xs text-[#1D1D1F] placeholder-[#A1A1A6] focus:outline-none focus:border-[#007AFF]"
          />
          <button
            type="submit"
            disabled={!queryInput.trim()}
            className="text-xs px-3 py-1.5 rounded-md bg-blue-600/70 hover:bg-blue-500/70 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
          >
            {t("explain.view_reason")}
          </button>
        </form>
      </div>

      {/* AI Explain Drawer (T2 P3) */}
      {explainSymbol && (
        <ExplainDrawer
          strategyType={strategyType}
          symbol={explainSymbol}
          tradeDate={detail.recommendations.tradeDate}
          onClose={() => setExplainSymbol(null)}
        />
      )}

      {/* Recent closed trades */}
      <TradesSection trades={detail.recentTrades} t={t} />

      {/* Positions (SWING / LONG only — spec: DAY 禁止显示持有至今/当前持仓) */}
      {!isDayTrade && (
        <PositionsSection positions={detail.openPositions} t={t} />
      )}

      {/* Learning */}
      <div>
        <div className="text-xs font-semibold text-[#86868B] uppercase tracking-wider mb-2">
          {t("strategy.learning.grade")}
        </div>
        <LearningSection learning={detail.learning} t={t} />
      </div>

      {/* Backtest */}
      <div>
        <div className="text-xs font-semibold text-[#86868B] uppercase tracking-wider mb-2">
          {t("strategy.backtest.section")}
        </div>
        <BacktestSection summaries={detail.backtestSummaries} t={t} />
      </div>
    </div>
  );
}

// ── Stabilization tab types ───────────────────────────────────────────────────


export const CHECK_FIELDS = [
  { field: "dayRecOk",      label: "strategy.validation.check.dayRec"   as MessageKey },
  { field: "swingRecOk",    label: "strategy.validation.check.swingRec" as MessageKey },
  { field: "longRecOk",     label: "strategy.validation.check.longRec"  as MessageKey },
  { field: "strategyOk",    label: "strategy.validation.check.strategy" as MessageKey },
  { field: "snapshotOk",    label: "strategy.validation.check.snapshot" as MessageKey },
  { field: "tradeResultOk", label: "strategy.validation.check.trade"    as MessageKey },
  { field: "backtestOk",    label: "strategy.validation.check.backtest" as MessageKey },
  { field: "learningOk",    label: "strategy.validation.check.learning" as MessageKey },
  { field: "healthOk",      label: "strategy.validation.check.health"   as MessageKey },
] as const;

// ── Stabilization tab component ───────────────────────────────────────────────


export function StabilizationTab({ t }: { t: (k: MessageKey) => string }) {
  const [data, setData]       = useState<ValidationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch("/api/strategy/validation")
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((d: ValidationData) => { setData(d); setLoading(false); })
      .catch((e) => { setError(String(e)); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => <div key={i} className="h-28 bg-white rounded-xl animate-pulse" />)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-700/40 rounded-xl p-6 text-red-400 text-sm">
        Error: {error}
      </div>
    );
  }

  const records = data?.records ?? [];
  const latest  = data?.latest ?? null;
  const phase7  = data?.phase7 ?? { ready: false, conditions: [] };
  const stats   = data?.stats  ?? { totalRuns: 0, passRuns: 0, passRate: null, incidentRuns: 0, consecutiveHealthDays: 0 };

  return (
    <div className="space-y-5">
      {/* Stabilization header banner */}
      <div className="flex items-center justify-between bg-violet-900/20 border border-violet-700/40 rounded-xl px-5 py-4">
        <div>
          <div className="text-sm font-semibold text-violet-300">{t("strategy.stabilization.title")}</div>
          <div className="text-xs text-violet-400/70 mt-0.5">{t("strategy.stabilization.period")}</div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-[10px] font-semibold text-violet-400 bg-violet-900/40 border border-violet-700/50 px-2.5 py-1 rounded">
            {t("strategy.stabilization.frozen")}
          </span>
          <span className="text-[10px] text-[#86868B]">
            {t("strategy.validation.passRate")}{": "}
            {stats.passRate != null ? `${(stats.passRate * 100).toFixed(0)}%` : "—"}
            {` (${stats.passRuns}/${stats.totalRuns})`}
          </span>
        </div>
      </div>

      {/* Phase 7 readiness */}
      <div className="bg-white rounded-xl border border-[#E8EAED] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#E8EAED] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#4B5563]">{t("strategy.phase7.title")}</h3>
          {phase7.ready ? (
            <span className="text-xs font-bold text-emerald-300 bg-emerald-900/40 border border-emerald-700/50 px-2.5 py-1 rounded">
              🚀 {t("strategy.phase7.ready")}
            </span>
          ) : (
            <span className="text-xs text-[#86868B] bg-[#F4F5F7] px-2.5 py-1 rounded">
              {t("strategy.phase7.not_ready")}
            </span>
          )}
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-2">
          {phase7.conditions.map((cond) => (
            <div
              key={cond.key}
              className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg border ${
                cond.met ? "bg-emerald-900/10 border-emerald-800/30" : "bg-[#F4F5F7] border-[#EEF0F4]"
              }`}
            >
              <div className="flex items-center gap-2 text-xs">
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${
                  cond.met ? "bg-emerald-500/30 text-emerald-300" : "bg-[#E8EAED] text-[#6E6E73]"
                }`}>
                  {cond.met ? "✓" : "○"}
                </span>
                <span className={cond.met ? "text-[#4B5563]" : "text-[#86868B]"}>
                  {t(PHASE7_LABEL_MAP[cond.key] ?? "strategy.phase7.conditions")}
                </span>
              </div>
              <span className={`text-[10px] tabular-nums flex-shrink-0 font-mono ${cond.met ? "text-emerald-400" : "text-[#86868B]"}`}>
                {cond.current}/{cond.target}
              </span>
            </div>
          ))}
          {phase7.conditions.length === 0 && (
            <p className="col-span-2 text-center text-[#86868B] text-xs py-2">
              {t("strategy.validation.noData")}
            </p>
          )}
        </div>
      </div>

      {/* Cumulative stats */}
      {latest && (
        <div className="bg-white rounded-xl border border-[#E8EAED] p-4">
          <div className="text-xs font-semibold text-[#86868B] uppercase tracking-wider mb-3">
            {t("strategy.cumulative.title")}
          </div>
          <div className="grid grid-cols-3 gap-4 text-xs text-center">
            {[
              { label: "DAY",   filled: latest.dayFilledTotal,   winRate: latest.dayWinRate,   grade: latest.dayGrade   },
              { label: "SWING", filled: latest.swingClosedTotal, winRate: latest.swingWinRate, grade: latest.swingGrade },
              { label: "LONG",  filled: latest.longClosedTotal,  winRate: latest.longWinRate,  grade: latest.longGrade  },
            ].map(({ label, filled, winRate, grade }) => (
              <div key={label}>
                <div className="text-[10px] text-[#86868B] mb-1">{label}</div>
                <div className="text-lg font-bold text-[#1D1D1F] tabular-nums">{filled ?? 0}</div>
                <div className="text-[10px] text-[#6E6E73] mb-1">
                  {winRate != null ? `${(winRate * 100).toFixed(0)}% win` : "—"}
                </div>
                <GradeBadge grade={grade ?? null} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Daily validation history */}
      <div className="bg-white rounded-xl border border-[#E8EAED] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#E8EAED] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#4B5563]">{t("strategy.validation.title")}</h3>
          <span className="text-xs text-[#86868B]">{records.length}{" "}days</span>
        </div>
        {records.length === 0 ? (
          <div className="p-8 text-center text-[#86868B] text-sm">{t("strategy.validation.noData")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="border-b border-[#EEF0F4] text-[#86868B]">
                  <th className="text-left px-4 py-2 whitespace-nowrap">{t("strategy.validation.date")}</th>
                  {CHECK_FIELDS.map(({ label }) => (
                    <th key={label} className="text-center px-1.5 py-2 whitespace-nowrap">{t(label)}</th>
                  ))}
                  <th className="text-center px-3 py-2">{t("strategy.validation.incident")}</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className={`border-b border-[#EEF0F4] hover:bg-[#F4F5F7] ${r.allPass ? "" : "bg-red-900/5"}`}>
                    <td className="px-4 py-2 text-[#4B5563] font-mono whitespace-nowrap">
                      {r.validationDate?.slice(0, 10)}
                    </td>
                    {CHECK_FIELDS.map(({ field }) => (
                      <td key={field} className="text-center px-1.5 py-2">
                        <span className={(r as any)[field] ? "text-emerald-400" : "text-red-400"}>
                          {(r as any)[field] ? "✓" : "✗"}
                        </span>
                      </td>
                    ))}
                    <td className="text-center px-3 py-2">
                      {r.incidentReport
                        ? <span className="text-red-400" title={r.incidentReport}>⚠</span>
                        : <span className="text-[#A1A1A6]">—</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

// ── Reports tab ───────────────────────────────────────────────────────────────


export function ReportsTab({ t }: { t: (k: MessageKey) => string }) {
  const [weeklyLabel, setWeeklyLabel]   = useState<string | null>(null);
  const [monthlyLabel, setMonthlyLabel] = useState<string | null>(null);
  const [weeklyData, setWeeklyData]     = useState<ReportData | null>(null);
  const [monthlyData, setMonthlyData]   = useState<ReportData | null>(null);
  const [loading, setLoading]           = useState(true);

  const fetchReports = useCallback((wLabel: string | null, mLabel: string | null) => {
    setLoading(true);
    const wQ = wLabel ? `?label=${wLabel}` : "";
    const mQ = mLabel ? `?label=${mLabel}` : "";
    Promise.all([
      fetch(`/api/reports/weekly${wQ}`).then((r) => r.json()),
      fetch(`/api/reports/monthly${mQ}`).then((r) => r.json()),
    ]).then(([wd, md]: [ReportData, ReportData]) => {
      setWeeklyData(wd);
      setMonthlyData(md);
      if (!wLabel) setWeeklyLabel(wd.latest);
      if (!mLabel) setMonthlyLabel(md.latest);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { fetchReports(null, null); }, [fetchReports]);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => <div key={i} className="h-40 bg-white rounded-xl animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 bg-teal-900/20 border border-teal-700/40 rounded-xl px-5 py-4">
        <span className="text-teal-300 text-lg">📊</span>
        <div>
          <div className="text-sm font-semibold text-teal-300">{t("strategy.reports.title")}</div>
          <div className="text-xs text-teal-400/70 mt-0.5">T2 P1 — Reporting System</div>
        </div>
      </div>

      {/* Weekly Report */}
      <ReportSection
        title={t("strategy.reports.weekly.title")}
        data={weeklyData}
        selectedLabel={weeklyLabel}
        onSelect={(label) => {
          setWeeklyLabel(label);
          fetchReports(label, monthlyLabel);
        }}
        t={t}
        accent="teal"
      />

      {/* Monthly Report */}
      <ReportSection
        title={t("strategy.reports.monthly.title")}
        data={monthlyData}
        selectedLabel={monthlyLabel}
        onSelect={(label) => {
          setMonthlyLabel(label);
          fetchReports(weeklyLabel, label);
        }}
        t={t}
        accent="indigo"
      />
    </div>
  );
}

