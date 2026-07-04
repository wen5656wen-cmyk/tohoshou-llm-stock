"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import LanguageSwitcher from "./LanguageSwitcher";
import {
  LayoutGrid, Sparkles, Target, Bot, LineChart, Microscope,
  GraduationCap, Database, FlaskConical, Settings,
} from "./dashboard/icons";

type IconCmp = (p: { size?: number }) => React.ReactElement;
type NavItem = { href: string; label: string; Icon: IconCmp; badge?: string };
type NavGroup = { key: string; items: NavItem[] };

export default function Sidebar() {
  const pathname = usePathname();
  const { t } = useI18n();

  const groups: NavGroup[] = [
    {
      key: "main",
      items: [
        { href: "/",                      label: t("nav.cockpit"),        Icon: LayoutGrid },
        { href: "/screener",              label: t("nav.aiScreener"),     Icon: Sparkles },
        { href: "/strategy",              label: t("nav.strategyCenter"), Icon: Target },
        { href: "/portfolio",             label: t("nav.aiPortfolio"),    Icon: Bot, badge: "Paper" },
        { href: "/backtest",              label: t("nav.backtest"),       Icon: LineChart },
        { href: "/admin/research",        label: t("nav.research"),       Icon: Microscope },
      ],
    },
    {
      key: "secondary",
      items: [
        { href: "/admin/learning-report", label: t("nav.learningReport"), Icon: GraduationCap },
        { href: "/sync",                  label: t("nav.syncStatus"),     Icon: Database },
        { href: "/admin/experiments",     label: t("nav.experiments"),    Icon: FlaskConical },
        { href: "/admin/mission-control", label: t("nav.missionControl"), Icon: Settings },
      ],
    },
  ];

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside
      className="hidden md:flex fixed left-0 top-0 h-full w-56 flex-col z-40 dash-font"
      style={{ background: "#FFFFFF", borderRight: "1px solid #ECECEC" }}
    >
      {/* Logo */}
      <div className="px-5 py-5" style={{ borderBottom: "1px solid #ECECEC" }}>
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl text-white" style={{ background: "#007AFF" }}>
            <Sparkles size={17} />
          </span>
          <div>
            <div className="font-semibold text-[14px] leading-tight" style={{ color: "#1d1d1f" }}>TOHOSHOU AI</div>
            <div className="text-[11px]" style={{ color: "#86868b" }}>{t("site.subtitle")}</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {groups.map((group, gi) => (
          <div key={group.key} className={gi > 0 ? "mt-3 pt-3" : ""} style={gi > 0 ? { borderTop: "1px solid #ECECEC" } : undefined}>
            <div className="space-y-0.5">
              {group.items.map(({ href, label, Icon, badge }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    prefetch={true}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] transition-colors active:scale-[0.99]"
                    style={{
                      background: active ? "#F0F0F3" : "transparent",
                      color: active ? "#1d1d1f" : "#6e6e73",
                      fontWeight: active ? 600 : 500,
                    }}
                  >
                    <span style={{ color: active ? "#007AFF" : "#86868b" }}><Icon size={19} /></span>
                    <span className="flex-1">{label}</span>
                    {badge && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
                        style={{ color: "#86868b", background: "#F0F0F3" }}>
                        {badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 space-y-3" style={{ borderTop: "1px solid #ECECEC" }}>
        <div className="text-[11px]" style={{ color: "#86868b" }}>
          {t("nav.data_sources")}
          <div className="mt-1.5 space-y-1">
            {["J-Quants", "Yahoo Finance JP", "TDnet"].map((s) => (
              <div key={s} className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#34C759" }} />
                <span className="text-[11px]" style={{ color: "#6e6e73" }}>{s}</span>
              </div>
            ))}
          </div>
        </div>
        <LanguageSwitcher compact />
      </div>
    </aside>
  );
}
