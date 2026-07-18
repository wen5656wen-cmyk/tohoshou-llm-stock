"use client";

// ── 统一个股详情 Modal（P15-02 · 所有股票点击 → 同一弹窗，不跳页）─────────────
// 纯 UI：只读复用现有 API（/api/explain/[symbol]/report · /api/stocks/[symbol]/indicators
// · /api/news），不改任何 API 契约/评分/引擎。行内 live 数据由 row 传入（当前价/收益/Runtime 排名）。
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import * as Dialog from "@radix-ui/react-dialog";
import { useI18n } from "@/lib/i18n";
import { COLORS } from "@/components/ui";
import { fmtJpy, fmtPct, fmtScore } from "@/lib/decision/ds";
import { buildChartBars, type ChartBar } from "@/components/charts/LightweightStockChart";

const LightweightStockChart = dynamic(() => import("@/components/charts/LightweightStockChart"), { ssr: false });

export interface DetailRow {
  symbol: string; name: string;
  action?: string | null; actionLabel?: string; actionColor?: string;
  currentPrice?: number | null; changePct?: number | null; returnPct?: number | null;
  entryLow?: number | null; entryHigh?: number | null; target1?: number | null; target2?: number | null; stopLoss?: number | null;
  aiScore?: number | null; runtimeRank?: number | null; riskLevel?: string | null; isHolding?: boolean;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const stars = (n: number) => "★".repeat(Math.max(0, Math.min(5, n))) + "☆".repeat(Math.max(0, 5 - n));

export default function StockDetailModal({ row, onClose }: { row: DetailRow | null; onClose: () => void }) {
  const { t } = useI18n();
  const open = !!row;
  const symbol = row?.symbol ?? "";
  const [report, setReport] = useState<any>(null);
  const [bars, setBars] = useState<ChartBar[]>([]);
  const [news, setNews] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !symbol) return;
    let alive = true;
    const g = (u: string) => fetch(u, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    (async () => {
      setReport(null); setBars([]); setNews([]); setLoading(true);
      const [rep, ind, nw] = await Promise.all([
        g(`/api/explain/${encodeURIComponent(symbol)}/report`),
        g(`/api/stocks/${encodeURIComponent(symbol)}/indicators`),
        g(`/api/news?limit=40`),
      ]);
      if (!alive) return;
      setReport(rep && !rep.error ? rep : null);
      const series = ind?.series?.last250 ?? ind?.series?.all ?? [];
      setBars(series.length ? buildChartBars(series, 132) : []);
      const base = symbol.replace(/\.T$/, "");
      setNews(Array.isArray(nw) ? nw.filter((n: any) => (n.stock?.symbol ?? n.symbol ?? "").includes(base)).slice(0, 5) : []);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [open, symbol]);

  if (!row) return null;
  const accent = row.actionColor ?? COLORS.primary;
  const rep = report;

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(2px)", zIndex: 80 }} />
        <Dialog.Content
          aria-describedby={undefined}
          style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(760px, 94vw)", maxHeight: "90vh", overflow: "auto", background: COLORS.card, borderRadius: 16, zIndex: 81, boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}
        >
          {/* Header */}
          <div className="sticky top-0 flex items-center justify-between gap-3 px-5 py-3.5" style={{ background: COLORS.card, borderBottom: `1px solid ${COLORS.border}`, borderLeft: `4px solid ${accent}` }}>
            <div className="flex items-center gap-2.5 min-w-0">
              <Dialog.Title asChild><b style={{ fontSize: 17, color: COLORS.text }}>{row.name}</b></Dialog.Title>
              <span className="tabular-nums" style={{ fontSize: 12, color: COLORS.textFaint }}>{row.symbol}</span>
              {row.actionLabel && <span style={{ fontSize: 11, fontWeight: 700, color: accent, background: `${accent}18`, padding: "2px 8px", borderRadius: 999 }}>{row.actionLabel}</span>}
            </div>
            <Dialog.Close asChild><button aria-label={t("common.close")} style={{ width: 28, height: 28, borderRadius: 8, color: COLORS.textFaint }}>✕</button></Dialog.Close>
          </div>

          <div className="px-5 py-4 space-y-4">
            {/* 快速事实 */}
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-x-4 gap-y-2.5">
              <Fact label={t("dv.dm.curPrice")} value={fmtJpy(row.currentPrice)} sub={fmtPct(row.changePct)} subTone={(row.changePct ?? 0) < 0 ? COLORS.danger : COLORS.success} />
              {row.isHolding && <Fact label={t("dv.dm.currentReturn")} value={fmtPct(row.returnPct)} valueTone={(row.returnPct ?? 0) < 0 ? COLORS.danger : COLORS.success} />}
              <Fact label={t("dv.stk.buy")} value={row.entryLow != null && row.entryHigh != null ? `${fmtJpy(row.entryLow)}~${fmtJpy(row.entryHigh)}` : "—"} />
              <Fact label={t("dv.stk.target")} value={fmtJpy(row.target1)} />
              <Fact label={t("dv.stk.stop")} value={fmtJpy(row.stopLoss)} valueTone={COLORS.danger} />
              <Fact label="AI" value={fmtScore(row.aiScore)} valueTone={COLORS.primary} />
              <Fact label={t("dv.dm.rank")} value={row.runtimeRank != null ? `#${row.runtimeRank}` : "—"} />
              <Fact label={t("db.riskLevel")} value={row.riskLevel ?? "—"} />
            </div>

            {/* AI 分析 */}
            <Section title={t("dv.dm.aiAnalysis")}>
              {loading && !rep ? <Muted>{t("common.loading") || "…"}</Muted> : rep ? (
                <div className="space-y-2.5" style={{ fontSize: 13, color: COLORS.textSecondary }}>
                  {rep.stars != null && <div style={{ fontSize: 14 }}>{stars(rep.stars)} <span style={{ color: COLORS.textFaint, fontSize: 12 }}>{rep.confidenceLabel ?? ""}</span></div>}
                  {rep.oneLiner && <p style={{ color: COLORS.text, fontWeight: 500 }}>{rep.oneLiner}</p>}
                  {Array.isArray(rep.buyReasonsList) && rep.buyReasonsList.length > 0 && (
                    <ReasonList title={t("dv.dm.buyReasons")} items={rep.buyReasonsList} color={COLORS.success} />
                  )}
                  {Array.isArray(rep.risks) && rep.risks.length > 0 && (
                    <ReasonList title={t("dv.dm.risks")} items={rep.risks} color={COLORS.danger} />
                  )}
                  <div className="flex flex-wrap gap-x-5 gap-y-1 pt-1" style={{ fontSize: 12, color: COLORS.textFaint }}>
                    {rep.suggestedPositionPct != null && <span>{t("dv.dm.position")} <b style={{ color: COLORS.text }}>{rep.suggestedPositionPct}%</b></span>}
                    {rep.holdingPeriod && <span>{t("dv.dm.holdPeriod")} <b style={{ color: COLORS.text }}>{rep.holdingPeriod}</b></span>}
                    {rep.marketContext && <span>{rep.marketContext}</span>}
                  </div>
                </div>
              ) : <Muted>{t("dv.dm.noReport")}</Muted>}
            </Section>

            {/* 技术走势 */}
            <Section title={t("dv.dm.chart")}>
              {bars.length ? <LightweightStockChart data={bars} height={260} theme="light" /> : <Muted>{loading ? (t("common.loading") || "…") : "—"}</Muted>}
            </Section>

            {/* 相关新闻 */}
            {news.length > 0 && (
              <Section title={t("dv.dm.news")}>
                <div className="space-y-1.5">
                  {news.map((n: any) => (
                    <div key={n.id} style={{ fontSize: 12, color: COLORS.textSecondary }}>
                      <span style={{ color: n.sentiment === "NEGATIVE" ? COLORS.danger : n.sentiment === "POSITIVE" ? COLORS.success : COLORS.textFaint }}>•</span> {n.title}
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Fact({ label, value, sub, valueTone, subTone }: { label: string; value: string; sub?: string; valueTone?: string; subTone?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: COLORS.textFaint }}>{label}</div>
      <div className="tabular-nums" style={{ fontSize: 15, fontWeight: 700, color: valueTone ?? COLORS.text }}>{value}</div>
      {sub && <div className="tabular-nums" style={{ fontSize: 11, color: subTone ?? COLORS.textFaint }}>{sub}</div>}
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, letterSpacing: "0.05em", color: COLORS.textFaint, fontWeight: 600, textTransform: "uppercase", marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}
function ReasonList({ title, items, color }: { title: string; items: string[]; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: COLORS.textFaint, marginBottom: 3 }}>{title}</div>
      <ul className="space-y-1">
        {items.slice(0, 4).map((s, i) => (
          <li key={i} className="flex gap-1.5" style={{ fontSize: 12.5 }}><span style={{ color }}>▪</span><span>{s}</span></li>
        ))}
      </ul>
    </div>
  );
}
const Muted = ({ children }: { children: React.ReactNode }) => <div style={{ fontSize: 12, color: COLORS.textFaint }}>{children}</div>;
