"use client";

// ── /admin/ai-top-picks · AI Top Picks（P7 Preview · Experimental V1）────────
// 每日从 STRONG_BUY（不足 5 补 top BUY）综合重排 Top5，展示实时收益 + 组合表现 vs TOPIX。
// **独立实验模块 · 只读展示 · 不修改任何现有功能（StrongBuy/DR/Promotion/Strategy/Watchlist）。**

import { useEffect, useState } from "react";
import {
  AppHeader, AppCard, AppKpiCard, AppKpiGrid, AppBadge, AppButton,
  AppLoading, AppEmptyState, AppTable, AppTh, AppTd, appRowHover, COLORS,
} from "@/components/ui";
import ExplainReportButton from "@/components/explain/ExplainReportButton";

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
interface CohortStats { cumReturn: number | null; avgDailyReturn: number | null; winRate: number | null; maxDrawdown: number | null; sharpe: number | null; days: number }
interface PerfSummary {
  days: number; top5: CohortStats; strongBuy: CohortStats; buy: CohortStats; topix: CohortStats;
  top5AlphaVsTopix: number | null; top5AlphaVsStrongBuy: number | null; top5AlphaVsBuy: number | null;
  pickWinRate: number | null; todayTop5Ret: number | null; latestDate: string | null;
}
interface WeeklyRow { week: string; days: number; top5: CohortStats; topix: CohortStats; alphaVsTopix: number | null; bestPick: { date: string; ret: number } | null; worstPick: { date: string; ret: number } | null }
interface Performance { summary: PerfSummary; weekly: WeeklyRow[]; daily: unknown[]; note: string | null }
interface Api {
  ok: boolean; experimental: boolean; empty?: boolean; note: string; date?: string;
  quoteSource?: string; quoteUpdatedAt?: string | null;
  picks: Pick[]; portfolio: Portfolio | null; filter: FilterStats | null; performance?: Performance; history: Hist[];
  // P9-DECISION-02：API 只读新增字段 —— 每股历史胜率（口径见 perSymbolWinRateSpec）
  perSymbolWinRate?: Record<string, { picks: number; wins: number; winRate: number | null; status: "ok" | "insufficient" }>;
  perSymbolWinRateSpec?: { horizonDays: number; basis: string; benchmarkPrice: string; winRule: string; minSample: number; note: string };
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

