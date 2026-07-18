"use client";

// ── DecisionContextBar · 持久上下文条（P14-DEV-01 · Freeze 必改①）───────────────
// 跨 Decision 五页常驻：结论(verdict) + 建议仓位 + 市场(regime/风险) + AI信心 + as-of。
// 单一来源 = DecisionProvider（一次拉取）；结论用 lib/decision/verdict SSOT。
// 各页删除重复的 verdict/仓位全卡，一律引用本条。

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { AppBadge } from "@/components/ui";
import { COLORS, fmtScore } from "@/lib/decision/ds";
import { verdictIcon, verdictTone } from "@/lib/decision/verdict";
import { useDecision } from "@/lib/decision/provider";

export default function DecisionContextBar() {
  const { t } = useI18n();
  const { closing, market, loading } = useDecision();
  const [open, setOpen] = useState(true);

  const verdict = closing?.verdict ?? null;
  const regime = market?.market?.regime ?? closing?.market?.regime ?? null;
  const regimeLabel = regime && ["BULL", "SIDEWAYS", "BEAR"].includes(regime)
    ? t(`dc.regime.${regime}` as Parameters<typeof t>[0]) : (regime ?? "—");
  const riskLevel = market?.market?.riskLevel ?? null;
  const vol = market?.market?.volatility ?? closing?.market?.volatility ?? null;
  const confidence = closing?.market?.avgAiScore ?? null; // AI 信心（近似：合格候选平均分；无则 —）
  const asOf = closing?.date ? `${closing.date} ${closing.decidedAtJst ?? ""} JST` : "—";

  const verdictLabel = verdict ? t(`dc.verdict.${verdict}` as Parameters<typeof t>[0]) : t("dc.ov.noData");

  return (
    <div className="sticky top-0 z-30" style={{ background: COLORS.card, borderBottom: `1px solid ${COLORS.border}` }}>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 min-h-11 py-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
        {/* 结论 */}
        <span className="flex items-center gap-1.5 shrink-0">
          <span className="text-[16px] leading-none">{verdictIcon(verdict)}</span>
          <b className="text-[13px]" style={{ color: COLORS.text }}>{loading ? "…" : verdictLabel}</b>
        </span>
        <span className="w-px h-4" style={{ background: COLORS.border }} />
        {/* 市场 */}
        <span className="flex items-center gap-1.5 shrink-0">
          <span style={{ color: COLORS.textFaint }}>{t("dc.ov.marketState")}</span>
          <AppBadge tone={verdictTone(verdict)}>{regimeLabel}</AppBadge>
        </span>
        {/* 风险 */}
        {(riskLevel != null || vol != null) && (
          <span className="shrink-0" style={{ color: COLORS.textSecondary }}>
            {t("db.riskLevel")} <b style={{ color: COLORS.text }}>{riskLevel ?? (vol != null ? Math.round(vol * 10) / 10 : "—")}</b>
          </span>
        )}
        {/* 展开区（可折叠） */}
        {open && (
          <>
            <span className="shrink-0" style={{ color: COLORS.textSecondary }}>
              {t("dv.ctx.position")} <b style={{ color: COLORS.textFaint }}>—</b>
            </span>
            <span className="shrink-0" style={{ color: COLORS.textSecondary }}>
              {t("dv.ctx.confidence")} <b style={{ color: COLORS.primary }}>{fmtScore(confidence)}</b>
            </span>
            <span className="ml-auto tabular-nums shrink-0" style={{ color: COLORS.textFaint }}>{asOf}</span>
          </>
        )}
        <button onClick={() => setOpen((v) => !v)} className={open ? "ml-1.5" : "ml-auto"}
          style={{ color: COLORS.textFaint }} aria-label="toggle">{open ? "▾" : "▸"}</button>
      </div>
    </div>
  );
}
