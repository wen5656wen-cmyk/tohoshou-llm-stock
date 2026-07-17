"use client";

// ── /admin/closing-decision · Closing Decision（P6-T12 收盘决策）─────────────
// 每交易日 15:15 JST 收盘前最终 AI 决策：今日结论 / 第一推荐 / 建仓组合 / Top10 / 总结。
// 数据来自 GET /api/admin/closing-decision（只读展示 15:15 决策快照，页面不重算）。
// **独立模块 · 只读展示 · 不影响任何现有功能。**

import { useEffect, useState } from "react";
import {
  AppHeader, AppCard, AppKpiCard, AppKpiGrid, AppBadge, AppButton,
  AppLoading, AppEmptyState, AppTable, AppTh, AppTd, appRowHover, COLORS,
  type Tone,
} from "@/components/ui";
import ExplainReportButton from "@/components/explain/ExplainReportButton";
// P9-DECISION-02：「今日放弃股票」判据唯一来源（与「今日总览 · 今日回避」同源，禁止两页结论不一致）
import { buildAvoidList, recommendedSymbols, type AvoidReasonKey } from "@/lib/decision/avoid";

const AVOID_LABEL: Record<AvoidReasonKey, string> = {
  news: "近期利空", risk: "风险偏高", dump: "放量下跌", zone: "已脱离买区",
};

interface Top1 {
  symbol: string; name: string | null; aiScore: number | null; gptScore: number | null;
  price: number | null; changePct: number | null; entryLow: number | null; entryHigh: number | null;
  target1: number | null; target2: number | null; stopLoss: number | null;
  holdPeriod: string | null; confidence: string | null;
}
interface Leg {
  symbol: string; name: string | null; sector: string | null; weight: number; price: number | null;
  entryLow: number | null; entryHigh: number | null; target1: number | null; stopLoss: number | null;
  aiScore: number | null; gptScore: number | null; reason: string | null;
}
interface Row {
  rank: number; symbol: string; name: string | null; sector: string | null;
  price: number | null; changePct: number | null; aiScore: number | null; gptScore: number | null;
  gptNote: string | null; closingScore: number | null; rsi14: number | null; macdHist: number | null;
  ma5: number | null; ma10: number | null; ma20: number | null; volumeRatio: number | null; turnoverRate: number | null;
  riskLevel: string | null; action: string | null; entryLow: number | null; entryHigh: number | null;
  target1: number | null; target2: number | null; stopLoss: number | null;
  inBuyZone: boolean; breakout: boolean; realtime: boolean; reason: string | null;
}
interface Api {
  ok: boolean; empty?: boolean; note?: string; date?: string; decidedAtJst?: string | null;
  verdict?: "BUY_TODAY" | "WATCH_ONLY" | "STAY_CASH"; verdictReason?: string | null;
  market?: {
    regime: string | null; regimeScore: number | null; trend: number | null; volatility: number | null;
    avgAiScore: number | null; avgRiskScore: number | null; buyZoneHitRate: number | null;
    breakoutRatio: number | null; newsRiskCount: number; qualifiedCount: number; opportunity: number | null;
  };
  top1?: Top1 | null; portfolio?: Leg[]; portfolioNote?: string | null; top10?: Row[];
  summary?: string | null; pushText?: string | null;
  meta?: { gptModel: string | null; universeCount: number; shortlistCount: number; gptAnalyzed: number; elapsedMs: number };
  availableDates?: string[];
}

const VERDICT: Record<string, { label: string; sub: string; tone: string; icon: string }> = {
  BUY_TODAY:  { label: "BUY TODAY",  sub: "今日可建仓", tone: COLORS.success, icon: "✅" },
  WATCH_ONLY: { label: "WATCH ONLY", sub: "今日观察",   tone: COLORS.warning, icon: "⚠️" },
  STAY_CASH:  { label: "STAY CASH",  sub: "今日空仓",   tone: COLORS.danger,  icon: "❌" },
};
const CONF_TONE: Record<string, Tone> = { "A+": "green", "A": "blue", "B": "neutral" };

function fmt(v: number | null | undefined, s = "", d = 1): string { return v == null ? "—" : `${Math.round(v * 10 ** d) / 10 ** d}${s}`; }
function jpy(v: number | null | undefined): string { return v == null ? "—" : `¥${Math.round(v).toLocaleString()}`; }
function pctColor(v: number | null | undefined): string { return v == null ? COLORS.textFaint : v > 0 ? COLORS.success : v < 0 ? COLORS.danger : COLORS.textSecondary; }
function sign(v: number | null | undefined): string { return v == null ? "—" : `${v > 0 ? "+" : ""}${fmt(v, "%")}`; }

