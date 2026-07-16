"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import LanguageSwitcher from "./LanguageSwitcher";
import { Sparkles, ChevronDown } from "./dashboard/icons";
import { bossNodes, adminNodes, isNavActive, type NavNode } from "@/lib/navigation/nav-config";

// P7-02B-1：一级导航收敛为 7（5 老板 + 2 管理员折叠），全部读 lib/navigation/nav-config。
export default function Sidebar() {
  const pathname = usePathname();
  const { t } = useI18n();
  const boss = bossNodes();
  const admin = adminNodes();
  // 管理员区默认折叠；若当前正处于某个管理员页面则自动展开，避免"隐藏了当前页"。
  const adminActive = admin.some((n) => isNavActive(n.href, pathname));
  const [adminOpen, setAdminOpen] = useState(adminActive);

  const renderItem = (node: NavNode) => {
    const active = isNavActive(node.href, pathname);
    const { Icon } = node;
    return (
      <Link
        key={node.key}
        href={node.href}
        prefetch={true}
        className="flex items-center gap-3 px-3 py-2 rounded-xl text-[14px] transition-colors active:scale-[0.99]"
        style={{
          background: active ? "#F0F0F3" : "transparent",
          color: active ? "#1d1d1f" : "#6e6e73",
          fontWeight: active ? 600 : 500,
        }}
      >
        <span style={{ color: active ? "#007AFF" : "#86868b" }}><Icon size={18} /></span>
        <span className="flex-1">{t(node.labelKey as Parameters<typeof t>[0])}</span>
        {node.badge && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
            style={{ color: "#86868b", background: "#F0F0F3" }}>
            {node.badge}
          </span>
        )}
      </Link>
    );
  };

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

      {/* Nav — 5 老板一级 + 管理员折叠区 */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto">
        <div className="space-y-0.5">
          {boss.map(renderItem)}
        </div>

        {/* 管理员区（默认折叠） */}
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setAdminOpen((v) => !v)}
            className="w-full flex items-center gap-2 px-3 mb-1"
            aria-expanded={adminOpen}
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: "#B0B0B5" }}>
              {t("nav.admin")}
            </span>
            <span
              className="transition-transform"
              style={{ color: "#B0B0B5", transform: adminOpen ? "rotate(0deg)" : "rotate(-90deg)" }}
            >
              <ChevronDown size={12} />
            </span>
          </button>
          {adminOpen && (
            <div className="space-y-0.5">
              {admin.map(renderItem)}
            </div>
          )}
        </div>
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