  // ── P9-DECISION-02：每股扩展信息（买区/目标/止损/产业链/理由）──
  // 仅 5 只 picks → 5 次 explain（非 31 次），并在会话内缓存；失败即「暂无数据」，页面不报错。
  type Ext = { entry?: string; t1?: string; sl?: string; exp?: string; chain?: string; reasons?: string[] };
  const [ext, setExt] = useState<Record<string, Ext>>({});
  useEffect(() => {
    const syms = (d?.picks ?? []).map((p) => p.symbol);
    if (!syms.length) return;
    let alive = true;
    (async () => {
      const themeJson = await fetch("/api/ai-theme", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      const chainBySym = new Map<string, string>();
      for (const s of themeJson?.stocks ?? []) {
        if (s.supplyChainLayer || s.subTheme) chainBySym.set(s.symbol, `${s.supplyChainLayer ?? "—"} / ${s.subTheme ?? "—"}`);
      }
      const closing = await fetch("/api/admin/closing-decision", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      const zoneBySym = new Map<string, string>();
      for (const r of closing?.top10 ?? []) {
        if (r.entryLow != null && r.entryHigh != null) zoneBySym.set(r.symbol, `¥${Math.round(r.entryLow).toLocaleString()}~¥${Math.round(r.entryHigh).toLocaleString()}`);
      }
      const out: Record<string, Ext> = {};
      await Promise.all(syms.map(async (sym) => {
        const e: Ext = {};
        const chain = chainBySym.get(sym); if (chain) e.chain = chain;
        const zone = zoneBySym.get(sym); if (zone) e.entry = zone;
        try {
          const j = await fetch(`/api/explain/${encodeURIComponent(sym)}/report`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null));
          const r = j?.report;
          if (r) {
            const t1 = r.takeProfit?.t1 ?? null;
            const sl = r.stopLoss?.price ?? null;
            if (t1 != null) e.t1 = `¥${Math.round(t1).toLocaleString()}`;
            if (sl != null) e.sl = `¥${Math.round(sl).toLocaleString()}`;
            const cur = (d?.picks ?? []).find((p) => p.symbol === sym)?.currentPrice ?? null;
            if (t1 != null && cur) e.exp = `${((t1 - cur) / cur) * 100 > 0 ? "+" : ""}${(Math.round(((t1 - cur) / cur) * 1000) / 10).toFixed(1)}%`;
            if (Array.isArray(r.recommendReasons) && r.recommendReasons.length) e.reasons = r.recommendReasons;
          }
        } catch { /* 安全空态 */ }
        out[sym] = e;
      }));
      if (alive) setExt(out);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d?.picks]);

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

            {/* V1.1 Freeze Validation — Performance & Benchmark Comparison */}
            {d.performance && (
              <AppCard header={<span style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>实验验证 · 累计表现 & Benchmark 对比（{d.performance.summary.days} 交易日）</span>}>
                {d.performance.summary.days === 0 ? (
                  <div style={{ fontSize: 12.5, color: COLORS.textSecondary, lineHeight: 1.6 }}>
                    {d.performance.note ?? "验证 Day 1：首个已实现 1 日收益将在下一交易日收盘后产生。"}
                    <div style={{ fontSize: 11, color: COLORS.textFaint, marginTop: 6 }}>模型：日度再平衡 · 1 日持有 · 等权。每日 09:40 JST 自动累计 Top5 / STRONG_BUY / BUY / TOPIX 已实现收益。</div>
                  </div>
                ) : (
                  <>
                    <div style={{ overflowX: "auto" }}>
                      <AppTable minWidth={720}>
                        <thead><tr>
                          <AppTh>Cohort</AppTh><AppTh align="right">累计收益</AppTh><AppTh align="right">日均</AppTh>
                          <AppTh align="right">日胜率</AppTh><AppTh align="right">最大回撤</AppTh><AppTh align="right">Sharpe</AppTh><AppTh align="right">vs TOPIX</AppTh>
                        </tr></thead>
                        <tbody>
                          {([["Top5", d.performance.summary.top5, d.performance.summary.top5AlphaVsTopix, true],
                             ["STRONG_BUY", d.performance.summary.strongBuy, d.performance.summary.top5AlphaVsStrongBuy != null ? -d.performance.summary.top5AlphaVsStrongBuy : null, false],
                             ["BUY", d.performance.summary.buy, null, false],
                             ["TOPIX", d.performance.summary.topix, null, false]] as [string, CohortStats, number | null, boolean][]).map(([label, c, , hl]) => (
                            <tr key={label} className={appRowHover} style={hl ? { background: `${COLORS.purple}08` } : undefined}>
                              <AppTd><span style={{ fontWeight: hl ? 800 : 600, color: hl ? COLORS.purple : COLORS.text }}>{label}</span></AppTd>
                              <AppTd align="right"><span style={{ color: retColor(c.cumReturn), fontWeight: 700 }}>{sign(c.cumReturn)}</span></AppTd>
                              <AppTd align="right" color={COLORS.textSecondary}>{sign(c.avgDailyReturn)}</AppTd>
                              <AppTd align="right" color={COLORS.textSecondary}>{fmt(c.winRate, "%", 1)}</AppTd>
                              <AppTd align="right" color={retColor(c.maxDrawdown)}>{fmt(c.maxDrawdown, "%", 2)}</AppTd>
                              <AppTd align="right" color={COLORS.textSecondary}>{fmt(c.sharpe, "", 2)}</AppTd>
                              <AppTd align="right">{label === "Top5" ? <span style={{ color: retColor(d.performance!.summary.top5AlphaVsTopix), fontWeight: 700 }}>{sign(d.performance!.summary.top5AlphaVsTopix)}</span> : "—"}</AppTd>
                            </tr>
                          ))}
                        </tbody>
                      </AppTable>
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.textFaint, marginTop: 8 }}>
                      Top5 vs STRONG_BUY {sign(d.performance.summary.top5AlphaVsStrongBuy)} · vs BUY {sign(d.performance.summary.top5AlphaVsBuy)} · 个股胜率 {fmt(d.performance.summary.pickWinRate, "%", 1)} · 模型：日度再平衡·1日持有·等权
                    </div>
                    {d.performance.weekly.length > 0 && (
                      <div style={{ marginTop: 14 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.text, marginBottom: 8 }}>Weekly Report</div>
                        <AppTable minWidth={620}>
                          <thead><tr><AppTh>周</AppTh><AppTh align="right">天数</AppTh><AppTh align="right">Top5</AppTh><AppTh align="right">TOPIX</AppTh><AppTh align="right">Alpha</AppTh><AppTh align="right">Sharpe</AppTh><AppTh>Best/Worst</AppTh></tr></thead>
                          <tbody>
                            {d.performance.weekly.map((w) => (
                              <tr key={w.week} className={appRowHover}>
                                <AppTd mono>{w.week}</AppTd>
                                <AppTd align="right" color={COLORS.textSecondary}>{w.days}</AppTd>
                                <AppTd align="right"><span style={{ color: retColor(w.top5.cumReturn), fontWeight: 600 }}>{sign(w.top5.cumReturn)}</span></AppTd>
                                <AppTd align="right" color={COLORS.textSecondary}>{sign(w.topix.cumReturn)}</AppTd>
                                <AppTd align="right"><span style={{ color: retColor(w.alphaVsTopix), fontWeight: 600 }}>{sign(w.alphaVsTopix)}</span></AppTd>
                                <AppTd align="right" color={COLORS.textSecondary}>{fmt(w.top5.sharpe, "", 2)}</AppTd>
                                <AppTd color={COLORS.textFaint} mono>{w.bestPick ? `+${w.bestPick.ret}` : "—"} / {w.worstPick ? `${w.worstPick.ret}` : "—"}</AppTd>
                              </tr>
                            ))}
                          </tbody>
                        </AppTable>
                      </div>
                    )}
                  </>
                )}
              </AppCard>
            )}

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
                        <ExplainReportButton symbol={p.symbol} name={p.name} size="xs" />
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

                  {/* P9-DECISION-02 增强：风险等级(真实二值) / 买区 / 目标 / 止损 / 产业链位置 / 每股历史胜率 */}
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${COLORS.borderSoft}`, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 10px", fontSize: 11 }}>
                    <Kv2 k="风险等级" v={p.riskScore == null ? "暂无数据" : p.riskScore >= 70 ? "低" : "高"}
                        c={p.riskScore == null ? COLORS.textFaint : p.riskScore >= 70 ? COLORS.success : COLORS.danger} />
                    <Kv2 k="上涨概率" v="暂无数据" c={COLORS.textFaint} />
                    <Kv2 k="买入区间" v={ext[p.symbol]?.entry ?? "暂无数据"} c={ext[p.symbol]?.entry ? COLORS.text : COLORS.textFaint} />
                    <Kv2 k="目标价" v={ext[p.symbol]?.t1 ?? "读取中"} c={ext[p.symbol]?.t1 ? COLORS.text : COLORS.textFaint} />
                    <Kv2 k="止损价" v={ext[p.symbol]?.sl ?? "读取中"} c={ext[p.symbol]?.sl ? COLORS.danger : COLORS.textFaint} />
                    <Kv2 k="预计收益" v={ext[p.symbol]?.exp ?? "暂无数据"} c={ext[p.symbol]?.exp ? COLORS.success : COLORS.textFaint} />
                    <Kv2 k="产业链位置" v={ext[p.symbol]?.chain ?? "非 AI 主题覆盖"} c={ext[p.symbol]?.chain ? COLORS.text : COLORS.textFaint} />
                    <Kv2 k="历史胜率" v={winLabel(d.perSymbolWinRate?.[p.symbol])} c={d.perSymbolWinRate?.[p.symbol]?.status === "ok" ? COLORS.text : COLORS.textFaint} />
                  </div>

                  {/* AI 推荐理由（最多 3 条，来自 explain.recommendReasons；未就绪时回退 pick.reason） */}
                  <div style={{ marginTop: 6 }}>
                    <div style={{ fontSize: 10, color: COLORS.textFaint, marginBottom: 2 }}>AI 推荐理由</div>
                    {ext[p.symbol]?.reasons?.length ? (
                      <ul style={{ fontSize: 11, color: COLORS.textSecondary, lineHeight: 1.6 }}>
                        {ext[p.symbol]!.reasons!.slice(0, 3).map((r, i) => <li key={i}>· {r}</li>)}
                      </ul>
                    ) : (
                      <div style={{ fontSize: 11, color: COLORS.textSecondary, lineHeight: 1.5 }}>{p.reason ?? "暂无数据"}</div>
                    )}
                  </div>
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

// ── P9-DECISION-02 helpers ──────────────────────────────────────────────────
function Kv2({ k, v, c }: { k: string; v: string; c?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
      <span style={{ color: COLORS.textFaint }}>{k}</span>
      <span style={{ color: c ?? COLORS.text, fontWeight: 600, textAlign: "right" }}>{v}</span>
    </div>
  );
}
/** 每股历史胜率文案：样本不足 → 「样本不足」，绝不用 cohort 胜率冒充、绝不显示 0% */
function winLabel(w?: { picks: number; wins: number; winRate: number | null; status: "ok" | "insufficient" }): string {
  if (!w) return "暂无数据";
  if (w.status !== "ok" || w.winRate == null) return `样本不足（${w.wins}胜/${w.picks}次）`;
  return `${w.winRate}%（近${w.picks}次 ${w.wins}胜）`;
}
