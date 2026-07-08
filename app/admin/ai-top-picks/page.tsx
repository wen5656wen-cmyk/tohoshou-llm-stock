"use client";

// ── /admin/ai-top-picks · AI Top Picks（P7 Preview · Experimental V1）────────
// 每日从 STRONG_BUY（不足 5 补 top BUY）综合重排 Top5，展示实时收益 + 组合表现 vs TOPIX。
// **独立实验模块 · 只读展示 · 不修改任何现有功能（StrongBuy/DR/Promotion/Strategy/Watchlist）。**

import { useEffect, useState } from "react";
import {
  AppHeader, AppCard, AppKpiCard, AppKpiGrid, AppBadge, AppButton,
  AppLoading, AppEmptyState, AppTable, AppTh, AppTd, appRowHover, COLORS,
} from "@/components/ui";

interface Pick {
  rank: number; symbol: string; name: string | null; sourceRating: string;
  entryPrice: number | null; currentPrice: number | null; returnPct: number | null; intradayPct: number | null;
  aiScore: number | null; alphaScore: number | null; contribution: number | null;
  confidence: number | null; riskScore: number | null; compositeScore: number; reason: string | null;
  momentumPenalty?: number | null; turnover?: number | null; momentum20d?: number | null;
}
interface Portfolio { portfolioReturn: number | null; benchmarkReturn: number | null; alpha: number | null; benchmarkMode: string; pickCount: number }
interface Rejected { symbol: string; name: string | null; sourceRating: string; reason: string; detail: string | null; turnover: number | null; momentum20d: number | null; rawComposite: number }
interface FilterStats { candidates: number; newsReject: number; liquidityReject: number; momentumPenalty: number; finalPicks: number; rejected: Rejected[]; config: Record<string, number> | null }
interface Hist { date: string; pickCount: number; portfolioReturn: number | null; benchmarkReturn: number | null; alpha: number | null }
interface Api {
  ok: boolean; experimental: boolean; empty?: boolean; note: string; date?: string;
  quoteSource?: string; quoteUpdatedAt?: string | null;
  picks: Pick[]; portfolio: Portfolio | null; filter: FilterStats | null; history: Hist[];
}

const REJECT_LABEL: Record<string, string> = { NEWS_NEGATIVE: "重大利空", LOW_LIQUIDITY: "流动性不足" };
function turnoverStr(v: number | null | undefined): string { return v == null ? "—" : `${(v / 1e8).toFixed(1)}亿`; }

function fmt(v: number | null | undefined, s = "", d = 2): string { return v == null ? "—" : `${Math.round(v * 10 ** d) / 10 ** d}${s}`; }
function retColor(v: number | null): string { return v == null ? COLORS.textFaint : v > 0 ? COLORS.success : v < 0 ? COLORS.danger : COLORS.textSecondary; }
function sign(v: number | null): string { return v == null ? "—" : `${v > 0 ? "+" : ""}${fmt(v, "%")}`; }

