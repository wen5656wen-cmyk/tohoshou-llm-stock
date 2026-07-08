"use client";

// ── /admin/decision-center · AI Decision Center（P6-T11 · Decision Cockpit）──
// P6 最后一个展示层：整合 Market / Today's AI Decision / Feature Platform / AI Top Picks /
// System / Tomorrow Outlook。**纯展示聚合 · 不新增任何 AI 算法 · 不修改任何评分/推荐。**
// 数据来自 GET /api/admin/decision-center。

import { useEffect, useState } from "react";
import {
  AppHeader, AppCard, AppKpiCard, AppKpiGrid, AppButton, AppLoading, AppEmptyState,
  AppBadge, AppStatusChip, appRowHover, COLORS,
} from "@/components/ui";
import type { StatusKind } from "@/lib/design-tokens";

interface Market { regime: string | null; regimeScore: number | null; trendScore: number | null; breadth: number | null; volatility: number | null; riskLevel: string | null; topix: number | null; topixChange: number | null; nikkei: number | null; nikkeiChange: number | null; asOf: string | null }
interface Decision { top5: number; strongBuy: number; buy: number; watchlist: number; watchlistDate: string | null }
interface Platform { production: number; shadow: number; pending: number; integrity: number | null; promoteCandidates: number; avgAlpha: number | null; avgConfidence: number | null; factorAlphaFresh: boolean }
interface TPick { rank: number; symbol: string; name: string | null; compositeScore: number; returnPct: number | null }
interface TopPicks { date: string | null; picks: TPick[]; portfolioReturn: number | null; alpha: number | null; winRate: number | null; cumReturn: number | null; updatedAt: string | null; quoteSource: string }
interface System { health: { critical: number | null; warning: number | null; status: string | null }; cron: { total: number; success: number; failed: string[]; allSuccess: boolean }; web: string; database: string; deployment: { commitHash: string; summary: string; buildStatus: string; healthStatus: string; deployedAt: string } | null; build: string | null; version: string | null }
interface Tomorrow { market: string; risk: string; focus: { sector: string; count: number }[]; note: string }
interface Api { ok: boolean; generatedAt: string; dateJst: string; note: string; market: Market; decision: Decision; platform: Platform; topPicks: TopPicks; system: System; tomorrow: Tomorrow }

const REGIME_LABEL: Record<string, string> = { BULL: "牛市 Bullish", SIDEWAYS: "震荡 Neutral", BEAR: "熊市 Bearish" };
const REGIME_COLOR: Record<string, string> = { BULL: COLORS.success, SIDEWAYS: COLORS.warning, BEAR: COLORS.danger };
const RISK_LABEL: Record<string, string> = { LOW: "低 Low", MEDIUM: "中 Medium", HIGH: "高 High" };
const RISK_COLOR: Record<string, string> = { LOW: COLORS.success, MEDIUM: COLORS.warning, HIGH: COLORS.danger };

function fmt(v: number | null | undefined, s = "", d = 1): string { return v == null ? "—" : `${Math.round(v * 10 ** d) / 10 ** d}${s}`; }
function sign(v: number | null | undefined): string { return v == null ? "—" : `${v > 0 ? "+" : ""}${fmt(v, "%", 2)}`; }
function retColor(v: number | null | undefined): string { return v == null ? COLORS.textFaint : v > 0 ? COLORS.success : v < 0 ? COLORS.danger : COLORS.textSecondary; }

