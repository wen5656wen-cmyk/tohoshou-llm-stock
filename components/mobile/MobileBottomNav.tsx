"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { mobileBottomNodes, workspaceForPath, navItemActive } from "@/lib/navigation/nav-config";

// P14-UI-03：底栏显示当前工作区一级页面（最多 5），与桌面同源、tab 感知高亮。
function BottomNavInner() {
  const pathname = usePathname();
  const tab = useSearchParams().get("tab");
  const { t } = useI18n();
  const ws = workspaceForPath(pathname);
  const items = mobileBottomNodes(ws);
  return (
    <div className="flex items-stretch">
      {items.map((node) => {
        const active = navItemActive(node.href, pathname, tab);
        return (
          <Link
            key={node.key}
            href={node.href}
            className={`flex-1 flex flex-col items-center justify-center py-2 min-h-[52px] transition-colors ${
              active ? "text-blue-400" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            <span className="text-lg leading-none mb-0.5">{node.glyph}</span>
            <span className="text-[10px] font-medium">{t(node.labelKey as Parameters<typeof t>[0])}</span>
          </Link>
        );
      })}
    </div>
  );
}

export default function MobileBottomNav() {
  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0f1629] border-t border-slate-700/50"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <Suspense fallback={<div style={{ height: 52 }} />}>
        <BottomNavInner />
      </Suspense>
    </nav>
  );
}
