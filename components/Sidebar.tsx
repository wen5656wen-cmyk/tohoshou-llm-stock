"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import LanguageSwitcher from "./LanguageSwitcher";

export default function Sidebar() {
  const pathname = usePathname();
  const { t } = useI18n();

  const mainItems = [
    { href: "/",          label: t("nav.dashboard"),     icon: "◈" },
    { href: "/screener",  label: t("nav.aiScreener"),    icon: "✦" },
    { href: "/ai-theme",  label: t("nav.aiValueChain"),  icon: "⚡" },
    { href: "/sectors",   label: t("nav.sectors"),       icon: "▤" },
    { href: "/portfolio", label: t("nav.aiPortfolio"), icon: "◇" },
    { href: "/news",      label: t("nav.news"),          icon: "◎" },
    { href: "/backtest",  label: t("nav.backtest"),      icon: "📊" },
  ];

  const adminItems = [
    { href: "/sync",          label: t("nav.systemStatus"), icon: "⟳" },
    { href: "/admin/verify",  label: t("nav.systemVerify"), icon: "✅" },
  ];

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside className="hidden md:flex fixed left-0 top-0 h-full w-56 bg-[#0f1629] flex-col z-40">
      <div className="px-5 py-5 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <span className="text-xl text-blue-400">◈</span>
          <div>
            <div className="text-white font-bold text-sm leading-tight">TOHOSHOU AI</div>
            <div className="text-slate-500 text-xs">{t("site.subtitle")}</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {mainItems.map(({ href, label, icon }) => (
          <Link
            key={href}
            href={href}
            prefetch={true}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all active:opacity-70 active:scale-[0.98] ${
              isActive(href)
                ? "bg-blue-600/20 text-blue-300 font-medium"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/30"
            }`}
          >
            <span className="text-base w-5 text-center">{icon}</span>
            {label}
          </Link>
        ))}

        {/* Admin separator */}
        <div className="pt-3 pb-1">
          <div className="flex items-center gap-2 px-3">
            <div className="flex-1 h-px bg-slate-700/60" />
            <span className="text-[10px] font-medium text-slate-600 uppercase tracking-wider">
              {t("nav.admin")}
            </span>
            <div className="flex-1 h-px bg-slate-700/60" />
          </div>
        </div>

        {adminItems.map(({ href, label, icon }) => (
          <Link
            key={href}
            href={href}
            prefetch={true}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all active:opacity-70 active:scale-[0.98] ${
              isActive(href)
                ? "bg-blue-600/20 text-blue-300 font-medium"
                : "text-slate-500 hover:text-slate-300 hover:bg-slate-700/30"
            }`}
          >
            <span className="text-base w-5 text-center">{icon}</span>
            {label}
          </Link>
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-slate-700/50 space-y-3">
        <div className="text-slate-600 text-xs">
          {t("nav.data_sources")}
          <div className="mt-1.5 space-y-0.5">
            {["J-Quants", "Yahoo Finance JP", "TDnet"].map((s) => (
              <div key={s} className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                <span className="text-slate-500 text-xs">{s}</span>
              </div>
            ))}
          </div>
        </div>
        <LanguageSwitcher compact />
      </div>
    </aside>
  );
}
