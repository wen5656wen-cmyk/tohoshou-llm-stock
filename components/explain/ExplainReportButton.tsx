"use client";

// ── Explain 2.0 · AI 为什么推荐（P8-1 / P8-1.1 Modal）─────────────────────────
// P8-1.1：由顶部 Drawer 改为居中 Modal Dialog（Radix Dialog，非自实现）。
// Radix 原生处理 ESC/背景点击/焦点陷阱/body 滚动锁定与位置保持 → 关闭后页面不跳顶、不刷新。
// 9 段内容与数据逻辑完全不变，仅改展示方式。

import { useState, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useI18n } from "@/lib/i18n";
import { COLORS } from "@/components/ui";

interface Report {
  symbol: string; name: string | null;
  verdict: { code: string; label: string; icon: string };
  confidence: number; stars: number; confidenceLabel: string;
  recommendReasons: string[];
  buyReasons: { today: string; notYesterday: string; notOthers: string };
  buyReasonsList: string[];
  risks: string[];
  suggestedPositionPct: number; suggestedPositionNote: string;
  takeProfit: { t1: number | null; t2: number | null; t3: number | null; note: string };
  stopLoss: { price: number | null; note: string };
  invalidation: string[];
  holdingPeriod: string; oneLiner: string; marketContext: string;
  levelSource: string; dataAsOf: string | null;
}

const jpy = (v: number | null) => v == null ? "—" : `¥${Math.round(v).toLocaleString()}`;

