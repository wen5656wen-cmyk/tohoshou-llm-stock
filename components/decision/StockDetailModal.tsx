"use client";

// ── AI Research Report（P16-02 · 单页纵向滚动，取消多 Tab）─────────────────────
// 任意股票（搜索/推荐/持仓）打开同一份单页报告：Header(固定) → 为什么 → 核心决策 → 持仓状态
// → 价格走势 → 技术状态 → AI判断依据 → 新闻 → 基本面 → 决策记录 → 底部操作栏(固定)。
// 完整数据源 = /api/stocks/[symbol]/intelligence（含 entry/target/stop/action/5维评分/reasons/
// 技术/新闻/dailyRec）+ /indicators(图表) + /financials。纯 UI，缺数据诚实降级。
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import * as Dialog from "@radix-ui/react-dialog";
import { useI18n } from "@/lib/i18n";
import { COLORS } from "@/components/ui";
import { fmtJpy, fmtPct, fmtScore } from "@/lib/decision/ds";
import { SP, gradeFor, actionColor } from "@/lib/decision/terminal";
import { buildChartBars, type ChartBar } from "@/components/charts/LightweightStockChart";

const LightweightStockChart = dynamic(() => import("@/components/charts/LightweightStockChart"), { ssr: false });

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface ReportTarget { symbol: string; name: string; action?: string | null; currentPrice?: number | null; held?: any | null; }

// 决策动作 → 「为什么X」标题
const WHY: Record<string, string> = { BUY: "dv.rr.why.BUY", ADD: "dv.rr.why.ADD", WAIT: "dv.rr.why.WAIT", HOLD: "dv.rr.why.HOLD", REDUCE: "dv.rr.why.REDUCE", TAKE_PROFIT: "dv.rr.why.TAKE_PROFIT", STOP_LOSS: "dv.rr.why.STOP_LOSS" };
// StockScore.tradingAction / recommendationV2 → 决策动作（搜索来的股票无 runtime action 时）
function fallbackAction(rec: string | null, ta: string | null): string {
  if (ta === "BUY_NOW") return "BUY"; if (ta === "TAKE_PROFIT") return "TAKE_PROFIT"; if (ta === "SELL") return "STOP_LOSS"; if (ta === "WAIT_PULLBACK") return "WAIT";
  if (rec === "STRONG_BUY" || rec === "BUY") return "BUY"; if (rec === "HOLD") return "HOLD"; if (rec === "AVOID") return "STOP_LOSS"; return "WAIT";
}

