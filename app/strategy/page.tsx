"use client";
// Strategy 页面 · 仅负责 Layout + Data Fetch(hook) + 组合（P4-T3 模块化拆分）
import { useI18n } from "@/lib/i18n";
import type { StratType, ActiveTab } from "@/components/strategy/types";
import { ALL_TYPES } from "@/components/strategy/types";
import { SM, SFONT, STRAT_HEX, stratLabel, stratShort, gradeVerdict } from "@/components/strategy/utils";
import { SRing, SBadge, MissionCard, StratPremiumCard } from "@/components/strategy/primitives";
import { StrategyTab, StabilizationTab, ReportsTab } from "@/components/strategy/tabs";
import { useStrategyOverview, useStrategyTabs } from "@/components/strategy/hooks";

export default function StrategyPage() {
  const { t } = useI18n();
  const { overview, overviewLoading } = useStrategyOverview();
  const { activeTab, setActiveTab } = useStrategyTabs("DAY_TRADE");

  const unified = overview?.unified;

  const execOk = overview?.todayExecution
    ? [overview.todayExecution.dayRecOk, overview.todayExecution.swingRecOk, overview.todayExecution.longRecOk, overview.todayExecution.backtestOk, overview.todayExecution.learningOk, overview.todayExecution.healthOk].filter(Boolean).length
    : null;
  const val = overview?.recentValidation;
  const tabDefs: { key: ActiveTab; label: string; color?: string }[] = [
    { key: "DAY_TRADE", label: stratShort("DAY_TRADE", t), color: STRAT_HEX.DAY_TRADE },
    { key: "SWING_TRADE", label: stratShort("SWING_TRADE", t), color: STRAT_HEX.SWING_TRADE },
    { key: "LONG_TRADE", label: stratShort("LONG_TRADE", t), color: STRAT_HEX.LONG_TRADE },
    { key: "STABILIZATION", label: t("strategy.stabilization.tab") },
    { key: "REPORTS", label: t("strategy.reports.tab") },
  ];
  const alloc = [{ t: "DAY_TRADE" as StratType, pct: 30 }, { t: "SWING_TRADE" as StratType, pct: 40 }, { t: "LONG_TRADE" as StratType, pct: 30 }];

  return (
    <div style={{ background: SM.bg, minHeight: "100vh", color: SM.ink, fontFamily: SFONT }}>
      <div style={{ maxWidth: 1600, margin: "0 auto", padding: "20px 24px 40px" }}>

        {/* ── Hero ── */}
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "stretch", marginBottom: 20 }}>
          <div style={{ flex: 1, minWidth: 320, background: SM.card, border: `1px solid ${SM.border}`, borderRadius: 18, padding: "18px 20px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", color: SM.faint, textTransform: "uppercase" }}>Strategy Intelligence</div>
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", marginTop: 6 }}>今日策略情报</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
              {ALL_TYPES.map((s) => {
                const g = overview?.strategies[s]?.learning?.grade ?? null;
                const c = STRAT_HEX[s];
                return <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: SM.ink, background: SM.cardHi, border: `1px solid ${SM.border}`, borderRadius: 999, padding: "5px 11px" }}><span style={{ width: 7, height: 7, borderRadius: 999, background: c }} />{stratShort(s, t)} · <span style={{ color: c }}>{gradeVerdict(g)}</span></span>;
              })}
            </div>
          </div>
          <div style={{ width: 260, minWidth: 220, background: SM.card, border: `1px solid ${SM.border}`, borderRadius: 18, padding: 18, display: "flex", alignItems: "center", gap: 16 }}>
            <SRing score={unified?.integrityScore ?? null} size={78} stroke={6} color={SM.blue} />
            <div>
              <div style={{ fontSize: 11, color: SM.faint }}>综合评分 · Integrity</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                <SBadge label={unified?.grade ?? "—"} color={unified?.grade === "A" ? SM.green : unified?.grade === "D" ? SM.red : SM.amber} />
              </div>
              <div style={{ fontSize: 11, color: SM.sub, marginTop: 8 }}>{unified?.recommendation ?? "—"}</div>
              <div style={{ fontSize: 10, color: SM.faint, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{unified?.reportDate ?? ""}</div>
            </div>
          </div>
        </div>

        {/* ── Mission Cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 24 }}>
          <MissionCard label="Overall Score" code="Integrity" value={unified?.integrityScore != null ? unified.integrityScore.toFixed(0) : "—"} unit="/100" sub={`等级 ${unified?.grade ?? "—"}`} color={SM.blue} pct={unified?.integrityScore ?? 0} />
          <MissionCard label="Execution" code="Today" value={execOk != null ? `${execOk}/6` : "—"} unit="OK" sub={overview?.todayExecution?.isToday ? "今日流水线" : "最近执行"} color={execOk === 6 ? SM.green : SM.amber} pct={execOk != null ? (execOk / 6) * 100 : 0} />
          <MissionCard label="Stability" code="Validation" value={val ? `${val.stableDays}` : "—"} unit="天" sub={val ? `健康 ${val.healthDays}/${val.totalDays}${val.phase7Ready ? " · Phase7" : ""}` : undefined} color={SM.green} />
          <MissionCard label="Learning" code="AI Grade" value={unified?.grade ?? "—"} sub={unified?.recommendation ?? "AI 学习评级"} color={unified?.grade === "A" ? SM.green : unified?.grade === "D" ? SM.red : SM.amber} />
        </div>

        {/* ── 3 Strategy Premium Cards ── */}
        <div style={{ fontSize: 11, fontWeight: 700, color: SM.faint, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12 }}>三策略 · Strategies</div>
        {overviewLoading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14, marginBottom: 24 }}>
            {[1, 2, 3].map((i) => <div key={i} style={{ height: 200, background: SM.card, border: `1px solid ${SM.border}`, borderRadius: 18 }} />)}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14, marginBottom: 20 }}>
            {ALL_TYPES.map((s) => (
              <StratPremiumCard key={s} type={s} data={overview?.strategies[s] ?? { openPositions: 0, closedTrades: 0, learning: null, bestBacktest: null, latestSnapshot: null, recommendations: null }} active={activeTab === s} onClick={() => setActiveTab(s)} label={stratLabel(s, t)} />
            ))}
          </div>
        )}

        {/* ── Fund allocation relationship (3:4:3) ── */}
        <div style={{ background: SM.card, border: `1px solid ${SM.border}`, borderRadius: 16, padding: "14px 18px", marginBottom: 26 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: SM.ink }}>资金分配 · Capital Allocation <span style={{ color: SM.faint, fontWeight: 500 }}>独立资金池 ¥100M</span></span>
            <div style={{ display: "flex", gap: 14 }}>
              {alloc.map((a) => <span key={a.t} style={{ fontSize: 11, color: SM.sub, display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: STRAT_HEX[a.t] }} />{stratShort(a.t, t)} {a.pct}%</span>)}
            </div>
          </div>
          <div style={{ display: "flex", height: 10, borderRadius: 999, overflow: "hidden", gap: 2 }}>
            {alloc.map((a) => <div key={a.t} style={{ width: `${a.pct}%`, background: STRAT_HEX[a.t] }} title={`${stratShort(a.t, t)} ${a.pct}%`} />)}
          </div>
        </div>

        {/* ── Segmented tabs ── */}
        <div style={{ display: "inline-flex", padding: 4, background: SM.card, border: `1px solid ${SM.border}`, borderRadius: 999, gap: 2, marginBottom: 18, flexWrap: "wrap" }}>
          {tabDefs.map((tb) => {
            const on = activeTab === tb.key;
            return (
              <button key={tb.key} onClick={() => setActiveTab(tb.key)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 15px", borderRadius: 999, fontSize: 13, fontWeight: 600, color: on ? SM.ink : SM.sub, background: on ? SM.cardHi : "transparent", border: "none", cursor: "pointer", transition: "background .2s, color .2s" }}>
                {tb.color && <span style={{ width: 7, height: 7, borderRadius: 999, background: tb.color }} />}{tb.label}
              </button>
            );
          })}
        </div>

        {/* ── Active tab content (unchanged logic) ── */}
        {activeTab === "STABILIZATION" ? (
          <StabilizationTab t={t} />
        ) : activeTab === "REPORTS" ? (
          <ReportsTab t={t} />
        ) : (
          <StrategyTab key={activeTab} strategyType={activeTab as StratType} overview={overview?.strategies[activeTab as StratType] ?? null} t={t} />
        )}
      </div>
    </div>
  );
}