export default function ExplainReportButton({ symbol, name, size = "sm" }: { symbol: string; name?: string | null; size?: "sm" | "xs" }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [rep, setRep] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const j = await fetch(`/api/explain/${encodeURIComponent(symbol)}/report`, { cache: "no-store" }).then((r) => r.json());
      if (!j.ok) throw new Error(j.error ?? "no data");
      setRep(j.report);
    } catch (e) { setErr(e instanceof Error ? e.message : "load failed"); } finally { setLoading(false); }
  }, [symbol]);

  const Divider = () => <div className="text-center text-[11px] tracking-widest select-none" style={{ color: COLORS.border }}>━━━━━━━━━━</div>;
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div>
      <div className="text-[12px] font-semibold mb-1.5" style={{ color: COLORS.text }}>{title}</div>
      <div className="text-[13px] leading-relaxed" style={{ color: COLORS.textSecondary }}>{children}</div>
    </div>
  );
  const List = ({ items, tone }: { items: string[]; tone?: string }) => (
    <ul className="space-y-1">{items.map((x, i) => (
      <li key={i} className="flex gap-1.5"><span style={{ color: tone ?? COLORS.primary }}>•</span><span>{x}</span></li>
    ))}</ul>
  );
  const stars = (n: number) => "⭐".repeat(n) + "☆".repeat(5 - n);

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { setOpen(o); if (o && !rep) load(); }}>
      <Dialog.Trigger asChild>
        <button
          className={`rounded-md font-medium whitespace-nowrap transition-colors ${size === "xs" ? "text-[10px] px-1.5 py-0.5" : "text-[11px] px-2 py-1"}`}
          style={{ color: COLORS.primary, background: COLORS.tile, border: `1px solid ${COLORS.border}` }}
        >
          {t("ex2.button")}
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70]" style={{ background: "rgba(0,0,0,0.4)" }} />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[71] -translate-x-1/2 -translate-y-1/2 w-[95vw] max-w-[960px] rounded-2xl dash-font shadow-2xl overflow-hidden"
          style={{ background: COLORS.background, maxHeight: "85vh", display: "flex", flexDirection: "column" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 shrink-0" style={{ background: COLORS.card, borderBottom: `1px solid ${COLORS.border}` }}>
            <div>
              <Dialog.Title className="text-[14px] font-semibold" style={{ color: COLORS.text }}>{t("ex2.title")}</Dialog.Title>
              <div className="text-[11px]" style={{ color: COLORS.textFaint }}>{name ?? symbol} · {symbol}</div>
            </div>
            <Dialog.Close asChild>
              <button className="w-7 h-7 flex items-center justify-center rounded-lg" style={{ color: COLORS.textSecondary, background: COLORS.tile }} aria-label="Close">✕</button>
            </Dialog.Close>
          </div>

          {/* Content (scrollable) */}
          <div className="px-5 py-4 space-y-3 overflow-y-auto flex-1 min-h-0">
            {loading && <div className="text-[13px] py-10 text-center" style={{ color: COLORS.textFaint }}>{t("ex2.loading")}</div>}
            {err && <div className="text-[13px] py-10 text-center" style={{ color: COLORS.danger }}>{t("ex2.noData")}</div>}
            {rep && (
              <>
                {/* AI 最终结论 + ⭐星级 */}
                <div className="rounded-xl p-4 text-center" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
                  <div className="text-[14px]" style={{ color: COLORS.textFaint }}>{t("ex2.verdict")}</div>
                  <div className="mt-1 flex items-center justify-center gap-2">
                    <span className="text-2xl">{rep.verdict.icon}</span>
                    <span className="text-[18px] font-bold" style={{ color: COLORS.text }}>{rep.verdict.label}</span>
                  </div>
                  <div className="mt-1.5 text-[16px] tracking-wider">{stars(rep.stars)}</div>
                  <div className="mt-2 flex items-center justify-center gap-3 text-[12px]" style={{ color: COLORS.textSecondary }}>
                    <span>{t("ex2.confidence")} <b style={{ color: COLORS.text }}>{rep.confidence}</b></span>
                    <span>{t("ex2.position")} <b style={{ color: COLORS.text }}>{rep.suggestedPositionPct}%</b></span>
                    <span>{t("ex2.hold")} {rep.holdingPeriod}</span>
                  </div>
                </div>

                <Divider />
                <Section title={`${t("ex2.recommendReason")}（${rep.recommendReasons.length}）`}><List items={rep.recommendReasons} tone={COLORS.success} /></Section>
                <Divider />
                <Section title={`${t("ex2.buyReason")}（${rep.buyReasonsList.length}）`}><List items={rep.buyReasonsList} tone={COLORS.primary} /></Section>
                <Divider />
                <Section title={`${t("ex2.risk")}（${rep.risks.length}）`}><List items={rep.risks} tone={COLORS.danger} /></Section>
                <Divider />
                <Section title={t("ex2.position")}>
                  <b style={{ color: COLORS.text }}>{rep.suggestedPositionPct}%</b>（{rep.suggestedPositionNote}）
                </Section>
                <Divider />
                <Section title={t("ex2.takeProfit")}>
                  <div>{t("ex2.t1")} {jpy(rep.takeProfit.t1)} · {t("ex2.t2")} {jpy(rep.takeProfit.t2)}{rep.takeProfit.t3 != null ? ` · ${t("ex2.t3")} ${jpy(rep.takeProfit.t3)}` : ""}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: COLORS.textFaint }}>{rep.takeProfit.note}</div>
                </Section>
                <Divider />
                <Section title={t("ex2.stopLoss")}>
                  <div><b style={{ color: COLORS.danger }}>{jpy(rep.stopLoss.price)}</b></div>
                  <div className="text-[11px] mt-0.5" style={{ color: COLORS.textFaint }}>{rep.stopLoss.note}</div>
                </Section>
                <Divider />
                <Section title={t("ex2.invalidation")}><List items={rep.invalidation.slice(0, 4)} tone={COLORS.warning} /></Section>
                <Divider />
                <Section title={t("ex2.oneLiner")}>
                  <span style={{ color: COLORS.text }}>{rep.oneLiner}</span>
                </Section>
                <div className="text-[10px] pt-1" style={{ color: COLORS.textFaint }}>
                  {rep.levelSource === "closing" ? "止盈止损来自收盘决策" : "止盈止损为派生建议"} · {rep.marketContext} · {rep.dataAsOf ?? ""}
                </div>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