export default function StockDetailModal({ report, onClose, onBuy, onSell, onEdit }: { report: ReportTarget | null; onClose: () => void; onBuy?: (s: string) => void; onSell?: (s: string) => void; onEdit?: (s: string) => void }) {
  const { t } = useI18n();
  const open = !!report;
  const symbol = report?.symbol ?? "";
  const [intel, setIntel] = useState<any>(null);
  const [bars, setBars] = useState<ChartBar[]>([]);
  const [fin, setFin] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !symbol) return;
    let alive = true;
    const g = (u: string) => fetch(u, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    (async () => {
      setIntel(null); setBars([]); setFin([]); setLoading(true);
      const [it, ind, f] = await Promise.all([g(`/api/stocks/${encodeURIComponent(symbol)}/intelligence`), g(`/api/stocks/${encodeURIComponent(symbol)}/indicators`), g(`/api/financials/${encodeURIComponent(symbol)}`)]);
      if (!alive) return;
      setIntel(it && !it.error ? it : null);
      const series = ind?.series?.last250 ?? ind?.series?.all ?? [];
      setBars(series.length ? buildChartBars(series, 132) : []);
      setFin(Array.isArray(f?.financials) ? f.financials : Array.isArray(f) ? f : []);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [open, symbol]);

  if (!report) return null;
  const sc = intel?.score, st = intel?.stock, ind = intel?.indicators;
  const held = report.held;
  const action = report.action || (sc ? fallbackAction(sc.recommendationV2, sc.tradingAction) : "WAIT");
  const accent = actionColor(action);
  const price = report.currentPrice ?? sc?.latestClose ?? null;
  const entryLow = sc?.entryLow ?? null, entryHigh = sc?.entryHigh ?? null, target = sc?.target1 ?? null, stop = sc?.stopLoss ?? null;
  const ai = sc?.adaptiveScore ?? null;
  const grade = gradeFor(ai);
  const upside = target != null && price ? ((target - price) / price) * 100 : null;
  const downside = stop != null && price ? ((stop - price) / price) * 100 : null;
  const whyTitle = t((WHY[action] ?? "dv.rr.why.default") as Parameters<typeof t>[0]);
  // §14/§19：剥除开发者/调试文本（adaptiveScore=/runtimeScore=/rankingDelta=/[source_tag]），不暴露给用户。
  const clean = (s: string | null | undefined): string => (s ?? "")
    .replace(/(adaptive|runtime)Score\s*=\s*[\d.]+/gi, "")
    .replace(/rankingDelta\s*=\s*[-\d.]+/gi, "")
    .replace(/[（(]\s*≥?\s*[\d.]+\s*[)）]/g, "")
    .replace(/\[[a-z0-9_]+\]/gi, "")
    .replace(/\s{2,}/g, " ").replace(/^[·:：,，、\s]+/, "").trim();
  // 理由须含中日文或字母（过滤只剩符号/数字的调试残片）
  const validReason = (r: string) => r.length > 3 && /[一-鿿゠-ヿ぀-ゟA-Za-z]/.test(r);
  const summaryClean = clean(sc?.summaryReason);
  const reasons: string[] = Array.from(new Set([sc?.recommendationReason, intel?.dailyRec?.summaryZh].map(clean).filter((r) => validReason(r) && r !== summaryClean)));

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.42)", zIndex: 80 }} />
        <Dialog.Content aria-describedby={undefined}
          style={{ position: "fixed", top: 24, left: "50%", transform: "translateX(-50%)", width: "min(1120px, calc(100vw - 48px))", height: "calc(100vh - 48px)", maxHeight: 920, display: "flex", flexDirection: "column", background: "#fff", borderRadius: 12, zIndex: 81, boxShadow: "0 24px 64px rgba(0,0,0,0.22)", overflow: "hidden" }}>
          {/* Header 固定 */}
          <div style={{ flex: "0 0 auto", padding: `${SP.md - 2}px ${SP.lg}px`, borderBottom: `1px solid ${COLORS.border}`, borderLeft: `4px solid ${accent}` }}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <Dialog.Title asChild><b className="tabular-nums" style={{ fontSize: 20, fontWeight: 800, color: COLORS.text }}>{symbol}</b></Dialog.Title>
                <span className="truncate" style={{ fontSize: 14, color: COLORS.textSecondary }}>{report.name}</span>
                <span style={{ fontSize: 11, color: COLORS.textFaint }}>{st?.market ?? ""}</span>
              </div>
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 12, fontWeight: 700, color: accent, background: `${accent}18`, padding: "3px 10px", borderRadius: 7 }}>{t(`dv.act.${action}` as Parameters<typeof t>[0])}</span>
                <span className="tabular-nums" style={{ fontSize: 13, fontWeight: 700, color: grade.color }}>{grade.grade}</span>
                {sc?.highRiskFlag != null && <span style={{ fontSize: 11, color: COLORS.textFaint }}>{t("db.riskLevel")} {intel?.riskAnalysis?.overall ?? "—"}</span>}
                <Dialog.Close asChild><button aria-label={t("common.close")} style={{ width: 28, height: 28, borderRadius: 8, color: COLORS.textFaint }}>✕</button></Dialog.Close>
              </div>
            </div>
            <div className="flex items-center gap-4 mt-1 tabular-nums" style={{ fontSize: 13 }}>
              <b style={{ fontSize: 17, color: COLORS.text }}>{fmtJpy(price)}</b>
              <span style={{ fontSize: 11, color: COLORS.textFaint }}>{sc?.latestDate ?? ""}</span>
            </div>
          </div>

          {/* Body 滚动 */}
          <div style={{ flex: 1, overflow: "auto", padding: `${SP.md}px ${SP.lg}px` }}>
            {/* 为什么 */}
            <Section title={whyTitle}>
              {loading && !intel ? <Muted>…</Muted> : (
                <div>
                  {summaryClean && <p style={{ fontSize: 14, color: COLORS.text, lineHeight: 1.6 }}>{summaryClean}</p>}
                  {reasons.length > 0 && <ul className="mt-2 space-y-1">{reasons.slice(0, 5).map((r, i) => <li key={i} className="flex gap-1.5" style={{ fontSize: 13, color: COLORS.textSecondary }}><span style={{ color: COLORS.success }}>✓</span><span>{r}</span></li>)}</ul>}
                  {reasons.length === 0 && !summaryClean && <Muted>{t("dv.dm.noReport")}</Muted>}
                </div>
              )}
            </Section>

            {/* 核心决策 */}
            <Section title={t("dv.rr.core")}>
              <Facts items={[
                [t("dv.dm.curPrice"), fmtJpy(price)], [t("dv.stk.buy"), entryLow != null && entryHigh != null ? `${fmtJpy(entryLow)}~${fmtJpy(entryHigh)}` : "—"],
                [t("dv.stk.target"), fmtJpy(target), COLORS.success], [t("dv.stk.stop"), fmtJpy(stop), COLORS.danger],
                [t("dv.rr.upside"), upside != null ? fmtPct(upside) : "—", COLORS.success], [t("dv.rr.downside"), downside != null ? fmtPct(downside) : "—", COLORS.danger],
                [t("db.riskLevel"), intel?.riskAnalysis?.overall ?? "—"], [t("dv.ctx.confidence"), fmtScore(ai), COLORS.primary],
              ]} />
            </Section>

            {/* 持仓状态 */}
            <Section title={t("dv.rr.holding")}>
              {held ? (
                <div>
                  <Facts items={[
                    [t("dv.pf.shares"), String(held.shares)], [t("dv.pf.avgCost"), fmtJpy(held.avgCost)], [t("dv.col.current"), fmtJpy(held.currentPrice)],
                    [t("dv.dm.currentReturn"), fmtPct(held.returnPct), (held.returnPct ?? 0) < 0 ? COLORS.danger : COLORS.success],
                    [t("dv.pf.sumHoldings"), fmtJpy(held.marketValue)], [t("dv.dm.rank"), `${held.holdingDays ?? "—"}d`], [t("dv.col.action"), t(`dv.act.${held.action}` as Parameters<typeof t>[0])],
                  ]} />
                </div>
              ) : <Muted>{t("dv.rr.notHeld")}</Muted>}
            </Section>

            {/* 价格走势 */}
            <Section title={t("dv.rr.chart")}>
              {bars.length ? <LightweightStockChart data={bars} height={280} theme="light" /> : <Muted>{loading ? "…" : "—"}</Muted>}
            </Section>

            {/* 技术状态 */}
            <Section title={t("dv.rr.tech")}>
              {ind ? <Facts items={[
                [t("dv.rr.d.trend"), ind.maTrend ?? "—"], ["MA5>MA20", ind.ma5 != null && ind.ma20 != null ? (ind.ma5 > ind.ma20 ? "✓" : "✗") : "—"],
                ["RSI", ind.rsi14 != null ? ind.rsi14.toFixed(1) : "—", ind.rsi14 >= 70 ? COLORS.danger : ind.rsi14 <= 30 ? COLORS.success : undefined],
                ["MACD", ind.macdSignalLabel ?? (ind.macdHist != null ? ind.macdHist.toFixed(2) : "—")], ["MA20", fmtJpy(ind.ma20)], ["MA60", fmtJpy(ind.ma60)],
                ["Ret20", fmtPct(ind.return20d)], ["Ret60", fmtPct(ind.return60d)],
              ]} /> : <Muted>—</Muted>}
            </Section>

            {/* AI 判断依据（5 维水平条） */}
            {sc && <Section title={t("dv.rr.scores")}>
              <div className="space-y-1.5">
                <Bar label={t("dv.rr.d.tech")} v={sc.technicalScore} max={30} />
                <Bar label={t("dv.rr.d.fund")} v={sc.fundamentalScore} max={25} />
                <Bar label={t("dv.rr.d.money")} v={sc.moneyFlowScore} max={20} />
                <Bar label={t("dv.rr.d.senti")} v={sc.newsSentimentScore} max={15} />
                <Bar label={t("dv.rr.d.trend")} v={sc.globalTrendScore} max={10} />
              </div>
            </Section>}

            {/* 新闻 */}
            <Section title={t("dv.rr.news")}>
              {sc?.newsSummary && <p style={{ fontSize: 12.5, color: COLORS.textSecondary, marginBottom: SP.sm }}><b style={{ color: COLORS.textFaint }}>{t("dv.rr.newsVerdict")}</b> {sc.newsSummary}</p>}
              {Array.isArray(intel?.news) && intel.news.length ? <div className="space-y-1.5">{intel.news.slice(0, 5).map((n: any, i: number) => (
                <div key={i} style={{ fontSize: 12.5, color: COLORS.textSecondary }}><span style={{ color: n.sentiment === "NEGATIVE" ? COLORS.danger : n.sentiment === "POSITIVE" ? COLORS.success : COLORS.textFaint }}>●</span> {n.title}</div>
              ))}</div> : <Muted>{t("dv.ov.emptyNews") || "—"}</Muted>}
            </Section>

            {/* 基本面 */}
            <Section title={t("dv.rr.fin")}>
              {fin.length ? <FinTable rows={fin} t={t} /> : <Muted>{t("dv.dm.comingSoon")}</Muted>}
            </Section>

            {/* AI 决策记录 */}
            <Section title={t("dv.rr.hist")}>
              {intel?.dailyRec ? <div style={{ fontSize: 12.5, color: COLORS.textSecondary }}>{intel.dailyRec.date?.slice?.(0, 10)} · {intel.dailyRec.recommendation ?? "—"} · Rank #{intel.dailyRec.gptRank ?? "—"}</div> : <Muted>{t("dv.rr.noHist")}</Muted>}
            </Section>
          </div>

          {/* 底部操作栏 固定 */}
          <div className="flex items-center justify-between gap-3" style={{ flex: "0 0 auto", padding: `${SP.sm + 2}px ${SP.lg}px`, borderTop: `1px solid ${COLORS.border}`, background: "#FAFBFC" }}>
            <div className="flex items-center gap-3 tabular-nums" style={{ fontSize: 12 }}>
              <b style={{ fontSize: 14, color: COLORS.text }}>{fmtJpy(price)}</b>
              <span style={{ fontSize: 11, fontWeight: 700, color: accent }}>{t(`dv.act.${action}` as Parameters<typeof t>[0])}</span>
            </div>
            <div className="flex items-center gap-2">
              {held && onEdit && <button onClick={() => onEdit(symbol)} style={{ fontSize: 13, fontWeight: 600, color: COLORS.textSecondary, background: "#F0F0F3", padding: "8px 14px", borderRadius: 8 }}>{t("dv.pf.btnEdit")}</button>}
              {held && onSell && <button onClick={() => onSell(symbol)} style={{ fontSize: 13, fontWeight: 600, color: COLORS.danger, background: "#fff", border: `1px solid ${COLORS.danger}`, padding: "8px 14px", borderRadius: 8 }}>{t("dv.pf.btnSell")}</button>}
              {onBuy && <button onClick={() => onBuy(symbol)} style={{ fontSize: 13, fontWeight: 700, color: "#fff", background: COLORS.primary, padding: "8px 18px", borderRadius: 8 }}>{held ? t("dv.pf.btnBuy") : t("dv.pf.addTitle")}</button>}
              <Dialog.Close asChild><button style={{ fontSize: 13, color: COLORS.textSecondary, padding: "8px 14px", borderRadius: 8 }}>{t("dv.pf.cancel")}</button></Dialog.Close>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type T = (k: any) => string;
const Muted = ({ children }: { children: React.ReactNode }) => <div style={{ fontSize: 12.5, color: COLORS.textFaint }}>{children}</div>;
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: SP.lg }}><div style={{ fontSize: 12, letterSpacing: "0.03em", color: COLORS.text, fontWeight: 600, marginBottom: SP.sm, paddingBottom: 4, borderBottom: `1px solid ${COLORS.borderSoft ?? "#F0F0F3"}` }}>{title}</div>{children}</div>;
}
function Facts({ items }: { items: [string, string, string?][] }) {
  return <div className="grid grid-cols-2 sm:grid-cols-4" style={{ gap: `${SP.sm + 2}px ${SP.lg}px` }}>
    {items.map(([l, v, c], i) => <div key={i}><div style={{ fontSize: 10.5, color: COLORS.textFaint }}>{l}</div><div className="tabular-nums" style={{ fontSize: 15, fontWeight: 700, color: c ?? COLORS.text }}>{v}</div></div>)}
  </div>;
}
function Bar({ label, v, max }: { label: string; v: number | null | undefined; max: number }) {
  const pct = v != null ? Math.max(0, Math.min(100, (v / max) * 100)) : 0;
  const c = pct >= 70 ? COLORS.success : pct >= 45 ? COLORS.primary : "#F5A623";
  return (
    <div className="flex items-center gap-2" style={{ fontSize: 12 }}>
      <span style={{ width: 64, color: COLORS.textSecondary }}>{label}</span>
      <div style={{ flex: 1, height: 6, borderRadius: 6, background: "#EEEFF2", overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: c, borderRadius: 6 }} /></div>
      <span className="tabular-nums" style={{ width: 52, textAlign: "right", color: COLORS.text, fontWeight: 600 }}>{v != null ? `${v}/${max}` : "—"}</span>
    </div>
  );
}
function FinTable({ rows, t }: { rows: any[]; t: T }) {
  const fmt = (v: any) => (v == null ? "—" : Math.round(Number(v)).toLocaleString());
  return (
    <div style={{ fontSize: 12 }}>
      <div className="flex" style={{ color: COLORS.textFaint, fontSize: 10, fontWeight: 600, padding: "0 0 5px", borderBottom: `1px solid ${COLORS.border}` }}>
        <span style={{ flex: 1 }}>{t("dv.fin.year")}</span><span style={{ width: 100, textAlign: "right" }}>{t("dv.fin.revenue")}</span><span style={{ width: 88, textAlign: "right" }}>{t("dv.fin.netProfit")}</span><span style={{ width: 60, textAlign: "right" }}>{t("dv.fin.eps")}</span><span style={{ width: 56, textAlign: "right" }}>{t("dv.fin.roe")}</span>
      </div>
      {rows.slice(0, 4).map((f, i) => (
        <div key={i} className="flex tabular-nums" style={{ padding: "5px 0", borderBottom: `1px solid ${COLORS.borderSoft ?? "#F0F0F3"}`, color: COLORS.textSecondary }}>
          <span style={{ flex: 1, color: COLORS.text }}>{f.fiscalYear}{f.quarter ? `Q${f.quarter}` : ""}</span>
          <span style={{ width: 100, textAlign: "right" }}>{fmt(f.revenue)}</span><span style={{ width: 88, textAlign: "right" }}>{fmt(f.netProfit)}</span>
          <span style={{ width: 60, textAlign: "right" }}>{f.eps ?? "—"}</span><span style={{ width: 56, textAlign: "right" }}>{f.roe != null ? `${Math.round(f.roe * 10) / 10}%` : "—"}</span>
        </div>
      ))}
    </div>
  );
}
