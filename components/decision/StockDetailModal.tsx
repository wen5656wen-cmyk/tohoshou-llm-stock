"use client";

// ── 统一个股详情 Modal（P15-03 · 8 页 Tab，不跳页）───────────────────────────
// 所有股票点击 → 同一弹窗。纯 UI：只读复用现有 API（/api/stocks/[symbol]/intelligence ·
// /api/stocks/[symbol]/indicators · /api/financials/[symbol]），不改任何 API 契约/评分/引擎。
// Decision History 无 per-symbol 数据源（P15-01H 未建）→ 诚实置空，绝不伪造。
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import * as Dialog from "@radix-ui/react-dialog";
import { useI18n } from "@/lib/i18n";
import { COLORS } from "@/components/ui";
import { fmtJpy, fmtPct, fmtScore } from "@/lib/decision/ds";
import { SP, gradeFor } from "@/lib/decision/terminal";
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
type TabKey = "summary" | "price" | "chart" | "tech" | "news" | "financial" | "decisionHist" | "recHist";
const TAB_KEYS: TabKey[] = ["summary", "price", "chart", "tech", "news", "financial", "decisionHist", "recHist"];

export default function StockDetailModal({ row, onClose, heldSet, onBuy, onSell, onEdit }: { row: DetailRow | null; onClose: () => void; heldSet?: Set<string>; onBuy?: (s: string) => void; onSell?: (s: string) => void; onEdit?: (s: string) => void }) {
  const { t } = useI18n();
  const open = !!row;
  const symbol = row?.symbol ?? "";
  const [tab, setTab] = useState<TabKey>("summary");
  const [intel, setIntel] = useState<any>(null);
  const [bars, setBars] = useState<ChartBar[]>([]);
  const [fin, setFin] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);

  const g = (u: string) => fetch(u, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);

  useEffect(() => {
    if (!open || !symbol) return;
    let alive = true;
    (async () => {
      setTab("summary"); setIntel(null); setBars([]); setFin(null); setLoading(true);
      const [it, ind] = await Promise.all([g(`/api/stocks/${encodeURIComponent(symbol)}/intelligence`), g(`/api/stocks/${encodeURIComponent(symbol)}/indicators`)]);
      if (!alive) return;
      setIntel(it && !it.error ? it : null);
      const series = ind?.series?.last250 ?? ind?.series?.all ?? [];
      setBars(series.length ? buildChartBars(series, 132) : []);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [open, symbol]);

  useEffect(() => {
    if (!open || tab !== "financial" || fin != null) return;
    let alive = true;
    g(`/api/financials/${encodeURIComponent(symbol)}`).then((f) => { if (alive) setFin(Array.isArray(f?.financials) ? f.financials : Array.isArray(f) ? f : []); });
    return () => { alive = false; };
  }, [tab, open, symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!row) return null;
  const accent = row.actionColor ?? COLORS.primary;
  const grade = gradeFor(row.aiScore);

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(2px)", zIndex: 80 }} />
        <Dialog.Content aria-describedby={undefined}
          style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(820px, 95vw)", maxHeight: "90vh", display: "flex", flexDirection: "column", background: COLORS.card, borderRadius: 14, zIndex: 81, boxShadow: "0 20px 60px rgba(0,0,0,0.28)", overflow: "hidden" }}>
          {/* Header */}
          <div className="flex items-center justify-between gap-3" style={{ padding: `${SP.md - 4}px ${SP.md + 2}px`, borderBottom: `1px solid ${COLORS.border}`, borderLeft: `4px solid ${accent}` }}>
            <div className="flex items-center gap-2.5 min-w-0">
              <Dialog.Title asChild><b style={{ fontSize: 17, color: COLORS.text }}>{row.name}</b></Dialog.Title>
              <span className="tabular-nums" style={{ fontSize: 12, color: COLORS.textFaint }}>{row.symbol}</span>
              {row.actionLabel && <span style={{ fontSize: 11, fontWeight: 700, color: accent, background: `${accent}18`, padding: "2px 8px", borderRadius: 6 }}>{row.actionLabel}</span>}
              <span className="tabular-nums" style={{ fontSize: 12, fontWeight: 700, color: grade.color }}>{grade.grade}<span style={{ color: COLORS.textFaint, fontWeight: 500 }}> {fmtScore(row.aiScore)}</span></span>
            </div>
            <div className="flex items-center gap-1.5">
              {onBuy && <button onClick={() => onBuy(row.symbol)} style={{ fontSize: 11.5, fontWeight: 600, color: "#fff", background: COLORS.success, padding: "4px 10px", borderRadius: 7 }}>{t("dv.pf.btnBuy")}</button>}
              {heldSet?.has(row.symbol) && onSell && <button onClick={() => onSell(row.symbol)} style={{ fontSize: 11.5, fontWeight: 600, color: "#fff", background: COLORS.danger, padding: "4px 10px", borderRadius: 7 }}>{t("dv.pf.btnSell")}</button>}
              {heldSet?.has(row.symbol) && onEdit && <button onClick={() => onEdit(row.symbol)} style={{ fontSize: 11.5, fontWeight: 600, color: COLORS.textSecondary, background: "#F0F0F3", padding: "4px 10px", borderRadius: 7 }}>{t("dv.pf.btnEdit")}</button>}
              <Dialog.Close asChild><button aria-label={t("common.close")} style={{ width: 28, height: 28, borderRadius: 8, color: COLORS.textFaint }}>✕</button></Dialog.Close>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center overflow-x-auto" style={{ borderBottom: `1px solid ${COLORS.border}`, padding: `0 ${SP.sm}px` }}>
            {TAB_KEYS.map((k) => {
              const on = k === tab;
              return (
                <button key={k} onClick={() => setTab(k)} className="relative whitespace-nowrap" style={{ padding: `9px 11px`, fontSize: 12.5, fontWeight: on ? 700 : 500, color: on ? COLORS.text : COLORS.textFaint }}>
                  {t(`dv.tab.${k}` as Parameters<typeof t>[0])}
                  {on && <span style={{ position: "absolute", left: 8, right: 8, bottom: -1, height: 2, borderRadius: 2, background: COLORS.primary }} />}
                </button>
              );
            })}
          </div>

          {/* Body */}
          <div style={{ padding: `${SP.md}px ${SP.md + 2}px`, overflow: "auto" }}>
            {tab === "summary" && <Summary intel={intel} row={row} loading={loading} t={t} />}
            {tab === "price" && <Price intel={intel} row={row} t={t} />}
            {tab === "chart" && (bars.length ? <LightweightStockChart data={bars} height={300} theme="light" /> : <Muted>{loading ? "…" : "—"}</Muted>)}
            {tab === "tech" && <Technical ind={intel?.indicators} t={t} />}
            {tab === "news" && <News items={intel?.news} t={t} />}
            {tab === "financial" && <Financial rows={fin} t={t} />}
            {tab === "decisionHist" && <Muted>{t("dv.dm.comingSoon")}</Muted>}
            {tab === "recHist" && <RecHist intel={intel} t={t} />}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ── Tab 内容（全部 null-safe，缺数据诚实降级）─────────────────────────────── */
type T = (k: any) => string;
const Muted = ({ children }: { children: React.ReactNode }) => <div style={{ fontSize: 12.5, color: COLORS.textFaint }}>{children}</div>;
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: SP.md }}><div style={{ fontSize: 11, letterSpacing: "0.05em", color: COLORS.textFaint, fontWeight: 600, textTransform: "uppercase", marginBottom: SP.sm }}>{title}</div>{children}</div>;
}
function Facts({ items }: { items: [string, string, string?][] }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4" style={{ gap: `${SP.sm + 2}px ${SP.md}px` }}>
      {items.map(([l, v, c], i) => (
        <div key={i}><div style={{ fontSize: 10, color: COLORS.textFaint }}>{l}</div><div className="tabular-nums" style={{ fontSize: 15, fontWeight: 700, color: c ?? COLORS.text }}>{v}</div></div>
      ))}
    </div>
  );
}

