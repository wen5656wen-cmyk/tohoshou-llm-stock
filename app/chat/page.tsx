"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";

export default function ChatPage() {
  const { t } = useI18n();

  return (
    <div className="p-6 flex items-center justify-center min-h-[60vh]">
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-10 max-w-md w-full text-center shadow-sm">
        <div className="text-4xl mb-4">📱</div>
        <h2 className="text-xl font-bold text-amber-900 mb-2">{t("chat.title")}</h2>
        <p className="text-sm text-amber-800 mb-6 leading-relaxed">{t("chat.movedToLine")}</p>
        <Link
          href="/"
          className="inline-block text-sm font-medium text-slate-700 bg-white border border-slate-200 px-5 py-2.5 rounded-xl hover:bg-slate-50 transition-colors"
        >
          {t("page.back_to_dashboard")}
        </Link>
      </div>
    </div>
  );
}
