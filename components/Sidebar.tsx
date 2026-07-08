"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import LanguageSwitcher from "./LanguageSwitcher";
import { ROUTES } from "@/lib/routes";
import {
  LayoutGrid, Sparkles, Target, Bot, LineChart, Microscope,
  GraduationCap, Layers, FlaskConical, Newspaper, Boxes,
  Settings, CircleCheck, RefreshCw, Activity, TrendingUp,
} from "./dashboard/icons";

type IconCmp = (p: { size?: number }) => React.ReactElement;
type NavItem = { href: string; label: string; Icon: IconCmp; badge?: string };
type NavGroup = { labelKey: string; items: NavItem[] };

export default function Sidebar() {
  const pathname = usePathname();
  const { t } = useI18n();

  // Restores the original 3-tier structure (13 entries) — nothing removed.
  const groups: NavGroup[] = [
    {
      labelKey: "nav.core",
      items: [
        { href: ROUTES.DASHBOARD,         label: t("nav.commandCenter"),  Icon: LayoutGrid },
        { href: ROUTES.DAILY_WATCHLIST,   label: t("nav.dailyWatchlist"), Icon: Sparkles },
        { href: ROUTES.STRATEGY_CENTER,   label: t("nav.strategyCenter"), Icon: Target },
        { href: ROUTES.AUTO_TRADING,      label: t("nav.aiPortfolio"),    Icon: Bot, badge: "Paper" },
        { href: ROUTES.BACKTEST,          label: t("nav.backtest"),       Icon: LineChart },
        { href: ROUTES.RESEARCH,          label: t("nav.research"),       Icon: Microscope },
      ],
    },
    {
      labelKey: "nav.dataAndLearning",
      items: [
        { href: ROUTES.LEARNING_REPORT,   label: t("nav.learningReport"), Icon: GraduationCap },
        { href: ROUTES.VERSIONS,          label: t("nav.versionCenter"),  Icon: Layers },
        { href: ROUTES.FEATURES,          label: t("nav.features"),       Icon: Boxes },
        { href: ROUTES.FEATURE_PROMOTION, label: t("nav.featurePromotion"), Icon: TrendingUp },
        { href: ROUTES.FEATURE_PLATFORM,  label: t("nav.featurePlatform"), Icon: Layers },
        { href: ROUTES.AI_TOP_PICKS,      label: t("nav.aiTopPicks"),     Icon: Sparkles, badge: "Exp" },
        { href: ROUTES.LABS,              label: t("nav.experiments"),    Icon: FlaskConical },
        { href: ROUTES.NEWS,              label: t("nav.news"),           Icon: Newspaper },
      ],
    },
    {
      labelKey: "nav.systemMgmt",
      items: [
        { href: ROUTES.MISSION_CONTROL,   label: t("nav.missionControl"), Icon: Settings },
        { href: ROUTES.RUNTIME,           label: t("nav.runtime"),        Icon: Activity },
        { href: ROUTES.VERIFY,            label: t("nav.dataVerify"),     Icon: CircleCheck },
        { href: ROUTES.DATA_CENTER,       label: t("nav.syncStatus"),     Icon: RefreshCw },
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
      <div className="px-5 py-4" style={{ borderBottom: "1px solid #ECECEC" }}>
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

      {/* Nav — 3-tier grouped */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto">
        {groups.map((group, gi) => (
          <div key={group.labelKey} className={gi > 0 ? "mt-4" : ""}>
            <div className="px-3 mb-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: "#B0B0B5" }}>
                {t(group.labelKey as Parameters<typeof t>[0])}
              </span>
            </div>
            <div className="space-y-0.5">
              {group.items.map(({ href, label, Icon, badge }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    prefetch={true}
                    className="flex items-center gap-3 px-3 py-2 rounded-xl text-[14px] transition-colors active:scale-[0.99]"
                    style={{
                      background: active ? "#F0F0F3" : "transparent",
                      color: active ? "#1d1d1f" : "#6e6e73",
                      fontWeight: active ? 600 : 500,
                    }}
                  >
                    <span style={{ color: active ? "#007AFF" : "#86868b" }}><Icon size={18} /></span>
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

      {/* Footer — data sources + language */}
      <div className="px-4 py-3.5 space-y-3" style={{ borderTop: "1px solid #ECECEC" }}>
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
