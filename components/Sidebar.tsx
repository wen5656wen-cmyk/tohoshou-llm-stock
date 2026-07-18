"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import LanguageSwitcher from "./LanguageSwitcher";
import WorkspaceSwitcher from "./navigation/WorkspaceSwitcher";
import { Sparkles } from "./dashboard/icons";
import { nodesForWorkspace, workspaceForPath, navItemActive, type NavNode, type Workspace } from "@/lib/navigation/nav-config";

// P14-UI-03 Sidebar IA v1.0：固定 240px。结构 = Logo/品牌 → 工作区切换 → 当前工作区一级导航 → 数据源 → 语言。
// 全系统（决策 / 研究 / 管理）共享此侧边栏。一级页面切换统一放左侧，内容区不再放同名一级 Tab。
const WS_LABEL: Record<Workspace, string> = { boss: "ws.boss", research: "ws.research", admin: "ws.admin" };
const EYEBROW: React.CSSProperties = { fontSize: 11, letterSpacing: "0.06em", color: "#9CA3AF", fontWeight: 600 };

function NavItems({ ws }: { ws: Workspace }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const tab = useSearchParams().get("tab");
  const nodes = nodesForWorkspace(ws);
  return (
    <div className="space-y-1">
      {nodes.map((node: NavNode) => {
        const active = navItemActive(node.href, pathname, tab);
        const Icon = node.Icon;
        return (
          <Link
            key={node.key}
            href={node.href}
            prefetch={true}
            className={`relative flex items-center transition-colors active:scale-[0.99] ${active ? "" : "hover:bg-[#F5F9FF]"}`}
            style={{ height: 46, paddingLeft: 20, paddingRight: 16, gap: 16, borderRadius: 14, background: active ? "#EEF5FF" : "transparent" }}
            aria-current={active ? "page" : undefined}
          >
            {active && (
              <span aria-hidden style={{ position: "absolute", left: 0, top: 10, bottom: 10, width: 3, borderRadius: 3, background: "#007AFF" }} />
            )}
            <span style={{ color: active ? "#007AFF" : "#86868b", display: "inline-flex" }}>
              <Icon size={20} strokeWidth={2} />
            </span>
            <span className="flex-1 text-[14px] truncate" style={{ color: active ? "#1d1d1f" : "#4b5563", fontWeight: active ? 600 : 500 }}>
              {t(node.labelKey as Parameters<typeof t>[0])}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const { t } = useI18n();
  const ws = workspaceForPath(pathname);

  return (
    <aside className="hidden md:flex fixed left-0 top-0 h-full flex-col z-40 dash-font" style={{ width: 240, background: "#FFFFFF", borderRight: "1px solid #ECECEC" }}>
      {/* ── Logo 区（高 92px · 左右 24px）── */}
      <div className="flex items-center" style={{ height: 92, paddingLeft: 24, paddingRight: 24, borderBottom: "1px solid #ECECEC" }}>
        <Link href="/" className="flex items-center gap-3 min-w-0">
          <span className="inline-flex items-center justify-center rounded-2xl text-white shrink-0" style={{ width: 48, height: 48, background: "#007AFF" }}>
            <Sparkles size={26} strokeWidth={2} />
          </span>
          <span className="min-w-0">
            <span className="block font-bold leading-tight whitespace-nowrap" style={{ fontSize: 18, color: "#1d1d1f", letterSpacing: "-0.02em" }}>TOHOSHOU AI</span>
            <span className="block truncate" style={{ fontSize: 12, color: "#6B7280", marginTop: 3 }}>{t("site.subtitle")}</span>
          </span>
        </Link>
      </div>

      {/* ── 工作区切换 ── */}
      <div className="px-4 pt-4 pb-1">
        <div className="px-1 pb-2" style={EYEBROW}>{t("nav.workspace").toUpperCase()}</div>
        <WorkspaceSwitcher />
      </div>

      {/* ── 当前工作区一级导航（组标题 = 工作区名）── */}
      <nav className="flex-1 px-3 pt-3 overflow-y-auto">
        <div className="px-2 pb-2" style={EYEBROW}>{t(WS_LABEL[ws] as Parameters<typeof t>[0]).toUpperCase()}</div>
        <Suspense fallback={<div style={{ height: 46 }} />}>
          <NavItems ws={ws} />
        </Suspense>
      </nav>

      {/* ── 底部：数据源 + 语言（内容不变，仅样式）── */}
      <div style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 16, paddingBottom: 16, borderTop: "1px solid #ECECEC" }}>
        <div style={EYEBROW}>{t("nav.data_sources").toUpperCase()}</div>
        <div className="mt-2 space-y-1.5">
          {["J-Quants", "Yahoo Finance JP", "TDnet"].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <span className="rounded-full" style={{ width: 6, height: 6, background: "#34C759" }} />
              <span style={{ fontSize: 12, color: "#6e6e73" }}>{s}</span>
            </div>
          ))}
        </div>
        <div className="mt-3.5"><LanguageSwitcher compact /></div>
      </div>
    </aside>
  );
}
