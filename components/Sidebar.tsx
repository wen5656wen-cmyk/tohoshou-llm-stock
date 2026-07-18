"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import LanguageSwitcher from "./LanguageSwitcher";
import WorkspaceSwitcher from "./navigation/WorkspaceSwitcher";
import { Sparkles } from "./dashboard/icons";
import { nodesForWorkspace, workspaceForPath, isNavActive, type NavNode } from "@/lib/navigation/nav-config";

// P7-04A：三工作区软切换。P0-GOV Sidebar 规范：固定 240px，统一 Logo/Workspace/导航/底部样式。
// 全系统（Decision / Research / Management）共享此侧边栏视觉标准。
export default function Sidebar() {
  const pathname = usePathname();
  const { t } = useI18n();
  const ws = workspaceForPath(pathname);
  const nodes = nodesForWorkspace(ws);

  const renderItem = (node: NavNode) => {
    const active = isNavActive(node.href, pathname);
    // 图标统一 Lucide 线宽 2 / 20px（dashboard/icons 为 Lucide MIT 路径，strokeWidth 经 props 覆盖）
    const Icon = node.Icon as (p: { size?: number; strokeWidth?: number }) => React.ReactElement;
    return (
      <Link
        key={node.key}
        href={node.href}
        prefetch={true}
        className={`relative flex items-center transition-colors active:scale-[0.99] ${active ? "" : "hover:bg-[#F5F9FF]"}`}
        style={{
          height: 52,
          paddingLeft: 20,
          paddingRight: 20,
          gap: 16,
          borderRadius: 14,
          background: active ? "#EEF5FF" : "transparent",
        }}
        aria-current={active ? "page" : undefined}
      >
        {/* Active 蓝色左边条 */}
        {active && (
          <span
            aria-hidden
            style={{ position: "absolute", left: 0, top: 12, bottom: 12, width: 3, borderRadius: 3, background: "#007AFF" }}
          />
        )}
        <span style={{ color: active ? "#007AFF" : "#86868b", display: "inline-flex" }}>
          <Icon size={20} strokeWidth={2} />
        </span>
        <span
          className="flex-1 text-[14px]"
          style={{ color: active ? "#1d1d1f" : "#6e6e73", fontWeight: active ? 600 : 500 }}
        >
          {t(node.labelKey as Parameters<typeof t>[0])}
        </span>
        {node.badge && (
          <span
            className="text-[10px] font-medium px-2 py-0.5 rounded-full"
            style={{ color: active ? "#007AFF" : "#86868b", background: active ? "#DCEAFF" : "#F0F0F3" }}
          >
            {node.badge}
          </span>
        )}
      </Link>
    );
  };

  return (
    <aside
      className="hidden md:flex fixed left-0 top-0 h-full flex-col z-40 dash-font"
      style={{ width: 240, background: "#FFFFFF", borderRight: "1px solid #ECECEC" }}
    >
      {/* ── Logo 区（高 92px · 左右 24px）── */}
      <div className="flex items-center" style={{ height: 92, paddingLeft: 24, paddingRight: 24, borderBottom: "1px solid #ECECEC" }}>
        <Link href="/" className="flex items-center gap-3 min-w-0">
          <span
            className="inline-flex items-center justify-center rounded-2xl text-white shrink-0"
            style={{ width: 48, height: 48, background: "#007AFF" }}
          >
            <Sparkles size={26} strokeWidth={2} />
          </span>
          <span className="min-w-0">
            <span className="block font-bold leading-tight whitespace-nowrap" style={{ fontSize: 18, color: "#1d1d1f", letterSpacing: "-0.02em" }}>
              TOHOSHOU AI
            </span>
            <span className="block truncate" style={{ fontSize: 12, color: "#6B7280", marginTop: 3 }}>
              {t("site.subtitle")}
            </span>
          </span>
        </Link>
      </div>

      {/* ── Workspace 分段控件 ── */}
      <div className="px-4 pt-4 pb-1">
        <div className="px-1 pb-2" style={{ fontSize: 11, letterSpacing: "0.06em", color: "#9CA3AF", fontWeight: 600 }}>
          {t("nav.workspace").toUpperCase()}
        </div>
        <WorkspaceSwitcher />
      </div>

      {/* ── 导航 ── */}
      <nav className="flex-1 px-3 pt-2 overflow-y-auto">
        <div className="space-y-1">{nodes.map(renderItem)}</div>
      </nav>

      {/* ── 底部：数据来源 + 语言（内容不变，仅优化字体/间距/颜色）── */}
      <div style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 16, paddingBottom: 16, borderTop: "1px solid #ECECEC" }}>
        <div style={{ fontSize: 11, letterSpacing: "0.06em", color: "#9CA3AF", fontWeight: 600 }}>
          {t("nav.data_sources").toUpperCase()}
        </div>
        <div className="mt-2 space-y-1.5">
          {["J-Quants", "Yahoo Finance JP", "TDnet"].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <span className="rounded-full" style={{ width: 6, height: 6, background: "#34C759" }} />
              <span style={{ fontSize: 12, color: "#6e6e73" }}>{s}</span>
            </div>
          ))}
        </div>
        <div className="mt-3.5">
          <LanguageSwitcher compact />
        </div>
      </div>
    </aside>
  );
}
