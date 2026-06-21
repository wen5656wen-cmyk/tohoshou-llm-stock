"use client";

import { useI18n } from "@/lib/i18n";

const LINE_ADD_URL = process.env.NEXT_PUBLIC_LINE_ADD_URL ?? "https://line.me/ti/p/@tohoshouai";

export default function ChatPage() {
  const { t, lang } = useI18n();

  const lineLabel =
    lang === "ja-JP" ? "LINE でフォロー" :
    lang === "en-US" ? "Open LINE Bot" :
    "前往 LINE Bot";

  return (
    <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] gap-6">
      {/* LINE icon */}
      <div className="w-20 h-20 rounded-[22px] flex items-center justify-center text-4xl shadow-md"
           style={{ background: "#06C755" }}>
        💬
      </div>

      <div className="text-center">
        <h2 className="text-xl font-bold text-slate-900 mb-1">{t("chat.title")}</h2>
        <p className="text-sm text-slate-500">{t("chat.movedToLine")}</p>
      </div>

      <a
        href={LINE_ADD_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2.5 text-white font-semibold text-sm px-8 py-3.5 rounded-2xl shadow-sm hover:opacity-90 active:scale-95 transition-all"
        style={{ background: "#06C755" }}
      >
        <span className="text-base">✦</span>
        {lineLabel}
      </a>
    </div>
  );
}
