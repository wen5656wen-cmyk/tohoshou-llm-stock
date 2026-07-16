"use client";

// ── Explain 2.0 · AI 投资报告 Modal（P8-1 / P8-1.1 / P8-1.2 双列版式）─────────
// Radix Dialog 居中 Modal（非自实现）：ESC/背景/X 关闭 + 滚动锁定与位置保持。
// 双列卡片版式：头部(标题+复制/打印) + 4列信息条 + 8卡片双列 + 6列统计底条。
// 9 段内容与数据逻辑完全不变，仅改展示。

import { useState, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useI18n } from "@/lib/i18n";
import { COLORS } from "@/components/ui";

interface Report {
  symbol: string; name: string | null;
  verdict: { code: string; label: string; icon: string };
  confidence: number; stars: number; confidenceLabel: string;
  recommendReasons: string[];
  buyReasonsList: string[];
  risks: string[];
  suggestedPositionPct: number; suggestedPositionNote: string;
  takeProfit: { t1: number | null; t2: number | null; t3: number | null; note: string };
  stopLoss: { price: number | null; note: string };
  invalidation: string[];
  holdingPeriod: string; oneLiner: string; marketContext: string;
  levelSource: string; dataAsOf: string | null;
  meta: {
    aiScore: number | null; gptScore: number | null; gptRank: number | null;
    board: string | null; regime: string | null; regimeLabel: string;
    volatility: number | null; volatilityLabel: string; liquidityLabel: string;
  };
}

const jpy = (v: number | null) => v == null ? "—" : `¥${Math.round(v).toLocaleString()}`;
const starsStr = (n: number) => "⭐".repeat(n) + "☆".repeat(5 - n);

