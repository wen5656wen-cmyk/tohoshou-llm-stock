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

  // ⚠️ 结论(verdict) 与 市场状态(regime) 是**两个来源、可能不同日期**的判断，曾出现
  // 「熊市 + 今日可建仓」这类自相矛盾的拼接。故各自标注 as-of，且徽章用**自己的**语义色
  // （原实现 `tone={verdictTone(verdict)}` 会把「熊市」渲染成绿色）。
  const verdictAsOf = closing?.date ? `${closing.date} ${closing.decidedAtJst ?? ""} JST` : "—";
  const regimeAsOf = market?.market?.regimeAsOf ?? null;
  const trendDegraded = market?.market?.trendDegraded === true;
  const regimeTone = regime === "BULL" ? "green" : regime === "BEAR" ? "red" : regime === "SIDEWAYS" ? "neutral" : "neutral";

  const verdictLabel = verdict ? t(`dc.verdict.${verdict}` as Parameters<typeof t>[0]) : t("dc.ov.noData");

  return (
    <div className="sticky top-0 z-30" style={{ background: COLORS.card, borderBottom: `1px solid ${COLORS.border}` }}>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 min-h-11 py-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
        {/* 结论（收盘决策 · 标注其 as-of，避免被当成「今天刚出的」）*/}
        <span className="flex items-center gap-1.5 shrink-0">
          <span className="text-[16px] leading-none">{verdictIcon(verdict)}</span>
          <b className="text-[13px]" style={{ color: COLORS.text }}>{loading ? "…" : verdictLabel}</b>
          {closing?.date ? <span className="tabular-nums" style={{ color: COLORS.textFaint }}>{closing.date}</span> : null}
        </span>
        <span className="w-px h-4" style={{ background: COLORS.border }} />
        {/* 市场状态（独立来源 MarketRegime · 用自己的语义色 + 自己的 as-of）*/}
        <span className="flex items-center gap-1.5 shrink-0">
          <span style={{ color: COLORS.textFaint }}>{t("dc.ov.marketState")}</span>
          <AppBadge tone={regimeTone}>{regimeLabel}</AppBadge>
          {regimeAsOf ? <span className="tabular-nums" style={{ color: COLORS.textFaint }}>{regimeAsOf}</span> : null}
          {trendDegraded ? <span title={t("dc.ov.trendDegradedHint")} style={{ color: COLORS.warning }}>⚠</span> : null}
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
            <span className="ml-auto tabular-nums shrink-0" style={{ color: COLORS.textFaint }}>{t("common.asOf.closingDecision")} {verdictAsOf}</span>
          </>
        )}
        <button onClick={() => setOpen((v) => !v)} className={open ? "ml-1.5" : "ml-auto"}
          style={{ color: COLORS.textFaint }} aria-label="toggle">{open ? "▾" : "▸"}</button>
      </div>
    </div>
  );
}