export default function AiTopPicksPage() {
  const [d, setD] = useState<Api | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/admin/ai-top-picks", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as Api;
      if (!j.ok) throw new Error("API 返回异常");
      setD(j);
    } catch (e) { setError(e instanceof Error ? e.message : "加载失败"); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  return (
    <div style={{ minHeight: "100vh", background: COLORS.background }}>
      <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-8 space-y-6">
        <AppHeader title="AI Top Picks" titleEn="AI 每日五选" status="Experimental V1.1" statusTone="purple"
          subtitle="每日从 STRONG_BUY（不足 5 补 top BUY）综合重排 Top5 + Quality Gates（News / 流动性 Reject · 动量 Penalty）（P7 实验预览 · 只读）" />

        <AppCard accent={`${COLORS.purple}33`} style={{ background: `${COLORS.purple}0A` }}>
          <div style={{ fontSize: 12.5, color: COLORS.textSecondary, lineHeight: 1.7 }}>
            <b style={{ color: COLORS.text }}>实验模块声明：</b>
            本模块为 <b>P7 Preview（Experimental V1）</b>，<b>纯只读派生</b>——只读 StockScore + AlphaScore 重排展示，
            <b style={{ color: COLORS.text }}>不修改 Strong Buy / Daily Recommendation / Promotion / Strategy / Watchlist / 任何评分逻辑</b>。
            推荐价于生成日冻结；组合收益基准为 TOPIX（跨 2026-03-30 断点窗口不可用时标 N/A）。
          </div>
        </AppCard>

        {loading && <AppCard><AppLoading label="加载 AI Top Picks…" /></AppCard>}
        {error && !loading && <AppCard><AppEmptyState title="加载失败" desc={error} actions={<AppButton size="sm" onClick={load}>重试</AppButton>} icon="⚠" /></AppCard>}

        {!loading && !error && d && d.empty && (
          <AppCard><AppEmptyState title="尚无 Top Picks" desc="等待每日 cron 生成（09:35 JST）或手动运行 npm run ai-top-picks" icon="◍" /></AppCard>
        )}

        {!loading && !error && d && !d.empty && (
          <>
            {/* 组合概览 */}
            <AppKpiGrid>
              <AppKpiCard label="当期日期" value={d.date ?? "—"} tone="neutral" sub={`Top ${d.portfolio?.pickCount ?? 0}`} />
              <AppKpiCard label="组合收益（实时·等权）" value={sign(d.portfolio?.portfolioReturn ?? null)} tone={(d.portfolio?.portfolioReturn ?? 0) >= 0 ? "green" : "neutral"} />
              <AppKpiCard label={`基准 ${d.portfolio?.benchmarkMode?.startsWith("TOPIX") ? "TOPIX" : ""}`} value={sign(d.portfolio?.benchmarkReturn ?? null)} tone="neutral" sub={d.portfolio?.benchmarkMode} />
              <AppKpiCard label="Alpha（超额）" value={sign(d.portfolio?.alpha ?? null)} tone={(d.portfolio?.alpha ?? 0) >= 0 ? "green" : "neutral"} />
            </AppKpiGrid>

            <div style={{ fontSize: 11.5, color: COLORS.textFaint }}>
              行情 {d.quoteSource} · {d.quoteUpdatedAt ? new Date(d.quoteUpdatedAt).toLocaleString("zh-CN", { hour12: false }) : "—"}
              <AppButton size="sm" variant="ghost" onClick={load} style={{ marginLeft: 10 }}>刷新</AppButton>
            </div>

            {/* Gate 5 — Today's Filter Summary */}
            {d.filter && (
              <AppCard header={<span style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>Today&apos;s Filter Summary · 质量门控</span>}>
                <div className="flex items-center gap-2" style={{ flexWrap: "wrap", fontSize: 13 }}>
                  <Funnel label="候选" value={d.filter.candidates} color={COLORS.textSecondary} />
                  <Arrow />
                  <Funnel label="News 拒" value={d.filter.newsReject} color={d.filter.newsReject ? COLORS.danger : COLORS.textMuted} />
                  <Arrow />
                  <Funnel label="流动性 拒" value={d.filter.liquidityReject} color={d.filter.liquidityReject ? COLORS.danger : COLORS.textMuted} />
                  <Arrow />
                  <Funnel label="动量 罚" value={d.filter.momentumPenalty} color={d.filter.momentumPenalty ? COLORS.warning : COLORS.textMuted} />
                  <Arrow />
                  <Funnel label="Final Top" value={d.filter.finalPicks} color={COLORS.success} strong />
                </div>
                {d.filter.config && (
                  <div style={{ fontSize: 11, color: COLORS.textFaint, marginTop: 10 }}>
                    门槛：流动性 ≥ {((d.filter.config.liquidityMinYen ?? 0) / 1e8).toFixed(0)}亿 · 动量 &gt; {d.filter.config.momentumThresholdPct}% 罚 {d.filter.config.momentumPenalty} 分 · News 回溯 {d.filter.config.newsLookbackDays} 天
                  </div>
                )}
              </AppCard>
            )}

            {/* Gate 4 — Rejected Candidates */}
            {d.filter && d.filter.rejected.length > 0 && (
              <AppCard header={<span style={{ fontSize: 14, fontWeight: 700, color: COLORS.danger }}>Rejected Candidates · 被过滤候选 {d.filter.rejected.length}</span>}>
                <AppTable minWidth={640}>
                  <thead><tr>
                    <AppTh>股票</AppTh><AppTh>原因</AppTh><AppTh>详情</AppTh>
                    <AppTh align="right">成交额</AppTh><AppTh align="right">20日涨幅</AppTh><AppTh align="right">原始分</AppTh>
                  </tr></thead>
                  <tbody>
                    {d.filter.rejected.map((r) => (
                      <tr key={r.symbol} className={appRowHover}>
                        <AppTd><span style={{ fontWeight: 600 }}>{r.name ?? r.symbol}</span> <span style={{ fontSize: 11, color: COLORS.textFaint, fontFamily: "monospace" }}>{r.symbol}</span></AppTd>
                        <AppTd><span style={{ fontSize: 11.5, fontWeight: 700, color: COLORS.danger, background: `${COLORS.danger}14`, borderRadius: 9999, padding: "2px 9px" }}>{REJECT_LABEL[r.reason] ?? r.reason}</span></AppTd>
                        <AppTd color={COLORS.textSecondary}>{r.detail ?? "—"}</AppTd>
                        <AppTd align="right" color={COLORS.textSecondary}>{turnoverStr(r.turnover)}</AppTd>
                        <AppTd align="right" color={retColor(r.momentum20d)}>{sign(r.momentum20d)}</AppTd>
                        <AppTd align="right" mono color={COLORS.textMuted}>{fmt(r.rawComposite, "", 1)}</AppTd>
                      </tr>
                    ))}
                  </tbody>
                </AppTable>
              </AppCard>
            )}

            {/* Top5 卡片 */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {d.picks.map((p) => (
                <AppCard key={p.symbol} style={{ borderLeft: `3px solid ${p.sourceRating === "STRONG_BUY" ? COLORS.success : COLORS.primary}` }}>
                  <div className="flex items-start justify-between gap-2" style={{ marginBottom: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: COLORS.purple }}>#{p.rank}</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>{p.name ?? p.symbol}</span>
                        <span style={{ fontSize: 11, color: COLORS.textFaint, fontFamily: "monospace" }}>{p.symbol}</span>
                      </div>
                      <div style={{ marginTop: 5 }}>
                        <AppBadge tone={p.sourceRating === "STRONG_BUY" ? "green" : "blue"}>{p.sourceRating === "STRONG_BUY" ? "强烈买入" : "买入"}</AppBadge>
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.purple, lineHeight: 1 }}>{fmt(p.compositeScore, "", 1)}</div>
                      <div style={{ fontSize: 10, color: COLORS.textFaint, marginTop: 2 }}>综合分{p.momentumPenalty ? <span style={{ color: COLORS.warning }}> −{p.momentumPenalty}</span> : null}</div>
                    </div>
                  </div>

                  {/* 价格 + 实时收益 */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "8px", padding: "9px 0", borderTop: `1px solid ${COLORS.borderSoft}`, borderBottom: `1px solid ${COLORS.borderSoft}` }}>
                    <Metric label="推荐价" value={fmt(p.entryPrice, "", 1)} />
                    <Metric label="当前价" value={fmt(p.currentPrice, "", 1)} />
                    <Metric label="实时收益" value={sign(p.returnPct)} color={retColor(p.returnPct)} />
                  </div>

                  {/* 评分构成 */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "8px", padding: "8px 0" }}>
                    <Metric label="AI评分" value={fmt(p.aiScore, "", 1)} small />
                    <Metric label="因子Alpha" value={fmt(p.alphaScore, "", 1)} small />
                    <Metric label="因子排名" value={p.contribution == null ? "—" : `前${fmt(100 - p.contribution, "%", 0)}`} small />
                    <Metric label="置信" value={fmt(p.confidence, "%", 0)} small />
                    <Metric label="风险分" value={fmt(p.riskScore, "", 0)} small />
                    <Metric label="今日" value={sign(p.intradayPct)} color={retColor(p.intradayPct)} small />
                  </div>

                  <div style={{ fontSize: 11, color: COLORS.textSecondary, lineHeight: 1.5, marginTop: 6 }}>{p.reason ?? "—"}</div>
                </AppCard>
              ))}
            </div>

            {/* 历史表现 */}
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.text, marginBottom: 10 }}>历史表现（各期组合 vs TOPIX）</div>
              <AppTable minWidth={640}>
                <thead><tr>
                  <AppTh>日期</AppTh><AppTh align="right">选股数</AppTh><AppTh align="right">组合收益</AppTh>
                  <AppTh align="right">TOPIX</AppTh><AppTh align="right">Alpha</AppTh>
                </tr></thead>
                <tbody>
                  {d.history.length === 0 && <tr><AppTd align="center" color={COLORS.textFaint}>暂无历史</AppTd><AppTd>{""}</AppTd><AppTd>{""}</AppTd><AppTd>{""}</AppTd><AppTd>{""}</AppTd></tr>}
                  {d.history.map((h) => (
                    <tr key={h.date} className={appRowHover}>
                      <AppTd mono>{h.date}</AppTd>
                      <AppTd align="right" color={COLORS.textSecondary}>{h.pickCount}</AppTd>
                      <AppTd align="right"><span style={{ color: retColor(h.portfolioReturn), fontWeight: 600 }}>{sign(h.portfolioReturn)}</span></AppTd>
                      <AppTd align="right" color={COLORS.textSecondary}>{sign(h.benchmarkReturn)}</AppTd>
                      <AppTd align="right"><span style={{ color: retColor(h.alpha), fontWeight: 600 }}>{sign(h.alpha)}</span></AppTd>
                    </tr>
                  ))}
                </tbody>
              </AppTable>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Funnel({ label, value, color, strong }: { label: string; value: number; color: string; strong?: boolean }) {
  return (
    <div style={{ textAlign: "center", padding: "6px 12px", borderRadius: 10, background: COLORS.tile, border: `1px solid ${strong ? color : COLORS.border}`, minWidth: 68 }}>
      <div style={{ fontSize: 18, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 10, color: COLORS.textMuted }}>{label}</div>
    </div>
  );
}
function Arrow() { return <span style={{ color: COLORS.textFaint, fontSize: 14 }}>→</span>; }

function Metric({ label, value, color, small }: { label: string; value: string; color?: string; small?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 9.5, color: COLORS.textFaint, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: small ? 12 : 13.5, fontWeight: 600, color: color ?? COLORS.text, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}
