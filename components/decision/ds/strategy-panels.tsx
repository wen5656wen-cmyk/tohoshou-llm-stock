"use client";

// ── Today's Strategy 面板（P14-DEV-03 · 展示型 · 与 Overview 同一 ds）─────────────
// 每模块必产生 Action；无真实盘中引擎的部分诚实降级为「计划待生成」，绝不伪造执行状态。
import { useI18n } from "@/lib/i18n";
import { AppCard, AppBadge } from "@/components/ui";
import type { Tone } from "@/lib/design-tokens";
import { COLORS, fmtPct, fmtScore } from "@/lib/decision/ds";
import { verdictIcon } from "@/lib/decision/verdict";

// ① 执行摘要（一句话）
export function ExecSummaryBar(p: { verdict: string | null; verdictLabel: string; sentence: string; confidence: number | null; risk: string; asOf: string }) {
  const { t } = useI18n();
  return (
    <AppCard>
      <div className="flex items-start gap-3">
        <span className="text-3xl leading-none">{verdictIcon(p.verdict)}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <b className="text-[16px]" style={{ color: COLORS.text }}>{p.verdictLabel}</b>
            <span className="text-[12px]" style={{ color: COLORS.textSecondary }}>{t("dv.ctx.position")} <b style={{ color: COLORS.textFaint }}>—</b></span>
            <span className="text-[12px]" style={{ color: COLORS.textSecondary }}>{t("dv.ctx.confidence")} <b style={{ color: COLORS.primary }}>{fmtScore(p.confidence)}</b></span>
            <span className="text-[12px]" style={{ color: COLORS.textSecondary }}>{t("db.riskLevel")} <b style={{ color: COLORS.text }}>{p.risk}</b></span>
            <span className="ml-auto text-[10px] tabular-nums" style={{ color: COLORS.textFaint }}>{p.asOf}</span>
          </div>
          {p.sentence && <p className="text-[12.5px] mt-1.5 leading-relaxed" style={{ color: COLORS.textSecondary }}>{p.sentence}</p>}
        </div>
      </div>
    </AppCard>
  );
}

// ② 交易时间轴（核心 · 诚实降级）
export type TLNode = { time: string; phaseKey: string; statusKey: string; statusTone: Tone; advice: string; action: string };
export function TradingTimeline(p: { nodes: TLNode[] }) {
  const { t } = useI18n();
  return (
    <AppCard header={<span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("dv.st.timeline")}</span>}>
      <div className="text-[11px] mb-2 px-2 py-1.5 rounded" style={{ background: `${COLORS.warning}12`, color: COLORS.warning }}>ℹ️ {t("dv.st.timelineNote")}</div>
      <div>
        {p.nodes.map((n, i) => (
          <div key={n.phaseKey} className="flex items-stretch gap-3">
            <div className="flex flex-col items-center">
              <div className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0" style={{ background: n.statusTone === "green" ? COLORS.success : n.statusTone === "amber" ? COLORS.warning : COLORS.border }} />
              {i < p.nodes.length - 1 && <div className="w-px flex-1 my-1" style={{ background: COLORS.borderSoft }} />}
            </div>
            <div className="flex-1 min-w-0 pb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[12px] tabular-nums font-semibold" style={{ color: COLORS.text }}>{n.time}</span>
                <span className="text-[12px]" style={{ color: COLORS.text }}>{t(n.phaseKey as Parameters<typeof t>[0])}</span>
                <AppBadge tone={n.statusTone}>{t(n.statusKey as Parameters<typeof t>[0])}</AppBadge>
              </div>
              <div className="text-[11px] mt-0.5" style={{ color: COLORS.textSecondary }}>
                <span style={{ color: COLORS.textFaint }}>{t("dv.st.aiAdvice")}：</span>{n.advice}
                <span className="mx-1.5">·</span><span style={{ color: COLORS.textFaint }}>{t("dv.st.action")}：</span>{n.action}
              </div>
            </div>
          </div>
        ))}
      </div>
    </AppCard>
  );
}