export default function ClosingDecisionPage() {
  const [d, setD] = useState<Api | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(date?: string) {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/admin/closing-decision${date ? `?date=${date}` : ""}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as Api;
      if (!j.ok) throw new Error("API 返回异常");
      setD(j);
    } catch (e) { setError(e instanceof Error ? e.message : "加载失败"); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  // P9-DECISION-02：真实全球市场（NASDAQ/VIX/USDJPY）→ 支撑「今日最大风险」，只读
  const [gm, setGm] = useState<{ nasdaq?: number | null; nasdaqChange?: number | null; vix?: number | null } | null>(null);
  useEffect(() => {
    fetch("/api/market-data", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setGm(j?.globalMarket ?? null))
      .catch(() => setGm(null));
  }, []);

  const v = d?.verdict ? VERDICT[d.verdict] : null;

  // ── ②为什么可以买 / ③为什么不能买 / ⑥今日最大风险：全部由真实字段派生，最多 3 条，无数据即空 ──
  const m = d?.market ?? null;
  const reasonsBuy: string[] = [];
  const reasonsNoBuy: string[] = [];
  const topRisks: string[] = [];
  if (m) {
    if ((m.buyZoneHitRate ?? 0) >= 50) reasonsBuy.push(`买区命中率 ${m.buyZoneHitRate}%（多数标的处于可买区间）`);
    if ((m.qualifiedCount ?? 0) > 0) reasonsBuy.push(`合格候选 ${m.qualifiedCount} 只（已过流动性/风险/新闻过滤）`);
    if ((m.avgAiScore ?? 0) >= 70) reasonsBuy.push(`候选池平均 AI 评分 ${fmt(m.avgAiScore, "", 1)}（质量偏高）`);
    if (m.regime === "BULL") reasonsBuy.push("大盘处于牛市，顺势环境");
    if ((m.breakoutRatio ?? 0) >= 30) reasonsBuy.push(`已突破占比 ${m.breakoutRatio}%（动能确认）`);

    if (m.regime === "BEAR") reasonsNoBuy.push("大盘熊市，系统性下行风险");
    else if (m.regime === "SIDEWAYS") reasonsNoBuy.push(`大盘震荡（regimeScore ${fmt(m.regimeScore, "", 2)}），方向不明`);
    if ((m.newsRiskCount ?? 0) > 0) reasonsNoBuy.push(`候选池近期利空 ${m.newsRiskCount} 只`);
    if ((m.volatility ?? 0) > 25) reasonsNoBuy.push(`市场波动率偏高 ${fmt(m.volatility, "", 1)}`);
    if ((m.breakoutRatio ?? 100) < 20) reasonsNoBuy.push(`已突破占比仅 ${m.breakoutRatio}%（动能不足）`);
    if ((m.avgRiskScore ?? 0) > 50) reasonsNoBuy.push(`候选池平均风险分 ${fmt(m.avgRiskScore, "", 0)} 偏高`);

    if ((gm?.nasdaqChange ?? 0) < -1) topRisks.push(`美股调整：NASDAQ ${fmt(gm?.nasdaqChange, "%", 2)}（AI 板块承压）`);
    if ((gm?.vix ?? 0) > 20) topRisks.push(`VIX ${fmt(gm?.vix, "", 1)} 偏高，风险偏好收缩`);
    if ((m.newsRiskCount ?? 0) > 0) topRisks.push(`候选池利空 ${m.newsRiskCount} 只`);
    if (m.regime !== "BULL") topRisks.push(`大盘非牛市（${m.regime ?? "—"}）`);
    const hi = (d?.top10 ?? []).filter((r) => String(r.riskLevel ?? "").toUpperCase() === "HIGH");
    if (hi.length) topRisks.push(`Top10 中 ${hi.length} 只高风险：${hi.slice(0, 3).map((x) => x.symbol).join("、")}`);
  }
  const reasonsBuy3 = reasonsBuy.slice(0, 3);
  const reasonsNoBuy3 = reasonsNoBuy.slice(0, 3);
  const topRisks3 = topRisks.slice(0, 3);

  // ④ 今日放弃股票 —— 与「今日总览 · 今日回避」完全同源
  const avoidRes = buildAvoidList(d?.top10 ?? [], recommendedSymbols(d?.top1 ?? null, d?.portfolio ?? []));

  return (
    <div style={{ minHeight: "100vh", background: COLORS.background }}>
      <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-8 space-y-6">
        <AppHeader
          title="收盘决策" titleEn="Closing Decision" status="P6-T12" statusTone="blue"
          subtitle="每交易日 15:15 JST 收盘前最终 AI 决策——实时行情重算 + GPT 复核，输出今日是否建仓 · 第一推荐 · 建仓组合（只读展示）"
          action={<AppButton onClick={() => load()}>刷新</AppButton>}
        />

        {loading && <AppLoading />}
        {error && <AppCard><div style={{ color: COLORS.danger }}>加载失败：{error}</div></AppCard>}

        {!loading && !error && d?.empty && (
          <AppEmptyState title="尚无收盘决策" desc={d.note ?? "等待 15:15 JST cron 生成"} />
        )}

        {!loading && !error && d && !d.empty && v && (
          <>
            {/* ① 今日结论（置顶） */}
            <AppCard accent={`${v.tone}44`} style={{ background: `${v.tone}0D` }}>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-4">
                  <span style={{ fontSize: 40 }}>{v.icon}</span>
                  <div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: v.tone, letterSpacing: 0.5 }}>{v.label}</div>
                    <div style={{ fontSize: 13, color: COLORS.textSecondary }}>{v.sub} · {d.date} {d.decidedAtJst ? `${d.decidedAtJst} JST` : ""}</div>
                  </div>
                </div>
                <div style={{ textAlign: "right", fontSize: 12, color: COLORS.textSecondary }}>
                  <div>市场 {d.market?.regime ?? "—"} · 机会分 {d.market?.opportunity ?? "—"}</div>
                  <div>GPT {d.meta?.gptAnalyzed ? `${d.meta.gptModel}（${d.meta.gptAnalyzed}只）` : "规则引擎"} · {d.meta?.elapsedMs ? `${(d.meta.elapsedMs / 1000).toFixed(1)}s` : ""}</div>
                </div>
              </div>
              {d.verdictReason && <div style={{ marginTop: 12, fontSize: 12.5, color: COLORS.textSecondary, lineHeight: 1.7 }}>{d.verdictReason}</div>}
            </AppCard>

            {/* 市场上下文 KPI */}
            <AppKpiGrid>
              <AppKpiCard label="大盘状态" value={d.market?.regime ?? "—"} sub={`趋势 ${fmt(d.market?.trend)}`} />
              <AppKpiCard label="平均 AI 分" value={fmt(d.market?.avgAiScore, "", 0)} sub={`风险 ${fmt(d.market?.avgRiskScore, "", 0)}`} />
              <AppKpiCard label="买区命中率" value={fmt(d.market?.buyZoneHitRate, "%", 0)} sub={`已突破 ${fmt(d.market?.breakoutRatio, "%", 0)}`} />
              <AppKpiCard label="合格候选" value={`${d.market?.qualifiedCount ?? 0}`} sub={`利空 ${d.market?.newsRiskCount ?? 0} 只`} />
            </AppKpiGrid>

            {/* P9-DECISION-02 ②③⑥：为什么可以买 / 为什么不能买 / 今日最大风险（全部真实字段派生，无数据即空态） */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <AppCard>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>✅ 为什么可以买</div>
                {reasonsBuy3.length ? (
                  <ul style={{ fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.8 }}>
                    {reasonsBuy3.map((x, i) => <li key={i}>· {x}</li>)}
                  </ul>
                ) : <div style={{ fontSize: 12, color: COLORS.textFaint }}>暂无数据</div>}
              </AppCard>
              <AppCard>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>⛔ 为什么不能买</div>
                {reasonsNoBuy3.length ? (
                  <ul style={{ fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.8 }}>
                    {reasonsNoBuy3.map((x, i) => <li key={i}>· {x}</li>)}
                  </ul>
                ) : <div style={{ fontSize: 12, color: COLORS.textFaint }}>暂无数据</div>}
              </AppCard>
              <AppCard>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>⚠️ 今日最大风险</div>
                {topRisks3.length ? (
                  <ul style={{ fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.8 }}>
                    {topRisks3.map((x, i) => <li key={i}>· {x}</li>)}
                  </ul>
                ) : <div style={{ fontSize: 12, color: COLORS.textFaint }}>暂无数据</div>}
                <div style={{ fontSize: 10, color: COLORS.textFaint, marginTop: 6 }}>
                  ※「财报临近」「板块资金流出」无可靠数据源，不予展示
                </div>
              </AppCard>
            </div>

            {/* P9-DECISION-02 ④：今日放弃股票（与「今日总览 · 今日回避」共用 lib/decision/avoid.ts，结论必然一致） */}
            <AppCard>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
                🚫 今日放弃股票{avoidRes.items.length ? `（${avoidRes.items.length}）` : ""}
                {avoidRes.totalCandidates > avoidRes.items.length && (
                  <span style={{ fontSize: 11, color: COLORS.textFaint, marginLeft: 6 }}>显示前 {avoidRes.items.length} / 共 {avoidRes.totalCandidates}</span>
                )}
              </div>
              {avoidRes.items.length ? (
                <div>
                  {avoidRes.items.map((a) => (
                    <div key={a.symbol} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "4px 0", borderBottom: `1px solid ${COLORS.borderSoft}` }}>
                      <span style={{ fontSize: 13 }}>
                        <span style={{ color: COLORS.danger, marginRight: 6 }}>✗</span>
                        {a.name ?? a.symbol} <span style={{ fontSize: 10, color: COLORS.textFaint, fontFamily: "monospace" }}>{a.symbol}</span>
                      </span>
                      <span style={{ fontSize: 11, color: COLORS.textSecondary }}>{a.reasonKeys.map((k) => AVOID_LABEL[k]).join(" / ")}</span>
                    </div>
                  ))}
                  <div style={{ fontSize: 10, color: COLORS.textFaint, marginTop: 6 }}>
                    判据：近期利空 &gt; 风险偏高 &gt; 放量下跌 &gt; 已脱离买区；已排除第一推荐与建仓组合内全部股票
                  </div>
                </div>
              ) : <div style={{ fontSize: 12, color: COLORS.textFaint }}>今日暂无明确放弃标的</div>}
            </AppCard>

            {/* ② 今日第一推荐 */}
            {d.top1 && (
              <AppCard>
                <div className="flex items-center justify-between mb-3">
                  <div style={{ fontSize: 15, fontWeight: 600 }}>🥇 今日第一推荐</div>
                  {d.top1.confidence && <AppBadge tone={CONF_TONE[d.top1.confidence] ?? "neutral"}>信心 {d.top1.confidence}</AppBadge>}
                </div>
                <div className="flex items-baseline gap-3 flex-wrap mb-3">
                  <span style={{ fontSize: 20, fontWeight: 700 }}>{d.top1.symbol}</span>
                  <span style={{ fontSize: 15, color: COLORS.textSecondary }}>{d.top1.name ?? ""}</span>
                  <span style={{ fontSize: 18, fontWeight: 600 }}>{jpy(d.top1.price)}</span>
                  <span style={{ fontSize: 14, color: pctColor(d.top1.changePct) }}>{sign(d.top1.changePct)}</span>
                  <ExplainReportButton symbol={d.top1.symbol} name={d.top1.name} />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3" style={{ fontSize: 13 }}>
                  <Field label="AI 评分" value={fmt(d.top1.aiScore, "", 0)} />
                  <Field label="GPT 评分" value={d.top1.gptScore != null ? fmt(d.top1.gptScore, "", 0) : "—"} />
                  <Field label="建议买入区间" value={d.top1.entryLow != null && d.top1.entryHigh != null ? `${jpy(d.top1.entryLow)}–${jpy(d.top1.entryHigh)}` : "—"} />
                  <Field label="建议持有" value={d.top1.holdPeriod ?? "—"} />
                  <Field label="止盈 T1 / T2" value={`${jpy(d.top1.target1)} / ${jpy(d.top1.target2)}`} valueColor={COLORS.success} />
                  <Field label="止损" value={jpy(d.top1.stopLoss)} valueColor={COLORS.danger} />
                </div>
              </AppCard>
            )}

            {/* ③ 今日建仓组合 */}
            <AppCard>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>📦 今日建仓组合</div>
              <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 12 }}>{d.portfolioNote}</div>
              {d.portfolio && d.portfolio.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  {d.portfolio.map((l) => (
                    <div key={l.symbol} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 12 }}>
                      <div className="flex items-center justify-between">
                        <span style={{ fontSize: 14, fontWeight: 700 }}>{l.symbol}</span>
                        <span className="flex items-center gap-1.5">
                          <ExplainReportButton symbol={l.symbol} name={l.name} size="xs" />
                          <AppBadge tone="blue">{l.weight}%</AppBadge>
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: COLORS.textSecondary, margin: "4px 0" }}>{l.name ?? ""}</div>
                      <div style={{ fontSize: 12 }}>{jpy(l.price)}</div>
                      <div style={{ fontSize: 11, color: COLORS.textFaint, marginTop: 4 }}>
                        买区 {l.entryLow != null ? `${Math.round(l.entryLow)}–${Math.round(l.entryHigh ?? 0)}` : "—"} · 止损 {l.stopLoss != null ? Math.round(l.stopLoss) : "—"}
                      </div>
                      <div style={{ fontSize: 11, color: COLORS.textFaint }}>AI {fmt(l.aiScore, "", 0)}{l.gptScore != null ? ` · GPT ${fmt(l.gptScore, "", 0)}` : ""}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: "20px 0", textAlign: "center", color: COLORS.textSecondary, fontSize: 14 }}>今日建议空仓</div>
              )}
            </AppCard>

            {/* ⑥ 今日交易总结 */}
            {d.summary && (
              <AppCard>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>📝 今日交易总结</div>
                <div style={{ fontSize: 13, color: COLORS.text, lineHeight: 1.9, whiteSpace: "pre-line" }}>{d.summary}</div>
              </AppCard>
            )}

            {/* ④ Top10 */}
            <AppCard>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>📊 今日 Top10（实时重排 + GPT 复核）</div>
              <div style={{ overflowX: "auto" }}>
                <AppTable>
                  <thead>
                    <tr>
                      <AppTh>#</AppTh><AppTh>代码 · 名称</AppTh><AppTh>现价</AppTh><AppTh>今日</AppTh>
                      <AppTh>AI</AppTh><AppTh>GPT</AppTh><AppTh>RSI</AppTh><AppTh>量比</AppTh>
                      <AppTh>买入区间</AppTh><AppTh>止盈/止损</AppTh><AppTh>状态</AppTh>
                    </tr>
                  </thead>
                  <tbody>
                    {(d.top10 ?? []).map((r) => (
                      <tr key={r.symbol} className={appRowHover}>
                        <AppTd><b>{r.rank}</b></AppTd>
                        <AppTd><div style={{ fontWeight: 600 }}>{r.symbol}</div><div style={{ fontSize: 11, color: COLORS.textSecondary }}>{r.name ?? ""}</div></AppTd>
                        <AppTd>{jpy(r.price)}</AppTd>
                        <AppTd><span style={{ color: pctColor(r.changePct) }}>{sign(r.changePct)}</span></AppTd>
                        <AppTd>{fmt(r.aiScore, "", 0)}</AppTd>
                        <AppTd>{r.gptScore != null ? fmt(r.gptScore, "", 0) : "—"}</AppTd>
                        <AppTd>{fmt(r.rsi14, "", 0)}</AppTd>
                        <AppTd>{fmt(r.volumeRatio, "", 1)}</AppTd>
                        <AppTd>{r.entryLow != null && r.entryHigh != null ? `${Math.round(r.entryLow)}–${Math.round(r.entryHigh)}` : "—"}</AppTd>
                        <AppTd><span style={{ color: COLORS.success }}>{r.target1 != null ? Math.round(r.target1) : "—"}</span> / <span style={{ color: COLORS.danger }}>{r.stopLoss != null ? Math.round(r.stopLoss) : "—"}</span></AppTd>
                        <AppTd>
                          {r.breakout ? <span style={{ color: COLORS.warning }}>⚠已突破</span> : r.inBuyZone ? <span style={{ color: COLORS.success }}>买区内</span> : <span style={{ color: COLORS.textFaint }}>低于买区</span>}
                        </AppTd>
                      </tr>
                    ))}
                  </tbody>
                </AppTable>
              </div>
              {/* ⑤ 推荐理由 */}
              <div className="mt-4 space-y-1.5">
                <div style={{ fontSize: 13, fontWeight: 600 }}>推荐理由</div>
                {(d.top10 ?? []).map((r) => (
                  <div key={r.symbol} style={{ fontSize: 12, color: COLORS.textSecondary }}>
                    <b style={{ color: COLORS.text }}>{r.rank}. {r.symbol}</b> {r.name ?? ""} — {r.reason ?? "—"}{r.gptNote ? `｜GPT：${r.gptNote}` : ""}
                  </div>
                ))}
              </div>
            </AppCard>

            <div style={{ fontSize: 11, color: COLORS.textFaint, textAlign: "center", paddingTop: 8 }}>
              全市场 {d.meta?.universeCount ?? "—"} 排名 · 候选池 {d.meta?.shortlistCount ?? "—"} 只实时覆盖 · 本模块为 AI 量化分析，不构成投资建议。
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: COLORS.textFaint }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: valueColor ?? COLORS.text }}>{value}</div>
    </div>
  );
}
