"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n";

type CmpRow = {
  legacyKey: MessageKey;
  newKey: MessageKey;
};

const CMP_ROWS: CmpRow[] = [
  { legacyKey: "portfolio.legacy.cmp_r1_legacy", newKey: "portfolio.legacy.cmp_r1_new" },
  { legacyKey: "portfolio.legacy.cmp_r2_legacy", newKey: "portfolio.legacy.cmp_r2_new" },
  { legacyKey: "portfolio.legacy.cmp_r3_legacy", newKey: "portfolio.legacy.cmp_r3_new" },
  { legacyKey: "portfolio.legacy.cmp_r4_legacy", newKey: "portfolio.legacy.cmp_r4_new" },
  { legacyKey: "portfolio.legacy.cmp_r5_legacy", newKey: "portfolio.legacy.cmp_r5_new" },
  { legacyKey: "portfolio.legacy.cmp_r6_legacy", newKey: "portfolio.legacy.cmp_r6_new" },
];

export default function PortfolioPage() {
  const { t } = useI18n();

  return (
    <div className="p-4 md:p-6 max-w-6xl bg-[#0f172a] min-h-screen">
      <div className="max-w-[860px] mx-auto space-y-6">

        {/* ── Header ─────────────────────────────────────────────── */}
        <div>
          <h1 className="text-2xl font-bold text-slate-300">{t("portfolio.legacy.title")}</h1>
          <p className="text-slate-500 text-sm mt-1">{t("portfolio.legacy.subtitle")}</p>
        </div>

        {/* ── Upgrade Notice Card ─────────────────────────────────── */}
        <div className="bg-slate-800/30 border border-slate-700/40 rounded-xl p-6 space-y-3">
          <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wide">
            {t("portfolio.legacy.upgrade_title")}
          </h2>
          <p className="text-sm text-slate-400 leading-relaxed">{t("portfolio.legacy.upgrade_body1")}</p>
          <p className="text-sm text-slate-400 leading-relaxed">{t("portfolio.legacy.upgrade_body2")}</p>
          <ul className="space-y-1.5 pl-2">
            <li className="text-sm text-emerald-400">• {t("portfolio.legacy.strategy_day")}</li>
            <li className="text-sm text-emerald-400">• {t("portfolio.legacy.strategy_swing")}</li>
            <li className="text-sm text-emerald-400">• {t("portfolio.legacy.strategy_long")}</li>
          </ul>
          <p className="text-sm text-slate-400 leading-relaxed">{t("portfolio.legacy.upgrade_body3")}</p>
          <p className="text-sm text-slate-400 leading-relaxed">{t("portfolio.legacy.upgrade_body4")}</p>
        </div>

        {/* ── Comparison Card ─────────────────────────────────────── */}
        <div className="bg-slate-800/30 border border-slate-700/40 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-700/40">
            <h2 className="text-sm font-semibold text-slate-300">{t("portfolio.legacy.cmp_title")}</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/40 bg-slate-900/30">
                <th className="text-left px-5 py-3 text-slate-400 font-medium w-[42%]">
                  {t("portfolio.legacy.cmp_col_legacy")}
                </th>
                <th className="text-center px-2 py-3 text-slate-700 font-normal w-[16%]"></th>
                <th className="text-left px-5 py-3 text-emerald-400 font-medium w-[42%]">
                  {t("portfolio.legacy.cmp_col_new")}
                </th>
              </tr>
            </thead>
            <tbody>
              {CMP_ROWS.map((row, i) => (
                <tr key={i} className="border-b border-slate-700/20 last:border-0 hover:bg-slate-800/20 transition-colors">
                  <td className="px-5 py-3 text-slate-500">{t(row.legacyKey)}</td>
                  <td className="px-2 py-3 text-center text-emerald-500 text-base font-bold">→</td>
                  <td className="px-5 py-3 text-slate-300">{t(row.newKey)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── CTA Button ──────────────────────────────────────────── */}
        <div className="flex justify-center pt-2">
          <Link
            href="/strategy"
            className="inline-flex items-center justify-center gap-2 bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800 text-white font-semibold text-sm px-8 py-3 rounded-xl transition-colors w-[240px]"
          >
            {t("portfolio.legacy.goto")} →
          </Link>
        </div>

        {/* ── Legacy Notice Footer ─────────────────────────────────── */}
        <div className="bg-slate-900/60 border border-slate-700/30 rounded-xl px-5 py-4 space-y-1.5">
          <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest">
            {t("portfolio.legacy.notice_footer_title")}
          </p>
          <p className="text-xs text-slate-600 leading-relaxed">{t("portfolio.legacy.notice_footer_body1")}</p>
          <p className="text-xs text-slate-600 leading-relaxed">{t("portfolio.legacy.notice_footer_body2")}</p>
        </div>

      </div>
    </div>
  );
}