function Summary({ intel, row, loading, t }: { intel: any; row: DetailRow; loading: boolean; t: T }) {
  const sc = intel?.score;
  const reasons: string[] = [sc?.recommendationReason, sc?.summaryReason, intel?.dailyRec?.summaryZh, sc?.newsSummary].filter(Boolean);
  return (
    <div>
      <Facts items={[
        [t("dv.dm.curPrice"), fmtJpy(row.currentPrice), (row.changePct ?? 0) < 0 ? COLORS.danger : COLORS.success],
        ...(row.isHolding ? [[t("dv.dm.currentReturn"), fmtPct(row.returnPct), (row.returnPct ?? 0) < 0 ? COLORS.danger : COLORS.success] as [string, string, string]] : []),
        [t("dv.stk.buy"), row.entryLow != null && row.entryHigh != null ? `${fmtJpy(row.entryLow)}~${fmtJpy(row.entryHigh)}` : "—"],
        [t("dv.stk.target"), fmtJpy(row.target1)], [t("dv.stk.stop"), fmtJpy(row.stopLoss), COLORS.danger],
        ["AI", fmtScore(row.aiScore), COLORS.primary], [t("dv.dm.rank"), row.runtimeRank != null ? `#${row.runtimeRank}` : "—"], [t("db.riskLevel"), row.riskLevel ?? "—"],
      ]} />
      <div style={{ marginTop: SP.md }}>
        {loading && !intel ? <Muted>…</Muted> : reasons.length ? (
          <ul className="space-y-1.5">{reasons.slice(0, 5).map((s, i) => <li key={i} className="flex gap-1.5" style={{ fontSize: 13, color: COLORS.textSecondary }}><span style={{ color: COLORS.primary }}>▪</span><span>{s}</span></li>)}</ul>
        ) : <Muted>{t("dv.dm.noReport")}</Muted>}
      </div>
    </div>
  );
}
function Price({ intel, row, t }: { intel: any; row: DetailRow; t: T }) {
  const sc = intel?.score, st = intel?.stock;
  return <Facts items={[
    [t("dv.dm.curPrice"), fmtJpy(row.currentPrice), (row.changePct ?? 0) < 0 ? COLORS.danger : COLORS.success],
    [t("dv.col.change"), fmtPct(row.changePct)],
    [t("dv.stk.buy"), row.entryLow != null && row.entryHigh != null ? `${fmtJpy(row.entryLow)}~${fmtJpy(row.entryHigh)}` : "—"],
    [t("dv.stk.target"), fmtJpy(row.target1)], ["T2", fmtJpy(row.target2)], [t("dv.stk.stop"), fmtJpy(row.stopLoss), COLORS.danger],
    ["52W H", fmtJpy(st?.high52w)], ["52W L", fmtJpy(st?.low52w)],
    [t("dv.fresh.ranking"), sc?.marketRank != null ? `#${sc.marketRank}` : "—"],
  ]} />;
}
function Technical({ ind, t }: { ind: any; t: T }) {
  if (!ind) return <Muted>{t("dv.dm.comingSoon")}</Muted>;
  const items: [string, string, string?][] = [
    ["RSI", ind.rsi14 != null ? ind.rsi14.toFixed(1) : "—", ind.rsi14 >= 70 ? COLORS.danger : ind.rsi14 <= 30 ? COLORS.success : undefined],
    ["MACD", ind.macdHist != null ? ind.macdHist.toFixed(2) : "—"], ["MA5", fmtJpy(ind.ma5)], ["MA20", fmtJpy(ind.ma20)], ["MA60", fmtJpy(ind.ma60)],
    ["MA Trend", ind.maTrend ?? "—"], ["Ret20", fmtPct(ind.return20d)], ["Ret60", fmtPct(ind.return60d)],
  ];
  return <Facts items={items} />;
}
function News({ items, t }: { items: any; t: T }) {
  const arr: any[] = Array.isArray(items) ? items : [];
  if (!arr.length) return <Muted>{t("dv.ov.emptyNews") || "—"}</Muted>;
  return <div className="space-y-1.5">{arr.slice(0, 8).map((n, i) => (
    <div key={i} style={{ fontSize: 12.5, color: COLORS.textSecondary }}>
      <span style={{ color: n.sentiment === "NEGATIVE" ? COLORS.danger : n.sentiment === "POSITIVE" ? COLORS.success : COLORS.textFaint }}>•</span> {n.title}
    </div>
  ))}</div>;
}
function Financial({ rows, t }: { rows: any[] | null; t: T }) {
  if (rows == null) return <Muted>…</Muted>;
  if (!rows.length) return <Muted>{t("dv.dm.comingSoon")}</Muted>;
  const fmt = (v: any) => (v == null ? "—" : Math.round(Number(v)).toLocaleString());
  return (
    <div style={{ fontSize: 12 }}>
      <div className="flex" style={{ color: COLORS.textFaint, fontSize: 10, fontWeight: 600, padding: "0 0 6px", borderBottom: `1px solid ${COLORS.border}` }}>
        <span style={{ flex: 1 }}>{t("dv.fin.year")}</span><span style={{ width: 96, textAlign: "right" }}>{t("dv.fin.revenue")}</span><span style={{ width: 84, textAlign: "right" }}>{t("dv.fin.netProfit")}</span><span style={{ width: 64, textAlign: "right" }}>{t("dv.fin.eps")}</span><span style={{ width: 60, textAlign: "right" }}>{t("dv.fin.roe")}</span>
      </div>
      {rows.slice(0, 8).map((f, i) => (
        <div key={i} className="flex tabular-nums" style={{ padding: "5px 0", borderBottom: `1px solid ${COLORS.borderSoft ?? COLORS.border}`, color: COLORS.textSecondary }}>
          <span style={{ flex: 1, color: COLORS.text }}>{f.fiscalYear}{f.quarter ? `Q${f.quarter}` : ""}</span>
          <span style={{ width: 96, textAlign: "right" }}>{fmt(f.revenue)}</span><span style={{ width: 84, textAlign: "right" }}>{fmt(f.netProfit)}</span>
          <span style={{ width: 64, textAlign: "right" }}>{f.eps ?? "—"}</span><span style={{ width: 60, textAlign: "right" }}>{f.roe != null ? `${Math.round(f.roe * 10) / 10}%` : "—"}</span>
        </div>
      ))}
    </div>
  );
}
function RecHist({ intel, t }: { intel: any; t: T }) {
  const dr = intel?.dailyRec, hp = intel?.historicalPerf;
  if (!dr && !hp) return <Muted>{t("dv.dm.comingSoon")}</Muted>;
  return (
    <div className="space-y-3">
      {dr && <Section title={t("dv.tab.recHist")}><div style={{ fontSize: 12.5, color: COLORS.textSecondary }}>{dr.date?.slice?.(0, 10) ?? ""} · {dr.recommendation ?? "—"} · Rank #{dr.gptRank ?? "—"} · Score {dr.finalScore != null ? Math.round(dr.finalScore) : "—"}{dr.summaryZh ? ` — ${dr.summaryZh}` : ""}</div></Section>}
      {hp?.sampleCount > 0 && <Facts items={[["N", String(hp.sampleCount)], [t("dv.dm.winRate"), hp.overall?.winRate != null ? `${Math.round(hp.overall.winRate)}%` : "—"], ["Avg", hp.overall?.avgReturn != null ? fmtPct(hp.overall.avgReturn) : "—"]]} />}
      <Muted>{t("dv.dm.comingSoon")}</Muted>
    </div>
  );
}
