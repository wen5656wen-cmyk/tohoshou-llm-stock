"use client";

// ── Decision Overview 面板（P14-DEV-02 · 展示型 · props 驱动）───────────────────
// 数据派生由页面(DecisionOverviewV2)统一完成并传入；面板纯展示，复用 ds SSOT 与 UI kit。
// VerdictHero / MarketSnapshot / RiskPanel / NewsCatalystPanel 为 Freeze §③ 共享组件（后续页复用）。
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { AppCard, AppBadge } from "@/components/ui";
import type { Tone } from "@/lib/design-tokens";
import { COLORS, fmtJpy, fmtPct, fmtScore, upDownColor } from "@/lib/decision/ds";
import { verdictIcon, verdictTone } from "@/lib/decision/verdict";

const Row = ({ k, v, tone }: { k: ReactNode; v: ReactNode; tone?: string }) => (
  <div className="flex items-center justify-between py-0.5">
    <span className="text-[11px]" style={{ color: COLORS.textFaint }}>{k}</span>
    <span className="text-[12px] font-semibold tabular-nums" style={{ color: tone ?? COLORS.text }}>{v}</span>
  </div>
);

// ── 1. VerdictHero（约 180–220px，无渐变，唯一全量结论卡）──
export function VerdictHero(p: { verdict: string | null; verdictLabel: string; summary: string; confidence: number | null; confTip: string; risk: string; asOf: string; goHref: string }) {
  const { t } = useI18n();
  return (
    <AppCard>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-4xl leading-none">{verdictIcon(p.verdict)}</span>
          <div className="min-w-0">
            <div className="text-[22px] font-bold tracking-tight" style={{ color: COLORS.text }}>{p.verdictLabel}</div>
            {p.summary && <p className="text-[12px] mt-1 leading-relaxed line-clamp-2" style={{ color: COLORS.textSecondary }}>{p.summary}</p>}
          </div>
        </div>
        <Link href={p.goHref} className="shrink-0 h-8 px-3 rounded-full text-[12px] font-semibold flex items-center" style={{ background: COLORS.text, color: "#fff" }}>{t("dv.ov.goStrategy")} →</Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 mt-3 pt-3" style={{ borderTop: `1px solid ${COLORS.borderSoft}` }}>
        <Row k={t("dv.ctx.position")} v="—" />
        <Row k={<span title={p.confTip}>{t("dv.ctx.confidence")} ⓘ</span>} v={fmtScore(p.confidence)} tone={COLORS.primary} />
        <Row k={t("dv.ov.winRate")} v="—" />
        <Row k={t("db.riskLevel")} v={p.risk} />
      </div>
      <div className="text-[10px] mt-1.5" style={{ color: COLORS.textFaint }}>{t("dv.ov.dataTime")} {p.asOf}</div>
    </AppCard>
  );
}