function SectionTitle({ n, title, en }: { n: number; title: string; en: string }) {
  return (
    <div className="flex items-center gap-2" style={{ marginBottom: 12, marginTop: 4 }}>
      <span style={{ width: 24, height: 24, borderRadius: 7, background: `${COLORS.primary}14`, color: COLORS.primary, fontSize: 12, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{n}</span>
      <span style={{ fontSize: 16, fontWeight: 700, color: COLORS.text }}>{title}</span>
      <span style={{ fontSize: 11.5, color: COLORS.textFaint }}>{en}</span>
    </div>
  );
}

export default function DecisionCenterPage() {
  const [d, setD] = useState<Api | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/admin/decision-center", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as Api;
      if (!j.ok) throw new Error("API 返回异常");
      setD(j);
    } catch (e) { setError(e instanceof Error ? e.message : "加载失败"); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  return (
    <div style={{ minHeight: "100vh", background: COLORS.background }}>
      <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-8 space-y-6">
        <AppHeader title="AI Decision Center" titleEn="AI 决策驾驶舱" status="P6 · Cockpit" statusTone="blue"
          subtitle="整合市场 · 今日 AI 决策 · 因子平台 · AI Top Picks · 系统状态 · 明日展望（纯展示聚合，不新增 AI，不改任何评分/推荐）" />

        {loading && <AppCard><AppLoading label="加载决策驾驶舱…" /></AppCard>}
        {error && !loading && <AppCard><AppEmptyState title="加载失败" desc={error} actions={<AppButton size="sm" onClick={load}>重试</AppButton>} icon="⚠" /></AppCard>}

        {!loading && !error && d && (
          <>
            {/* 顶部状态条 */}
            <AppCard style={{ background: `linear-gradient(135deg, ${COLORS.primary}0A, ${COLORS.purple}0A)` }}>
              <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: 12 }}>
                <div className="flex items-center gap-3" style={{ flexWrap: "wrap" }}>
                  <StatusPill label="市场" value={d.market.regime ? REGIME_LABEL[d.market.regime] ?? d.market.regime : "—"} color={d.market.regime ? REGIME_COLOR[d.market.regime] : COLORS.textMuted} />
                  <StatusPill label="风险" value={d.market.riskLevel ? RISK_LABEL[d.market.riskLevel] ?? d.market.riskLevel : "—"} color={d.market.riskLevel ? RISK_COLOR[d.market.riskLevel] : COLORS.textMuted} />
                  <StatusPill label="Health" value={d.system.health.critical === 0 ? "CRITICAL=0" : `CRITICAL=${d.system.health.critical ?? "—"}`} color={d.system.health.critical === 0 ? COLORS.success : COLORS.danger} />
                  <StatusPill label="Cron" value={d.system.cron.allSuccess ? `${d.system.cron.success}/${d.system.cron.total} ✓` : `${d.system.cron.success}/${d.system.cron.total}`} color={d.system.cron.allSuccess ? COLORS.success : COLORS.warning} />
                  <StatusPill label="Integrity" value={fmt(d.platform.integrity)} color={(d.platform.integrity ?? 0) >= 90 ? COLORS.success : COLORS.warning} />
                </div>
                <div style={{ fontSize: 11.5, color: COLORS.textFaint }}>
                  {d.dateJst} · 更新 {new Date(d.generatedAt).toLocaleTimeString("zh-CN", { hour12: false })}
                  <AppButton size="sm" variant="ghost" onClick={load} style={{ marginLeft: 10 }}>刷新</AppButton>
                </div>
              </div>
            </AppCard>

            {/* Section 1 — Market Overview */}
            <div>
              <SectionTitle n={1} title="市场总览" en="Market Overview" />
              <AppKpiGrid>
                <AppKpiCard label="JP 市场状态" value={d.market.regime ? REGIME_LABEL[d.market.regime] ?? d.market.regime : "—"} tone={d.market.regime === "BULL" ? "green" : d.market.regime === "BEAR" ? "neutral" : "amber"} sub={`Regime ${fmt(d.market.regimeScore, "", 2)}`} />
                <AppKpiCard label="TOPIX" value={fmt(d.market.topix, "", 1)} tone="blue" sub={sign(d.market.topixChange)} />
                <AppKpiCard label="日经 225" value={fmt(d.market.nikkei, "", 0)} tone="blue" sub={sign(d.market.nikkeiChange)} />
                <AppKpiCard label="市场趋势" value={fmt(d.market.trendScore, "", 2)} tone="purple" sub={`宽度 ${fmt(d.market.breadth, "%", 0)}`} />
                <AppKpiCard label="风险等级" value={d.market.riskLevel ? RISK_LABEL[d.market.riskLevel] : "—"} tone={d.market.riskLevel === "LOW" ? "green" : d.market.riskLevel === "HIGH" ? "neutral" : "amber"} sub={`波动率 ${fmt(d.market.volatility, "%", 1)}`} />
              </AppKpiGrid>
            </div>

            {/* Section 2 — Today's AI Decision */}
            <div>
              <SectionTitle n={2} title="今日 AI 决策" en="Today's AI Decision" />
              <AppKpiGrid>
                <AppKpiCard label="AI Top5" value={d.decision.top5} tone="purple" sub="综合重排" />
                <AppKpiCard label="强烈买入 STRONG_BUY" value={d.decision.strongBuy} tone="green" />
                <AppKpiCard label="买入 BUY" value={d.decision.buy} tone="blue" />
                <AppKpiCard label="每日关注池" value={d.decision.watchlist} tone="amber" sub={d.decision.watchlistDate ?? "—"} />
              </AppKpiGrid>
            </div>

            {/* Section 3 — Feature Platform */}
            <div>
              <SectionTitle n={3} title="因子平台" en="Feature Platform" />
              <AppKpiGrid>
                <AppKpiCard label="Production" value={d.platform.production} tone="green" />
                <AppKpiCard label="Shadow" value={d.platform.shadow} tone="amber" sub={`Pending ${d.platform.pending}`} />
                <AppKpiCard label="Integrity" value={fmt(d.platform.integrity)} tone={(d.platform.integrity ?? 0) >= 90 ? "green" : "amber"} sub="/ 100" />
                <AppKpiCard label="Promotion 候选" value={d.platform.promoteCandidates} tone="purple" />
                <AppKpiCard label="平均 Alpha" value={fmt(d.platform.avgAlpha, "%", 2)} tone="neutral" sub={`置信 ${fmt(d.platform.avgConfidence, "", 0)}`} />
                <AppKpiCard label="Factor Alpha" value={d.platform.factorAlphaFresh ? "🟢 新鲜" : "🔴 陈旧"} tone={d.platform.factorAlphaFresh ? "green" : "neutral"} />
              </AppKpiGrid>
            </div>

            {/* Section 4 — AI Top Picks */}
            <div>
              <SectionTitle n={4} title="AI Top Picks" en="Experimental" />
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <AppCard style={{ gridColumn: "span 1" }}>
                  <div className="grid grid-cols-2 gap-3">
                    <Mini label="组合收益（实时）" value={sign(d.topPicks.portfolioReturn)} color={retColor(d.topPicks.portfolioReturn)} />
                    <Mini label="Alpha vs TOPIX" value={sign(d.topPicks.alpha)} color={retColor(d.topPicks.alpha)} />
                    <Mini label="日胜率" value={fmt(d.topPicks.winRate, "%", 1)} />
                    <Mini label="累计收益" value={sign(d.topPicks.cumReturn)} color={retColor(d.topPicks.cumReturn)} />
                  </div>
                  <div style={{ fontSize: 10.5, color: COLORS.textFaint, marginTop: 10 }}>{d.topPicks.quoteSource} · {d.topPicks.date ?? "—"}{d.topPicks.updatedAt ? ` · ${new Date(d.topPicks.updatedAt).toLocaleTimeString("zh-CN", { hour12: false })}` : ""}</div>
                </AppCard>
                <AppCard style={{ gridColumn: "span 2" }}>
                  <table style={{ width: "100%", fontSize: 12.5 }}>
                    <tbody>
                      {d.topPicks.picks.map((p) => (
                        <tr key={p.symbol} className={appRowHover}>
                          <td style={{ padding: "6px 8px", fontWeight: 800, color: COLORS.purple, width: 30 }}>#{p.rank}</td>
                          <td style={{ padding: "6px 8px", fontWeight: 600, color: COLORS.text }}>{p.name ?? p.symbol} <span style={{ fontSize: 10.5, color: COLORS.textFaint, fontFamily: "monospace" }}>{p.symbol}</span></td>
                          <td style={{ padding: "6px 8px", textAlign: "right", color: COLORS.textSecondary }}>综合 {fmt(p.compositeScore, "", 1)}</td>
                          <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, color: retColor(p.returnPct) }}>{sign(p.returnPct)}</td>
                        </tr>
                      ))}
                      {d.topPicks.picks.length === 0 && <tr><td style={{ padding: 8, color: COLORS.textFaint }}>暂无 Top Picks</td></tr>}
                    </tbody>
                  </table>
                </AppCard>
              </div>
            </div>

            {/* Section 5 — System Status */}
            <div>
              <SectionTitle n={5} title="系统状态" en="System Status" />
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <SvcCard label="Health" kind={d.system.health.critical === 0 ? "SUCCESS" : "ERROR"} value={d.system.health.critical === 0 ? "CRITICAL=0" : `CRIT=${d.system.health.critical}`} sub={`warn ${d.system.health.warning ?? "—"}`} />
                <SvcCard label="Cron" kind={d.system.cron.allSuccess ? "SUCCESS" : "WARNING"} value={`${d.system.cron.success}/${d.system.cron.total}`} sub={d.system.cron.failed.length ? `失败 ${d.system.cron.failed.length}` : "全成功"} />
                <SvcCard label="Web" kind="SUCCESS" value="ONLINE" sub="serving" />
                <SvcCard label="Database" kind="SUCCESS" value="ONLINE" sub="connected" />
                <SvcCard label="Build" kind={d.system.build === "PASS" ? "SUCCESS" : "WARNING"} value={d.system.build ?? "—"} sub="last deploy" />
                <SvcCard label="Version" kind="INFO" value={d.system.version ?? "—"} sub={d.system.deployment ? new Date(d.system.deployment.deployedAt).toLocaleDateString("zh-CN") : "—"} />
              </div>
              {d.system.deployment && (
                <div style={{ fontSize: 11, color: COLORS.textFaint, marginTop: 8 }}>最新部署 <b style={{ color: COLORS.textSecondary }}>{d.system.deployment.commitHash}</b> · {d.system.deployment.summary.slice(0, 80)}…</div>
              )}
            </div>

            {/* Section 6 — Tomorrow Outlook */}
            <div>
              <SectionTitle n={6} title="明日展望" en="Tomorrow Outlook" />
              <AppCard style={{ background: `${COLORS.purple}06` }}>
                <div className="flex items-center gap-6" style={{ flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 10.5, color: COLORS.textFaint }}>Market</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: d.tomorrow.market === "Bullish" ? COLORS.success : d.tomorrow.market === "Bearish" ? COLORS.danger : COLORS.warning }}>{d.tomorrow.market}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10.5, color: COLORS.textFaint }}>Risk</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: RISK_COLOR[d.tomorrow.risk] ?? COLORS.textSecondary }}>{RISK_LABEL[d.tomorrow.risk] ?? d.tomorrow.risk}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 10.5, color: COLORS.textFaint, marginBottom: 4 }}>Focus（今日决策候选行业分布 Top3）</div>
                    <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
                      {d.tomorrow.focus.length === 0 && <span style={{ fontSize: 12, color: COLORS.textFaint }}>暂无行业数据</span>}
                      {d.tomorrow.focus.map((f) => (
                        <AppBadge key={f.sector} tone="purple">{f.sector} · {f.count}</AppBadge>
                      ))}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: COLORS.textFaint, marginTop: 10, lineHeight: 1.6 }}>{d.tomorrow.note}</div>
              </AppCard>
            </div>

            <div style={{ fontSize: 11, color: COLORS.textFaint, textAlign: "center", paddingTop: 4 }}>{d.note}</div>
          </>
        )}
      </div>
    </div>
  );
}

function StatusPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-1.5" style={{ fontSize: 12 }}>
      <span style={{ color: COLORS.textFaint }}>{label}</span>
      <span style={{ fontWeight: 700, color, background: `${color}14`, borderRadius: 9999, padding: "2px 10px" }}>{value}</span>
    </div>
  );
}
function Mini({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, color: COLORS.textFaint, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: color ?? COLORS.text, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}
function SvcCard({ label, kind, value, sub }: { label: string; kind: StatusKind; value: string; sub: string }) {
  return (
    <AppCard style={{ padding: 12 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
        <span style={{ fontSize: 11.5, color: COLORS.textMuted }}>{label}</span>
        <AppStatusChip kind={kind} label="" />
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.text }}>{value}</div>
      <div style={{ fontSize: 10.5, color: COLORS.textFaint }}>{sub}</div>
    </AppCard>
  );
}
