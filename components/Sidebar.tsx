"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import LanguageSwitcher from "./LanguageSwitcher";

type NavItem = { href: string; label: string; icon: string; badge?: string };
type NavGroup = { labelKey: string; items: NavItem[] };

export default function Sidebar() {
  const pathname = usePathname();
  const { t } = useI18n();

  const groups: NavGroup[] = [
    {
      labelKey: "nav.core",
      items: [
        { href: "/",                   label: t("nav.cockpit"),        icon: "◈" },
        { href: "/screener",           label: t("nav.aiScreener"),    icon: "✦" },
        { href: "/strategy",           label: t("nav.strategyCenter"), icon: "◆" },
        { href: "/portfolio",          label: t("nav.aiPortfolio"),   icon: "◇", badge: "Legacy" },
        { href: "/backtest",           label: t("nav.backtest"),      icon: "▣" },
        { href: "/admin/research",     label: t("nav.research"),      icon: "◉" },
      ],
    },
    {
      labelKey: "nav.dataAndLearning",
      items: [
        { href: "/admin/learning-report", label: t("nav.learningReport"), icon: "◐" },
        { href: "/admin/versions",        label: t("nav.versionCenter"),  icon: "◫" },
        { href: "/admin/experiments",     label: t("nav.experiments"),    icon: "⬡" },
        { href: "/news",                  label: t("nav.news"),           icon: "◎" },
      ],
    },
    {
      labelKey: "nav.systemMgmt",
      items: [
        { href: "/admin/mission-control", label: t("nav.missionControl"), icon: "⟁" },
        { href: "/admin/verify",          label: t("nav.dataVerify"),     icon: "✅" },
        { href: "/sync",                  label: t("nav.syncStatus"),     icon: "⟳" },
      ],
    },
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

      <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-4">
        {groups.map((group) => (
          <div key={group.labelKey}>
            <div className="px-3 pb-1">
              <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest">
                {t(group.labelKey as Parameters<typeof t>[0])}
              </span>
            </div>
            <div className="space-y-0.5">
              {group.items.map(({ href, label, icon, badge }) => (
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
                  <span className="flex-1">{label}</span>
                  {badge && (
                    <span className="text-[9px] font-bold text-slate-500 bg-slate-700/50 border border-slate-600/40 px-1.5 py-0.5 rounded tracking-wider">
                      {badge}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>
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
