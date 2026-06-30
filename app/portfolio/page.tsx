"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";

export default function PortfolioPage() {
  const { t } = useI18n();
  return (
    <div className="p-6 max-w-2xl mx-auto bg-[#0f172a] min-h-screen flex flex-col items-center justify-center">
      <div className="w-full bg-slate-800/40 border border-slate-700/40 rounded-2xl p-8 text-center space-y-6">
        <div className="text-4xl">📦</div>

        <div>
          <h1 className="text-xl font-bold text-slate-300">{t("portfolio.legacy.title")}</h1>
          <p className="text-sm text-slate-500 mt-2">{t("portfolio.legacy.subtitle")}</p>
        </div>

        <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl px-5 py-4 text-sm text-amber-300 text-left space-y-1.5">
          <p className="font-medium">{t("portfolio.legacy.notice_title")}</p>
          <p className="text-amber-400/80 text-xs leading-relaxed">{t("portfolio.legacy.notice_body")}</p>
        </div>

        <Link
          href="/strategy"
          className="inline-flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 text-white font-medium text-sm px-6 py-3 rounded-xl transition-colors"
        >
          {t("portfolio.legacy.goto")} →
        </Link>

        <p className="text-[11px] text-slate-600">{t("portfolio.legacy.disclaimer")}</p>
      </div>
    </div>
  );
}
