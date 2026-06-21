"use client";

import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/types";

const PATH_KEY_MAP: Record<string, MessageKey> = {
  "/": "nav.dashboard",
  "/ai-picks": "nav.ai_picks",
  "/chat": "nav.chat",
  "/ai-theme": "nav.ai_theme",
  "/screener": "nav.screener",
  "/sync": "nav.sync",
  "/notifications": "nav.notifications",
  "/stocks": "nav.stocks",
  "/watchlist": "nav.watchlist",
  "/news": "nav.news",
  "/portfolio": "nav.portfolio",
  "/indicators": "nav.indicators",
  "/sectors": "nav.sectors",
};

export default function MobileHeader({ onMenuClick }: { onMenuClick: () => void }) {
  const pathname = usePathname();
  const { t } = useI18n();

  const titleKey = PATH_KEY_MAP[pathname];
  const title = titleKey
    ? t(titleKey)
    : pathname.startsWith("/stocks/")
      ? t("tab.ai")
      : pathname.startsWith("/ai-theme/")
        ? t("nav.ai_theme")
        : "TOHOSHOU AI";

  return (
    <header className="md:hidden fixed top-0 left-0 right-0 z-50 bg-[#0f1629] border-b border-slate-700/50 h-14 flex items-center px-4 gap-3">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-blue-400 text-lg shrink-0">◈</span>
        <div className="min-w-0">
          <div className="text-white font-bold text-sm leading-tight">TOHOSHOU AI</div>
          <div className="text-slate-400 text-[11px] truncate">{title}</div>
        </div>
      </div>
      <button
        onClick={onMenuClick}
        className="shrink-0 w-10 h-10 flex items-center justify-center text-slate-300 hover:text-white rounded-lg hover:bg-slate-700/50 transition-colors"
        aria-label="menu"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>
    </header>
  );
}
