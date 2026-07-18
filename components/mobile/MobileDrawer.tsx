"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import LanguageSwitcher from "../LanguageSwitcher";
import WorkspaceSwitcher from "../navigation/WorkspaceSwitcher";
import { nodesForWorkspace, workspaceForPath, navItemActive } from "@/lib/navigation/nav-config";

// P14-UI-03：抽屉 = 工作区切换器 + 当前工作区全部一级页面，与桌面/底栏同源、tab 感知高亮。
function DrawerItems({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const tab = useSearchParams().get("tab");
  const ws = workspaceForPath(pathname);
  return (
    <>
      {nodesForWorkspace(ws).map((node) => {
        const active = navItemActive(node.href, pathname, tab);
        return (
          <Link
            key={node.key}
            href={node.href}
            onClick={onClose}
            className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm transition-all ${
              active ? "bg-blue-600/20 text-blue-300 font-medium" : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/30"
            }`}
          >
            <span className="text-base w-5 text-center shrink-0">{node.glyph}</span>
            {t(node.labelKey as Parameters<typeof t>[0])}
          </Link>
        );
      })}
    </>
  );
}

export default function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="md:hidden fixed inset-0 z-[60]">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-label={t("common.close")}
      />
      <div className="absolute top-0 left-0 h-full w-72 max-w-[85vw] bg-[#0f1629] shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="text-blue-400 text-lg">◈</span>
            <div>
              <div className="text-white font-bold text-sm">TOHOSHOU AI</div>
              <div className="text-slate-500 text-xs">{t("site.subtitle")}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white rounded-lg hover:bg-slate-700/50 transition-colors"
            aria-label={t("common.close")}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* 工作区切换器 */}
        <div className="px-3 pt-3 shrink-0">
          <WorkspaceSwitcher dark />
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          <Suspense fallback={null}>
            <DrawerItems onClose={onClose} />
          </Suspense>
        </nav>

        <div className="px-4 py-4 border-t border-slate-700/50 shrink-0 space-y-3">
          <div>
            <div className="text-slate-600 text-xs font-medium mb-2">{t("nav.data_sources")}</div>
            <div className="space-y-1">
              {["J-Quants", "Yahoo Finance JP", "TDnet", "Kabutan"].map((s) => (
                <div key={s} className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                  <span className="text-slate-500 text-xs">{s}</span>
                </div>
              ))}
            </div>
          </div>
          <LanguageSwitcher />
        </div>
      </div>
    </div>
  );
}