// ── 2. MarketSnapshot（真实行情 · 单项缺失显 —）──
export type MktItem = { label: string; value: string; change: number | null; pct: number | null };
export function MarketSnapshot(p: { items: MktItem[]; trend: string; breadth: string; vol: string; regimeLabel: string; regimeTone: Tone; asOf: string }) {
  const { t } = useI18n();
  return (
    <AppCard header={<div className="flex items-center justify-between"><span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("dv.ov.market")}</span><span className="text-[10px]" style={{ color: COLORS.textFaint }}>{p.asOf}</span></div>}>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {p.items.map((m) => (
          <div key={m.label} className="rounded-lg px-2.5 py-2" style={{ background: COLORS.tile }}>
            <div className="text-[10px]" style={{ color: COLORS.textFaint }}>{m.label}</div>
            <div className="text-[14px] font-bold tabular-nums" style={{ color: COLORS.text }}>{m.value}</div>
            <div className="text-[11px] tabular-nums" style={{ color: upDownColor(m.pct ?? m.change) }}>{m.pct != null ? fmtPct(m.pct) : (m.change != null ? fmtPct(m.change) : "—")}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2.5 pt-2.5 text-[11px]" style={{ borderTop: `1px solid ${COLORS.borderSoft}`, color: COLORS.textSecondary }}>
        <span><AppBadge tone={p.regimeTone}>{p.regimeLabel}</AppBadge></span>
        <span>{t("dv.ov.trend")} <b style={{ color: COLORS.text }}>{p.trend}</b></span>
        <span>{t("dv.ov.breadth")} <b style={{ color: COLORS.text }}>{p.breadth}</b></span>
        <span>{t("dv.ov.vol")} <b style={{ color: COLORS.text }}>{p.vol}</b></span>
      </div>
    </AppCard>
  );
}

// ── 3. Top10Preview（SSOT=closing.top10 · 固定代码列 · 数字右对齐）──
export type TopRow = { rank: number; symbol: string; name: string; price: number | null; entry: string; target: number | null; stop: number | null; score: number | null; changePct: number | null; statusLabel: string; statusTone: Tone };
export function Top10Preview(p: { rows: TopRow[]; viewAllHref: string }) {
  const { t } = useI18n();
  return (
    <AppCard header={<div className="flex items-center justify-between"><span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>⭐ {t("dv.ov.picks")}</span><Link href={p.viewAllHref} className="text-[11px]" style={{ color: COLORS.primary }}>{t("dv.ov.viewAll")} →</Link></div>}>
      {p.rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr className="text-[10px]" style={{ color: COLORS.textFaint }}>
                <th className="text-left font-medium py-1 pr-2 sticky left-0" style={{ background: COLORS.card }}>{t("dv.ov.picks").slice(0, 0)}#</th>
                <th className="text-left font-medium py-1 pr-2 sticky left-6" style={{ background: COLORS.card }}>{t("wl.col.stock")}</th>
                <th className="text-right font-medium py-1 px-2">{t("dc.ov.currentPrice")}</th>
                <th className="text-right font-medium py-1 px-2">{t("dc.ov.target")}</th>
                <th className="text-right font-medium py-1 px-2">{t("dc.ov.stopLossP")}</th>
                <th className="text-right font-medium py-1 px-2">AI</th>
                <th className="text-right font-medium py-1 px-2">{t("wl.col.today")}</th>
                <th className="text-right font-medium py-1 pl-2">{t("wl.col.status")}</th>
              </tr>
            </thead>
            <tbody>
              {p.rows.map((r) => (
                <tr key={r.symbol} style={{ borderTop: `1px solid ${COLORS.borderSoft}` }}>
                  <td className="py-1.5 pr-2 tabular-nums sticky left-0" style={{ color: COLORS.textFaint, background: COLORS.card }}>{r.rank}</td>
                  <td className="py-1.5 pr-2 sticky left-6" style={{ background: COLORS.card }}>
                    <Link href={`/stocks/${encodeURIComponent(r.symbol)}`} className="hover:underline" style={{ color: COLORS.text }}>{r.name}</Link>
                    <span className="ml-1 text-[10px] font-mono" style={{ color: COLORS.textFaint }}>{r.symbol}</span>
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums" style={{ color: COLORS.text }}>{fmtJpy(r.price)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums" style={{ color: COLORS.textSecondary }}>{fmtJpy(r.target)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums" style={{ color: COLORS.danger }}>{fmtJpy(r.stop)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums font-semibold" style={{ color: COLORS.text }}>{fmtScore(r.score)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums" style={{ color: upDownColor(r.changePct) }}>{fmtPct(r.changePct)}</td>
                  <td className="py-1.5 pl-2 text-right"><AppBadge tone={r.statusTone}>{r.statusLabel}</AppBadge></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-[10px] mt-1.5" style={{ color: COLORS.textFaint }}>SSOT: {t("dc.tab.closing")} · {t("dv.ov.probNA")}</div>
        </div>
      ) : <div className="text-[13px]" style={{ color: COLORS.textFaint }}>{t("dc.ov.noData")}</div>}
    </AppCard>
  );
}

// ── 4. OpportunityRadar（6 类 · 缺可靠信号显“暂无可靠信号”）──
export type RadarCat = { labelKey: string; count: number | null; top: string | null; avg: number | null; riskTone: Tone; reliable: boolean };
export function OpportunityRadar(p: { cats: RadarCat[] }) {
  const { t } = useI18n();
  return (
    <AppCard header={<span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("dv.ov.radar")}</span>}>
      <div className="grid grid-cols-2 gap-2">
        {p.cats.map((c) => (
          <div key={c.labelKey} className="rounded-lg px-2.5 py-2" style={{ background: COLORS.tile }}>
            <div className="flex items-center justify-between">
              <span className="text-[11px]" style={{ color: COLORS.textSecondary }}>{t(c.labelKey as Parameters<typeof t>[0])}</span>
              {c.reliable ? <b className="text-[14px] tabular-nums" style={{ color: COLORS.text }}>{c.count ?? 0}</b> : <span className="text-[10px]" style={{ color: COLORS.textFaint }}>—</span>}
            </div>
            {c.reliable ? (
              <div className="text-[10px] mt-0.5 truncate" style={{ color: COLORS.textFaint }}>{c.top ?? "—"}{c.avg != null ? ` · ${t("dv.ov.avgScore")} ${fmtScore(c.avg)}` : ""}</div>
            ) : <div className="text-[10px] mt-0.5" style={{ color: COLORS.textFaint }}>{t("dv.ov.noSignal")}</div>}
          </div>
        ))}
      </div>
    </AppCard>
  );
}

// ── 5. RiskPanel（综合=后端口径，不前端平均 · 数据完整性真实反映）──
export type RiskItem = { labelKey: string; level: string; tone: Tone; note?: string };
export function RiskPanel(p: { items: RiskItem[]; overall: string; overallTone: Tone; titleKey?: string }) {
  const { t } = useI18n();
  return (
    <AppCard header={<div className="flex items-center justify-between"><span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t((p.titleKey ?? "dv.ov.risk") as Parameters<typeof t>[0])}</span><AppBadge tone={p.overallTone}>{t("dv.ov.rk.overall")} {p.overall}</AppBadge></div>}>
      <div className="space-y-1">
        {p.items.map((r) => (
          <div key={r.labelKey} className="flex items-center justify-between gap-2 text-[12px] py-0.5">
            <span style={{ color: COLORS.textSecondary }}>{t(r.labelKey as Parameters<typeof t>[0])}</span>
            <span className="flex items-center gap-2 shrink-0">
              {r.note && <span className="text-[10px]" style={{ color: COLORS.textFaint }}>{r.note}</span>}
              <AppBadge tone={r.tone}>{r.level}</AppBadge>
            </span>
          </div>
        ))}
      </div>
    </AppCard>
  );
}

// ── 6. NewsCatalystPanel（2 Tab · 真实新闻/披露 · 去重）──
export type NewsItem = { id: string; title: string; time: string; symbol: string | null; sentiment: string | null; source: string | null };
export type CatItem = { id: string; category: string; catLabel: string; time: string; target: string; sentiment: string | null };
export function NewsCatalystPanel(p: { news: NewsItem[]; catalysts: CatItem[] }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"news" | "cat">("news");
  const senTone = (s: string | null): Tone => (s === "POSITIVE" ? "green" : s === "NEGATIVE" ? "red" : "neutral");
  return (
    <AppCard header={
      <div className="flex items-center gap-1.5">
        {(["news", "cat"] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)} className="text-[12px] px-2 py-0.5 rounded-full font-medium"
            style={{ background: tab === k ? COLORS.text : "transparent", color: tab === k ? "#fff" : COLORS.textSecondary }}>
            {t(k === "news" ? "dv.ov.news" : "dv.ov.catalyst")}
          </button>
        ))}
      </div>
    }>
      {tab === "news" ? (
        p.news.length ? (
          <div className="space-y-1.5">
            {p.news.map((n) => (
              <div key={n.id} className="flex items-start gap-2 py-1" style={{ borderBottom: `1px solid ${COLORS.borderSoft}` }}>
                <AppBadge tone={senTone(n.sentiment)}>{n.symbol ?? n.source ?? "—"}</AppBadge>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] line-clamp-2" style={{ color: COLORS.text }}>{n.title}</div>
                  <div className="text-[10px]" style={{ color: COLORS.textFaint }}>{n.time}{n.source ? ` · ${n.source}` : ""}</div>
                </div>
              </div>
            ))}
          </div>
        ) : <div className="text-[12px]" style={{ color: COLORS.textFaint }}>{t("dv.ov.emptyNews")}</div>
      ) : (
        p.catalysts.length ? (
          <div className="space-y-1.5">
            {p.catalysts.map((c) => (
              <div key={c.id} className="flex items-start gap-2 py-1" style={{ borderBottom: `1px solid ${COLORS.borderSoft}` }}>
                <AppBadge tone={senTone(c.sentiment)}>{c.catLabel}</AppBadge>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] truncate" style={{ color: COLORS.text }}>{c.target}</div>
                  <div className="text-[10px]" style={{ color: COLORS.textFaint }}>{c.time}</div>
                </div>
              </div>
            ))}
          </div>
        ) : <div className="text-[12px]" style={{ color: COLORS.textFaint }}>{t("dv.ov.emptyCat")}</div>
      )}
    </AppCard>
  );
}