export default function ExplainReportButton({ symbol, name, size = "sm" }: { symbol: string; name?: string | null; size?: "sm" | "xs" }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [rep, setRep] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const j = await fetch(`/api/explain/${encodeURIComponent(symbol)}/report`, { cache: "no-store" }).then((r) => r.json());
      if (!j.ok) throw new Error(j.error ?? "no data");
      setRep(j.report);
    } catch (e) { setErr(e instanceof Error ? e.message : "load failed"); } finally { setLoading(false); }
  }, [symbol]);

  const copyText = (r: Report) => {
    const lines = [
      `${t("ex2.title")} · ${r.name ?? r.symbol} (${r.symbol})`,
      `${t("ex2.verdict")}: ${r.verdict.label} ${starsStr(r.stars)} · ${t("ex2.confidence")} ${r.confidence}/100 · ${t("ex2.position")} ${r.suggestedPositionPct}% · ${t("ex2.hold")} ${r.holdingPeriod}`,
      ``,
      `${t("ex2.recommendReason")}:`, ...r.recommendReasons.map((x) => `• ${x}`),
      `${t("ex2.buyReason")}:`, ...r.buyReasonsList.map((x) => `• ${x}`),
      `${t("ex2.risk")}:`, ...r.risks.map((x) => `• ${x}`),
      `${t("ex2.takeProfit")}: ${jpy(r.takeProfit.t1)} / ${jpy(r.takeProfit.t2)}${r.takeProfit.t3 != null ? ` / ${jpy(r.takeProfit.t3)}` : ""}`,
      `${t("ex2.stopLoss")}: ${jpy(r.stopLoss.price)}`,
      `${t("ex2.invalidation")}:`, ...r.invalidation.slice(0, 4).map((x) => `• ${x}`),
      `${t("ex2.oneLiner")}: ${r.oneLiner}`,
    ];
    navigator.clipboard?.writeText(lines.join("\n")).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  };

  // 卡片框
  const Card = ({ n, color, emoji, title, children }: { n: number; color: string; emoji: string; title: string; children: React.ReactNode }) => (
    <div className="rounded-xl p-4" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
      <div className="flex items-start justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold text-white" style={{ background: color }}>{n}</span>
          <span className="text-[14px] font-semibold" style={{ color: COLORS.text }}>{title}</span>
        </div>
        <span className="text-[16px] opacity-80">{emoji}</span>
      </div>
      <div className="text-[12.5px] leading-relaxed" style={{ color: COLORS.textSecondary }}>{children}</div>
    </div>
  );
  const List = ({ items, tone }: { items: string[]; tone: string }) => (
    <ul className="space-y-1">{items.map((x, i) => (
      <li key={i} className="flex gap-1.5"><span style={{ color: tone }}>•</span><span>{x}</span></li>
    ))}</ul>
  );
  const Sum = ({ icon, label, value, sub, color }: { icon: string; label: string; value: React.ReactNode; sub?: React.ReactNode; color?: string }) => (
    <div className="flex items-center gap-2.5 px-3">
      <span className="text-[20px]">{icon}</span>
      <div>
        <div className="text-[11px]" style={{ color: COLORS.textFaint }}>{label}</div>
        <div className="text-[15px] font-bold" style={{ color: color ?? COLORS.text }}>{value}</div>
        {sub && <div className="text-[10px]" style={{ color: COLORS.textFaint }}>{sub}</div>}
      </div>
    </div>
  );
  const Foot = ({ icon, label, value, color }: { icon: string; label: string; value: React.ReactNode; color?: string }) => (
    <div className="flex items-center gap-2 px-2">
      <span className="text-[15px]">{icon}</span>
      <div><div className="text-[10px]" style={{ color: COLORS.textFaint }}>{label}</div><div className="text-[12px] font-semibold" style={{ color: color ?? COLORS.text }}>{value}</div></div>
    </div>
  );

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
        <Dialog.Overlay className="fixed inset-0 z-[70]" style={{ background: "rgba(0,0,0,0.45)" }} />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[71] -translate-x-1/2 -translate-y-1/2 w-[95vw] max-w-[1200px] rounded-2xl dash-font shadow-2xl"
          style={{ background: COLORS.background, maxHeight: "90vh", display: "flex", flexDirection: "column" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
            <div>
              <Dialog.Title className="text-[19px] font-bold" style={{ color: COLORS.text }}>{t("ex2.title")}</Dialog.Title>
              <div className="text-[12px] mt-0.5 flex items-center gap-2" style={{ color: COLORS.textSecondary }}>
                <span>{name ?? symbol} · {symbol}</span>
                {rep?.meta.board && <span className="px-1.5 py-0.5 rounded text-[11px]" style={{ color: COLORS.primary, background: COLORS.tile }}>{rep.meta.board}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {rep && <button onClick={() => copyText(rep)} className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg" style={{ color: COLORS.textSecondary, background: COLORS.card, border: `1px solid ${COLORS.border}` }}>📋 {copied ? t("ir.copied") : t("ir.copy")}</button>}
              {rep && <button onClick={() => window.print()} className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg" style={{ color: COLORS.textSecondary, background: COLORS.card, border: `1px solid ${COLORS.border}` }}>🖨 {t("ir.print")}</button>}
              <Dialog.Close asChild>
                <button className="w-8 h-8 flex items-center justify-center rounded-lg text-[15px]" style={{ color: COLORS.textSecondary, background: COLORS.card, border: `1px solid ${COLORS.border}` }} aria-label="Close">✕</button>
              </Dialog.Close>
            </div>
          </div>

          {/* Body */}
          <div className="px-6 py-4 overflow-y-auto flex-1 min-h-0">
            {loading && <div className="text-[13px] py-16 text-center" style={{ color: COLORS.textFaint }}>{t("ex2.loading")}</div>}
            {err && <div className="text-[13px] py-16 text-center" style={{ color: COLORS.danger }}>{t("ex2.noData")}</div>}
            {rep && (
              <div className="space-y-4">
                {/* 顶部信息条 */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-xl py-3" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
                  <div className="flex flex-col items-center justify-center px-3" style={{ borderRight: `1px solid ${COLORS.border}` }}>
                    <div className="text-[11px]" style={{ color: COLORS.textFaint }}>{t("ex2.verdict")}</div>
                    <div className="flex items-center gap-1.5 mt-0.5"><span className="text-lg">{rep.verdict.icon}</span><span className="text-[17px] font-bold" style={{ color: COLORS.text }}>{rep.verdict.label}</span></div>
                    <div className="text-[13px] mt-0.5">{starsStr(rep.stars)}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: COLORS.textSecondary }}>{t("ex2.confidence")} <b style={{ color: COLORS.success }}>{rep.confidence}/100</b></div>
                  </div>
                  <Sum icon="🥧" label={t("ex2.position")} value={`${rep.suggestedPositionPct}%`} sub={rep.suggestedPositionNote} />
                  <Sum icon="📅" label={t("ex2.hold")} value={rep.holdingPeriod} sub={t("ir.holdSub")} />
                  <Sum icon="🕐" label={t("ir.updated")} value={rep.dataAsOf ?? "—"} sub="JST" />
                </div>

                {/* 8 卡片双列 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Card n={1} color={COLORS.success} emoji="📈" title={`${t("ex2.recommendReason")}（${rep.recommendReasons.length}）`}><List items={rep.recommendReasons} tone={COLORS.success} /></Card>
                  <Card n={2} color={COLORS.primary} emoji="🎯" title={`${t("ex2.buyReason")}（${rep.buyReasonsList.length}）`}><List items={rep.buyReasonsList} tone={COLORS.primary} /></Card>
                  <Card n={3} color={COLORS.warning} emoji="⚠️" title={`${t("ex2.risk")}（${rep.risks.length}）`}><List items={rep.risks} tone={COLORS.warning} /></Card>
                  <Card n={4} color={COLORS.purple} emoji="🥧" title={t("ex2.position")}><b style={{ color: COLORS.text }}>{rep.suggestedPositionPct}%</b>（{rep.suggestedPositionNote}）</Card>
                  <Card n={5} color={COLORS.success} emoji="📈" title={t("ex2.takeProfit")}>
                    <div>{t("ex2.t1")} {jpy(rep.takeProfit.t1)}</div>
                    <div>{t("ex2.t2")} {jpy(rep.takeProfit.t2)}</div>
                    {rep.takeProfit.t3 != null && <div>{t("ex2.t3")} {jpy(rep.takeProfit.t3)}</div>}
                    <div className="text-[11px] mt-1" style={{ color: COLORS.textFaint }}>* {rep.takeProfit.note}</div>
                  </Card>
                  <Card n={6} color={COLORS.danger} emoji="🛡" title={t("ex2.stopLoss")}>
                    <div><b style={{ color: COLORS.danger }}>{jpy(rep.stopLoss.price)}</b></div>
                    <div className="text-[11px] mt-1" style={{ color: COLORS.textFaint }}>* {rep.stopLoss.note}</div>
                  </Card>
                  <Card n={7} color={COLORS.purple} emoji="🚫" title={t("ex2.invalidation")}><List items={rep.invalidation.slice(0, 4)} tone={COLORS.purple} /></Card>
                  <Card n={8} color={COLORS.warning} emoji="💬" title={t("ex2.oneLiner")}><span style={{ color: COLORS.text }}>{rep.oneLiner}</span></Card>
                </div>

                {/* 底部统计条 */}
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 rounded-xl py-2.5" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
                  <Foot icon="📊" label={t("ir.aiScore")} value={rep.meta.aiScore != null ? `${Math.round(rep.meta.aiScore)}/100` : "—"} color={COLORS.success} />
                  <Foot icon="✨" label={t("ir.gptScore")} value={rep.meta.gptScore != null ? Math.round(rep.meta.gptScore) : "—"} />
                  <Foot icon="🏆" label={t("ir.gptRank")} value={rep.meta.gptRank != null ? `${rep.meta.gptRank}/${t("ir.rankOf")}` : "—"} />
                  <Foot icon="📈" label={t("ir.market")} value={rep.meta.regimeLabel} color={rep.meta.regime === "BULL" ? COLORS.success : rep.meta.regime === "BEAR" ? COLORS.danger : COLORS.warning} />
                  <Foot icon="〰️" label={t("ir.volatility")} value={rep.meta.volatilityLabel} />
                  <Foot icon="💧" label={t("ir.liquidity")} value={rep.meta.liquidityLabel} />
                </div>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