// ③ 今日战术
export type PlaybookCat = { labelKey: string; count: number | null; stocks: string | null; risk: string; reliable: boolean };
export function PlaybookGrid(p: { cats: PlaybookCat[] }) {
  const { t } = useI18n();
  return (
    <AppCard header={<span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("dv.st.playbook")}</span>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
        {p.cats.map((c) => (
          <div key={c.labelKey} className="rounded-lg px-2.5 py-2" style={{ background: COLORS.tile }}>
            <div className="flex items-center justify-between">
              <span className="text-[11px]" style={{ color: COLORS.textSecondary }}>{t(c.labelKey as Parameters<typeof t>[0])}</span>
              {c.reliable ? <b className="text-[14px] tabular-nums" style={{ color: COLORS.text }}>{c.count ?? 0}</b> : <span className="text-[10px]" style={{ color: COLORS.textFaint }}>—</span>}
            </div>
            {c.reliable ? (
              <>
                <div className="text-[10px] mt-0.5 truncate" style={{ color: COLORS.textFaint }}>{c.stocks ?? "—"}</div>
                <div className="text-[10px] mt-1 flex items-center justify-between" style={{ color: COLORS.textFaint }}>
                  <span>{t("db.riskLevel")} {c.risk}</span><span>{t("dv.ctx.position")} —</span>
                </div>
              </>
            ) : <div className="text-[10px] mt-0.5" style={{ color: COLORS.textFaint }}>{t("dv.ov.noSignal")}</div>}
          </div>
        ))}
      </div>
    </AppCard>
  );
}

// ④ 行业重点
export type SectorRow = { sector: string; score: number | null; heat: number; perf: number | null };
export function SectorFocus(p: { rows: SectorRow[] }) {
  const { t } = useI18n();
  return (
    <AppCard header={<span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("dv.st.sector")}</span>}>
      {p.rows.length ? (
        <table className="w-full text-[12px]">
          <thead><tr className="text-[10px]" style={{ color: COLORS.textFaint }}>
            <th className="text-left font-medium py-1">{t("wl.col.rec").slice(0, 0)}{t("dc.regime.SIDEWAYS").slice(0, 0)}{t("dv.st.sector")}</th>
            <th className="text-right font-medium py-1">AI</th><th className="text-right font-medium py-1">{t("dv.st.col.heat")}</th><th className="text-right font-medium py-1">{t("dv.st.col.perf")}</th>
          </tr></thead>
          <tbody>
            {p.rows.map((s) => (
              <tr key={s.sector} style={{ borderTop: `1px solid ${COLORS.borderSoft}` }}>
                <td className="py-1.5 truncate max-w-[120px]" style={{ color: COLORS.text }}>{s.sector}</td>
                <td className="py-1.5 text-right tabular-nums" style={{ color: COLORS.text }}>{fmtScore(s.score)}</td>
                <td className="py-1.5 text-right tabular-nums" style={{ color: COLORS.textSecondary }}>{s.heat}</td>
                <td className="py-1.5 text-right tabular-nums" style={{ color: (s.perf ?? 0) >= 0 ? COLORS.success : COLORS.danger }}>{fmtPct(s.perf)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <div className="text-[12px]" style={{ color: COLORS.textFaint }}>{t("dv.ov.noSignal")}</div>}
    </AppCard>
  );
}

// ⑥ 收盘计划
export function ClosingPlan(p: { actionLabel: string; watchlist: string[] }) {
  const { t } = useI18n();
  return (
    <AppCard header={<span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("dv.st.closing")}</span>}>
      <div className="text-[13px] font-semibold mb-1.5" style={{ color: COLORS.text }}>{p.actionLabel}</div>
      {p.watchlist.length > 0 && (
        <div className="text-[11px]" style={{ color: COLORS.textSecondary }}>{t("dv.st.pb.trend").slice(0, 0)}{t("dv.ov.viewAll").slice(0, 0)}{p.watchlist.join(" · ")}</div>
      )}
      <div className="text-[10px] mt-1.5" style={{ color: COLORS.textFaint }}>{t("dv.st.closingNote")}</div>
    </AppCard>
  );
}

// ⑦ AI 备注
export function AINotes(p: { note: string; gptModel: string | null }) {
  const { t } = useI18n();
  return (
    <AppCard header={<span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("dv.st.notes")}</span>}>
      {p.note && <p className="text-[12px] leading-relaxed" style={{ color: COLORS.textSecondary }}>{p.note}</p>}
      {p.gptModel && <div className="text-[10px] mt-1" style={{ color: COLORS.textFaint }}>GPT: {p.gptModel}</div>}
      <div className="text-[11px] mt-2 pt-2" style={{ borderTop: `1px solid ${COLORS.borderSoft}`, color: COLORS.textFaint }}>
        <b style={{ color: COLORS.warning }}>{t("dv.st.dataLimit")}：</b>{t("dv.st.limitList")}
      </div>
    </AppCard>
  );
}
